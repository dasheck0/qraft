import { ChangeAnalysis } from './changeAnalysis';
import { DirectoryComparison, FileComparison } from './contentComparison';
import { DiffSummary, FileDiff } from './diffGenerator';
import { FileInfo } from './directoryScanner';

describe('ChangeAnalysis', () => {
  let changeAnalysis: ChangeAnalysis;

  beforeEach(() => {
    changeAnalysis = new ChangeAnalysis();
  });

  const createMockFile = (overrides: Partial<FileInfo>): FileInfo => ({
    path: '/test/file',
    relativePath: 'file',
    name: 'file',
    extension: '',
    size: 100,
    isDirectory: false,
    isFile: true,
    lastModified: new Date(),
    ...overrides
  });

  const createMockComparison = (overrides: Partial<FileComparison>): FileComparison => ({
    path: 'test.js',
    status: 'modified',
    ...overrides
  });

  const createMockDirectoryComparison = (files: FileComparison[], overrides: any = {}): DirectoryComparison => ({
    files,
    summary: {
      added: files.filter(f => f.status === 'added').length,
      deleted: files.filter(f => f.status === 'deleted').length,
      modified: files.filter(f => f.status === 'modified').length,
      unchanged: files.filter(f => f.status === 'unchanged').length,
      totalOld: files.length,
      totalNew: files.length
    },
    conflicts: [],
    ...overrides
  });

  const createMockDiffSummary = (files: FileDiff[]): DiffSummary => ({
    filesChanged: files.length,
    insertions: 10,
    deletions: 5,
    files
  });

  const createMockFileDiff = (overrides: Partial<FileDiff>): FileDiff => ({
    path: 'test.js',
    status: 'modified',
    hunks: [],
    isBinary: false,
    ...overrides
  });

  describe('analyzeChanges', () => {
    it('should analyze low-risk changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'simple.js',
          status: 'added',
          newFile: createMockFile({ size: 100 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'simple.js', status: 'added' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.overall.riskLevel).toBe('low');
      expect(result.overall.canAutoApply).toBe(true);
      expect(result.overall.requiresReview).toBe(false);
      expect(result.fileAnalyses).toHaveLength(1);
      expect(result.fileAnalyses[0].impact.level).toBe('low');
    });

    it('should analyze critical file changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'package.json',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 }),
          similarity: 0.8
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'package.json', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.overall.riskLevel).toBe('critical');
      expect(result.overall.canAutoApply).toBe(false);
      expect(result.overall.requiresReview).toBe(true);
      expect(result.fileAnalyses[0].impact.level).toBe('critical');
      expect(result.fileAnalyses[0].riskFactors).toContain('Critical system file');
    });

    it('should analyze file deletions as critical risk', () => {
      const comparisons = [
        createMockComparison({
          path: 'important.js',
          status: 'deleted',
          oldFile: createMockFile({ size: 1000 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'important.js', status: 'deleted' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.overall.riskLevel).toBe('critical');
      expect(result.fileAnalyses[0].riskFactors).toContain('File deletion');
      expect(result.fileAnalyses[0].content.hasBreakingChanges).toBe(true);
    });

    it('should analyze binary file changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'image.png',
          status: 'modified',
          oldFile: createMockFile({ extension: '.png' }),
          newFile: createMockFile({ extension: '.png' })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'image.png', status: 'modified', isBinary: true })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.fileAnalyses[0].riskFactors).toContain('Binary file');
      expect(result.fileAnalyses[0].impact.level).toBe('medium');
    });

    it('should analyze large content changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'large-change.js',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 2000 }),
          similarity: 0.3,
          changes: {
            sizeChange: 1000,
            contentChanged: true,
            extensionChanged: false
          }
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'large-change.js', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.fileAnalyses[0].riskFactors).toContain('Major content changes');
      expect(result.fileAnalyses[0].impact.level).toBe('critical');
    });

    it('should analyze configuration file changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'config.yaml',
          status: 'modified',
          oldFile: createMockFile({ extension: '.yaml' }),
          newFile: createMockFile({ extension: '.yaml' })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'config.yaml', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.fileAnalyses[0].riskFactors).toContain('Configuration file');
      expect(result.fileAnalyses[0].impact.level).toBe('high');
    });

    it('should analyze extension changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'renamed.ts',
          status: 'modified',
          oldFile: createMockFile({ extension: '.js' }),
          newFile: createMockFile({ extension: '.ts' }),
          changes: {
            sizeChange: 0,
            contentChanged: false,
            extensionChanged: true
          }
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'renamed.ts', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.fileAnalyses[0].riskFactors).toContain('File extension changed');
      expect(result.fileAnalyses[0].impact.level).toBe('high');
      expect(result.fileAnalyses[0].content.hasBreakingChanges).toBe(true);
    });

    it('should calculate size changes correctly', () => {
      const comparisons = [
        createMockComparison({
          path: 'growing.js',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 }),
          changes: {
            sizeChange: 500,
            contentChanged: true,
            extensionChanged: false
          }
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'growing.js', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.fileAnalyses[0].size.before).toBe(1000);
      expect(result.fileAnalyses[0].size.after).toBe(1500);
      expect(result.fileAnalyses[0].size.change).toBe(500);
      expect(result.fileAnalyses[0].size.changePercent).toBe(50);
    });

    it('should generate appropriate recommendations', () => {
      const comparisons = [
        createMockComparison({
          path: 'package.json',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'package.json', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.recommendations).toContain('🚨 CRITICAL: Manual review required before proceeding');
      expect(result.recommendations).toContain('Create full backup of existing box');
    });

    it('should handle multiple files with different risk levels', () => {
      const comparisons = [
        createMockComparison({
          path: 'package.json',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 })
        }),
        createMockComparison({
          path: 'simple.js',
          status: 'added',
          newFile: createMockFile({ size: 100 })
        }),
        createMockComparison({
          path: 'config.yaml',
          status: 'modified',
          oldFile: createMockFile({ extension: '.yaml' }),
          newFile: createMockFile({ extension: '.yaml' })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'package.json', status: 'modified' }),
        createMockFileDiff({ path: 'simple.js', status: 'added' }),
        createMockFileDiff({ path: 'config.yaml', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.overall.riskLevel).toBe('critical');
      expect(result.fileAnalyses).toHaveLength(3);
      expect(result.summary.totalFiles).toBe(3);
      expect(result.summary.additions).toBe(1);
      expect(result.summary.modifications).toBe(2);
    });
  });

  describe('utility methods', () => {
    it('should identify files requiring review', () => {
      const comparisons = [
        createMockComparison({
          path: 'package.json',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 })
        }),
        createMockComparison({
          path: 'simple.js',
          status: 'added',
          newFile: createMockFile({ size: 100 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'package.json', status: 'modified' }),
        createMockFileDiff({ path: 'simple.js', status: 'added' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);
      const reviewFiles = changeAnalysis.getFilesRequiringReview(result);

      expect(reviewFiles).toHaveLength(1);
      expect(reviewFiles[0].path).toBe('package.json');
    });

    it('should identify safe files', () => {
      const comparisons = [
        createMockComparison({
          path: 'package.json',
          status: 'modified',
          oldFile: createMockFile({ size: 1000 }),
          newFile: createMockFile({ size: 1500 })
        }),
        createMockComparison({
          path: 'simple.js',
          status: 'added',
          newFile: createMockFile({ size: 100 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons);
      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'package.json', status: 'modified' }),
        createMockFileDiff({ path: 'simple.js', status: 'added' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);
      const safeFiles = changeAnalysis.getSafeFiles(result);

      expect(safeFiles).toHaveLength(1);
      expect(safeFiles[0].path).toBe('simple.js');
    });
  });

  describe('manifest analysis', () => {
    const createMockManifestComparison = (overrides: any = {}) => ({
      hasLocalManifest: true,
      hasRemoteManifest: true,
      manifestComparison: {
        isIdentical: false,
        differences: [
          { field: 'version', oldValue: '1.0.0', newValue: '2.0.0' }
        ]
      },
      manifestConflicts: [],
      manifestSummary: {
        status: 'updated',
        riskLevel: 'medium',
        requiresReview: true
      },
      ...overrides
    });

    it('should analyze manifest version changes', () => {
      const comparisons = [
        createMockComparison({
          path: 'simple.js',
          status: 'modified',
          oldFile: createMockFile({ size: 100 }),
          newFile: createMockFile({ size: 120 })
        })
      ];

      const directoryComparison = createMockDirectoryComparison(comparisons, {
        manifest: createMockManifestComparison()
      });

      const diffSummary = createMockDiffSummary([
        createMockFileDiff({ path: 'simple.js', status: 'modified' })
      ]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.manifestAnalysis).toBeDefined();
      expect(result.manifestAnalysis!.hasChanges).toBe(true);
      expect(result.manifestAnalysis!.changeType).toBe('version');
      expect(result.manifestAnalysis!.riskFactors).toContain('Version change detected');
      expect(result.summary.manifestChanges).toBe(1);
    });

    it('should analyze major version changes with high impact', () => {
      const manifestComparison = createMockManifestComparison({
        manifestComparison: {
          isIdentical: false,
          differences: [
            { field: 'version', oldValue: '1.5.0', newValue: '2.0.0' }
          ]
        }
      });

      const directoryComparison = createMockDirectoryComparison([], {
        manifest: manifestComparison
      });

      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.manifestAnalysis!.riskFactors).toContain('Major version change');
      expect(result.manifestAnalysis!.impact.level).toBe('high');
      expect(result.manifestAnalysis!.changes.versionChange).toBeDefined();
      expect(result.manifestAnalysis!.changes.versionChange!.isMajorChange).toBe(true);
    });

    it('should analyze metadata changes', () => {
      const manifestComparison = createMockManifestComparison({
        manifestComparison: {
          isIdentical: false,
          differences: [
            { field: 'name', oldValue: 'old-box', newValue: 'new-box' },
            { field: 'description', oldValue: 'Old desc', newValue: 'New desc' }
          ]
        }
      });

      const directoryComparison = createMockDirectoryComparison([], {
        manifest: manifestComparison
      });

      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.manifestAnalysis!.changeType).toBe('metadata');
      expect(result.manifestAnalysis!.riskFactors).toContain('Box name changed');
      expect(result.manifestAnalysis!.impact.level).toBe('high');
      expect(result.manifestAnalysis!.changes.metadataChanges).toHaveLength(2);
    });

    it('should handle no manifest changes', () => {
      const manifestComparison = createMockManifestComparison({
        manifestComparison: {
          isIdentical: true,
          differences: []
        }
      });

      const directoryComparison = createMockDirectoryComparison([], {
        manifest: manifestComparison
      });

      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.manifestAnalysis!.hasChanges).toBe(false);
      expect(result.manifestAnalysis!.changeType).toBe('none');
      expect(result.summary.manifestChanges).toBe(0);
    });

    it('should handle missing manifest comparison', () => {
      const directoryComparison = createMockDirectoryComparison([]);
      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.manifestAnalysis).toBeUndefined();
      expect(result.summary.manifestChanges).toBe(0);
    });

    it('should include manifest recommendations in overall recommendations', () => {
      const manifestComparison = createMockManifestComparison({
        manifestComparison: {
          isIdentical: false,
          differences: [
            { field: 'version', oldValue: '1.0.0', newValue: '2.0.0' }
          ]
        }
      });

      const directoryComparison = createMockDirectoryComparison([], {
        manifest: manifestComparison
      });

      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      expect(result.recommendations).toContain('📋 MANIFEST CHANGES DETECTED:');
      expect(result.recommendations.some(r => r.includes('Major version change'))).toBe(true);
    });

    it('should factor manifest changes into overall risk calculation', () => {
      const manifestComparison = createMockManifestComparison({
        manifestComparison: {
          isIdentical: false,
          differences: [
            { field: 'version', oldValue: '1.0.0', newValue: '2.0.0' }
          ]
        }
      });

      const directoryComparison = createMockDirectoryComparison([], {
        manifest: manifestComparison
      });

      const diffSummary = createMockDiffSummary([]);

      const result = changeAnalysis.analyzeChanges(directoryComparison, diffSummary);

      // High-impact manifest changes should elevate overall risk
      expect(result.overall.riskLevel).toBe('high');
      expect(result.overall.requiresReview).toBe(true);
      expect(result.overall.canAutoApply).toBe(false);
    });
  });
});
