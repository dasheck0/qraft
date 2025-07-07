import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { BoxManager } from '../core/boxManager';
import { BoxOperationConfig, BoxOperationResult } from '../types';
import { InteractiveBoxSelector } from './boxSelector';
import { InteractivePrompts } from './prompts';

/**
 * Interactive mode manager for all CLI operations
 */
export class InteractiveMode {
  private boxManager: BoxManager;
  private prompts: InteractivePrompts;
  private boxSelector: InteractiveBoxSelector;

  constructor(boxManager: BoxManager) {
    this.boxManager = boxManager;
    this.prompts = new InteractivePrompts();
    this.boxSelector = new InteractiveBoxSelector(boxManager);
  }

  /**
   * Interactive box copying workflow
   * @param boxName Optional box name to start with
   * @param options Initial options
   * @returns Promise<BoxOperationResult> Result of the operation
   */
  async copyBox(boxName?: string, options: {
    registry?: string;
    target?: string;
    force?: boolean;
  } = {}): Promise<BoxOperationResult> {
    try {
      console.log(chalk.blue.bold('📦 Interactive Box Copy\n'));

      // Step 1: Select box if not provided
      let selectedBox;
      let selectedRegistry = options.registry;

      if (boxName) {
        // Parse and validate provided box name
        try {
          const boxRef = await this.boxManager.parseBoxReference(boxName, options.registry);
          const boxInfo = await this.boxManager.getBoxInfo(boxRef);
          
          if (!boxInfo) {
            console.log(chalk.red(`❌ Box '${boxName}' not found.`));
            
            const tryInteractive = await this.prompts.confirm('Would you like to browse available boxes instead?', true);
            if (!tryInteractive) {
              return {
                success: false,
                message: `Box '${boxName}' not found`,
                error: new Error(`Box '${boxName}' does not exist`)
              };
            }
            
            const selection = await this.boxSelector.selectBox(options.registry);
            if (!selection) {
              return {
                success: false,
                message: 'Operation cancelled by user'
              };
            }
            
            selectedBox = selection.box;
            selectedRegistry = selection.registry;
          } else {
            selectedBox = boxInfo;
            selectedRegistry = boxRef.registry;
            
            // Show preview and confirm
            await this.prompts.previewBox(selectedBox);
            const confirmed = await this.prompts.confirm(`Copy ${selectedBox.manifest.name}?`, true);
            if (!confirmed) {
              return {
                success: false,
                message: 'Operation cancelled by user'
              };
            }
          }
        } catch (error) {
          console.error(chalk.red('❌ Error finding box:'), error instanceof Error ? error.message : 'Unknown error');
          
          const tryInteractive = await this.prompts.confirm('Would you like to browse available boxes instead?', true);
          if (!tryInteractive) {
            return {
              success: false,
              message: 'Box lookup failed',
              error: error instanceof Error ? error : new Error('Unknown error')
            };
          }
          
          const selection = await this.boxSelector.selectBox(options.registry);
          if (!selection) {
            return {
              success: false,
              message: 'Operation cancelled by user'
            };
          }
          
          selectedBox = selection.box;
          selectedRegistry = selection.registry;
        }
      } else {
        // Interactive box selection
        const selection = await this.boxSelector.selectBox(options.registry);
        if (!selection) {
          return {
            success: false,
            message: 'Operation cancelled by user'
          };
        }
        
        selectedBox = selection.box;
        selectedRegistry = selection.registry;
      }

      // Step 2: Configure target directory
      let targetDirectory = options.target || selectedBox.manifest.defaultTarget || process.cwd();
      
      if (!options.target) {
        targetDirectory = await this.prompts.promptTargetDirectory(targetDirectory);
      }
      
      targetDirectory = path.resolve(targetDirectory);

      // Step 3: Check for existing files and handle overwrites
      let forceOverwrite = options.force || false;
      
      if (!forceOverwrite) {
        const existingFiles = await this.checkExistingFiles(selectedBox.files, targetDirectory);
        
        if (existingFiles.length > 0) {
          forceOverwrite = await this.prompts.confirmOverwrite(existingFiles);
          if (!forceOverwrite) {
            return {
              success: false,
              message: 'Operation cancelled - files would be overwritten'
            };
          }
        }
      }

      // Step 4: Show summary and final confirmation
      console.log(chalk.blue.bold('\n📋 Copy Summary:'));
      console.log(`  Box: ${chalk.cyan(selectedBox.manifest.name)} ${chalk.gray(`(${selectedBox.manifest.version})`)}`);
      console.log(`  Registry: ${chalk.yellow(selectedRegistry)}`);
      console.log(`  Target: ${chalk.gray(targetDirectory)}`);
      console.log(`  Files: ${chalk.cyan(selectedBox.files.length)} files`);
      console.log(`  Overwrite: ${forceOverwrite ? chalk.red('Yes') : chalk.green('No')}`);

      const finalConfirm = await this.prompts.confirm('\nProceed with copy operation?', true);
      if (!finalConfirm) {
        return {
          success: false,
          message: 'Operation cancelled by user'
        };
      }

      // Step 5: Perform the copy operation
      console.log(chalk.blue('\n⏳ Copying files...'));

      const config: BoxOperationConfig = {
        boxName: selectedBox.manifest.name,
        targetDirectory,
        force: forceOverwrite,
        interactive: true,
        boxesDirectory: '' // Not used for GitHub mode
      };

      const result = await this.boxManager.copyBox(config, selectedRegistry);

      // Step 6: Show results
      if (result.success) {
        console.log(chalk.green.bold('\n✅ Copy completed successfully!'));
        console.log(chalk.gray(`   Copied ${result.copiedFiles?.length || 0} files`));
        
        if (result.skippedFiles && result.skippedFiles.length > 0) {
          console.log(chalk.yellow(`   Skipped ${result.skippedFiles.length} existing files`));
        }

        // Show post-install steps if available
        if (selectedBox.manifest.postInstall && selectedBox.manifest.postInstall.length > 0) {
          console.log(chalk.blue.bold('\n📋 Next Steps:'));
          selectedBox.manifest.postInstall.forEach((step, index) => {
            console.log(chalk.gray(`   ${index + 1}. ${step}`));
          });
        }

        console.log(chalk.gray(`\n📁 Files copied to: ${targetDirectory}`));
      } else {
        console.error(chalk.red.bold('\n❌ Copy failed'));
        console.error(chalk.red(result.message));
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('❌ Unexpected error during copy operation:'), errorMessage);
      
      return {
        success: false,
        message: `Copy operation failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Interactive list boxes workflow
   * @param registryName Optional registry to list from
   */
  async listBoxes(registryName?: string): Promise<void> {
    try {
      console.log(chalk.blue.bold('📦 Interactive Box Browser\n'));

      // Select registry if not provided
      let selectedRegistry = registryName;
      
      if (!selectedRegistry) {
        const registries = await this.boxManager.listRegistries();
        
        if (registries.length === 0) {
          console.log(chalk.red('❌ No registries configured.'));
          console.log(chalk.gray('Add a registry first:'));
          console.log(chalk.cyan('  unbox config add-registry <name> <repository>'));
          return;
        }

        if (registries.length === 1) {
          selectedRegistry = registries[0].name;
          console.log(chalk.gray(`Using registry: ${chalk.cyan(selectedRegistry)}`));
        } else {
          const registrySelection = await this.prompts.selectRegistry(registries);
          if (!registrySelection) {
            console.log(chalk.yellow('Operation cancelled.'));
            return;
          }
          selectedRegistry = registrySelection;
        }
      }

      // Use the interactive box selector for browsing
      const selection = await this.boxSelector.selectBox(selectedRegistry);
      
      if (selection) {
        console.log(chalk.green(`\nSelected: ${chalk.cyan(selection.box.manifest.name)} from ${chalk.yellow(selection.registry)}`));
        
        const copyNow = await this.prompts.confirm('Would you like to copy this box now?', false);
        if (copyNow) {
          await this.copyBox(selection.box.manifest.name, { registry: selection.registry });
        }
      } else {
        console.log(chalk.yellow('No box selected.'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error browsing boxes:'), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Interactive authentication setup
   * @param registryName Optional specific registry
   */
  async setupAuthentication(registryName?: string): Promise<void> {
    try {
      if (registryName) {
        // Set up authentication for specific registry
        const token = await this.prompts.promptGitHubToken(registryName);
        
        console.log(chalk.blue('\n⏳ Testing authentication...'));
        await this.boxManager.setRegistryToken(registryName, token);
        
        const authResult = await this.boxManager.testAuthentication(registryName);
        
        if (authResult.authenticated) {
          console.log(chalk.green.bold('\n✅ Authentication successful!'));
          console.log(chalk.gray(`   Registry: ${registryName}`));
          console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
        } else {
          console.error(chalk.red.bold('\n❌ Authentication failed'));
          console.error(chalk.red(`   Error: ${authResult.error}`));
        }
      } else {
        // Set up global authentication
        const token = await this.prompts.promptGitHubToken();
        
        console.log(chalk.blue('\n⏳ Testing authentication...'));
        await this.boxManager.setGlobalToken(token);
        
        const defaultRegistry = await this.boxManager.getDefaultRegistry();
        const authResult = await this.boxManager.testAuthentication(defaultRegistry);
        
        if (authResult.authenticated) {
          console.log(chalk.green.bold('\n✅ Authentication successful!'));
          console.log(chalk.gray(`   Authenticated as: ${authResult.user}`));
          console.log(chalk.gray('   Global token has been saved.'));
        } else {
          console.error(chalk.red.bold('\n❌ Authentication failed'));
          console.error(chalk.red(`   Error: ${authResult.error}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error setting up authentication:'), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Interactive registry configuration
   */
  async configureRegistry(): Promise<void> {
    try {
      const config = await this.prompts.promptRegistryConfig();
      
      console.log(chalk.blue('\n⏳ Adding registry...'));
      
      await this.boxManager.getConfigManager().addRegistry(config.name, {
        name: config.name,
        repository: config.repository
      });
      
      if (config.setAsDefault) {
        await this.boxManager.getConfigManager().setDefaultRegistry(config.name);
      }
      
      console.log(chalk.green.bold('\n✅ Registry added successfully!'));
      console.log(chalk.gray(`   Name: ${config.name}`));
      console.log(chalk.gray(`   Repository: ${config.repository}`));
      
      if (config.setAsDefault) {
        console.log(chalk.gray('   Set as default registry'));
      }
      
      // Ask if they want to set up authentication
      const setupAuth = await this.prompts.confirm('Would you like to set up authentication for this registry?', false);
      if (setupAuth) {
        await this.setupAuthentication(config.name);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Error configuring registry:'), error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check for existing files that would be overwritten
   * @param files Array of file paths relative to target
   * @param targetDirectory Target directory
   * @returns Promise<string[]> Array of existing file paths
   */
  private async checkExistingFiles(files: string[], targetDirectory: string): Promise<string[]> {
    const existingFiles: string[] = [];
    
    for (const file of files) {
      const fullPath = path.join(targetDirectory, file);
      if (await fs.pathExists(fullPath)) {
        existingFiles.push(fullPath);
      }
    }
    
    return existingFiles;
  }
}
