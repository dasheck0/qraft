import { FileInfo } from './directoryScanner';

export interface SensitiveFileResult {
  file: FileInfo;
  reasons: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestions: string[];
}

export interface SensitiveDetectionResult {
  sensitiveFiles: SensitiveFileResult[];
  totalSensitiveFiles: number;
  severityCounts: Record<string, number>;
  recommendations: string[];
}

export interface SensitivePattern {
  pattern: RegExp | string;
  type: 'filename' | 'content' | 'extension' | 'path';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion: string;
}

export class SensitiveFileDetector {
  private readonly sensitivePatterns: SensitivePattern[] = [
    // Environment files - CRITICAL
    {
      pattern: /^\.env$/,
      type: 'filename',
      severity: 'critical',
      description: 'Environment file with potential secrets',
      suggestion: 'Use .env.example instead and add .env to .gitignore'
    },
    {
      pattern: /^\.env\.(local|production|staging|development)$/,
      type: 'filename',
      severity: 'critical',
      description: 'Environment-specific configuration file',
      suggestion: 'Use .env.example templates and exclude from version control'
    },

    // API Keys and Tokens - CRITICAL
    {
      pattern: /api[_-]?key/i,
      type: 'content',
      severity: 'critical',
      description: 'Potential API key in file content',
      suggestion: 'Move API keys to environment variables'
    },
    {
      pattern: /secret[_-]?key/i,
      type: 'content',
      severity: 'critical',
      description: 'Potential secret key in file content',
      suggestion: 'Use environment variables or secure key management'
    },
    {
      pattern: /access[_-]?token/i,
      type: 'content',
      severity: 'critical',
      description: 'Potential access token in file content',
      suggestion: 'Store tokens securely, not in source code'
    },
    {
      pattern: /bearer[_\s]+[a-zA-Z0-9_-]{20,}/i,
      type: 'content',
      severity: 'critical',
      description: 'Bearer token found in content',
      suggestion: 'Remove bearer tokens from source code'
    },

    // Database credentials - HIGH
    {
      pattern: /database[_-]?url/i,
      type: 'content',
      severity: 'high',
      description: 'Database connection string detected',
      suggestion: 'Use environment variables for database URLs'
    },
    {
      pattern: /mongodb:\/\/[^"'\s]+/i,
      type: 'content',
      severity: 'high',
      description: 'MongoDB connection string with credentials',
      suggestion: 'Use environment variables for database connections'
    },
    {
      pattern: /postgres:\/\/[^"'\s]+/i,
      type: 'content',
      severity: 'high',
      description: 'PostgreSQL connection string with credentials',
      suggestion: 'Use environment variables for database connections'
    },

    // Private keys - CRITICAL
    {
      pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/,
      type: 'content',
      severity: 'critical',
      description: 'Private key detected in file',
      suggestion: 'Store private keys securely, never in source code'
    },
    {
      pattern: /\.pem$/,
      type: 'extension',
      severity: 'high',
      description: 'PEM certificate/key file',
      suggestion: 'Exclude certificate files from version control'
    },
    {
      pattern: /\.key$/,
      type: 'extension',
      severity: 'high',
      description: 'Key file detected',
      suggestion: 'Store key files securely outside of source code'
    },

    // AWS credentials - CRITICAL
    {
      pattern: /AKIA[0-9A-Z]{16}/,
      type: 'content',
      severity: 'critical',
      description: 'AWS Access Key ID detected',
      suggestion: 'Use AWS IAM roles or environment variables'
    },
    {
      pattern: /aws[_-]?secret[_-]?access[_-]?key/i,
      type: 'content',
      severity: 'critical',
      description: 'AWS secret access key reference',
      suggestion: 'Use AWS IAM roles or secure credential management'
    },

    // GitHub tokens - HIGH
    {
      pattern: /ghp_[a-zA-Z0-9]{36}/,
      type: 'content',
      severity: 'high',
      description: 'GitHub personal access token',
      suggestion: 'Revoke token and use environment variables'
    },
    {
      pattern: /github[_-]?token/i,
      type: 'content',
      severity: 'high',
      description: 'GitHub token reference',
      suggestion: 'Use GitHub secrets or environment variables'
    },

    // Password patterns - HIGH
    {
      pattern: /password\s*[:=]\s*["'][^"']{8,}["']/i,
      type: 'content',
      severity: 'high',
      description: 'Hardcoded password detected',
      suggestion: 'Use environment variables or secure authentication'
    },
    {
      pattern: /passwd\s*[:=]\s*["'][^"']{6,}["']/i,
      type: 'content',
      severity: 'high',
      description: 'Hardcoded password detected',
      suggestion: 'Use environment variables or secure authentication'
    },

    // Configuration files that might contain secrets - MEDIUM
    {
      pattern: /^config\.(json|yaml|yml|toml)$/,
      type: 'filename',
      severity: 'medium',
      description: 'Configuration file that might contain sensitive data',
      suggestion: 'Review for sensitive data and use environment variables'
    },
    {
      pattern: /^secrets\./,
      type: 'filename',
      severity: 'high',
      description: 'File named with "secrets" prefix',
      suggestion: 'Rename file and use secure secret management'
    },

    // SSH keys - HIGH
    {
      pattern: /^id_rsa$/,
      type: 'filename',
      severity: 'high',
      description: 'SSH private key file',
      suggestion: 'Exclude SSH keys from version control'
    },
    {
      pattern: /^id_ed25519$/,
      type: 'filename',
      severity: 'high',
      description: 'SSH private key file',
      suggestion: 'Exclude SSH keys from version control'
    },

    // Generic sensitive patterns - LOW to MEDIUM
    {
      pattern: /credential/i,
      type: 'content',
      severity: 'medium',
      description: 'Reference to credentials',
      suggestion: 'Review for sensitive credential information'
    },
    {
      pattern: /\.credentials$/,
      type: 'extension',
      severity: 'high',
      description: 'Credentials file',
      suggestion: 'Use secure credential storage instead'
    }
  ];

  detectSensitiveFiles(files: FileInfo[]): SensitiveDetectionResult {
    const sensitiveFiles: SensitiveFileResult[] = [];
    const severityCounts: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    for (const file of files) {
      const result = this.analyzeFile(file);
      if (result.reasons.length > 0) {
        sensitiveFiles.push(result);
        severityCounts[result.severity]++;
      }
    }

    const recommendations = this.generateRecommendations(sensitiveFiles);

    return {
      sensitiveFiles,
      totalSensitiveFiles: sensitiveFiles.length,
      severityCounts,
      recommendations
    };
  }

  private analyzeFile(file: FileInfo): SensitiveFileResult {
    const reasons: string[] = [];
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const suggestions: string[] = [];

    for (const pattern of this.sensitivePatterns) {
      let matches = false;

      switch (pattern.type) {
        case 'filename':
          matches = this.matchesPattern(file.name, pattern.pattern);
          break;
        case 'extension':
          matches = this.matchesPattern(file.extension, pattern.pattern);
          break;
        case 'path':
          matches = this.matchesPattern(file.relativePath, pattern.pattern);
          break;
        case 'content':
          if (file.content) {
            matches = this.matchesPattern(file.content, pattern.pattern);
          }
          break;
      }

      if (matches) {
        reasons.push(pattern.description);
        suggestions.push(pattern.suggestion);
        
        // Update severity to highest found
        if (this.getSeverityLevel(pattern.severity) > this.getSeverityLevel(maxSeverity)) {
          maxSeverity = pattern.severity;
        }
      }
    }

    return {
      file,
      reasons,
      severity: maxSeverity,
      suggestions: [...new Set(suggestions)] // Remove duplicates
    };
  }

  private matchesPattern(text: string, pattern: RegExp | string): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    }
    return text.includes(pattern);
  }

