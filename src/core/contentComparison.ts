import { DirectoryStructure, FileInfo } from './directoryScanner';

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
}

export interface ConflictInfo {
  type: 'file_exists' | 'directory_structure' | 'metadata_mismatch';
  severity: 'low' | 'medium' | 'high';
  path: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  suggestions: string[];
}

export class ContentComparison {
  compareDirectories(
    oldStructure: DirectoryStructure | null,
    newStructure: DirectoryStructure
  ): DirectoryComparison {
    const fileComparisons: FileComparison[] = [];
    const conflicts: ConflictInfo[] = [];

    // If no old structure exists, everything is new
    if (!oldStructure) {
      for (const file of newStructure.files) {
        fileComparisons.push({
          path: file.relativePath,
          status: 'added',
          newFile: file
        });
      }

      return {
        files: fileComparisons,
        summary: {
          added: newStructure.files.length,
          deleted: 0,
          modified: 0,
          unchanged: 0,
          totalOld: 0,
          totalNew: newStructure.files.length
        },
        conflicts: []
      };
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

    return {
      files: fileComparisons,
      summary,
      conflicts
    };
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

  // Get files that need user attention
  getConflictingFiles(comparison: DirectoryComparison): FileComparison[] {
    return comparison.files.filter(file => 
      file.status === 'modified' || 
      (file.status === 'added' && comparison.conflicts.some(c => c.path === file.path))
    );
  }

  // Get files that can be safely updated
  getSafeFiles(comparison: DirectoryComparison): FileComparison[] {
    return comparison.files.filter(file => 
      file.status === 'added' || 
      file.status === 'unchanged' ||
      (file.status === 'modified' && (file.similarity || 0) > 0.9)
    );
  }

  // Generate human-readable summary
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

    if (parts.length === 0) {
      return 'No changes detected';
    }

    return parts.join(', ');
  }

  // Check if update is safe (no conflicts)
  isSafeUpdate(comparison: DirectoryComparison): boolean {
    return comparison.conflicts.length === 0 &&
           comparison.summary.modified === 0 &&
           comparison.summary.deleted === 0;
  }

  // Get change statistics
  getChangeStats(comparison: DirectoryComparison): {
    totalChanges: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresReview: boolean;
  } {
    const totalChanges = comparison.summary.added + comparison.summary.modified + comparison.summary.deleted;
    const highRiskConflicts = comparison.conflicts.filter(c => c.severity === 'high').length;
    const mediumRiskConflicts = comparison.conflicts.filter(c => c.severity === 'medium').length;

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (highRiskConflicts > 0 || comparison.summary.deleted > 0) {
      riskLevel = 'high';
    } else if (mediumRiskConflicts > 0 || comparison.summary.modified > 3) {
      riskLevel = 'medium';
    }

    const requiresReview = riskLevel !== 'low' || totalChanges > 10;

    return {
      totalChanges,
      riskLevel,
      requiresReview
    };
  }
}
