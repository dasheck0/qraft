import { ChangeAnalysisResult, FileChangeAnalysis } from './changeAnalysis';
import { ConflictResolution } from './conflictResolution';
import { DirectoryComparison } from './contentComparison';
import { DiffSummary } from './diffGenerator';

describe('ConflictResolution', () => {
  let conflictResolution: ConflictResolution;

  beforeEach(() => {
    conflictResolution = new ConflictResolution();
  });

  const createMockFileAnalysis = (overrides: Partial<FileChangeAnalysis> = {}): FileChangeAnalysis => ({
    path: 'test.js',
    changeType: 'modification',
    impact: {
      level: 'low',
      description: 'Test change',
      affectedFiles: ['test.js'],
      recommendations: []
    },
    riskFactors: [],
    size: {
      before: 100,
      after: 150,
      change: 50,
      changePercent: 50
    },
    content: {
      linesAdded: 5,
      linesDeleted: 2,
      similarity: 0.9,
      hasBreakingChanges: false
    },
    ...overrides
  });

  const createMockAnalysisResult = (fileAnalyses: FileChangeAnalysis[]): ChangeAnalysisResult => ({
    overall: {
      riskLevel: 'low',
      confidence: 0.9,
      requiresReview: false,
      canAutoApply: true
    },
    summary: {
      totalFiles: fileAnalyses.length,
      additions: fileAnalyses.filter(f => f.changeType === 'addition').length,
      deletions: fileAnalyses.filter(f => f.changeType === 'deletion').length,
      modifications: fileAnalyses.filter(f => f.changeType === 'modification').length,
      renames: 0,
      manifestChanges: 0
    },
    impacts: [],
    fileAnalyses,
    recommendations: []
  });

  const createMockDirectoryComparison = (): DirectoryComparison => ({
    files: [],
    summary: {
      added: 1,
      deleted: 0,
      modified: 1,
      unchanged: 0,
      totalOld: 1,
      totalNew: 2
    },
    conflicts: []
  });

  const createMockDiffSummary = (): DiffSummary => ({
    filesChanged: 2,
    insertions: 10,
    deletions: 5,
    files: []
  });

  describe('createResolutionSession', () => {
    it('should create resolution session for low-risk changes', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'simple.js',
          changeType: 'addition',
          impact: { level: 'low', description: 'New file', affectedFiles: ['simple.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);

      expect(session.totalConflicts).toBe(1);
      expect(session.autoResolved).toHaveLength(1);
      expect(session.requiresManualReview).toHaveLength(0);
      expect(session.plans[0].choice.action).toBe('use_new');
    });

    it('should require manual review for critical files', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'package.json',
          changeType: 'modification',
          impact: { level: 'critical', description: 'Critical file', affectedFiles: ['package.json'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: true,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);

      expect(session.autoResolved).toHaveLength(0);
      expect(session.requiresManualReview).toHaveLength(1);
      expect(session.plans[0].choice.action).toBe('backup_and_replace');
    });

    it('should handle file deletions conservatively', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'old-file.js',
          changeType: 'deletion',
          impact: { level: 'high', description: 'File deletion', affectedFiles: ['old-file.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'aggressive' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);

      expect(session.plans[0].choice.action).toBe('keep_existing');
      expect(session.plans[0].choice.reason).toContain('deletion requires manual confirmation');
    });

    it('should respect auto-resolve levels', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'medium-risk.js',
          changeType: 'modification',
          impact: { level: 'medium', description: 'Medium risk', affectedFiles: ['medium-risk.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();

      // Test safe mode
      const safeOptions = {
        autoResolveLevel: 'safe' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const safeSession = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, safeOptions);
      expect(safeSession.autoResolved).toHaveLength(0);

      // Test moderate mode
      const moderateOptions = {
        ...safeOptions,
        autoResolveLevel: 'moderate' as const,
        createBackups: true
      };

      const moderateSession = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, moderateOptions);
      expect(moderateSession.autoResolved).toHaveLength(1);
      expect(moderateSession.plans[0].choice.action).toBe('backup_and_replace');
    });

    it('should never auto-resolve in interactive mode', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'simple.js',
          changeType: 'addition',
          impact: { level: 'low', description: 'Low risk', affectedFiles: ['simple.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'aggressive' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: true,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);

      expect(session.autoResolved).toHaveLength(0);
      expect(session.requiresManualReview).toHaveLength(1);
    });
  });

  describe('generateResolutionSummary', () => {
    it('should generate comprehensive summary', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'file1.js',
          changeType: 'addition',
          impact: { level: 'low', description: 'Low risk', affectedFiles: ['file1.js'], recommendations: [] }
        }),
        createMockFileAnalysis({
          path: 'file2.js',
          changeType: 'modification',
          impact: { level: 'critical', description: 'Critical', affectedFiles: ['file2.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: true,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);
      const summary = conflictResolution.generateResolutionSummary(session);

      expect(summary.text).toContain('Resolution Summary');
      expect(summary.actions).toHaveProperty('use_new');
      expect(summary.actions).toHaveProperty('backup_and_replace');
      expect(summary.riskAssessment).toBe('Medium risk');
    });
  });

  describe('validateResolutionPlan', () => {
    it('should validate safe plans', () => {
      const plan = {
        file: 'safe.js',
        choice: {
          action: 'use_new' as const,
          reason: 'Low risk'
        },
        analysis: createMockFileAnalysis({
          impact: { level: 'low', description: 'Low risk', affectedFiles: ['safe.js'], recommendations: [] }
        })
      };

      const validation = conflictResolution.validateResolutionPlan(plan);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should warn about risky actions', () => {
      const plan = {
        file: 'critical.js',
        choice: {
          action: 'use_new' as const,
          reason: 'Force update'
        },
        analysis: createMockFileAnalysis({
          path: 'critical.js',
          impact: { level: 'critical', description: 'Critical file', affectedFiles: ['critical.js'], recommendations: [] }
        })
      };

      const validation = conflictResolution.validateResolutionPlan(plan);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain('Replacing critical file without backup');
    });

    it('should error on invalid backup plans', () => {
      const plan = {
        file: 'test.js',
        choice: {
          action: 'backup_and_replace' as const,
          reason: 'Backup required'
          // Missing backupPath
        },
        analysis: createMockFileAnalysis()
      };

      const validation = conflictResolution.validateResolutionPlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Backup path required for backup_and_replace action');
    });
  });

  describe('generateBackupPath', () => {
    it('should generate unique backup paths', () => {
      const originalPath = 'src/components/Button.tsx';
      const backupDir = '/backups';

      const backupPath = conflictResolution.generateBackupPath(originalPath, backupDir);

      expect(backupPath).toContain('/backups/src/components/');
      expect(backupPath).toContain('Button.backup-');
      expect(backupPath).toContain('.tsx');
    });
  });

  describe('applyResolutionPlan', () => {
    it('should handle dry run mode', async () => {
      const plan = {
        file: 'test.js',
        choice: {
          action: 'use_new' as const,
          reason: 'Update file'
        },
        analysis: createMockFileAnalysis()
      };

      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: true
      };

      const result = await conflictResolution.applyResolutionPlan(plan, options);

      expect(result.success).toBe(true);
      expect(result.message).toContain('[DRY RUN]');
    });

    it('should handle different actions', async () => {
      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      // Test keep_existing
      const keepPlan = {
        file: 'keep.js',
        choice: { action: 'keep_existing' as const, reason: 'Keep' },
        analysis: createMockFileAnalysis()
      };

      const keepResult = await conflictResolution.applyResolutionPlan(keepPlan, options);
      expect(keepResult.success).toBe(true);
      expect(keepResult.message).toContain('Kept existing file');

      // Test skip
      const skipPlan = {
        file: 'skip.js',
        choice: { action: 'skip' as const, reason: 'Skip' },
        analysis: createMockFileAnalysis()
      };

      const skipResult = await conflictResolution.applyResolutionPlan(skipPlan, options);
      expect(skipResult.success).toBe(true);
      expect(skipResult.message).toContain('Skipped file');
    });
  });

  describe('getSessionStats', () => {
    it('should calculate session statistics', () => {
      const fileAnalyses = [
        createMockFileAnalysis({
          path: 'low.js',
          impact: { level: 'low', description: 'Low', affectedFiles: ['low.js'], recommendations: [] }
        }),
        createMockFileAnalysis({
          path: 'high.js',
          impact: { level: 'high', description: 'High', affectedFiles: ['high.js'], recommendations: [] }
        })
      ];

      const analysis = createMockAnalysisResult(fileAnalyses);
      const comparison = createMockDirectoryComparison();
      const diffSummary = createMockDiffSummary();
      const options = {
        autoResolveLevel: 'safe' as const,
        createBackups: false,
        backupDirectory: '/tmp',
        interactiveMode: false,
        dryRun: false
      };

      const session = conflictResolution.createResolutionSession(analysis, comparison, diffSummary, options);
      const stats = conflictResolution.getSessionStats(session);

      expect(stats.total).toBe(2);
      expect(stats.byRisk).toHaveProperty('low');
      expect(stats.byRisk).toHaveProperty('high');
      expect(stats.byAction).toHaveProperty('use_new');
      expect(stats.byAction).toHaveProperty('keep_existing');
    });
  });
});
