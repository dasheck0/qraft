import { DirectoryStructure } from './directoryScanner';
import { StructureAnalysis } from './structureAnalyzer';
import { TagDetectionResult } from './tagDetector';

export interface BoxMetadata {
  name: string;
  description: string;
  version: string;
  tags: string[];
  category: string;
  language: string;
  framework?: string | undefined;
  author?: string | undefined;
  license?: string | undefined;
  repository?: string | undefined;
  homepage?: string | undefined;
  keywords: string[];
  requirements: {
    node?: string | undefined;
    python?: string | undefined;
    dependencies?: string[] | undefined;
  };
  files: {
    total: number;
    size: string;
    types: Record<string, number>;
  };
  structure: {
    hasTests: boolean;
    hasDocumentation: boolean;
    hasCICD: boolean;
    hasDocker: boolean;
    complexity: string;
  };
  usage: {
    installation?: string[] | undefined;
    quickStart?: string[] | undefined;
    examples?: string[] | undefined;
  };
  generatedAt: string;
  generatedBy: string;
}

export interface MetadataOverrides {
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  category?: string;
  author?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
}

export class MetadataGenerator {
  generateMetadata(
    boxName: string,
    structure: DirectoryStructure,
    tags: TagDetectionResult,
    analysis: StructureAnalysis,
    overrides: MetadataOverrides = {}
  ): BoxMetadata {
    const packageJson = this.findPackageJson(structure);
    const readmeContent = this.findReadmeContent(structure);
    
    const baseMetadata: BoxMetadata = {
      name: overrides.name || boxName,
      description: overrides.description || this.generateDescription(analysis, tags, readmeContent),
      version: overrides.version || this.deriveVersion(packageJson),
      tags: overrides.tags || this.generateTags(tags, analysis),
      category: overrides.category || this.deriveCategory(analysis, tags),
      language: analysis.primaryLanguage,
      framework: analysis.framework,
      author: overrides.author || this.deriveAuthor(packageJson),
      license: overrides.license || this.deriveLicense(packageJson, structure),
      repository: overrides.repository || this.deriveRepository(packageJson),
      homepage: overrides.homepage || this.deriveHomepage(packageJson),
      keywords: overrides.keywords || this.generateKeywords(tags, analysis),
      requirements: this.generateRequirements(packageJson, structure, tags),
      files: this.generateFileStats(structure),
      structure: this.generateStructureInfo(analysis, tags),
      usage: this.generateUsageInstructions(analysis, tags, packageJson),
      generatedAt: new Date().toISOString(),
      generatedBy: 'qraft-cli'
    };

    return baseMetadata;
  }

  private findPackageJson(structure: DirectoryStructure): any {
    const packageFile = structure.files.find(f => f.name === 'package.json');
    if (packageFile?.content) {
      try {
        return JSON.parse(packageFile.content);
      } catch {
        return null;
      }
    }
    return null;
  }

  private findReadmeContent(structure: DirectoryStructure): string | null {
    const readmeFile = structure.files.find(f => 
      f.name.toLowerCase().startsWith('readme')
    );
    return readmeFile?.content || null;
  }

  private generateDescription(
    analysis: StructureAnalysis,
    tags: TagDetectionResult,
    readmeContent: string | null
  ): string {
    // Try to extract description from README
    if (readmeContent) {
      const lines = readmeContent.split('\n');
      // Look for first paragraph after title
      let foundTitle = false;
      for (const line of lines) {
        if (line.startsWith('#') && !foundTitle) {
          foundTitle = true;
          continue;
        }
        if (foundTitle && line.trim() && !line.startsWith('#')) {
          const description = line.trim();
          if (description.length > 20 && description.length < 200) {
            return description;
          }
        }
      }
    }

    // Generate description based on analysis
    const projectType = analysis.projectType.toLowerCase();
    const language = analysis.primaryLanguage.toLowerCase();
    const framework = analysis.framework ? ` using ${analysis.framework}` : '';
    
    if (tags.semanticTags.includes('ai')) {
      return `AI/ML ${projectType} written in ${language}${framework} for machine learning and data analysis.`;
    } else if (tags.semanticTags.includes('api')) {
      return `REST API ${projectType} built with ${language}${framework} for backend services.`;
    } else if (tags.frameworkTags.includes('react')) {
      return `React application written in ${language} for modern web development.`;
    } else if (tags.frameworkTags.includes('nextjs')) {
      return `Next.js application built with ${language} for full-stack web development.`;
    } else if (tags.semanticTags.includes('documentation')) {
      return `Documentation and guides for ${projectType.replace(' project', '')} development.`;
    } else {
      return `${analysis.projectType} written in ${language}${framework}.`;
    }
  }

