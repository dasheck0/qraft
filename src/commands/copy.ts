import chalk from 'chalk';
import inquirer from 'inquirer';
import * as path from 'path';
import { BoxManager } from '../core/boxManager';
import { InteractiveMode } from '../interactive/interactiveMode';
import { BoxOperationConfig } from '../types';

interface CopyOptions {
  target?: string;
  force?: boolean;
  registry?: string;
  interactive?: boolean;
  noSync?: boolean;
}

export async function copyCommand(
  boxManager: BoxManager,
  boxName: string,
  options: CopyOptions
): Promise<void> {
  try {
    // Use interactive mode if requested
    if (options.interactive) {
      const interactiveMode = new InteractiveMode(boxManager);
      const copyOptions: { registry?: string; target?: string; force?: boolean; noSync?: boolean } = {};
      if (options.registry !== undefined) copyOptions.registry = options.registry;
      if (options.target !== undefined) copyOptions.target = options.target;
      if (options.force !== undefined) copyOptions.force = options.force;
      if (options.noSync !== undefined) copyOptions.noSync = options.noSync;

      const result = await interactiveMode.copyBox(boxName, copyOptions);

      if (!result.success) {
        process.exit(1);
      }
      return;
    }

    // Non-interactive mode (existing logic)
    // Parse box reference to validate it exists
    const boxRef = await boxManager.parseBoxReference(boxName, options.registry);

    // Check if box exists
    const boxExists = await boxManager.boxExists(boxRef);
    if (!boxExists) {
      console.error(chalk.red('❌ Box not found:'), boxName);

      if (options.registry) {
        console.error(chalk.gray(`   Registry: ${options.registry}`));
      }

      console.error(chalk.gray('\nAvailable boxes:'));
      console.error(chalk.cyan('  qraft list'));
      process.exit(1);
    }
    
    // Get box information
    const boxInfo = await boxManager.getBoxInfo(boxRef);
    if (!boxInfo) {
      console.error(chalk.red('❌ Failed to get box information'));
      process.exit(1);
    }
    
    console.log(chalk.blue.bold(`\n📦 Copying ${boxInfo.manifest.name}`));
    console.log(chalk.gray(`   ${boxInfo.manifest.description}`));
    console.log(chalk.gray(`   Version: ${boxInfo.manifest.version}`));
    console.log(chalk.gray(`   Files: ${boxInfo.files.length}`));
    
    // Determine target directory - respect defaultTarget from manifest if no explicit target provided
    let targetDirectory = options.target || boxInfo.manifest.defaultTarget || process.cwd();
    
    // Interactive mode
    if (options.interactive) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'targetDirectory',
          message: 'Target directory:',
          default: targetDirectory,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Target directory cannot be empty';
            }
            return true;
          }
        },
        {
          type: 'confirm',
          name: 'force',
          message: 'Overwrite existing files?',
          default: options.force || false,
          when: () => !options.force
        }
      ]);
      
      targetDirectory = answers.targetDirectory;
      options.force = answers.force || options.force;
    }
    
    // Resolve target directory
    targetDirectory = path.resolve(targetDirectory);
    
    console.log(chalk.gray(`\n📁 Target: ${targetDirectory}`));
    
    // Confirm if not in force mode and not interactive
    if (!options.force && !options.interactive) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Copy ${boxInfo.files.length} files to ${targetDirectory}?`,
          default: true
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('❌ Operation cancelled'));
        return;
      }
    }
    
    // Prepare configuration
    const config: BoxOperationConfig = {
      boxName,
      targetDirectory,
      force: options.force || false,
      interactive: options.interactive || false,
      boxesDirectory: '', // Not used for GitHub mode
      noSync: options.noSync || false
    };
    
    // Show progress
    console.log(chalk.blue('\n⏳ Copying files...'));
    
    // Copy the box
    const result = await boxManager.copyBox(config, options.registry);
    
    if (result.success) {
      console.log(chalk.green.bold('\n✅ Success!'));
      console.log(chalk.gray(`   Copied ${result.copiedFiles?.length || 0} files`));
      
      if (result.skippedFiles && result.skippedFiles.length > 0) {
        console.log(chalk.yellow(`   Skipped ${result.skippedFiles.length} existing files`));
        
        if (process.env.QRAFT_VERBOSE) {
          console.log(chalk.gray('\n   Skipped files:'));
          result.skippedFiles.forEach(file => {
            console.log(chalk.gray(`     • ${path.relative(targetDirectory, file)}`));
          });
        }
      }

      if (result.copiedFiles && result.copiedFiles.length > 0 && process.env.QRAFT_VERBOSE) {
        console.log(chalk.gray('\n   Copied files:'));
        result.copiedFiles.forEach(file => {
          console.log(chalk.gray(`     • ${path.relative(targetDirectory, file)}`));
        });
      }
      
      console.log(chalk.gray(`\n📁 Files copied to: ${targetDirectory}`));

      // Show sync tracking status
      if (config.noSync) {
        console.log(chalk.yellow('ℹ️  No sync tracking (use without --no-sync to enable updates)'));
      } else {
        console.log(chalk.green('📦 Box tracking enabled in .qraft/ directory'));
      }

      // Show next steps if available in manifest
      if (boxInfo.manifest.postInstall) {
        console.log(chalk.blue.bold('\n📋 Next Steps:'));
        boxInfo.manifest.postInstall.forEach((step, index) => {
          console.log(chalk.gray(`   ${index + 1}. ${step}`));
        });
      }
      
    } else {
      console.error(chalk.red.bold('\n❌ Failed to copy box'));
      console.error(chalk.red(result.message));
      
      if (result.error && process.env.QRAFT_VERBOSE) {
        console.error(chalk.gray('\nError details:'));
        console.error(chalk.gray(result.error.message));
      }

      process.exit(1);
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication failed')) {
      console.error(chalk.red('\n🔐 Authentication Error'));
      console.error(chalk.gray('This box requires authentication. Set up your GitHub token:'));
      console.error(chalk.cyan('  qraft auth login'));
    } else if (error instanceof Error && error.message.includes('rate limit')) {
      console.error(chalk.red('\n⏱️  Rate Limit Exceeded'));
      console.error(chalk.gray('GitHub API rate limit exceeded. Set up authentication:'));
      console.error(chalk.cyan('  qraft auth login'));
    } else {
      throw error;
    }
  }
}
