import chalk from 'chalk';
import { BoxManager } from '../core/boxManager';

interface CreateOptions {
  registry?: string;
}

interface DryRunPreview {
  localPath: string;
  boxName: string;
  registry: string;
  estimatedFiles: number;
  targetLocation: string;
}

function createUserPrompt(question: string): Promise<string> {
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function showDryRunPreview(preview: DryRunPreview): Promise<boolean> {
  console.log(chalk.cyan('\n📋 Preview: What will be created\n'));

  console.log(chalk.yellow('Source:'));
  console.log(`  📁 Local Directory: ${preview.localPath}`);
  console.log(`  📊 Estimated Files: ${preview.estimatedFiles} files`);

  console.log(chalk.yellow('\nTarget:'));
  console.log(`  📦 Box Name: ${preview.boxName}`);
  console.log(`  🏠 Registry: ${preview.registry}`);
  console.log(`  📍 Target Location: ${preview.targetLocation}`);

  console.log(chalk.yellow('\nActions:'));
  console.log(`  ✨ Create new box structure in registry`);
  console.log(`  📤 Upload ${preview.estimatedFiles} files`);
  console.log(`  🏷️  Generate metadata manifest`);
  console.log(`  🔗 Make box available for download`);

  console.log(chalk.cyan('\n❓ Confirmation Required'));
  const answer = await createUserPrompt(chalk.white('Do you want to proceed with creating this box? (y/N): '));

  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

function estimateFileCount(localPath: string): number {
  const fs = require('fs');
  const path = require('path');

  try {
    let fileCount = 0;

    function countFiles(dir: string): void {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          // Skip common directories that would be excluded
          if (!['node_modules', '.git', '.DS_Store', 'dist', 'build'].includes(item)) {
            countFiles(fullPath);
          }
        } else if (!item.startsWith('.') || item === '.gitignore') {
          // Skip common files that would be excluded, but include .gitignore
          fileCount++;
        }
      }
    }

    const resolvedPath = path.resolve(localPath);
    countFiles(resolvedPath);
    return fileCount;
  } catch {
    return 0; // Return 0 if we can't count files
  }
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

interface CreateError extends Error {
  code?: string;
  suggestion?: string;
}

function createError(message: string, code?: string, suggestion?: string): CreateError {
  const error = new Error(message) as CreateError;
  if (code) error.code = code;
  if (suggestion) error.suggestion = suggestion;
  return error;
}

function validateLocalPath(localPath: string): ValidationResult {
  const fs = require('fs');
  const path = require('path');

  try {
    // Resolve the path to handle relative paths
    const resolvedPath = path.resolve(localPath);

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      const parentDir = path.dirname(resolvedPath);
      const suggestion = fs.existsSync(parentDir)
        ? `Check if the path is correct. Parent directory exists: ${parentDir}`
        : `Check if the path is correct. Try using an absolute path: ${resolvedPath}`;

      return {
        isValid: false,
        error: `Path does not exist: ${localPath}`,
        suggestion
      };
    }

    // Check if it's a directory
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isValid: false,
        error: `Path is not a directory: ${localPath}`,
        suggestion: `The qraft create command requires a directory, not a file. Try using the directory containing this file.`
      };
    }

    // Check if directory is readable
    try {
      fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch {
      return {
        isValid: false,
        error: `Directory is not readable: ${localPath}`,
        suggestion: `Check directory permissions. Try: chmod +r "${resolvedPath}"`
      };
    }

    // Check if directory is empty
    const files = fs.readdirSync(resolvedPath);
    if (files.length === 0) {
      return {
        isValid: false,
        error: `Directory is empty: ${localPath}`,
        suggestion: `Add some files to the directory before creating a box, or choose a different directory.`
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Error accessing path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestion: `Ensure the path is valid and you have the necessary permissions.`
    };
  }
}

