import { ContentComparison } from './contentComparison';
import { DirectoryStructure, FileInfo } from './directoryScanner';

describe('ContentComparison', () => {
  let comparison: ContentComparison;

  beforeEach(() => {
    comparison = new ContentComparison();
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

  const createMockStructure = (files: Partial<FileInfo>[]): DirectoryStructure => ({
    files: files.map(f => createMockFile(f)),
    directories: [],
    totalFiles: files.length,
    totalDirectories: 0,
    totalSize: files.reduce((sum, f) => sum + (f.size || 100), 0),
    depth: 1,
    rootPath: '/test'
  });

  describe('compareDirectories', () => {
    it('should handle new box creation (no old structure)', () => {
      const newStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js' },
        { relativePath: 'file2.js', name: 'file2.js' }
      ]);

      const result = comparison.compareDirectories(null, newStructure);

      expect(result.summary.added).toBe(2);
      expect(result.summary.deleted).toBe(0);
      expect(result.summary.modified).toBe(0);
      expect(result.summary.unchanged).toBe(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.files).toHaveLength(2);
      expect(result.files.every(f => f.status === 'added')).toBe(true);
    });

    it('should detect added files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'existing.js', name: 'existing.js' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'existing.js', name: 'existing.js' },
        { relativePath: 'new.js', name: 'new.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.summary.added).toBe(1);
      expect(result.summary.unchanged).toBe(1);
      expect(result.files.find(f => f.path === 'new.js')?.status).toBe('added');
    });

    it('should detect deleted files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js' },
        { relativePath: 'file2.js', name: 'file2.js' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.summary.deleted).toBe(1);
      expect(result.summary.unchanged).toBe(1);
      expect(result.files.find(f => f.path === 'file2.js')?.status).toBe('deleted');
    });

    it('should detect modified files by content', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'console.log("old");' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'console.log("new");' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.summary.modified).toBe(1);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('file_exists');
      expect(result.files[0].status).toBe('modified');
      expect(result.files[0].changes?.contentChanged).toBe(true);
    });

    it('should detect modified files by size', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', size: 100 }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', size: 200 }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.summary.modified).toBe(1);
      expect(result.files[0].changes?.sizeChange).toBe(100);
    });

    it('should detect unchanged files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'same content', size: 100 }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'same content', size: 100 }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.summary.unchanged).toBe(1);
      expect(result.summary.modified).toBe(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.files[0].status).toBe('unchanged');
    });

    it('should calculate similarity for modified files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'function test() { return 1; }' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'function test() { return 2; }' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.files[0].similarity).toBeGreaterThan(0.8);
      expect(result.files[0].similarity).toBeLessThan(1.0);
    });

    it('should detect extension changes', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', extension: '.js' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', extension: '.ts' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.files[0].changes?.extensionChanged).toBe(true);
      expect(result.files[0].status).toBe('modified');
    });

    it('should assign appropriate conflict severity', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'minor.js', name: 'minor.js', content: 'console.log("test");' },
        { relativePath: 'major.js', name: 'major.js', content: 'function old() { /* lots of code */ }' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'minor.js', name: 'minor.js', content: 'console.log("test2");' },
        { relativePath: 'major.js', name: 'major.js', content: 'completely different content' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);

      expect(result.conflicts).toHaveLength(2);
      
      const minorConflict = result.conflicts.find(c => c.path === 'minor.js');
      const majorConflict = result.conflicts.find(c => c.path === 'major.js');
      
      expect(minorConflict?.severity).toBe('low');
      expect(majorConflict?.severity).toBe('high');
    });
  });

  describe('utility methods', () => {
    it('should identify conflicting files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'conflict.js', name: 'conflict.js', content: 'old' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'conflict.js', name: 'conflict.js', content: 'new' },
        { relativePath: 'safe.js', name: 'safe.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const conflicting = comparison.getConflictingFiles(result);

      expect(conflicting).toHaveLength(1);
      expect(conflicting[0].path).toBe('conflict.js');
    });

    it('should identify safe files', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'unchanged.js', name: 'unchanged.js', content: 'same' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'unchanged.js', name: 'unchanged.js', content: 'same' },
        { relativePath: 'new.js', name: 'new.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const safe = comparison.getSafeFiles(result);

      expect(safe).toHaveLength(2);
      expect(safe.map(f => f.path)).toContain('unchanged.js');
      expect(safe.map(f => f.path)).toContain('new.js');
    });

    it('should generate summary text', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file2.js', name: 'file2.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const summaryText = comparison.generateSummaryText(result);

      expect(summaryText).toContain('1 file added');
      expect(summaryText).toContain('1 file deleted');
    });

    it('should determine if update is safe', () => {
      const oldStructure = createMockStructure([]);
      const newStructure = createMockStructure([
        { relativePath: 'new.js', name: 'new.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const isSafe = comparison.isSafeUpdate(result);

      expect(isSafe).toBe(true);
    });

    it('should determine if update is unsafe', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'old' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file.js', name: 'file.js', content: 'new' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const isSafe = comparison.isSafeUpdate(result);

      expect(isSafe).toBe(false);
    });

    it('should calculate change statistics', () => {
      const oldStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js', content: 'old' }
      ]);
      const newStructure = createMockStructure([
        { relativePath: 'file1.js', name: 'file1.js', content: 'completely different' },
        { relativePath: 'file2.js', name: 'file2.js' }
      ]);

      const result = comparison.compareDirectories(oldStructure, newStructure);
      const stats = comparison.getChangeStats(result);

      expect(stats.totalChanges).toBe(2); // 1 modified + 1 added
      expect(stats.riskLevel).toBe('high'); // high risk due to major content change
      expect(stats.requiresReview).toBe(true);
    });
  });
});
