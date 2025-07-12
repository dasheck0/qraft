import { DirectoryStructure } from './directoryScanner';
import { StructureAnalysis } from './structureAnalyzer';
import { TagDetectionResult } from './tagDetector';

export interface BoxNameSuggestion {
  name: string;
  confidence: number;
  reason: string;
  category: 'directory' | 'package' | 'semantic' | 'structure' | 'fallback';
}

export interface BoxNameResult {
  primaryName: string;
  alternatives: BoxNameSuggestion[];
  confidence: number;
  derivationPath: string[];
}

export class BoxNameDerivation {
  deriveBoxName(
    localPath: string,
    structure: DirectoryStructure,
    tags: TagDetectionResult,
    analysis: StructureAnalysis,
    providedName?: string
  ): BoxNameResult {
    if (providedName) {
      return {
        primaryName: this.sanitizeName(providedName),
        alternatives: [],
        confidence: 1.0,
        derivationPath: ['user-provided']
      };
    }

    const suggestions = this.generateNameSuggestions(localPath, structure, tags, analysis);
    const sortedSuggestions = suggestions.sort((a, b) => b.confidence - a.confidence);
    
    const primaryName = sortedSuggestions[0]?.name || this.fallbackName(localPath);
    const alternatives = sortedSuggestions.slice(1, 5); // Top 4 alternatives

    return {
      primaryName,
      alternatives,
      confidence: sortedSuggestions[0]?.confidence || 0.5,
      derivationPath: this.buildDerivationPath(sortedSuggestions[0], localPath)
    };
  }

  private generateNameSuggestions(
    localPath: string,
    structure: DirectoryStructure,
    tags: TagDetectionResult,
    analysis: StructureAnalysis
  ): BoxNameSuggestion[] {
    const suggestions: BoxNameSuggestion[] = [];

    // 1. Package.json name (highest priority)
    const packageName = this.extractPackageName(structure);
    if (packageName) {
      suggestions.push({
        name: this.sanitizeName(packageName),
        confidence: 0.95,
        reason: 'Extracted from package.json name field',
        category: 'package'
      });
    }

    // 2. Directory name with context
    const directoryName = this.extractDirectoryName(localPath);
    if (directoryName) {
      suggestions.push({
        name: this.sanitizeName(directoryName),
        confidence: 0.8,
        reason: 'Based on directory name',
        category: 'directory'
      });

      // Enhanced directory name with language/framework (lower confidence than base name)
      if (analysis.framework) {
        suggestions.push({
          name: this.sanitizeName(`${directoryName}-${analysis.framework}`),
          confidence: 0.75,
          reason: `Directory name enhanced with ${analysis.framework} framework`,
          category: 'directory'
        });
      } else if (analysis.primaryLanguage !== 'Unknown') {
        suggestions.push({
          name: this.sanitizeName(`${directoryName}-${analysis.primaryLanguage.toLowerCase()}`),
          confidence: 0.72,
          reason: `Directory name enhanced with ${analysis.primaryLanguage} language`,
          category: 'directory'
        });
      }
    }

    // 3. Semantic-based names
    if (tags.semanticTags.length > 0) {
      const primarySemantic = tags.semanticTags[0];
      const baseName = directoryName || 'project';
      
      suggestions.push({
        name: this.sanitizeName(`${baseName}-${primarySemantic}`),
        confidence: 0.75,
        reason: `Based on primary semantic tag: ${primarySemantic}`,
        category: 'semantic'
      });

      // Special semantic combinations
      if (tags.semanticTags.includes('api')) {
        suggestions.push({
          name: this.sanitizeName(`${baseName}-api`),
          confidence: 0.78,
          reason: 'API project detected',
          category: 'semantic'
        });
      }

      if (tags.semanticTags.includes('ai')) {
        suggestions.push({
          name: this.sanitizeName(`${baseName}-ml`),
          confidence: 0.77,
          reason: 'AI/ML project detected',
          category: 'semantic'
        });
      }
    }

    // 4. Structure-based names
    if (analysis.isMonorepo) {
      suggestions.push({
        name: this.sanitizeName(`${directoryName || 'workspace'}-monorepo`),
        confidence: 0.7,
        reason: 'Monorepo structure detected',
        category: 'structure'
      });
    }

    // 5. Framework-specific names
    if (tags.frameworkTags.length > 0) {
      const framework = tags.frameworkTags[0];
      const baseName = directoryName || 'app';
      
      suggestions.push({
        name: this.sanitizeName(`${baseName}-${framework}`),
        confidence: 0.73,
        reason: `${framework} framework detected`,
        category: 'structure'
      });

      // Special framework patterns
      if (framework === 'nextjs') {
        suggestions.push({
          name: this.sanitizeName(`${baseName}-next-app`),
          confidence: 0.74,
          reason: 'Next.js application pattern',
          category: 'structure'
        });
      }

      if (framework === 'react') {
        suggestions.push({
          name: this.sanitizeName(`${baseName}-react-app`),
          confidence: 0.72,
          reason: 'React application pattern',
          category: 'structure'
        });
      }
    }

    // 6. Nested structure analysis
    const nestedSuggestions = this.analyzeNestedStructure(structure, directoryName || 'project');
    suggestions.push(...nestedSuggestions);

    // 7. File-based suggestions
    const fileSuggestions = this.analyzeFilePatterns(structure, directoryName || 'project');
    suggestions.push(...fileSuggestions);

    return suggestions;
  }

