import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest } from '../types';
import {
    MANIFEST_CONSTANTS,
    ManifestUtils
} from './manifestUtils';

describe('ManifestUtils', () => {
  let testDir: string;
  let testManifest: BoxManifest;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-utils-test-'));
    
    testManifest = {
      name: 'test-box',
      description: 'Test box for utility tests',
      author: 'Test Author',
      version: '1.0.0',
      defaultTarget: './test-target',
      tags: ['test', 'utils'],
      exclude: ['.git/', 'node_modules/'],
      postInstall: ['npm install']
    };
  });

  afterEach(async () => {
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('path resolution', () => {
    it('should generate correct .qraft directory path', () => {
      const qraftPath = ManifestUtils.getQraftDirectoryPath(testDir);
      expect(qraftPath).toBe(path.join(testDir, MANIFEST_CONSTANTS.QRAFT_DIR));
    });

    it('should generate correct manifest file path', () => {
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      expect(manifestPath).toBe(path.join(testDir, MANIFEST_CONSTANTS.QRAFT_DIR, MANIFEST_CONSTANTS.MANIFEST_FILE));
    });

    it('should generate correct metadata file path', () => {
      const metadataPath = ManifestUtils.getMetadataFilePath(testDir);
      expect(metadataPath).toBe(path.join(testDir, MANIFEST_CONSTANTS.QRAFT_DIR, MANIFEST_CONSTANTS.METADATA_FILE));
    });

    it('should resolve manifest paths correctly', () => {
      const basePath = '/base/path';
      const relativePath = './relative/file.txt';
      const resolved = ManifestUtils.resolveManifestPath(basePath, relativePath);
      expect(path.isAbsolute(resolved)).toBe(true);
    });

    it('should normalize paths for cross-platform compatibility', () => {
      const windowsPath = 'dir\\subdir\\file.txt';
      const normalized = ManifestUtils.normalizePath(windowsPath);
      expect(normalized).toBe('dir/subdir/file.txt');
    });

    it('should detect unsafe paths', () => {
      const basePath = '/safe/base';
      const unsafePath = '../../../etc/passwd';
      const isSafe = ManifestUtils.isSafePath(basePath, unsafePath);
      expect(isSafe).toBe(false);
    });

    it('should detect safe paths', () => {
      const basePath = '/safe/base';
      const safePath = './subdir/file.txt';
      const isSafe = ManifestUtils.isSafePath(basePath, safePath);
      expect(isSafe).toBe(true);
    });
  });

  describe('directory management', () => {
    it('should create .qraft directory', async () => {
      await ManifestUtils.ensureQraftDirectory(testDir);
      const qraftPath = ManifestUtils.getQraftDirectoryPath(testDir);
      expect(await fs.pathExists(qraftPath)).toBe(true);
    });

    it('should detect existing .qraft directory', async () => {
      await ManifestUtils.ensureQraftDirectory(testDir);
      const exists = await ManifestUtils.qraftDirectoryExists(testDir);
      expect(exists).toBe(true);
    });

    it('should detect non-existing .qraft directory', async () => {
      const exists = await ManifestUtils.qraftDirectoryExists(testDir);
      expect(exists).toBe(false);
    });

    it('should remove .qraft directory completely', async () => {
      await ManifestUtils.ensureQraftDirectory(testDir);
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      
      await ManifestUtils.removeQraftDirectory(testDir);
      const exists = await ManifestUtils.qraftDirectoryExists(testDir);
      expect(exists).toBe(false);
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await ManifestUtils.ensureQraftDirectory(testDir);
    });

    it('should write and read manifest file', async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      
      const exists = await ManifestUtils.manifestFileExists(testDir);
      expect(exists).toBe(true);
      
      const readManifest = await ManifestUtils.readManifestFile(testDir);
      expect(readManifest).toEqual(testManifest);
    });

    it('should write and read metadata file', async () => {
      const metadata = { test: 'data', timestamp: Date.now() };
      await ManifestUtils.writeMetadataFile(testDir, metadata);
      
      const exists = await ManifestUtils.metadataFileExists(testDir);
      expect(exists).toBe(true);
      
      const readMetadata = await ManifestUtils.readMetadataFile(testDir);
      expect(readMetadata).toEqual(metadata);
    });

    it('should detect complete local manifest', async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      await ManifestUtils.writeMetadataFile(testDir, { test: 'metadata' });
      
      const hasComplete = await ManifestUtils.hasCompleteLocalManifest(testDir);
      expect(hasComplete).toBe(true);
    });

    it('should detect incomplete local manifest', async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      // Missing metadata file
      
      const hasComplete = await ManifestUtils.hasCompleteLocalManifest(testDir);
      expect(hasComplete).toBe(false);
    });

    it('should throw error for empty manifest file', async () => {
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      await fs.writeFile(manifestPath, '');
      
      await expect(ManifestUtils.readManifestFile(testDir))
        .rejects.toThrow('Manifest file is empty');
    });

    it('should throw error for invalid JSON in manifest', async () => {
      const manifestPath = ManifestUtils.getManifestFilePath(testDir);
      await fs.writeFile(manifestPath, 'invalid json content');
      
      await expect(ManifestUtils.readManifestFile(testDir))
        .rejects.toThrow('Invalid JSON');
    });

    it('should throw error for missing manifest file', async () => {
      await expect(ManifestUtils.readManifestFile(testDir))
        .rejects.toThrow('Manifest file not found');
    });
  });

  describe('manifest validation', () => {
    it('should validate correct manifest', () => {
      expect(() => ManifestUtils.validateManifest(testManifest)).not.toThrow();
    });

    it('should reject null manifest', () => {
      expect(() => ManifestUtils.validateManifest(null))
        .toThrow('Manifest must be a valid object');
    });

    it('should reject manifest missing required fields', () => {
      const invalidManifest = { name: 'test' }; // Missing other required fields
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('Manifest missing required field');
    });

    it('should reject manifest with empty required fields', () => {
      const invalidManifest = { ...testManifest, name: '' };
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('Manifest missing required field: name');
    });

    it('should reject manifest with invalid tags type', () => {
      const invalidManifest = { ...testManifest, tags: 'not-an-array' };
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('Manifest field "tags" must be an array');
    });

    it('should reject manifest with non-string tags', () => {
      const invalidManifest = { ...testManifest, tags: [123, 'valid'] };
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('All tags must be strings');
    });

    it('should reject manifest with invalid exclude type', () => {
      const invalidManifest = { ...testManifest, exclude: 'not-an-array' };
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('Manifest field "exclude" must be an array');
    });

    it('should reject manifest with invalid postInstall type', () => {
      const invalidManifest = { ...testManifest, postInstall: 'not-an-array' };
      expect(() => ManifestUtils.validateManifest(invalidManifest))
        .toThrow('Manifest field "postInstall" must be an array');
    });
  });

  describe('exclude patterns', () => {
    it('should add .qraft to exclude patterns', () => {
      const existing = ['node_modules/', '.git/'];
      const updated = ManifestUtils.getUpdatedExcludePatterns(existing);
      expect(updated).toContain('.qraft/');
      expect(updated).toContain('node_modules/');
      expect(updated).toContain('.git/');
    });

    it('should not duplicate .qraft in exclude patterns', () => {
      const existing = ['.qraft/', 'node_modules/'];
      const updated = ManifestUtils.getUpdatedExcludePatterns(existing);
      const qraftCount = updated.filter(p => p.includes('.qraft')).length;
      expect(qraftCount).toBe(1);
    });

    it('should detect .qraft paths correctly', () => {
      expect(ManifestUtils.isQraftPath('.qraft')).toBe(true);
      expect(ManifestUtils.isQraftPath('.qraft/manifest.json')).toBe(true);
      expect(ManifestUtils.isQraftPath('normal/file.txt')).toBe(false);
    });
  });

  describe('directory discovery', () => {
    it('should find manifest directories', async () => {
      // Create nested structure with manifests
      const subDir1 = path.join(testDir, 'box1');
      const subDir2 = path.join(testDir, 'nested', 'box2');
      
      await fs.ensureDir(subDir1);
      await fs.ensureDir(subDir2);
      
      await ManifestUtils.writeManifestFile(subDir1, testManifest);
      await ManifestUtils.writeMetadataFile(subDir1, { test: 'data' });
      
      await ManifestUtils.writeManifestFile(subDir2, testManifest);
      await ManifestUtils.writeMetadataFile(subDir2, { test: 'data' });
      
      const found = await ManifestUtils.findManifestDirectories(testDir);
      expect(found).toContain(subDir1);
      expect(found).toContain(subDir2);
    });

    it('should get manifest directory info', async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      await ManifestUtils.writeMetadataFile(testDir, { test: 'data' });
      
      const info = await ManifestUtils.getManifestDirectoryInfo(testDir);
      expect(info).not.toBeNull();
      expect(info!.hasManifest).toBe(true);
      expect(info!.hasMetadata).toBe(true);
      expect(info!.fileCount).toBeGreaterThan(0);
    });

    it('should return null for directory without manifest', async () => {
      const info = await ManifestUtils.getManifestDirectoryInfo(testDir);
      expect(info).toBeNull();
    });
  });

  describe('backup and restore', () => {
    beforeEach(async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      await ManifestUtils.writeMetadataFile(testDir, { test: 'data' });
    });

    it('should create backup of .qraft directory', async () => {
      const backupPath = await ManifestUtils.backupQraftDirectory(testDir, 'test-backup');
      
      expect(await fs.pathExists(backupPath)).toBe(true);
      expect(backupPath).toContain('.qraft-backup-test-backup');
      
      // Verify backup contains files
      const backupManifest = path.join(backupPath, MANIFEST_CONSTANTS.MANIFEST_FILE);
      expect(await fs.pathExists(backupManifest)).toBe(true);
    });

    it('should restore from backup', async () => {
      const backupPath = await ManifestUtils.backupQraftDirectory(testDir);
      
      // Remove original .qraft directory
      await ManifestUtils.removeQraftDirectory(testDir);
      expect(await ManifestUtils.qraftDirectoryExists(testDir)).toBe(false);
      
      // Restore from backup
      await ManifestUtils.restoreQraftDirectory(testDir, backupPath);
      expect(await ManifestUtils.qraftDirectoryExists(testDir)).toBe(true);
      expect(await ManifestUtils.hasCompleteLocalManifest(testDir)).toBe(true);
    });

    it('should throw error when backing up non-existent directory', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.ensureDir(emptyDir);
      
      await expect(ManifestUtils.backupQraftDirectory(emptyDir))
        .rejects.toThrow('No .qraft directory found to backup');
    });

    it('should clean up old backups', async () => {
      // Create old backup directory
      const oldBackupDir = path.join(testDir, '.qraft-backup-old');
      await fs.ensureDir(oldBackupDir);
      
      // Set old timestamp
      const oldTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      await fs.utimes(oldBackupDir, oldTime, oldTime);
      
      const removed = await ManifestUtils.cleanupOldBackups(testDir, 30);
      expect(removed).toContain(oldBackupDir);
      expect(await fs.pathExists(oldBackupDir)).toBe(false);
    });
  });

  describe('directory validation', () => {
    it('should validate suitable directory', async () => {
      const result = await ManifestUtils.validateDirectoryForManifest(testDir);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect non-existent directory', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist');
      const result = await ManifestUtils.validateDirectoryForManifest(nonExistent);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Target directory does not exist');
    });

    it('should detect existing .qraft directory', async () => {
      await ManifestUtils.ensureQraftDirectory(testDir);
      const result = await ManifestUtils.validateDirectoryForManifest(testDir);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('.qraft directory already exists'))).toBe(true);
    });

    it('should check manifest compatibility', async () => {
      const result = await ManifestUtils.checkManifestCompatibility(testDir);
      expect(result.compatibilityLevel).toBe('compatible');
      expect(result.hasExistingManifest).toBe(false);
    });
  });

  describe('disk usage', () => {
    it('should calculate disk usage for .qraft directory', async () => {
      await ManifestUtils.writeManifestFile(testDir, testManifest);
      await ManifestUtils.writeMetadataFile(testDir, { test: 'data' });
      
      const usage = await ManifestUtils.getQraftDiskUsage(testDir);
      expect(usage.totalSize).toBeGreaterThan(0);
      expect(usage.fileCount).toBe(2);
    });

    it('should return zero usage for non-existent .qraft directory', async () => {
      const usage = await ManifestUtils.getQraftDiskUsage(testDir);
      expect(usage.totalSize).toBe(0);
      expect(usage.fileCount).toBe(0);
    });
  });

  describe('manifest paths', () => {
    it('should return complete manifest paths', () => {
      const paths = ManifestUtils.getManifestPaths(testDir);
      expect(paths.targetDirectory).toBe(path.resolve(testDir));
      expect(paths.qraftDirectory).toBe(ManifestUtils.getQraftDirectoryPath(testDir));
      expect(paths.manifestFile).toBe(ManifestUtils.getManifestFilePath(testDir));
      expect(paths.metadataFile).toBe(ManifestUtils.getMetadataFilePath(testDir));
      expect(paths.relativePaths.qraftDirectory).toBe(MANIFEST_CONSTANTS.QRAFT_DIR);
    });
  });
});
