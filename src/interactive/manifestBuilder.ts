import chalk from 'chalk';
import inquirer from 'inquirer';
import { BoxMetadata } from '../core/metadataGenerator';
import { BoxManifest } from '../types';

export interface ManifestBuilderOptions {
  suggestedName?: string;
  suggestedDescription?: string;
  suggestedAuthor?: string | undefined;
  suggestedTags?: string[] | undefined;
  defaultTarget?: string;
}

export class ManifestBuilder {
  /**
   * Interactive manifest building process
   */
  async buildManifest(
    generatedMetadata: BoxMetadata,
    options: ManifestBuilderOptions = {}
  ): Promise<BoxManifest> {
    console.log(chalk.cyan('\n🔧 Interactive Manifest Builder'));
    console.log(chalk.gray('Let\'s gather information for your box manifest. Press Enter to use defaults.\n'));

    // Step 1: Basic Information
    console.log(chalk.yellow('📦 Basic Information'));
    
    const basicAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Box name:',
        default: options.suggestedName || generatedMetadata.name,
        validate: (input: string) => {
          if (!input.trim()) return 'Box name is required';
          if (!/^[a-z0-9-_]+$/.test(input)) return 'Box name must contain only lowercase letters, numbers, hyphens, and underscores';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: options.suggestedDescription || generatedMetadata.description,
        validate: (input: string) => input.trim() ? true : 'Description is required'
      },
      {
        type: 'input',
        name: 'author',
        message: 'Author:',
        default: options.suggestedAuthor || generatedMetadata.author || 'Unknown',
        validate: (input: string) => input.trim() ? true : 'Author is required'
      },
      {
        type: 'input',
        name: 'version',
        message: 'Version:',
        default: generatedMetadata.version || '1.0.0',
        validate: (input: string) => {
          if (!input.trim()) return 'Version is required';
          if (!/^\d+\.\d+\.\d+/.test(input)) return 'Version must follow semantic versioning (e.g., 1.0.0)';
          return true;
        }
      }
    ]);

    // Step 2: Tags and Configuration
    console.log(chalk.yellow('\n🏷️  Tags and Configuration'));

    const configAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        default: (options.suggestedTags || generatedMetadata.tags || []).join(', '),
        filter: (input: string) => input.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
      },
      {
        type: 'input',
        name: 'defaultTarget',
        message: 'Default target directory:',
        default: options.defaultTarget || './target',
      }
    ]);

    // Step 3: Advanced Options
    console.log(chalk.yellow('\n⚙️  Advanced Options'));
    
    const advancedAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addExclusions',
        message: 'Add file exclusions?',
        default: false
      },
      {
        type: 'input',
        name: 'exclude',
        message: 'Files to exclude (comma-separated patterns):',
        when: (answers) => answers.addExclusions,
        default: '*.log, .env, node_modules/**',
        filter: (input: string) => input.split(',').map(pattern => pattern.trim()).filter(pattern => pattern.length > 0)
      },
      {
        type: 'confirm',
        name: 'addPostInstall',
        message: 'Add post-installation steps?',
        default: false
      },
      {
        type: 'input',
        name: 'postInstall',
        message: 'Post-installation steps (comma-separated):',
        when: (answers) => answers.addPostInstall,
        default: 'npm install, Review configuration files',
        filter: (input: string) => input.split(',').map(step => step.trim()).filter(step => step.length > 0)
      }
    ]);

    // Build the final manifest
    const manifest: BoxManifest = {
      name: basicAnswers.name,
      description: basicAnswers.description,
      author: basicAnswers.author,
      version: basicAnswers.version,
      defaultTarget: configAnswers.defaultTarget || './target',
      tags: configAnswers.tags.length > 0 ? configAnswers.tags : undefined,
      exclude: advancedAnswers.exclude || undefined,
      postInstall: advancedAnswers.postInstall || undefined
    };

    // Show preview
    console.log(chalk.cyan('\n📋 Manifest Preview:'));
    console.log(chalk.gray(JSON.stringify(manifest, null, 2)));

    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Does this look correct?',
        default: true
      }
    ]);

    if (!confirmAnswer.confirm) {
      console.log(chalk.yellow('\n🔄 Let\'s try again...'));
      return this.buildManifest(generatedMetadata, options);
    }

    return manifest;
  }

  /**
   * Quick manifest building with minimal prompts
   */
  async buildQuickManifest(
    generatedMetadata: BoxMetadata,
    options: ManifestBuilderOptions = {}
  ): Promise<BoxManifest> {
    console.log(chalk.cyan('\n⚡ Quick Manifest Builder'));
    console.log(chalk.gray('Essential information only. Use --interactive for full options.\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Box name:',
        default: options.suggestedName || generatedMetadata.name,
        validate: (input: string) => {
          if (!input.trim()) return 'Box name is required';
          if (!/^[a-z0-9-_]+$/.test(input)) return 'Box name must contain only lowercase letters, numbers, hyphens, and underscores';
          return true;
        }
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: options.suggestedDescription || generatedMetadata.description,
        validate: (input: string) => input.trim() ? true : 'Description is required'
      },
      {
        type: 'confirm',
        name: 'useDefaults',
        message: 'Use smart defaults for other fields?',
        default: true
      }
    ]);

    if (answers.useDefaults) {
      const manifest: BoxManifest = {
        name: answers.name,
        description: answers.description,
        author: options.suggestedAuthor || generatedMetadata.author || 'Unknown',
        version: generatedMetadata.version || '1.0.0',
        defaultTarget: options.defaultTarget || './target'
      };

      // Add optional properties only if they have values
      const tags = options.suggestedTags || generatedMetadata.tags;
      if (tags && tags.length > 0) manifest.tags = tags;

      return manifest;
    }

    // If user doesn't want defaults, fall back to full interactive mode
    return this.buildManifest(generatedMetadata, options);
  }




}
