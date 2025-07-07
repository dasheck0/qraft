import chalk from 'chalk';
import inquirer from 'inquirer';
import { BoxInfo } from '../types';

/**
 * Interactive prompt utilities for the unbox CLI
 */
export class InteractivePrompts {
  
  /**
   * Prompt for box selection from a list of available boxes
   * @param boxes Array of available boxes
   * @param registryName Name of the registry
   * @returns Promise<BoxInfo | null> Selected box or null if cancelled
   */
  async selectBox(boxes: BoxInfo[], registryName?: string): Promise<BoxInfo | null> {
    if (boxes.length === 0) {
      console.log(chalk.yellow('No boxes available in this registry.'));
      return null;
    }

    const choices = boxes.map(box => ({
      name: `${chalk.cyan(box.manifest.name)} ${chalk.gray(`(${box.manifest.version})`)} - ${box.manifest.description}`,
      value: box,
      short: box.manifest.name
    }));

    choices.push({
      name: chalk.gray('Cancel'),
      value: null as any,
      short: 'Cancel'
    });

    const { selectedBox } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedBox',
        message: `Select a box${registryName ? ` from ${chalk.yellow(registryName)}` : ''}:`,
        choices,
        pageSize: 10
      }
    ]);

    return selectedBox;
  }

  /**
   * Prompt for registry selection from available registries
   * @param registries Array of registry information
   * @returns Promise<string | null> Selected registry name or null if cancelled
   */
  async selectRegistry(registries: Array<{ name: string; repository: string; isDefault: boolean }>): Promise<string | null> {
    if (registries.length === 0) {
      console.log(chalk.yellow('No registries configured.'));
      return null;
    }

    const choices = registries.map(registry => ({
      name: `${chalk.cyan(registry.name)} ${registry.isDefault ? chalk.green('(default)') : ''} - ${chalk.gray(registry.repository)}`,
      value: registry.name,
      short: registry.name
    }));

    choices.push({
      name: chalk.gray('Cancel'),
      value: null as any,
      short: 'Cancel'
    });

    const { selectedRegistry } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedRegistry',
        message: 'Select a registry:',
        choices,
        pageSize: 10
      }
    ]);

    return selectedRegistry;
  }

  /**
   * Prompt for target directory with validation
   * @param defaultPath Default target directory
   * @returns Promise<string> Target directory path
   */
  async promptTargetDirectory(defaultPath: string = process.cwd()): Promise<string> {
    const { targetDirectory } = await inquirer.prompt([
      {
        type: 'input',
        name: 'targetDirectory',
        message: 'Target directory:',
        default: defaultPath,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Target directory cannot be empty';
          }
          return true;
        }
      }
    ]);

    return targetDirectory;
  }

  /**
   * Prompt for confirmation with customizable message
   * @param message Confirmation message
   * @param defaultValue Default value (true/false)
   * @returns Promise<boolean> User confirmation
   */
  async confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue
      }
    ]);

    return confirmed;
  }

  /**
   * Prompt for overwrite confirmation with file details
   * @param filePaths Array of file paths that would be overwritten
   * @returns Promise<boolean> Whether to overwrite files
   */
  async confirmOverwrite(filePaths: string[]): Promise<boolean> {
    if (filePaths.length === 0) {
      return true;
    }

    console.log(chalk.yellow('\n⚠️  The following files already exist:'));
    filePaths.slice(0, 10).forEach(file => {
      console.log(chalk.gray(`   • ${file}`));
    });

    if (filePaths.length > 10) {
      console.log(chalk.gray(`   ... and ${filePaths.length - 10} more files`));
    }

    return this.confirm('Do you want to overwrite these files?', false);
  }

  /**
   * Prompt for GitHub token input with validation
   * @param registryName Optional registry name for context
   * @returns Promise<string> GitHub token
   */
  async promptGitHubToken(registryName?: string): Promise<string> {
    console.log(chalk.blue.bold('🔐 GitHub Authentication Setup\n'));
    
    if (registryName) {
      console.log(chalk.gray(`Setting up authentication for registry: ${chalk.cyan(registryName)}\n`));
    }
    
    console.log(chalk.gray('To access private repositories and increase rate limits,'));
    console.log(chalk.gray('you need a GitHub Personal Access Token.\n'));
    console.log(chalk.gray('Create one at: https://github.com/settings/tokens\n'));
    console.log(chalk.gray('Required permissions:'));
    console.log(chalk.gray('  • repo (for private repositories)'));
    console.log(chalk.gray('  • public_repo (for public repositories)\n'));

    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Enter your GitHub token:',
        mask: '*',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Token cannot be empty';
          }
          if (input.length < 10) {
            return 'Token seems too short (should be 40+ characters)';
          }
          return true;
        }
      }
    ]);

    return token;
  }

  /**
   * Prompt for registry configuration
   * @returns Promise<{name: string, repository: string, setAsDefault: boolean}> Registry configuration
   */
  async promptRegistryConfig(): Promise<{ name: string; repository: string; setAsDefault: boolean }> {
    console.log(chalk.blue.bold('📁 Add New Registry\n'));
    console.log(chalk.gray('Configure a new GitHub repository as a template registry.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Registry name (e.g., "my-templates"):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Registry name cannot be empty';
          }
          if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
            return 'Registry name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'repository',
        message: 'GitHub repository (e.g., "username/repo-name"):',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Repository cannot be empty';
          }
          if (!/^[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+$/.test(input)) {
            return 'Repository must be in format "username/repo-name"';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'setAsDefault',
        message: 'Set as default registry?',
        default: false
      }
    ]);

    return answers;
  }

  /**
   * Display box preview with manifest information
   * @param boxInfo Box information to preview
   */
  async previewBox(boxInfo: BoxInfo): Promise<void> {
    console.log(chalk.blue.bold(`\n📦 ${boxInfo.manifest.name} Preview\n`));
    
    // Basic information
    console.log(chalk.yellow('Basic Information:'));
    console.log(`  Name: ${chalk.cyan(boxInfo.manifest.name)}`);
    console.log(`  Version: ${chalk.gray(boxInfo.manifest.version)}`);
    console.log(`  Description: ${boxInfo.manifest.description}`);
    
    if (boxInfo.manifest.author) {
      console.log(`  Author: ${chalk.gray(boxInfo.manifest.author)}`);
    }
    
    if (boxInfo.manifest.tags && boxInfo.manifest.tags.length > 0) {
      console.log(`  Tags: ${chalk.gray(boxInfo.manifest.tags.join(', '))}`);
    }

    // Files information
    console.log(chalk.yellow('\nFiles:'));
    console.log(`  Total files: ${chalk.cyan(boxInfo.files.length)}`);
    
    if (boxInfo.files.length > 0) {
      console.log(`  Sample files:`);
      boxInfo.files.slice(0, 5).forEach(file => {
        console.log(`    ${chalk.gray('•')} ${file}`);
      });
      
      if (boxInfo.files.length > 5) {
        console.log(`    ${chalk.gray(`... and ${boxInfo.files.length - 5} more files`)}`);
      }
    }

    // Exclusions
    if (boxInfo.manifest.exclude && boxInfo.manifest.exclude.length > 0) {
      console.log(chalk.yellow('\nExcluded patterns:'));
      boxInfo.manifest.exclude.forEach(pattern => {
        console.log(`  ${chalk.gray('•')} ${pattern}`);
      });
    }

    // Post-install steps
    if (boxInfo.manifest.postInstall && boxInfo.manifest.postInstall.length > 0) {
      console.log(chalk.yellow('\nPost-installation steps:'));
      boxInfo.manifest.postInstall.forEach((step, index) => {
        console.log(`  ${chalk.gray(`${index + 1}.`)} ${step}`);
      });
    }

    console.log(); // Empty line for spacing
  }

  /**
   * Prompt for search/filter input
   * @param placeholder Placeholder text for the search
   * @returns Promise<string> Search query
   */
  async promptSearch(placeholder: string = 'Search boxes...'): Promise<string> {
    const { searchQuery } = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchQuery',
        message: placeholder,
        default: ''
      }
    ]);

    return searchQuery.trim();
  }

  /**
   * Show a loading spinner with message
   * @param message Loading message
   * @param promise Promise to wait for
   * @returns Promise result
   */
  async withSpinner<T>(message: string, promise: Promise<T>): Promise<T> {
    // For now, just show the message and wait
    // In the future, we could add a proper spinner library
    console.log(chalk.blue(`⏳ ${message}...`));
    return promise;
  }
}
