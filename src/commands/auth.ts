import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { BoxManager } from '../core/boxManager';

export function authCommand(boxManager: BoxManager): Command {
  const auth = new Command('auth');

  // Login - set global token
  auth
    .command('login')
    .description('Set up GitHub authentication')
    .option('-t, --token <token>', 'GitHub personal access token')
    .action(async (options) => {
      try {
        let token = options.token;
        
        if (!token) {
          console.log(chalk.blue.bold('🔐 GitHub Authentication Setup\n'));
          console.log(chalk.gray('To access private repositories and increase rate limits,'));
          console.log(chalk.gray('you need a GitHub Personal Access Token.\n'));
          console.log(chalk.gray('Create one at: https://github.com/settings/tokens\n'));
          console.log(chalk.gray('Required permissions:'));
          console.log(chalk.gray('  • repo (for private repositories)'));
          console.log(chalk.gray('  • public_repo (for public repositories)\n'));
          
          const { inputToken } = await inquirer.prompt([
            {
              type: 'password',
              name: 'inputToken',
              message: 'Enter your GitHub token:',
              mask: '*',
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'Token cannot be empty';
                }
                if (input.length < 10) {
                  return 'Token seems too short';
                }
                return true;
              }
            }
          ]);
          
          token = inputToken;
        }
        
        // Test the token
        console.log(chalk.blue('\n⏳ Testing authentication...'));
        
        await boxManager.setGlobalToken(token);
        
        // Test with default registry
        const defaultRegistry = await boxManager.getDefaultRegistry();
        const authResult = await boxManager.testAuthentication(defaultRegistry);
        
        if (authResult.authenticated) {
          console.log(chalk.green.bold('\n✅ Authentication successful!'));
          console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
          console.log(chalk.gray('   Global token has been saved.'));
        } else {
          console.error(chalk.red.bold('\n❌ Authentication failed'));
          console.error(chalk.red(`   Error: ${authResult.error}`));
          console.error(chalk.gray('\nPlease check your token and try again.'));
          process.exit(1);
        }
        
      } catch (error) {
        console.error(chalk.red('Error setting up authentication:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Set token for specific registry
  auth
    .command('token')
    .description('Set authentication token for a specific registry')
    .option('-r, --registry <registry>', 'registry name (required)')
    .option('-t, --token <token>', 'GitHub personal access token')
    .action(async (options) => {
      try {
        if (!options.registry) {
          console.error(chalk.red('Error: Registry name is required'));
          console.error(chalk.gray('Use: unbox auth token --registry <name> --token <token>'));
          process.exit(1);
        }
        
        let token = options.token;
        
        if (!token) {
          const { inputToken } = await inquirer.prompt([
            {
              type: 'password',
              name: 'inputToken',
              message: `Enter GitHub token for registry "${options.registry}":`,
              mask: '*',
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'Token cannot be empty';
                }
                return true;
              }
            }
          ]);
          
          token = inputToken;
        }
        
        // Test the token
        console.log(chalk.blue('\n⏳ Testing authentication...'));
        
        await boxManager.setRegistryToken(options.registry, token);
        const authResult = await boxManager.testAuthentication(options.registry);
        
        if (authResult.authenticated) {
          console.log(chalk.green.bold('\n✅ Authentication successful!'));
          console.log(chalk.gray(`   Registry: ${options.registry}`));
          console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
        } else {
          console.error(chalk.red.bold('\n❌ Authentication failed'));
          console.error(chalk.red(`   Error: ${authResult.error}`));
          process.exit(1);
        }
        
      } catch (error) {
        console.error(chalk.red('Error setting registry token:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Test authentication
  auth
    .command('test')
    .description('Test authentication for registries')
    .option('-r, --registry <registry>', 'test specific registry')
    .option('--all', 'test all registries')
    .action(async (options) => {
      try {
        if (options.all) {
          console.log(chalk.blue.bold('🔐 Testing Authentication for All Registries\n'));
          
          const registries = await boxManager.listRegistries();
          
          for (const registry of registries) {
            console.log(chalk.yellow(`Testing ${registry.name}...`));
            
            const hasAuth = await boxManager.hasAuthentication(registry.name);
            if (!hasAuth) {
              console.log(chalk.gray('  No authentication configured'));
              continue;
            }
            
            const authResult = await boxManager.testAuthentication(registry.name);
            
            if (authResult.authenticated) {
              console.log(chalk.green(`  ✅ Authenticated as: ${authResult.user}`));
            } else {
              console.log(chalk.red(`  ❌ Failed: ${authResult.error}`));
            }
          }
          
        } else if (options.registry) {
          console.log(chalk.blue.bold(`🔐 Testing Authentication for ${options.registry}\n`));
          
          const hasAuth = await boxManager.hasAuthentication(options.registry);
          if (!hasAuth) {
            console.log(chalk.yellow('No authentication configured for this registry'));
            console.log(chalk.gray('Set up authentication:'));
            console.log(chalk.cyan(`  unbox auth token --registry ${options.registry}`));
            return;
          }
          
          const authResult = await boxManager.testAuthentication(options.registry);
          
          if (authResult.authenticated) {
            console.log(chalk.green.bold('✅ Authentication successful!'));
            console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
          } else {
            console.log(chalk.red.bold('❌ Authentication failed'));
            console.log(chalk.red(`   Error: ${authResult.error}`));
            process.exit(1);
          }
          
        } else {
          // Test default registry
          const defaultRegistry = await boxManager.getDefaultRegistry();
          console.log(chalk.blue.bold(`🔐 Testing Authentication for ${defaultRegistry} (default)\n`));
          
          const hasAuth = await boxManager.hasAuthentication(defaultRegistry);
          if (!hasAuth) {
            console.log(chalk.yellow('No authentication configured'));
            console.log(chalk.gray('Set up authentication:'));
            console.log(chalk.cyan('  unbox auth login'));
            return;
          }
          
          const authResult = await boxManager.testAuthentication(defaultRegistry);
          
          if (authResult.authenticated) {
            console.log(chalk.green.bold('✅ Authentication successful!'));
            console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
          } else {
            console.log(chalk.red.bold('❌ Authentication failed'));
            console.log(chalk.red(`   Error: ${authResult.error}`));
            process.exit(1);
          }
        }
        
      } catch (error) {
        console.error(chalk.red('Error testing authentication:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Show authentication status
  auth
    .command('status')
    .description('Show authentication status for all registries')
    .action(async () => {
      try {
        console.log(chalk.blue.bold('🔐 Authentication Status\n'));
        
        const registries = await boxManager.listRegistries();
        
        for (const registry of registries) {
          console.log(chalk.yellow.bold(`${registry.name}:`));
          
          const hasAuth = await boxManager.hasAuthentication(registry.name);
          
          if (hasAuth) {
            console.log(chalk.green('  ✅ Token configured'));
            
            try {
              const authResult = await boxManager.testAuthentication(registry.name);
              if (authResult.authenticated) {
                console.log(chalk.gray(`     Authenticated as: ${authResult.user}`));
              } else {
                console.log(chalk.red(`     ❌ Token invalid: ${authResult.error}`));
              }
            } catch (error) {
              console.log(chalk.red('     ❌ Failed to test token'));
            }
          } else {
            console.log(chalk.gray('  ❌ No token configured'));
          }
          
          if (registry.isDefault) {
            console.log(chalk.green('     (default registry)'));
          }
          
          console.log();
        }
        
      } catch (error) {
        console.error(chalk.red('Error checking authentication status:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return auth;
}