  private getSeverityLevel(severity: string): number {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[severity as keyof typeof levels] || 0;
  }

  private generateRecommendations(sensitiveFiles: SensitiveFileResult[]): string[] {
    const recommendations: string[] = [];

    if (sensitiveFiles.some(f => f.severity === 'critical')) {
      recommendations.push('🚨 CRITICAL: Remove all critical sensitive files before creating the box');
      recommendations.push('Use environment variables for API keys, tokens, and secrets');
    }

    if (sensitiveFiles.some(f => f.severity === 'high')) {
      recommendations.push('⚠️  HIGH: Review and secure high-risk files');
      recommendations.push('Consider using .env.example files instead of actual .env files');
    }

    if (sensitiveFiles.length > 0) {
      recommendations.push('📋 Add sensitive files to .gitignore');
      recommendations.push('Use secure secret management solutions');
      recommendations.push('Review all configuration files for embedded secrets');
    }

    return recommendations;
  }

  // Get patterns for a specific severity level
  getPatternsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): SensitivePattern[] {
    return this.sensitivePatterns.filter(p => p.severity === severity);
  }

  // Check if a specific file would be flagged as sensitive
  isFileSensitive(file: FileInfo): boolean {
    const result = this.analyzeFile(file);
    return result.reasons.length > 0;
  }
}
