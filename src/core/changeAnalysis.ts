import { DirectoryComparison, FileComparison } from './contentComparison';
import { DiffSummary, FileDiff } from './diffGenerator';

export interface ChangeImpact {
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedFiles: string[];
  recommendations: string[];
}

export interface FileChangeAnalysis {
  path: string;
  changeType: 'addition' | 'deletion' | 'modification' | 'rename';
  impact: ChangeImpact;
  riskFactors: string[];
  size: {
    before: number;
    after: number;
    change: number;
    changePercent: number;
  };
  content: {
    linesAdded: number;
    linesDeleted: number;
    similarity: number;
    hasBreakingChanges: boolean;
  };
}

export interface ChangeAnalysisResult {
  overall: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    requiresReview: boolean;
    canAutoApply: boolean;
  };
  summary: {
    totalFiles: number;
    additions: number;
    deletions: number;
    modifications: number;
    renames: number;
  };
  impacts: ChangeImpact[];
  fileAnalyses: FileChangeAnalysis[];
  recommendations: string[];
}

export class ChangeAnalysis {
  analyzeChanges(
    comparison: DirectoryComparison,
    diffSummary: DiffSummary
  ): ChangeAnalysisResult {
    const fileAnalyses = this.analyzeFiles(comparison.files, diffSummary.files);
    const impacts = this.calculateImpacts(fileAnalyses);
    const overall = this.calculateOverallRisk(fileAnalyses, comparison);
    const summary = this.generateSummary(comparison);
    const recommendations = this.generateRecommendations(fileAnalyses, overall);

    return {
      overall,
      summary,
      impacts,
      fileAnalyses,
      recommendations
    };
  }

  private analyzeFiles(
    comparisons: FileComparison[],
    diffs: FileDiff[]
  ): FileChangeAnalysis[] {
    const analyses: FileChangeAnalysis[] = [];

    for (const comparison of comparisons) {
      if (comparison.status === 'unchanged') continue;

      const diff = diffs.find(d => d.path === comparison.path);
      const analysis = this.analyzeFile(comparison, diff);
      analyses.push(analysis);
    }

    return analyses;
  }

  private analyzeFile(
    comparison: FileComparison,
    diff?: FileDiff
  ): FileChangeAnalysis {
    const riskFactors = this.identifyRiskFactors(comparison, diff);
    const impact = this.calculateFileImpact(comparison, riskFactors);
    const size = this.calculateSizeChange(comparison);
    const content = this.analyzeContentChanges(comparison, diff);

    return {
      path: comparison.path,
      changeType: this.mapChangeType(comparison.status),
      impact,
      riskFactors,
      size,
      content
    };
  }

  private identifyRiskFactors(
    comparison: FileComparison,
    diff?: FileDiff
  ): string[] {
    const factors: string[] = [];

    // File type risks
    if (this.isCriticalFile(comparison.path)) {
      factors.push('Critical system file');
    }

    if (this.isConfigurationFile(comparison.path)) {
      factors.push('Configuration file');
    }

    if (this.isExecutableFile(comparison.path)) {
      factors.push('Executable file');
    }

    // Change size risks
    if (comparison.changes?.sizeChange && Math.abs(comparison.changes.sizeChange) > 10000) {
      factors.push('Large size change');
    }

    // Content risks
    if (comparison.similarity !== undefined && comparison.similarity < 0.5) {
      factors.push('Major content changes');
    }

    if (comparison.changes?.extensionChanged) {
      factors.push('File extension changed');
    }

    // Binary file risks
    if (diff?.isBinary) {
      factors.push('Binary file');
    }

    // Deletion risks
    if (comparison.status === 'deleted') {
      factors.push('File deletion');
    }

    return factors;
  }

  private isCriticalFile(path: string): boolean {
    const criticalPatterns = [
      /package\.json$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /Dockerfile$/,
      /docker-compose\.ya?ml$/,
      /\.env$/,
      /\.env\./,
      /requirements\.txt$/,
      /Pipfile$/,
      /Cargo\.toml$/,
      /go\.mod$/,
      /pom\.xml$/,
      /build\.gradle$/
    ];

    return criticalPatterns.some(pattern => pattern.test(path));
  }

