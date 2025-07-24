import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Custom error types for GitignoreManager operations
 */
export class GitignoreError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: Error) {
    super(message);
    this.name = 'GitignoreError';
  }
}

export class GitignorePermissionError extends GitignoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'PERMISSION_ERROR', cause);
    this.name = 'GitignorePermissionError';
  }
}

export class GitignoreFileError extends GitignoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'FILE_ERROR', cause);
    this.name = 'GitignoreFileError';
  }
}

/**
 * Result of a gitignore operation
 */
export interface GitignoreOperationResult {
  success: boolean;
  created: boolean;
  modified: boolean;
  patternsAdded: string[];
  patternsSkipped: string[];
  error?: string;
  errorCode?: string;
}

/**
 * Options for gitignore operations
 */
export interface GitignoreOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

/**
 * GitignoreManager handles reading, writing, and managing .gitignore files
 */
export class GitignoreManager {
  private readonly gitignoreFileName = '.gitignore';

  /**
   * Handle and classify file system errors
   * @param error Original error
   * @param operation Description of the operation that failed
   * @param filePath Optional file path for context
   * @returns GitignoreError Classified error
   */
  private handleFileSystemError(error: unknown, operation: string, filePath?: string): GitignoreError {
    const baseMessage = filePath ? `${operation} for ${filePath}` : operation;

    if (error instanceof Error) {
      // Check for specific error codes
      const nodeError = error as NodeJS.ErrnoException;

      switch (nodeError.code) {
        case 'ENOENT':
          return new GitignoreFileError(`File or directory not found: ${baseMessage}`, error);
        case 'EACCES':
        case 'EPERM':
          return new GitignorePermissionError(`Permission denied: ${baseMessage}`, error);
        case 'ENOTDIR':
          return new GitignoreFileError(`Not a directory: ${baseMessage}`, error);
        case 'EISDIR':
          return new GitignoreFileError(`Is a directory: ${baseMessage}`, error);
        case 'ENOSPC':
          return new GitignoreFileError(`No space left on device: ${baseMessage}`, error);
        case 'EROFS':
          return new GitignoreFileError(`Read-only file system: ${baseMessage}`, error);
        default:
          return new GitignoreFileError(`${baseMessage}: ${error.message}`, error);
      }
    }

    return new GitignoreError(`${baseMessage}: Unknown error`, 'UNKNOWN_ERROR');
  }

