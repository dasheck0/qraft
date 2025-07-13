import { DirectoryStructure } from './directoryScanner';

export interface TagDetectionResult {
  fileTypeTags: string[];
  semanticTags: string[];
  frameworkTags: string[];
  toolingTags: string[];
  allTags: string[];
  confidence: Record<string, number>; // Tag confidence scores (0-1)
}

export interface TagRule {
  tag: string;
  type: 'fileType' | 'semantic' | 'framework' | 'tooling';
  patterns: {
    files?: string[];
    extensions?: string[];
    directories?: string[];
    content?: string[];
    packageDependencies?: string[];
  };
  weight: number; // How much this rule contributes to confidence
  description: string;
}

export class TagDetector {
  private rules: TagRule[] = [
    // File Type Tags
    {
      tag: 'typescript',
      type: 'fileType',
      patterns: {
        extensions: ['.ts', '.tsx'],
        files: ['tsconfig.json', 'tsconfig.*.json'],
        packageDependencies: ['typescript', '@types/node']
      },
      weight: 1.0,
      description: 'TypeScript project'
    },
    {
      tag: 'javascript',
      type: 'fileType',
      patterns: {
        extensions: ['.js', '.jsx', '.mjs', '.cjs'],
        files: ['package.json', '.eslintrc.js']
      },
      weight: 0.8,
      description: 'JavaScript project'
    },
    {
      tag: 'python',
      type: 'fileType',
      patterns: {
        extensions: ['.py', '.pyx', '.pyi'],
        files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', 'poetry.lock']
      },
      weight: 1.0,
      description: 'Python project'
    },
    {
      tag: 'docker',
      type: 'tooling',
      patterns: {
        files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'],
        extensions: ['.dockerfile']
      },
      weight: 1.0,
      description: 'Docker containerization'
    },
    {
      tag: 'rust',
      type: 'fileType',
      patterns: {
        extensions: ['.rs'],
        files: ['Cargo.toml', 'Cargo.lock']
      },
      weight: 1.0,
      description: 'Rust project'
    },
    {
      tag: 'go',
      type: 'fileType',
      patterns: {
        extensions: ['.go'],
        files: ['go.mod', 'go.sum']
      },
      weight: 1.0,
      description: 'Go project'
    },

    // Framework Tags
    {
      tag: 'react',
      type: 'framework',
      patterns: {
        extensions: ['.jsx', '.tsx'],
        packageDependencies: ['react', 'react-dom', '@types/react'],
        content: ['import React', 'from "react"', "from 'react'"]
      },
      weight: 1.0,
      description: 'React framework'
    },
    {
      tag: 'nextjs',
      type: 'framework',
      patterns: {
        files: ['next.config.js', 'next.config.ts'],
        directories: ['pages', 'app'],
        packageDependencies: ['next']
      },
      weight: 1.0,
      description: 'Next.js framework'
    },
    {
      tag: 'vue',
      type: 'framework',
      patterns: {
        extensions: ['.vue'],
        packageDependencies: ['vue', '@vue/cli']
      },
      weight: 1.0,
      description: 'Vue.js framework'
    },
    {
      tag: 'angular',
      type: 'framework',
      patterns: {
        files: ['angular.json', '.angular-cli.json'],
        packageDependencies: ['@angular/core', '@angular/cli']
      },
      weight: 1.0,
      description: 'Angular framework'
    },
    {
      tag: 'express',
      type: 'framework',
      patterns: {
        packageDependencies: ['express'],
        content: ['require("express")', "require('express')", 'import express']
      },
      weight: 0.9,
      description: 'Express.js framework'
    },

    // Semantic Tags
    {
      tag: 'ai',
      type: 'semantic',
      patterns: {
        files: ['model.py', 'train.py', 'inference.py'],
        directories: ['models', 'training', 'datasets'],
        packageDependencies: ['tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy'],
        content: ['machine learning', 'neural network', 'deep learning', 'AI', 'ML']
      },
      weight: 0.8,
      description: 'Artificial Intelligence/Machine Learning'
    },
    {
      tag: 'documentation',
      type: 'semantic',
      patterns: {
        extensions: ['.md', '.rst', '.txt'],
        files: ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'docs.md'],
        directories: ['docs', 'documentation', 'wiki']
      },
      weight: 0.7,
      description: 'Documentation and guides'
    },
    {
      tag: 'config',
      type: 'semantic',
      patterns: {
        extensions: ['.json', '.yaml', '.yml', '.toml', '.ini', '.conf'],
        files: ['config.js', 'settings.py', '.env.example'],
        directories: ['config', 'configs', 'settings']
      },
      weight: 0.6,
      description: 'Configuration files'
    },
    {
      tag: 'testing',
      type: 'semantic',
      patterns: {
        extensions: ['.test.js', '.test.ts', '.spec.js', '.spec.ts'],
        files: ['jest.config.js', 'vitest.config.ts', 'cypress.json'],
        directories: ['test', 'tests', '__tests__', 'spec', 'e2e'],
        packageDependencies: ['jest', 'vitest', 'cypress', 'mocha', 'chai']
      },
      weight: 0.8,
      description: 'Testing and quality assurance'
    },
    {
      tag: 'workflow',
      type: 'semantic',
      patterns: {
        directories: ['.github/workflows', '.gitlab-ci'],
        files: ['.github/workflows/*.yml', '.gitlab-ci.yml', 'Jenkinsfile'],
        extensions: ['.yml', '.yaml']
      },
      weight: 0.9,
      description: 'CI/CD and automation workflows'
    },
    {
      tag: 'api',
      type: 'semantic',
      patterns: {
        directories: ['api', 'routes', 'controllers', 'endpoints'],
        files: ['openapi.json', 'swagger.json', 'api.md'],
        content: ['@api', 'REST', 'GraphQL', 'endpoint', 'router']
      },
      weight: 0.7,
      description: 'API and web services'
    },
    {
      tag: 'database',
      type: 'semantic',
      patterns: {
        extensions: ['.sql', '.db', '.sqlite'],
        directories: ['migrations', 'seeds', 'database', 'db'],
        files: ['schema.sql', 'database.json'],
        packageDependencies: ['mongoose', 'sequelize', 'prisma', 'typeorm']
      },
      weight: 0.8,
      description: 'Database and data persistence'
    },

