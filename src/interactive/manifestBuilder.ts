import chalk from 'chalk';
import inquirer from 'inquirer';
import { BoxMetadata } from '../core/metadataGenerator';
import { BoxManifest } from '../types';

export interface ManifestBuilderOptions {
  suggestedName?: string;
  suggestedDescription?: string;
  suggestedAuthor?: string | undefined;
  suggestedTags?: string[] | undefined;
  suggestedLanguage?: string | undefined;
  suggestedFramework?: string | undefined;
  suggestedFeatures?: string[] | undefined;
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

    // Step 2: Categorization
    console.log(chalk.yellow('\n🏷️  Categorization'));
    
    const categorizationAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'language',
        message: 'Primary programming language:',
        default: options.suggestedLanguage || generatedMetadata.language || '',
      },
      {
        type: 'input',
        name: 'framework',
        message: 'Framework or technology stack:',
        default: options.suggestedFramework || generatedMetadata.framework || '',
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        default: (options.suggestedTags || generatedMetadata.tags || []).join(', '),
        filter: (input: string) => input.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
      }
    ]);

    // Step 3: Features and Usage
    console.log(chalk.yellow('\n✨ Features and Usage'));
    
    const featuresAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'features',
        message: 'Key features (comma-separated):',
        default: (options.suggestedFeatures || generatedMetadata.keywords || []).join(', '),
        filter: (input: string) => input.split(',').map(feature => feature.trim()).filter(feature => feature.length > 0)
      },
      {
        type: 'input',
        name: 'defaultTarget',
        message: 'Default target directory:',
        default: options.defaultTarget || './target',
      },
      {
        type: 'editor',
        name: 'usage',
        message: 'Usage instructions (opens editor):',
        default: this.generateDefaultUsage(basicAnswers.name),
        when: () => this.hasEditor()
      },
      {
        type: 'input',
        name: 'usageSimple',
        message: 'Usage instructions (one line):',
        default: `Run 'qraft copy ${basicAnswers.name}' to use this box`,
        when: () => !this.hasEditor()
      }
    ]);

    // Step 4: Advanced Options
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
      defaultTarget: featuresAnswers.defaultTarget || './target',
      language: categorizationAnswers.language || undefined,
      framework: categorizationAnswers.framework || undefined,
      tags: categorizationAnswers.tags.length > 0 ? categorizationAnswers.tags : undefined,
      features: featuresAnswers.features.length > 0 ? featuresAnswers.features : undefined,
      usage: featuresAnswers.usage || featuresAnswers.usageSimple || undefined,
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
      const language = options.suggestedLanguage || generatedMetadata.language;
      if (language) manifest.language = language;

      const framework = options.suggestedFramework || generatedMetadata.framework;
      if (framework) manifest.framework = framework;

      const tags = options.suggestedTags || generatedMetadata.tags;
      if (tags && tags.length > 0) manifest.tags = tags;

      const features = options.suggestedFeatures || generatedMetadata.keywords;
      if (features && features.length > 0) manifest.features = features;

      return manifest;
    }

    // If user doesn't want defaults, fall back to full interactive mode
    return this.buildManifest(generatedMetadata, options);
  }

  /**
   * Generate default usage instructions
   */
  private generateDefaultUsage(boxName: string): string {
    return `# Usage

To use this box:

1. Copy the box to your project:
   \`\`\`bash
   qraft copy ${boxName}
   \`\`\`

2. Follow any post-installation steps if provided

3. Customize the files to fit your needs

For more information, see the documentation.`;
  }

  /**
   * Check if editor is available
   */
  private hasEditor(): boolean {
    return !!(process.env.EDITOR || process.env.VISUAL);
  }
}
