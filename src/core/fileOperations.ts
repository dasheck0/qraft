import * as fs from 'fs-extra';
import * as path from 'path';
import { FileOperationResult } from '../types';

/**
 * FileOperations handles safe file copying with overwrite protection
 */
export class FileOperations {
  
  /**
   * Copy a single file with overwrite protection
   * @param sourcePath Absolute path to source file
   * @param destinationPath Absolute path to destination file
   * @param force Whether to force overwrite existing files
   * @returns Promise<FileOperationResult> Result of the operation
   */
  async copyFile(
    sourcePath: string, 
    destinationPath: string, 
    force: boolean = false
  ): Promise<FileOperationResult> {
    try {
      // Check if source file exists
      if (!(await fs.pathExists(sourcePath))) {
        return {
          source: sourcePath,
          destination: destinationPath,
          success: false,
          skipped: false,
          error: new Error(`Source file does not exist: ${sourcePath}`)
        };
      }

      // Check if destination exists and handle overwrite protection
      const destinationExists = await fs.pathExists(destinationPath);
      
      if (destinationExists && !force) {
        return {
          source: sourcePath,
          destination: destinationPath,
          success: false,
          skipped: true,
          skipReason: 'File already exists (use --force to overwrite)'
        };
      }

      // Ensure destination directory exists
      const destinationDir = path.dirname(destinationPath);
      await fs.ensureDir(destinationDir);

      // Copy the file
      await fs.copy(sourcePath, destinationPath, { overwrite: force });

      return {
        source: sourcePath,
        destination: destinationPath,
        success: true,
        skipped: false
      };

    } catch (error) {
      return {
        source: sourcePath,
        destination: destinationPath,
        success: false,
        skipped: false,
        error: error instanceof Error ? error : new Error('Unknown error during file copy')
      };
    }
  }

  /**
   * Copy multiple files from a source directory to a destination directory
   * @param sourceDir Absolute path to source directory
   * @param destinationDir Absolute path to destination directory
   * @param files Array of relative file paths to copy
   * @param force Whether to force overwrite existing files
   * @param excludePatterns Optional array of patterns to exclude
   * @returns Promise<FileOperationResult[]> Results for each file operation
   */
  async copyFiles(
    sourceDir: string,
    destinationDir: string,
    files: string[],
    force: boolean = false,
    excludePatterns: string[] = []
  ): Promise<FileOperationResult[]> {
    const results: FileOperationResult[] = [];

    for (const file of files) {
      // Check if file should be excluded
      if (this.shouldExcludeFile(file, excludePatterns)) {
        results.push({
          source: path.join(sourceDir, file),
          destination: path.join(destinationDir, file),
          success: false,
          skipped: true,
          skipReason: 'File excluded by pattern'
        });
        continue;
      }

      const sourcePath = path.join(sourceDir, file);
      const destinationPath = path.join(destinationDir, file);
      
      const result = await this.copyFile(sourcePath, destinationPath, force);
      results.push(result);
    }

    return results;
  }

  /**
   * Copy an entire directory structure with overwrite protection
   * @param sourceDir Absolute path to source directory
   * @param destinationDir Absolute path to destination directory
   * @param force Whether to force overwrite existing files
   * @param excludePatterns Optional array of patterns to exclude
   * @returns Promise<FileOperationResult[]> Results for each file operation
   */
  async copyDirectory(
    sourceDir: string,
    destinationDir: string,
    force: boolean = false,
    excludePatterns: string[] = []
  ): Promise<FileOperationResult[]> {
    try {
      // Get all files in the source directory
      const files = await this.getAllFiles(sourceDir);
      
      // Convert to relative paths
      const relativeFiles = files.map(file => path.relative(sourceDir, file));
      
      // Copy all files
      return await this.copyFiles(sourceDir, destinationDir, relativeFiles, force, excludePatterns);
      
    } catch (error) {
      return [{
        source: sourceDir,
        destination: destinationDir,
        success: false,
        skipped: false,
        error: error instanceof Error ? error : new Error('Unknown error during directory copy')
      }];
    }
  }

  /**
   * Check if a file exists at the given path
   * @param filePath Path to check
   * @returns Promise<boolean> True if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file stats (size, modification time, etc.)
   * @param filePath Path to the file
   * @returns Promise<fs.Stats | null> File stats or null if file doesn't exist
   */
  async getFileStats(filePath: string): Promise<fs.Stats | null> {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Recursively get all files in a directory
   * @param dirPath Directory path to scan
   * @returns Promise<string[]> Array of absolute file paths
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (currentPath: string): Promise<void> => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };
    
    await scanDirectory(dirPath);
    return files;
  }

  /**
   * Check if a file should be excluded based on patterns
   * @param filePath Relative file path
   * @param excludePatterns Array of patterns to match against
   * @returns boolean True if file should be excluded
   */
  private shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
    if (excludePatterns.length === 0) {
      return false;
    }

    const normalizedPath = filePath.replace(/\\/g, '/'); // Normalize path separators
    
    return excludePatterns.some(pattern => {
      // Simple pattern matching - supports wildcards
      const regexPattern = pattern
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '.*')   // Convert * to .*
        .replace(/\?/g, '.');   // Convert ? to .
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(normalizedPath) || normalizedPath.includes(pattern);
    });
  }

  /**
   * Create a backup of a file before overwriting
   * @param filePath Path to the file to backup
   * @returns Promise<string | null> Path to backup file or null if backup failed
   */
  async createBackup(filePath: string): Promise<string | null> {
    try {
      if (!(await fs.pathExists(filePath))) {
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.backup-${timestamp}`;
      
      await fs.copy(filePath, backupPath);
      return backupPath;
      
    } catch (error) {
      return null;
    }
  }
}
