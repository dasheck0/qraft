import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest } from '../types';
import { RepositoryManager } from './repositoryManager';

// Mock the dependencies
jest.mock('./permissionChecker');
jest.mock('./repositoryForker');
jest.mock('./pullRequestCreator');
jest.mock('./manifestManager');
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
      // Mock permission checker to return write access
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

      // Mock GitHub API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ object: { sha: 'base-sha' } })
        } as any) // getRef
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tree: { sha: 'tree-sha' } })
        } as any) // getCommit
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-tree-sha' })
        } as any) // createTree
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sha: 'new-commit-sha' })
        } as any) // createCommit
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({})
        } as any); // updateRef

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
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: false, canFork: true, canRead: true }
      });

      // Mock repository forker
      const mockRepositoryForker = require('./repositoryForker').RepositoryForker;
      mockRepositoryForker.prototype.forkRepository.mockResolvedValue({
        success: true,
        forkOwner: 'user',
        forkName: 'test-repo',
        forkUrl: 'https://github.com/user/test-repo',
        message: 'Fork created successfully',
        nextSteps: []
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
      expect(mockRepositoryForker.prototype.forkRepository).toHaveBeenCalledWith('test-owner', 'test-repo');
    });

    it('should handle GitHub API errors gracefully', async () => {
      // Mock permission checker to return write access
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

      // Mock GitHub API to return error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Repository not found' })
      } as any);

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
      // Mock permission checker to return write access
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

      // Mock manifest manager
      const mockManifestManager = require('./manifestManager').ManifestManager;
      mockManifestManager.prototype.storeLocalManifest = jest.fn().mockResolvedValue(undefined);

      // Mock successful GitHub API calls
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' })
        } as any)
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
      expect(mockManifestManager.prototype.storeLocalManifest).toHaveBeenCalledWith(
        tempDir,
        testManifest,
        'test-owner/test-repo',
        'test-owner/test-repo/test-box'
      );
    });

    it('should handle manifest storage errors gracefully', async () => {
      // Mock permission checker to return write access
      const mockPermissionChecker = require('./permissionChecker').PermissionChecker;
      mockPermissionChecker.prototype.checkRepositoryPermissions.mockResolvedValue({
        permissions: { canWrite: true, canFork: true, canRead: true }
      });

      // Mock manifest manager to throw error
      const mockManifestManager = require('./manifestManager').ManifestManager;
      mockManifestManager.prototype.storeLocalManifest = jest.fn().mockRejectedValue(
        new Error('Manifest storage failed')
      );

      // Mock successful GitHub API calls
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' })
        } as any)
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
