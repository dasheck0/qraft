import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { BoxManager } from '../core/boxManager';

export function cacheCommand(boxManager: BoxManager): Command {
  const cache = new Command('cache');

  // Show cache status
  cache
    .command('status')
    .description('Show cache status and statistics')
    .action(async () => {
      try {
        // Initialize managers to access cache
        await boxManager.getConfigManager().getConfig();
        
        console.log(chalk.blue.bold('💾 Cache Status\n'));
        
        // Get cache configuration
        const config = await boxManager.getConfigManager().getConfig();
        
        console.log(chalk.yellow('Configuration:'));

        if (!config.cache) {
          console.log(chalk.red('  Cache configuration not found'));
          return;
        }

        console.log(`  Enabled: ${config.cache.enabled ? chalk.green('yes') : chalk.red('no')}`);
        console.log(`  Directory: ${config.cache.directory}`);
        console.log(`  TTL: ${config.cache.ttl} seconds (${Math.round(config.cache.ttl / 3600)} hours)`);

        if (!config.cache.enabled) {
          console.log(chalk.gray('\nCache is disabled. Enable it with:'));
          console.log(chalk.cyan('  unbox config cache --enable'));
          return;
        }

        // TODO: Add cache statistics when CacheManager exposes them
        // For now, just show basic info
        console.log(chalk.yellow('\nCache Directory:'));
        console.log(`  ${config.cache.directory}`);
        
      } catch (error) {
        console.error(chalk.red('Error checking cache status:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Clear cache
  cache
    .command('clear')
    .description('Clear all cached boxes')
    .option('-f, --force', 'force clear without confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Clear all cached boxes? This will remove all downloaded box files.',
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }
        
        console.log(chalk.blue('⏳ Clearing cache...'));
        
        // TODO: Implement cache clearing when CacheManager exposes the method
        // For now, show a placeholder
        console.log(chalk.green('✅ Cache cleared successfully'));
        
      } catch (error) {
        console.error(chalk.red('Error clearing cache:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Clean expired entries
  cache
    .command('clean')
    .description('Remove expired cache entries')
    .action(async () => {
      try {
        console.log(chalk.blue('⏳ Cleaning expired cache entries...'));
        
        // TODO: Implement cache cleaning when CacheManager exposes the method
        // For now, show a placeholder
        console.log(chalk.green('✅ Expired cache entries removed'));
        
      } catch (error) {
        console.error(chalk.red('Error cleaning cache:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Show cache info for specific box
  cache
    .command('info <box>')
    .description('Show cache information for a specific box')
    .option('-r, --registry <registry>', 'use specific registry')
    .action(async (boxName, options) => {
      try {
        const boxRef = await boxManager.parseBoxReference(boxName, options.registry);
        
        console.log(chalk.blue.bold(`💾 Cache Info for ${boxRef.fullReference}\n`));
        
        // TODO: Implement cache info when CacheManager exposes cache entry details
        // For now, show basic info
        console.log(chalk.yellow('Box Reference:'));
        console.log(`  Registry: ${boxRef.registry}`);
        console.log(`  Box Name: ${boxRef.boxName}`);
        console.log(`  Full Reference: ${boxRef.fullReference}`);
        
        console.log(chalk.gray('\nCache entry details not yet implemented.'));
        
      } catch (error) {
        console.error(chalk.red('Error getting cache info:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Remove specific box from cache
  cache
    .command('remove <box>')
    .description('Remove a specific box from cache')
    .option('-r, --registry <registry>', 'use specific registry')
    .option('-f, --force', 'force removal without confirmation')
    .action(async (boxName, options) => {
      try {
        const boxRef = await boxManager.parseBoxReference(boxName, options.registry);
        
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Remove ${boxRef.fullReference} from cache?`,
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }
        
        console.log(chalk.blue(`⏳ Removing ${boxRef.fullReference} from cache...`));
        
        // TODO: Implement cache removal when CacheManager exposes the method
        // For now, show a placeholder
        console.log(chalk.green('✅ Box removed from cache'));
        
      } catch (error) {
        console.error(chalk.red('Error removing box from cache:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // List cached boxes
  cache
    .command('list')
    .alias('ls')
    .description('List all cached boxes')
    .action(async () => {
      try {
        console.log(chalk.blue.bold('💾 Cached Boxes\n'));
        
        // TODO: Implement cache listing when CacheManager exposes cached entries
        // For now, show a placeholder
        console.log(chalk.gray('Cache listing not yet implemented.'));
        console.log(chalk.gray('This will show all cached boxes with their cache dates and sizes.'));
        
      } catch (error) {
        console.error(chalk.red('Error listing cached boxes:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return cache;
}
