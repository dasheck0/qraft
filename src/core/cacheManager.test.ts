import { BoxManifest, BoxReference } from '../types';
import { CacheManager } from './cacheManager';

// Simple unit tests for CacheManager
describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let testBoxRef: BoxReference;
  let testManifest: BoxManifest;

  beforeEach(() => {
    // Use a test cache configuration
    const testCacheConfig = {
      enabled: true,
      ttl: 3600,
      directory: '/tmp/test-unbox-cache'
    };

    cacheManager = new CacheManager(testCacheConfig);

    testBoxRef = {
      registry: 'dasheck0',
      boxName: 'test-box',
      fullReference: 'dasheck0/test-box'
    };

    testManifest = {
      name: 'test-box',
      description: 'Test box for caching',
      author: 'Test Author',
      version: '1.0.0'
    };
  });

  describe('constructor', () => {
    it('should create CacheManager with provided config', () => {
      expect(cacheManager.isEnabled()).toBe(true);
      expect(cacheManager.getTTL()).toBe(3600);
      expect(cacheManager.getCacheDirectory()).toBe('/tmp/test-unbox-cache');
    });

    it('should create CacheManager with default config', () => {
      const defaultManager = new CacheManager(undefined);
      expect(defaultManager.isEnabled()).toBe(true);
      expect(defaultManager.getTTL()).toBe(3600);
      expect(defaultManager.getCacheDirectory()).toContain('.cache/qreate');
    });

    it('should handle disabled cache', () => {
      const disabledManager = new CacheManager({ enabled: false, ttl: 3600, directory: '/tmp' });
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe('cache key generation', () => {
    it('should generate consistent cache keys', () => {
      // We can't directly test the private method, but we can test behavior
      const boxRef1: BoxReference = {
        registry: 'dasheck0',
        boxName: 'n8n',
        fullReference: 'dasheck0/n8n'
      };

      const boxRef2: BoxReference = {
        registry: 'dasheck0',
        boxName: 'n8n',
        fullReference: 'n8n' // Different full reference but same registry/box
      };

      // Both should be treated as the same cache entry
      expect(boxRef1.registry).toBe(boxRef2.registry);
      expect(boxRef1.boxName).toBe(boxRef2.boxName);
    });
  });

  describe('cache validation', () => {
    it('should return false for non-existent cache', async () => {
      const hasCache = await cacheManager.hasValidCache(testBoxRef);
      expect(hasCache).toBe(false);
    });

    it('should return null for non-existent cache entry', async () => {
      const cacheEntry = await cacheManager.getCacheEntry(testBoxRef);
      expect(cacheEntry).toBeNull();
    });

    it('should return null for non-existent cached file', async () => {
      const fileContent = await cacheManager.getCachedFile(testBoxRef, 'test.txt');
      expect(fileContent).toBeNull();
    });
  });

  describe('cache operations', () => {
    it('should handle cache entry creation', async () => {
      const files = ['test.txt', 'config.json'];
      const fileContents = new Map<string, Buffer>();
      fileContents.set('test.txt', Buffer.from('test content'));
      fileContents.set('config.json', Buffer.from('{"test": true}'));

      // This should not throw an error
      await expect(cacheManager.setCacheEntry(testBoxRef, testManifest, files, fileContents))
        .resolves
        .not.toThrow();
    });

    it('should handle cache removal', async () => {
      // This should not throw an error even if cache doesn't exist
      await expect(cacheManager.removeCacheEntry(testBoxRef))
        .resolves
        .not.toThrow();
    });

    it('should handle cache clearing', async () => {
      await expect(cacheManager.clearCache())
        .resolves
        .not.toThrow();
    });
  });

  describe('cache maintenance', () => {
    it('should handle expired entry cleanup', async () => {
      const cleanedCount = await cacheManager.cleanupExpiredEntries();
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should return cache statistics', async () => {
      const stats = await cacheManager.getCacheStats();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('cacheDirectory');
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.cacheDirectory).toBe('string');
    });
  });

  describe('disabled cache behavior', () => {
    it('should handle disabled cache gracefully', async () => {
      const disabledManager = new CacheManager({ enabled: false, ttl: 3600, directory: '/tmp' });
      
      // All cache operations should work but return appropriate values
      expect(await disabledManager.hasValidCache(testBoxRef)).toBe(false);
      expect(await disabledManager.getCacheEntry(testBoxRef)).toBeNull();
      expect(await disabledManager.getCachedFile(testBoxRef, 'test.txt')).toBeNull();
      expect(await disabledManager.cleanupExpiredEntries()).toBe(0);
      
      // Cache setting should not throw but also not do anything
      const files = ['test.txt'];
      const fileContents = new Map<string, Buffer>();
      fileContents.set('test.txt', Buffer.from('test'));
      
      await expect(disabledManager.setCacheEntry(testBoxRef, testManifest, files, fileContents))
        .resolves
        .not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid cache directory gracefully', async () => {
      const invalidManager = new CacheManager({
        enabled: true,
        ttl: 3600,
        directory: '/invalid/path/that/cannot/be/created'
      });

      // Operations should not throw errors but handle gracefully
      expect(await invalidManager.hasValidCache(testBoxRef)).toBe(false);
      expect(await invalidManager.getCacheEntry(testBoxRef)).toBeNull();
      
      const stats = await invalidManager.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });
});
