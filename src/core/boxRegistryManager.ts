import * as fs from 'fs-extra';
import * as path from 'path';
import { BoxRegistry, BoxRegistryEntry, BoxManifest } from '../types';

/**
 * BoxRegistryManager handles the mapping between box names and their remote paths
 * This enables Strategy 1: Separate Box Name and Remote Path
 */
export class BoxRegistryManager {
  private static readonly REGISTRY_FILE = '.qraft/box-registry.json';
  private static readonly REGISTRY_VERSION = '1.0.0';

  /**
   * Get the path to the registry file for a given registry directory
   * @param registryPath Path to the registry root
   * @returns string Path to the box-registry.json file
   */
  private static getRegistryFilePath(registryPath: string): string {
    return path.join(registryPath, this.REGISTRY_FILE);
  }

  /**
   * Load box registry from the registry directory
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @returns Promise<BoxRegistry> The loaded registry or a new empty one
   */
  async loadRegistry(registryPath: string, registryName: string): Promise<BoxRegistry> {
    const registryFilePath = BoxRegistryManager.getRegistryFilePath(registryPath);

    try {
      if (await fs.pathExists(registryFilePath)) {
        const content = await fs.readFile(registryFilePath, 'utf-8');
        const registry = JSON.parse(content) as BoxRegistry;
        
        // Validate registry structure
        if (!registry.metadata || !registry.boxes) {
          throw new Error('Invalid registry structure');
        }
        
        return registry;
      }
    } catch (error) {
      console.warn(`Failed to load box registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Return empty registry if file doesn't exist or is invalid
    return this.createEmptyRegistry(registryName);
  }

  /**
   * Save box registry to the registry directory
   * @param registryPath Path to the registry root
   * @param registry Registry to save
   * @returns Promise<void>
   */
  async saveRegistry(registryPath: string, registry: BoxRegistry): Promise<void> {
    const registryFilePath = BoxRegistryManager.getRegistryFilePath(registryPath);
    
    // Ensure .qraft directory exists
    await fs.ensureDir(path.dirname(registryFilePath));
    
    // Update metadata
    registry.metadata.lastUpdated = new Date().toISOString();
    
    // Save registry
    await fs.writeFile(registryFilePath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  /**
   * Register a new box in the registry
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param boxName Name of the box
   * @param remotePath Remote path where the box is stored
   * @param manifest Box manifest for additional metadata
   * @returns Promise<void>
   */
  async registerBox(
    registryPath: string,
    registryName: string,
    boxName: string,
    remotePath: string,
    manifest: BoxManifest
  ): Promise<void> {
    const registry = await this.loadRegistry(registryPath, registryName);
    
    const entry: BoxRegistryEntry = {
      remotePath,
      lastUpdated: new Date().toISOString(),
      version: manifest.version,
      description: manifest.description
    };
    
    registry.boxes[boxName] = entry;
    
    await this.saveRegistry(registryPath, registry);
  }

  /**
   * Get the remote path for a box name
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param boxName Name of the box to look up
   * @returns Promise<string | null> Remote path or null if not found
   */
  async getRemotePath(
    registryPath: string,
    registryName: string,
    boxName: string
  ): Promise<string | null> {
    const registry = await this.loadRegistry(registryPath, registryName);
    const entry = registry.boxes[boxName];
    return entry ? entry.remotePath : null;
  }

  /**
   * Get all registered boxes
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @returns Promise<Record<string, BoxRegistryEntry>> Map of box names to entries
   */
  async getAllBoxes(
    registryPath: string,
    registryName: string
  ): Promise<Record<string, BoxRegistryEntry>> {
    const registry = await this.loadRegistry(registryPath, registryName);
    return registry.boxes;
  }

  /**
   * Update an existing box entry
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param boxName Name of the box to update
   * @param manifest Updated manifest
   * @returns Promise<boolean> True if box was updated, false if not found
   */
  async updateBox(
    registryPath: string,
    registryName: string,
    boxName: string,
    manifest: BoxManifest
  ): Promise<boolean> {
    const registry = await this.loadRegistry(registryPath, registryName);
    const entry = registry.boxes[boxName];
    
    if (!entry) {
      return false;
    }
    
    entry.lastUpdated = new Date().toISOString();
    entry.version = manifest.version;
    entry.description = manifest.description;
    
    await this.saveRegistry(registryPath, registry);
    return true;
  }

  /**
   * Remove a box from the registry
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param boxName Name of the box to remove
   * @returns Promise<boolean> True if box was removed, false if not found
   */
  async removeBox(
    registryPath: string,
    registryName: string,
    boxName: string
  ): Promise<boolean> {
    const registry = await this.loadRegistry(registryPath, registryName);
    
    if (!registry.boxes[boxName]) {
      return false;
    }
    
    delete registry.boxes[boxName];
    await this.saveRegistry(registryPath, registry);
    return true;
  }

  /**
   * Check if a box name exists in the registry
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param boxName Name of the box to check
   * @returns Promise<boolean> True if box exists
   */
  async boxExists(
    registryPath: string,
    registryName: string,
    boxName: string
  ): Promise<boolean> {
    const registry = await this.loadRegistry(registryPath, registryName);
    return boxName in registry.boxes;
  }

  /**
   * Find box name by remote path (reverse lookup)
   * @param registryPath Path to the registry root
   * @param registryName Name of the registry
   * @param remotePath Remote path to search for
   * @returns Promise<string | null> Box name or null if not found
   */
  async findBoxByRemotePath(
    registryPath: string,
    registryName: string,
    remotePath: string
  ): Promise<string | null> {
    const registry = await this.loadRegistry(registryPath, registryName);
    
    for (const [boxName, entry] of Object.entries(registry.boxes)) {
      if (entry.remotePath === remotePath) {
        return boxName;
      }
    }
    
    return null;
  }

  /**
   * Create an empty registry structure
   * @param registryName Name of the registry
   * @returns BoxRegistry Empty registry
   */
  private createEmptyRegistry(registryName: string): BoxRegistry {
    return {
      metadata: {
        name: registryName,
        lastUpdated: new Date().toISOString(),
        version: BoxRegistryManager.REGISTRY_VERSION
      },
      boxes: {}
    };
  }

  /**
   * Validate registry structure
   * @param registry Registry to validate
   * @returns boolean True if valid
   */
  static validateRegistry(registry: any): registry is BoxRegistry {
    return (
      registry &&
      typeof registry === 'object' &&
      registry.metadata &&
      typeof registry.metadata === 'object' &&
      registry.boxes &&
      typeof registry.boxes === 'object'
    );
  }
}
