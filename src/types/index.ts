/**
 * TypeScript type definitions for the unbox CLI tool
 */

/**
 * Manifest file structure for each box
 * This file is located at boxes/{boxName}/manifest.json
 */
export interface BoxManifest {
  /** Unique name of the box */
  name: string;
  
  /** Human-readable description of what this box contains */
  description: string;
  
  /** Author of the box */
  author: string;
  
  /** Version of the box */
  version: string;
  
  /** Optional default target directory when no --target is specified */
  defaultTarget?: string;
  
  /** Optional tags for categorization */
  tags?: string[];
  
  /** Optional usage notes or instructions */
  usage?: string;
  
  /** Files to exclude when copying (relative to box directory) */
  exclude?: string[];
}

/**
 * Configuration options for box operations
 */
export interface BoxOperationConfig {
  /** Name of the box to operate on */
  boxName: string;
  
  /** Target directory where files should be copied */
  targetDirectory: string;
  
  /** Whether to force overwrite existing files */
  force: boolean;
  
  /** Whether to run in interactive mode */
  interactive: boolean;
  
  /** Source directory containing all boxes */
  boxesDirectory: string;
}

/**
 * Result of a box operation
 */
export interface BoxOperationResult {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Human-readable message about the operation */
  message: string;
  
  /** List of files that were copied */
  copiedFiles?: string[];
  
  /** List of files that were skipped */
  skippedFiles?: string[];
  
  /** Any error that occurred */
  error?: Error;
}

/**
 * Information about a discovered box
 */
export interface BoxInfo {
  /** The box manifest data */
  manifest: BoxManifest;
  
  /** Absolute path to the box directory */
  path: string;
  
  /** List of files in the box (excluding manifest.json) */
  files: string[];
}

/**
 * CLI command options
 */
export interface CLIOptions {
  /** Target directory for box files */
  target?: string;
  
  /** Force overwrite existing files */
  force?: boolean;
  
  /** Run in interactive mode */
  interactive?: boolean;
  
  /** Show version information */
  version?: boolean;
  
  /** Show help information */
  help?: boolean;
}

/**
 * Interactive prompt choices
 */
export interface InteractiveChoice {
  /** Display name for the choice */
  name: string;
  
  /** Value to return when selected */
  value: string;
  
  /** Optional description */
  description?: string;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  /** Source file path */
  source: string;
  
  /** Destination file path */
  destination: string;
  
  /** Whether the operation was successful */
  success: boolean;
  
  /** Whether the file was skipped */
  skipped: boolean;
  
  /** Reason for skipping (if applicable) */
  skipReason?: string;
  
  /** Any error that occurred */
  error?: Error;
}