  private deriveVersion(packageJson: any): string {
    return packageJson?.version || '1.0.0';
  }

  private generateTags(tags: TagDetectionResult, analysis: StructureAnalysis): string[] {
    const allTags = [...tags.allTags];
    
    // Add complexity tag
    allTags.push(analysis.complexity);
    
    // Add structure-based tags
    if (analysis.hasTests) allTags.push('tested');
    if (analysis.hasDocumentation) allTags.push('documented');
    if (analysis.isMonorepo) allTags.push('monorepo');
    
    // Remove duplicates and sort by confidence
    return [...new Set(allTags)].slice(0, 10); // Limit to 10 tags
  }

  private deriveCategory(analysis: StructureAnalysis, tags: TagDetectionResult): string {
    if (tags.semanticTags.includes('ai')) return 'ai-ml';
    if (tags.semanticTags.includes('api')) return 'backend';
    if (tags.frameworkTags.includes('react') || tags.frameworkTags.includes('vue') || tags.frameworkTags.includes('angular')) {
      return 'frontend';
    }
    if (tags.frameworkTags.includes('nextjs')) return 'fullstack';
    if (tags.semanticTags.includes('documentation')) return 'documentation';
    if (tags.semanticTags.includes('testing')) return 'testing';
    if (tags.toolingTags.includes('docker')) return 'infrastructure';
    if (analysis.isMonorepo) return 'monorepo';
    
    return 'general';
  }

  private deriveAuthor(packageJson: any): string | undefined {
    if (packageJson?.author) {
      if (typeof packageJson.author === 'string') {
        return packageJson.author;
      } else if (packageJson.author.name) {
        return packageJson.author.name;
      }
    }
    return undefined;
  }

  private deriveLicense(packageJson: any, structure: DirectoryStructure): string | undefined {
    if (packageJson?.license) {
      return packageJson.license;
    }
    
    // Check for LICENSE file
    const licenseFile = structure.files.find(f => 
      f.name.toLowerCase().startsWith('license')
    );
    if (licenseFile) {
      return 'See LICENSE file';
    }
    
    return undefined;
  }

  private deriveRepository(packageJson: any): string | undefined {
    if (packageJson?.repository) {
      if (typeof packageJson.repository === 'string') {
        return packageJson.repository;
      } else if (packageJson.repository.url) {
        return packageJson.repository.url;
      }
    }
    return undefined;
  }

  private deriveHomepage(packageJson: any): string | undefined {
    return packageJson?.homepage;
  }

  private generateKeywords(tags: TagDetectionResult, analysis: StructureAnalysis): string[] {
    const keywords = [...tags.allTags];
    
    // Add language-specific keywords
    if (analysis.primaryLanguage.toLowerCase() === 'typescript') {
      keywords.push('typescript', 'javascript', 'nodejs');
    } else if (analysis.primaryLanguage.toLowerCase() === 'python') {
      keywords.push('python', 'script', 'automation');
    }
    
    // Add framework-specific keywords
    if (analysis.framework === 'react') {
      keywords.push('component', 'jsx', 'frontend');
    } else if (analysis.framework === 'nextjs') {
      keywords.push('ssr', 'fullstack', 'vercel');
    }
    
    return [...new Set(keywords)].slice(0, 15);
  }

