import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest } from '../types';
import { RepositoryManager } from './repositoryManager';

// Mock the Octokit module to avoid ES module issues
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue({
          data: { default_branch: 'main' }
        }),
        createFork: jest.fn().mockResolvedValue({
          data: { full_name: 'test-user/test-repo' }
        }),
        getContent: jest.fn().mockResolvedValue({
          data: { content: 'base64content' }
        }),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({
          data: { commit: { sha: 'new-commit-sha' } }
        })
      },
      pulls: {
        create: jest.fn().mockResolvedValue({
          data: { number: 1, html_url: 'https://github.com/test-owner/test-repo/pull/1' }
        }),
        list: jest.fn().mockResolvedValue({
          data: []
        })
      },
      git: {
        createRef: jest.fn().mockResolvedValue({
          data: { ref: 'refs/heads/new-branch' }
        }),
        getRef: jest.fn().mockResolvedValue({
          data: { object: { sha: 'base-commit-sha' } }
        }),
        getCommit: jest.fn().mockResolvedValue({
          data: { tree: { sha: 'base-tree-sha' } }
        }),
        createTree: jest.fn().mockResolvedValue({
          data: { sha: 'new-tree-sha' }
        }),
        createCommit: jest.fn().mockResolvedValue({
          data: { sha: 'new-commit-sha' }
        }),
        updateRef: jest.fn().mockResolvedValue({
          data: { ref: 'refs/heads/main' }
        })
      }
    }
  }))
}));

// Mock the dependencies with proper implementations
const mockPermissionChecker = {
  checkRepositoryPermissions: jest.fn().mockResolvedValue({
    permissions: { canWrite: true, canFork: true, canRead: true }
  })
};

const mockRepositoryForker = {
  forkRepository: jest.fn().mockResolvedValue({
    success: true,
    forkOwner: 'test-user',
    forkName: 'test-repo'
  })
};

const mockPullRequestCreator = {
  createPullRequest: jest.fn().mockResolvedValue({
    success: true,
    prUrl: 'https://github.com/test-owner/test-repo/pull/1',
    prNumber: 1
  })
};

const mockManifestManager = {
  storeLocalManifest: jest.fn().mockResolvedValue(undefined)
};

jest.mock('./permissionChecker', () => ({
  PermissionChecker: jest.fn().mockImplementation(() => mockPermissionChecker)
}));

jest.mock('./repositoryForker', () => ({
  RepositoryForker: jest.fn().mockImplementation(() => mockRepositoryForker)
}));

jest.mock('./pullRequestCreator', () => ({
  PullRequestCreator: jest.fn().mockImplementation(() => mockPullRequestCreator)
}));

jest.mock('./manifestManager', () => ({
  ManifestManager: jest.fn().mockImplementation(() => mockManifestManager)
}));

