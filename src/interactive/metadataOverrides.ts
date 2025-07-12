import chalk from 'chalk';
import * as path from 'path';
import { ConflictDetector } from '../analysis/conflictDetector';
import { ProjectAnalyzer } from '../analysis/projectAnalyzer';
import { SensitiveFileDetector } from '../analysis/sensitiveFileDetector';
import { MetadataPrompts } from './metadataPrompts';

export interface DetectedDefaults {
  name?: string;
  description?: string;
  language?: string;
  framework?: string;
  version?: string;
  license?: string;
  tags?: string[];
  keywords?: string[];
  author?: string;
  repository?: string;
  homepage?: string;
  bugs?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: string[];
  devDependencies?: string[];
  peerDependencies?: string[];
  engines?: Record<string, string>;
  confidence?: number;
  detectionSources?: string[];
}

export interface MetadataOverrideOptions {
  sourcePath: string;
  targetRepository?: string;
  targetBranch?: string;
  interactive?: boolean;
  skipSensitiveCheck?: boolean;
  skipConflictCheck?: boolean;
  forceDefaults?: boolean;
  customDefaults?: Partial<MetadataPromptOptions>;
}

export class MetadataOverrides {
  private readonly metadataPrompts: MetadataPrompts;
  private readonly projectAnalyzer: ProjectAnalyzer;
  private readonly sensitiveFileDetector: SensitiveFileDetector;
  private readonly conflictDetector: ConflictDetector;

  constructor() {
    this.metadataPrompts = new MetadataPrompts();
    this.projectAnalyzer = new ProjectAnalyzer();
    this.sensitiveFileDetector = new SensitiveFileDetector();
    this.conflictDetector = new ConflictDetector();
  }

  async collectMetadataWithDefaults(options: MetadataOverrideOptions): Promise<MetadataPromptOptions> {
    console.log(chalk.cyan('\n🔍 Analyzing project structure...'));
    
    // Detect project characteristics
    const detectedDefaults = await this.detectProjectDefaults(options.sourcePath);
    
    // Show detection summary
    this.showDetectionSummary(detectedDefaults);
    
    // Merge with custom defaults if provided
    const mergedDefaults = this.mergeDefaults(detectedDefaults, options.customDefaults);
    
    // Collect metadata with smart defaults
    let metadata: MetadataPromptOptions;
    
    if (options.interactive !== false) {
      console.log(chalk.cyan('\n📝 Collecting box metadata...'));
      console.log(chalk.gray('Press Enter to accept detected defaults, or type new values.'));
      
      metadata = await this.metadataPrompts.collectMetadata({
        name: mergedDefaults.name,
        description: mergedDefaults.description,
        language: mergedDefaults.language,
        framework: mergedDefaults.framework,
        version: mergedDefaults.version || '1.0.0',
        license: mergedDefaults.license || 'MIT',
        tags: mergedDefaults.tags || [],
        keywords: mergedDefaults.keywords || [],
        author: mergedDefaults.author,
        repository: mergedDefaults.repository,
        homepage: mergedDefaults.homepage,
        bugs: mergedDefaults.bugs,
        main: mergedDefaults.main,
        scripts: mergedDefaults.scripts,
        dependencies: mergedDefaults.dependencies,
        devDependencies: mergedDefaults.devDependencies,
        peerDependencies: mergedDefaults.peerDependencies,
        engines: mergedDefaults.engines
      });
    } else {
      // Use defaults without prompting
      metadata = this.createMetadataFromDefaults(mergedDefaults, options.sourcePath);
    }
    
    // Validate and enhance metadata
    return this.validateAndEnhanceMetadata(metadata, detectedDefaults);
  }

