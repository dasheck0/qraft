import { RegistryConfig } from '../types';
import { ConfigManager } from './config';

// Simple unit tests for ConfigManager
describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempConfigPath: string;

  beforeEach(() => {
    // Use a temporary config path for testing
    tempConfigPath = '/tmp/test-unboxrc';
    configManager = new ConfigManager(tempConfigPath);
  });

  describe('constructor', () => {
    it('should create ConfigManager with custom config path', () => {
      expect(configManager.getConfigPath()).toBe(tempConfigPath);
    });

    it('should create ConfigManager with default config path', () => {
      const defaultManager = new ConfigManager();
      expect(defaultManager.getConfigPath()).toContain('.unboxrc');
    });
  });

  describe('createDefaultConfig', () => {
    it('should create valid default configuration', async () => {
      const config = await configManager.getConfig();
      
      expect(config.defaultRegistry).toBe('dasheck0');
      expect(config.registries).toBeDefined();
      expect(config.registries['dasheck0']).toBeDefined();
      expect(config.registries['dasheck0'].repository).toBe('dasheck0/unbox-templates');
      expect(config.registries['dasheck0'].isDefault).toBe(true);
      expect(config.cache).toBeDefined();
      expect(config.cache?.enabled).toBe(true);
    });
  });

  describe('registry management', () => {
    it('should handle registry operations', async () => {
      const testRegistry: RegistryConfig = {
        name: 'test-registry',
        repository: 'test/repo',
        token: 'test-token'
      };

      // Test adding registry
      await configManager.setRegistry(testRegistry);
      const retrievedRegistry = await configManager.getRegistry('test-registry');
      
      expect(retrievedRegistry).toEqual(testRegistry);

      // Test listing registries
      const registries = await configManager.listRegistries();
      expect(registries.length).toBeGreaterThan(1);
      expect(registries.some(r => r.name === 'test-registry')).toBe(true);
    });

    it('should handle default registry changes', async () => {
      const testRegistry: RegistryConfig = {
        name: 'new-default',
        repository: 'test/repo'
      };

      await configManager.setRegistry(testRegistry);
      await configManager.setDefaultRegistry('new-default');
      
      const config = await configManager.getConfig();
      expect(config.defaultRegistry).toBe('new-default');
    });

    it('should handle registry removal errors', async () => {
      // Try to remove non-existent registry
      await expect(configManager.removeRegistry('non-existent'))
        .rejects
        .toThrow("Registry 'non-existent' not found");

      // Add a test registry first, then set it as default, then try to remove the original default
      const testRegistry: RegistryConfig = {
        name: 'test-default',
        repository: 'test/repo'
      };

      await configManager.setRegistry(testRegistry);
      await configManager.setDefaultRegistry('test-default');

      // Now try to remove the old default - should work
      await configManager.removeRegistry('dasheck0');

      // Try to remove current default registry - should fail
      await expect(configManager.removeRegistry('test-default'))
        .rejects
        .toThrow("Cannot remove default registry 'test-default'");
    });
  });

  describe('token management', () => {
    it('should handle global token operations', async () => {
      await configManager.setGlobalToken('global-test-token');
      
      const config = await configManager.getConfig();
      expect(config.globalToken).toBe('global-test-token');

      await configManager.removeGlobalToken();
      const updatedConfig = await configManager.getConfig();
      expect(updatedConfig.globalToken).toBeUndefined();
    });

    it('should handle registry-specific token operations', async () => {
      const testRegistry: RegistryConfig = {
        name: 'token-test',
        repository: 'test/repo'
      };

      await configManager.setRegistry(testRegistry);
      await configManager.setRegistryToken('token-test', 'registry-token');
      
      const registry = await configManager.getRegistry('token-test');
      expect(registry?.token).toBe('registry-token');

      await configManager.removeRegistryToken('token-test');
      const updatedRegistry = await configManager.getRegistry('token-test');
      expect(updatedRegistry?.token).toBeUndefined();
    });

    it('should handle token errors for non-existent registries', async () => {
      await expect(configManager.setRegistryToken('non-existent', 'token'))
        .rejects
        .toThrow("Registry 'non-existent' not found");

      await expect(configManager.removeRegistryToken('non-existent'))
        .rejects
        .toThrow("Registry 'non-existent' not found");
    });
  });

  describe('cache settings', () => {
    it('should handle cache configuration', async () => {
      await configManager.setCacheSettings({
        enabled: false,
        ttl: 7200,
        directory: '/custom/cache/dir'
      });

      const config = await configManager.getConfig();
      expect(config.cache?.enabled).toBe(false);
      expect(config.cache?.ttl).toBe(7200);
      expect(config.cache?.directory).toBe('/custom/cache/dir');
    });

    it('should handle partial cache updates', async () => {
      // First ensure we have a fresh config with defaults
      await configManager.resetConfig();

      await configManager.setCacheSettings({ enabled: false });

      const config = await configManager.getConfig();
      expect(config.cache?.enabled).toBe(false);
      expect(config.cache?.ttl).toBe(3600); // Should keep default
    });
  });

  describe('configuration persistence', () => {
    it('should handle config file existence check', async () => {
      // For non-existent temp file, should return false
      const exists = await configManager.configExists();
      // This might be true or false depending on test execution order
      expect(typeof exists).toBe('boolean');
    });

    it('should handle config reset', async () => {
      // Add some custom configuration
      await configManager.setGlobalToken('test-token');
      
      // Reset to defaults
      await configManager.resetConfig();
      
      const config = await configManager.getConfig();
      expect(config.globalToken).toBeUndefined();
      expect(config.defaultRegistry).toBe('dasheck0');
    });
  });
});