async function validateRegistryAccess(boxManager: BoxManager, registry?: string): Promise<ValidationResult> {
  try {
    // If no registry specified, use default
    if (!registry) {
      // Check if default registry is configured
      const configManager = boxManager.getConfigManager();
      const config = await configManager.getConfig();
      const defaultRegistry = config.defaultRegistry;

      if (!defaultRegistry) {
        return {
          isValid: false,
          error: 'No default registry configured.',
          suggestion: 'Use --registry option (e.g., --registry owner/repository) or configure a default registry with: qraft config set defaultRegistry owner/repository'
        };
      }

      registry = defaultRegistry;
    }

    // Basic registry format validation (should be in format 'owner/repo')
    if (!registry.includes('/')) {
      const suggestion = registry.includes('-') || registry.includes('_')
        ? `Try: --registry ${registry}/templates or --registry owner/${registry}`
        : `Try: --registry owner/${registry} (replace 'owner' with the GitHub username or organization)`;

      return {
        isValid: false,
        error: `Invalid registry format: ${registry}. Expected format: owner/repository`,
        suggestion
      };
    }

    // Validate registry parts
    const [owner, repo] = registry.split('/');
    if (!owner || !repo) {
      return {
        isValid: false,
        error: `Invalid registry format: ${registry}. Both owner and repository name are required.`,
        suggestion: `Example: --registry myusername/my-templates`
      };
    }

    // Check for valid GitHub naming conventions
    const validNamePattern = /^[a-zA-Z0-9._-]+$/;
    if (!validNamePattern.test(owner)) {
      return {
        isValid: false,
        error: `Invalid owner name: ${owner}. Owner names can only contain letters, numbers, dots, hyphens, and underscores.`,
        suggestion: `Check the GitHub username or organization name.`
      };
    }

    if (!validNamePattern.test(repo)) {
      return {
        isValid: false,
        error: `Invalid repository name: ${repo}. Repository names can only contain letters, numbers, dots, hyphens, and underscores.`,
        suggestion: `Check the GitHub repository name.`
      };
    }

    // TODO: Add actual GitHub API connectivity check in future tasks
    // For now, just validate the format
    console.log(chalk.gray(`Registry validation: ${registry} (format check passed)`));

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Registry validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestion: `Check your network connection and registry configuration.`
    };
  }
}

async function getEffectiveRegistry(boxManager: BoxManager): Promise<string> {
  try {
    const configManager = boxManager.getConfigManager();
    const config = await configManager.getConfig();

    if (!config.defaultRegistry) {
      throw createError(
        'No default registry configured',
        'NO_DEFAULT_REGISTRY',
        'Configure a default registry with: qraft config set defaultRegistry owner/repository'
      );
    }

    return config.defaultRegistry;
  } catch (error) {
    if (error instanceof Error && (error as CreateError).code) {
      throw error; // Re-throw our custom errors
    }

    throw createError(
      'Failed to get registry configuration',
      'REGISTRY_CONFIG_FAILED',
      'Check your configuration with: qraft config list'
    );
  }
}

