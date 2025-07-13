import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { RegistryConfig, RegistryManagerConfig } from '../types';

/**
 * ConfigManager handles loading, saving, and managing configuration for registries and authentication
 */
export class ConfigManager {
  private configPath: string;
  private config: RegistryManagerConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  /**
   * Get the default configuration file path
   * @returns string Path to the default config file
   */
  private getDefaultConfigPath(): string {
    return path.join(os.homedir(), '.qraftrc');
  }

  /**
   * Load configuration from file
   * @returns Promise<RegistryManagerConfig> Loaded configuration
   */
  async loadConfig(): Promise<RegistryManagerConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      if (await fs.pathExists(this.configPath)) {
        const configContent = await fs.readFile(this.configPath, 'utf-8');
        this.config = JSON.parse(configContent);
      } else {
        // Create default configuration
        this.config = this.createDefaultConfig();
        await this.saveConfig();
      }
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}, using defaults`);
      this.config = this.createDefaultConfig();
    }

    // Ensure config is not null
    if (!this.config) {
      this.config = this.createDefaultConfig();
    }

    return this.config;
  }

  /**
   * Save configuration to file
   * @returns Promise<void>
   */
  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      await fs.ensureDir(configDir);

      // Save configuration
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create default configuration
   * @returns RegistryManagerConfig Default configuration
   */
  private createDefaultConfig(): RegistryManagerConfig {
    return {
      defaultRegistry: 'dasheck0/qraft-templates',
      registries: {
        'dasheck0/qraft-templates': {
          name: 'dasheck0/qraft-templates',
          repository: 'dasheck0/qraft-templates',
          isDefault: true
        }
      },
      cache: {
        enabled: true,
        ttl: 3600, // 1 hour
        directory: path.join(os.homedir(), '.cache', 'qraft')
      }
    };
  }

  /**
   * Get current configuration
   * @returns Promise<RegistryManagerConfig> Current configuration
   */
  async getConfig(): Promise<RegistryManagerConfig> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config!;
  }

  /**
   * Set the default registry
   * @param registryName Name of the registry to set as default
   * @returns Promise<void>
   */
  async setDefaultRegistry(registryName: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.registries[registryName]) {
      throw new Error(`Registry '${registryName}' not found`);
    }

    // Update default registry
    config.defaultRegistry = registryName;
    
    // Update isDefault flags
    Object.values(config.registries).forEach(registry => {
      registry.isDefault = registry.name === registryName;
    });

    await this.saveConfig();
  }

  /**
   * Add or update a registry
   * @param registry Registry configuration to add/update
   * @returns Promise<void>
   */
  async setRegistry(registry: RegistryConfig): Promise<void> {
    const config = await this.getConfig();
    
    config.registries[registry.name] = { ...registry };
    
    // If this is marked as default, update the default registry
    if (registry.isDefault) {
      await this.setDefaultRegistry(registry.name);
    } else {
      await this.saveConfig();
    }
  }

  /**
   * Remove a registry
   * @param registryName Name of the registry to remove
   * @returns Promise<void>
   */
  async removeRegistry(registryName: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.registries[registryName]) {
      throw new Error(`Registry '${registryName}' not found`);
    }

    if (config.defaultRegistry === registryName) {
      throw new Error(`Cannot remove default registry '${registryName}'. Set a different default first.`);
    }

    delete config.registries[registryName];
    await this.saveConfig();
  }

  /**
   * Get a specific registry configuration
   * @param registryName Name of the registry
   * @returns Promise<RegistryConfig | null> Registry configuration or null if not found
   */
  async getRegistry(registryName: string): Promise<RegistryConfig | null> {
    const config = await this.getConfig();
    return config.registries[registryName] || null;
  }

  /**
   * List all configured registries
   * @returns Promise<RegistryConfig[]> Array of registry configurations
   */
  async listRegistries(): Promise<RegistryConfig[]> {
    const config = await this.getConfig();
    return Object.values(config.registries);
  }

  /**
   * Set global GitHub token
   * @param token GitHub token
   * @returns Promise<void>
   */
  async setGlobalToken(token: string): Promise<void> {
    const config = await this.getConfig();
    config.globalToken = token;
    await this.saveConfig();
  }

  /**
   * Remove global GitHub token
   * @returns Promise<void>
   */
  async removeGlobalToken(): Promise<void> {
    const config = await this.getConfig();
    delete config.globalToken;
    await this.saveConfig();
  }

  /**
   * Set token for a specific registry
   * @param registryName Name of the registry
   * @param token GitHub token
   * @returns Promise<void>
   */
  async setRegistryToken(registryName: string, token: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.registries[registryName]) {
      throw new Error(`Registry '${registryName}' not found`);
    }

    config.registries[registryName].token = token;
    await this.saveConfig();
  }

  /**
   * Remove token from a specific registry
   * @param registryName Name of the registry
   * @returns Promise<void>
   */
  async removeRegistryToken(registryName: string): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.registries[registryName]) {
      throw new Error(`Registry '${registryName}' not found`);
    }

    delete config.registries[registryName].token;
    await this.saveConfig();
  }

  /**
   * Update cache settings
   * @param cacheSettings Cache configuration
   * @returns Promise<void>
   */
  async setCacheSettings(cacheSettings: { enabled?: boolean; ttl?: number; directory?: string }): Promise<void> {
    const config = await this.getConfig();
    
    if (!config.cache) {
      config.cache = {
        enabled: true,
        ttl: 3600,
        directory: path.join(os.homedir(), '.cache', 'qraft')
      };
    }

    if (cacheSettings.enabled !== undefined) {
      config.cache.enabled = cacheSettings.enabled;
    }
    if (cacheSettings.ttl !== undefined) {
      config.cache.ttl = cacheSettings.ttl;
    }
    if (cacheSettings.directory !== undefined) {
      config.cache.directory = cacheSettings.directory;
    }

    await this.saveConfig();
  }

  /**
   * Add a new registry
   * @param name Registry name
   * @param registry Registry configuration
   * @returns Promise<void>
   */
  async addRegistry(name: string, registry: RegistryConfig): Promise<void> {
    const config = await this.getConfig();
    config.registries[name] = registry;
    await this.saveConfig();
  }

  /**
   * Update cache configuration (alias for setCacheSettings)
   * @param updates Partial cache configuration updates
   * @returns Promise<void>
   */
  async updateCacheConfig(updates: { enabled?: boolean; ttl?: number; directory?: string }): Promise<void> {
    await this.setCacheSettings(updates);
  }

  /**
   * Reset configuration to defaults
   * @returns Promise<void>
   */
  async resetConfig(): Promise<void> {
    this.config = this.createDefaultConfig();
    await this.saveConfig();
  }

  /**
   * Get the configuration file path
   * @returns string Path to the configuration file
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Check if configuration file exists
   * @returns Promise<boolean> True if config file exists
   */
  async configExists(): Promise<boolean> {
    return fs.pathExists(this.configPath);
  }
}
