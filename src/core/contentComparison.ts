import { BoxManifest } from '../types';
import { DirectoryStructure, FileInfo } from './directoryScanner';
import { ManifestComparisonResult, ManifestManager } from './manifestManager';

export interface FileComparison {
  path: string;
  status: 'added' | 'deleted' | 'modified' | 'unchanged';
  oldFile?: FileInfo;
  newFile?: FileInfo;
  similarity?: number; // 0-1 for modified files
  changes?: {
    sizeChange: number;
    contentChanged: boolean;
    extensionChanged: boolean;
  };
}

export interface DirectoryComparison {
  files: FileComparison[];
  summary: {
    added: number;
    deleted: number;
    modified: number;
    unchanged: number;
    totalOld: number;
    totalNew: number;
  };
  conflicts: ConflictInfo[];
  manifest?: ManifestComparison;
}

export interface ManifestComparison {
  hasLocalManifest: boolean;
  hasRemoteManifest: boolean;
  manifestComparison?: ManifestComparisonResult;
  manifestConflicts: ManifestConflictInfo[];
  manifestSummary: {
    status: 'identical' | 'modified' | 'new' | 'missing' | 'corrupted';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    requiresReview: boolean;
  };
}

export interface ManifestConflictInfo extends ConflictInfo {
  type: 'manifest_version' | 'manifest_metadata' | 'manifest_missing' | 'manifest_corrupted' | 'file_exists' | 'directory_structure' | 'metadata_mismatch';
  manifestField?: string;
}

export interface ConflictInfo {
  type: 'file_exists' | 'directory_structure' | 'metadata_mismatch' | 'manifest_version' | 'manifest_metadata' | 'manifest_missing' | 'manifest_corrupted';
  severity: 'low' | 'medium' | 'high';
  path: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  suggestions: string[];
}

export class ContentComparison {
  private manifestManager: ManifestManager;

  constructor(manifestManager?: ManifestManager) {
    this.manifestManager = manifestManager || new ManifestManager();
  }

  async compareDirectories(
    oldStructure: DirectoryStructure | null,
    newStructure: DirectoryStructure,
    targetDirectory?: string
  ): Promise<DirectoryComparison> {
    const fileComparisons: FileComparison[] = [];
    const conflicts: ConflictInfo[] = [];

    // Perform manifest comparison if target directory is provided
    let manifestComparison: ManifestComparison | undefined;
    if (targetDirectory) {
      manifestComparison = await this.compareManifests(targetDirectory, newStructure);

      // Add manifest conflicts to the main conflicts array
      conflicts.push(...manifestComparison.manifestConflicts);
    }

    // If no old structure exists, everything is new
    if (!oldStructure) {
      for (const file of newStructure.files) {
        fileComparisons.push({
          path: file.relativePath,
          status: 'added',
          newFile: file
        });
      }

      const result: DirectoryComparison = {
        files: fileComparisons,
        summary: {
          added: newStructure.files.length,
          deleted: 0,
          modified: 0,
          unchanged: 0,
          totalOld: 0,
          totalNew: newStructure.files.length
        },
        conflicts
      };

      if (manifestComparison) {
        result.manifest = manifestComparison;
      }

      return result;
    }

    // Create maps for efficient lookup
    const oldFileMap = new Map<string, FileInfo>();
    const newFileMap = new Map<string, FileInfo>();

    for (const file of oldStructure.files) {
      oldFileMap.set(file.relativePath, file);
    }

    for (const file of newStructure.files) {
      newFileMap.set(file.relativePath, file);
    }

    // Find all unique paths
    const allPaths = new Set([
      ...oldFileMap.keys(),
      ...newFileMap.keys()
    ]);

    // Compare each file
    for (const path of allPaths) {
      const oldFile = oldFileMap.get(path);
      const newFile = newFileMap.get(path);

      if (!oldFile && newFile) {
        // File added
        fileComparisons.push({
          path,
          status: 'added',
          newFile
        });
      } else if (oldFile && !newFile) {
        // File deleted
        fileComparisons.push({
          path,
          status: 'deleted',
          oldFile
        });
      } else if (oldFile && newFile) {
        // File exists in both - compare
        const comparison = this.compareFiles(oldFile, newFile);
        fileComparisons.push(comparison);

        // Check for conflicts
        if (comparison.status === 'modified') {
          conflicts.push({
            type: 'file_exists',
            severity: this.getConflictSeverity(comparison),
            path,
            description: `File "${path}" has been modified`,
            oldValue: oldFile.size,
            newValue: newFile.size,
            suggestions: this.generateConflictSuggestions(comparison)
          });
        }
      }
    }

    // Generate summary
    const summary = this.generateSummary(fileComparisons, oldStructure, newStructure);

    const result: DirectoryComparison = {
      files: fileComparisons,
      summary,
      conflicts
    };

    if (manifestComparison) {
      result.manifest = manifestComparison;
    }

    return result;
  }

