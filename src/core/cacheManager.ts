import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { CacheEntry, BoxReference, BoxManifest, RegistryManagerConfig } from '../types';

/**
 * CacheManager handles local caching of downloaded boxes for improved performance
 */
export class CacheManager {
  private cacheDirectory: string;
  private ttl: number; // Time to live in seconds
  private enabled: boolean;

  constructor(config: RegistryManagerConfig['cache']) {
    this.cacheDirectory = config?.directory || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.cache', 'unbox');
    this.ttl = config?.ttl || 3600; // Default 1 hour
    this.enabled = config?.enabled !== false; // Default enabled
  }

  /**
   * Generate a cache key for a box reference
   * @param boxRef Box reference
   * @returns string Cache key
   */
  private generateCacheKey(boxRef: BoxReference): string {
    const keyString = `${boxRef.registry}/${boxRef.boxName}`;
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Get the cache file path for a box reference
   * @param boxRef Box reference
   * @returns string Path to cache file
   */
  private getCacheFilePath(boxRef: BoxReference): string {
    const cacheKey = this.generateCacheKey(boxRef);
    return path.join(this.cacheDirectory, `${cacheKey}.json`);
  }

  /**
   * Get the cache directory path for a box reference
   * @param boxRef Box reference
   * @returns string Path to cache directory for box files
   */
  private getCacheDirectoryPath(boxRef: BoxReference): string {
    const cacheKey = this.generateCacheKey(boxRef);
    return path.join(this.cacheDirectory, cacheKey);
  }

  /**
   * Check if a cache entry exists and is valid
   * @param boxRef Box reference
   * @returns Promise<boolean> True if valid cache exists
   */
  async hasValidCache(boxRef: BoxReference): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const cacheFilePath = this.getCacheFilePath(boxRef);
      
      if (!(await fs.pathExists(cacheFilePath))) {
        return false;
      }

      const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
      const cacheEntry: CacheEntry = JSON.parse(cacheContent);

      // Check if cache has expired
      const now = Date.now();
      if (now > cacheEntry.expiresAt) {
        // Cache expired, clean it up
        await this.removeCacheEntry(boxRef);
        return false;
      }

      // Check if cache directory exists
      const cacheDir = this.getCacheDirectoryPath(boxRef);
      if (!(await fs.pathExists(cacheDir))) {
        // Cache metadata exists but files are missing
        await this.removeCacheEntry(boxRef);
        return false;
      }

      return true;
    } catch (error) {
      // If there's any error reading cache, consider it invalid
      return false;
    }
  }

  /**
   * Get cached box information
   * @param boxRef Box reference
   * @returns Promise<CacheEntry | null> Cache entry or null if not found/invalid
   */
  async getCacheEntry(boxRef: BoxReference): Promise<CacheEntry | null> {
    if (!this.enabled || !(await this.hasValidCache(boxRef))) {
      return null;
    }

    try {
      const cacheFilePath = this.getCacheFilePath(boxRef);
      const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
      return JSON.parse(cacheContent);
    } catch (error) {
      return null;
    }
  }

  /**
   * Store box information and files in cache
   * @param boxRef Box reference
   * @param manifest Box manifest
   * @param files Array of file paths
   * @param fileContents Map of file paths to their content
   * @returns Promise<void>
   */
  async setCacheEntry(
    boxRef: BoxReference,
    manifest: BoxManifest,
    files: string[],
    fileContents: Map<string, Buffer>
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Ensure cache directory exists
      await fs.ensureDir(this.cacheDirectory);

      const cacheDir = this.getCacheDirectoryPath(boxRef);
      await fs.ensureDir(cacheDir);

      // Store files
      for (const [filePath, content] of fileContents.entries()) {
        const fullFilePath = path.join(cacheDir, filePath);
        await fs.ensureDir(path.dirname(fullFilePath));
        await fs.writeFile(fullFilePath, content);
      }

      // Create cache entry
      const now = Date.now();
      const cacheEntry: CacheEntry = {
        boxReference: boxRef.fullReference,
        manifest,
        files,
        timestamp: now,
        expiresAt: now + (this.ttl * 1000),
        localPath: cacheDir
      };

      // Store cache metadata
      const cacheFilePath = this.getCacheFilePath(boxRef);
      await fs.writeFile(cacheFilePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');

    } catch (error) {
      // If caching fails, don't throw error - just log warning
      console.warn(`Warning: Failed to cache box '${boxRef.fullReference}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get cached file content
   * @param boxRef Box reference
   * @param filePath Relative file path within the box
   * @returns Promise<Buffer | null> File content or null if not cached
   */
  async getCachedFile(boxRef: BoxReference, filePath: string): Promise<Buffer | null> {
    if (!this.enabled || !(await this.hasValidCache(boxRef))) {
      return null;
    }

    try {
      const cacheDir = this.getCacheDirectoryPath(boxRef);
      const fullFilePath = path.join(cacheDir, filePath);
      
      if (await fs.pathExists(fullFilePath)) {
        return await fs.readFile(fullFilePath);
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Remove a specific cache entry
   * @param boxRef Box reference
   * @returns Promise<void>
   */
  async removeCacheEntry(boxRef: BoxReference): Promise<void> {
    try {
      const cacheFilePath = this.getCacheFilePath(boxRef);
      const cacheDir = this.getCacheDirectoryPath(boxRef);

      // Remove cache metadata file
      if (await fs.pathExists(cacheFilePath)) {
        await fs.remove(cacheFilePath);
      }

      // Remove cache directory
      if (await fs.pathExists(cacheDir)) {
        await fs.remove(cacheDir);
      }
    } catch (error) {
      // Ignore errors when removing cache
    }
  }

  /**
   * Clear all cache entries
   * @returns Promise<void>
   */
  async clearCache(): Promise<void> {
    try {
      if (await fs.pathExists(this.cacheDirectory)) {
        await fs.remove(this.cacheDirectory);
      }
    } catch (error) {
      throw new Error(`Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up expired cache entries
   * @returns Promise<number> Number of entries cleaned up
   */
  async cleanupExpiredEntries(): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let cleanedCount = 0;

    try {
      if (!(await fs.pathExists(this.cacheDirectory))) {
        return 0;
      }

      const entries = await fs.readdir(this.cacheDirectory);
      const now = Date.now();

      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          try {
            const cacheFilePath = path.join(this.cacheDirectory, entry);
            const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
            const cacheEntry: CacheEntry = JSON.parse(cacheContent);

            if (now > cacheEntry.expiresAt) {
              // Parse box reference to remove cache
              const boxRef: BoxReference = {
                registry: '',
                boxName: '',
                fullReference: cacheEntry.boxReference
              };

              // Parse the full reference
              const parts = cacheEntry.boxReference.split('/');
              if (parts.length === 1) {
                boxRef.boxName = parts[0];
                boxRef.registry = 'dasheck0'; // Default registry
              } else {
                boxRef.boxName = parts[parts.length - 1];
                boxRef.registry = parts.slice(0, -1).join('/');
              }

              await this.removeCacheEntry(boxRef);
              cleanedCount++;
            }
          } catch (error) {
            // If we can't parse a cache entry, remove it
            const cacheFilePath = path.join(this.cacheDirectory, entry);
            await fs.remove(cacheFilePath);
            cleanedCount++;
          }
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    return cleanedCount;
  }

  /**
   * Get cache statistics
   * @returns Promise<{totalEntries: number, totalSize: number, cacheDirectory: string}> Cache statistics
   */
  async getCacheStats(): Promise<{ totalEntries: number; totalSize: number; cacheDirectory: string }> {
    const stats = {
      totalEntries: 0,
      totalSize: 0,
      cacheDirectory: this.cacheDirectory
    };

    try {
      if (!(await fs.pathExists(this.cacheDirectory))) {
        return stats;
      }

      const calculateSize = async (dirPath: string): Promise<number> => {
        let size = 0;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            size += await calculateSize(fullPath);
          } else {
            const fileStat = await fs.stat(fullPath);
            size += fileStat.size;
          }
        }

        return size;
      };

      const entries = await fs.readdir(this.cacheDirectory);
      
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          stats.totalEntries++;
        }
      }

      stats.totalSize = await calculateSize(this.cacheDirectory);

    } catch (error) {
      // Return empty stats on error
    }

    return stats;
  }

  /**
   * Check if caching is enabled
   * @returns boolean True if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cache directory path
   * @returns string Cache directory path
   */
  getCacheDirectory(): string {
    return this.cacheDirectory;
  }

  /**
   * Get cache TTL in seconds
   * @returns number TTL in seconds
   */
  getTTL(): number {
    return this.ttl;
  }
}