  private isConfigurationFile(path: string): boolean {
    const configPatterns = [
      /\.config\./,
      /\.conf$/,
      /\.ini$/,
      /\.properties$/,
      /\.toml$/,
      /\.ya?ml$/,
      /\.json$/,
      /\.xml$/
    ];

    return configPatterns.some(pattern => pattern.test(path));
  }

  private isExecutableFile(path: string): boolean {
    const executablePatterns = [
      /\.sh$/,
      /\.bat$/,
      /\.cmd$/,
      /\.exe$/,
      /\.bin$/,
      /\.run$/
    ];

    return executablePatterns.some(pattern => pattern.test(path));
  }

  private calculateFileImpact(
    comparison: FileComparison,
    riskFactors: string[]
  ): ChangeImpact {
    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const affectedFiles = [comparison.path];
    const recommendations: string[] = [];

    // Determine impact level based on risk factors
    if (riskFactors.includes('Critical system file') || 
        riskFactors.includes('File deletion') ||
        riskFactors.includes('Major content changes')) {
      level = 'critical';
      recommendations.push('Manual review required before applying changes');
      recommendations.push('Create backup before proceeding');
    } else if (riskFactors.includes('Configuration file') ||
               riskFactors.includes('Large size change') ||
               riskFactors.includes('File extension changed')) {
      level = 'high';
      recommendations.push('Review changes carefully');
      recommendations.push('Test after applying changes');
    } else if (riskFactors.includes('Binary file') ||
               riskFactors.includes('Executable file')) {
      level = 'medium';
      recommendations.push('Verify binary file integrity');
    }

    const description = this.generateImpactDescription(comparison, level);

    return {
      level,
      description,
      affectedFiles,
      recommendations
    };
  }

  private generateImpactDescription(
    comparison: FileComparison,
    level: string
  ): string {
    const action = comparison.status === 'added' ? 'Adding' :
                   comparison.status === 'deleted' ? 'Deleting' :
                   comparison.status === 'modified' ? 'Modifying' : 'Changing';

    return `${action} ${comparison.path} (${level} impact)`;
  }

  private calculateSizeChange(comparison: FileComparison): FileChangeAnalysis['size'] {
    const before = comparison.oldFile?.size || 0;
    const after = comparison.newFile?.size || 0;
    const change = after - before;
    const changePercent = before > 0 ? (change / before) * 100 : (after > 0 ? 100 : 0);

    return {
      before,
      after,
      change,
      changePercent
    };
  }

  private analyzeContentChanges(
    comparison: FileComparison,
    diff?: FileDiff
  ): FileChangeAnalysis['content'] {
    let linesAdded = 0;
    let linesDeleted = 0;

    if (diff) {
      for (const hunk of diff.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') linesAdded++;
          if (line.type === 'deleted') linesDeleted++;
        }
      }
    }

    const similarity = comparison.similarity || 1.0;
    const hasBreakingChanges = this.detectBreakingChanges(comparison, diff);

