import { DiffGenerator } from './diffGenerator';
import { FileComparison } from './contentComparison';
import { FileInfo } from './directoryScanner';

describe('DiffGenerator', () => {
  let diffGenerator: DiffGenerator;

  beforeEach(() => {
    diffGenerator = new DiffGenerator();
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

  describe('generateDiff', () => {
    it('should generate diff for added file', () => {
      const newFile = createMockFile({
        relativePath: 'new.js',
        content: 'console.log("hello");\nconsole.log("world");'
      });

      const comparison = createMockComparison({
        path: 'new.js',
        status: 'added',
        newFile
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.status).toBe('added');
      expect(diff.path).toBe('new.js');
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toHaveLength(2);
      expect(diff.hunks[0].lines.every(l => l.type === 'added')).toBe(true);
    });

    it('should generate diff for deleted file', () => {
      const oldFile = createMockFile({
        relativePath: 'deleted.js',
        content: 'console.log("goodbye");'
      });

      const comparison = createMockComparison({
        path: 'deleted.js',
        status: 'deleted',
        oldFile
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.status).toBe('deleted');
      expect(diff.path).toBe('deleted.js');
      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines).toHaveLength(1);
      expect(diff.hunks[0].lines[0].type).toBe('deleted');
    });

    it('should generate diff for modified file', () => {
      const oldFile = createMockFile({
        content: 'function test() {\n  return 1;\n}'
      });
      const newFile = createMockFile({
        content: 'function test() {\n  return 2;\n}'
      });

      const comparison = createMockComparison({
        status: 'modified',
        oldFile,
        newFile
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.status).toBe('modified');
      expect(diff.hunks.length).toBeGreaterThan(0);
      
      // Should have both deleted and added lines
      const hasDeleted = diff.hunks.some(h => h.lines.some(l => l.type === 'deleted'));
      const hasAdded = diff.hunks.some(h => h.lines.some(l => l.type === 'added'));
      expect(hasDeleted || hasAdded).toBe(true);
    });

    it('should detect binary files', () => {
      const comparison = createMockComparison({
        path: 'image.png',
        status: 'added',
        newFile: createMockFile({
          relativePath: 'image.png',
          extension: '.png'
        })
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.isBinary).toBe(true);
    });

    it('should detect binary content', () => {
      const comparison = createMockComparison({
        path: 'binary.dat',
        status: 'added',
        newFile: createMockFile({
          relativePath: 'binary.dat',
          content: 'normal text\0binary data\x01\x02'
        })
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.isBinary).toBe(true);
    });

    it('should handle files without content', () => {
      const comparison = createMockComparison({
        path: 'empty.js',
        status: 'added',
        newFile: createMockFile({
          relativePath: 'empty.js'
          // no content
        })
      });

      const diff = diffGenerator.generateDiff(comparison);

      expect(diff.hunks).toHaveLength(1);
      expect(diff.hunks[0].lines[0].content).toContain('Binary file or no content');
    });
  });

  describe('generateMultipleDiffs', () => {
    it('should generate summary for multiple files', () => {
      const comparisons = [
        createMockComparison({
          path: 'added.js',
          status: 'added',
          newFile: createMockFile({ content: 'new line' })
        }),
        createMockComparison({
          path: 'deleted.js',
          status: 'deleted',
          oldFile: createMockFile({ content: 'old line' })
        }),
        createMockComparison({
          path: 'unchanged.js',
          status: 'unchanged'
        })
      ];

      const summary = diffGenerator.generateMultipleDiffs(comparisons);

      expect(summary.filesChanged).toBe(2); // only changed files
      expect(summary.files).toHaveLength(2);
      expect(summary.insertions).toBeGreaterThan(0);
      expect(summary.deletions).toBeGreaterThan(0);
    });

    it('should count insertions and deletions correctly', () => {
      const comparisons = [
        createMockComparison({
          path: 'test.js',
          status: 'added',
          newFile: createMockFile({ content: 'line1\nline2\nline3' })
        })
      ];

      const summary = diffGenerator.generateMultipleDiffs(comparisons);

      expect(summary.insertions).toBe(3);
      expect(summary.deletions).toBe(0);
    });
  });

  describe('formatDiff', () => {
    it('should format added file diff', () => {
      const diff = {
        path: 'new.js',
        status: 'added' as const,
        hunks: [{
          oldStart: 0,
          oldCount: 0,
          newStart: 1,
          newCount: 1,
          lines: [{
            type: 'added' as const,
            content: 'console.log("hello");',
            newLineNumber: 1
          }]
        }],
        isBinary: false
      };

      const formatted = diffGenerator.formatDiff(diff);

      expect(formatted).toContain('diff --git a/new.js b/new.js');
      expect(formatted).toContain('new file mode 100644');
      expect(formatted).toContain('+console.log("hello");');
    });

    it('should format deleted file diff', () => {
      const diff = {
        path: 'deleted.js',
        status: 'deleted' as const,
        hunks: [{
          oldStart: 1,
          oldCount: 1,
          newStart: 0,
          newCount: 0,
          lines: [{
            type: 'deleted' as const,
            content: 'console.log("goodbye");',
            oldLineNumber: 1
          }]
        }],
        isBinary: false
      };

      const formatted = diffGenerator.formatDiff(diff);

      expect(formatted).toContain('deleted file mode 100644');
      expect(formatted).toContain('-console.log("goodbye");');
    });

    it('should format modified file diff', () => {
      const diff = {
        path: 'modified.js',
        status: 'modified' as const,
        hunks: [{
          oldStart: 1,
          oldCount: 2,
          newStart: 1,
          newCount: 2,
          lines: [
            {
              type: 'context' as const,
              content: 'function test() {',
              oldLineNumber: 1,
              newLineNumber: 1
            },
            {
              type: 'deleted' as const,
              content: '  return 1;',
              oldLineNumber: 2
            },
            {
              type: 'added' as const,
              content: '  return 2;',
              newLineNumber: 2
            }
          ]
        }],
        isBinary: false
      };

      const formatted = diffGenerator.formatDiff(diff);

      expect(formatted).toContain('@@ -1,2 +1,2 @@');
      expect(formatted).toContain(' function test() {');
      expect(formatted).toContain('-  return 1;');
      expect(formatted).toContain('+  return 2;');
    });

    it('should format binary file diff', () => {
      const diff = {
        path: 'image.png',
        status: 'modified' as const,
        hunks: [],
        isBinary: true
      };

      const formatted = diffGenerator.formatDiff(diff);

      expect(formatted).toContain('Binary files differ');
    });
  });

  describe('generateSummaryText', () => {
    it('should generate summary for single file', () => {
      const summary = {
        filesChanged: 1,
        insertions: 5,
        deletions: 2,
        files: []
      };

      const text = diffGenerator.generateSummaryText(summary);

      expect(text).toBe('1 file changed, 5 insertions(+), 2 deletions(-)');
    });

    it('should generate summary for multiple files', () => {
      const summary = {
        filesChanged: 3,
        insertions: 10,
        deletions: 5,
        files: []
      };

      const text = diffGenerator.generateSummaryText(summary);

      expect(text).toBe('3 files changed, 10 insertions(+), 5 deletions(-)');
    });

    it('should handle zero insertions or deletions', () => {
      const summary = {
        filesChanged: 1,
        insertions: 0,
        deletions: 1,
        files: []
      };

      const text = diffGenerator.generateSummaryText(summary);

      expect(text).toBe('1 file changed, 1 deletion(-)');
    });
  });

  describe('getFileDiffStats', () => {
    it('should count insertions and deletions in a file diff', () => {
      const diff = {
        path: 'test.js',
        status: 'modified' as const,
        hunks: [{
          oldStart: 1,
          oldCount: 3,
          newStart: 1,
          newCount: 4,
          lines: [
            { type: 'context' as const, content: 'line1' },
            { type: 'deleted' as const, content: 'old line' },
            { type: 'added' as const, content: 'new line 1' },
            { type: 'added' as const, content: 'new line 2' }
          ]
        }],
        isBinary: false
      };

      const stats = diffGenerator.getFileDiffStats(diff);

      expect(stats.insertions).toBe(2);
      expect(stats.deletions).toBe(1);
    });
  });
});