  private async detectProjectDefaults(sourcePath: string): Promise<DetectedDefaults> {
    const analysis = await this.projectAnalyzer.analyzeProject(sourcePath);
    const detectionSources: string[] = [];
    
    const defaults: DetectedDefaults = {
      detectionSources,
      confidence: 0
    };
    
    // Extract name from directory or package.json
    if (analysis.packageJson?.name) {
      defaults.name = analysis.packageJson.name;
      detectionSources.push('package.json');
    } else {
      defaults.name = path.basename(sourcePath);
      detectionSources.push('directory name');
    }
    
    // Extract description
    if (analysis.packageJson?.description) {
      defaults.description = analysis.packageJson.description;
      detectionSources.push('package.json');
    } else if (analysis.readme?.description) {
      defaults.description = analysis.readme.description;
      detectionSources.push('README.md');
    }
    
    // Detect language
    if (analysis.languages.length > 0) {
      defaults.language = analysis.languages[0].name;
      detectionSources.push(`file analysis (${analysis.languages[0].percentage}%)`);
    }
    
    // Detect framework
    if (analysis.frameworks.length > 0) {
      defaults.framework = analysis.frameworks[0].name;
      detectionSources.push(`dependency analysis`);
    }
    
    // Extract version
    if (analysis.packageJson?.version) {
      defaults.version = analysis.packageJson.version;
      detectionSources.push('package.json');
    }
    
    // Extract license
    if (analysis.packageJson?.license) {
      defaults.license = analysis.packageJson.license;
      detectionSources.push('package.json');
    } else if (analysis.license) {
      defaults.license = analysis.license;
      detectionSources.push('LICENSE file');
    }
    
    // Generate tags based on detected characteristics
    defaults.tags = this.generateTags(analysis);
    if (defaults.tags.length > 0) {
      detectionSources.push('project analysis');
    }
    
    // Generate keywords
    defaults.keywords = this.generateKeywords(analysis);
    if (defaults.keywords.length > 0) {
      detectionSources.push('project analysis');
    }
    
    // Extract author information
    if (analysis.packageJson?.author) {
      if (typeof analysis.packageJson.author === 'string') {
        defaults.author = analysis.packageJson.author;
      } else {
        defaults.author = analysis.packageJson.author.name;
      }
      detectionSources.push('package.json');
    }
    
    // Extract repository information
    if (analysis.packageJson?.repository) {
      if (typeof analysis.packageJson.repository === 'string') {
        defaults.repository = analysis.packageJson.repository;
      } else {
        defaults.repository = analysis.packageJson.repository.url;
      }
      detectionSources.push('package.json');
    }
    
    // Extract homepage
    if (analysis.packageJson?.homepage) {
      defaults.homepage = analysis.packageJson.homepage;
      detectionSources.push('package.json');
    }
    
    // Extract bugs URL
    if (analysis.packageJson?.bugs) {
      if (typeof analysis.packageJson.bugs === 'string') {
        defaults.bugs = analysis.packageJson.bugs;
      } else {
        defaults.bugs = analysis.packageJson.bugs.url;
      }
      detectionSources.push('package.json');
    }
    
    // Extract main entry point
    if (analysis.packageJson?.main) {
      defaults.main = analysis.packageJson.main;
      detectionSources.push('package.json');
    }
    
    // Extract scripts
    if (analysis.packageJson?.scripts) {
      defaults.scripts = analysis.packageJson.scripts;
      detectionSources.push('package.json');
    }
    
    // Extract dependencies
    if (analysis.packageJson?.dependencies) {
      defaults.dependencies = Object.keys(analysis.packageJson.dependencies);
      detectionSources.push('package.json');
    }
    
    if (analysis.packageJson?.devDependencies) {
      defaults.devDependencies = Object.keys(analysis.packageJson.devDependencies);
      detectionSources.push('package.json');
    }
    
    if (analysis.packageJson?.peerDependencies) {
      defaults.peerDependencies = Object.keys(analysis.packageJson.peerDependencies);
      detectionSources.push('package.json');
    }
    
    // Extract engines
    if (analysis.packageJson?.engines) {
      defaults.engines = analysis.packageJson.engines;
      detectionSources.push('package.json');
    }
    
    // Calculate confidence score
    defaults.confidence = this.calculateConfidenceScore(defaults, analysis);
    
    return defaults;
  }

