import { Command } from 'commander';
import * as path from 'path';
import { ConfigManager } from '../utils/config';
import { GitignoreManager } from '../utils/gitignoreManager';
import { QraftPatterns } from '../utils/qraftPatterns';

/**
 * Options for the gitignore command
 */
export interface GitignoreCommandOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  directory?: string;
}

/**
 * Result of the gitignore command execution
 */
export interface GitignoreCommandResult {
  success: boolean;
  created: boolean;
  modified: boolean;
  patternsAdded: string[];
  patternsSkipped: string[];
  message: string;
  error?: string;
}

/**
 * GitignoreCommand handles the gitignore CLI command
 */
export class GitignoreCommand {
  private gitignoreManager: GitignoreManager;
  private qraftPatterns: QraftPatterns;
  private configManager: ConfigManager;

  constructor(
    gitignoreManager?: GitignoreManager,
    qraftPatterns?: QraftPatterns,
    configManager?: ConfigManager
  ) {
    this.gitignoreManager = gitignoreManager || new GitignoreManager();
    this.configManager = configManager || new ConfigManager();
    this.qraftPatterns = qraftPatterns || new QraftPatterns(this.configManager);
  }

  /**
   * Execute the gitignore command
   * @param options Command options
   * @returns Promise<GitignoreCommandResult> Command execution result
   */
  async execute(options: GitignoreCommandOptions = {}): Promise<GitignoreCommandResult> {
    // Validate directory option first
    if (options.directory !== undefined && options.directory.trim() === '') {
      return {
        success: false,
        created: false,
        modified: false,
        patternsAdded: [],
        patternsSkipped: [],
        message: 'Target directory cannot be empty',
        error: 'Target directory cannot be empty'
      };
    }

    const targetDirectory = options.directory || process.cwd();

    try {
      // Display verbose startup information
      this.displayVerboseStartup(targetDirectory, options);

      // Validate prerequisites
      const prerequisiteCheck = await this.validatePrerequisites(targetDirectory, options);
      if (!prerequisiteCheck.success) {
        return {
          success: false,
          created: false,
          modified: false,
          patternsAdded: [],
          patternsSkipped: [],
          message: this.getUserFriendlyErrorMessage(new Error(prerequisiteCheck.error!), 'during initial validation'),
          error: prerequisiteCheck.error!
        };
      }

      // Validate target directory
      await this.validateAndDisplayDirectory(targetDirectory, options);

      // Get qraft-specific patterns with error handling
      let patterns = [];
      let patternStrings = [];

      try {
        patterns = await this.qraftPatterns.getContextAwarePatterns(targetDirectory);
        patternStrings = patterns.map(p => p.pattern);

        // Display pattern analysis
        this.displayPatternAnalysis(patterns, options);
      } catch (patternError) {
        if (options.verbose) {
          console.warn('⚠️  Warning: Error getting context-aware patterns');
          console.warn(`   Error: ${patternError instanceof Error ? patternError.message : 'Unknown error'}`);
          console.warn('   Falling back to static patterns only');
        }

        // Fallback to static patterns only
        try {
          patterns = this.qraftPatterns.getStaticPatterns();
          patternStrings = patterns.map(p => p.pattern);

          if (options.verbose) {
            console.log('📋 Using static patterns only (fallback mode):');
            patterns.forEach(pattern => {
              console.log(`   • ${pattern.pattern} (${pattern.category}) - ${pattern.description}`);
            });
            console.log('');
          }
        } catch (fallbackError) {
          return {
            success: false,
            created: false,
            modified: false,
            patternsAdded: [],
            patternsSkipped: [],
            message: this.getUserFriendlyErrorMessage(fallbackError, 'while getting patterns'),
            error: fallbackError instanceof Error ? fallbackError.message : 'Unknown pattern error'
          };
        }
      }

      // Validate patterns
      const { valid: validPatterns, invalid: invalidPatterns } = this.qraftPatterns.validateAndNormalizePatterns(patternStrings);

      // Display validation results
      this.displayValidationResults(validPatterns, invalidPatterns, options);

      if (validPatterns.length === 0) {
        return {
          success: true,
          created: false,
          modified: false,
          patternsAdded: [],
          patternsSkipped: [],
          message: 'No valid qraft patterns to add to .gitignore'
        };
      }

      // Show dry run preview
      if (options.dryRun) {
        return this.handleDryRun(targetDirectory, validPatterns, options);
      }

      // Handle file creation and permissions
      const fileExists = await this.gitignoreManager.exists(targetDirectory);
      const permissionResult = await this.handlePermissions(targetDirectory, fileExists, options);

      if (!permissionResult.success) {
        return permissionResult;
      }

      // Execute the main gitignore operation
      const result = await this.executeGitignoreOperation(
        targetDirectory,
        validPatterns,
        options
      );

      // Display operation results
      this.displayOperationResults(result, targetDirectory, options);

      // Format success message
      const message = this.formatSuccessMessage(result, targetDirectory, options);

      return {
        success: result.success,
        created: result.created,
        modified: result.modified,
        patternsAdded: result.patternsAdded,
        patternsSkipped: result.patternsSkipped,
        message,
        error: result.error
      };

    } catch (error) {
      return this.handleExecutionError(error, targetDirectory, options);
    }
  }