  private analyzeNestedStructure(structure: DirectoryStructure, baseName: string): BoxNameSuggestion[] {
    const suggestions: BoxNameSuggestion[] = [];
    const directories = structure.directories.map(d => d.name);

    // Check for common patterns
    if (directories.includes('src') && directories.includes('tests')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-library`),
        confidence: 0.68,
        reason: 'Library structure detected (src + tests)',
        category: 'structure'
      });
    }

    if (directories.includes('packages')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-workspace`),
        confidence: 0.69,
        reason: 'Workspace structure detected',
        category: 'structure'
      });
    }

    if (directories.includes('apps') && directories.includes('libs')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-nx-workspace`),
        confidence: 0.71,
        reason: 'Nx workspace structure detected',
        category: 'structure'
      });
    }

    if (directories.includes('frontend') && directories.includes('backend')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-fullstack`),
        confidence: 0.72,
        reason: 'Full-stack structure detected',
        category: 'structure'
      });
    }

    return suggestions;
  }

  private analyzeFilePatterns(structure: DirectoryStructure, baseName: string): BoxNameSuggestion[] {
    const suggestions: BoxNameSuggestion[] = [];
    const fileNames = structure.files.map(f => f.name);

    // Check for specific file patterns
    if (fileNames.includes('Dockerfile')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-docker`),
        confidence: 0.65,
        reason: 'Docker configuration detected',
        category: 'structure'
      });
    }

    if (fileNames.includes('terraform.tf') || fileNames.some(f => f.endsWith('.tf'))) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-terraform`),
        confidence: 0.67,
        reason: 'Terraform configuration detected',
        category: 'structure'
      });
    }

    if (fileNames.includes('serverless.yml') || fileNames.includes('serverless.yaml')) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-serverless`),
        confidence: 0.66,
        reason: 'Serverless configuration detected',
        category: 'structure'
      });
    }

    if (fileNames.some(f => f.startsWith('requirements') && f.endsWith('.txt'))) {
      suggestions.push({
        name: this.sanitizeName(`${baseName}-python`),
        confidence: 0.64,
        reason: 'Python requirements file detected',
        category: 'structure'
      });
    }

    return suggestions;
  }

  private extractPackageName(structure: DirectoryStructure): string | null {
    const packageFile = structure.files.find(f => f.name === 'package.json');
    if (packageFile?.content) {
      try {
        const packageJson = JSON.parse(packageFile.content);
        return packageJson.name;
      } catch {
        return null;
      }
    }
    return null;
  }

  private extractDirectoryName(localPath: string): string {
    const path = require('path');
    const resolved = path.resolve(localPath);
    const basename = path.basename(resolved);

    // Handle complex paths by cleaning them up
    if (basename === '.' || basename === '') {
      const parts = resolved.split(path.sep).filter((p: string) => p && p !== '.');
      return parts[parts.length - 1] || 'project';
    }

    return basename;
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[@\/\\]/g, '-') // Replace package scopes and path separators
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid characters
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-/, '') // Remove leading hyphen
      .replace(/-$/, '') // Remove trailing hyphen
      .substring(0, 50); // Limit length
  }

  private fallbackName(localPath: string): string {
    const directoryName = this.extractDirectoryName(localPath);
    return this.sanitizeName(directoryName || 'box');
  }

  private buildDerivationPath(suggestion: BoxNameSuggestion | undefined, _localPath: string): string[] {
    if (!suggestion) {
      return ['fallback', 'directory-name'];
    }

    const path: string[] = [suggestion.category];

    switch (suggestion.category) {
      case 'package':
        path.push('package-json', 'name-field');
        break;
      case 'directory':
        path.push('directory-name');
        if (suggestion.reason.includes('enhanced')) {
          path.push('enhanced-with-context');
        }
        break;
      case 'semantic':
        path.push('semantic-tags', 'primary-tag');
        break;
      case 'structure':
        path.push('structure-analysis', 'pattern-detection');
        break;
      default:
        path.push('unknown');
    }

    return path;
  }

  // Get name suggestions for interactive selection
  getNameSuggestions(
    localPath: string,
    structure: DirectoryStructure,
    tags: TagDetectionResult,
    analysis: StructureAnalysis,
    count: number = 5
  ): BoxNameSuggestion[] {
    const suggestions = this.generateNameSuggestions(localPath, structure, tags, analysis);
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, count);
  }

  // Validate if a name is acceptable
  validateName(name: string): { valid: boolean; reason?: string | undefined } {
    if (!name || name.trim().length === 0) {
      return { valid: false, reason: 'Name cannot be empty' };
    }

    const sanitized = this.sanitizeName(name);
    if (sanitized.length < 2) {
      return { valid: false, reason: 'Name must be at least 2 characters long' };
    }

    if (sanitized !== name.toLowerCase()) {
      return { valid: false, reason: 'Name contains invalid characters. Use only letters, numbers, and hyphens.' };
    }

    const reservedNames = ['api', 'www', 'admin', 'root', 'test', 'demo'];
    if (reservedNames.includes(sanitized)) {
      return { valid: false, reason: `"${sanitized}" is a reserved name` };
    }

    return { valid: true };
  }
}
