import { ChangeAnalysisResult, FileChangeAnalysis } from './changeAnalysis';
import { DirectoryComparison } from './contentComparison';
import { DiffSummary, FileDiff } from './diffGenerator';

export interface ConflictResolutionChoice {
  action: 'keep_existing' | 'use_new' | 'merge' | 'skip' | 'backup_and_replace';
  reason?: string;
  backupPath?: string;
}

export interface ConflictResolutionPlan {
  file: string;
  choice: ConflictResolutionChoice;
  analysis: FileChangeAnalysis;
  diff?: FileDiff | undefined;
}

export interface ResolutionSession {
  id: string;
  timestamp: Date;
  totalConflicts: number;
  resolvedConflicts: number;
  plans: ConflictResolutionPlan[];
  autoResolved: ConflictResolutionPlan[];
  requiresManualReview: ConflictResolutionPlan[];
}

export interface ResolutionOptions {
  autoResolveLevel: 'none' | 'safe' | 'moderate' | 'aggressive';
  createBackups: boolean;
  backupDirectory: string;
  interactiveMode: boolean;
  dryRun: boolean;
}

export class ConflictResolution {
  createResolutionSession(
    analysis: ChangeAnalysisResult,
    _comparison: DirectoryComparison,
    diffSummary: DiffSummary,
    options: ResolutionOptions
  ): ResolutionSession {
    const session: ResolutionSession = {
      id: this.generateSessionId(),
      timestamp: new Date(),
      totalConflicts: 0,
      resolvedConflicts: 0,
      plans: [],
      autoResolved: [],
      requiresManualReview: []
    };

    // Create resolution plans for each file change
    for (const fileAnalysis of analysis.fileAnalyses) {
      const diff = diffSummary.files.find(d => d.path === fileAnalysis.path);
      const plan = this.createResolutionPlan(fileAnalysis, diff, options);
      
      session.plans.push(plan);
      session.totalConflicts++;

      // Categorize based on resolution approach
      if (this.canAutoResolve(plan, options)) {
        session.autoResolved.push(plan);
        session.resolvedConflicts++;
      } else {
        session.requiresManualReview.push(plan);
      }
    }

    return session;
  }

  private createResolutionPlan(
    analysis: FileChangeAnalysis,
    diff?: FileDiff,
    options?: ResolutionOptions
  ): ConflictResolutionPlan {
    const choice = this.determineDefaultChoice(analysis, options);

    return {
      file: analysis.path,
      choice,
      analysis,
      diff
    };
  }

  private determineDefaultChoice(
    analysis: FileChangeAnalysis,
    options?: ResolutionOptions
  ): ConflictResolutionChoice {
    // For new files (additions), default to use new
    if (analysis.changeType === 'addition') {
      return {
        action: 'use_new',
        reason: 'New file addition'
      };
    }

    // For deletions, default to keep existing unless explicitly requested
    if (analysis.changeType === 'deletion') {
      return {
        action: 'keep_existing',
        reason: 'File deletion requires manual confirmation'
      };
    }

    // For modifications, consider risk level and auto-resolve settings
    if (analysis.changeType === 'modification') {
      const autoLevel = options?.autoResolveLevel || 'safe';

      // Critical files always require manual review
      if (analysis.impact.level === 'critical') {
        return {
          action: options?.createBackups ? 'backup_and_replace' : 'keep_existing',
          reason: 'Critical file requires manual review'
        };
      }

      // High risk files
      if (analysis.impact.level === 'high') {
        if (autoLevel === 'aggressive') {
          return {
            action: 'backup_and_replace',
            reason: 'High risk but aggressive auto-resolve enabled'
          };
        }
        return {
          action: 'keep_existing',
          reason: 'High risk file requires manual review'
        };
      }

      // Medium risk files
      if (analysis.impact.level === 'medium') {
        if (autoLevel === 'moderate' || autoLevel === 'aggressive') {
          return {
            action: options?.createBackups ? 'backup_and_replace' : 'use_new',
            reason: 'Medium risk with moderate auto-resolve'
          };
        }
        return {
          action: 'keep_existing',
          reason: 'Medium risk requires review in safe mode'
        };
      }

      // Low risk files
      return {
        action: 'use_new',
        reason: 'Low risk modification'
      };
    }

    // Default fallback
    return {
      action: 'keep_existing',
      reason: 'Unknown change type'
    };
  }

  private canAutoResolve(plan: ConflictResolutionPlan, options: ResolutionOptions): boolean {
    // Never auto-resolve in interactive mode
    if (options.interactiveMode) {
      return false;
    }

    // Never auto-resolve critical files
    if (plan.analysis.impact.level === 'critical') {
      return false;
    }

    // Check auto-resolve level
    switch (options.autoResolveLevel) {
      case 'none':
        return false;
      case 'safe':
        return plan.analysis.impact.level === 'low' && 
               plan.analysis.changeType === 'addition';
      case 'moderate':
        return plan.analysis.impact.level === 'low' || 
               (plan.analysis.impact.level === 'medium' && plan.analysis.changeType !== 'deletion');
      case 'aggressive':
        return (plan.analysis.impact.level as string) !== 'critical' && plan.analysis.changeType !== 'deletion';
      default:
        return false;
    }
  }

