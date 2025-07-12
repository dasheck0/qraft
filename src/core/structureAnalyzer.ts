import { DirectoryStructure } from './directoryScanner';
import { TagDetectionResult } from './tagDetector';

export interface TargetSuggestion {
  path: string;
  confidence: number;
  reason: string;
  category: 'framework' | 'language' | 'purpose' | 'structure';
}

export interface StructureAnalysis {
  projectType: string;
  primaryLanguage: string;
  framework?: string | undefined;
  targetSuggestions: TargetSuggestion[];
  isMonorepo: boolean;
  hasTests: boolean;
  hasDocumentation: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
}

export class StructureAnalyzer {
  private targetPatterns = [
    // Framework-based suggestions
    {
      pattern: /^(pages|app)\//,
      suggestion: 'web/nextjs',
      reason: 'Next.js application structure detected',
      category: 'framework' as const,
      confidence: 0.9
    },
    {
      pattern: /^src\/components/,
      suggestion: 'web/react',
      reason: 'React component structure detected',
      category: 'framework' as const,
      confidence: 0.8
    },
    {
      pattern: /^(lib|libs)\//,
      suggestion: 'libraries',
      reason: 'Library structure detected',
      category: 'structure' as const,
      confidence: 0.7
    },
    {
      pattern: /^packages$/,
      suggestion: 'monorepo',
      reason: 'Monorepo structure detected',
      category: 'structure' as const,
      confidence: 0.9
    },
    {
      pattern: /^apps$/,
      suggestion: 'applications',
      reason: 'Multi-application structure detected',
      category: 'structure' as const,
      confidence: 0.8
    },

    // Language-based suggestions
    {
      pattern: /\.py$/,
      suggestion: 'python',
      reason: 'Python project detected',
      category: 'language' as const,
      confidence: 0.8
    },
    {
      pattern: /\.(ts|tsx)$/,
      suggestion: 'typescript',
      reason: 'TypeScript project detected',
      category: 'language' as const,
      confidence: 0.8
    },
    {
      pattern: /\.rs$/,
      suggestion: 'rust',
      reason: 'Rust project detected',
      category: 'language' as const,
      confidence: 0.9
    },
    {
      pattern: /\.go$/,
      suggestion: 'go',
      reason: 'Go project detected',
      category: 'language' as const,
      confidence: 0.9
    },

    // Purpose-based suggestions
    {
      pattern: /^(api|server|backend)\//,
      suggestion: 'backend/api',
      reason: 'Backend/API structure detected',
      category: 'purpose' as const,
      confidence: 0.8
    },
    {
      pattern: /^(frontend|client|ui)\//,
      suggestion: 'frontend',
      reason: 'Frontend structure detected',
      category: 'purpose' as const,
      confidence: 0.8
    },
    {
      pattern: /^(scripts|tools|utils)\//,
      suggestion: 'utilities/scripts',
      reason: 'Utility scripts detected',
      category: 'purpose' as const,
      confidence: 0.7
    },
    {
      pattern: /^(docs|documentation)\//,
      suggestion: 'documentation',
      reason: 'Documentation structure detected',
      category: 'purpose' as const,
      confidence: 0.9
    },
    {
      pattern: /^(config|configs)\//,
      suggestion: 'configuration',
      reason: 'Configuration files detected',
      category: 'purpose' as const,
      confidence: 0.7
    },
    {
      pattern: /^(test|tests|__tests__)\//,
      suggestion: 'testing',
      reason: 'Test structure detected',
      category: 'purpose' as const,
      confidence: 0.8
    },

    // Infrastructure suggestions
    {
      pattern: /^(docker|containers)\//,
      suggestion: 'infrastructure/docker',
      reason: 'Docker infrastructure detected',
      category: 'purpose' as const,
      confidence: 0.8
    },
    {
      pattern: /^(k8s|kubernetes)$/,
      suggestion: 'infrastructure/kubernetes',
      reason: 'Kubernetes configuration detected',
      category: 'purpose' as const,
      confidence: 0.9
    },
    {
      pattern: /^(terraform|tf)\//,
      suggestion: 'infrastructure/terraform',
      reason: 'Terraform configuration detected',
      category: 'purpose' as const,
      confidence: 0.9
    },
    {
      pattern: /^\.github\/workflows\//,
      suggestion: 'automation/github-actions',
      reason: 'GitHub Actions workflows detected',
      category: 'purpose' as const,
      confidence: 0.9
    }
  ];