    return {
      linesAdded,
      linesDeleted,
      similarity,
      hasBreakingChanges
    };
  }

  private detectBreakingChanges(
    comparison: FileComparison,
    diff?: FileDiff
  ): boolean {
    // Simple heuristics for breaking changes
    if (comparison.status === 'deleted') return true;
    if (comparison.changes?.extensionChanged) return true;
    if (comparison.similarity !== undefined && comparison.similarity < 0.3) return true;

    // Check for API-related changes in code files
    if (diff && this.isCodeFile(comparison.path)) {
      const content = diff.hunks.map(h => h.lines.map(l => l.content).join('\n')).join('\n');
      const breakingPatterns = [
        /export\s+.*\s+deleted/i,
        /function\s+\w+.*deleted/i,
        /class\s+\w+.*deleted/i,
        /interface\s+\w+.*deleted/i
      ];

      return breakingPatterns.some(pattern => pattern.test(content));
    }

    return false;
  }

  private isCodeFile(path: string): boolean {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h'];
    return codeExtensions.some(ext => path.endsWith(ext));
  }

  private mapChangeType(status: string): FileChangeAnalysis['changeType'] {
    switch (status) {
      case 'added': return 'addition';
      case 'deleted': return 'deletion';
      case 'modified': return 'modification';
      default: return 'modification';
    }
  }

  private calculateImpacts(analyses: FileChangeAnalysis[]): ChangeImpact[] {
    const impactMap = new Map<string, ChangeImpact>();

    for (const analysis of analyses) {
      const key = `${analysis.impact.level}-${analysis.changeType}`;
      
      if (impactMap.has(key)) {
        const existing = impactMap.get(key)!;
        existing.affectedFiles.push(...analysis.impact.affectedFiles);
      } else {
        impactMap.set(key, { ...analysis.impact });
      }
    }

    return Array.from(impactMap.values());
  }

  private calculateOverallRisk(
    analyses: FileChangeAnalysis[],
    comparison: DirectoryComparison
  ): ChangeAnalysisResult['overall'] {
    const criticalCount = analyses.filter(a => a.impact.level === 'critical').length;
    const highCount = analyses.filter(a => a.impact.level === 'high').length;
    const mediumCount = analyses.filter(a => a.impact.level === 'medium').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 0.9;
    let requiresReview = false;
    let canAutoApply = true;

    if (criticalCount > 0) {
      riskLevel = 'critical';
      confidence = 0.95;
      requiresReview = true;
      canAutoApply = false;
    } else if (highCount > 0 || comparison.summary.deleted > 0) {
      riskLevel = 'high';
      confidence = 0.85;
      requiresReview = true;
      canAutoApply = false;
    } else if (mediumCount > 2 || comparison.summary.modified > 5) {
      riskLevel = 'medium';
      confidence = 0.8;
      requiresReview = true;
      canAutoApply = false;
    } else if (comparison.summary.added > 10) {
      riskLevel = 'medium';
      confidence = 0.75;
      requiresReview = true;
    }

    return {
      riskLevel,
      confidence,
      requiresReview,
      canAutoApply
    };
  }

  private generateSummary(comparison: DirectoryComparison): ChangeAnalysisResult['summary'] {
    return {
      totalFiles: comparison.summary.added + comparison.summary.modified + comparison.summary.deleted,
      additions: comparison.summary.added,
      deletions: comparison.summary.deleted,
      modifications: comparison.summary.modified,
      renames: 0 // Not implemented yet
    };
  }

  private generateRecommendations(
    analyses: FileChangeAnalysis[],
    overall: ChangeAnalysisResult['overall']
  ): string[] {
    const recommendations: string[] = [];

    if (overall.riskLevel === 'critical') {
      recommendations.push('🚨 CRITICAL: Manual review required before proceeding');
      recommendations.push('Create full backup of existing box');
      recommendations.push('Test changes in isolated environment first');
    } else if (overall.riskLevel === 'high') {
      recommendations.push('⚠️ HIGH RISK: Careful review recommended');
      recommendations.push('Review all modified files individually');
      recommendations.push('Consider incremental deployment');
    } else if (overall.riskLevel === 'medium') {
      recommendations.push('📋 MEDIUM RISK: Review key changes');
      recommendations.push('Verify configuration files');
    } else {
      recommendations.push('✅ LOW RISK: Changes appear safe to apply');
    }

    // Add specific recommendations based on file types
    const criticalFiles = analyses.filter(a => a.impact.level === 'critical');
    if (criticalFiles.length > 0) {
      recommendations.push(`Review critical files: ${criticalFiles.map(f => f.path).join(', ')}`);
    }

    const binaryFiles = analyses.filter(a => a.riskFactors.includes('Binary file'));
    if (binaryFiles.length > 0) {
      recommendations.push('Verify binary file integrity after update');
    }

    return recommendations;
  }

  // Get files requiring manual review
  getFilesRequiringReview(result: ChangeAnalysisResult): FileChangeAnalysis[] {
    return result.fileAnalyses.filter(analysis =>
      analysis.impact.level === 'critical' ||
      analysis.impact.level === 'high' ||
      analysis.content.hasBreakingChanges
    );
  }

  // Get safe files that can be auto-applied
  getSafeFiles(result: ChangeAnalysisResult): FileChangeAnalysis[] {
    return result.fileAnalyses.filter(analysis =>
      analysis.impact.level === 'low' &&
      !analysis.content.hasBreakingChanges &&
      !analysis.riskFactors.includes('Critical system file')
    );
  }
}
