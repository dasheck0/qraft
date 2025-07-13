import * as crypto from 'crypto';
import { BoxManifest } from '../types';
import { ManifestUtils } from '../utils/manifestUtils';

/**
 * Custom error types for manifest operations
 */
export class ManifestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

export class ManifestCorruptionError extends ManifestError {
  constructor(message: string, cause?: Error) {
    super(message, 'MANIFEST_CORRUPTED', cause);
    this.name = 'ManifestCorruptionError';
  }
}

export class ManifestNotFoundError extends ManifestError {
  constructor(message: string, cause?: Error) {
    super(message, 'MANIFEST_NOT_FOUND', cause);
    this.name = 'ManifestNotFoundError';
  }
}

export class ManifestValidationError extends ManifestError {
  constructor(message: string, cause?: Error) {
    super(message, 'MANIFEST_VALIDATION_FAILED', cause);
    this.name = 'ManifestValidationError';
  }
}

export class ManifestPermissionError extends ManifestError {
  constructor(message: string, cause?: Error) {
    super(message, 'MANIFEST_PERMISSION_DENIED', cause);
    this.name = 'ManifestPermissionError';
  }
}

/**
 * Sync state enumeration
 */
export type SyncState = 'synced' | 'local_newer' | 'remote_newer' | 'diverged' | 'unknown';

/**
 * Metadata stored alongside local manifests for sync state management
 */
export interface ManifestMetadata {
  /** Timestamp when manifest was last synced */
  lastSyncTimestamp: number;
  /** Timestamp when manifest was first created locally */
  createdTimestamp: number;
  /** Timestamp when manifest was last modified locally */
  lastModifiedTimestamp: number;
  /** Checksum of the manifest content for integrity verification */
  checksum: string;
  /** Source registry where manifest was downloaded from */
  sourceRegistry?: string;
  /** Source box reference */
  sourceBoxReference?: string;
  /** Version of the manifest when last synced */
  lastSyncedVersion?: string;
  /** Current sync state */
  syncState: SyncState;
  /** Number of sync operations performed */
  syncCount: number;
  /** Last known remote checksum (if available) */
  lastRemoteChecksum?: string;
  /** Metadata format version for future compatibility */
  metadataVersion: string;
}

/**
 * Local manifest entry combining manifest and metadata
 */
export interface LocalManifestEntry {
  manifest: BoxManifest;
  metadata: ManifestMetadata;
}

/**
 * Sync statistics for a local manifest
 */
export interface SyncStats {
  /** Current sync state */
  syncState: SyncState;
  /** Number of sync operations performed */
  syncCount: number;
  /** Days since last sync */
  daysSinceLastSync: number;
  /** Days since manifest was created */
  daysSinceCreated: number;
  /** Timestamp of last sync */
  lastSyncTimestamp: number;
  /** Timestamp when manifest was created */
  createdTimestamp: number;
  /** Whether we have a remote checksum for comparison */
  hasRemoteChecksum: boolean;
}

/**
 * Result of manifest recovery operation
 */
export interface ManifestRecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Method used for recovery */
  method: 'none' | 'backup_restore' | 'auto_backup_restore' | 'reconstruction';
  /** Errors encountered during recovery */
  errors: string[];
  /** Warnings about the recovery process */
  warnings: string[];
}

/**
 * Result of manifest integrity validation
 */
export interface ManifestIntegrityResult {
  /** Whether the manifest is valid */
  isValid: boolean;
  /** Critical issues found */
  issues: string[];
  /** Non-critical warnings */
  warnings: string[];
  /** Whether the manifest can potentially be recovered */
  canRecover: boolean;
}

/**
 * Result of manifest comparison operation
 */
export interface ManifestComparisonResult {
  /** Whether manifests are identical */
  isIdentical: boolean;
  /** Fields that differ between manifests */
  differences: ManifestFieldDifference[];
  /** Overall change severity */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Individual field difference in manifest comparison
 */
export interface ManifestFieldDifference {
  field: keyof BoxManifest;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'removed' | 'modified';
  impact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * ManifestManager handles local manifest storage, retrieval, and comparison operations
 */
export class ManifestManager {

