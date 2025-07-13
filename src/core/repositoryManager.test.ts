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
      // Mock GitHub API to throw an error
      const { Octokit } = require('@octokit/rest');
      const mockOctokit = new Octokit();
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('Repository not found'));

      const result = await repositoryManager.createBox(
        'test-owner',
        'test-repo',
        'test-box',
        tempDir,
        testManifest
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create box in repository');
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
      // Mock permission checker to return write access
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

      // Mock pull request creator
      const mockPullRequestCreator = require('./pullRequestCreator').PullRequestCreator;
      mockPullRequestCreator.prototype.createPullRequest.mockResolvedValue({
        success: true,
        prUrl: 'https://github.com/test-owner/test-repo/pull/1',
        prNumber: 1,
        title: 'Add test-box box',
        description: 'Auto-generated PR',
        message: 'PR created successfully',
        nextSteps: []
      });

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
      expect(mockPullRequestCreator.prototype.createPullRequest).toHaveBeenCalled();
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

      // Mock permission checker and GitHub API
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

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
      // The test passes if no errors are thrown during file processing
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
        'test-owner/test-repo',
        'test-box'
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
});