  analyzeStructure(
    structure: DirectoryStructure, 
    tags: TagDetectionResult
  ): StructureAnalysis {
    const analysis: StructureAnalysis = {
      projectType: this.determineProjectType(structure, tags),
      primaryLanguage: this.determinePrimaryLanguage(structure, tags),
      framework: this.determineFramework(tags),
      targetSuggestions: this.generateTargetSuggestions(structure, tags),
      isMonorepo: this.detectMonorepo(structure),
      hasTests: this.detectTests(structure),
      hasDocumentation: this.detectDocumentation(structure),
      complexity: this.assessComplexity(structure)
    };

    return analysis;
  }

  private determineProjectType(structure: DirectoryStructure, tags: TagDetectionResult): string {
    // Check for specific project types based on tags and structure
    if (tags.frameworkTags.includes('nextjs')) return 'Next.js Application';
    if (tags.frameworkTags.includes('react')) return 'React Application';
    if (tags.frameworkTags.includes('vue')) return 'Vue.js Application';
    if (tags.frameworkTags.includes('angular')) return 'Angular Application';
    if (tags.frameworkTags.includes('express')) return 'Express.js API';
    
    if (tags.semanticTags.includes('api')) return 'API Service';
    if (tags.semanticTags.includes('ai')) return 'AI/ML Project';
    if (tags.semanticTags.includes('documentation')) return 'Documentation';
    
    if (this.detectMonorepo(structure)) return 'Monorepo';
    if (tags.toolingTags.includes('docker')) return 'Containerized Application';
    
    // Fallback based on primary language
    const primaryLang = this.determinePrimaryLanguage(structure, tags);
    return `${primaryLang} Project`;
  }

  private determinePrimaryLanguage(structure: DirectoryStructure, _tags: TagDetectionResult): string {
    // Count files by language
    const languageCounts: Record<string, number> = {};
    
    for (const file of structure.files) {
      const ext = file.extension.toLowerCase();
      if (ext === '.ts' || ext === '.tsx') {
        languageCounts.typescript = (languageCounts.typescript || 0) + 1;
      } else if (ext === '.js' || ext === '.jsx') {
        languageCounts.javascript = (languageCounts.javascript || 0) + 1;
      } else if (ext === '.py') {
        languageCounts.python = (languageCounts.python || 0) + 1;
      } else if (ext === '.rs') {
        languageCounts.rust = (languageCounts.rust || 0) + 1;
      } else if (ext === '.go') {
        languageCounts.go = (languageCounts.go || 0) + 1;
      } else if (ext === '.java') {
        languageCounts.java = (languageCounts.java || 0) + 1;
      } else if (ext === '.cs') {
        languageCounts.csharp = (languageCounts.csharp || 0) + 1;
      }
    }

    // Find the language with the most files
    const primaryLang = Object.entries(languageCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0];

    return primaryLang ? primaryLang.charAt(0).toUpperCase() + primaryLang.slice(1) : 'Unknown';
  }

  private determineFramework(tags: TagDetectionResult): string | undefined {
    // Return the highest confidence framework
    if (tags.frameworkTags.length > 0) {
      return tags.frameworkTags[0]; // Already sorted by confidence
    }
    return undefined;
  }

  private generateTargetSuggestions(
    structure: DirectoryStructure, 
    tags: TagDetectionResult
  ): TargetSuggestion[] {
    const suggestions: TargetSuggestion[] = [];
    const seenSuggestions = new Set<string>();

    // Analyze directory structure
    for (const dir of structure.directories) {
      for (const pattern of this.targetPatterns) {
        if (pattern.pattern.test(dir.relativePath)) {
          if (!seenSuggestions.has(pattern.suggestion)) {
            suggestions.push({
              path: pattern.suggestion,
              confidence: pattern.confidence,
              reason: pattern.reason,
              category: pattern.category
            });
            seenSuggestions.add(pattern.suggestion);
          }
        }
      }
    }

    // Analyze file patterns
    for (const file of structure.files) {
      for (const pattern of this.targetPatterns) {
        if (pattern.pattern.test(file.relativePath)) {
          if (!seenSuggestions.has(pattern.suggestion)) {
            suggestions.push({
              path: pattern.suggestion,
              confidence: pattern.confidence * 0.8, // Slightly lower confidence for files
              reason: pattern.reason,
              category: pattern.category
            });
            seenSuggestions.add(pattern.suggestion);
          }
        }
      }
    }

    // Add tag-based suggestions
    this.addTagBasedSuggestions(tags, suggestions, seenSuggestions);

    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Return top 5 suggestions
  }

