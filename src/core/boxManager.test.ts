import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest, BoxReference } from '../types';
import { BoxManager } from './boxManager';

// Mock the dependencies
jest.mock('./cacheManager');
jest.mock('./registryManager');
jest.mock('./manifestManager');
jest.mock('../utils/config');

// Mock @octokit/rest to avoid ES module issues
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      repos: {
        get: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        getCommit: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateRef: jest.fn(),
      },
    },
  })),
}));

describe('BoxManager', () => {
  let boxManager: BoxManager;
  let testBoxRef: BoxReference;
  let testManifest: BoxManifest;
  let tempDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create temporary test directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'boxmanager-test-'));

    // Mock config manager
    const mockConfigManager = require('../utils/config').ConfigManager;
    mockConfigManager.prototype.getConfig = jest.fn().mockResolvedValue({
      defaultRegistry: 'dasheck0',
      registries: {
        dasheck0: {
          name: 'dasheck0',
          repository: 'dasheck0/qraft-boxes',
          isDefault: true
        }
      },
      cache: {
        enabled: true,
        ttl: 3600,
        directory: '/tmp/test-cache'
      }
    });

    // Mock manifest manager
    const mockManifestManager = require('./manifestManager').ManifestManager;
    mockManifestManager.prototype.getLocalManifest = jest.fn().mockResolvedValue(null);
    mockManifestManager.prototype.hasLocalManifest = jest.fn().mockResolvedValue(false);
    mockManifestManager.prototype.storeLocalManifest = jest.fn().mockResolvedValue(undefined);
    mockManifestManager.prototype.compareManifests = jest.fn().mockReturnValue({
      isIdentical: false,
      differences: []
    });

    boxManager = new BoxManager();

    testBoxRef = {
      registry: 'dasheck0',
      boxName: 'test-box',
      fullReference: 'dasheck0/test-box'
    };

    testManifest = {
      name: 'test-box',
      description: 'Test box for unit tests',
      author: 'Test Author',
      version: '1.0.0',
      defaultTarget: './test-target',
      tags: ['test', 'unit'],
      exclude: ['.git/', 'node_modules/']
    };
  });

  afterEach(async () => {
    // Clean up test directory
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('constructor', () => {
    it('should create BoxManager with default config', () => {
      expect(boxManager).toBeDefined();
      expect(boxManager.getConfigManager()).toBeDefined();
      expect(boxManager.getManifestManager()).toBeDefined();
    });

    it('should create BoxManager with provided config', () => {
      const mockConfigManager = require('../utils/config').ConfigManager;
      const customBoxManager = new BoxManager(new mockConfigManager());
      expect(customBoxManager).toBeDefined();
    });
  });

  describe('manifest integration', () => {
    it('should provide access to manifest manager', () => {
      const manifestManager = boxManager.getManifestManager();
      expect(manifestManager).toBeDefined();
    });

    it('should detect box state correctly', async () => {
      // Mock manifest manager methods
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.getLocalManifest = jest.fn().mockResolvedValue(null);

      const testBoxInfo = {
        manifest: testManifest,
        path: '/mock/path',
        files: ['test.txt', 'config.json']
      };

      const state = await boxManager.detectBoxState(testBoxInfo, tempDir);
      expect(state).toBe('new');
    });

    it('should handle local manifest retrieval', async () => {
      const result = await boxManager.getLocalManifest(tempDir);
      expect(result).toBeNull(); // No manifest exists in temp directory
    });

    it('should check for local manifest existence', async () => {
      const hasManifest = await boxManager.hasLocalManifest(tempDir);
      expect(hasManifest).toBe(false); // No manifest exists in temp directory
    });
  });

  describe('box operations with manifest storage', () => {
    beforeEach(() => {
      // Mock the registry manager and cache manager
      const mockRegistryManager = require('./registryManager').RegistryManager;
      const mockCacheManager = require('./cacheManager').CacheManager;
      
      // Mock successful box info retrieval
      mockRegistryManager.prototype.getBoxInfo = jest.fn().mockResolvedValue({
        manifest: testManifest,
        path: '/mock/path',
        files: ['test.txt', 'config.json']
      });
      
      // Mock file download
      mockRegistryManager.prototype.downloadFile = jest.fn().mockResolvedValue(
        Buffer.from('test file content')
      );
      
      // Mock cache operations
      mockCacheManager.prototype.getCachedFile = jest.fn().mockResolvedValue(null);
      mockCacheManager.prototype.setCacheEntry = jest.fn().mockResolvedValue(undefined);
    });

    it('should handle copyBox with manifest storage', async () => {
      // Mock manifest manager to not throw errors
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.storeLocalManifest = jest.fn().mockResolvedValue(undefined);

      const config = {
        boxName: 'test-box',
        targetDirectory: tempDir,
        force: false,
        interactive: false,
        boxesDirectory: ''
      };

      // This should not throw an error
      await expect(boxManager.copyBox(config))
        .resolves
        .not.toThrow();
    });

    it('should handle copyBoxByName with manifest storage', async () => {
      // Mock manifest manager to not throw errors
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.storeLocalManifest = jest.fn().mockResolvedValue(undefined);

      // This should not throw an error
      await expect(boxManager.copyBoxByName('test-box', tempDir, false))
        .resolves
        .not.toThrow();
    });
  });

  describe('manifest synchronization', () => {
    it('should sync manifest when needed', async () => {
      // Mock manifest manager methods
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.getLocalManifest = jest.fn().mockResolvedValue({
        manifest: { ...testManifest, version: '0.9.0' },
        metadata: { syncState: 'outdated' }
      });
      mockManifestManager.compareManifests = jest.fn().mockReturnValue({
        isIdentical: false,
        differences: [{ field: 'version', oldValue: '0.9.0', newValue: '1.0.0' }]
      });
      mockManifestManager.storeLocalManifest = jest.fn().mockResolvedValue(undefined);

      // Mock registry manager
      const mockRegistryManager = require('./registryManager').RegistryManager;
      mockRegistryManager.prototype.getBoxInfo = jest.fn().mockResolvedValue({
        manifest: testManifest,
        path: '/mock/path',
        files: ['test.txt']
      });

      const syncResult = await boxManager.syncManifest(testBoxRef, tempDir);
      expect(syncResult).toBe(true);
    });

    it('should not sync when manifests are identical', async () => {
      // Mock manifest manager methods
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.getLocalManifest = jest.fn().mockResolvedValue({
        manifest: testManifest,
        metadata: { syncState: 'synced' }
      });
      mockManifestManager.compareManifests = jest.fn().mockReturnValue({
        isIdentical: true,
        differences: []
      });

      // Mock registry manager
      const mockRegistryManager = require('./registryManager').RegistryManager;
      mockRegistryManager.prototype.getBoxInfo = jest.fn().mockResolvedValue({
        manifest: testManifest,
        path: '/mock/path',
        files: ['test.txt']
      });

      const syncResult = await boxManager.syncManifest(testBoxRef, tempDir);
      expect(syncResult).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle manifest storage errors gracefully', async () => {
      // Mock manifest manager to throw error
      const mockManifestManager = boxManager.getManifestManager();
      mockManifestManager.storeLocalManifest = jest.fn().mockRejectedValue(
        new Error('Manifest storage failed')
      );

      // Mock successful box operations
      const mockRegistryManager = require('./registryManager').RegistryManager;
      mockRegistryManager.prototype.getBoxInfo = jest.fn().mockResolvedValue({
        manifest: testManifest,
        path: '/mock/path',
        files: ['test.txt']
      });
      mockRegistryManager.prototype.downloadFile = jest.fn().mockResolvedValue(
        Buffer.from('test content')
      );

      const config = {
        boxName: 'test-box',
        targetDirectory: tempDir,
        force: false,
        interactive: false,
        boxesDirectory: ''
      };

      // Box operation should still succeed even if manifest storage fails
      const result = await boxManager.copyBox(config);
      expect(result.success).toBe(true);
    });

    it('should handle sync errors gracefully', async () => {
      // Mock registry manager to throw error
      const mockRegistryManager = require('./registryManager').RegistryManager;
      mockRegistryManager.prototype.getBoxInfo = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      await expect(boxManager.syncManifest(testBoxRef, tempDir))
        .rejects
        .toThrow('Failed to sync manifest');
    });
  });
});