  /**
   * Handle execution errors with detailed analysis
   * @param error The error that occurred
   * @param targetDirectory Target directory
   * @param options Command options
   * @returns GitignoreCommandResult Error result
   */
  private handleExecutionError(
    error: unknown,
    targetDirectory: string,
    options: GitignoreCommandOptions
  ): GitignoreCommandResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (options.verbose) {
      console.error('❌ Error executing gitignore command:');
      console.error(`   • Error type: ${error instanceof Error ? error.constructor.name : 'Unknown'}`);
      console.error(`   • Error message: ${errorMessage}`);
      console.error(`   • Target directory: ${targetDirectory}`);

      if (error instanceof Error && error.stack) {
        console.error(`   • Stack trace: ${error.stack.split('\n')[1]?.trim() || 'Not available'}`);
      }

      // Provide troubleshooting suggestions
      this.provideTroubleshootingSuggestions(error, options);
    }

    // Determine appropriate error message based on error type
    let userMessage = 'Failed to update .gitignore file';
    const lowerErrorMessage = errorMessage.toLowerCase();

    if (lowerErrorMessage.includes('permission') || lowerErrorMessage.includes('eacces') || lowerErrorMessage.includes('eperm')) {
      userMessage = 'Permission denied - unable to create or modify .gitignore file';
    } else if (errorMessage.includes('ENOENT')) {
      userMessage = 'Directory not found - please check the target path';
    } else if (errorMessage.includes('ENOSPC')) {
      userMessage = 'Insufficient disk space to create .gitignore file';
    } else if (errorMessage.includes('config')) {
      userMessage = 'Configuration error - unable to load qraft settings';
    }

