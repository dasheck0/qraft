import chalk from 'chalk';
import * as readline from 'readline';

export interface MetadataPromptOptions {
  name?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  framework?: string | undefined;
  language?: string | undefined;
  version?: string | undefined;
  author?: string | undefined;
  license?: string | undefined;
  repository?: string | undefined;
  homepage?: string | undefined;
  keywords?: string[] | undefined;
  private?: boolean | undefined;
}

export interface DetectedDefaults {
  name?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  framework?: string | undefined;
  language?: string | undefined;
  version?: string | undefined;
  author?: string | undefined;
  license?: string | undefined;
  repository?: string | undefined;
  homepage?: string | undefined;
  keywords?: string[] | undefined;
  packageManager?: string | undefined;
  hasTests?: boolean | undefined;
  hasDocs?: boolean | undefined;
}

export interface PromptResult {
  metadata: MetadataPromptOptions;
  userModified: string[];
  skipped: string[];
}

export class MetadataPrompter {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async promptForMetadata(
    detectedDefaults: DetectedDefaults,
    options: { 
      interactive?: boolean;
      skipOptional?: boolean;
      acceptDefaults?: boolean;
    } = {}
  ): Promise<PromptResult> {
    const { interactive = true, skipOptional = false, acceptDefaults = false } = options;
    
    if (!interactive || acceptDefaults) {
      return this.useDefaults(detectedDefaults);
    }

    console.log(chalk.cyan('\n🔧 Interactive Metadata Configuration'));
    console.log(chalk.gray('Press Enter to accept defaults, or type new values\n'));

    const metadata: MetadataPromptOptions = {};
    const userModified: string[] = [];
    const skipped: string[] = [];

    try {
      // Required fields
      metadata.name = await this.promptField(
        'Box Name',
        detectedDefaults.name,
        true,
        'A unique name for your box (e.g., react-typescript-starter)'
      );
      if (metadata.name !== detectedDefaults.name) userModified.push('name');

      metadata.description = await this.promptField(
        'Description',
        detectedDefaults.description,
        false,
        'Brief description of what this box provides'
      );
      if (metadata.description !== detectedDefaults.description) userModified.push('description');

      metadata.language = await this.promptField(
        'Primary Language',
        detectedDefaults.language,
        true,
        'Main programming language (e.g., TypeScript, JavaScript, Python)'
      );
      if (metadata.language !== detectedDefaults.language) userModified.push('language');

      // Framework (optional but important)
      if (detectedDefaults.framework && detectedDefaults.framework !== 'none') {
        metadata.framework = await this.promptField(
          'Framework',
          detectedDefaults.framework,
          false,
          'Framework or library used (e.g., React, Vue, Express)'
        );
        if (metadata.framework !== detectedDefaults.framework) userModified.push('framework');
      }

      // Tags
      const defaultTags = detectedDefaults.tags?.join(', ') || '';
      const tagsInput = await this.promptField(
        'Tags',
        defaultTags,
        false,
        'Comma-separated tags (e.g., frontend, typescript, react)'
      );
      if (tagsInput) {
        metadata.tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        if (JSON.stringify(metadata.tags) !== JSON.stringify(detectedDefaults.tags)) {
          userModified.push('tags');
        }
      }

      // Optional fields (only if not skipping)
      if (!skipOptional) {
        console.log(chalk.yellow('\n📋 Optional Information (press Enter to skip)'));

        metadata.version = await this.promptField(
          'Version',
          detectedDefaults.version || '1.0.0',
          false,
          'Semantic version (e.g., 1.0.0)'
        );
        if (metadata.version !== (detectedDefaults.version || '1.0.0')) userModified.push('version');

        metadata.author = await this.promptField(
          'Author',
          detectedDefaults.author,
          false,
          'Author name or organization'
        );
        if (metadata.author !== detectedDefaults.author) userModified.push('author');

        metadata.license = await this.promptField(
          'License',
          detectedDefaults.license || 'MIT',
          false,
          'License type (e.g., MIT, Apache-2.0, GPL-3.0)'
        );
        if (metadata.license !== (detectedDefaults.license || 'MIT')) userModified.push('license');

        metadata.repository = await this.promptField(
          'Repository URL',
          detectedDefaults.repository,
          false,
          'Git repository URL (e.g., https://github.com/user/repo)'
        );
        if (metadata.repository !== detectedDefaults.repository) userModified.push('repository');

        metadata.homepage = await this.promptField(
          'Homepage URL',
          detectedDefaults.homepage,
          false,
          'Project homepage or documentation URL'
        );
        if (metadata.homepage !== detectedDefaults.homepage) userModified.push('homepage');

        const keywordsInput = await this.promptField(
          'Keywords',
          detectedDefaults.keywords?.join(', ') || '',
          false,
          'Search keywords (comma-separated)'
        );
        if (keywordsInput) {
          metadata.keywords = keywordsInput.split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
          if (JSON.stringify(metadata.keywords) !== JSON.stringify(detectedDefaults.keywords)) {
            userModified.push('keywords');
          }
        }

        const isPrivate = await this.promptBoolean(
          'Private Box',
          false,
          'Should this box be private? (y/N)'
        );
        metadata.private = isPrivate;
        if (isPrivate) userModified.push('private');
      }

      return { metadata, userModified, skipped };

    } finally {
      this.close();
    }
  }

