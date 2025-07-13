import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest } from '../types';
import { ManifestUtils } from '../utils/manifestUtils';
import {
    LocalManifestEntry,
    ManifestCorruptionError,
    ManifestError,
    ManifestManager,
    ManifestPermissionError,
    ManifestValidationError
} from './manifestManager';

describe('ManifestManager', () => {
  let manifestManager: ManifestManager;
  let testDir: string;
  let testManifest: BoxManifest;

  beforeEach(async () => {
    manifestManager = new ManifestManager();
    
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
    
    // Create test manifest
    testManifest = {
      name: 'test-box',
      description: 'Test box for unit tests',
      author: 'Test Author',
      version: '1.0.0',
      defaultTarget: './test-target',
      tags: ['test', 'unit'],
      exclude: ['.git/', 'node_modules/'],
      postInstall: ['npm install', 'npm test']
    };
  });

  afterEach(async () => {
    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('storeLocalManifest', () => {
    it('should store a new manifest with metadata', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest, 'test-registry', 'test/box');

      // Verify manifest file exists and is correct
      expect(await ManifestUtils.manifestFileExists(testDir)).toBe(true);
      const storedManifest = await ManifestUtils.readManifestFile(testDir);
      expect(storedManifest).toEqual(testManifest);

      // Verify metadata file exists and has correct structure
      expect(await ManifestUtils.metadataFileExists(testDir)).toBe(true);
      const metadata = await ManifestUtils.readMetadataFile(testDir);
      expect(metadata).toMatchObject({
        sourceRegistry: 'test-registry',
        sourceBoxReference: 'test/box',
        lastSyncedVersion: '1.0.0',
        syncState: 'synced',
        syncCount: 1,
        metadataVersion: '1.0.0'
      });
      expect(metadata.checksum).toBeDefined();
      expect(metadata.lastSyncTimestamp).toBeDefined();
      expect(metadata.createdTimestamp).toBeDefined();
    });

    it('should update existing manifest and increment sync count', async () => {
      // Store initial manifest
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      // Update manifest
      const updatedManifest = { ...testManifest, version: '1.1.0' };
      await manifestManager.storeLocalManifest(testDir, updatedManifest, 'test-registry', 'test/box', true);

      const metadata = await ManifestUtils.readMetadataFile(testDir);
      expect(metadata.syncCount).toBe(2);
      expect(metadata.lastSyncedVersion).toBe('1.1.0');
    });

    it('should throw ManifestValidationError for invalid manifest', async () => {
      const invalidManifest = { name: '', description: 'test' } as any;
      
      await expect(manifestManager.storeLocalManifest(testDir, invalidManifest))
        .rejects.toThrow(ManifestValidationError);
    });

    it('should throw ManifestPermissionError for read-only directory', async () => {
      // Make directory read-only (skip on Windows as it's complex)
      if (process.platform !== 'win32') {
        await fs.chmod(testDir, 0o444);
        
        await expect(manifestManager.storeLocalManifest(testDir, testManifest))
          .rejects.toThrow(ManifestPermissionError);
        
        // Restore permissions for cleanup
        await fs.chmod(testDir, 0o755);
      }
    });
  });

  describe('getLocalManifest', () => {
    it('should return null when no manifest exists', async () => {
      const result = await manifestManager.getLocalManifest(testDir);
      expect(result).toBeNull();
    });

    it('should return manifest and metadata when both exist', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      const result = await manifestManager.getLocalManifest(testDir);
      expect(result).not.toBeNull();
      expect(result!.manifest).toEqual(testManifest);
      expect(result!.metadata.syncState).toBe('synced');
    });

    it('should throw ManifestCorruptionError for corrupted manifest', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      // Corrupt the manifest file
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      await fs.writeFile(manifestPath, 'invalid json content');
      
      await expect(manifestManager.getLocalManifest(testDir))
        .rejects.toThrow(ManifestCorruptionError);
    });

    it('should throw ManifestCorruptionError for checksum mismatch', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      // Modify manifest without updating metadata
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      const modifiedManifest = { ...testManifest, version: '2.0.0' };
      await fs.writeFile(manifestPath, JSON.stringify(modifiedManifest, null, 2));
      
      await expect(manifestManager.getLocalManifest(testDir))
        .rejects.toThrow(ManifestCorruptionError);
    });
  });

  describe('compareManifests', () => {
    it('should return identical comparison for same manifests', () => {
      const result = manifestManager.compareManifests(testManifest, testManifest);
      
      expect(result.isIdentical).toBe(true);
      expect(result.differences).toHaveLength(0);
      expect(result.severity).toBe('none');
    });

    it('should detect version changes as critical', () => {
      const remoteManifest = { ...testManifest, version: '2.0.0' };
      const result = manifestManager.compareManifests(testManifest, remoteManifest);
      
      expect(result.isIdentical).toBe(false);
      expect(result.severity).toBe('critical');
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].field).toBe('version');
      expect(result.differences[0].impact).toBe('critical');
    });

    it('should detect new manifest when local is null', () => {
      const result = manifestManager.compareManifests(null, testManifest);
      
      expect(result.isIdentical).toBe(false);
      expect(result.severity).toBe('low');
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.every(d => d.changeType === 'added')).toBe(true);
    });

    it('should detect multiple field changes', () => {
      const remoteManifest = {
        ...testManifest,
        description: 'Updated description',
        tags: ['updated', 'tags'],
        version: '1.1.0'
      };
      
      const result = manifestManager.compareManifests(testManifest, remoteManifest);
      
      expect(result.isIdentical).toBe(false);
      expect(result.differences).toHaveLength(3);
      expect(result.severity).toBe('critical'); // Due to version change
    });
  });

  describe('determineSyncState', () => {
    let localEntry: LocalManifestEntry;

    beforeEach(async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      localEntry = (await manifestManager.getLocalManifest(testDir))!;
    });

    it('should return synced for identical manifests', () => {
      const state = manifestManager.determineSyncState(localEntry, testManifest);
      expect(state).toBe('synced');
    });

    it('should return remote_newer for different remote version', () => {
      const remoteManifest = { ...testManifest, version: '2.0.0' };
      const state = manifestManager.determineSyncState(localEntry, remoteManifest);
      expect(state).toBe('remote_newer');
    });

    it('should return unknown for null local entry', () => {
      const state = manifestManager.determineSyncState(null, testManifest);
      expect(state).toBe('unknown');
    });
  });

  describe('getSyncStats', () => {
    it('should return null for non-existent manifest', async () => {
      const stats = await manifestManager.getSyncStats(testDir);
      expect(stats).toBeNull();
    });

    it('should return correct sync statistics', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      const stats = await manifestManager.getSyncStats(testDir);
      expect(stats).not.toBeNull();
      expect(stats!.syncState).toBe('synced');
      expect(stats!.syncCount).toBe(1);
      expect(stats!.daysSinceLastSync).toBe(0);
      expect(stats!.hasRemoteChecksum).toBe(true);
    });
  });

  describe('needsSync', () => {
    it('should return false for non-existent manifest', async () => {
      const needsSync = await manifestManager.needsSync(testDir);
      expect(needsSync).toBe(false);
    });

    it('should return false for recently synced manifest', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      const needsSync = await manifestManager.needsSync(testDir);
      expect(needsSync).toBe(false);
    });

    it('should return true for remote_newer state', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      await manifestManager.updateSyncState(testDir, 'remote_newer');
      
      const needsSync = await manifestManager.needsSync(testDir);
      expect(needsSync).toBe(true);
    });
  });

  describe('validateManifestIntegrity', () => {
    it('should return valid for complete manifest', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      const result = await manifestManager.validateManifestIntegrity(testDir);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing manifest files', async () => {
      const result = await manifestManager.validateManifestIntegrity(testDir);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('No manifest files found');
      expect(result.canRecover).toBe(false);
    });

    it('should detect corrupted manifest', async () => {
      await manifestManager.storeLocalManifest(testDir, testManifest);
      
      // Corrupt manifest file
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      await fs.writeFile(manifestPath, 'invalid json');
      
      const result = await manifestManager.validateManifestIntegrity(testDir);
      expect(result.isValid).toBe(false);
      expect(result.canRecover).toBe(true);
      expect(result.issues.some(issue => issue.includes('validation failed'))).toBe(true);
    });
  });

  describe('recoverCorruptedManifest', () => {
    it('should return failure when no recovery options available', async () => {
      // Create a directory that can't be reconstructed (no meaningful name)
      const emptyDir = path.join(testDir, 'empty-dir-12345');
      await fs.ensureDir(emptyDir);

      const result = await manifestManager.recoverCorruptedManifest(emptyDir);
      expect(result.success).toBe(false);
      expect(result.method).toBe('none');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reconstruct manifest from directory name', async () => {
      // Create a directory with a recognizable name
      const namedTestDir = path.join(testDir, 'my-test-box');
      await fs.ensureDir(namedTestDir);
      
      const result = await manifestManager.recoverCorruptedManifest(namedTestDir);
      expect(result.success).toBe(true);
      expect(result.method).toBe('reconstruction');
      
      // Verify reconstructed manifest
      const manifest = await ManifestUtils.readManifestFile(namedTestDir);
      expect(manifest.name).toBe('my-test-box');
      expect(manifest.description).toContain('my-test-box');
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      if (process.platform !== 'win32') {
        await fs.chmod(testDir, 0o000);
        
        await expect(manifestManager.storeLocalManifest(testDir, testManifest))
          .rejects.toThrow(ManifestError);
        
        await fs.chmod(testDir, 0o755);
      }
    });

    it('should provide detailed error messages', async () => {
      try {
        await manifestManager.getLocalManifest('/non/existent/path');
      } catch (error) {
        expect(error).toBeInstanceOf(ManifestError);
        expect((error as ManifestError).code).toBeDefined();
        expect((error as ManifestError).message).toContain('/non/existent/path');
      }
    });
  });
});
