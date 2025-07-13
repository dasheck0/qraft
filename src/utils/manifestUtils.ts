import * as fs from 'fs-extra';
import * as path from 'path';
import { BoxManifest } from '../types';

/**
 * Information about a directory containing a manifest
 */
export interface ManifestDirectoryInfo {
  /** Path to the directory */
  path: string;
  /** Path to the .qraft directory */
  qraftPath: string;
  /** Number of files in .qraft directory */
  fileCount: number;
  /** Total size of .qraft directory in bytes */
  totalSize: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** Whether manifest.json exists */
  hasManifest: boolean;
  /** Whether metadata.json exists */
  hasMetadata: boolean;
}

/**
 * Disk usage information for .qraft directory
 */
export interface DiskUsage {
  /** Total size in bytes */
  totalSize: number;
  /** Total number of files */
  fileCount: number;
  /** Directory breakdown */
  directories: Array<{
    path: string;
    size: number;
    files: number;
  }>;
}

/**
 * Validation result for directory suitability
 */
export interface ValidationResult {
  /** Whether the directory is valid for manifest storage */
  isValid: boolean;
  /** Critical issues that prevent manifest storage */
  issues: string[];
  /** Warnings that should be considered */
  warnings: string[];
}

/**
 * Manifest file paths for a directory
 */
export interface ManifestPaths {
  /** Absolute path to target directory */
  targetDirectory: string;
  /** Absolute path to .qraft directory */
  qraftDirectory: string;
  /** Absolute path to manifest.json */
  manifestFile: string;
  /** Absolute path to metadata.json */
  metadataFile: string;
  /** Relative paths from target directory */
  relativePaths: {
    qraftDirectory: string;
    manifestFile: string;
    metadataFile: string;
  };
}

/**
 * Compatibility assessment result
 */
export interface CompatibilityResult {
  /** Compatibility level */
  compatibilityLevel: 'compatible' | 'warning' | 'incompatible';
  /** Whether an existing manifest was found */
  hasExistingManifest: boolean;
  /** Detailed validation result */
  validation: ValidationResult;
  /** Recommendations for the user */
  recommendations: string[];
}

/**
 * Constants for manifest storage
 */
export const MANIFEST_CONSTANTS = {
  QRAFT_DIR: '.qraft',
  MANIFEST_FILE: 'manifest.json',
  METADATA_FILE: 'metadata.json'
} as const;

/**
 * Utility functions for manifest path resolution and directory management
 */
export class ManifestUtils {
  /**
   * Get the .qraft directory path for a target directory
   * @param targetDirectory Target directory path
   * @returns string Path to .qraft directory
   */
  static getQraftDirectoryPath(targetDirectory: string): string {
    return path.join(targetDirectory, MANIFEST_CONSTANTS.QRAFT_DIR);
  }

  /**
   * Get the manifest.json file path for a target directory
   * @param targetDirectory Target directory path
   * @returns string Path to manifest.json file
   */
  static getManifestFilePath(targetDirectory: string): string {
    return path.join(
      this.getQraftDirectoryPath(targetDirectory),
      MANIFEST_CONSTANTS.MANIFEST_FILE
    );
  }

  /**
   * Get the metadata.json file path for a target directory
   * @param targetDirectory Target directory path
   * @returns string Path to metadata.json file
   */
  static getMetadataFilePath(targetDirectory: string): string {
    return path.join(
      this.getQraftDirectoryPath(targetDirectory),
      MANIFEST_CONSTANTS.METADATA_FILE
    );
  }