  private addTagBasedSuggestions(
    tags: TagDetectionResult, 
    suggestions: TargetSuggestion[], 
    seenSuggestions: Set<string>
  ): void {
    // Framework-based suggestions
    if (tags.frameworkTags.includes('nextjs') && !seenSuggestions.has('web/nextjs')) {
      suggestions.push({
        path: 'web/nextjs',
        confidence: 0.9,
        reason: 'Next.js framework detected',
        category: 'framework'
      });
    }

    if (tags.frameworkTags.includes('react') && !seenSuggestions.has('web/react')) {
      suggestions.push({
        path: 'web/react',
        confidence: 0.8,
        reason: 'React framework detected',
        category: 'framework'
      });
    }

    // Semantic-based suggestions
    if (tags.semanticTags.includes('ai') && !seenSuggestions.has('ai-ml')) {
      suggestions.push({
        path: 'ai-ml',
        confidence: 0.8,
        reason: 'AI/ML project detected',
        category: 'purpose'
      });
    }

    if (tags.semanticTags.includes('api') && !seenSuggestions.has('backend/api')) {
      suggestions.push({
        path: 'backend/api',
        confidence: 0.7,
        reason: 'API project detected',
        category: 'purpose'
      });
    }

    // Language-based suggestions
    if (tags.fileTypeTags.includes('python') && !seenSuggestions.has('python')) {
      suggestions.push({
        path: 'python',
        confidence: 0.6,
        reason: 'Python project detected',
        category: 'language'
      });
    }
  }

  private detectMonorepo(structure: DirectoryStructure): boolean {
    const monorepoIndicators = [
      'packages',
      'apps',
      'libs',
      'modules',
      'workspaces'
    ];

    return structure.directories.some(dir => 
      monorepoIndicators.includes(dir.name.toLowerCase())
    );
  }

  private detectTests(structure: DirectoryStructure): boolean {
    const testIndicators = [
      /test/i,
      /__tests__/,
      /spec/i,
      /\.test\./,
      /\.spec\./
    ];

    return structure.files.some(file => 
      testIndicators.some(pattern => pattern.test(file.name))
    ) || structure.directories.some(dir =>
      testIndicators.some(pattern => pattern.test(dir.name))
    );
  }

  private detectDocumentation(structure: DirectoryStructure): boolean {
    const docIndicators = [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'docs',
      'documentation',
      'wiki'
    ];

    return structure.files.some(file => 
      docIndicators.includes(file.name)
    ) || structure.directories.some(dir =>
      docIndicators.includes(dir.name.toLowerCase())
    );
  }

  private assessComplexity(structure: DirectoryStructure): 'simple' | 'moderate' | 'complex' {
    const { totalFiles, totalDirectories, depth } = structure;
    
    // Simple heuristics for complexity assessment
    if (totalFiles <= 10 && totalDirectories <= 3 && depth <= 2) {
      return 'simple';
    } else if (totalFiles <= 50 && totalDirectories <= 15 && depth <= 4) {
      return 'moderate';
    } else {
      return 'complex';
    }
  }

  // Get the best target suggestion
  getBestTargetSuggestion(analysis: StructureAnalysis): string {
    if (analysis.targetSuggestions.length === 0) {
      return 'general';
    }
    
    return analysis.targetSuggestions[0].path;
  }

  // Get suggestions by category
  getSuggestionsByCategory(analysis: StructureAnalysis): Record<string, TargetSuggestion[]> {
    const categorized: Record<string, TargetSuggestion[]> = {
      framework: [],
      language: [],
      purpose: [],
      structure: []
    };

    for (const suggestion of analysis.targetSuggestions) {
      categorized[suggestion.category].push(suggestion);
    }

    return categorized;
  }
}
