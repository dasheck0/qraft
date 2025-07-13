/**
 * TypeScript type definitions for the qraft CLI tool
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

  /** Remote path in the registry where this box is stored */
  remotePath?: string;

  /** Optional tags for categorization */
  tags?: string[];

  /** Files to exclude when copying (relative to box directory) */
  exclude?: string[];

  /** Optional post-installation steps to show to the user */
  postInstall?: string[];
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
 * Box registry entry for tracking name to remote path mappings
 */
export interface BoxRegistryEntry {
  /** Remote path where the box is stored in the registry */
  remotePath: string;

  /** Last time this box was updated */
  lastUpdated: string;

  /** Current version of the box */
  version: string;

  /** Optional description for quick reference */
  description?: string;
}

/**
 * Box registry structure for tracking all boxes in a registry
 */
export interface BoxRegistry {
  /** Registry metadata */
  metadata: {
    /** Registry name/identifier */
    name: string;

    /** Last time the registry was updated */
    lastUpdated: string;

    /** Registry format version */
    version: string;
  };

  /** Map of box names to their registry entries */
  boxes: Record<string, BoxRegistryEntry>;
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

/**
 * Registry configuration for GitHub repositories
 */
export interface RegistryConfig {
  /** Registry name/identifier */
  name: string;

  /** GitHub repository in format "owner/repo" */
  repository: string;

  /** Optional GitHub token for private repositories */
  token?: string;

  /** Optional base URL for GitHub Enterprise */
  baseUrl?: string;

  /** Whether this is the default registry */
  isDefault?: boolean;
}

/**
 * Registry manager configuration
 */
export interface RegistryManagerConfig {
  /** Default registry to use */
  defaultRegistry: string;

  /** Map of registry name to registry config */
  registries: Record<string, RegistryConfig>;

  /** Global GitHub token */
  globalToken?: string;

  /** Cache settings */
  cache?: {
    enabled: boolean;
    ttl: number; // Time to live in seconds
    directory: string;
  };
}

/**
 * Box reference with registry information
 */
export interface BoxReference {
  /** Registry name (e.g., "dasheck0" or "myorg") */
  registry: string;

  /** Box name (e.g., "n8n", "tasks") */
  boxName: string;

  /** Full reference string (e.g., "dasheck0/n8n" or just "n8n") */
  fullReference: string;
}

/**
 * GitHub repository content information
 */
export interface GitHubContent {
  /** File name */
  name: string;

  /** File path in repository */
  path: string;

  /** Content type (file, dir) */
  type: 'file' | 'dir';

  /** File size in bytes */
  size: number;

  /** Download URL for file content */
  download_url: string | null;

  /** SHA hash of the content */
  sha: string;
}

/**
 * Cache entry for downloaded boxes
 */
export interface CacheEntry {
  /** Box reference */
  boxReference: string;

  /** Cached manifest */
  manifest: BoxManifest;

  /** Cached file list */
  files: string[];

  /** Cache timestamp */
  timestamp: number;

  /** Cache expiry timestamp */
  expiresAt: number;

  /** Local cache directory path */
  localPath: string;
}

/**
 * Registry operation result
 */
export interface RegistryOperationResult {
  /** Whether the operation was successful */
  success: boolean;

  /** Human-readable message */
  message: string;

  /** Data returned from the operation */
  data?: any;

  /** Any error that occurred */
  error?: Error;
}