  /**
   * Ensure the .qraft directory exists in the target directory
   * @param targetDirectory Target directory path
   * @returns Promise<void>
   */
  static async ensureQraftDirectory(targetDirectory: string): Promise<void> {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);
    await fs.ensureDir(qraftDir);
  }

  /**
   * Check if .qraft directory exists in the target directory
   * @param targetDirectory Target directory path
   * @returns Promise<boolean> True if .qraft directory exists
   */
  static async qraftDirectoryExists(targetDirectory: string): Promise<boolean> {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);
    return fs.pathExists(qraftDir);
  }

  /**
   * Check if manifest.json exists in the target directory
   * @param targetDirectory Target directory path
   * @returns Promise<boolean> True if manifest.json exists
   */
  static async manifestFileExists(targetDirectory: string): Promise<boolean> {
    const manifestPath = this.getManifestFilePath(targetDirectory);
    return fs.pathExists(manifestPath);
  }

  /**
   * Check if metadata.json exists in the target directory
   * @param targetDirectory Target directory path
   * @returns Promise<boolean> True if metadata.json exists
   */
  static async metadataFileExists(targetDirectory: string): Promise<boolean> {
    const metadataPath = this.getMetadataFilePath(targetDirectory);
    return fs.pathExists(metadataPath);
  }

  /**
   * Check if both manifest and metadata files exist (complete local manifest)
   * @param targetDirectory Target directory path
   * @returns Promise<boolean> True if both files exist
   */
  static async hasCompleteLocalManifest(targetDirectory: string): Promise<boolean> {
    const [manifestExists, metadataExists] = await Promise.all([
      this.manifestFileExists(targetDirectory),
      this.metadataFileExists(targetDirectory)
    ]);
    return manifestExists && metadataExists;
  }

  /**
   * Validate manifest structure and required fields
   * @param manifest Manifest object to validate
   * @returns boolean True if manifest is valid
   * @throws Error if manifest is invalid with specific error message
   */
  static validateManifest(manifest: any): manifest is BoxManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest must be a valid object');
    }

    const requiredFields = ['name', 'description', 'author', 'version'];
    for (const field of requiredFields) {
      if (!manifest[field] || typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
        throw new Error(`Manifest missing required field: ${field}`);
      }
    }

    // Validate optional fields if present
    if (manifest.defaultTarget !== undefined && typeof manifest.defaultTarget !== 'string') {
      throw new Error('Manifest field "defaultTarget" must be a string');
    }

    if (manifest.tags !== undefined) {
      if (!Array.isArray(manifest.tags)) {
        throw new Error('Manifest field "tags" must be an array');
      }
      if (!manifest.tags.every((tag: any) => typeof tag === 'string')) {
        throw new Error('All tags must be strings');
      }
    }

    if (manifest.exclude !== undefined) {
      if (!Array.isArray(manifest.exclude)) {
        throw new Error('Manifest field "exclude" must be an array');
      }
      if (!manifest.exclude.every((pattern: any) => typeof pattern === 'string')) {
        throw new Error('All exclude patterns must be strings');
      }
    }

    if (manifest.postInstall !== undefined) {
      if (!Array.isArray(manifest.postInstall)) {
        throw new Error('Manifest field "postInstall" must be an array');
      }
      if (!manifest.postInstall.every((step: any) => typeof step === 'string')) {
        throw new Error('All postInstall steps must be strings');
      }
    }

    return true;
  }

  /**
   * Read and parse manifest.json file with validation
   * @param targetDirectory Target directory path
   * @returns Promise<BoxManifest> Parsed and validated manifest
   * @throws Error if file doesn't exist, can't be parsed, or is invalid
   */
  static async readManifestFile(targetDirectory: string): Promise<BoxManifest> {
    const manifestPath = this.getManifestFilePath(targetDirectory);

    if (!(await fs.pathExists(manifestPath))) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');

      // Check if file is empty
      if (!content.trim()) {
        throw new Error(`Manifest file is empty: ${manifestPath}`);
      }

      let manifest: any;
      try {
        manifest = JSON.parse(content);
      } catch (parseError) {
        // Try to provide more helpful error information
        const lines = content.split('\n');
        const errorInfo = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`Invalid JSON in manifest file ${manifestPath}: ${errorInfo}. File has ${lines.length} lines.`);
      }

      // Validate the manifest
      try {
        this.validateManifest(manifest);
      } catch (validationError) {
        throw new Error(`Manifest validation failed for ${manifestPath}: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
      }

      return manifest as BoxManifest;
    } catch (error) {
      if (error instanceof Error && error.message.includes('EACCES')) {
        throw new Error(`Permission denied reading manifest file: ${manifestPath}`);
      }
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`Manifest file not found: ${manifestPath}`);
      }
      throw error;
    }
  }

  /**
   * Write manifest to manifest.json file with proper formatting
   * @param targetDirectory Target directory path
   * @param manifest Manifest to write
   * @returns Promise<void>
   */
  static async writeManifestFile(targetDirectory: string, manifest: BoxManifest): Promise<void> {
    // Validate before writing
    this.validateManifest(manifest);
    
    await this.ensureQraftDirectory(targetDirectory);
    const manifestPath = this.getManifestFilePath(targetDirectory);
    
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Read metadata.json file
   * @param targetDirectory Target directory path
   * @returns Promise<any> Parsed metadata object
   * @throws Error if file doesn't exist or can't be parsed
   */
  static async readMetadataFile(targetDirectory: string): Promise<any> {
    const metadataPath = this.getMetadataFilePath(targetDirectory);

    if (!(await fs.pathExists(metadataPath))) {
      throw new Error(`Metadata file not found: ${metadataPath}`);
    }

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');

      // Check if file is empty
      if (!content.trim()) {
        throw new Error(`Metadata file is empty: ${metadataPath}`);
      }

      try {
        const metadata = JSON.parse(content);

        // Basic validation of metadata structure
        if (!metadata || typeof metadata !== 'object') {
          throw new Error(`Metadata file contains invalid data: ${metadataPath}`);
        }

        return metadata;
      } catch (parseError) {
        const lines = content.split('\n');
        const errorInfo = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`Invalid JSON in metadata file ${metadataPath}: ${errorInfo}. File has ${lines.length} lines.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('EACCES')) {
        throw new Error(`Permission denied reading metadata file: ${metadataPath}`);
      }
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`Metadata file not found: ${metadataPath}`);
      }
      throw error;
    }
  }

  /**
   * Write metadata to metadata.json file
   * @param targetDirectory Target directory path
   * @param metadata Metadata object to write
   * @returns Promise<void>
   */
  static async writeMetadataFile(targetDirectory: string, metadata: any): Promise<void> {
    await this.ensureQraftDirectory(targetDirectory);
    const metadataPath = this.getMetadataFilePath(targetDirectory);
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Remove the entire .qraft directory and all its contents
   * @param targetDirectory Target directory path
   * @returns Promise<void>
   */
  static async removeQraftDirectory(targetDirectory: string): Promise<void> {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);
    if (await fs.pathExists(qraftDir)) {
      await fs.remove(qraftDir);
    }
  }

  /**
   * Get relative path from target directory to .qraft directory (for exclude patterns)
   * @param targetDirectory Target directory path
   * @returns string Relative path to .qraft directory
   */
  static getQraftDirectoryRelativePath(): string {
    return MANIFEST_CONSTANTS.QRAFT_DIR;
  }

  /**
   * Check if a path is within the .qraft directory
   * @param filePath File path to check
   * @returns boolean True if path is within .qraft directory
   */
  static isQraftPath(filePath: string): boolean {
    const normalizedPath = path.normalize(filePath);
    return normalizedPath.startsWith(MANIFEST_CONSTANTS.QRAFT_DIR + path.sep) || 
           normalizedPath === MANIFEST_CONSTANTS.QRAFT_DIR;
  }

  /**
   * Get default exclude patterns that should include .qraft directory
   * @param existingExcludes Existing exclude patterns
   * @returns string[] Updated exclude patterns including .qraft
   */
  static getUpdatedExcludePatterns(existingExcludes: string[] = []): string[] {
    const qraftPattern = MANIFEST_CONSTANTS.QRAFT_DIR + '/';

    // Check if .qraft is already excluded
    const hasQraftExclude = existingExcludes.some(pattern =>
      pattern === MANIFEST_CONSTANTS.QRAFT_DIR ||
      pattern === qraftPattern ||
      pattern.startsWith(MANIFEST_CONSTANTS.QRAFT_DIR + '/')
    );

    if (hasQraftExclude) {
      return existingExcludes;
    }

    return [...existingExcludes, qraftPattern];
  }

  /**
   * Find all directories containing .qraft manifests within a parent directory
   * @param parentDirectory Parent directory to search
   * @param maxDepth Maximum depth to search (default: 3)
   * @returns Promise<string[]> Array of directories containing manifests
   */
  static async findManifestDirectories(
    parentDirectory: string,
    maxDepth: number = 3
  ): Promise<string[]> {
    const manifestDirs: string[] = [];

    async function searchDirectory(dir: string, currentDepth: number): Promise<void> {
      if (currentDepth > maxDepth) return;

      try {
        if (!(await fs.pathExists(dir))) return;

        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);

            // Check if this directory has a .qraft manifest
            if (await ManifestUtils.hasCompleteLocalManifest(fullPath)) {
              manifestDirs.push(fullPath);
            }

            // Recursively search subdirectories (but skip .qraft directories)
            if (entry.name !== MANIFEST_CONSTANTS.QRAFT_DIR) {
              await searchDirectory(fullPath, currentDepth + 1);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await searchDirectory(parentDirectory, 0);
    return manifestDirs.sort();
  }

  /**
   * Get manifest directory info including size and file count
   * @param targetDirectory Directory to analyze
   * @returns Promise<ManifestDirectoryInfo | null> Directory info or null if no manifest
   */
  static async getManifestDirectoryInfo(targetDirectory: string): Promise<ManifestDirectoryInfo | null> {
    if (!(await this.hasCompleteLocalManifest(targetDirectory))) {
      return null;
    }

    const qraftDir = this.getQraftDirectoryPath(targetDirectory);

    try {
      const stats = await fs.stat(qraftDir);
      const entries = await fs.readdir(qraftDir);

      let totalSize = 0;
      for (const entry of entries) {
        const entryPath = path.join(qraftDir, entry);
        const entryStat = await fs.stat(entryPath);
        totalSize += entryStat.size;
      }

      return {
        path: targetDirectory,
        qraftPath: qraftDir,
        fileCount: entries.length,
        totalSize,
        lastModified: stats.mtime,
        hasManifest: await this.manifestFileExists(targetDirectory),
        hasMetadata: await this.metadataFileExists(targetDirectory)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve relative paths within manifest context
   * @param basePath Base directory path
   * @param relativePath Relative path to resolve
   * @returns string Resolved absolute path
   */
  static resolveManifestPath(basePath: string, relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.resolve(basePath, relativePath);
  }

  /**
   * Get relative path from one directory to another
   * @param from Source directory
   * @param to Target directory
   * @returns string Relative path
   */
  static getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * Normalize path separators for cross-platform compatibility
   * @param filePath Path to normalize
   * @returns string Normalized path
   */
  static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  /**
   * Check if a path is safe (doesn't escape parent directory)
   * @param basePath Base directory
   * @param targetPath Path to check
   * @returns boolean True if path is safe
   */
  static isSafePath(basePath: string, targetPath: string): boolean {
    const resolvedBase = path.resolve(basePath);
    const resolvedTarget = path.resolve(basePath, targetPath);
    return resolvedTarget.startsWith(resolvedBase);
  }

  /**
   * Create backup of .qraft directory
   * @param targetDirectory Directory containing .qraft
   * @param backupSuffix Suffix for backup directory (default: timestamp)
   * @returns Promise<string> Path to backup directory
   */
  static async backupQraftDirectory(
    targetDirectory: string,
    backupSuffix?: string
  ): Promise<string> {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);

    if (!(await fs.pathExists(qraftDir))) {
      throw new Error('No .qraft directory found to backup');
    }

    const suffix = backupSuffix || new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(targetDirectory, `.qraft-backup-${suffix}`);

    await fs.copy(qraftDir, backupDir);
    return backupDir;
  }

  /**
   * Restore .qraft directory from backup
   * @param targetDirectory Directory to restore to
   * @param backupPath Path to backup directory
   * @returns Promise<void>
   */
  static async restoreQraftDirectory(
    targetDirectory: string,
    backupPath: string
  ): Promise<void> {
    if (!(await fs.pathExists(backupPath))) {
      throw new Error(`Backup directory not found: ${backupPath}`);
    }

    const qraftDir = this.getQraftDirectoryPath(targetDirectory);

    // Remove existing .qraft directory if it exists
    if (await fs.pathExists(qraftDir)) {
      await fs.remove(qraftDir);
    }

    // Copy backup to .qraft directory
    await fs.copy(backupPath, qraftDir);
  }

  /**
   * Clean up old backup directories
   * @param targetDirectory Directory to clean
   * @param maxAge Maximum age in days (default: 30)
   * @returns Promise<string[]> Array of removed backup paths
   */
  static async cleanupOldBackups(
    targetDirectory: string,
    maxAge: number = 30
  ): Promise<string[]> {
    const removedBackups: string[] = [];
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
      const entries = await fs.readdir(targetDirectory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('.qraft-backup-')) {
          const backupPath = path.join(targetDirectory, entry.name);
          const stats = await fs.stat(backupPath);

          if (now - stats.mtime.getTime() > maxAgeMs) {
            await fs.remove(backupPath);
            removedBackups.push(backupPath);
          }
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    return removedBackups;
  }

  /**
   * Get disk usage for .qraft directory
   * @param targetDirectory Directory containing .qraft
   * @returns Promise<DiskUsage> Disk usage information
   */
  static async getQraftDiskUsage(targetDirectory: string): Promise<DiskUsage> {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);

    if (!(await fs.pathExists(qraftDir))) {
      return { totalSize: 0, fileCount: 0, directories: [] };
    }

    let totalSize = 0;
    let fileCount = 0;
    const directories: { path: string; size: number; files: number }[] = [];

    async function calculateSize(dir: string): Promise<{ size: number; files: number }> {
      let dirSize = 0;
      let dirFiles = 0;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            dirSize += stats.size;
            dirFiles++;
          } else if (entry.isDirectory()) {
            const subResult = await calculateSize(fullPath);
            dirSize += subResult.size;
            dirFiles += subResult.files;
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }

      return { size: dirSize, files: dirFiles };
    }

    const result = await calculateSize(qraftDir);
    totalSize = result.size;
    fileCount = result.files;

    return { totalSize, fileCount, directories };
  }

  /**
   * Validate that a directory is suitable for manifest storage
   * @param targetDirectory Directory to validate
   * @returns Promise<ValidationResult> Validation result with details
   */
  static async validateDirectoryForManifest(targetDirectory: string): Promise<ValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if directory exists
      if (!(await fs.pathExists(targetDirectory))) {
        issues.push('Target directory does not exist');
        return { isValid: false, issues, warnings };
      }

      // Check if it's actually a directory
      const stats = await fs.stat(targetDirectory);
      if (!stats.isDirectory()) {
        issues.push('Target path is not a directory');
        return { isValid: false, issues, warnings };
      }

      // Check write permissions
      try {
        const testFile = path.join(targetDirectory, '.qraft-test-write');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
      } catch (error) {
        issues.push('No write permission in target directory');
      }

      // Check if .qraft already exists
      const qraftDir = this.getQraftDirectoryPath(targetDirectory);
      if (await fs.pathExists(qraftDir)) {
        warnings.push('.qraft directory already exists');

        // Check if it contains valid manifest files
        const hasManifest = await this.manifestFileExists(targetDirectory);
        const hasMetadata = await this.metadataFileExists(targetDirectory);

        if (hasManifest && hasMetadata) {
          warnings.push('Valid manifest already exists - will be overwritten');
        } else if (hasManifest || hasMetadata) {
          warnings.push('Incomplete manifest files found - will be replaced');
        }
      }

      // Check for potential conflicts with common files
      const commonFiles = ['manifest.json', 'package.json', '.git'];
      for (const file of commonFiles) {
        if (await fs.pathExists(path.join(targetDirectory, file))) {
          if (file === 'manifest.json') {
            warnings.push('Root manifest.json found - may cause confusion');
          }
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
        warnings
      };
    } catch (error) {
      issues.push(`Error validating directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isValid: false, issues, warnings };
    }
  }

  /**
   * Get manifest file paths for a given directory
   * @param targetDirectory Target directory
   * @returns ManifestPaths Object containing all relevant paths
   */
  static getManifestPaths(targetDirectory: string): ManifestPaths {
    const qraftDir = this.getQraftDirectoryPath(targetDirectory);
    return {
      targetDirectory: path.resolve(targetDirectory),
      qraftDirectory: qraftDir,
      manifestFile: this.getManifestFilePath(targetDirectory),
      metadataFile: this.getMetadataFilePath(targetDirectory),
      relativePaths: {
        qraftDirectory: this.getQraftDirectoryRelativePath(),
        manifestFile: path.join(this.getQraftDirectoryRelativePath(), MANIFEST_CONSTANTS.MANIFEST_FILE),
        metadataFile: path.join(this.getQraftDirectoryRelativePath(), MANIFEST_CONSTANTS.METADATA_FILE)
      }
    };
  }

  /**
   * Check if a directory structure is compatible with manifest storage
   * @param targetDirectory Directory to check
   * @returns Promise<CompatibilityResult> Compatibility assessment
   */
  static async checkManifestCompatibility(targetDirectory: string): Promise<CompatibilityResult> {
    const validation = await this.validateDirectoryForManifest(targetDirectory);
    const hasExistingManifest = await this.hasCompleteLocalManifest(targetDirectory);

    let compatibilityLevel: 'compatible' | 'warning' | 'incompatible';
    const recommendations: string[] = [];

    if (!validation.isValid) {
      compatibilityLevel = 'incompatible';
      recommendations.push(...validation.issues.map(issue => `Fix: ${issue}`));
    } else if (validation.warnings.length > 0) {
      compatibilityLevel = 'warning';
      recommendations.push(...validation.warnings.map(warning => `Consider: ${warning}`));
    } else {
      compatibilityLevel = 'compatible';
    }

    if (hasExistingManifest) {
      recommendations.push('Existing manifest will be preserved or updated');
    }

    return {
      compatibilityLevel,
      hasExistingManifest,
      validation,
      recommendations
    };
  }
}