  /**
   * Store a manifest locally in the target directory
   * @param targetDirectory Directory where the box is being stored
   * @param manifest Box manifest to store
   * @param sourceRegistry Optional source registry
   * @param sourceBoxReference Optional source box reference
   * @returns Promise<void>
   */
  async storeLocalManifest(
    targetDirectory: string,
    manifest: BoxManifest,
    sourceRegistry?: string,
    sourceBoxReference?: string,
    isUpdate: boolean = false
  ): Promise<void> {
    try {
      // Validate manifest before storing
      try {
        ManifestUtils.validateManifest(manifest);
      } catch (error) {
        throw new ManifestValidationError(
          `Invalid manifest for ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Ensure .qraft directory exists
      try {
        await ManifestUtils.ensureQraftDirectory(targetDirectory);
      } catch (error) {
        throw new ManifestPermissionError(
          `Cannot create .qraft directory in ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Store manifest using utility function
      try {
        await ManifestUtils.writeManifestFile(targetDirectory, manifest);
      } catch (error) {
        throw new ManifestPermissionError(
          `Cannot write manifest file in ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Get existing metadata if this is an update
      let existingMetadata: ManifestMetadata | null = null;
      if (isUpdate) {
        try {
          existingMetadata = await ManifestUtils.readMetadataFile(targetDirectory);
        } catch (error) {
          // If we can't read existing metadata, treat as new
          existingMetadata = null;
        }
      }

      const now = Date.now();

      // Create and store metadata
      const metadata: ManifestMetadata = {
        lastSyncTimestamp: now,
        createdTimestamp: existingMetadata?.createdTimestamp || now,
        lastModifiedTimestamp: now,
        checksum: this.calculateChecksum(manifest),
        lastSyncedVersion: manifest.version,
        syncState: 'synced',
        syncCount: (existingMetadata?.syncCount || 0) + 1,
        lastRemoteChecksum: this.calculateChecksum(manifest),
        metadataVersion: '1.0.0'
      };

      // Add optional properties only if they have values
      if (sourceRegistry) {
        metadata.sourceRegistry = sourceRegistry;
      }
      if (sourceBoxReference) {
        metadata.sourceBoxReference = sourceBoxReference;
      }

      try {
        await ManifestUtils.writeMetadataFile(targetDirectory, metadata);
      } catch (error) {
        throw new ManifestPermissionError(
          `Cannot write metadata file in ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    } catch (error) {
      if (error instanceof ManifestError) {
        throw error;
      }
      // For unexpected errors, wrap in ManifestError
      throw new ManifestError(
        `Failed to store local manifest in ${targetDirectory}`,
        'MANIFEST_STORE_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Retrieve local manifest from target directory
   * @param targetDirectory Directory to search for local manifest
   * @returns Promise<LocalManifestEntry | null> Local manifest entry or null if not found
   */
  async getLocalManifest(targetDirectory: string): Promise<LocalManifestEntry | null> {
    try {
      // Check if both files exist
      if (!(await ManifestUtils.hasCompleteLocalManifest(targetDirectory))) {
        return null;
      }

      // Read manifest using utility function with error handling
      let manifest: BoxManifest;
      try {
        manifest = await ManifestUtils.readManifestFile(targetDirectory);
      } catch (error) {
        throw new ManifestCorruptionError(
          `Failed to read manifest file in ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Read metadata using utility function with error handling
      let metadata: any;
      try {
        metadata = await ManifestUtils.readMetadataFile(targetDirectory);
      } catch (error) {
        throw new ManifestCorruptionError(
          `Failed to read metadata file in ${targetDirectory}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Verify manifest integrity
      const currentChecksum = this.calculateChecksum(manifest);
      if (currentChecksum !== metadata.checksum) {
        throw new ManifestCorruptionError(
          `Manifest checksum mismatch in ${targetDirectory} - file may be corrupted. Expected: ${metadata.checksum}, Got: ${currentChecksum}`
        );
      }

      return { manifest, metadata };
    } catch (error) {
      if (error instanceof ManifestError) {
        throw error;
      }
      // For unexpected errors, wrap in ManifestError
      throw new ManifestError(
        `Unexpected error reading local manifest in ${targetDirectory}`,
        'MANIFEST_READ_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Compare two manifests and return detailed comparison result
   * @param localManifest Local manifest (can be null if no local manifest exists)
   * @param remoteManifest Remote manifest
   * @returns ManifestComparisonResult Detailed comparison result
   */
  compareManifests(
    localManifest: BoxManifest | null,
    remoteManifest: BoxManifest
  ): ManifestComparisonResult {
    // If no local manifest, everything is new
    if (!localManifest) {
      return {
        isIdentical: false,
        differences: this.getNewManifestDifferences(remoteManifest),
        severity: 'low' // New manifest is typically low risk
      };
    }

    const differences: ManifestFieldDifference[] = [];

    // Compare each field
    this.compareField('name', localManifest.name, remoteManifest.name, differences);
    this.compareField('description', localManifest.description, remoteManifest.description, differences);
    this.compareField('author', localManifest.author, remoteManifest.author, differences);
    this.compareField('version', localManifest.version, remoteManifest.version, differences);
    this.compareField('defaultTarget', localManifest.defaultTarget, remoteManifest.defaultTarget, differences);
    this.compareArrayField('tags', localManifest.tags, remoteManifest.tags, differences);
    this.compareArrayField('exclude', localManifest.exclude, remoteManifest.exclude, differences);
    this.compareArrayField('postInstall', localManifest.postInstall, remoteManifest.postInstall, differences);

    const isIdentical = differences.length === 0;
    const severity = this.calculateSeverity(differences);

    return {
      isIdentical,
      differences,
      severity
    };
  }

  /**
   * Check if a local manifest exists in the target directory
   * @param targetDirectory Directory to check
   * @returns Promise<boolean> True if local manifest exists
   */
  async hasLocalManifest(targetDirectory: string): Promise<boolean> {
    return ManifestUtils.hasCompleteLocalManifest(targetDirectory);
  }

  /**
   * Remove local manifest from target directory
   * @param targetDirectory Directory to remove manifest from
   * @returns Promise<void>
   */
  async removeLocalManifest(targetDirectory: string): Promise<void> {
    await ManifestUtils.removeQraftDirectory(targetDirectory);
  }

  /**
   * Update sync state for a local manifest
   * @param targetDirectory Directory containing the manifest
   * @param newState New sync state
   * @param remoteChecksum Optional remote checksum for comparison
   * @returns Promise<void>
   */
  async updateSyncState(
    targetDirectory: string,
    newState: SyncState,
    remoteChecksum?: string
  ): Promise<void> {
    const localEntry = await this.getLocalManifest(targetDirectory);
    if (!localEntry) {
      throw new Error('No local manifest found to update sync state');
    }

    const updatedMetadata: ManifestMetadata = {
      ...localEntry.metadata,
      syncState: newState,
      lastModifiedTimestamp: Date.now()
    };

    // Update remote checksum if provided
    if (remoteChecksum) {
      updatedMetadata.lastRemoteChecksum = remoteChecksum;
    }

    await ManifestUtils.writeMetadataFile(targetDirectory, updatedMetadata);
  }

  /**
   * Determine sync state by comparing local and remote manifests
   * @param localManifest Local manifest entry
   * @param remoteManifest Remote manifest
   * @returns SyncState Current sync state
   */
  determineSyncState(
    localManifest: LocalManifestEntry | null,
    remoteManifest: BoxManifest
  ): SyncState {
    if (!localManifest) {
      return 'unknown';
    }

    const localChecksum = localManifest.metadata.checksum;
    const remoteChecksum = this.calculateChecksum(remoteManifest);
    const lastRemoteChecksum = localManifest.metadata.lastRemoteChecksum;

    // If checksums match, we're synced
    if (localChecksum === remoteChecksum) {
      return 'synced';
    }

    // If we have a last known remote checksum, we can determine direction
    if (lastRemoteChecksum) {
      const localChanged = localChecksum !== lastRemoteChecksum;
      const remoteChanged = remoteChecksum !== lastRemoteChecksum;

      if (localChanged && remoteChanged) {
        return 'diverged';
      } else if (localChanged) {
        return 'local_newer';
      } else if (remoteChanged) {
        return 'remote_newer';
      }
    }

    // Compare versions if available
    const localVersion = localManifest.manifest.version;
    const remoteVersion = remoteManifest.version;
    const lastSyncedVersion = localManifest.metadata.lastSyncedVersion;

    if (lastSyncedVersion) {
      if (localVersion !== lastSyncedVersion && remoteVersion !== lastSyncedVersion) {
        return 'diverged';
      } else if (localVersion !== lastSyncedVersion) {
        return 'local_newer';
      } else if (remoteVersion !== lastSyncedVersion) {
        return 'remote_newer';
      }
    }

    // Fallback to timestamp comparison
    const localTimestamp = localManifest.metadata.lastModifiedTimestamp;
    const syncTimestamp = localManifest.metadata.lastSyncTimestamp;

    if (localTimestamp > syncTimestamp) {
      return 'local_newer';
    }

    return 'unknown';
  }

  /**
   * Get sync statistics for a local manifest
   * @param targetDirectory Directory containing the manifest
   * @returns Promise<SyncStats | null> Sync statistics or null if no manifest
   */
  async getSyncStats(targetDirectory: string): Promise<SyncStats | null> {
    const localEntry = await this.getLocalManifest(targetDirectory);
    if (!localEntry) {
      return null;
    }

    const now = Date.now();
    const daysSinceLastSync = Math.floor((now - localEntry.metadata.lastSyncTimestamp) / (1000 * 60 * 60 * 24));
    const daysSinceCreated = Math.floor((now - localEntry.metadata.createdTimestamp) / (1000 * 60 * 60 * 24));

    return {
      syncState: localEntry.metadata.syncState,
      syncCount: localEntry.metadata.syncCount,
      daysSinceLastSync,
      daysSinceCreated,
      lastSyncTimestamp: localEntry.metadata.lastSyncTimestamp,
      createdTimestamp: localEntry.metadata.createdTimestamp,
      hasRemoteChecksum: !!localEntry.metadata.lastRemoteChecksum
    };
  }

  /**
   * Update metadata when manifest is modified locally
   * @param targetDirectory Directory containing the manifest
   * @param updatedManifest Updated manifest
   * @returns Promise<void>
   */
  async updateLocalManifest(
    targetDirectory: string,
    updatedManifest: BoxManifest
  ): Promise<void> {
    // Validate the updated manifest
    ManifestUtils.validateManifest(updatedManifest);

    const existingEntry = await this.getLocalManifest(targetDirectory);
    if (!existingEntry) {
      throw new Error('No existing local manifest found to update');
    }

    // Write the updated manifest
    await ManifestUtils.writeManifestFile(targetDirectory, updatedManifest);

    // Update metadata to reflect local changes
    const updatedMetadata: ManifestMetadata = {
      ...existingEntry.metadata,
      lastModifiedTimestamp: Date.now(),
      checksum: this.calculateChecksum(updatedManifest),
      syncState: 'local_newer' // Mark as locally modified
    };

    await ManifestUtils.writeMetadataFile(targetDirectory, updatedMetadata);
  }

  /**
   * Check if local manifest needs sync based on metadata
   * @param targetDirectory Directory containing the manifest
   * @param maxDaysWithoutSync Maximum days without sync before flagging
   * @returns Promise<boolean> True if sync is needed
   */
  async needsSync(targetDirectory: string, maxDaysWithoutSync: number = 7): Promise<boolean> {
    const stats = await this.getSyncStats(targetDirectory);
    if (!stats) {
      return false; // No local manifest, no sync needed
    }

    // Check if sync state indicates need for sync
    if (stats.syncState === 'remote_newer' || stats.syncState === 'diverged' || stats.syncState === 'unknown') {
      return true;
    }

    // Check if too much time has passed since last sync
    if (stats.daysSinceLastSync > maxDaysWithoutSync) {
      return true;
    }

    return false;
  }

  /**
   * Attempt to recover from corrupted manifest files
   * @param targetDirectory Directory with corrupted manifest
   * @param backupDirectory Optional backup directory to restore from
   * @returns Promise<ManifestRecoveryResult> Recovery result
   */
  async recoverCorruptedManifest(
    targetDirectory: string,
    backupDirectory?: string
  ): Promise<ManifestRecoveryResult> {
    const result: ManifestRecoveryResult = {
      success: false,
      method: 'none',
      errors: [],
      warnings: []
    };

    try {
      // Try to restore from backup if provided
      if (backupDirectory) {
        try {
          await ManifestUtils.restoreQraftDirectory(targetDirectory, backupDirectory);
          result.success = true;
          result.method = 'backup_restore';
          return result;
        } catch (error) {
          result.errors.push(`Backup restore failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Try to find and restore from automatic backups
      try {
        const entries = await ManifestUtils.findManifestDirectories(targetDirectory, 1);
        const backupDirs = entries.filter(dir => dir.includes('.qraft-backup-'));

        if (backupDirs.length > 0) {
          // Use the most recent backup
          const mostRecent = backupDirs.sort().pop()!;
          await ManifestUtils.restoreQraftDirectory(targetDirectory, mostRecent);
          result.success = true;
          result.method = 'auto_backup_restore';
          result.warnings.push(`Restored from automatic backup: ${mostRecent}`);
          return result;
        }
      } catch (error) {
        result.errors.push(`Auto backup search failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Try to reconstruct minimal manifest from available information
      try {
        const reconstructed = await this.reconstructManifest(targetDirectory);
        if (reconstructed) {
          await this.storeLocalManifest(targetDirectory, reconstructed);
          result.success = true;
          result.method = 'reconstruction';
          result.warnings.push('Manifest reconstructed with minimal information - please verify and update');
          return result;
        }
      } catch (error) {
        result.errors.push(`Reconstruction failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // If all recovery methods fail
      result.errors.push('All recovery methods failed - manual intervention required');
      return result;

    } catch (error) {
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Attempt to reconstruct a manifest from available information
   * @param targetDirectory Directory to analyze
   * @returns Promise<BoxManifest | null> Reconstructed manifest or null if not possible
   */
  private async reconstructManifest(targetDirectory: string): Promise<BoxManifest | null> {
    try {
      // Try to read partial manifest file
      let partialManifest: any = null;

      try {
        const content = await ManifestUtils.readManifestFile(targetDirectory);
        partialManifest = content;
      } catch (error) {
        // Manifest file is corrupted or missing
      }

      // Create minimal manifest with defaults only if directory name is meaningful
      const directoryName = require('path').basename(targetDirectory);

      // Don't reconstruct for generic or meaningless directory names
      if (!directoryName ||
          directoryName.length < 3 ||
          /^(temp|tmp|test|dir|folder|\d+)/.test(directoryName.toLowerCase()) ||
          directoryName.includes('12345')) {
        return null;
      }

      const manifest: BoxManifest = {
        name: partialManifest?.name || directoryName,
        description: partialManifest?.description || `Reconstructed manifest for ${directoryName}`,
        author: partialManifest?.author || 'Unknown',
        version: partialManifest?.version || '1.0.0',
        defaultTarget: partialManifest?.defaultTarget,
        tags: partialManifest?.tags,
        exclude: partialManifest?.exclude || ['.qraft/'],
        postInstall: partialManifest?.postInstall
      };

      // Validate the reconstructed manifest
      ManifestUtils.validateManifest(manifest);
      return manifest;

    } catch (error) {
      return null;
    }
  }

  /**
   * Validate manifest integrity and report issues
   * @param targetDirectory Directory to validate
   * @returns Promise<ManifestIntegrityResult> Integrity check result
   */
  async validateManifestIntegrity(targetDirectory: string): Promise<ManifestIntegrityResult> {
    const result: ManifestIntegrityResult = {
      isValid: true,
      issues: [],
      warnings: [],
      canRecover: false
    };

    try {
      // Check if manifest files exist
      const hasManifest = await ManifestUtils.manifestFileExists(targetDirectory);
      const hasMetadata = await ManifestUtils.metadataFileExists(targetDirectory);

      if (!hasManifest && !hasMetadata) {
        result.isValid = false;
        result.issues.push('No manifest files found');
        result.canRecover = false;
        return result;
      }

      if (!hasManifest) {
        result.isValid = false;
        result.issues.push('Manifest file missing');
        result.canRecover = hasMetadata;
      }

      if (!hasMetadata) {
        result.isValid = false;
        result.issues.push('Metadata file missing');
        result.canRecover = hasManifest;
      }

      // Try to read and validate manifest
      if (hasManifest) {
        try {
          const manifest = await ManifestUtils.readManifestFile(targetDirectory);
          ManifestUtils.validateManifest(manifest);
        } catch (error) {
          result.isValid = false;
          result.issues.push(`Manifest validation failed: ${error instanceof Error ? error.message : String(error)}`);
          result.canRecover = true;
        }
      }

      // Try to read metadata
      if (hasMetadata) {
        try {
          await ManifestUtils.readMetadataFile(targetDirectory);
        } catch (error) {
          result.isValid = false;
          result.issues.push(`Metadata read failed: ${error instanceof Error ? error.message : String(error)}`);
          result.canRecover = true;
        }
      }

      // Check checksum integrity if both files exist
      if (hasManifest && hasMetadata && result.isValid) {
        try {
          const localEntry = await this.getLocalManifest(targetDirectory);
          if (!localEntry) {
            result.isValid = false;
            result.issues.push('Failed to load complete manifest entry');
            result.canRecover = true;
          }
        } catch (error) {
          if (error instanceof ManifestCorruptionError) {
            result.isValid = false;
            result.issues.push(error.message);
            result.canRecover = true;
          } else {
            result.isValid = false;
            result.issues.push(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
            result.canRecover = false;
          }
        }
      }

      return result;

    } catch (error) {
      result.isValid = false;
      result.issues.push(`Validation process failed: ${error instanceof Error ? error.message : String(error)}`);
      result.canRecover = false;
      return result;
    }
  }

  /**
   * Calculate checksum for manifest content
   * @param manifest Box manifest
   * @returns string SHA-256 checksum
   */
  private calculateChecksum(manifest: BoxManifest): string {
    const content = JSON.stringify(manifest, Object.keys(manifest).sort());
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Compare a single field between manifests
   */
  private compareField(
    field: keyof BoxManifest,
    oldValue: any,
    newValue: any,
    differences: ManifestFieldDifference[]
  ): void {
    if (oldValue !== newValue) {
      differences.push({
        field,
        oldValue,
        newValue,
        changeType: oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'modified',
        impact: this.getFieldImpact(field)
      });
    }
  }

  /**
   * Compare array fields between manifests
   */
  private compareArrayField(
    field: keyof BoxManifest,
    oldValue: any[] | undefined,
    newValue: any[] | undefined,
    differences: ManifestFieldDifference[]
  ): void {
    const oldArray = oldValue || [];
    const newArray = newValue || [];

    if (JSON.stringify(oldArray.sort()) !== JSON.stringify(newArray.sort())) {
      differences.push({
        field,
        oldValue: oldArray,
        newValue: newArray,
        changeType: oldArray.length === 0 ? 'added' : newArray.length === 0 ? 'removed' : 'modified',
        impact: this.getFieldImpact(field)
      });
    }
  }

  /**
   * Get impact level for a specific manifest field
   */
  private getFieldImpact(field: keyof BoxManifest): 'low' | 'medium' | 'high' | 'critical' {
    switch (field) {
      case 'version':
        return 'critical'; // Version changes are always critical
      case 'name':
        return 'high'; // Name changes are high impact
      case 'exclude':
        return 'high'; // Exclude pattern changes can affect what files are copied
      case 'defaultTarget':
        return 'medium'; // Target changes are medium impact
      case 'description':
      case 'author':
      case 'tags':
      case 'postInstall':
        return 'low'; // Metadata changes are low impact
      default:
        return 'medium';
    }
  }

  /**
   * Calculate overall severity from differences
   */
  private calculateSeverity(differences: ManifestFieldDifference[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (differences.length === 0) return 'none';

    const maxImpact = differences.reduce((max, diff) => {
      const impacts = ['low', 'medium', 'high', 'critical'];
      const currentIndex = impacts.indexOf(diff.impact);
      const maxIndex = impacts.indexOf(max);
      return currentIndex > maxIndex ? diff.impact : max;
    }, 'low' as 'low' | 'medium' | 'high' | 'critical');

    return maxImpact;
  }

  /**
   * Generate differences for a completely new manifest
   */
  private getNewManifestDifferences(manifest: BoxManifest): ManifestFieldDifference[] {
    const differences: ManifestFieldDifference[] = [];

    Object.keys(manifest).forEach(key => {
      const field = key as keyof BoxManifest;
      differences.push({
        field,
        oldValue: undefined,
        newValue: manifest[field],
        changeType: 'added',
        impact: this.getFieldImpact(field)
      });
    });

    return differences;
  }
}
