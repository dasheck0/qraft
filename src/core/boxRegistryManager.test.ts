import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { BoxManifest } from '../types';
import { BoxRegistryManager } from './boxRegistryManager';

describe('BoxRegistryManager', () => {
  let boxRegistryManager: BoxRegistryManager;
  let testDir: string;
  let testManifest: BoxManifest;

  beforeEach(async () => {
    boxRegistryManager = new BoxRegistryManager();
    
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'box-registry-test-'));
    
    // Create test manifest
    testManifest = {
      name: 'aws-lightsail',
      description: 'AWS Lightsail deployment scripts',
      author: 'Test Author',
      version: '1.0.0',
      defaultTarget: './aws-lightsail',
      remotePath: 'scripts/aws/lightsail',
      tags: ['aws', 'lightsail', 'deployment']
    };
  });

  afterEach(async () => {
    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('registry management', () => {
    it('should create empty registry when file does not exist', async () => {
      const registry = await boxRegistryManager.loadRegistry(testDir, 'test-registry');
      
      expect(registry.metadata.name).toBe('test-registry');
      expect(registry.metadata.version).toBe('1.0.0');
      expect(registry.boxes).toEqual({});
    });

    it('should load existing registry from file', async () => {
      // Create a registry file
      const registryData = {
        metadata: {
          name: 'test-registry',
          lastUpdated: '2025-01-13T10:00:00Z',
          version: '1.0.0'
        },
        boxes: {
          'existing-box': {
            remotePath: 'existing/path',
            lastUpdated: '2025-01-13T09:00:00Z',
            version: '1.0.0',
            description: 'Existing box'
          }
        }
      };

      const registryPath = path.join(testDir, '.qraft');
      await fs.ensureDir(registryPath);
      await fs.writeFile(
        path.join(registryPath, 'box-registry.json'),
        JSON.stringify(registryData, null, 2)
      );

      const registry = await boxRegistryManager.loadRegistry(testDir, 'test-registry');
      
      expect(registry.boxes['existing-box']).toBeDefined();
      expect(registry.boxes['existing-box'].remotePath).toBe('existing/path');
    });

    it('should save registry to file', async () => {
      const registry = await boxRegistryManager.loadRegistry(testDir, 'test-registry');
      registry.boxes['test-box'] = {
        remotePath: 'test/path',
        lastUpdated: '2025-01-13T10:00:00Z',
        version: '1.0.0',
        description: 'Test box'
      };

      await boxRegistryManager.saveRegistry(testDir, registry);

      const registryPath = path.join(testDir, '.qraft', 'box-registry.json');
      expect(await fs.pathExists(registryPath)).toBe(true);

      const savedData = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
      expect(savedData.boxes['test-box']).toBeDefined();
      expect(savedData.boxes['test-box'].remotePath).toBe('test/path');
    });
  });

  describe('box registration', () => {
    it('should register a new box', async () => {
      await boxRegistryManager.registerBox(
        testDir,
        'test-registry',
        testManifest.name,
        testManifest.remotePath!,
        testManifest
      );

      const remotePath = await boxRegistryManager.getRemotePath(
        testDir,
        'test-registry',
        testManifest.name
      );

      expect(remotePath).toBe(testManifest.remotePath);
    });

    it('should update existing box', async () => {
      // Register initial box
      await boxRegistryManager.registerBox(
        testDir,
        'test-registry',
        testManifest.name,
        testManifest.remotePath!,
        testManifest
      );

      // Update the manifest
      const updatedManifest = { ...testManifest, version: '2.0.0' };
      const updated = await boxRegistryManager.updateBox(
        testDir,
        'test-registry',
        testManifest.name,
        updatedManifest
      );

      expect(updated).toBe(true);

      const registry = await boxRegistryManager.loadRegistry(testDir, 'test-registry');
      expect(registry.boxes[testManifest.name].version).toBe('2.0.0');
    });

    it('should return false when updating non-existent box', async () => {
      const updated = await boxRegistryManager.updateBox(
        testDir,
        'test-registry',
        'non-existent',
        testManifest
      );

      expect(updated).toBe(false);
    });
  });

  describe('box lookup', () => {
    beforeEach(async () => {
      // Register test box
      await boxRegistryManager.registerBox(
        testDir,
        'test-registry',
        testManifest.name,
        testManifest.remotePath!,
        testManifest
      );
    });

    it('should get remote path for existing box', async () => {
      const remotePath = await boxRegistryManager.getRemotePath(
        testDir,
        'test-registry',
        testManifest.name
      );

      expect(remotePath).toBe(testManifest.remotePath);
    });

    it('should return null for non-existent box', async () => {
      const remotePath = await boxRegistryManager.getRemotePath(
        testDir,
        'test-registry',
        'non-existent'
      );

      expect(remotePath).toBeNull();
    });

    it('should check if box exists', async () => {
      const exists = await boxRegistryManager.boxExists(
        testDir,
        'test-registry',
        testManifest.name
      );

      expect(exists).toBe(true);

      const notExists = await boxRegistryManager.boxExists(
        testDir,
        'test-registry',
        'non-existent'
      );

      expect(notExists).toBe(false);
    });

    it('should find box by remote path', async () => {
      const boxName = await boxRegistryManager.findBoxByRemotePath(
        testDir,
        'test-registry',
        testManifest.remotePath!
      );

      expect(boxName).toBe(testManifest.name);

      const notFound = await boxRegistryManager.findBoxByRemotePath(
        testDir,
        'test-registry',
        'non-existent/path'
      );

      expect(notFound).toBeNull();
    });

    it('should get all boxes', async () => {
      const boxes = await boxRegistryManager.getAllBoxes(testDir, 'test-registry');

      expect(Object.keys(boxes)).toHaveLength(1);
      expect(boxes[testManifest.name]).toBeDefined();
      expect(boxes[testManifest.name].remotePath).toBe(testManifest.remotePath);
    });
  });

  describe('box removal', () => {
    beforeEach(async () => {
      // Register test box
      await boxRegistryManager.registerBox(
        testDir,
        'test-registry',
        testManifest.name,
        testManifest.remotePath!,
        testManifest
      );
    });

    it('should remove existing box', async () => {
      const removed = await boxRegistryManager.removeBox(
        testDir,
        'test-registry',
        testManifest.name
      );

      expect(removed).toBe(true);

      const exists = await boxRegistryManager.boxExists(
        testDir,
        'test-registry',
        testManifest.name
      );

      expect(exists).toBe(false);
    });

    it('should return false when removing non-existent box', async () => {
      const removed = await boxRegistryManager.removeBox(
        testDir,
        'test-registry',
        'non-existent'
      );

      expect(removed).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle corrupted registry file gracefully', async () => {
      // Create corrupted registry file
      const registryPath = path.join(testDir, '.qraft');
      await fs.ensureDir(registryPath);
      await fs.writeFile(
        path.join(registryPath, 'box-registry.json'),
        'invalid json content'
      );

      const registry = await boxRegistryManager.loadRegistry(testDir, 'test-registry');
      
      // Should return empty registry
      expect(registry.metadata.name).toBe('test-registry');
      expect(registry.boxes).toEqual({});
    });
  });
});