    // Tooling Tags
    {
      tag: 'webpack',
      type: 'tooling',
      patterns: {
        files: ['webpack.config.js', 'webpack.*.js'],
        packageDependencies: ['webpack']
      },
      weight: 0.9,
      description: 'Webpack bundler'
    },
    {
      tag: 'vite',
      type: 'tooling',
      patterns: {
        files: ['vite.config.js', 'vite.config.ts'],
        packageDependencies: ['vite']
      },
      weight: 0.9,
      description: 'Vite build tool'
    },
    {
      tag: 'eslint',
      type: 'tooling',
      patterns: {
        files: ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml'],
        packageDependencies: ['eslint']
      },
      weight: 0.7,
      description: 'ESLint code linting'
    },
    {
      tag: 'prettier',
      type: 'tooling',
      patterns: {
        files: ['.prettierrc', '.prettierrc.json', 'prettier.config.js'],
        packageDependencies: ['prettier']
      },
      weight: 0.7,
      description: 'Prettier code formatting'
    }
  ];

  async detectTags(structure: DirectoryStructure, packageJson?: any): Promise<TagDetectionResult> {
    const result: TagDetectionResult = {
      fileTypeTags: [],
      semanticTags: [],
      frameworkTags: [],
      toolingTags: [],
      allTags: [],
      confidence: {}
    };

    // Analyze each rule
    for (const rule of this.rules) {
      const confidence = await this.calculateRuleConfidence(rule, structure, packageJson);
      
      if (confidence > 0.1) { // Only include tags with reasonable confidence
        result.confidence[rule.tag] = confidence;
        result.allTags.push(rule.tag);
        
        // Categorize tags
        switch (rule.type) {
          case 'fileType':
            result.fileTypeTags.push(rule.tag);
            break;
          case 'semantic':
            result.semanticTags.push(rule.tag);
            break;
          case 'framework':
            result.frameworkTags.push(rule.tag);
            break;
          case 'tooling':
            result.toolingTags.push(rule.tag);
            break;
        }
      }
    }

    // Sort tags by confidence
    const sortByConfidence = (tags: string[]) => 
      tags.sort((a, b) => (result.confidence[b] || 0) - (result.confidence[a] || 0));

    result.fileTypeTags = sortByConfidence(result.fileTypeTags);
    result.semanticTags = sortByConfidence(result.semanticTags);
    result.frameworkTags = sortByConfidence(result.frameworkTags);
    result.toolingTags = sortByConfidence(result.toolingTags);
    result.allTags = sortByConfidence(result.allTags);

    return result;
  }

  private async calculateRuleConfidence(
    rule: TagRule, 
    structure: DirectoryStructure, 
    packageJson?: any
  ): Promise<number> {
    let score = 0;
    let maxScore = 0;

    // Check file extensions
    if (rule.patterns.extensions) {
      maxScore += rule.weight;
      const matchingFiles = structure.files.filter(f => 
        rule.patterns.extensions!.includes(f.extension)
      );
      if (matchingFiles.length > 0) {
        score += rule.weight * Math.min(matchingFiles.length / 5, 1); // Cap at 5 files
      }
    }

    // Check specific files
    if (rule.patterns.files) {
      maxScore += rule.weight;
      const matchingFiles = rule.patterns.files.filter(pattern =>
        structure.files.some(f => this.matchesFilePattern(f.name, pattern))
      );
      if (matchingFiles.length > 0) {
        score += rule.weight * (matchingFiles.length / rule.patterns.files.length);
      }
    }

    // Check directories
    if (rule.patterns.directories) {
      maxScore += rule.weight * 0.8;
      const matchingDirs = rule.patterns.directories.filter(pattern =>
        structure.directories.some(d => this.matchesFilePattern(d.name, pattern))
      );
      if (matchingDirs.length > 0) {
        score += rule.weight * 0.8 * (matchingDirs.length / rule.patterns.directories.length);
      }
    }

    // Check package dependencies
    if (rule.patterns.packageDependencies && packageJson) {
      maxScore += rule.weight;
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const matchingDeps = rule.patterns.packageDependencies.filter(dep => deps[dep]);
      if (matchingDeps.length > 0) {
        score += rule.weight * (matchingDeps.length / rule.patterns.packageDependencies.length);
      }
    }

    // Check content patterns (for files with content)
    if (rule.patterns.content) {
      maxScore += rule.weight * 0.6;
      const filesWithContent = structure.files.filter(f => f.content);
      let contentMatches = 0;

      for (const file of filesWithContent) {
        for (const pattern of rule.patterns.content) {
          if (file.content?.toLowerCase().includes(pattern.toLowerCase())) {
            contentMatches++;
            break; // One match per file is enough
          }
        }
      }

      if (contentMatches > 0 && filesWithContent.length > 0) {
        score += rule.weight * 0.6 * (contentMatches / filesWithContent.length);
      }
    }

    return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  }

  private matchesFilePattern(fileName: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(fileName);
    }
    return fileName === pattern;
  }

  // Get tag descriptions for UI display
  getTagDescription(tag: string): string {
    const rule = this.rules.find(r => r.tag === tag);
    return rule?.description || tag;
  }

  // Get all available tags by category
  getAvailableTags(): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      fileType: [],
      semantic: [],
      framework: [],
      tooling: []
    };

    for (const rule of this.rules) {
      categories[rule.type].push(rule.tag);
    }

    return categories;
  }
}