  private generateRequirements(packageJson: any, _structure: DirectoryStructure, tags: TagDetectionResult): BoxMetadata['requirements'] {
    const requirements: BoxMetadata['requirements'] = {};
    
    if (packageJson?.engines?.node) {
      requirements.node = packageJson.engines.node;
    } else if (tags.fileTypeTags.includes('javascript') || tags.fileTypeTags.includes('typescript')) {
      requirements.node = '>=14.0.0';
    }
    
    if (tags.fileTypeTags.includes('python')) {
      requirements.python = '>=3.8';
    }
    
    // Extract key dependencies
    if (packageJson?.dependencies) {
      const keyDeps = Object.keys(packageJson.dependencies).filter(dep => 
        ['react', 'next', 'express', 'vue', 'angular', 'typescript'].includes(dep)
      );
      if (keyDeps.length > 0) {
        requirements.dependencies = keyDeps;
      }
    }
    
    return requirements;
  }

  private generateFileStats(structure: DirectoryStructure): BoxMetadata['files'] {
    const sizeInMB = (structure.totalSize / (1024 * 1024)).toFixed(2);
    const types: Record<string, number> = {};
    
    for (const file of structure.files) {
      const ext = file.extension || 'no-extension';
      types[ext] = (types[ext] || 0) + 1;
    }
    
    return {
      total: structure.totalFiles,
      size: `${sizeInMB}MB`,
      types
    };
  }

  private generateStructureInfo(analysis: StructureAnalysis, tags: TagDetectionResult): BoxMetadata['structure'] {
    return {
      hasTests: analysis.hasTests,
      hasDocumentation: analysis.hasDocumentation,
      hasCICD: tags.semanticTags.includes('workflow'),
      hasDocker: tags.toolingTags.includes('docker'),
      complexity: analysis.complexity
    };
  }

  private generateUsageInstructions(
    _analysis: StructureAnalysis,
    tags: TagDetectionResult,
    packageJson: any
  ): BoxMetadata['usage'] {
    const usage: BoxMetadata['usage'] = {};
    
    // Installation instructions
    if (packageJson?.dependencies || tags.fileTypeTags.includes('javascript') || tags.fileTypeTags.includes('typescript')) {
      usage.installation = [
        'npm install',
        '# or',
        'yarn install'
      ];
    } else if (tags.fileTypeTags.includes('python')) {
      usage.installation = [
        'pip install -r requirements.txt',
        '# or',
        'poetry install'
      ];
    }
    
    // Quick start instructions
    if (packageJson?.scripts?.start) {
      usage.quickStart = ['npm start'];
    } else if (packageJson?.scripts?.dev) {
      usage.quickStart = ['npm run dev'];
    } else if (tags.frameworkTags.includes('nextjs')) {
      usage.quickStart = ['npm run dev'];
    } else if (tags.fileTypeTags.includes('python')) {
      usage.quickStart = ['python main.py'];
    }
    
    // Examples based on project type
    if (tags.semanticTags.includes('api')) {
      usage.examples = [
        'curl http://localhost:3000/api/health',
        '# Check API documentation for available endpoints'
      ];
    } else if (tags.frameworkTags.includes('react')) {
      usage.examples = [
        'npm run build  # Build for production',
        'npm test       # Run tests'
      ];
    }
    
    return usage;
  }

  // Generate metadata template for user customization
  generateTemplate(baseMetadata: BoxMetadata): string {
    return `# Box Metadata Template
# Edit the values below to customize your box metadata

name: "${baseMetadata.name}"
description: "${baseMetadata.description}"
version: "${baseMetadata.version}"
category: "${baseMetadata.category}"
author: "${baseMetadata.author || 'Your Name'}"
license: "${baseMetadata.license || 'MIT'}"

# Tags (comma-separated)
tags: ${baseMetadata.tags.join(', ')}

# Keywords (comma-separated)  
keywords: ${baseMetadata.keywords.join(', ')}

# Repository URL (optional)
repository: "${baseMetadata.repository || 'https://github.com/username/repo'}"

# Homepage URL (optional)
homepage: "${baseMetadata.homepage || 'https://your-project.com'}"
`;
  }
}
