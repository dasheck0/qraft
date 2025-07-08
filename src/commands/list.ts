import chalk from 'chalk';
import { BoxManager } from '../core/boxManager';
import { InteractiveMode } from '../interactive/interactiveMode';

interface ListOptions {
  registry?: string;
  allRegistries?: boolean;
  interactive?: boolean;
}

export async function listCommand(boxManager: BoxManager, options: ListOptions): Promise<void> {
  // Use interactive mode if requested
  if (options.interactive) {
    const interactiveMode = new InteractiveMode(boxManager);
    await interactiveMode.listBoxes(options.registry);
    return;
  }

  // Non-interactive mode (existing logic)
  console.log(chalk.blue.bold('📦 Available Template Boxes\n'));

  try {
    if (options.allRegistries) {
      // List boxes from all registries
      const registries = await boxManager.listRegistries();
      
      for (const registry of registries) {
        console.log(chalk.yellow.bold(`\n📁 Registry: ${registry.name}`));
        console.log(chalk.gray(`   Repository: ${registry.repository}`));
        
        if (registry.isDefault) {
          console.log(chalk.green('   (default)'));
        }
        
        try {
          const boxes = await boxManager.listBoxes(registry.name);
          
          if (boxes.length === 0) {
            console.log(chalk.gray('   No boxes found'));
            continue;
          }
          
          boxes.forEach(box => {
            console.log(`   ${chalk.cyan('•')} ${chalk.white.bold(box.name)} ${chalk.gray(`(${box.version})`)}`);
            console.log(`     ${chalk.gray(box.description)}`);
          });
        } catch (error) {
          console.log(chalk.red(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    } else {
      // List boxes from specific or default registry
      const registryName = options.registry;
      
      if (registryName) {
        console.log(chalk.yellow(`Registry: ${registryName}\n`));
      } else {
        const defaultRegistry = await boxManager.getDefaultRegistry();
        console.log(chalk.yellow(`Registry: ${defaultRegistry} (default)\n`));
      }
      
      const boxes = await boxManager.listBoxes(registryName);
      
      if (boxes.length === 0) {
        console.log(chalk.gray('No boxes found in this registry.'));
        console.log(chalk.gray('Try running with --all-registries to see boxes from all registries.'));
        return;
      }
      
      // Group boxes by first letter for better organization
      const groupedBoxes = boxes.reduce((groups, box) => {
        const firstLetter = box.name.charAt(0).toLowerCase();
        if (!groups[firstLetter]) {
          groups[firstLetter] = [];
        }
        groups[firstLetter].push(box);
        return groups;
      }, {} as Record<string, typeof boxes>);
      
      // Display grouped boxes
      Object.keys(groupedBoxes).sort().forEach(letter => {
        console.log(chalk.blue.bold(`\n${letter.toUpperCase()}`));
        groupedBoxes[letter].forEach(box => {
          console.log(`  ${chalk.cyan('•')} ${chalk.white.bold(box.name)} ${chalk.gray(`(${box.version})`)}`);
          console.log(`    ${chalk.gray(box.description)}`);
        });
      });
    }
    
    console.log(chalk.gray('\nUse "qreate copy <box-name>" to copy a box to your project.'));
    console.log(chalk.gray('Use "qreate info <box-name>" to see detailed information about a box.'));
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication failed')) {
      console.error(chalk.red('\n🔐 Authentication Error'));
      console.error(chalk.gray('This registry requires authentication. Set up your GitHub token:'));
      console.error(chalk.cyan('  qreate auth login'));
      console.error(chalk.gray('Or set a token for this specific registry:'));
      console.error(chalk.cyan(`  qreate auth token --registry ${options.registry || 'default'} <your-token>`));
    } else if (error instanceof Error && error.message.includes('rate limit')) {
      console.error(chalk.red('\n⏱️  Rate Limit Exceeded'));
      console.error(chalk.gray('GitHub API rate limit exceeded. Set up authentication to increase limits:'));
      console.error(chalk.cyan('  qreate auth login'));
    } else {
      throw error;
    }
  }
}
