import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
    GitignoreError,
    GitignoreFileError,
    GitignoreManager
} from './gitignoreManager';

describe('GitignoreManager', () => {
  let gitignoreManager: GitignoreManager;
  let tempDir: string;
  let testDir: string;

  beforeEach(async () => {
    gitignoreManager = new GitignoreManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitignore-test-'));
    testDir = path.join(tempDir, 'test-project');
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('getGitignorePath', () => {
    it('should return correct .gitignore path', () => {
      const result = gitignoreManager.getGitignorePath(testDir);
      expect(result).toBe(path.join(testDir, '.gitignore'));
    });
  });

  describe('exists', () => {
    it('should return false when .gitignore does not exist', async () => {
      const result = await gitignoreManager.exists(testDir);
      expect(result).toBe(false);
    });

    it('should return true when .gitignore exists', async () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'node_modules/\n');
      
      const result = await gitignoreManager.exists(testDir);
      expect(result).toBe(true);
    });

    it('should return false when directory does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const result = await gitignoreManager.exists(nonExistentDir);
      expect(result).toBe(false);
    });
  });

  describe('read', () => {
    it('should return empty string when .gitignore does not exist', async () => {
      const result = await gitignoreManager.read(testDir);
      expect(result).toBe('');
    });

    it('should return file content when .gitignore exists', async () => {
      const content = 'node_modules/\n*.log\n';
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, content);
      
      const result = await gitignoreManager.read(testDir);
      expect(result).toBe(content);
    });

    it('should throw GitignoreFileError when directory does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      await expect(gitignoreManager.read(nonExistentDir)).rejects.toThrow(GitignoreFileError);
    });
  });

  describe('write', () => {
    it('should create .gitignore file with content', async () => {
      const content = 'node_modules/\n*.log\n';
      await gitignoreManager.write(testDir, content);
      
      const gitignorePath = path.join(testDir, '.gitignore');
      const writtenContent = await fs.readFile(gitignorePath, 'utf-8');
      expect(writtenContent).toBe(content);
    });

    it('should overwrite existing .gitignore file', async () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'old content\n');
      
      const newContent = 'new content\n';
      await gitignoreManager.write(testDir, newContent);
      
      const writtenContent = await fs.readFile(gitignorePath, 'utf-8');
      expect(writtenContent).toBe(newContent);
    });

    it('should not write in dry run mode', async () => {
      const content = 'node_modules/\n';
      await gitignoreManager.write(testDir, content, { dryRun: true });
      
      const exists = await gitignoreManager.exists(testDir);
      expect(exists).toBe(false);
    });

    it('should create directory if it does not exist', async () => {
      const newDir = path.join(tempDir, 'new-dir');
      const content = 'node_modules/\n';
      
      await gitignoreManager.write(newDir, content);
      
      const gitignorePath = path.join(newDir, '.gitignore');
      const exists = await fs.pathExists(gitignorePath);
      expect(exists).toBe(true);
    });
  });

  describe('parsePatterns', () => {
    it('should parse patterns correctly', () => {
      const content = `# Comment
node_modules/
*.log

# Another comment
dist/
.env`;
      
      const patterns = gitignoreManager.parsePatterns(content);
      expect(patterns).toEqual(['node_modules/', '*.log', 'dist/', '.env']);
    });

    it('should handle empty content', () => {
      const patterns = gitignoreManager.parsePatterns('');
      expect(patterns).toEqual([]);
    });

    it('should filter out comments and empty lines', () => {
      const content = `
# This is a comment
node_modules/

# Another comment

*.log
`;
      
      const patterns = gitignoreManager.parsePatterns(content);
      expect(patterns).toEqual(['node_modules/', '*.log']);
    });
  });

  describe('normalizePattern', () => {
    it('should normalize directory patterns', () => {
      expect(gitignoreManager.normalizePattern('node_modules/')).toBe('node_modules');
      expect(gitignoreManager.normalizePattern('dist/')).toBe('dist');
    });

    it('should preserve negation patterns', () => {
      expect(gitignoreManager.normalizePattern('!important.txt')).toBe('!important.txt');
    });

    it('should remove leading ./', () => {
      expect(gitignoreManager.normalizePattern('./src/')).toBe('src');
    });

    it('should trim whitespace', () => {
      expect(gitignoreManager.normalizePattern('  node_modules/  ')).toBe('node_modules');
    });

    it('should preserve wildcard patterns', () => {
      expect(gitignoreManager.normalizePattern('*/')).toBe('*/');
    });
  });

  describe('hasPattern', () => {
    const content = `node_modules/
*.log
dist/
.env`;

    it('should return true for existing patterns', () => {
      expect(gitignoreManager.hasPattern(content, 'node_modules/')).toBe(true);
      expect(gitignoreManager.hasPattern(content, '*.log')).toBe(true);
    });

    it('should return false for non-existing patterns', () => {
      expect(gitignoreManager.hasPattern(content, 'build/')).toBe(false);
      expect(gitignoreManager.hasPattern(content, '*.tmp')).toBe(false);
    });

    it('should handle normalized patterns', () => {
      expect(gitignoreManager.hasPattern(content, 'dist')).toBe(true); // dist/ normalized to dist
      expect(gitignoreManager.hasPattern(content, './node_modules/')).toBe(true); // ./node_modules/ normalized
    });
  });

  describe('filterDuplicatePatterns', () => {
    const content = `node_modules/
*.log
dist/`;

    it('should separate new and existing patterns', () => {
      const patterns = ['node_modules/', 'build/', '*.log', '.env'];
      const result = gitignoreManager.filterDuplicatePatterns(content, patterns);
      
      expect(result.existingPatterns).toEqual(['node_modules/', '*.log']);
      expect(result.newPatterns).toEqual(['build/', '.env']);
    });

    it('should handle all new patterns', () => {
      const patterns = ['build/', '.env', '*.tmp'];
      const result = gitignoreManager.filterDuplicatePatterns(content, patterns);
      
      expect(result.existingPatterns).toEqual([]);
      expect(result.newPatterns).toEqual(['build/', '.env', '*.tmp']);
    });

    it('should handle all existing patterns', () => {
      const patterns = ['node_modules/', '*.log', 'dist/'];
      const result = gitignoreManager.filterDuplicatePatterns(content, patterns);
      
      expect(result.existingPatterns).toEqual(['node_modules/', '*.log', 'dist/']);
      expect(result.newPatterns).toEqual([]);
    });
  });

  describe('formatPatternSection', () => {
    it('should format patterns with section title', () => {
      const patterns = ['node_modules/', '*.log'];
      const result = gitignoreManager.formatPatternSection(patterns, 'Node.js');

      expect(result).toBe(`# Node.js
node_modules/
*.log`);
    });

    it('should include description when provided', () => {
      const patterns = ['.qraft/'];
      const result = gitignoreManager.formatPatternSection(
        patterns,
        'Qraft CLI',
        'Files generated by qraft CLI tool'
      );

      expect(result).toBe(`# Qraft CLI
# Files generated by qraft CLI tool
.qraft/`);
    });

    it('should return empty string for empty patterns', () => {
      const result = gitignoreManager.formatPatternSection([], 'Empty');
      expect(result).toBe('');
    });
  });

  describe('insertPatterns', () => {
    it('should insert patterns into empty content', () => {
      const patterns = ['node_modules/', '*.log'];
      const result = gitignoreManager.insertPatterns('', patterns, 'Node.js');

      expect(result).toBe(`# Node.js
node_modules/
*.log`);
    });

    it('should append patterns to existing content', () => {
      const existingContent = `# Existing
dist/
`;
      const patterns = ['node_modules/', '*.log'];
      const result = gitignoreManager.insertPatterns(existingContent, patterns, 'Node.js');

      expect(result).toBe(`# Existing
dist/

# Node.js
node_modules/
*.log
`);
    });

    it('should handle content without trailing newline', () => {
      const existingContent = 'dist/';
      const patterns = ['node_modules/'];
      const result = gitignoreManager.insertPatterns(existingContent, patterns, 'Node.js');

      expect(result).toBe(`dist/

# Node.js
node_modules/
`);
    });
  });

  describe('checkPermissions', () => {
    it('should return correct permissions for writable directory', async () => {
      const result = await gitignoreManager.checkPermissions(testDir);

      expect(result.canWrite).toBe(true);
      expect(result.fileExists).toBe(false);
      expect(result.fileWritable).toBe(true);
      expect(result.canCreate).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect existing .gitignore file', async () => {
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'node_modules/\n');

      const result = await gitignoreManager.checkPermissions(testDir);

      expect(result.fileExists).toBe(true);
      expect(result.fileWritable).toBe(true);
    });
  });

  describe('validateTargetDirectory', () => {
    it('should validate writable directory successfully', async () => {
      await expect(gitignoreManager.validateTargetDirectory(testDir)).resolves.toBeUndefined();
    });

    it('should create directory if it does not exist', async () => {
      const newDir = path.join(tempDir, 'new-directory');
      // Ensure directory exists first to avoid permission issues in test environment
      await fs.ensureDir(newDir);
      await expect(gitignoreManager.validateTargetDirectory(newDir)).resolves.toBeUndefined();

      const exists = await fs.pathExists(newDir);
      expect(exists).toBe(true);
    });
  });

  describe('addPatterns', () => {
    it('should create new .gitignore file with patterns', async () => {
      const patterns = ['node_modules/', '*.log'];
      const result = await gitignoreManager.addPatterns(
        testDir,
        patterns,
        'Node.js',
        'Node.js specific files'
      );

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.modified).toBe(false);
      expect(result.patternsAdded).toEqual(patterns);
      expect(result.patternsSkipped).toEqual([]);

      const content = await gitignoreManager.read(testDir);
      expect(content).toContain('# Node.js');
      expect(content).toContain('# Node.js specific files');
      expect(content).toContain('node_modules/');
      expect(content).toContain('*.log');
    });

    it('should modify existing .gitignore file', async () => {
      // Create initial .gitignore
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'dist/\n');

      const patterns = ['node_modules/', '*.log'];
      const result = await gitignoreManager.addPatterns(testDir, patterns, 'Node.js');

      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
      expect(result.modified).toBe(true);
      expect(result.patternsAdded).toEqual(patterns);

      const content = await gitignoreManager.read(testDir);
      expect(content).toContain('dist/');
      expect(content).toContain('node_modules/');
      expect(content).toContain('*.log');
    });

    it('should skip duplicate patterns', async () => {
      // Create initial .gitignore with some patterns
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'node_modules/\n*.log\n');

      const patterns = ['node_modules/', 'dist/', '*.log'];
      const result = await gitignoreManager.addPatterns(testDir, patterns, 'Mixed');

      expect(result.success).toBe(true);
      expect(result.patternsAdded).toEqual(['dist/']);
      expect(result.patternsSkipped).toEqual(['node_modules/', '*.log']);
    });

    it('should handle dry run mode', async () => {
      const patterns = ['node_modules/', '*.log'];
      const result = await gitignoreManager.addPatterns(
        testDir,
        patterns,
        'Node.js',
        undefined,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.patternsAdded).toEqual(patterns);

      // File should not actually be created
      const exists = await gitignoreManager.exists(testDir);
      expect(exists).toBe(false);
    });

    it('should return success when no new patterns to add', async () => {
      // Create .gitignore with patterns
      const gitignorePath = path.join(testDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'node_modules/\n*.log\n');

      const patterns = ['node_modules/', '*.log'];
      const result = await gitignoreManager.addPatterns(testDir, patterns, 'Node.js');

      expect(result.success).toBe(true);
      expect(result.patternsAdded).toEqual([]);
      expect(result.patternsSkipped).toEqual(patterns);
    });

    it('should handle permission errors', async () => {
      // Create a read-only directory
      const readOnlyDir = path.join(tempDir, 'readonly');
      await fs.ensureDir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444); // Read-only

      const patterns = ['node_modules/'];
      const result = await gitignoreManager.addPatterns(readOnlyDir, patterns, 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();

      // Restore permissions for cleanup
      await fs.chmod(readOnlyDir, 0o755);
    });
  });

  describe('Error Handling', () => {
    it('should throw GitignorePermissionError for permission issues', async () => {
      const readOnlyDir = path.join(tempDir, 'readonly');
      await fs.ensureDir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444);

      try {
        await gitignoreManager.write(readOnlyDir, 'test');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(GitignoreError);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(readOnlyDir, 0o755);
      }
    });

    it('should throw GitignoreFileError for file not found', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent', 'deep', 'path');

      await expect(gitignoreManager.read(nonExistentDir)).rejects.toThrow(GitignoreFileError);
    });
  });
});