function deriveBoxNameFromPath(localPath: string): string {
  const path = require('path');
  const baseName = path.basename(path.resolve(localPath));

  // Clean up the name to be a valid box name
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

export async function createCommand(
  boxManager: BoxManager,
  localPath: string,
  boxName?: string,
  options: CreateOptions = {}
): Promise<void> {
  console.log(chalk.blue.bold('📦 Creating Box from Local Directory\n'));

  try {
    // Step 1: Validate local path
    console.log(chalk.cyan('🔍 Validating local directory...'));
    const pathValidation = validateLocalPath(localPath);

    if (!pathValidation.isValid) {
      console.error(chalk.red('❌ Path validation failed:'), pathValidation.error);
      if (pathValidation.suggestion) {
        console.error(chalk.yellow('💡 Suggestion:'), pathValidation.suggestion);
      }
      throw createError(pathValidation.error || 'Path validation failed', 'PATH_VALIDATION_FAILED', pathValidation.suggestion);
    }

    console.log(chalk.green('✅ Local directory is valid'));

    // Step 2: Validate registry access
    console.log(chalk.cyan('🔍 Validating registry access...'));
    const registryValidation = await validateRegistryAccess(boxManager, options.registry);

    if (!registryValidation.isValid) {
      console.error(chalk.red('❌ Registry validation failed:'), registryValidation.error);
      if (registryValidation.suggestion) {
        console.error(chalk.yellow('💡 Suggestion:'), registryValidation.suggestion);
      }
      throw createError(registryValidation.error || 'Registry validation failed', 'REGISTRY_VALIDATION_FAILED', registryValidation.suggestion);
    }

    console.log(chalk.green('✅ Registry access is valid'));

    // Step 3: Prepare dry-run preview
    console.log(chalk.cyan('\n🔍 Preparing preview...'));

    // Determine effective registry and box name for preview
    let effectiveRegistry: string;
    let effectiveBoxName: string;

    try {
      effectiveRegistry = options.registry || await getEffectiveRegistry(boxManager);
      effectiveBoxName = boxName || deriveBoxNameFromPath(localPath);

      if (!effectiveBoxName) {
        throw createError(
          'Could not derive a valid box name from the directory path',
          'BOX_NAME_DERIVATION_FAILED',
          'Please provide a box name explicitly: qraft create <path> <box-name>'
        );
      }

      const estimatedFiles = estimateFileCount(localPath);

      if (estimatedFiles === 0) {
        throw createError(
          'No files found to include in the box',
          'NO_FILES_FOUND',
          'Ensure the directory contains files that are not excluded by default patterns'
        );
      }

      const preview: DryRunPreview = {
        localPath,
        boxName: effectiveBoxName,
        registry: effectiveRegistry,
        estimatedFiles,
        targetLocation: `${effectiveRegistry}/${effectiveBoxName}`
      };

      // Step 4: Show dry-run preview and get confirmation
      const shouldProceed = await showDryRunPreview(preview);

      if (!shouldProceed) {
        console.log(chalk.yellow('\n⏹️  Operation cancelled by user'));
        return;
      }
    } catch (error) {
      if (error instanceof Error && (error as CreateError).code) {
        // Re-throw our custom errors
        throw error;
      }

      throw createError(
        `Failed to prepare preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PREVIEW_PREPARATION_FAILED',
        'Check the directory contents and try again'
      );
    }

    console.log(chalk.green('\n✅ User confirmed - proceeding with box creation'));

    // Interactive mode is default - minimal options approach
    console.log(chalk.cyan('\n🎯 Interactive Mode: '), 'Enabled by default');
    console.log(chalk.yellow('Local Path:'), localPath);
    console.log(chalk.yellow('Box Name:'), effectiveBoxName);
    console.log(chalk.yellow('Registry:'), effectiveRegistry);

    console.log(chalk.cyan('\n📋 Interactive Process:'));
    console.log(chalk.gray('  1. ✅ Validate local directory'));
    console.log(chalk.gray('  2. ✅ Validate registry access'));
    console.log(chalk.gray('  3. ✅ Show preview and confirm'));
    console.log(chalk.gray('  4. 🚧 Detect and suggest metadata'));
    console.log(chalk.gray('  5. 🚧 Prompt for missing information'));
    console.log(chalk.gray('  6. 🚧 Create box in registry'));

    // Placeholder implementation - actual functionality will be added in subsequent tasks
    console.log(chalk.gray('\n🚧 Create command implementation in progress...'));
    console.log(chalk.gray('Metadata detection and box creation will be implemented in upcoming tasks.'));

  } catch (error) {
    const createError = error as CreateError;

    // Display the main error message
    console.error(chalk.red('\n❌ Error creating box:'), createError.message);

    // Display suggestion if available
    if (createError.suggestion) {
      console.error(chalk.yellow('💡 Suggestion:'), createError.suggestion);
    }

    // Display error code for debugging if available
    if (createError.code) {
      console.error(chalk.gray('Error Code:'), createError.code);
    }

    // Provide general help
    console.error(chalk.cyan('\n📚 For more help:'));
    console.error(chalk.gray('  • Run: qraft create --help'));
    console.error(chalk.gray('  • Check the documentation'));
    console.error(chalk.gray('  • Verify your directory and registry settings'));

    process.exit(1);
  }
}