  private async promptField(
    label: string,
    defaultValue?: string,
    required: boolean = false,
    hint?: string
  ): Promise<string> {
    const displayDefault = defaultValue ? chalk.gray(`(${defaultValue})`) : '';
    const requiredMark = required ? chalk.red('*') : '';
    const hintText = hint ? chalk.gray(`\n  ${hint}`) : '';
    
    while (true) {
      const answer = await this.question(
        `${chalk.cyan(label)}${requiredMark} ${displayDefault}: ${hintText}\n> `
      );

      const value = answer.trim() || defaultValue || '';

      if (required && !value) {
        console.log(chalk.red(`❌ ${label} is required`));
        continue;
      }

      return value;
    }
  }

  private async promptBoolean(
    label: string,
    defaultValue: boolean,
    prompt: string
  ): Promise<boolean> {
    const answer = await this.question(`${chalk.cyan(label)} ${prompt}: `);
    const input = answer.trim().toLowerCase();
    
    if (!input) return defaultValue;
    
    return input === 'y' || input === 'yes' || input === 'true';
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  private useDefaults(detectedDefaults: DetectedDefaults): PromptResult {
    const metadata: MetadataPromptOptions = {
      name: detectedDefaults.name,
      description: detectedDefaults.description,
      language: detectedDefaults.language,
      framework: detectedDefaults.framework !== 'none' ? detectedDefaults.framework : undefined,
      tags: detectedDefaults.tags,
      version: detectedDefaults.version || '1.0.0',
      author: detectedDefaults.author,
      license: detectedDefaults.license || 'MIT',
      repository: detectedDefaults.repository,
      homepage: detectedDefaults.homepage,
      keywords: detectedDefaults.keywords,
      private: false
    };

    return {
      metadata,
      userModified: [],
      skipped: []
    };
  }

  async confirmMetadata(metadata: MetadataPromptOptions): Promise<boolean> {
    console.log(chalk.cyan('\n📋 Metadata Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (metadata.name) console.log(`${chalk.yellow('Name:')} ${metadata.name}`);
    if (metadata.description) console.log(`${chalk.yellow('Description:')} ${metadata.description}`);
    if (metadata.language) console.log(`${chalk.yellow('Language:')} ${metadata.language}`);
    if (metadata.framework) console.log(`${chalk.yellow('Framework:')} ${metadata.framework}`);
    if (metadata.tags?.length) console.log(`${chalk.yellow('Tags:')} ${metadata.tags.join(', ')}`);
    if (metadata.version) console.log(`${chalk.yellow('Version:')} ${metadata.version}`);
    if (metadata.author) console.log(`${chalk.yellow('Author:')} ${metadata.author}`);
    if (metadata.license) console.log(`${chalk.yellow('License:')} ${metadata.license}`);
    if (metadata.repository) console.log(`${chalk.yellow('Repository:')} ${metadata.repository}`);
    if (metadata.homepage) console.log(`${chalk.yellow('Homepage:')} ${metadata.homepage}`);
    if (metadata.keywords?.length) console.log(`${chalk.yellow('Keywords:')} ${metadata.keywords.join(', ')}`);
    if (metadata.private) console.log(`${chalk.yellow('Private:')} Yes`);
    
    console.log(chalk.gray('─'.repeat(50)));
    
    const answer = await this.question(chalk.white('Does this look correct? (Y/n): '));
    const confirmed = !answer.trim() || answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
    
    this.close();
    return confirmed;
  }

  close(): void {
    this.rl.close();
  }

  // Validate metadata fields
  static validateMetadata(metadata: MetadataPromptOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!metadata.name || metadata.name.trim().length === 0) {
      errors.push('Box name is required');
    } else if (!/^[a-z0-9-_]+$/i.test(metadata.name)) {
      errors.push('Box name can only contain letters, numbers, hyphens, and underscores');
    }

    if (!metadata.language || metadata.language.trim().length === 0) {
      errors.push('Primary language is required');
    }

    // Optional field validation
    if (metadata.version && !/^\d+\.\d+\.\d+/.test(metadata.version)) {
      errors.push('Version should follow semantic versioning (e.g., 1.0.0)');
    }

    if (metadata.repository && !metadata.repository.startsWith('http')) {
      errors.push('Repository URL should start with http:// or https://');
    }

    if (metadata.homepage && !metadata.homepage.startsWith('http')) {
      errors.push('Homepage URL should start with http:// or https://');
    }

    if (metadata.tags && metadata.tags.length > 20) {
      errors.push('Maximum 20 tags allowed');
    }

    if (metadata.keywords && metadata.keywords.length > 50) {
      errors.push('Maximum 50 keywords allowed');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Generate metadata suggestions based on detected defaults
  static generateSuggestions(detectedDefaults: DetectedDefaults): string[] {
    const suggestions: string[] = [];

    if (detectedDefaults.hasTests) {
      suggestions.push('Consider adding "testing" to your tags');
    }

    if (detectedDefaults.hasDocs) {
      suggestions.push('Consider adding "documentation" to your tags');
    }

    if (detectedDefaults.packageManager) {
      suggestions.push(`Detected ${detectedDefaults.packageManager} - consider adding to keywords`);
    }

    if (detectedDefaults.framework && detectedDefaults.framework !== 'none') {
      suggestions.push(`Framework detected: ${detectedDefaults.framework} - ensure it's in your tags`);
    }

    if (!detectedDefaults.description) {
      suggestions.push('Consider adding a description to help users understand your box');
    }

    if (!detectedDefaults.license) {
      suggestions.push('Consider specifying a license (MIT is common for open source)');
    }

    return suggestions;
  }
}