    return {
      success: false,
      created: false,
      modified: false,
      patternsAdded: [],
      patternsSkipped: [],
      message: userMessage,
      error: errorMessage
    };
  }

  /**
   * Validate command prerequisites
   * @param targetDirectory Target directory
   * @param options Command options
   * @returns Promise<{success: boolean, error?: string}> Validation result
   */
  private async validatePrerequisites(
    targetDirectory: string,
    options: GitignoreCommandOptions
  ): Promise<{success: boolean, error?: string}> {
    try {
      // Check if target directory is valid
      if (!targetDirectory || targetDirectory.trim() === '') {
        return {
          success: false,
          error: 'Target directory cannot be empty'
        };
      }

      // Check if directory exists (create if needed)
      await this.gitignoreManager.validateTargetDirectory(targetDirectory);

      // Check qraft configuration
      try {
        await this.configManager.getConfig();
      } catch (configError) {
        if (options.verbose) {
          console.warn('⚠️  Warning: Could not load qraft configuration, using defaults');
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }



  /**
   * Provide user-friendly error messages
   * @param error The error that occurred
   * @param context Additional context about when the error occurred
   * @returns string User-friendly error message
   */
  private getUserFriendlyErrorMessage(error: unknown, context: string): string {
    if (!(error instanceof Error)) {
      return `An unexpected error occurred ${context}. Please try again.`;
    }

    const errorMessage = error.message.toLowerCase();

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('eacces') || errorMessage.includes('eperm')) {
      return `Permission denied ${context}. You don't have the necessary permissions to modify files in this directory.`;
    }

    // File not found errors
    if (errorMessage.includes('enoent') || errorMessage.includes('not found')) {
      return `Directory or file not found ${context}. Please check that the path exists and is accessible.`;
    }

    // Disk space errors
    if (errorMessage.includes('enospc') || errorMessage.includes('no space')) {
      return `Insufficient disk space ${context}. Please free up some space and try again.`;
    }

    // Read-only file system
    if (errorMessage.includes('erofs') || errorMessage.includes('read-only')) {
      return `Cannot write to read-only file system ${context}. The target location is not writable.`;
    }

    // Configuration errors
    if (errorMessage.includes('config')) {
      return `Configuration error ${context}. There may be an issue with your qraft settings.`;
    }

    // Network/registry errors
    if (errorMessage.includes('network') || errorMessage.includes('registry')) {
      return `Network error ${context}. Please check your internet connection and try again.`;
    }

    // Generic file system errors
    if (errorMessage.includes('eisdir') || errorMessage.includes('enotdir')) {
      return `File system error ${context}. There's a conflict between files and directories in the target path.`;
    }

    // Default fallback
    return `An error occurred ${context}: ${error.message}`;
  }

  /**
   * Provide troubleshooting suggestions based on error type
   * @param error The error that occurred
   * @param options Command options
   */
  private provideTroubleshootingSuggestions(error: unknown, _options: GitignoreCommandOptions): void {
    console.error('');
    console.error('💡 Troubleshooting suggestions:');

    if (error instanceof Error) {
      if (error.message.includes('Permission')) {
        console.error('   • Try running with --force to override permission checks');
        console.error('   • Check directory permissions with: ls -la');
        console.error('   • Ensure you have write access to the target directory');
      } else if (error.message.includes('ENOENT')) {
        console.error('   • Verify the target directory exists');
        console.error('   • Use --directory flag to specify a different path');
        console.error('   • Check for typos in the directory path');
      } else if (error.message.includes('config')) {
        console.error('   • Check qraft configuration with: qraft config list');
        console.error('   • Reset configuration with: qraft config reset');
        console.error('   • Verify cache directory permissions');
      } else {
        console.error('   • Try running with --verbose for more details');
        console.error('   • Check available disk space');
        console.error('   • Verify file system permissions');
      }
    }

    console.error('   • Use --dry-run to test without making changes');
    console.error('');
  }

  /**
   * Handle dry run mode
   * @param targetDirectory Target directory
   * @param patterns Patterns to add
   * @param options Command options
   * @returns Promise<GitignoreCommandResult> Dry run result
   */
  private async handleDryRun(
    targetDirectory: string,
    patterns: string[],
    _options: GitignoreCommandOptions
  ): Promise<GitignoreCommandResult> {
    const gitignorePath = this.gitignoreManager.getGitignorePath(targetDirectory);
    const fileExists = await this.gitignoreManager.exists(targetDirectory);

    // Display dry run header
    this.displayDryRunHeader(targetDirectory, gitignorePath, fileExists);

    let newPatterns = patterns;
    let existingPatterns: string[] = [];

    if (fileExists) {
      // Analyze existing file for duplicates
      const analysisResult = await this.analyzeDryRunChanges(targetDirectory, patterns);
      newPatterns = analysisResult.newPatterns;
      existingPatterns = analysisResult.existingPatterns;

      this.displayExistingFileAnalysis(existingPatterns);
    } else {
      this.displayNewFileCreation();
    }

    // Show what would be added
    this.displayDryRunChanges(newPatterns, fileExists);

    // Show file preview if there are changes
    if (newPatterns.length > 0) {
      await this.displayDryRunPreview(targetDirectory, newPatterns, fileExists);
    }

    // Display summary
    this.displayDryRunSummary(newPatterns, existingPatterns, fileExists);

    return {
      success: true,
      created: !fileExists,
      modified: fileExists,
      patternsAdded: newPatterns,
      patternsSkipped: existingPatterns,
      message: this.formatDryRunMessage(newPatterns, existingPatterns, fileExists)
    };
  }

  /**
   * Display dry run header information
   * @param targetDirectory Target directory
   * @param gitignorePath Path to .gitignore file
   * @param fileExists Whether file exists
   */
  private displayDryRunHeader(targetDirectory: string, gitignorePath: string, fileExists: boolean): void {
    console.log('');
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('═'.repeat(50));
    console.log(`📁 Target directory: ${targetDirectory}`);
    console.log(`📄 .gitignore file: ${gitignorePath}`);
    console.log(`📊 File status: ${fileExists ? '✅ Exists' : '❌ Does not exist'}`);
    console.log('');
  }

  /**
   * Analyze changes for dry run mode
   * @param targetDirectory Target directory
   * @param patterns Patterns to analyze
   * @returns Analysis result
   */
  private async analyzeDryRunChanges(targetDirectory: string, patterns: string[]): Promise<{
    newPatterns: string[];
    existingPatterns: string[];
  }> {
    const existingContent = await this.gitignoreManager.read(targetDirectory);
    return this.gitignoreManager.filterDuplicatePatterns(existingContent, patterns);
  }

  /**
   * Display analysis of existing file
   * @param existingPatterns Patterns that already exist
   */
  private displayExistingFileAnalysis(existingPatterns: string[]): void {
    if (existingPatterns.length > 0) {
      console.log('⏭️  Patterns already present (will be skipped):');
      existingPatterns.forEach(pattern => {
        console.log(`   • ${pattern}`);
      });
      console.log('');
    }
  }

  /**
   * Display new file creation message
   */
  private displayNewFileCreation(): void {
    console.log('📝 Would create new .gitignore file');
    console.log('');
  }

  /**
   * Display what changes would be made
   * @param newPatterns New patterns to add
   * @param fileExists Whether file exists
   */
  private displayDryRunChanges(newPatterns: string[], fileExists: boolean): void {
    if (newPatterns.length > 0) {
      console.log(`✅ ${fileExists ? 'Would add to existing file' : 'Would create file with'}:`);
      console.log('');
      newPatterns.forEach(pattern => {
        console.log(`   + ${pattern}`);
      });
      console.log('');
    } else {
      console.log('ℹ️  No new patterns to add - all patterns already exist');
      console.log('');
    }
  }

  /**
   * Display preview of the file content
   * @param targetDirectory Target directory
   * @param newPatterns New patterns to add
   * @param fileExists Whether file exists
   */
  private async displayDryRunPreview(
    targetDirectory: string,
    newPatterns: string[],
    fileExists: boolean
  ): Promise<void> {
    console.log('📋 File preview after changes:');
    console.log('─'.repeat(40));

    if (fileExists) {
      // Show existing content first
      const existingContent = await this.gitignoreManager.read(targetDirectory);
      if (existingContent.trim()) {
        console.log(existingContent.trim());
        console.log('');
      }
    }

    // Show new section that would be added
    const sectionTitle = this.qraftPatterns.getSectionTitle();
    const sectionDescription = this.qraftPatterns.getSectionDescription();

    console.log(`# ${sectionTitle}`);
    console.log(`# ${sectionDescription}`);
    newPatterns.forEach(pattern => {
      console.log(pattern);
    });

    console.log('─'.repeat(40));
    console.log('');
  }

  /**
   * Display dry run summary
   * @param newPatterns New patterns
   * @param existingPatterns Existing patterns
   * @param fileExists Whether file exists
   */
  private displayDryRunSummary(newPatterns: string[], existingPatterns: string[], fileExists: boolean): void {
    console.log('📊 Summary:');
    console.log(`   • ${newPatterns.length} patterns would be added`);
    console.log(`   • ${existingPatterns.length} patterns already exist`);
    console.log(`   • File would be ${fileExists ? 'modified' : 'created'}`);
    console.log('');
    console.log('💡 Run without --dry-run to apply these changes');
  }

  /**
   * Format dry run completion message
   * @param newPatterns New patterns
   * @param existingPatterns Existing patterns
   * @param fileExists Whether file exists
   * @returns Formatted message
   */
  private formatDryRunMessage(newPatterns: string[], existingPatterns: string[], fileExists: boolean): string {
    if (newPatterns.length === 0) {
      return 'Dry run completed - no changes needed (all patterns already exist)';
    }

    const action = fileExists ? 'modified' : 'created';
    const summary = `${newPatterns.length} patterns would be added`;
    const skipped = existingPatterns.length > 0 ? `, ${existingPatterns.length} skipped` : '';

    return `Dry run completed - .gitignore would be ${action} (${summary}${skipped})`;
  }

  /**
   * Handle permissions and confirmations based on force flag
   * @param targetDirectory Target directory
   * @param fileExists Whether .gitignore file exists
   * @param options Command options
   * @returns Promise<GitignoreCommandResult> Permission result
   */
  private async handlePermissions(
    targetDirectory: string,
    fileExists: boolean,
    options: GitignoreCommandOptions
  ): Promise<GitignoreCommandResult> {
    // Check directory permissions first
    try {
      await this.gitignoreManager.validateTargetDirectory(targetDirectory);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Permission error';

      if (options.force) {
        if (options.verbose) {
          console.warn(`⚠️  Permission warning (continuing due to --force): ${errorMessage}`);
        }
      } else {
        return {
          success: false,
          created: false,
          modified: false,
          patternsAdded: [],
          patternsSkipped: [],
          message: 'Permission denied',
          error: errorMessage
        };
      }
    }

    // Handle file creation confirmation
    if (!fileExists) {
      if (options.force) {
        if (options.verbose) {
          console.log('📝 Creating .gitignore file (--force flag enabled)');
        }
      } else {
        const shouldCreate = await this.confirmFileCreation(targetDirectory, options);
        if (!shouldCreate) {
          return {
            success: false,
            created: false,
            modified: false,
            patternsAdded: [],
            patternsSkipped: [],
            message: 'Operation cancelled by user',
            error: 'User declined to create .gitignore file'
          };
        }
      }
    }

    // Handle existing file modification
    if (fileExists && !options.force) {
      const shouldModify = await this.confirmFileModification(targetDirectory, options);
      if (!shouldModify) {
        return {
          success: false,
          created: false,
          modified: false,
          patternsAdded: [],
          patternsSkipped: [],
          message: 'Operation cancelled by user',
          error: 'User declined to modify existing .gitignore file'
        };
      }
    }

    return {
      success: true,
      created: false,
      modified: false,
      patternsAdded: [],
      patternsSkipped: [],
      message: 'Permissions validated'
    };
  }

  /**
   * Confirm file creation with user
   * @param targetDirectory Target directory
   * @param options Command options
   * @returns Promise<boolean> True if user confirms
   */
  private async confirmFileCreation(targetDirectory: string, options: GitignoreCommandOptions): Promise<boolean> {
    const gitignorePath = this.gitignoreManager.getGitignorePath(targetDirectory);

    if (options.verbose) {
      console.log('');
      console.log('📄 .gitignore file does not exist');
      console.log(`📁 Would create: ${gitignorePath}`);
      console.log('');
      console.log('💡 Use --force to skip this confirmation');
    }

    // In a real implementation, this would use an interactive prompt
    // For now, we'll assume user consent when not in force mode
    // This will be enhanced in the interactive implementation
    return true;
  }

  /**
   * Confirm file modification with user
   * @param targetDirectory Target directory
   * @param options Command options
   * @returns Promise<boolean> True if user confirms
   */
  private async confirmFileModification(targetDirectory: string, options: GitignoreCommandOptions): Promise<boolean> {
    const gitignorePath = this.gitignoreManager.getGitignorePath(targetDirectory);

    if (options.verbose) {
      console.log('');
      console.log('📝 .gitignore file exists and will be modified');
      console.log(`📁 File location: ${gitignorePath}`);
      console.log('');
      console.log('💡 Use --force to skip this confirmation');
    }

    // In a real implementation, this would use an interactive prompt
    // For now, we'll assume user consent when not in force mode
    // This will be enhanced in the interactive implementation
    return true;
  }



  /**
   * Display force flag information
   * @param options Command options
   */
  private displayForceInfo(options: GitignoreCommandOptions): void {
    if (options.force && options.verbose) {
      console.log('⚡ Force mode enabled - skipping confirmations');
    }
  }

  /**
   * Display verbose startup information
   * @param targetDirectory Target directory
   * @param options Command options
   */
  private displayVerboseStartup(targetDirectory: string, options: GitignoreCommandOptions): void {
    if (!options.verbose) return;

    console.log('');
    console.log('🚀 Qraft Gitignore Command');
    console.log('═'.repeat(40));
    console.log(`📁 Target directory: ${targetDirectory}`);
    console.log(`🔧 Options: ${this.formatOptions(options)}`);
    this.displayForceInfo(options);
    console.log('');
  }

  /**
   * Validate and display directory information
   * @param targetDirectory Target directory
   * @param options Command options
   */
  private async validateAndDisplayDirectory(targetDirectory: string, options: GitignoreCommandOptions): Promise<void> {
    if (options.verbose) {
      console.log('🔍 Analyzing target directory...');

      try {
        const permissions = await this.gitignoreManager.checkPermissions(targetDirectory);
        console.log(`   • Directory writable: ${permissions.canWrite ? '✅' : '❌'}`);
        console.log(`   • .gitignore exists: ${permissions.fileExists ? '✅' : '❌'}`);
        console.log(`   • Can create file: ${permissions.canCreate ? '✅' : '❌'}`);

        if (permissions.fileExists) {
          console.log(`   • File writable: ${permissions.fileWritable ? '✅' : '❌'}`);
        }

        if (permissions.error) {
          console.log(`   • Warning: ${permissions.error}`);
        }

        console.log('');
      } catch (error) {
        console.log(`   • Error checking permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('');
      }
    }
  }

  /**
   * Display pattern analysis results
   * @param patterns Detected patterns
   * @param options Command options
   */
  private displayPatternAnalysis(patterns: any[], options: GitignoreCommandOptions): void {
    if (options.verbose) {
      console.log(`📋 Pattern Analysis (${patterns.length} patterns found):`);

      if (patterns.length === 0) {
        console.log('   • No qraft patterns detected for this directory');
      } else {
        // Group patterns by category
        const byCategory = patterns.reduce((acc, pattern) => {
          if (!acc[pattern.category]) acc[pattern.category] = [];
          acc[pattern.category].push(pattern);
          return acc;
        }, {});

        Object.entries(byCategory).forEach(([category, categoryPatterns]) => {
          const patterns = categoryPatterns as any[];
          console.log(`   • ${category.toUpperCase()}: ${patterns.length} patterns`);
          patterns.forEach((pattern: any) => {
            console.log(`     - ${pattern.pattern} (${pattern.description})`);
          });
        });
      }

      console.log('');
    } else if (patterns.length > 0) {
      console.log(`📋 Found ${patterns.length} qraft patterns to process`);
    }
  }

  /**
   * Display validation results
   * @param validPatterns Valid patterns
   * @param invalidPatterns Invalid patterns
   * @param options Command options
   */
  private displayValidationResults(
    validPatterns: string[],
    invalidPatterns: any[],
    options: GitignoreCommandOptions
  ): void {
    if (options.verbose) {
      console.log('🔍 Pattern Validation Results:');
      console.log(`   • Valid patterns: ${validPatterns.length}`);
      console.log(`   • Invalid patterns: ${invalidPatterns.length}`);

      if (validPatterns.length > 0) {
        console.log('   • Valid patterns:');
        validPatterns.forEach(pattern => {
          console.log(`     ✅ ${pattern}`);
        });
      }

      if (invalidPatterns.length > 0) {
        console.log('   • Invalid patterns:');
        invalidPatterns.forEach(({ pattern, errors }) => {
          console.log(`     ❌ ${pattern}: ${errors.join(', ')}`);
        });
      }

      console.log('');
    } else if (invalidPatterns.length > 0) {
      console.warn('⚠️  Some patterns were invalid and will be skipped:');
      invalidPatterns.forEach(({ pattern, errors }) => {
        console.warn(`  • ${pattern}: ${errors.join(', ')}`);
      });
    }
  }

  /**
   * Format options for display
   * @param options Command options
   * @returns Formatted options string
   */
  private formatOptions(options: GitignoreCommandOptions): string {
    const flags = [];
    if (options.dryRun) flags.push('dry-run');
    if (options.force) flags.push('force');
    if (options.verbose) flags.push('verbose');
    if (options.directory) flags.push(`directory=${options.directory}`);

    return flags.length > 0 ? flags.join(', ') : 'none';
  }

  /**
   * Execute the main gitignore operation combining all utilities
   * @param targetDirectory Target directory
   * @param validPatterns Valid patterns to add
   * @param options Command options
   * @returns Promise<any> Operation result
   */
  private async executeGitignoreOperation(
    targetDirectory: string,
    validPatterns: string[],
    options: GitignoreCommandOptions
  ): Promise<any> {
    if (options.verbose) {
      console.log('🔧 Executing gitignore operation...');
    }

    // Get enhanced pattern information for better context
    await this.buildPatternContext(validPatterns, options);

    // Pre-operation analysis
    const preAnalysis = await this.performPreOperationAnalysis(targetDirectory, validPatterns, options);

    if (options.verbose) {
      this.displayPreOperationSummary(preAnalysis, options);
    }

    // Execute the core operation
    const result = await this.gitignoreManager.addPatterns(
      targetDirectory,
      validPatterns,
      this.qraftPatterns.getSectionTitle(),
      this.qraftPatterns.getSectionDescription(),
      {
        dryRun: false,
        force: options.force || false,
        verbose: options.verbose || false
      }
    );

    // Post-operation validation
    if (result.success && options.verbose) {
      await this.performPostOperationValidation(targetDirectory, result, options);
    }

    return result;
  }

  /**
   * Build pattern context for enhanced operation
   * @param patterns Patterns to analyze
   * @param options Command options
   * @returns Promise<any> Pattern context
   */
  private async buildPatternContext(patterns: string[], options: GitignoreCommandOptions): Promise<any> {
    const allPatterns = await this.qraftPatterns.getAllPatterns();
    const patternDetails = allPatterns.filter(p => patterns.includes(p.pattern));

    const context = {
      totalPatterns: patterns.length,
      byCategory: {} as Record<string, number>,
      staticCount: 0,
      dynamicCount: 0,
      details: patternDetails
    };

    patternDetails.forEach(pattern => {
      // Count by category
      context.byCategory[pattern.category] = (context.byCategory[pattern.category] || 0) + 1;

      // Count by type
      if (pattern.isStatic) {
        context.staticCount++;
      } else {
        context.dynamicCount++;
      }
    });

    if (options.verbose) {
      console.log('📋 Pattern Context Analysis:');
      console.log(`   • Total patterns: ${context.totalPatterns}`);
      console.log(`   • Static patterns: ${context.staticCount}`);
      console.log(`   • Dynamic patterns: ${context.dynamicCount}`);
      Object.entries(context.byCategory).forEach(([category, count]) => {
        console.log(`   • ${category}: ${count} patterns`);
      });
      console.log('');
    }

    return context;
  }

  /**
   * Perform pre-operation analysis
   * @param targetDirectory Target directory
   * @param patterns Patterns to add
   * @param options Command options
   * @returns Promise<any> Analysis result
   */
  private async performPreOperationAnalysis(
    targetDirectory: string,
    patterns: string[],
    _options: GitignoreCommandOptions
  ): Promise<any> {
    const fileExists = await this.gitignoreManager.exists(targetDirectory);
    let existingContent = '';
    let duplicateAnalysis = { newPatterns: patterns, existingPatterns: [] as string[] };

    if (fileExists) {
      existingContent = await this.gitignoreManager.read(targetDirectory);
      duplicateAnalysis = this.gitignoreManager.filterDuplicatePatterns(existingContent, patterns);
    }

    const analysis = {
      fileExists,
      existingContent,
      duplicateAnalysis,
      willCreate: !fileExists,
      willModify: fileExists && duplicateAnalysis.newPatterns.length > 0,
      hasChanges: duplicateAnalysis.newPatterns.length > 0
    };

    return analysis;
  }

  /**
   * Display pre-operation summary
   * @param analysis Pre-operation analysis
   * @param options Command options
   */
  private displayPreOperationSummary(analysis: any, _options: GitignoreCommandOptions): void {
    console.log('📋 Pre-Operation Summary:');
    console.log(`   • File exists: ${analysis.fileExists ? '✅' : '❌'}`);
    console.log(`   • Will create: ${analysis.willCreate ? '✅' : '❌'}`);
    console.log(`   • Will modify: ${analysis.willModify ? '✅' : '❌'}`);
    console.log(`   • Has changes: ${analysis.hasChanges ? '✅' : '❌'}`);
    console.log(`   • New patterns: ${analysis.duplicateAnalysis.newPatterns.length}`);
    console.log(`   • Existing patterns: ${analysis.duplicateAnalysis.existingPatterns.length}`);
    console.log('');
  }

  /**
   * Perform post-operation validation
   * @param targetDirectory Target directory
   * @param result Operation result
   * @param options Command options
   */
  private async performPostOperationValidation(
    targetDirectory: string,
    result: any,
    _options: GitignoreCommandOptions
  ): Promise<void> {
    console.log('🔍 Post-Operation Validation:');

    try {
      // Verify file exists
      const fileExists = await this.gitignoreManager.exists(targetDirectory);
      console.log(`   • File exists: ${fileExists ? '✅' : '❌'}`);

      if (fileExists) {
        // Verify patterns were added
        const content = await this.gitignoreManager.read(targetDirectory);
        const addedPatternsFound = result.patternsAdded.every((pattern: string) =>
          this.gitignoreManager.hasPattern(content, pattern)
        );
        console.log(`   • Patterns verified: ${addedPatternsFound ? '✅' : '❌'}`);

        // Check file size
        const lines = content.split('\n').length;
        console.log(`   • File lines: ${lines}`);

        // Verify section header exists
        const sectionTitle = this.qraftPatterns.getSectionTitle();
        const hasSectionHeader = content.includes(`# ${sectionTitle}`);
        console.log(`   • Section header: ${hasSectionHeader ? '✅' : '❌'}`);
      }

      console.log('');
    } catch (error) {
      console.log(`   • Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log('');
    }
  }

  /**
   * Display operation results
   * @param result GitignoreManager result
   * @param targetDirectory Target directory
   * @param options Command options
   */
  private displayOperationResults(result: any, targetDirectory: string, options: GitignoreCommandOptions): void {
    if (!options.verbose) return;

    console.log('📊 Operation Results:');
    console.log(`   • File ${result.created ? 'created' : result.modified ? 'modified' : 'unchanged'}`);
    console.log(`   • Patterns added: ${result.patternsAdded.length}`);
    console.log(`   • Patterns skipped: ${result.patternsSkipped.length}`);

    if (result.patternsAdded.length > 0) {
      console.log('   • Added patterns:');
      result.patternsAdded.forEach((pattern: string) => {
        console.log(`     + ${pattern}`);
      });
    }

    if (result.patternsSkipped.length > 0) {
      console.log('   • Skipped patterns (already exist):');
      result.patternsSkipped.forEach((pattern: string) => {
        console.log(`     = ${pattern}`);
      });
    }

    const gitignorePath = this.gitignoreManager.getGitignorePath(targetDirectory);
    console.log(`   • File location: ${gitignorePath}`);
    console.log('');
  }

  /**
   * Format success message
   * @param result GitignoreManager result
   * @param targetDirectory Target directory
   * @param options Command options
   * @returns string Formatted message
   */
  private formatSuccessMessage(
    result: any,
    targetDirectory: string,
    _options: GitignoreCommandOptions
  ): string {
    const gitignorePath = this.gitignoreManager.getGitignorePath(targetDirectory);
    const relativePath = path.relative(process.cwd(), gitignorePath);
    
    if (result.patternsAdded.length === 0 && result.patternsSkipped.length > 0) {
      return `✅ All qraft patterns already exist in ${relativePath}`;
    }
    
    if (result.created) {
      return `✅ Created ${relativePath} with ${result.patternsAdded.length} qraft patterns`;
    }
    
    if (result.modified) {
      const addedCount = result.patternsAdded.length;
      const skippedCount = result.patternsSkipped.length;
      let message = `✅ Updated ${relativePath} with ${addedCount} new qraft patterns`;
      
      if (skippedCount > 0) {
        message += ` (${skippedCount} already existed)`;
      }
      
      return message;
    }
    
    return `✅ .gitignore file processed successfully`;
  }
}

/**
 * Create and configure the gitignore command
 * @returns Command Configured Commander.js command
 */
export function createGitignoreCommand(): Command {
  const command = new Command('gitignore');

  command
    .description('Add qraft-specific patterns to .gitignore file')
    .summary('Manage .gitignore patterns for qraft-generated files')
    .option('-d, --dry-run', 'Show what would be added without making changes')
    .option('-f, --force', 'Skip confirmation prompts and create/modify files automatically')
    .option('-v, --verbose', 'Show detailed output')
    .option('--directory <path>', 'Target directory (defaults to current directory)')
    .addHelpText('after', `
Examples:
  $ qraft gitignore                    Add qraft patterns to .gitignore in current directory
  $ qraft gitignore --dry-run          Preview what patterns would be added
  $ qraft gitignore --verbose          Show detailed information during execution
  $ qraft gitignore --force            Skip confirmations and add patterns automatically
  $ qraft gitignore --directory ./app  Add patterns to .gitignore in ./app directory

Description:
  This command adds qraft-specific patterns to your .gitignore file to prevent
  qraft-generated files from being committed to version control. It includes
  patterns for .qraft metadata directories, configuration files, and cache files.
`)
    .action(async (options: GitignoreCommandOptions) => {
      try {
        const gitignoreCommand = new GitignoreCommand();

        // Validate command line options
        const optionValidation = validateCommandOptions(options);
        if (!optionValidation.valid) {
          console.error(`❌ Invalid options: ${optionValidation.error}`);
          console.error('💡 Use --help to see available options');
          process.exit(1);
        }

        // Show force mode indicator if enabled
        if (options.force && !options.dryRun) {
          console.log('⚡ Force mode enabled - will skip confirmations');
        }

        const result = await gitignoreCommand.execute(options);

        if (result.success) {
          console.log(result.message);

          // Show additional info for force mode
          if (options.force && (result.created || result.modified) && !options.dryRun) {
            console.log('⚡ Operation completed without confirmations (--force)');
          }

          if (options.verbose && result.patternsAdded.length > 0) {
            console.log('');
            console.log('📋 Patterns added:');
            result.patternsAdded.forEach(pattern => {
              console.log(`  • ${pattern}`);
            });
          }

          if (options.verbose && result.patternsSkipped.length > 0) {
            console.log('');
            console.log('⏭️  Patterns skipped (already exist):');
            result.patternsSkipped.forEach(pattern => {
              console.log(`  • ${pattern}`);
            });
          }

          // Provide helpful hints
          if (!options.force && !options.dryRun && options.verbose) {
            console.log('');
            console.log('💡 Tip: Use --force to skip confirmations in the future');
          }

          // Success exit
          process.exit(0);
        } else {
          // Handle different types of failures
          handleCommandFailure(result, options);
        }
      } catch (unexpectedError) {
        // Handle completely unexpected errors
        console.error('❌ An unexpected error occurred');

        if (options.verbose) {
          console.error(`   Error: ${unexpectedError instanceof Error ? unexpectedError.message : 'Unknown error'}`);
          if (unexpectedError instanceof Error && unexpectedError.stack) {
            console.error(`   Stack: ${unexpectedError.stack.split('\n')[1]?.trim() || 'Not available'}`);
          }
        }

        console.error('💡 Please report this issue if it persists');
        console.error('   Include the error details above when reporting');
        process.exit(1);
      }
    });

  return command;
}

/**
 * Validate command line options
 * @param options Command options to validate
 * @returns Validation result
 */
export function validateCommandOptions(options: GitignoreCommandOptions): {valid: boolean, error?: string} {
  // Check for conflicting options
  if (options.dryRun && options.force) {
    return {
      valid: false,
      error: '--dry-run and --force cannot be used together'
    };
  }

  // Validate directory path if provided
  if (options.directory !== undefined) {
    if (typeof options.directory !== 'string' || options.directory.trim() === '') {
      return {
        valid: false,
        error: '--directory must be a valid path'
      };
    }

    // Check for potentially dangerous paths
    if (options.directory.includes('..') && !options.force) {
      return {
        valid: false,
        error: 'Relative paths with ".." are not allowed (use --force to override)'
      };
    }
  }

  return { valid: true };
}

/**
 * Handle command failure with appropriate messaging
 * @param result Command result
 * @param options Command options
 */
export function handleCommandFailure(result: GitignoreCommandResult, options: GitignoreCommandOptions): void {
  console.error(`❌ ${result.message}`);

  if (result.error && options.verbose) {
    console.error(`   Error details: ${result.error}`);
  }

  // Provide specific suggestions based on error type
  if (result.error) {
    if (result.error.includes('Permission') && !options.force) {
      console.error('');
      console.error('💡 Permission issue suggestions:');
      console.error('   • Try using --force to override permission checks');
      console.error('   • Check directory permissions: ls -la');
      console.error('   • Ensure you have write access to the target directory');
    } else if (result.error.includes('ENOENT')) {
      console.error('');
      console.error('💡 Directory not found suggestions:');
      console.error('   • Verify the target directory exists');
      console.error('   • Use --directory flag to specify a different path');
      console.error('   • Check for typos in the directory path');
    } else if (result.error.includes('config')) {
      console.error('');
      console.error('💡 Configuration issue suggestions:');
      console.error('   • Check qraft configuration: qraft config list');
      console.error('   • Reset configuration: qraft config reset');
      console.error('   • Verify cache directory permissions');
    }
  }

  // General suggestions
  console.error('');
  console.error('💡 General troubleshooting:');
  console.error('   • Use --dry-run to test without making changes');
  console.error('   • Use --verbose for more detailed output');
  console.error('   • Check available disk space');

  process.exit(1);
}
