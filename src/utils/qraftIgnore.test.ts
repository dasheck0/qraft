import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { QraftIgnore, QRAFTIGNORE_FILENAME, shouldIgnorePath } from './qraftIgnore';

describe('shouldIgnorePath', () => {
  describe('simple patterns (no slash)', () => {
    it('should ignore a path whose filename matches the pattern', () => {
      expect(shouldIgnorePath('node_modules', ['node_modules'])).toBe(true);
    });

    it('should ignore a nested path when any segment matches the pattern', () => {
      expect(shouldIgnorePath('src/node_modules/lodash/index.js', ['node_modules'])).toBe(true);
    });

    it('should not ignore a path with no matching segment', () => {
      expect(shouldIgnorePath('src/index.ts', ['node_modules'])).toBe(false);
    });

    it('should ignore a directory-only entry whose name matches', () => {
      expect(shouldIgnorePath('.git', ['.git'])).toBe(true);
    });

    it('should ignore deeply nested matching segment', () => {
      expect(shouldIgnorePath('a/b/c/dist/bundle.js', ['dist'])).toBe(true);
    });

    it('should not ignore an unrelated path', () => {
      expect(shouldIgnorePath('src/utils/helper.ts', ['dist', 'build'])).toBe(false);
    });
  });

  describe('glob patterns with wildcard *', () => {
    it('should ignore a file matching a *.log pattern', () => {
      expect(shouldIgnorePath('error.log', ['*.log'])).toBe(true);
    });

    it('should ignore a nested file matching *.log', () => {
      expect(shouldIgnorePath('logs/app.log', ['*.log'])).toBe(true);
    });

    it('should not ignore a file that does not match the glob', () => {
      expect(shouldIgnorePath('src/app.ts', ['*.log'])).toBe(false);
    });

    it('should ignore compiled Python files via *.pyc', () => {
      expect(shouldIgnorePath('src/__pycache__/module.pyc', ['*.pyc'])).toBe(true);
    });

    it('should not match partial segment with glob when name differs', () => {
      expect(shouldIgnorePath('src/changelog.md', ['*.log'])).toBe(false);
    });
  });

  describe('anchored patterns (leading slash)', () => {
    it('should ignore a root-level entry matching the anchored pattern', () => {
      expect(shouldIgnorePath('dist', ['/dist'])).toBe(true);
    });

    it('should not ignore a nested entry with an anchored pattern', () => {
      expect(shouldIgnorePath('src/dist/bundle.js', ['/dist'])).toBe(false);
    });

    it('should strip trailing slash from anchored pattern before matching', () => {
      expect(shouldIgnorePath('.qraft', ['/.qraft/'])).toBe(true);
    });

    it('should not ignore sibling root entry that does not match', () => {
      expect(shouldIgnorePath('src', ['/dist'])).toBe(false);
    });
  });

  describe('slash-containing patterns (not anchored)', () => {
    it('should match a pattern that contains a slash against the full path', () => {
      expect(shouldIgnorePath('config/database.yml', ['config/database.yml'])).toBe(true);
    });

    it('should not match when full path differs', () => {
      expect(shouldIgnorePath('config/app.yml', ['config/database.yml'])).toBe(false);
    });
  });

  describe('trailing-slash normalisation', () => {
    it('should treat a pattern with trailing slash the same as without', () => {
      expect(shouldIgnorePath('node_modules', ['node_modules/'])).toBe(true);
    });

    it('should treat a path with trailing slash the same as without', () => {
      expect(shouldIgnorePath('node_modules/', ['node_modules'])).toBe(true);
    });
  });

  describe('Windows-style path separators', () => {
    it('should normalise backslashes in the path before matching', () => {
      expect(shouldIgnorePath('src\\node_modules\\lodash', ['node_modules'])).toBe(true);
    });
  });

  describe('multiple patterns', () => {
    it('should return true when any pattern matches', () => {
      expect(shouldIgnorePath('dist/bundle.js', ['node_modules', 'dist', '.git'])).toBe(true);
    });

    it('should return false when no pattern matches', () => {
      expect(shouldIgnorePath('src/index.ts', ['node_modules', 'dist', '.git'])).toBe(false);
    });
  });

  describe('empty inputs', () => {
    it('should return false for an empty patterns array', () => {
      expect(shouldIgnorePath('node_modules', [])).toBe(false);
    });

    it('should return false for an empty path with no matching patterns', () => {
      expect(shouldIgnorePath('', ['node_modules'])).toBe(false);
    });
  });
});

