import chalk from 'chalk';
import inquirer from 'inquirer';
import { BoxManager } from '../core/boxManager';
import { BoxInfo } from '../types';
import { InteractivePrompts } from './prompts';

/**
 * Interactive box selector with search, filtering, and preview capabilities
 */
export class InteractiveBoxSelector {
  private boxManager: BoxManager;
  private prompts: InteractivePrompts;

  constructor(boxManager: BoxManager) {
    this.boxManager = boxManager;
    this.prompts = new InteractivePrompts();
  }

  /**
   * Interactive box selection with full features
   * @param registryName Optional specific registry to search
   * @returns Promise<{box: BoxInfo, registry: string} | null> Selected box and registry or null if cancelled
   */
  async selectBox(registryName?: string): Promise<{ box: BoxInfo; registry: string } | null> {
    try {
      // Step 1: Select registry if not specified
      let selectedRegistry = registryName;
      
      if (!selectedRegistry) {
        const registries = await this.boxManager.listRegistries();
        
        if (registries.length === 0) {
          console.log(chalk.red('❌ No registries configured.'));
          console.log(chalk.gray('Add a registry first:'));
          console.log(chalk.cyan('  qreate config add-registry <name> <repository>'));
          return null;
        }

        if (registries.length === 1) {
          selectedRegistry = registries[0].name;
          console.log(chalk.gray(`Using registry: ${chalk.cyan(selectedRegistry)}`));
        } else {
          const registrySelection = await this.prompts.selectRegistry(registries);
          if (!registrySelection) {
            return null; // User cancelled
          }
          selectedRegistry = registrySelection;
        }
      }

      // Step 2: Load boxes from selected registry
      console.log(chalk.blue(`\n📦 Loading boxes from ${chalk.cyan(selectedRegistry)}...`));
      
      let boxes: BoxInfo[];
      try {
        const boxList = await this.boxManager.listBoxes(selectedRegistry);
        boxes = await Promise.all(
          boxList.map(async (boxSummary) => {
            const boxRef = await this.boxManager.parseBoxReference(boxSummary.name, selectedRegistry);
            const boxInfo = await this.boxManager.getBoxInfo(boxRef);
            return boxInfo!;
          })
        );
      } catch (error) {
        console.error(chalk.red('❌ Failed to load boxes:'), error instanceof Error ? error.message : 'Unknown error');
        return null;
      }

      if (boxes.length === 0) {
        console.log(chalk.yellow('No boxes found in this registry.'));
        return null;
      }

      // Step 3: Interactive selection with search and preview
      return await this.interactiveSelection(boxes, selectedRegistry);

    } catch (error) {
      console.error(chalk.red('❌ Error during box selection:'), error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Interactive selection with search, filter, and preview
   * @param boxes Available boxes
   * @param registryName Registry name
   * @returns Promise<{box: BoxInfo, registry: string} | null> Selected box or null
   */
  private async interactiveSelection(boxes: BoxInfo[], registryName: string): Promise<{ box: BoxInfo; registry: string } | null> {
    let filteredBoxes = boxes;
    let searchQuery = '';

    while (true) {
      // Show current search status
      if (searchQuery) {
        console.log(chalk.gray(`\nFiltered by: "${searchQuery}" (${filteredBoxes.length}/${boxes.length} boxes)`));
      } else {
        console.log(chalk.gray(`\nShowing all boxes (${boxes.length} total)`));
      }

      // Create menu choices
      const choices: any[] = [];

      // Search option
      choices.push({
        name: searchQuery 
          ? `${chalk.blue('🔍 Search again')} ${chalk.gray(`(current: "${searchQuery}")`)}`
          : chalk.blue('🔍 Search boxes'),
        value: 'search',
        short: 'Search'
      });

      // Clear search if active
      if (searchQuery) {
        choices.push({
          name: chalk.yellow('🗑️  Clear search'),
          value: 'clear-search',
          short: 'Clear search'
        });
      }

      // Separator
      if (filteredBoxes.length > 0) {
        choices.push(new inquirer.Separator(chalk.gray('─ Available Boxes ─')));

        // Box choices
        filteredBoxes.forEach(box => {
          const tags = box.manifest.tags ? ` ${chalk.gray(`[${box.manifest.tags.join(', ')}]`)}` : '';
          choices.push({
            name: `${chalk.cyan(box.manifest.name)} ${chalk.gray(`(${box.manifest.version})`)}${tags}\n  ${chalk.gray(box.manifest.description)}`,
            value: { type: 'box', box },
            short: box.manifest.name
          });
        });
      } else {
        choices.push({
          name: chalk.gray('No boxes match your search'),
          value: 'no-results',
          disabled: true
        });
      }

      // Separator and actions
      choices.push(new inquirer.Separator());
      choices.push({
        name: chalk.gray('Cancel'),
        value: 'cancel',
        short: 'Cancel'
      });

      // Show selection prompt
      const { selection } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selection',
          message: `Select a box from ${chalk.cyan(registryName)}:`,
          choices,
          pageSize: 15
        }
      ]);

      // Handle selection
      if (selection === 'cancel') {
        return null;
      }

      if (selection === 'search') {
        searchQuery = await this.prompts.promptSearch('Enter search terms (name, description, tags):');
        filteredBoxes = this.filterBoxes(boxes, searchQuery);
        continue;
      }

      if (selection === 'clear-search') {
        searchQuery = '';
        filteredBoxes = boxes;
        continue;
      }

      if (selection === 'no-results') {
        continue;
      }

      if (selection.type === 'box') {
        // Show preview and confirm
        const confirmed = await this.previewAndConfirm(selection.box);
        if (confirmed) {
          return { box: selection.box, registry: registryName };
        }
        // If not confirmed, continue the loop to show selection again
        continue;
      }
    }
  }