  private generateTags(analysis: any): string[] {
    const tags: string[] = [];
    
    // Add language tags
    analysis.languages.forEach((lang: any) => {
      if (lang.percentage > 10) {
        tags.push(lang.name.toLowerCase());
      }
    });
    
    // Add framework tags
    analysis.frameworks.forEach((framework: any) => {
      tags.push(framework.name.toLowerCase());
    });
    
    // Add feature-based tags
    if (analysis.hasTests) tags.push('testing');
    if (analysis.hasDocumentation) tags.push('documentation');
    if (analysis.hasLinting) tags.push('linting');
    if (analysis.hasTypeScript) tags.push('typescript');
    if (analysis.hasDocker) tags.push('docker');
    if (analysis.hasCi) tags.push('ci-cd');
    
    // Add project type tags
    if (analysis.packageJson?.scripts?.start) tags.push('application');
    if (analysis.packageJson?.main || analysis.packageJson?.module) tags.push('library');
    if (analysis.packageJson?.bin) tags.push('cli');
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private generateKeywords(analysis: any): string[] {
    const keywords: string[] = [];
    
    // Add existing keywords from package.json
    if (analysis.packageJson?.keywords) {
      keywords.push(...analysis.packageJson.keywords);
    }
    
    // Add framework-specific keywords
    analysis.frameworks.forEach((framework: any) => {
      switch (framework.name.toLowerCase()) {
        case 'react':
          keywords.push('react', 'component', 'jsx', 'frontend');
          break;
        case 'vue':
          keywords.push('vue', 'component', 'frontend', 'spa');
          break;
        case 'angular':
          keywords.push('angular', 'component', 'frontend', 'spa');
          break;
        case 'express':
          keywords.push('express', 'server', 'api', 'backend');
          break;
        case 'next.js':
          keywords.push('nextjs', 'react', 'ssr', 'fullstack');
          break;
        case 'nuxt.js':
          keywords.push('nuxtjs', 'vue', 'ssr', 'fullstack');
          break;
      }
    });
    
    // Add language-specific keywords
    analysis.languages.forEach((lang: any) => {
      if (lang.percentage > 20) {
        keywords.push(lang.name.toLowerCase());
      }
    });
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  private calculateConfidenceScore(defaults: DetectedDefaults, analysis: any): number {
    let score = 0;
    let maxScore = 0;
    
    // Package.json presence (high confidence)
    maxScore += 30;
    if (analysis.packageJson) score += 30;
    
    // Language detection (medium confidence)
    maxScore += 20;
    if (analysis.languages.length > 0) {
      score += Math.min(20, analysis.languages[0].percentage / 5);
    }
    
    // Framework detection (medium confidence)
    maxScore += 20;
    if (analysis.frameworks.length > 0) score += 20;
    
    // Documentation presence (low confidence)
    maxScore += 10;
    if (analysis.hasDocumentation) score += 10;
    
    // Testing setup (low confidence)
    maxScore += 10;
    if (analysis.hasTests) score += 10;
    
    // Configuration files (low confidence)
    maxScore += 10;
    if (analysis.configFiles.length > 0) score += Math.min(10, analysis.configFiles.length * 2);
    
    return Math.round((score / maxScore) * 100);
  }

  private mergeDefaults(detected: DetectedDefaults, custom?: Partial<BoxMetadata>): DetectedDefaults {
    if (!custom) return detected;
    
    return {
      ...detected,
      ...custom,
      tags: [...(detected.tags || []), ...(custom.tags || [])],
      keywords: [...(detected.keywords || []), ...(custom.keywords || [])]
    };
  }

  private createMetadataFromDefaults(defaults: DetectedDefaults, sourcePath: string): MetadataPromptOptions {
    return {
      name: defaults.name || path.basename(sourcePath),
      description: defaults.description || `Template box created from ${path.basename(sourcePath)}`,
      language: defaults.language || 'unknown',
      framework: defaults.framework,
      version: defaults.version || '1.0.0',
      license: defaults.license || 'MIT',
      tags: defaults.tags || [],
      keywords: defaults.keywords || [],
      author: defaults.author,
      repository: defaults.repository,
      homepage: defaults.homepage,
      bugs: defaults.bugs,
      main: defaults.main,
      scripts: defaults.scripts,
      dependencies: defaults.dependencies,
      devDependencies: defaults.devDependencies,
      peerDependencies: defaults.peerDependencies,
      engines: defaults.engines
    };
  }

  private validateAndEnhanceMetadata(metadata: MetadataPromptOptions, detected: DetectedDefaults): MetadataPromptOptions {
    // Ensure required fields are present
    if (!metadata.name) {
      metadata.name = detected.name || 'unnamed-box';
    }
    
    if (!metadata.description) {
      metadata.description = detected.description || `Template box for ${metadata.language || 'unknown'} projects`;
    }
    
    if (!metadata.language) {
      metadata.language = detected.language || 'unknown';
    }
    
    // Enhance tags with detected information
    const enhancedTags = [...new Set([
      ...(metadata.tags || []),
      ...(detected.tags || [])
    ])];
    
    metadata.tags = enhancedTags;
    
    // Enhance keywords
    const enhancedKeywords = [...new Set([
      ...(metadata.keywords || []),
      ...(detected.keywords || [])
    ])];
    
    metadata.keywords = enhancedKeywords;
    
    return metadata;
  }

  private showDetectionSummary(detected: DetectedDefaults): void {
    console.log(chalk.gray('\n─'.repeat(50)));
    console.log(chalk.cyan('📊 Detection Summary'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (detected.name) {
      console.log(`${chalk.yellow('Name:')} ${detected.name}`);
    }
    
    if (detected.description) {
      console.log(`${chalk.yellow('Description:')} ${detected.description.substring(0, 60)}${detected.description.length > 60 ? '...' : ''}`);
    }
    
    if (detected.language) {
      console.log(`${chalk.yellow('Language:')} ${detected.language}`);
    }
    
    if (detected.framework) {
      console.log(`${chalk.yellow('Framework:')} ${detected.framework}`);
    }
    
    if (detected.tags && detected.tags.length > 0) {
      console.log(`${chalk.yellow('Tags:')} ${detected.tags.join(', ')}`);
    }
    
    if (detected.confidence !== undefined) {
      const confidenceColor = detected.confidence >= 80 ? chalk.green : 
                             detected.confidence >= 60 ? chalk.yellow : chalk.red;
      console.log(`${chalk.yellow('Confidence:')} ${confidenceColor(`${detected.confidence}%`)}`);
    }
    
    if (detected.detectionSources && detected.detectionSources.length > 0) {
      console.log(`${chalk.yellow('Sources:')} ${chalk.gray(detected.detectionSources.join(', '))}`);
    }
    
    console.log(chalk.gray('─'.repeat(50)));
  }
}