describe('QraftIgnore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qraftignore-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('create', () => {
    it('should create an instance even when no .qraftignore file exists', async () => {
      const ignore = await QraftIgnore.create(tempDir);
      expect(ignore).toBeInstanceOf(QraftIgnore);
    });

    it('should load user patterns from .qraftignore when the file exists', async () => {
      await fs.writeFile(
        path.join(tempDir, QRAFTIGNORE_FILENAME),
        'my-custom-dir\n*.secret\n'
      );

      const ignore = await QraftIgnore.create(tempDir);

      expect(ignore.ignores('my-custom-dir')).toBe(true);
      expect(ignore.ignores('config.secret')).toBe(true);
    });

    it('should strip comment lines from .qraftignore', async () => {
      await fs.writeFile(
        path.join(tempDir, QRAFTIGNORE_FILENAME),
        '# this is a comment\ncustom-dir\n'
      );

      const ignore = await QraftIgnore.create(tempDir);

      expect(ignore.ignores('custom-dir')).toBe(true);
      // The comment itself must not be treated as a pattern
      expect(ignore.ignores('# this is a comment')).toBe(false);
    });

    it('should strip blank lines from .qraftignore', async () => {
      await fs.writeFile(
        path.join(tempDir, QRAFTIGNORE_FILENAME),
        '\n\ncustom-dir\n\n'
      );

      const ignore = await QraftIgnore.create(tempDir);

      expect(ignore.ignores('custom-dir')).toBe(true);
    });

    it('should merge built-in patterns with user patterns', async () => {
      await fs.writeFile(
        path.join(tempDir, QRAFTIGNORE_FILENAME),
        'my-artifacts\n'
      );

      const ignore = await QraftIgnore.create(tempDir);

      // Built-in pattern still active
      expect(ignore.ignores('node_modules')).toBe(true);
      // User pattern also active
      expect(ignore.ignores('my-artifacts')).toBe(true);
    });
  });

  describe('ignores — built-in patterns', () => {
    let ignore: QraftIgnore;

    beforeEach(async () => {
      ignore = await QraftIgnore.create(tempDir);
    });

    it('should ignore .qraft directory', () => {
      expect(ignore.ignores('.qraft')).toBe(true);
    });

    it('should ignore files inside .qraft', () => {
      expect(ignore.ignores('.qraft/manifest.json')).toBe(true);
    });

    it('should ignore node_modules', () => {
      expect(ignore.ignores('node_modules')).toBe(true);
    });

    it('should ignore nested node_modules', () => {
      expect(ignore.ignores('packages/core/node_modules/lodash/index.js')).toBe(true);
    });

    it('should ignore .git', () => {
      expect(ignore.ignores('.git')).toBe(true);
    });

    it('should ignore .git objects', () => {
      expect(ignore.ignores('.git/objects/abc123')).toBe(true);
    });

    it('should ignore dist directory', () => {
      expect(ignore.ignores('dist')).toBe(true);
    });

    it('should ignore build directory', () => {
      expect(ignore.ignores('build')).toBe(true);
    });

    it('should ignore coverage directory', () => {
      expect(ignore.ignores('coverage')).toBe(true);
    });

    it('should ignore .cache directory', () => {
      expect(ignore.ignores('.cache')).toBe(true);
    });

    it('should ignore tmp directory', () => {
      expect(ignore.ignores('tmp')).toBe(true);
    });

    it('should ignore temp directory', () => {
      expect(ignore.ignores('temp')).toBe(true);
    });

    it('should ignore .vscode directory', () => {
      expect(ignore.ignores('.vscode')).toBe(true);
    });

    it('should ignore .idea directory', () => {
      expect(ignore.ignores('.idea')).toBe(true);
    });

    it('should ignore *.log files', () => {
      expect(ignore.ignores('error.log')).toBe(true);
    });

    it('should ignore *.pyc files', () => {
      expect(ignore.ignores('module.pyc')).toBe(true);
    });

    it('should ignore *.class files', () => {
      expect(ignore.ignores('Main.class')).toBe(true);
    });

    it('should NOT ignore a normal source file', () => {
      expect(ignore.ignores('src/index.ts')).toBe(false);
    });

    it('should NOT ignore a README', () => {
      expect(ignore.ignores('README.md')).toBe(false);
    });

    it('should NOT ignore package.json', () => {
      expect(ignore.ignores('package.json')).toBe(false);
    });

    it('should NOT ignore a nested source file', () => {
      expect(ignore.ignores('src/core/boxManager.ts')).toBe(false);
    });
  });

  describe('getPatterns', () => {
    it('should return all active patterns including built-ins', async () => {
      const ignore = await QraftIgnore.create(tempDir);
      const patterns = ignore.getPatterns();

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain('node_modules');
      expect(patterns).toContain('.qraft');
    });

    it('should return a copy, not the internal array', async () => {
      const ignore = await QraftIgnore.create(tempDir);
      const patterns = ignore.getPatterns();
      const originalLength = patterns.length;

      patterns.push('injected-pattern');

      expect(ignore.getPatterns().length).toBe(originalLength);
    });

    it('should include user patterns when .qraftignore is present', async () => {
      await fs.writeFile(
        path.join(tempDir, QRAFTIGNORE_FILENAME),
        'my-custom-output\n'
      );

      const ignore = await QraftIgnore.create(tempDir);
      expect(ignore.getPatterns()).toContain('my-custom-output');
    });
  });

  describe('getBuiltinPatterns', () => {
    it('should return the built-in patterns array', () => {
      const patterns = QraftIgnore.getBuiltinPatterns();

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain('node_modules');
      expect(patterns).toContain('.qraft');
      expect(patterns).toContain('.git');
    });

    it('should return a copy so mutations do not affect future calls', () => {
      const first = QraftIgnore.getBuiltinPatterns();
      first.push('tampered');

      const second = QraftIgnore.getBuiltinPatterns();
      expect(second).not.toContain('tampered');
    });
  });

  describe('QRAFTIGNORE_FILENAME constant', () => {
    it('should equal .qraftignore', () => {
      expect(QRAFTIGNORE_FILENAME).toBe('.qraftignore');
    });
  });
});
