#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { copyCommand } from './commands/copy';
import { listCommand } from './commands/list';
import { BoxManager } from './core/boxManager';
import { ConfigManager } from './utils/config';

const program = new Command();

// Global configuration
const configManager = new ConfigManager();
const boxManager = new BoxManager(configManager);

program
  .name('unbox')
  .description('A CLI tool to unbox pre-configured template files into projects')
  .version('1.0.0')
  .option('-v, --verbose', 'enable verbose output')
  .option('-r, --registry <registry>', 'override default registry')
  .hook('preAction', (thisCommand) => {
    // Set global options
    const opts = thisCommand.opts();
    if (opts.verbose) {
      process.env.UNBOX_VERBOSE = 'true';
    }
  });

// List command - show available boxes
program
  .command('list')
  .alias('ls')
  .description('List available template boxes')
  .option('-r, --registry <registry>', 'list boxes from specific registry')
  .option('--all-registries', 'list boxes from all configured registries')
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
  .action(async (boxName, options) => {
    try {
      await copyCommand(boxManager, boxName, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Config command - manage configuration
program.addCommand(configCommand(configManager));

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

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }
  console.error(chalk.red('CLI Error:'), err.message);
  process.exit(1);
});

// Parse command line arguments
export async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red('Unexpected error:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main();
}

export { boxManager, configManager, program };