  // Interactive resolution methods
  async resolveInteractively(
    session: ResolutionSession,
    onPrompt: (plan: ConflictResolutionPlan) => Promise<ConflictResolutionChoice>
  ): Promise<ResolutionSession> {
    for (const plan of session.requiresManualReview) {
      try {
        const choice = await onPrompt(plan);
        plan.choice = choice;
        session.resolvedConflicts++;
      } catch (error) {
        // User cancelled or error occurred
        plan.choice = {
          action: 'skip',
          reason: 'User cancelled or error occurred'
        };
      }
    }

    return session;
  }

  // Generate resolution summary
  generateResolutionSummary(session: ResolutionSession): {
    text: string;
    actions: Record<string, number>;
    riskAssessment: string;
  } {
    const actions: Record<string, number> = {};
    let highRiskActions = 0;

    for (const plan of session.plans) {
      const action = plan.choice.action;
      actions[action] = (actions[action] || 0) + 1;

      if (plan.analysis.impact.level === 'critical' || plan.analysis.impact.level === 'high') {
        if (action === 'use_new' || action === 'backup_and_replace') {
          highRiskActions++;
        }
      }
    }

    // const totalFiles = session.plans.length;
    const resolvedPercent = Math.round((session.resolvedConflicts / session.totalConflicts) * 100);

    let riskAssessment = 'Low risk';
    if (highRiskActions > 0) {
      riskAssessment = highRiskActions > 2 ? 'High risk' : 'Medium risk';
    }

    const actionSummary = Object.entries(actions)
      .map(([action, count]) => `${count} ${action.replace(/_/g, ' ')}`)
      .join(', ');

    const text = `Resolution Summary: ${resolvedPercent}% resolved (${session.resolvedConflicts}/${session.totalConflicts})\n` +
                 `Actions: ${actionSummary}\n` +
                 `Risk Assessment: ${riskAssessment}`;

    return {
      text,
      actions,
      riskAssessment
    };
  }

  // Validate resolution plan
  validateResolutionPlan(plan: ConflictResolutionPlan): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for risky actions on critical files
    if (plan.analysis.impact.level === 'critical') {
      if (plan.choice.action === 'use_new') {
        warnings.push('Replacing critical file without backup');
      }
      if (plan.choice.action === 'skip') {
        warnings.push('Skipping critical file may cause issues');
      }
    }

    // Check for deletions
    if (plan.analysis.changeType === 'deletion' && plan.choice.action === 'use_new') {
      warnings.push('File will be deleted');
    }

    // Check for breaking changes
    if (plan.analysis.content.hasBreakingChanges && plan.choice.action === 'use_new') {
      warnings.push('Changes may break existing functionality');
    }

    // Validate backup paths
    if (plan.choice.action === 'backup_and_replace' && !plan.choice.backupPath) {
      errors.push('Backup path required for backup_and_replace action');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }

  // Generate backup filename
  generateBackupPath(originalPath: string, backupDir: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = require('path');
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const dir = path.dirname(originalPath);
    
    const backupName = `${base}.backup-${timestamp}${ext}`;
    return path.join(backupDir, dir, backupName);
  }

  // Apply resolution plan (dry run or actual)
  async applyResolutionPlan(
    plan: ConflictResolutionPlan,
    options: ResolutionOptions
  ): Promise<{
    success: boolean;
    message: string;
    backupCreated?: string;
  }> {
    if (options.dryRun) {
      return {
        success: true,
        message: `[DRY RUN] Would ${plan.choice.action} for ${plan.file}`
      };
    }

    try {
      switch (plan.choice.action) {
        case 'keep_existing':
          return {
            success: true,
            message: `Kept existing file: ${plan.file}`
          };

        case 'use_new':
          return {
            success: true,
            message: `Updated file: ${plan.file}`
          };

        case 'backup_and_replace':
          const backupPath = plan.choice.backupPath || 
                           this.generateBackupPath(plan.file, options.backupDirectory);
          return {
            success: true,
            message: `Backed up and replaced: ${plan.file}`,
            backupCreated: backupPath
          };

        case 'skip':
          return {
            success: true,
            message: `Skipped file: ${plan.file}`
          };

        default:
          return {
            success: false,
            message: `Unknown action: ${plan.choice.action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error applying resolution: ${error}`
      };
    }
  }

  private generateSessionId(): string {
    return `resolution-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Get statistics about the resolution session
  getSessionStats(session: ResolutionSession): {
    total: number;
    autoResolved: number;
    manualReview: number;
    byAction: Record<string, number>;
    byRisk: Record<string, number>;
  } {
    const byAction: Record<string, number> = {};
    const byRisk: Record<string, number> = {};

    for (const plan of session.plans) {
      const action = plan.choice.action;
      const risk = plan.analysis.impact.level;

      byAction[action] = (byAction[action] || 0) + 1;
      byRisk[risk] = (byRisk[risk] || 0) + 1;
    }

    return {
      total: session.totalConflicts,
      autoResolved: session.autoResolved.length,
      manualReview: session.requiresManualReview.length,
      byAction,
      byRisk
    };
  }
}