jest.mock('@octokit/rest');

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock fetch for GitHub API calls
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('RepositoryManager', () => {
  let repositoryManager: RepositoryManager;
  let tempDir: string;
  let testManifest: BoxManifest;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `qraft-test-${Date.now()}`);
    
    repositoryManager = new RepositoryManager('test-token');
    
    testManifest = {
      name: 'test-box',
      description: 'A test box',
      version: '1.0.0',
      author: 'Test Author',
      tags: ['test', 'example'],
      defaultTarget: './test-target'
    };

    // Mock fs operations
    (mockFs.readdir as any).mockResolvedValue([
      { name: 'file1.js', isDirectory: () => false, isFile: () => true } as any,
      { name: 'file2.md', isDirectory: () => false, isFile: () => true } as any
    ]);

    (mockFs.readFile as any).mockImplementation((filePath: string) => {
      if (filePath.includes('file1.js')) {
        return Promise.resolve(Buffer.from('console.log("test");'));
      }
      if (filePath.includes('file2.md')) {
        return Promise.resolve(Buffer.from('# Test README'));
      }
      return Promise.resolve(Buffer.from(''));
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('createBox', () => {
    it('should create a box successfully with write permissions', async () => {
      // Permission checker is already mocked globally

      // GitHub API is already mocked globally

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('created successfully');
      expect(result.boxPath).toBe('test-box');
      expect(result.commitSha).toBe('new-commit-sha');
    });

    it('should fork repository when user lacks write permissions', async () => {
      // Mock permission checker to return no write access
      mockPermissionChecker.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: false, canFork: true, canRead: true }
      });

      // Mock GitHub API responses for the fork
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ object: { sha: 'base-sha' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tree: { sha: 'tree-sha' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-tree-sha' })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-commit-sha' })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({})
        } as any);

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      expect(mockRepositoryForker.forkRepository).toHaveBeenCalledWith('test-owner', 'test-repo');
    });

    it('should handle GitHub API errors gracefully', async () => {
      // Create a failing permission checker that throws an error
      const failingPermissionChecker = {
        checkRepositoryPermissions: jest.fn().mockRejectedValue(new Error('GitHub API error: Repository not found'))
      };

      const failingRepositoryManager = new RepositoryManager('fake-token');
      // Replace the internal permission checker instance
      (failingRepositoryManager as any).permissionChecker = failingPermissionChecker;

      const result = await failingRepositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create box');
      expect(result.nextSteps).toContain('Check your GitHub token permissions');
    });

    it('should handle missing GitHub token', async () => {
      const repositoryManagerNoToken = new RepositoryManager();

      const result = await repositoryManagerNoToken.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('GitHub token required');
    });

    it('should create pull request when requested', async () => {
      // Permission checker is already mocked globally

      // Pull request creator is already mocked globally

      // Mock GitHub API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ object: { sha: 'base-sha' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tree: { sha: 'tree-sha' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-tree-sha' })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-commit-sha' })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({})
        } as any);

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest,
        undefined, // remotePath
        { createPR: true }
      );

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe('https://github.com/test-owner/test-repo/pull/1');
      expect(result.prNumber).toBe(1);
      expect(mockPullRequestCreator.createPullRequest).toHaveBeenCalled();
    });
  });

  describe('file handling', () => {
    it('should correctly identify text files', async () => {
      // This tests the private isTextFile method indirectly through file processing
      (mockFs.readdir as any).mockResolvedValue([
        { name: 'script.js', isDirectory: () => false, isFile: () => true } as any,
        { name: 'image.png', isDirectory: () => false, isFile: () => true } as any,
        { name: 'README.md', isDirectory: () => false, isFile: () => true } as any
      ]);

      (mockFs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.includes('script.js')) {
          return Promise.resolve(Buffer.from('console.log("test");'));
        }
        if (filePath.includes('image.png')) {
          return Promise.resolve(Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header
        }
        if (filePath.includes('README.md')) {
          return Promise.resolve(Buffer.from('# Test'));
        }
        return Promise.resolve(Buffer.from(''));
      });

      // Permission checker and GitHub API are already mocked globally

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      // The test passes if no errors are thrown during file processing
    });

    it('should correctly encode text and binary files for GitHub API', async () => {
      // Mock files with different types
      (mockFs.readdir as any).mockResolvedValue([
        { name: 'text.js', isDirectory: () => false, isFile: () => true } as any,
        { name: 'binary.png', isDirectory: () => false, isFile: () => true } as any
      ]);

      (mockFs.readFile as any).mockImplementation((filePath: string) => {
        if (filePath.includes('text.js')) {
          return Promise.resolve(Buffer.from('console.log("Hello World");'));
        }
        if (filePath.includes('binary.png')) {
          return Promise.resolve(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])); // PNG header
        }
        return Promise.resolve(Buffer.from(''));
      });

      // Capture the tree data sent to GitHub API
      let capturedTree: any[] = [];
      const { Octokit } = require('@octokit/rest');
      const mockCreateTree = jest.fn().mockImplementation((params: any) => {
        capturedTree = params.tree;
        return Promise.resolve({ data: { sha: 'new-tree-sha' } });
      });

      // Override the createTree mock for this test
      Octokit.mockImplementation(() => ({
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({
              data: { default_branch: 'main' }
            })
          },
          git: {
            getRef: jest.fn().mockResolvedValue({
              data: { object: { sha: 'base-commit-sha' } }
            }),
            getCommit: jest.fn().mockResolvedValue({
              data: { tree: { sha: 'base-tree-sha' } }
            }),
            createTree: mockCreateTree,
            createCommit: jest.fn().mockResolvedValue({
              data: { sha: 'new-commit-sha' }
            }),
            updateRef: jest.fn().mockResolvedValue({
              data: { ref: 'refs/heads/main' }
            })
          }
        }
      }));

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      expect(mockCreateTree).toHaveBeenCalled();

      // Verify that text files are encoded as UTF-8 strings
      const textFile = capturedTree.find(item => item.path.includes('text.js'));
      expect(textFile).toBeDefined();
      expect(textFile.encoding).toBe('utf-8');
      expect(textFile.content).toBe('console.log("Hello World");');

      // Verify that binary files are encoded as base64 strings
      const binaryFile = capturedTree.find(item => item.path.includes('binary.png'));
      expect(binaryFile).toBeDefined();
      expect(binaryFile.encoding).toBe('base64');
      expect(typeof binaryFile.content).toBe('string');
      // The content should be base64 encoded PNG header
      expect(binaryFile.content).toBe(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).toString('base64'));
    });
  });

  describe('manifest storage integration', () => {
    it('should store local manifest copy after successful box creation', async () => {
      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      expect(mockManifestManager.storeLocalManifest).toHaveBeenCalledWith(
        tempDir,
        testManifest,
        'test-user/test-repo',
        'test-user/test-repo/test-box'
      );
    });

    it('should handle manifest storage errors gracefully', async () => {
      // Mock manifest manager to throw error
      mockManifestManager.storeLocalManifest.mockRejectedValue(
        new Error('Manifest storage failed')
      );

      // Box creation should still succeed even if manifest storage fails
      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('created successfully');
    });

    it('should provide access to manifest manager', () => {
      const manifestManager = repositoryManager.getManifestManager();
      expect(manifestManager).toBeDefined();
    });
  });

  describe('collectFiles ignore integration', () => {
    /**
     * These tests verify that collectFiles (called internally by createBox)
     * skips paths matched by QraftIgnore — without touching the GitHub API.
     * We capture the tree sent to git.createTree to inspect which files
     * were actually included.
     */

    function makeOctokitWithTreeCapture(onTree: (tree: any[]) => void) {
      const { Octokit } = require('@octokit/rest');
      Octokit.mockImplementation(() => ({
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } })
          },
          git: {
            getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'base-sha' } } }),
            getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree-sha' } } }),
            createTree: jest.fn().mockImplementation((params: any) => {
              onTree(params.tree);
              return Promise.resolve({ data: { sha: 'new-tree-sha' } });
            }),
            createCommit: jest.fn().mockResolvedValue({ data: { sha: 'new-commit-sha' } }),
            updateRef: jest.fn().mockResolvedValue({ data: {} })
          }
        }
      }));
    }

    it('should exclude node_modules from uploaded files', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'index.ts', isDirectory: () => false, isFile: () => true },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false }
          ]);
        }
        // node_modules contents — should never be reached
        return Promise.resolve([
          { name: 'lodash', isDirectory: () => true, isFile: () => false }
        ]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('export {}'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('node_modules'))).toBe(false);
      expect(paths.some(p => p.includes('index.ts'))).toBe(true);
    });

    it('should exclude .qraft directory from uploaded files', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
            { name: '.qraft', isDirectory: () => true, isFile: () => false }
          ]);
        }
        return Promise.resolve([
          { name: 'manifest.json', isDirectory: () => false, isFile: () => true }
        ]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('# README'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('.qraft'))).toBe(false);
      expect(paths.some(p => p.includes('README.md'))).toBe(true);
    });

    it('should exclude .git directory from uploaded files', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false }
          ]);
        }
        if (dirPath.endsWith('src')) {
          return Promise.resolve([
            { name: 'main.ts', isDirectory: () => false, isFile: () => true }
          ]);
        }
        return Promise.resolve([]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('// main'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('.git'))).toBe(false);
      expect(paths.some(p => p.includes('main.ts'))).toBe(true);
    });

    it('should exclude dist directory from uploaded files', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
            { name: 'dist', isDirectory: () => true, isFile: () => false }
          ]);
        }
        return Promise.resolve([
          { name: 'index.js', isDirectory: () => false, isFile: () => true }
        ]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('{}'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('dist'))).toBe(false);
      expect(paths.some(p => p.includes('package.json'))).toBe(true);
    });

    it('should exclude *.log files from uploaded files', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'app.log', isDirectory: () => false, isFile: () => true },
            { name: 'index.ts', isDirectory: () => false, isFile: () => true }
          ]);
        }
        return Promise.resolve([]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('data'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('app.log'))).toBe(false);
      expect(paths.some(p => p.includes('index.ts'))).toBe(true);
    });

    it('should include normal source files that are not ignored', async () => {
      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false }
          ]);
        }
        if (dirPath.endsWith('src')) {
          return Promise.resolve([
            { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
            { name: 'config.ts', isDirectory: () => false, isFile: () => true }
          ]);
        }
        return Promise.resolve([]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from('export const x = 1;'));

      let capturedTree: any[] = [];
      makeOctokitWithTreeCapture(tree => { capturedTree = tree; });

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const paths = capturedTree.map((f: any) => f.path as string);
      expect(paths.some(p => p.includes('utils.ts'))).toBe(true);
      expect(paths.some(p => p.includes('config.ts'))).toBe(true);
    });

    it('should not recurse into ignored directories', async () => {
      const readdirCallPaths: string[] = [];

      (mockFs.readdir as any).mockImplementation((dirPath: string) => {
        readdirCallPaths.push(dirPath);
        if (dirPath === tempDir) {
          return Promise.resolve([
            { name: 'src', isDirectory: () => true, isFile: () => false },
            { name: 'node_modules', isDirectory: () => true, isFile: () => false }
          ]);
        }
        if (dirPath.endsWith('src')) {
          return Promise.resolve([
            { name: 'index.ts', isDirectory: () => false, isFile: () => true }
          ]);
        }
        return Promise.resolve([]);
      });
      (mockFs.readFile as any).mockResolvedValue(Buffer.from(''));

      makeOctokitWithTreeCapture(() => {});

      const rm = new RepositoryManager('test-token');
      await rm.createBox('owner', 'repo', 'my-box', tempDir, testManifest);

      const readIntoNodeModules = readdirCallPaths.some(p => p.includes('node_modules'));
      expect(readIntoNodeModules).toBe(false);
    });
  });
});
