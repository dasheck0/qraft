#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { copyCommand } from './commands/copy';
import { createCommand } from './commands/create';
import { listCommand } from './commands/list';
import { updateCommand } from './commands/update';
import { BoxManager } from './core/boxManager';
import { ConfigManager } from './utils/config';

const program = new Command();

// Global configuration
const configManager = new ConfigManager();
const boxManager = new BoxManager(configManager);

program
  .name('qraft')
  .description('A CLI tool to qraft structured project setups from GitHub template repositories')
  .version('1.0.0')
  .option('-v, --verbose', 'enable verbose output')
  .option('-r, --registry <registry>', 'override default registry')
  .hook('preAction', (thisCommand) => {
    // Set global options
    const opts = thisCommand.opts();
    if (opts.verbose) {
      process.env.QRAFT_VERBOSE = 'true';
    }
  });

// List command - show available boxes
program
  .command('list')
  .alias('ls')
  .description('List available template boxes')
  .option('-r, --registry <registry>', 'list boxes from specific registry')
  .option('--all-registries', 'list boxes from all configured registries')
  .option('-i, --interactive', 'use interactive mode for browsing and selection')
  .action(async (options) => {
    try {
      await listCommand(boxManager, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Copy command - copy a box to target directory
program
  .command('copy <box>')
  .alias('cp')
  .description('Copy a template box to the current or specified directory')
  .option('-t, --target <directory>', 'target directory (default: current directory)')
  .option('-f, --force', 'force overwrite existing files')
  .option('-r, --registry <registry>', 'use specific registry')
  .option('-i, --interactive', 'interactive mode with prompts')
  .option('-n, --no-sync', 'skip creating .qraft directory (no sync tracking)')
  .action(async (boxName, options) => {
    try {
      await copyCommand(boxManager, boxName, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Create command - create a box from local directory
program
  .command('create <path> [box-name]')
  .description('Create a template box from a local directory')
  .option('--registry <registry>', 'use specific registry')
  .option('--no-interactive', 'disable interactive mode (use quick mode)')
  .option('--dry-run', 'show what would be created without actually creating')
  .action(async (...args) => {
    try {
      const [localPath, boxName, , command] = args;
      // Get options from the command object and parent (global options)
      const commandOptions = command.opts();
      const parentOptions = command.parent.opts();
      const allOptions = { ...parentOptions, ...commandOptions };

      // Handle case where boxName might be the options object if not provided
      if (typeof boxName === 'object' && boxName !== null) {
        // boxName was not provided, so boxName is actually the options object
        await createCommand(boxManager, localPath, undefined, allOptions);
      } else {
        // Both localPath and boxName provided
        await createCommand(boxManager, localPath, boxName, allOptions);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Update command - update an existing box
program
  .command('update <path>')
  .description('Update an existing template box from a local directory')
  .option('--registry <registry>', 'use specific registry')
  .option('--no-interactive', 'disable interactive mode (use quick mode)')
  .option('--dry-run', 'show what would be updated without actually updating')
  .option('--force', 'force update even if there are conflicts')
  .option('--skip-conflict-resolution', 'skip conflict resolution and proceed with update')
  .action(async (...args) => {
    try {
      const [localPath, , command] = args;
      // Get options from the command object and parent (global options)
      const commandOptions = command.opts();
      const parentOptions = command.parent.opts();
      const allOptions = { ...parentOptions, ...commandOptions };

      await updateCommand(boxManager, localPath, allOptions);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Config command - manage configuration
program.addCommand(configCommand(configManager, boxManager));

// Auth command - manage authentication
program.addCommand(authCommand(boxManager));

// Cache command - manage local cache
program.addCommand(cacheCommand(boxManager));

// Info command - show box information
program
  .command('info <box>')
  .description('Show detailed information about a template box')
  .option('-r, --registry <registry>', 'use specific registry')
  .action(async (boxName, options) => {
    try {
      const registry = options.registry || program.opts().registry;
      const boxRef = await boxManager.parseBoxReference(boxName, registry);
      const boxInfo = await boxManager.getBoxInfo(boxRef);
      
      if (!boxInfo) {
        console.error(chalk.red('Box not found:'), boxName);
        process.exit(1);
      }

      console.log(chalk.blue.bold(`\n📦 ${boxInfo.manifest.name}`));
      console.log(chalk.gray(`Version: ${boxInfo.manifest.version}`));
      console.log(chalk.gray(`Description: ${boxInfo.manifest.description}`));
      
      if (boxInfo.manifest.author) {
        console.log(chalk.gray(`Author: ${boxInfo.manifest.author}`));
      }
      
      if (boxInfo.manifest.tags && boxInfo.manifest.tags.length > 0) {
        console.log(chalk.gray(`Tags: ${boxInfo.manifest.tags.join(', ')}`));
      }
      
      console.log(chalk.gray(`Files: ${boxInfo.files.length} files`));
      
      if (boxInfo.manifest.exclude && boxInfo.manifest.exclude.length > 0) {
        console.log(chalk.gray(`Excludes: ${boxInfo.manifest.exclude.join(', ')}`));
      }
      
      console.log();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Default action - show help if no command provided
program.action(() => {
  program.help();
});

// Parse command line arguments
export async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Don't show error for help or version commands
    if (error instanceof Error && (error.message.includes('(outputHelp)') || error.message.includes('(outputVersion)'))) {
      process.exit(0);
    }
    console.error(chalk.red('Unexpected error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
}

export { boxManager, configManager, program };