  private compareFiles(oldFile: FileInfo, newFile: FileInfo): FileComparison {
    const sizeChange = newFile.size - oldFile.size;
    const extensionChanged = oldFile.extension !== newFile.extension;
    
    let contentChanged = false;
    let similarity = 1.0;

    // Compare content if available
    if (oldFile.content && newFile.content) {
      contentChanged = oldFile.content !== newFile.content;
      if (contentChanged) {
        similarity = this.calculateSimilarity(oldFile.content, newFile.content);
      }
    } else if (oldFile.size !== newFile.size) {
      // If sizes differ and no content available, assume changed
      contentChanged = true;
      similarity = Math.max(0, 1 - Math.abs(sizeChange) / Math.max(oldFile.size, newFile.size));
    }

    const status = (contentChanged || extensionChanged) ? 'modified' : 'unchanged';

    return {
      path: newFile.relativePath,
      status,
      oldFile,
      newFile,
      similarity,
      changes: {
        sizeChange,
        contentChanged,
        extensionChanged
      }
    };
  }

  private calculateSimilarity(oldContent: string, newContent: string): number {
    // Simple similarity calculation using Levenshtein distance
    const maxLength = Math.max(oldContent.length, newContent.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(oldContent, newContent);
    return Math.max(0, 1 - distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private getConflictSeverity(comparison: FileComparison): 'low' | 'medium' | 'high' {
    if (!comparison.similarity) return 'medium';

    if (comparison.similarity > 0.8) return 'low';
    if (comparison.similarity > 0.5) return 'medium';
    return 'high';
  }

  private generateConflictSuggestions(comparison: FileComparison): string[] {
    const suggestions: string[] = [];

    if (!comparison.changes) return suggestions;

    if (comparison.changes.contentChanged) {
      suggestions.push('Review content changes before overwriting');
      suggestions.push('Consider creating a backup of the existing file');
    }

    if (comparison.changes.extensionChanged) {
      suggestions.push('File extension changed - verify this is intentional');
    }

    if (comparison.changes.sizeChange > 0) {
      suggestions.push('File size increased - new content may have been added');
    } else if (comparison.changes.sizeChange < 0) {
      suggestions.push('File size decreased - content may have been removed');
    }

    if (comparison.similarity && comparison.similarity < 0.5) {
      suggestions.push('Significant changes detected - manual review recommended');
    }

    return suggestions;
  }

  private generateSummary(
    comparisons: FileComparison[],
    oldStructure: DirectoryStructure,
    newStructure: DirectoryStructure
  ) {
    const summary = {
      added: 0,
      deleted: 0,
      modified: 0,
      unchanged: 0,
      totalOld: oldStructure.files.length,
      totalNew: newStructure.files.length
    };

    for (const comparison of comparisons) {
      switch (comparison.status) {
        case 'added':
          summary.added++;
          break;
        case 'deleted':
          summary.deleted++;
          break;
        case 'modified':
          summary.modified++;
          break;
        case 'unchanged':
          summary.unchanged++;
          break;
      }
    }

    return summary;
  }

  // Get files that need user attention (including manifest conflicts)
  getConflictingFiles(comparison: DirectoryComparison): FileComparison[] {
    return comparison.files.filter(file =>
      file.status === 'modified' ||
      (file.status === 'added' && comparison.conflicts.some(c => c.path === file.path))
    );
  }

  // Get files that can be safely updated (considering manifest safety)
  getSafeFiles(comparison: DirectoryComparison): FileComparison[] {
    // If manifest requires review, be more conservative
    const manifestRequiresReview = comparison.manifest?.manifestSummary.requiresReview;
    const similarityThreshold = manifestRequiresReview ? 0.95 : 0.9;

    return comparison.files.filter(file =>
      file.status === 'added' ||
      file.status === 'unchanged' ||
      (file.status === 'modified' && (file.similarity || 0) > similarityThreshold)
    );
  }

  // Get manifest-specific conflicts
  getManifestConflicts(comparison: DirectoryComparison): ManifestConflictInfo[] {
    return comparison.manifest?.manifestConflicts || [];
  }

  // Check if manifest comparison indicates high risk
  hasHighRiskManifestChanges(comparison: DirectoryComparison): boolean {
    return comparison.manifest?.manifestSummary.riskLevel === 'critical' ||
           comparison.manifest?.manifestSummary.riskLevel === 'high';
  }

  // Check if any manifest conflicts exist
  hasManifestConflicts(comparison: DirectoryComparison): boolean {
    return (comparison.manifest?.manifestConflicts.length || 0) > 0;
  }

  // Generate human-readable summary including manifest changes
  generateSummaryText(comparison: DirectoryComparison): string {
    const { summary } = comparison;
    const parts: string[] = [];

    if (summary.added > 0) {
      parts.push(`${summary.added} file${summary.added === 1 ? '' : 's'} added`);
    }

    if (summary.modified > 0) {
      parts.push(`${summary.modified} file${summary.modified === 1 ? '' : 's'} modified`);
    }

    if (summary.deleted > 0) {
      parts.push(`${summary.deleted} file${summary.deleted === 1 ? '' : 's'} deleted`);
    }

    if (summary.unchanged > 0) {
      parts.push(`${summary.unchanged} file${summary.unchanged === 1 ? '' : 's'} unchanged`);
    }

    // Add manifest summary
    if (comparison.manifest) {
      const manifestStatus = comparison.manifest.manifestSummary.status;
      switch (manifestStatus) {
        case 'new':
          parts.push('manifest added');
          break;
        case 'modified':
          parts.push('manifest modified');
          break;
        case 'missing':
          parts.push('manifest missing');
          break;
        case 'corrupted':
          parts.push('manifest corrupted');
          break;
        case 'identical':
          // Don't add anything for identical manifests
          break;
      }
    }

    if (parts.length === 0) {
      return 'No changes detected';
    }

    return parts.join(', ');
  }

  // Generate detailed summary including manifest information
  generateDetailedSummary(comparison: DirectoryComparison): string {
    const basicSummary = this.generateSummaryText(comparison);
    const manifestInfo: string[] = [];

    if (comparison.manifest) {
      const manifest = comparison.manifest;

      if (manifest.manifestSummary.requiresReview) {
        manifestInfo.push('⚠️  Manifest changes require review');
      }

      if (manifest.manifestConflicts.length > 0) {
        const criticalConflicts = manifest.manifestConflicts.filter(c => c.severity === 'high').length;
        if (criticalConflicts > 0) {
          manifestInfo.push(`🚨 ${criticalConflicts} critical manifest conflict${criticalConflicts === 1 ? '' : 's'}`);
        }
      }

      if (manifest.manifestSummary.riskLevel === 'critical' || manifest.manifestSummary.riskLevel === 'high') {
        manifestInfo.push('🔴 High risk manifest changes detected');
      }
    }

    if (manifestInfo.length > 0) {
      return `${basicSummary}\n${manifestInfo.join('\n')}`;
    }

    return basicSummary;
  }

  // Check if update is safe (no conflicts)
  isSafeUpdate(comparison: DirectoryComparison): boolean {
    return comparison.conflicts.length === 0 &&
           comparison.summary.modified === 0 &&
           comparison.summary.deleted === 0;
  }

  // Get change statistics including manifest changes
  getChangeStats(comparison: DirectoryComparison): {
    totalChanges: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresReview: boolean;
  } {
    const totalChanges = comparison.summary.added + comparison.summary.modified + comparison.summary.deleted;
    const highRiskConflicts = comparison.conflicts.filter(c => c.severity === 'high').length;
    const mediumRiskConflicts = comparison.conflicts.filter(c => c.severity === 'medium').length;

    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // Consider manifest risk level
    if (comparison.manifest?.manifestSummary.riskLevel === 'critical' || comparison.manifest?.manifestSummary.riskLevel === 'high') {
      riskLevel = 'high';
    } else if (highRiskConflicts > 0 || comparison.summary.deleted > 0) {
      riskLevel = 'high';
    } else if (comparison.manifest?.manifestSummary.riskLevel === 'medium' || mediumRiskConflicts > 0 || comparison.summary.modified > 3) {
      riskLevel = 'medium';
    }

    const requiresReview = riskLevel !== 'low' || totalChanges > 10 || (comparison.manifest?.manifestSummary.requiresReview ?? false);

    return {
      totalChanges,
      riskLevel,
      requiresReview
    };
  }

  /**
   * Compare manifests for the target directory
   * @param targetDirectory Directory to check for local manifest
   * @param newStructure New directory structure (may contain manifest)
   * @returns Promise<ManifestComparison> Manifest comparison result
   */
  private async compareManifests(
    targetDirectory: string,
    newStructure: DirectoryStructure
  ): Promise<ManifestComparison> {
    const manifestConflicts: ManifestConflictInfo[] = [];

    try {
      // Check for local manifest
      const localManifestEntry = await this.manifestManager.getLocalManifest(targetDirectory);

      // Look for manifest in new structure
      const manifestFile = newStructure.files.find(f =>
        f.relativePath === '.qraft/manifest.json' ||
        f.relativePath === 'manifest.json'
      );

      let remoteManifest: BoxManifest | null = null;
      if (manifestFile && manifestFile.content) {
        try {
          remoteManifest = JSON.parse(manifestFile.content);
        } catch (error) {
          manifestConflicts.push({
            type: 'manifest_corrupted',
            severity: 'high',
            path: manifestFile.relativePath,
            description: 'Remote manifest file contains invalid JSON',
            suggestions: ['Fix JSON syntax in manifest file', 'Validate manifest structure'],
            manifestField: 'structure'
          });
        }
      }

      // Determine comparison status
      const hasLocalManifest = !!localManifestEntry;
      const hasRemoteManifest = !!remoteManifest;

      let manifestComparison: ManifestComparisonResult | undefined;
      let status: ManifestComparison['manifestSummary']['status'] = 'missing';
      let riskLevel: ManifestComparison['manifestSummary']['riskLevel'] = 'low';
      let requiresReview = false;

      if (hasLocalManifest && hasRemoteManifest) {
        // Compare both manifests
        manifestComparison = this.manifestManager.compareManifests(
          localManifestEntry!.manifest,
          remoteManifest!
        );

        if (manifestComparison.isIdentical) {
          status = 'identical';
          riskLevel = 'low';
        } else {
          status = 'modified';
          riskLevel = manifestComparison.severity === 'critical' ? 'critical' :
                     manifestComparison.severity === 'high' ? 'high' :
                     manifestComparison.severity === 'medium' ? 'medium' : 'low';
          requiresReview = true;

          // Convert manifest differences to conflicts
          manifestConflicts.push(...this.convertManifestDifferencesToConflicts(manifestComparison));
        }
      } else if (!hasLocalManifest && hasRemoteManifest) {
        // New manifest
        status = 'new';
        riskLevel = 'low';
        requiresReview = false;
      } else if (hasLocalManifest && !hasRemoteManifest) {
        // Missing remote manifest
        status = 'missing';
        riskLevel = 'medium';
        requiresReview = true;

        manifestConflicts.push({
          type: 'manifest_missing',
          severity: 'medium',
          path: 'manifest.json',
          description: 'Local manifest exists but no remote manifest found',
          suggestions: ['Include manifest.json in the box', 'Remove local manifest if not needed'],
          manifestField: 'existence'
        });
      }

      const result: ManifestComparison = {
        hasLocalManifest,
        hasRemoteManifest,
        manifestConflicts,
        manifestSummary: {
          status,
          riskLevel,
          requiresReview
        }
      };

      if (manifestComparison) {
        result.manifestComparison = manifestComparison;
      }

      return result;

    } catch (error) {
      // Handle manifest comparison errors
      manifestConflicts.push({
        type: 'manifest_corrupted',
        severity: 'high',
        path: '.qraft/manifest.json',
        description: `Error comparing manifests: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: ['Check manifest file integrity', 'Validate local manifest'],
        manifestField: 'comparison'
      });

      return {
        hasLocalManifest: false,
        hasRemoteManifest: false,
        manifestConflicts,
        manifestSummary: {
          status: 'corrupted',
          riskLevel: 'critical',
          requiresReview: true
        }
      };
    }
  }

  /**
   * Convert manifest differences to conflict info
   * @param manifestComparison Manifest comparison result
   * @returns ManifestConflictInfo[] Array of manifest conflicts
   */
  private convertManifestDifferencesToConflicts(
    manifestComparison: ManifestComparisonResult
  ): ManifestConflictInfo[] {
    const conflicts: ManifestConflictInfo[] = [];

    for (const diff of manifestComparison.differences) {
      const conflictType: ManifestConflictInfo['type'] =
        diff.field === 'version' ? 'manifest_version' : 'manifest_metadata';

      const severity = diff.impact === 'critical' ? 'high' :
                      diff.impact === 'high' ? 'high' :
                      diff.impact === 'medium' ? 'medium' : 'low';

      conflicts.push({
        type: conflictType,
        severity,
        path: `manifest.json#${diff.field}`,
        description: `Manifest field "${diff.field}" ${diff.changeType}: ${diff.oldValue} → ${diff.newValue}`,
        oldValue: diff.oldValue,
        newValue: diff.newValue,
        suggestions: this.generateManifestConflictSuggestions(diff),
        manifestField: diff.field
      });
    }

    return conflicts;
  }

  /**
   * Generate suggestions for manifest conflicts
   * @param diff Manifest field difference
   * @returns string[] Array of suggestions
   */
  private generateManifestConflictSuggestions(diff: any): string[] {
    const suggestions: string[] = [];

    switch (diff.field) {
      case 'version':
        suggestions.push('Review version change for compatibility');
        suggestions.push('Check if this is a breaking change');
        if (diff.changeType === 'modified') {
          suggestions.push('Consider updating local dependencies');
        }
        break;

      case 'name':
        suggestions.push('Verify the name change is intentional');
        suggestions.push('Update any references to the old name');
        break;

      case 'author':
        suggestions.push('Confirm author change is correct');
        break;

      case 'description':
        suggestions.push('Review description changes');
        break;

      case 'tags':
        suggestions.push('Review tag changes for categorization impact');
        break;

      case 'exclude':
        suggestions.push('Review exclude pattern changes');
        suggestions.push('Ensure important files are not accidentally excluded');
        break;

      case 'postInstall':
        suggestions.push('Review post-install script changes carefully');
        suggestions.push('Test post-install scripts in a safe environment');
        break;

      default:
        suggestions.push('Review this change carefully');
        suggestions.push('Ensure the change is intentional and safe');
    }

    return suggestions;
  }
}