  /**
   * Safely execute a file system operation with error handling
   * @param operation Function to execute
   * @param operationName Description of the operation
   * @param filePath Optional file path for context
   * @returns Promise<T> Result of the operation
   */
  private async safeFileOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    filePath?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleFileSystemError(error, operationName, filePath);
    }
  }

  /**
   * Get the path to the .gitignore file in the specified directory
   * @param targetDirectory Directory containing the .gitignore file
   * @returns string Path to .gitignore file
   */
  getGitignorePath(targetDirectory: string): string {
    return path.join(targetDirectory, this.gitignoreFileName);
  }

  /**
   * Check if a .gitignore file exists in the target directory
   * @param targetDirectory Directory to check
   * @returns Promise<boolean> True if .gitignore exists
   */
  async exists(targetDirectory: string): Promise<boolean> {
    const gitignorePath = this.getGitignorePath(targetDirectory);
    try {
      return await fs.pathExists(gitignorePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Read the contents of a .gitignore file
   * @param targetDirectory Directory containing the .gitignore file
   * @returns Promise<string> Contents of the .gitignore file, empty string if file doesn't exist
   */
  async read(targetDirectory: string): Promise<string> {
    const gitignorePath = this.getGitignorePath(targetDirectory);

    return this.safeFileOperation(async () => {
      // Check if directory exists first
      if (!(await fs.pathExists(targetDirectory))) {
        throw new Error(`Directory does not exist: ${targetDirectory}`);
      }

      if (await this.exists(targetDirectory)) {
        return await fs.readFile(gitignorePath, 'utf-8');
      }
      return '';
    }, 'Reading .gitignore file', gitignorePath);
  }

  /**
   * Write content to a .gitignore file
   * @param targetDirectory Directory to write the .gitignore file
   * @param content Content to write
   * @param options Operation options
   * @returns Promise<void>
   */
  async write(targetDirectory: string, content: string, options: GitignoreOptions = {}): Promise<void> {
    const gitignorePath = this.getGitignorePath(targetDirectory);

    if (options.dryRun) {
      return; // Don't actually write in dry run mode
    }

    return this.safeFileOperation(async () => {
      // Ensure target directory exists
      await fs.ensureDir(targetDirectory);

      // Write the file
      await fs.writeFile(gitignorePath, content, 'utf-8');
    }, 'Writing .gitignore file', gitignorePath);
  }

  /**
   * Check if the target directory is writable
   * @param targetDirectory Directory to check
   * @returns Promise<boolean> True if directory is writable
   */
  async isWritable(targetDirectory: string): Promise<boolean> {
    try {
      await fs.access(targetDirectory, fs.constants.W_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a .gitignore file is writable (if it exists)
   * @param targetDirectory Directory containing the .gitignore file
   * @returns Promise<boolean> True if file is writable or doesn't exist
   */
  async isGitignoreWritable(targetDirectory: string): Promise<boolean> {
    const gitignorePath = this.getGitignorePath(targetDirectory);

    try {
      if (await fs.pathExists(gitignorePath)) {
        await fs.access(gitignorePath, fs.constants.W_OK);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if we have permission to create a .gitignore file
   * @param targetDirectory Directory where .gitignore would be created
   * @returns Promise<boolean> True if file can be created
   */
  async canCreateGitignore(targetDirectory: string): Promise<boolean> {
    try {
      // Check if directory exists and is writable
      if (!(await fs.pathExists(targetDirectory))) {
        // Try to create the directory to test permissions
        await fs.ensureDir(targetDirectory);
      }

      // Test write permission by checking parent directory if needed
      const dirToCheck = await fs.pathExists(targetDirectory) ? targetDirectory : path.dirname(targetDirectory);
      return await this.isWritable(dirToCheck);
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform comprehensive permission checks
   * @param targetDirectory Directory to check
   * @returns Promise<object> Object with permission check results
   */
  async checkPermissions(targetDirectory: string): Promise<{
    canWrite: boolean;
    fileExists: boolean;
    fileWritable: boolean;
    canCreate: boolean;
    error?: string;
  }> {
    const result: {
      canWrite: boolean;
      fileExists: boolean;
      fileWritable: boolean;
      canCreate: boolean;
      error?: string;
    } = {
      canWrite: false,
      fileExists: false,
      fileWritable: false,
      canCreate: false
    };

    try {
      result.fileExists = await this.exists(targetDirectory);
      result.canWrite = await this.isWritable(targetDirectory);
      result.fileWritable = await this.isGitignoreWritable(targetDirectory);
      result.canCreate = await this.canCreateGitignore(targetDirectory);

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown permission error';
      return result;
    }
  }

  /**
   * Ensure the target directory exists and is writable
   * @param targetDirectory Directory to validate
   * @returns Promise<void>
   * @throws Error if directory cannot be created or is not writable
   */
  async validateTargetDirectory(targetDirectory: string): Promise<void> {
    const permissions = await this.checkPermissions(targetDirectory);

    if (permissions.error) {
      throw new Error(`Permission check failed: ${permissions.error}`);
    }

    if (!permissions.canWrite) {
      throw new Error(`Directory is not writable: ${targetDirectory}`);
    }

    if (permissions.fileExists && !permissions.fileWritable) {
      throw new Error(`Existing .gitignore file is not writable: ${this.getGitignorePath(targetDirectory)}`);
    }

    if (!permissions.fileExists && !permissions.canCreate) {
      throw new Error(`Cannot create .gitignore file in directory: ${targetDirectory}`);
    }
  }

  /**
   * Parse .gitignore content into individual patterns
   * @param content Raw .gitignore file content
   * @returns string[] Array of patterns (excluding comments and empty lines)
   */
  parsePatterns(content: string): string[] {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
  }

  /**
   * Normalize a gitignore pattern for comparison
   * @param pattern Raw pattern from .gitignore
   * @returns string Normalized pattern
   */
  normalizePattern(pattern: string): string {
    // Remove leading/trailing whitespace
    let normalized = pattern.trim();

    // Handle negation patterns
    if (normalized.startsWith('!')) {
      return normalized;
    }

    // Normalize directory patterns
    if (normalized.endsWith('/') && !normalized.endsWith('*/')) {
      normalized = normalized.slice(0, -1);
    }

    // Remove leading ./ if present
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }

    return normalized;
  }

  /**
   * Check if a pattern already exists in the .gitignore content
   * @param content Current .gitignore content
   * @param pattern Pattern to check for
   * @returns boolean True if pattern exists
   */
  hasPattern(content: string, pattern: string): boolean {
    const existingPatterns = this.parsePatterns(content);
    const normalizedPattern = this.normalizePattern(pattern);

    return existingPatterns.some(existingPattern =>
      this.normalizePattern(existingPattern) === normalizedPattern
    );
  }

  /**
   * Filter out patterns that already exist in the .gitignore file
   * @param content Current .gitignore content
   * @param patterns Array of patterns to check
   * @returns object Object with newPatterns and existingPatterns arrays
   */
  filterDuplicatePatterns(content: string, patterns: string[]): {
    newPatterns: string[];
    existingPatterns: string[];
  } {
    const newPatterns: string[] = [];
    const existingPatterns: string[] = [];

    for (const pattern of patterns) {
      if (this.hasPattern(content, pattern)) {
        existingPatterns.push(pattern);
      } else {
        newPatterns.push(pattern);
      }
    }

    return { newPatterns, existingPatterns };
  }

  /**
   * Format patterns into a properly commented section
   * @param patterns Array of patterns to format
   * @param sectionTitle Title for the section
   * @param description Optional description for the section
   * @returns string Formatted section with comments and patterns
   */
  formatPatternSection(patterns: string[], sectionTitle: string, description?: string): string {
    if (patterns.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Add section header
    lines.push(`# ${sectionTitle}`);

    // Add description if provided
    if (description) {
      lines.push(`# ${description}`);
    }

    // Add patterns
    patterns.forEach(pattern => {
      lines.push(pattern);
    });

    return lines.join('\n');
  }

  /**
   * Insert patterns into existing .gitignore content
   * @param existingContent Current .gitignore content
   * @param patterns Array of patterns to insert
   * @param sectionTitle Title for the new section
   * @param description Optional description for the section
   * @returns string Updated .gitignore content
   */
  insertPatterns(
    existingContent: string,
    patterns: string[],
    sectionTitle: string,
    description?: string
  ): string {
    if (patterns.length === 0) {
      return existingContent;
    }

    const formattedSection = this.formatPatternSection(patterns, sectionTitle, description);

    // If file is empty or doesn't exist, just return the formatted section
    if (!existingContent.trim()) {
      return formattedSection;
    }

    // Ensure existing content ends with a newline
    let content = existingContent;
    if (!content.endsWith('\n')) {
      content += '\n';
    }

    // Add a separator line if content doesn't already end with empty line
    if (!content.endsWith('\n\n')) {
      content += '\n';
    }

    // Append the new section with trailing newline
    content += formattedSection + '\n';

    return content;
  }

  /**
   * Create or update .gitignore file with new patterns
   * @param targetDirectory Directory containing the .gitignore file
   * @param patterns Array of patterns to add
   * @param sectionTitle Title for the section
   * @param description Optional description for the section
   * @param options Operation options
   * @returns Promise<GitignoreOperationResult> Result of the operation
   */
  async addPatterns(
    targetDirectory: string,
    patterns: string[],
    sectionTitle: string,
    description?: string,
    options: GitignoreOptions = {}
  ): Promise<GitignoreOperationResult> {
    const result: GitignoreOperationResult = {
      success: false,
      created: false,
      modified: false,
      patternsAdded: [],
      patternsSkipped: []
    };

    try {
      // Validate target directory
      await this.validateTargetDirectory(targetDirectory);

      // Read existing content
      const existingContent = await this.read(targetDirectory);
      const fileExists = await this.exists(targetDirectory);

      // Filter out duplicate patterns
      const { newPatterns, existingPatterns } = this.filterDuplicatePatterns(existingContent, patterns);

      result.patternsSkipped = existingPatterns;

      // If no new patterns to add, return early
      if (newPatterns.length === 0) {
        result.success = true;
        return result;
      }

      // Insert new patterns
      const updatedContent = this.insertPatterns(existingContent, newPatterns, sectionTitle, description);

      // Write updated content
      await this.write(targetDirectory, updatedContent, options);

      result.success = true;
      result.created = !fileExists;
      result.modified = fileExists;
      result.patternsAdded = newPatterns;

      return result;

    } catch (error) {
      if (error instanceof GitignoreError) {
        result.error = error.message;
        result.errorCode = error.code;
      } else {
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.errorCode = 'UNKNOWN_ERROR';
      }
      return result;
    }
  }
}
