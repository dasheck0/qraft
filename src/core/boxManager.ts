import * as fs from 'fs-extra';
import * as path from 'path';
import { BoxInfo, BoxManifest, BoxOperationConfig, BoxOperationResult } from '../types';
import { FileOperations } from './fileOperations';

/**
 * BoxManager handles discovery, listing, and basic operations on template boxes
 */
export class BoxManager {
  private boxesDirectory: string;

  constructor(boxesDirectory: string = 'boxes') {
    this.boxesDirectory = path.resolve(boxesDirectory);
  }

  /**
   * Discover all available boxes in the boxes directory
   * @returns Promise<BoxInfo[]> Array of discovered boxes with their metadata
   */
  async discoverBoxes(): Promise<BoxInfo[]> {
    try {
      // Check if boxes directory exists
      if (!(await fs.pathExists(this.boxesDirectory))) {
        return [];
      }

      const entries = await fs.readdir(this.boxesDirectory, { withFileTypes: true });
      const boxes: BoxInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const boxPath = path.join(this.boxesDirectory, entry.name);
          const boxInfo = await this.loadBoxInfo(boxPath);
          
          if (boxInfo) {
            boxes.push(boxInfo);
          }
        }
      }

      return boxes.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    } catch (error) {
      throw new Error(`Failed to discover boxes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get information about a specific box by name
   * @param boxName Name of the box to retrieve
   * @returns Promise<BoxInfo | null> Box information or null if not found
   */
  async getBoxInfo(boxName: string): Promise<BoxInfo | null> {
    try {
      const boxPath = path.join(this.boxesDirectory, boxName);
      return await this.loadBoxInfo(boxPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a box exists
   * @param boxName Name of the box to check
   * @returns Promise<boolean> True if box exists
   */
  async boxExists(boxName: string): Promise<boolean> {
    try {
      const boxPath = path.join(this.boxesDirectory, boxName);
      const manifestPath = path.join(boxPath, 'manifest.json');
      return await fs.pathExists(manifestPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * List all available boxes with their basic information
   * @returns Promise<Array<{name: string, description: string}>> Simple list of boxes
   */
  async listBoxes(): Promise<Array<{ name: string; description: string; version: string }>> {
    const boxes = await this.discoverBoxes();
    return boxes.map(box => ({
      name: box.manifest.name,
      description: box.manifest.description,
      version: box.manifest.version
    }));
  }

  /**
   * Find boxes by directory name (for --dir flag support)
   * @param dirName Directory name to search for
   * @returns Promise<BoxInfo[]> Boxes that match the directory name
   */
  async findBoxesByDirectory(dirName: string): Promise<BoxInfo[]> {
    const boxes = await this.discoverBoxes();
    return boxes.filter(box => 
      box.manifest.name === dirName || 
      box.manifest.defaultTarget === dirName ||
      box.path.endsWith(dirName)
    );
  }

  /**
   * Load box information from a directory path
   * @param boxPath Absolute path to the box directory
   * @returns Promise<BoxInfo | null> Box information or null if invalid
   */
  private async loadBoxInfo(boxPath: string): Promise<BoxInfo | null> {
    try {
      const manifestPath = path.join(boxPath, 'manifest.json');
      
      // Check if manifest exists
      if (!(await fs.pathExists(manifestPath))) {
        return null;
      }

      // Read and parse manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: BoxManifest = JSON.parse(manifestContent);

      // Validate required fields
      if (!manifest.name || !manifest.description || !manifest.author || !manifest.version) {
        throw new Error(`Invalid manifest in ${boxPath}: missing required fields`);
      }

      // Get list of files in the box (excluding manifest.json)
      const files = await this.getBoxFiles(boxPath);

      return {
        manifest,
        path: boxPath,
        files
      };
    } catch (error) {
      // Log error but don't throw - just return null for invalid boxes
      console.warn(`Warning: Could not load box from ${boxPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Get list of files in a box directory (excluding manifest.json)
   * @param boxPath Path to the box directory
   * @returns Promise<string[]> Array of relative file paths
   */
  private async getBoxFiles(boxPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dirPath: string, relativePath: string = ''): Promise<void> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name);
        
        // Skip manifest.json
        if (entry.name === 'manifest.json' && relativePath === '') {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativeFilePath);
        } else {
          files.push(relativeFilePath);
        }
      }
    };
    
    await scanDirectory(boxPath);
    return files.sort();
  }

  /**
   * Copy a box to a target directory
   * @param config Box operation configuration
   * @returns Promise<BoxOperationResult> Result of the operation
   */
  async copyBox(config: BoxOperationConfig): Promise<BoxOperationResult> {
    try {
      // Get box information
      const boxInfo = await this.getBoxInfo(config.boxName);
      if (!boxInfo) {
        return {
          success: false,
          message: `Box '${config.boxName}' not found`,
          error: new Error(`Box '${config.boxName}' does not exist`)
        };
      }

      // Determine target directory
      const targetDir = config.targetDirectory || boxInfo.manifest.defaultTarget || process.cwd();
      const resolvedTargetDir = path.resolve(targetDir);

      // Create file operations instance
      const fileOps = new FileOperations();

      // Get exclude patterns from manifest
      const excludePatterns = boxInfo.manifest.exclude || [];

      // Copy files
      const results = await fileOps.copyFiles(
        boxInfo.path,
        resolvedTargetDir,
        boxInfo.files,
        config.force,
        excludePatterns
      );

      // Analyze results
      const copiedFiles = results.filter(r => r.success).map(r => r.destination);
      const skippedFiles = results.filter(r => r.skipped).map(r => r.destination);
      const failedFiles = results.filter(r => !r.success && !r.skipped);

      if (failedFiles.length > 0) {
        return {
          success: false,
          message: `Failed to copy ${failedFiles.length} files from box '${config.boxName}'`,
          copiedFiles,
          skippedFiles,
          error: failedFiles[0].error || new Error('Unknown error during file copy')
        };
      }

      const message = skippedFiles.length > 0
        ? `Successfully copied ${copiedFiles.length} files from box '${config.boxName}' (${skippedFiles.length} skipped)`
        : `Successfully copied ${copiedFiles.length} files from box '${config.boxName}'`;

      return {
        success: true,
        message,
        copiedFiles,
        skippedFiles
      };

    } catch (error) {
      return {
        success: false,
        message: `Error copying box '${config.boxName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Copy a box by name with simplified parameters
   * @param boxName Name of the box to copy
   * @param targetDirectory Target directory (optional)
   * @param force Whether to force overwrite existing files
   * @returns Promise<BoxOperationResult> Result of the operation
   */
  async copyBoxByName(
    boxName: string,
    targetDirectory?: string,
    force: boolean = false
  ): Promise<BoxOperationResult> {
    const config: BoxOperationConfig = {
      boxName,
      targetDirectory: targetDirectory || process.cwd(),
      force,
      interactive: false,
      boxesDirectory: this.boxesDirectory
    };

    return this.copyBox(config);
  }

  /**
   * Get the absolute path to the boxes directory
   * @returns string Absolute path to boxes directory
   */
  getBoxesDirectory(): string {
    return this.boxesDirectory;
  }
}
