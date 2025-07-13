import { ManifestUtils } from '../utils/manifestUtils';
import { ChangeAnalysisResult, FileChangeAnalysis } from './changeAnalysis';
import { DirectoryComparison, ManifestConflictInfo } from './contentComparison';
import { DiffSummary, FileDiff } from './diffGenerator';
import { ManifestComparisonResult, ManifestManager } from './manifestManager';

export interface ConflictResolutionChoice {
  action: 'keep_existing' | 'use_new' | 'merge' | 'skip' | 'backup_and_replace';
  reason?: string;
  backupPath?: string;
}

export interface ManifestConflictResolutionChoice {
  action: 'keep_existing' | 'use_new' | 'backup_and_replace' | 'skip' | 'manual_merge';
  reason?: string;
  backupPath?: string;
  mergeStrategy?: 'field_by_field' | 'version_priority' | 'custom';
}

export interface ConflictResolutionPlan {
  file: string;
  choice: ConflictResolutionChoice;
  analysis: FileChangeAnalysis;
  diff?: FileDiff | undefined;
}

export interface ManifestConflictResolutionPlan {
  conflictInfo: ManifestConflictInfo;
  choice: ManifestConflictResolutionChoice;
  manifestComparison?: ManifestComparisonResult;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ResolutionSession {
  id: string;
  timestamp: Date;
  totalConflicts: number;
  resolvedConflicts: number;
  plans: ConflictResolutionPlan[];
  autoResolved: ConflictResolutionPlan[];
  requiresManualReview: ConflictResolutionPlan[];
  manifestConflicts: ManifestConflictResolutionPlan[];
  manifestAutoResolved: ManifestConflictResolutionPlan[];
  manifestRequiresReview: ManifestConflictResolutionPlan[];
}

export interface ResolutionOptions {
  autoResolveLevel: 'none' | 'safe' | 'moderate' | 'aggressive';
  createBackups: boolean;
  backupDirectory: string;
  interactiveMode: boolean;
  dryRun: boolean;
}

export interface ExecutionOptions {
  createBackups: boolean;
  backupDirectory?: string;
  dryRun?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  action: string;
  backupPath?: string;
  requiresManualIntervention?: boolean;
}

export class ConflictResolution {
  private manifestManager: ManifestManager;

  constructor(manifestManager?: ManifestManager) {
    this.manifestManager = manifestManager || new ManifestManager();
  }

