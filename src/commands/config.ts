import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { BoxManager } from '../core/boxManager';
import { InteractiveMode } from '../interactive/interactiveMode';
import { ConfigManager } from '../utils/config';

export function configCommand(configManager: ConfigManager, boxManager?: BoxManager): Command {
  const config = new Command('config');

  // Show current configuration
  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'output as JSON')
    .action(async (options) => {
      try {
        const currentConfig = await configManager.getConfig();
        
        if (options.json) {
          console.log(JSON.stringify(currentConfig, null, 2));
          return;
        }
        
        console.log(chalk.blue.bold('📋 Current Configuration\n'));
        
        // Default registry
        console.log(chalk.yellow('Default Registry:'));
        console.log(`  ${currentConfig.defaultRegistry}\n`);
        
        // Registries
        console.log(chalk.yellow('Configured Registries:'));
        Object.entries(currentConfig.registries).forEach(([name, registry]) => {
          console.log(`  ${chalk.cyan('•')} ${chalk.white.bold(name)}`);
          console.log(`    Repository: ${registry.repository}`);
          console.log(`    Base URL: ${registry.baseUrl || 'https://api.github.com'}`);
          console.log(`    Token: ${registry.token ? chalk.green('✓ configured') : chalk.gray('not set')}`);
          if (name === currentConfig.defaultRegistry) {
            console.log(`    ${chalk.green('(default)')}`);
          }
          console.log();
        });
        
        // Global token
        console.log(chalk.yellow('Global Token:'));
        console.log(`  ${currentConfig.globalToken ? chalk.green('✓ configured') : chalk.gray('not set')}\n`);
        
        // Cache settings
        console.log(chalk.yellow('Cache Settings:'));
        if (currentConfig.cache) {
          console.log(`  Enabled: ${currentConfig.cache.enabled ? chalk.green('yes') : chalk.red('no')}`);
          console.log(`  Directory: ${currentConfig.cache.directory}`);
          console.log(`  TTL: ${currentConfig.cache.ttl} seconds`);
        } else {
          console.log(chalk.red('  Cache configuration not found'));
        }
        
      } catch (error) {
        console.error(chalk.red('Error reading configuration:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Add registry
  config
    .command('add-registry [name] [repository]')
    .description('Add a new registry')
    .option('--base-url <url>', 'GitHub API base URL (default: https://api.github.com)')
    .option('--token <token>', 'GitHub token for this registry')
    .option('--default', 'set as default registry')
    .option('-i, --interactive', 'use interactive mode')
    .action(async (name, repository, options) => {
      try {
        // Use interactive mode if requested or if name/repository not provided
        if (options.interactive || !name || !repository) {
          if (boxManager) {
            const interactiveMode = new InteractiveMode(boxManager);
            await interactiveMode.configureRegistry();
            return;
          } else {
            console.error(chalk.red('Interactive mode not available - BoxManager not provided'));
            process.exit(1);
          }
        }

        // Non-interactive mode
        await configManager.addRegistry(name, {
          name,
          repository,
          baseUrl: options.baseUrl,
          token: options.token
        });

        if (options.default) {
          await configManager.setDefaultRegistry(name);
        }

        console.log(chalk.green('✅ Registry added successfully'));
        console.log(chalk.gray(`   Name: ${name}`));
        console.log(chalk.gray(`   Repository: ${repository}`));

        if (options.default) {
          console.log(chalk.gray('   Set as default registry'));
        }

      } catch (error) {
        console.error(chalk.red('Error adding registry:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Remove registry
  config
    .command('remove-registry <name>')
    .description('Remove a registry')
    .option('-f, --force', 'force removal without confirmation')
    .action(async (name, options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Remove registry "${name}"?`,
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }
        
        await configManager.removeRegistry(name);
        console.log(chalk.green('✅ Registry removed successfully'));
        
      } catch (error) {
        console.error(chalk.red('Error removing registry:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Set default registry
  config
    .command('set-default <name>')
    .description('Set default registry')
    .action(async (name) => {
      try {
        await configManager.setDefaultRegistry(name);
        console.log(chalk.green('✅ Default registry updated'));
        console.log(chalk.gray(`   Default registry: ${name}`));
        
      } catch (error) {
        console.error(chalk.red('Error setting default registry:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Cache settings
  config
    .command('cache')
    .description('Configure cache settings')
    .option('--enable', 'enable cache')
    .option('--disable', 'disable cache')
    .option('--directory <dir>', 'set cache directory')
    .option('--ttl <seconds>', 'set cache TTL in seconds')
    .action(async (options) => {
      try {
        const updates: any = {};
        
        if (options.enable) {
          updates.enabled = true;
        }
        
        if (options.disable) {
          updates.enabled = false;
        }
        
        if (options.directory) {
          updates.directory = options.directory;
        }
        
        if (options.ttl) {
          const ttl = parseInt(options.ttl, 10);
          if (isNaN(ttl) || ttl < 0) {
            console.error(chalk.red('Error: TTL must be a positive number'));
            process.exit(1);
          }
          updates.ttl = ttl;
        }
        
        if (Object.keys(updates).length === 0) {
          console.error(chalk.red('Error: No cache settings specified'));
          console.error(chalk.gray('Use --enable, --disable, --directory, or --ttl'));
          process.exit(1);
        }
        
        await configManager.updateCacheConfig(updates);
        console.log(chalk.green('✅ Cache settings updated'));
        
        Object.entries(updates).forEach(([key, value]) => {
          console.log(chalk.gray(`   ${key}: ${value}`));
        });
        
      } catch (error) {
        console.error(chalk.red('Error updating cache settings:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Reset configuration
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-f, --force', 'force reset without confirmation')
    .action(async (options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Reset all configuration to defaults? This will remove all registries and tokens.',
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('❌ Operation cancelled'));
            return;
          }
        }
        
        await configManager.resetConfig();
        console.log(chalk.green('✅ Configuration reset to defaults'));
        
      } catch (error) {
        console.error(chalk.red('Error resetting configuration:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return config;
}
