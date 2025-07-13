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

export interface ManifestChangeAnalysis {
  hasChanges: boolean;
  changeType: 'version' | 'metadata' | 'missing' | 'corrupted' | 'none';
  impact: ChangeImpact;
  riskFactors: string[];
  changes: {
    versionChange?: {
      from: string;
      to: string;
      isUpgrade: boolean;
      isMajorChange: boolean;
    };
    metadataChanges?: Array<{
      field: string;
      from: any;
      to: any;
      impact: 'low' | 'medium' | 'high';
    }>;
    compatibilityIssues?: string[];
  };
  recommendations: string[];
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
    manifestChanges: number;
  };
  impacts: ChangeImpact[];
  fileAnalyses: FileChangeAnalysis[];
  manifestAnalysis?: ManifestChangeAnalysis;
  recommendations: string[];
}

export class ChangeAnalysis {
  analyzeChanges(
    comparison: DirectoryComparison,
    diffSummary: DiffSummary
  ): ChangeAnalysisResult {
    const fileAnalyses = this.analyzeFiles(comparison.files, diffSummary.files);
    const manifestAnalysis = this.analyzeManifestChanges(comparison.manifest);
    const impacts = this.calculateImpacts(fileAnalyses, manifestAnalysis);
    const overall = this.calculateOverallRisk(fileAnalyses, comparison, manifestAnalysis);
    const summary = this.generateSummary(comparison, manifestAnalysis);
    const recommendations = this.generateRecommendations(fileAnalyses, overall, manifestAnalysis);

    const result: ChangeAnalysisResult = {
      overall,
      summary,
      impacts,
      fileAnalyses,
      recommendations
    };

    if (manifestAnalysis) {
      result.manifestAnalysis = manifestAnalysis;
    }

    return result;
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

  private analyzeManifestChanges(manifestComparison?: any): ManifestChangeAnalysis | undefined {
    if (!manifestComparison || !manifestComparison.hasLocalManifest || !manifestComparison.hasRemoteManifest) {
      return undefined;
    }

    const hasChanges = manifestComparison.manifestComparison && !manifestComparison.manifestComparison.isIdentical;
    if (!hasChanges) {
      return {
        hasChanges: false,
        changeType: 'none',
        impact: {
          level: 'low',
          description: 'No manifest changes detected',
          affectedFiles: [],
          recommendations: []
        },
        riskFactors: [],
        changes: {},
        recommendations: []
      };
    }

    const manifestComp = manifestComparison.manifestComparison;
    const changeType = this.determineManifestChangeType(manifestComp);
    const riskFactors = this.identifyManifestRiskFactors(manifestComp);
    const impact = this.calculateManifestImpact(changeType, riskFactors, manifestComp);
    const changes = this.analyzeManifestChanges_Details(manifestComp);
    const recommendations = this.generateManifestRecommendations(changeType, riskFactors, changes);

    return {
      hasChanges: true,
      changeType,
      impact,
      riskFactors,
      changes,
      recommendations
    };
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

  private determineManifestChangeType(manifestComparison: any): ManifestChangeAnalysis['changeType'] {
    if (!manifestComparison || !manifestComparison.differences) {
      return 'none';
    }

    const differences = manifestComparison.differences;

    // Check for version changes
    if (differences.some((diff: any) => diff.field === 'version')) {
      return 'version';
    }

    // Check for metadata changes
    if (differences.some((diff: any) => ['name', 'description', 'author', 'tags'].includes(diff.field))) {
      return 'metadata';
    }

    return 'metadata';
  }

  private identifyManifestRiskFactors(manifestComparison: any): string[] {
    const factors: string[] = [];

    if (!manifestComparison || !manifestComparison.differences) {
      return factors;
    }

    const differences = manifestComparison.differences;

    // Version-related risk factors
    const versionDiff = differences.find((diff: any) => diff.field === 'version');
    if (versionDiff) {
      factors.push('Version change detected');

      // Check for major version changes
      const oldVersion = versionDiff.oldValue || '0.0.0';
      const newVersion = versionDiff.newValue || '0.0.0';

      if (this.isMajorVersionChange(oldVersion, newVersion)) {
        factors.push('Major version change');
      }
    }

    // Metadata risk factors
    if (differences.some((diff: any) => diff.field === 'name')) {
      factors.push('Box name changed');
    }

    if (differences.some((diff: any) => diff.field === 'author')) {
      factors.push('Author changed');
    }

    if (differences.some((diff: any) => diff.field === 'defaultTarget')) {
      factors.push('Default target path changed');
    }

    // Check for multiple changes
    if (differences.length > 3) {
      factors.push('Multiple manifest fields changed');
    }

    return factors;
  }

  private isMajorVersionChange(oldVersion: string, newVersion: string): boolean {
    try {
      const oldMajor = parseInt(oldVersion.split('.')[0], 10);
      const newMajor = parseInt(newVersion.split('.')[0], 10);
      return newMajor !== oldMajor;
    } catch {
      return false;
    }
  }

  private calculateManifestImpact(
    changeType: ManifestChangeAnalysis['changeType'],
    riskFactors: string[],
    manifestComparison: any
  ): ChangeImpact {
    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const recommendations: string[] = [];

    // Determine impact level based on change type and risk factors
    if (changeType === 'version') {
      if (riskFactors.includes('Major version change')) {
        level = 'high';
        recommendations.push('Major version change detected - review compatibility');
        recommendations.push('Test thoroughly before applying changes');
      } else {
        level = 'medium';
        recommendations.push('Version change detected - verify compatibility');
      }
    } else if (changeType === 'metadata') {
      if (riskFactors.includes('Box name changed') || riskFactors.includes('Default target path changed')) {
        level = 'high';
        recommendations.push('Critical metadata changed - review carefully');
      } else if (riskFactors.includes('Multiple manifest fields changed')) {
        level = 'medium';
        recommendations.push('Multiple metadata fields changed - review changes');
      } else {
        level = 'low';
        recommendations.push('Minor metadata changes detected');
      }
    }

    const description = this.generateManifestImpactDescription(changeType, level, manifestComparison);

    return {
      level,
      description,
      affectedFiles: ['manifest.json'],
      recommendations
    };
  }

  private generateManifestImpactDescription(
    changeType: ManifestChangeAnalysis['changeType'],
    level: string,
    manifestComparison: any
  ): string {
    const changeCount = manifestComparison?.differences?.length || 0;

    switch (changeType) {
      case 'version':
        return `Manifest version change detected (${level} impact)`;
      case 'metadata':
        return `Manifest metadata changes detected: ${changeCount} field(s) (${level} impact)`;
      case 'missing':
        return `Missing manifest detected (${level} impact)`;
      case 'corrupted':
        return `Corrupted manifest detected (${level} impact)`;
      default:
        return `Manifest changes detected (${level} impact)`;
    }
  }

  private analyzeManifestChanges_Details(manifestComparison: any): ManifestChangeAnalysis['changes'] {
    const changes: ManifestChangeAnalysis['changes'] = {};

    if (!manifestComparison || !manifestComparison.differences) {
      return changes;
    }

    const differences = manifestComparison.differences;

    // Analyze version changes
    const versionDiff = differences.find((diff: any) => diff.field === 'version');
    if (versionDiff) {
      const oldVersion = versionDiff.oldValue || '0.0.0';
      const newVersion = versionDiff.newValue || '0.0.0';

      changes.versionChange = {
        from: oldVersion,
        to: newVersion,
        isUpgrade: this.isVersionUpgrade(oldVersion, newVersion),
        isMajorChange: this.isMajorVersionChange(oldVersion, newVersion)
      };
    }

    // Analyze metadata changes
    const metadataFields = ['name', 'description', 'author', 'tags', 'defaultTarget'];
    const metadataChanges = differences.filter((diff: any) => metadataFields.includes(diff.field));

    if (metadataChanges.length > 0) {
      changes.metadataChanges = metadataChanges.map((diff: any) => ({
        field: diff.field,
        from: diff.oldValue,
        to: diff.newValue,
        impact: this.getMetadataChangeImpact(diff.field)
      }));
    }

    // Check for compatibility issues
    changes.compatibilityIssues = this.identifyCompatibilityIssues(differences);

    return changes;
  }

  private isVersionUpgrade(oldVersion: string, newVersion: string): boolean {
    try {
      const oldParts = oldVersion.split('.').map(n => parseInt(n, 10));
      const newParts = newVersion.split('.').map(n => parseInt(n, 10));

      for (let i = 0; i < Math.max(oldParts.length, newParts.length); i++) {
        const oldPart = oldParts[i] || 0;
        const newPart = newParts[i] || 0;

        if (newPart > oldPart) return true;
        if (newPart < oldPart) return false;
      }

      return false;
    } catch {
      return false;
    }
  }

  private getMetadataChangeImpact(field: string): 'low' | 'medium' | 'high' {
    switch (field) {
      case 'name':
      case 'defaultTarget':
        return 'high';
      case 'author':
      case 'description':
        return 'medium';
      case 'tags':
        return 'low';
      default:
        return 'medium';
    }
  }

  private identifyCompatibilityIssues(differences: any[]): string[] {
    const issues: string[] = [];

    // Check for breaking changes
    const nameDiff = differences.find(diff => diff.field === 'name');
    if (nameDiff) {
      issues.push('Box name change may break existing references');
    }

    const targetDiff = differences.find(diff => diff.field === 'defaultTarget');
    if (targetDiff) {
      issues.push('Default target path change may affect deployment');
    }

    return issues;
  }

  private generateManifestRecommendations(
    changeType: ManifestChangeAnalysis['changeType'],
    riskFactors: string[],
    changes: ManifestChangeAnalysis['changes']
  ): string[] {
    const recommendations: string[] = [];

    if (changeType === 'version' && changes.versionChange) {
      if (changes.versionChange.isMajorChange) {
        recommendations.push('🚨 Major version change - review breaking changes');
        recommendations.push('Update documentation and dependencies');
      } else if (changes.versionChange.isUpgrade) {
        recommendations.push('✅ Version upgrade detected - verify new features');
      } else {
        recommendations.push('⚠️ Version downgrade detected - check for compatibility issues');
      }
    }

    if (riskFactors.includes('Box name changed')) {
      recommendations.push('📝 Update any scripts or references that use the old box name');
    }

    if (riskFactors.includes('Default target path changed')) {
      recommendations.push('🎯 Verify the new target path is appropriate for your use case');
    }

    if (changes.compatibilityIssues && changes.compatibilityIssues.length > 0) {
      recommendations.push('⚠️ Compatibility issues detected - review carefully');
    }

    return recommendations;
  }

  private mapChangeType(status: string): FileChangeAnalysis['changeType'] {
    switch (status) {
      case 'added': return 'addition';
      case 'deleted': return 'deletion';
      case 'modified': return 'modification';
      default: return 'modification';
    }
  }

  private calculateImpacts(analyses: FileChangeAnalysis[], manifestAnalysis?: ManifestChangeAnalysis): ChangeImpact[] {
    const impactMap = new Map<string, ChangeImpact>();

    // Add file impacts
    for (const analysis of analyses) {
      const key = `${analysis.impact.level}-${analysis.changeType}`;

      if (impactMap.has(key)) {
        const existing = impactMap.get(key)!;
        existing.affectedFiles.push(...analysis.impact.affectedFiles);
      } else {
        impactMap.set(key, { ...analysis.impact });
      }
    }

    // Add manifest impact if present
    if (manifestAnalysis && manifestAnalysis.hasChanges) {
      const key = `${manifestAnalysis.impact.level}-manifest`;
      impactMap.set(key, { ...manifestAnalysis.impact });
    }

    return Array.from(impactMap.values());
  }

  private calculateOverallRisk(
    analyses: FileChangeAnalysis[],
    comparison: DirectoryComparison,
    manifestAnalysis?: ManifestChangeAnalysis
  ): ChangeAnalysisResult['overall'] {
    const criticalCount = analyses.filter(a => a.impact.level === 'critical').length;
    const highCount = analyses.filter(a => a.impact.level === 'high').length;
    const mediumCount = analyses.filter(a => a.impact.level === 'medium').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 0.9;
    let requiresReview = false;
    let canAutoApply = true;

    // Factor in manifest changes
    let manifestRiskBoost = 0;
    if (manifestAnalysis && manifestAnalysis.hasChanges) {
      switch (manifestAnalysis.impact.level) {
        case 'critical':
          manifestRiskBoost = 4;
          break;
        case 'high':
          manifestRiskBoost = 3;
          break;
        case 'medium':
          manifestRiskBoost = 2;
          break;
        case 'low':
          manifestRiskBoost = 1;
          break;
      }
    }

    // Calculate risk with manifest considerations
    if (criticalCount > 0 || manifestRiskBoost >= 4) {
      riskLevel = 'critical';
      confidence = 0.95;
      requiresReview = true;
      canAutoApply = false;
    } else if (highCount > 0 || comparison.summary.deleted > 0 || manifestRiskBoost >= 3) {
      riskLevel = 'high';
      confidence = 0.85;
      requiresReview = true;
      canAutoApply = false;
    } else if (mediumCount > 2 || comparison.summary.modified > 5 || manifestRiskBoost >= 2) {
      riskLevel = 'medium';
      confidence = 0.8;
      requiresReview = true;
      canAutoApply = false;
    } else if (comparison.summary.added > 10 || manifestRiskBoost >= 1) {
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

  private generateSummary(comparison: DirectoryComparison, manifestAnalysis?: ManifestChangeAnalysis): ChangeAnalysisResult['summary'] {
    return {
      totalFiles: comparison.summary.added + comparison.summary.modified + comparison.summary.deleted,
      additions: comparison.summary.added,
      deletions: comparison.summary.deleted,
      modifications: comparison.summary.modified,
      renames: 0, // Not implemented yet
      manifestChanges: manifestAnalysis && manifestAnalysis.hasChanges ? 1 : 0
    };
  }

  private generateRecommendations(
    analyses: FileChangeAnalysis[],
    overall: ChangeAnalysisResult['overall'],
    manifestAnalysis?: ManifestChangeAnalysis
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

    // Add manifest-specific recommendations
    if (manifestAnalysis && manifestAnalysis.hasChanges) {
      recommendations.push('📋 MANIFEST CHANGES DETECTED:');
      recommendations.push(...manifestAnalysis.recommendations);
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