  /**
   * Filter boxes based on search query
   * @param boxes All available boxes
   * @param query Search query
   * @returns Filtered boxes
   */
  private filterBoxes(boxes: BoxInfo[], query: string): BoxInfo[] {
    if (!query.trim()) {
      return boxes;
    }

    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    
    return boxes.filter(box => {
      const searchableText = [
        box.manifest.name,
        box.manifest.description,
        box.manifest.author || '',
        ...(box.manifest.tags || [])
      ].join(' ').toLowerCase();

      return searchTerms.every(term => searchableText.includes(term));
    });
  }

  /**
   * Show box preview and get confirmation
   * @param box Box to preview
   * @returns Promise<boolean> Whether user confirmed selection
   */
  private async previewAndConfirm(box: BoxInfo): Promise<boolean> {
    // Show preview
    await this.prompts.previewBox(box);

    // Get confirmation
    const choices = [
      {
        name: chalk.green('✅ Select this box'),
        value: true,
        short: 'Select'
      },
      {
        name: chalk.yellow('👀 Show file list'),
        value: 'show-files',
        short: 'Show files'
      },
      {
        name: chalk.gray('← Back to selection'),
        value: false,
        short: 'Back'
      }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices
      }
    ]);

    if (action === 'show-files') {
      // Show detailed file list
      console.log(chalk.blue.bold(`\n📁 Files in ${box.manifest.name}:\n`));
      
      box.files.forEach((file, index) => {
        console.log(`  ${chalk.gray(`${(index + 1).toString().padStart(3)}.`)} ${file}`);
      });

      console.log(chalk.gray(`\nTotal: ${box.files.length} files\n`));

      // Ask again after showing files
      return this.prompts.confirm('Select this box?', true);
    }

    return action;
  }

  /**
   * Quick box selection without full interactive features
   * @param registryName Optional registry name
   * @returns Promise<{box: BoxInfo, registry: string} | null> Selected box or null
   */
  async quickSelect(registryName?: string): Promise<{ box: BoxInfo; registry: string } | null> {
    try {
      // Get registry
      let selectedRegistry = registryName;
      
      if (!selectedRegistry) {
        const registries = await this.boxManager.listRegistries();
        if (registries.length === 1) {
          selectedRegistry = registries[0].name;
        } else {
          const registrySelection = await this.prompts.selectRegistry(registries);
          if (!registrySelection) return null;
          selectedRegistry = registrySelection;
        }
      }

      // Get boxes
      const boxList = await this.boxManager.listBoxes(selectedRegistry);
      const boxes = await Promise.all(
        boxList.map(async (boxSummary) => {
          const boxRef = await this.boxManager.parseBoxReference(boxSummary.name, selectedRegistry);
          return await this.boxManager.getBoxInfo(boxRef);
        })
      );

      const validBoxes = boxes.filter(box => box !== null) as BoxInfo[];
      
      if (validBoxes.length === 0) {
        console.log(chalk.yellow('No boxes available.'));
        return null;
      }

      // Simple selection
      const selectedBox = await this.prompts.selectBox(validBoxes, selectedRegistry);
      if (!selectedBox) return null;

      return { box: selectedBox, registry: selectedRegistry };

    } catch (error) {
      console.error(chalk.red('❌ Error during box selection:'), error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }
}