  createResolutionSession(
    analysis: ChangeAnalysisResult,
    comparison: DirectoryComparison,
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
      requiresManualReview: [],
      manifestConflicts: [],
      manifestAutoResolved: [],
      manifestRequiresReview: []
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

    // Process manifest conflicts if they exist
    if (comparison.manifest?.manifestConflicts) {
      for (const manifestConflict of comparison.manifest.manifestConflicts) {
        const manifestPlan = this.createManifestResolutionPlan(
          manifestConflict,
          comparison.manifest.manifestComparison,
          options
        );

        session.manifestConflicts.push(manifestPlan);
        session.totalConflicts++;

        // Categorize manifest conflicts
        if (this.canAutoResolveManifest(manifestPlan, options)) {
          session.manifestAutoResolved.push(manifestPlan);
          session.resolvedConflicts++;
        } else {
          session.manifestRequiresReview.push(manifestPlan);
        }
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

  /**
   * Create a resolution plan for manifest conflicts
   * @param conflictInfo Manifest conflict information
   * @param manifestComparison Optional manifest comparison result
   * @param options Resolution options
   * @returns ManifestConflictResolutionPlan
   */
  private createManifestResolutionPlan(
    conflictInfo: ManifestConflictInfo,
    manifestComparison?: ManifestComparisonResult,
    options?: ResolutionOptions
  ): ManifestConflictResolutionPlan {
    const choice = this.determineManifestDefaultChoice(conflictInfo, options);
    const priority = this.getManifestConflictPriority(conflictInfo);

    const plan: ManifestConflictResolutionPlan = {
      conflictInfo,
      choice,
      priority
    };

    if (manifestComparison) {
      plan.manifestComparison = manifestComparison;
    }

    return plan;
  }

  /**
   * Get manifest manager instance for advanced operations
   * @returns ManifestManager instance
   */
  getManifestManager(): ManifestManager {
    return this.manifestManager;
  }

  /**
   * Determine default choice for manifest conflicts
   * @param conflictInfo Manifest conflict information
   * @param options Resolution options
   * @returns ManifestConflictResolutionChoice
   */
  private determineManifestDefaultChoice(
    conflictInfo: ManifestConflictInfo,
    options?: ResolutionOptions
  ): ManifestConflictResolutionChoice {
    // Handle different types of manifest conflicts
    switch (conflictInfo.type) {
      case 'manifest_version':
        // Version conflicts are critical - require careful handling
        if (conflictInfo.severity === 'high') {
          return {
            action: 'backup_and_replace',
            reason: 'Version conflict requires backup before update',
            mergeStrategy: 'version_priority'
          };
        }
        return {
          action: 'use_new',
          reason: 'Minor version update'
        };

      case 'manifest_metadata':
        // Metadata conflicts can often be auto-resolved
        if (conflictInfo.severity === 'low') {
          return {
            action: 'use_new',
            reason: 'Low-risk metadata update'
          };
        }
        return {
          action: options?.createBackups ? 'backup_and_replace' : 'manual_merge',
          reason: 'Metadata conflict requires review',
          mergeStrategy: 'field_by_field'
        };

      case 'manifest_missing':
        return {
          action: 'use_new',
          reason: 'Add missing manifest'
        };

      case 'manifest_corrupted':
        return {
          action: 'backup_and_replace',
          reason: 'Replace corrupted manifest with backup'
        };

      default:
        return {
          action: 'manual_merge',
          reason: 'Unknown manifest conflict type requires manual review',
          mergeStrategy: 'custom'
        };
    }
  }

  /**
   * Get priority level for manifest conflicts
   * @param conflictInfo Manifest conflict information
   * @returns Priority level
   */
  private getManifestConflictPriority(conflictInfo: ManifestConflictInfo): 'low' | 'medium' | 'high' | 'critical' {
    // Version conflicts are always high priority
    if (conflictInfo.type === 'manifest_version') {
      return conflictInfo.severity === 'high' ? 'critical' : 'high';
    }

    // Corruption is critical
    if (conflictInfo.type === 'manifest_corrupted') {
      return 'critical';
    }

    // Map severity to priority
    switch (conflictInfo.severity) {
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      default:
        return 'low';
    }
  }

  /**
   * Check if manifest conflict can be auto-resolved
   * @param plan Manifest resolution plan
   * @param options Resolution options
   * @returns boolean
   */
  private canAutoResolveManifest(plan: ManifestConflictResolutionPlan, options: ResolutionOptions): boolean {
    // Never auto-resolve in interactive mode
    if (options.interactiveMode) {
      return false;
    }

    // Never auto-resolve critical priority conflicts
    if (plan.priority === 'critical') {
      return false;
    }

    // Check auto-resolve level
    switch (options.autoResolveLevel) {
      case 'none':
        return false;
      case 'safe':
        return plan.priority === 'low' &&
               (plan.conflictInfo.type === 'manifest_missing' ||
                plan.conflictInfo.type === 'manifest_metadata');
      case 'moderate':
        return plan.priority === 'low' ||
               (plan.priority === 'medium' && plan.conflictInfo.type !== 'manifest_version');
      case 'aggressive':
        return plan.priority === 'low' || plan.priority === 'medium' || plan.priority === 'high';
      default:
        return false;
    }
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

  // Generate resolution summary including manifest conflicts
  generateResolutionSummary(session: ResolutionSession): {
    text: string;
    actions: Record<string, number>;
    riskAssessment: string;
  } {
    const actions: Record<string, number> = {};
    const manifestActions: Record<string, number> = {};
    let highRiskActions = 0;
    let criticalManifestConflicts = 0;

    // Count file actions
    for (const plan of session.plans) {
      const action = plan.choice.action;
      actions[action] = (actions[action] || 0) + 1;

      if (plan.analysis.impact.level === 'critical' || plan.analysis.impact.level === 'high') {
        if (action === 'use_new' || action === 'backup_and_replace') {
          highRiskActions++;
        }
      }
    }

    // Count manifest actions
    for (const plan of session.manifestConflicts) {
      const action = plan.choice.action;
      manifestActions[action] = (manifestActions[action] || 0) + 1;

      if (plan.priority === 'critical' || plan.priority === 'high') {
        criticalManifestConflicts++;
      }
    }

    const resolvedPercent = Math.round((session.resolvedConflicts / session.totalConflicts) * 100);

    let riskAssessment = 'Low risk';
    if (criticalManifestConflicts > 0 || highRiskActions > 0) {
      riskAssessment = (criticalManifestConflicts > 0 || highRiskActions > 2) ? 'High risk' : 'Medium risk';
    }

    const actionSummary = Object.entries(actions)
      .map(([action, count]) => `${count} ${action.replace(/_/g, ' ')}`)
      .join(', ');

    const manifestSummary = Object.entries(manifestActions).length > 0
      ? Object.entries(manifestActions)
          .map(([action, count]) => `${count} manifest ${action.replace(/_/g, ' ')}`)
          .join(', ')
      : '';

    let text = `Resolution Summary: ${resolvedPercent}% resolved (${session.resolvedConflicts}/${session.totalConflicts})\n`;

    if (actionSummary) {
      text += `File Actions: ${actionSummary}\n`;
    }

    if (manifestSummary) {
      text += `Manifest Actions: ${manifestSummary}\n`;
    }

    text += `Risk Assessment: ${riskAssessment}`;

    return {
      text,
      actions: { ...actions, ...manifestActions },
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

  // Get statistics about the resolution session including manifest conflicts
  getSessionStats(session: ResolutionSession): {
    total: number;
    autoResolved: number;
    manualReview: number;
    byAction: Record<string, number>;
    byRisk: Record<string, number>;
    manifestStats: {
      total: number;
      autoResolved: number;
      manualReview: number;
      byPriority: Record<string, number>;
    };
  } {
    const byAction: Record<string, number> = {};
    const byRisk: Record<string, number> = {};
    const manifestByPriority: Record<string, number> = {};

    for (const plan of session.plans) {
      const action = plan.choice.action;
      const risk = plan.analysis.impact.level;

      byAction[action] = (byAction[action] || 0) + 1;
      byRisk[risk] = (byRisk[risk] || 0) + 1;
    }

    for (const plan of session.manifestConflicts) {
      const priority = plan.priority;
      manifestByPriority[priority] = (manifestByPriority[priority] || 0) + 1;
    }

    return {
      total: session.totalConflicts,
      autoResolved: session.autoResolved.length,
      manualReview: session.requiresManualReview.length,
      byAction,
      byRisk,
      manifestStats: {
        total: session.manifestConflicts.length,
        autoResolved: session.manifestAutoResolved.length,
        manualReview: session.manifestRequiresReview.length,
        byPriority: manifestByPriority
      }
    };
  }

  /**
   * Execute manifest conflict resolution
   * @param plan Manifest resolution plan
   * @param targetDirectory Target directory for manifest operations
   * @param options Execution options
   * @returns Promise<ExecutionResult>
   */
  async executeManifestResolution(
    plan: ManifestConflictResolutionPlan,
    targetDirectory: string
  ): Promise<ExecutionResult> {
    try {
      switch (plan.choice.action) {
        case 'keep_existing':
          return {
            success: true,
            message: `Kept existing manifest for ${plan.conflictInfo.manifestField || plan.conflictInfo.type}`,
            action: 'keep_existing'
          };

        case 'use_new':
          return {
            success: true,
            message: `Will use new manifest for ${plan.conflictInfo.manifestField || plan.conflictInfo.type}`,
            action: 'use_new'
          };

        case 'backup_and_replace': {
          let backupPath = plan.choice.backupPath;
          if (!backupPath) {
            try {
              backupPath = await ManifestUtils.backupQraftDirectory(targetDirectory);
            } catch (error) {
              backupPath = `${targetDirectory}/.qraft-backup-${Date.now()}`;
            }
          }
          return {
            success: true,
            message: `Backed up manifest and will replace ${plan.conflictInfo.manifestField || plan.conflictInfo.type}`,
            action: 'backup_and_replace',
            backupPath
          };
        }

        case 'manual_merge':
          return {
            success: false,
            message: `Manual merge required for ${plan.conflictInfo.manifestField || plan.conflictInfo.type}`,
            action: 'manual_merge',
            requiresManualIntervention: true
          };

        case 'skip':
          return {
            success: true,
            message: `Skipped manifest conflict for ${plan.conflictInfo.manifestField || plan.conflictInfo.type}`,
            action: 'skip'
          };

        default:
          return {
            success: false,
            message: `Unknown manifest resolution action: ${plan.choice.action}`,
            action: plan.choice.action
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to execute manifest resolution: ${error instanceof Error ? error.message : String(error)}`,
        action: plan.choice.action
      };
    }
  }

  /**
   * Validate manifest resolution plan
   * @param plan Manifest resolution plan
   * @returns Validation result
   */
  validateManifestResolutionPlan(plan: ManifestConflictResolutionPlan): {
    valid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for risky actions on critical manifest conflicts
    if (plan.priority === 'critical') {
      if (plan.choice.action === 'use_new') {
        warnings.push('Replacing critical manifest field without backup');
      }
      if (plan.choice.action === 'skip') {
        warnings.push('Skipping critical manifest conflict may cause issues');
      }
    }

    // Check for version conflicts
    if (plan.conflictInfo.type === 'manifest_version' && plan.choice.action === 'use_new') {
      warnings.push('Version change may affect compatibility');
    }

    // Check for manual merge strategy
    if (plan.choice.action === 'manual_merge' && !plan.choice.mergeStrategy) {
      warnings.push('Manual merge action should specify merge strategy');
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }
}
