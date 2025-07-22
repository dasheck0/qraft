import * as fs from 'fs-extra';
import * as path from 'path';
import {
  BoxInfo,
  BoxOperationConfig,
  BoxOperationResult,
  BoxReference
} from '../types';
import { ConfigManager } from '../utils/config';
import { ManifestUtils } from '../utils/manifestUtils';
import { CacheManager } from './cacheManager';
import { LocalManifestEntry, ManifestManager } from './manifestManager';
import { RegistryManager } from './registryManager';

/**
 * BoxManager that supports both local and remote GitHub repositories
 */
export class BoxManager {
  private configManager: ConfigManager;
  private registryManager: RegistryManager | null = null;
  private cacheManager: CacheManager | null = null;
  private manifestManager: ManifestManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
    this.manifestManager = new ManifestManager();
  }

  /**
   * Initialize the managers (lazy loading)
   */
  private async initializeManagers(): Promise<void> {
    if (!this.registryManager || !this.cacheManager) {
      const config = await this.configManager.getConfig();
      this.registryManager = new RegistryManager(config);
      this.cacheManager = new CacheManager(config.cache);
    }
  }

  /**
   * Parse a box reference string and resolve registry
   * @param reference Box reference (e.g., "n8n", "myorg/n8n")
   * @param overrideRegistry Optional registry to override the parsed registry
   * @returns Promise<BoxReference> Parsed and resolved reference
   */
  async parseBoxReference(reference: string, overrideRegistry?: string): Promise<BoxReference> {
    await this.initializeManagers();
    return this.registryManager!.parseBoxReference(reference, overrideRegistry);
  }

  /**
   * Resolve registry name to configuration
   * @param registryName Registry name
   * @returns Promise<RegistryConfig> Registry configuration
   */
  async resolveRegistry(registryName: string) {
    await this.initializeManagers();
    return this.registryManager!.resolveRegistry(registryName);
  }

  /**
   * Get the effective registry for a box reference
   * @param reference Box reference
   * @param overrideRegistry Optional registry override
   * @returns Promise<string> Effective registry name
   */
  async getEffectiveRegistry(reference: string, overrideRegistry?: string): Promise<string> {
    await this.initializeManagers();
    return this.registryManager!.getEffectiveRegistry(reference, overrideRegistry);
  }

  /**
   * Discover all available boxes from the default registry
   * @param registryName Optional registry name (uses default if not provided)
   * @returns Promise<BoxInfo[]> Array of discovered boxes
   */
  async discoverBoxes(registryName?: string): Promise<BoxInfo[]> {
    await this.initializeManagers();

    try {
      const boxNames = await this.registryManager!.listBoxes(registryName);
      const boxes: BoxInfo[] = [];

      for (const boxName of boxNames) {
        const boxRef = await this.parseBoxReference(
          registryName ? `${registryName}/${boxName}` : boxName
        );
        const boxInfo = await this.getBoxInfo(boxRef);
        if (boxInfo) {
          boxes.push(boxInfo);
        }
      }

      return boxes.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    } catch (error) {
      throw new Error(`Failed to discover boxes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get information about a specific box
   * @param boxRef Box reference or string
   * @returns Promise<BoxInfo | null> Box information or null if not found
   */
  async getBoxInfo(boxRef: BoxReference | string): Promise<BoxInfo | null> {
    await this.initializeManagers();

    const parsedRef = typeof boxRef === 'string'
      ? await this.parseBoxReference(boxRef)
      : boxRef;

    try {
      // Check cache first - TEMPORARILY DISABLED FOR DEBUGGING
      // const cachedEntry = await this.cacheManager!.getCacheEntry(parsedRef);
      // if (cachedEntry) {
      //   console.log(`DEBUG: BoxManager using cached entry with ${cachedEntry.files.length} files:`, cachedEntry.files);
      //   return {
      //     manifest: cachedEntry.manifest,
      //     path: cachedEntry.localPath,
      //     files: cachedEntry.files
      //   };
      // }

      // Fetch from registry
      const boxInfo = await this.registryManager!.getBoxInfo(parsedRef);
      if (boxInfo) {
        // Cache the box info for future use
        const fileContents = new Map<string, Buffer>();
        // Note: We're not downloading files here, just caching metadata
        await this.cacheManager!.setCacheEntry(
          parsedRef,
          boxInfo.manifest,
          boxInfo.files,
          fileContents
        );
      }

      return boxInfo;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a box exists
   * @param boxRef Box reference or string
   * @returns Promise<boolean> True if box exists
   */
  async boxExists(boxRef: BoxReference | string): Promise<boolean> {
    await this.initializeManagers();

    const parsedRef = typeof boxRef === 'string'
      ? await this.parseBoxReference(boxRef)
      : boxRef;

    return await this.registryManager!.boxExists(parsedRef);
  }

  /**
   * List all available boxes with their basic information
   * @param registryName Optional registry name
   * @returns Promise<Array<{name: string, description: string, version: string}>> Simple list of boxes
   */
  async listBoxes(registryName?: string): Promise<Array<{ name: string; description: string; version: string }>> {
    const boxes = await this.discoverBoxes(registryName);
    return boxes.map(box => ({
      name: box.manifest.name,
      description: box.manifest.description,
      version: box.manifest.version
    }));
  }

  /**
   * Copy a box to a target directory with GitHub support
   * @param config Box operation configuration
   * @param overrideRegistry Optional registry to override the parsed registry
   * @returns Promise<BoxOperationResult> Result of the operation
   */
  async copyBox(config: BoxOperationConfig, overrideRegistry?: string): Promise<BoxOperationResult> {
    await this.initializeManagers();

    try {
      // Parse box reference with optional registry override
      const boxRef = await this.parseBoxReference(config.boxName, overrideRegistry);

      // Get box information
      const boxInfo = await this.getBoxInfo(boxRef);
      if (!boxInfo) {
        const effectiveRegistry = await this.getEffectiveRegistry(config.boxName, overrideRegistry);
        return {
          success: false,
          message: `Box '${config.boxName}' not found in registry '${effectiveRegistry}'`,
          error: new Error(`Box '${config.boxName}' does not exist in registry '${effectiveRegistry}'`)
        };
      }

      // Determine target directory
      const targetDir = config.targetDirectory ?? boxInfo.manifest.defaultTarget ?? process.cwd();
      const resolvedTargetDir = path.resolve(targetDir);

      // Download and copy files
      const results = await this.downloadAndCopyFiles(boxRef, boxInfo, resolvedTargetDir, config.force);



      // Store manifest locally after successful file operations (unless noSync is enabled)
      if (!config.nosync) {
        try {
          await this.storeManifestLocally(boxRef, boxInfo, resolvedTargetDir);
        } catch (manifestError) {
          // Log manifest storage error but don't fail the entire operation
          console.warn(`Warning: Failed to store manifest locally: ${manifestError instanceof Error ? manifestError.message : 'Unknown error'}`);
        }
      }

      // Analyze results
      const copiedFiles = results.filter(r => r.success).map(r => r.destination);
      const skippedFiles = results.filter(r => r.skipped).map(r => r.destination);
      const failedFiles = results.filter(r => !r.success && !r.skipped);

      if (failedFiles.length > 0) {
        return {
          success: false,
          message: `Failed to copy ${failedFiles.length} files from box '${config.boxName}'`,
          copiedFiles,
          skippedFiles,
          error: failedFiles[0].error || new Error('Unknown error during file copy')
        };
      }

      const message = skippedFiles.length > 0
        ? `Successfully copied ${copiedFiles.length} files from box '${config.boxName}' (${skippedFiles.length} skipped)`
        : `Successfully copied ${copiedFiles.length} files from box '${config.boxName}'`;

      return {
        success: true,
        message,
        copiedFiles,
        skippedFiles
      };

    } catch (error) {
      return {
        success: false,
        message: `Error copying box '${config.boxName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  /**
   * Download files from GitHub and copy them to target directory
   * @param boxRef Box reference
   * @param boxInfo Box information
   * @param targetDir Target directory
   * @param force Whether to force overwrite
   * @returns Promise<Array> File operation results
   */
  private async downloadAndCopyFiles(
    boxRef: BoxReference,
    boxInfo: BoxInfo,
    targetDir: string,
    force: boolean
  ): Promise<Array<{ success: boolean; skipped: boolean; destination: string; error?: Error }>> {
    const results: Array<{ success: boolean; skipped: boolean; destination: string; error?: Error }> = [];
    // Ensure .qraft/ is always excluded to prevent recursive boxing
    const excludePatterns = ManifestUtils.getUpdatedExcludePatterns(boxInfo.manifest.exclude || []);

    for (const filePath of boxInfo.files) {
      // Check if file should be excluded
      if (this.shouldExcludeFile(filePath, excludePatterns)) {
        results.push({
          success: false,
          skipped: true,
          destination: path.join(targetDir, filePath)
        });
        continue;
      }

      try {
        const destinationPath = path.join(targetDir, filePath);

        // Check if destination exists and handle overwrite protection
        const destinationExists = await fs.pathExists(destinationPath);
        if (destinationExists && !force) {
          results.push({
            success: false,
            skipped: true,
            destination: destinationPath
          });
          continue;
        }

        // Try to get file from cache first
        let fileContent = await this.cacheManager!.getCachedFile(boxRef, filePath);

        if (!fileContent) {
          // Download from GitHub
          fileContent = await this.registryManager!.downloadFile(boxRef, filePath);

          // Cache the file
          const fileContents = new Map<string, Buffer>();
          fileContents.set(filePath, fileContent);
          await this.cacheManager!.setCacheEntry(boxRef, boxInfo.manifest, [filePath], fileContents);
        }

        // Ensure destination directory exists
        await fs.ensureDir(path.dirname(destinationPath));

        // Write file
        await fs.writeFile(destinationPath, fileContent);

        results.push({
          success: true,
          skipped: false,
          destination: destinationPath
        });

      } catch (error) {
        results.push({
          success: false,
          skipped: false,
          destination: path.join(targetDir, filePath),
          error: error instanceof Error ? error : new Error('Unknown error')
        });
      }
    }

    return results;
  }

  /**
   * Check if a file should be excluded based on patterns
   * @param filePath Relative file path
   * @param excludePatterns Array of patterns to match against
   * @returns boolean True if file should be excluded
   */
  private shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
    if (excludePatterns.length === 0) {
      return false;
    }

    const normalizedPath = filePath.replace(/\\/g, '/');

    return excludePatterns.some(pattern => {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(normalizedPath) || normalizedPath.includes(pattern);
    });
  }

  /**
   * Copy a box by name with simplified parameters
   * @param boxName Name of the box to copy
   * @param targetDirectory Target directory (optional)
   * @param force Whether to force overwrite existing files
   * @param overrideRegistry Optional registry to override the parsed registry
   * @param nosync Whether to skip creating .qraft directory (no sync tracking)
   * @returns Promise<BoxOperationResult> Result of the operation
   */
  async copyBoxByName(
    boxName: string,
    targetDirectory?: string,
    force: boolean = false,
    overrideRegistry?: string,
    nosync: boolean = false
  ): Promise<BoxOperationResult> {
    const config: BoxOperationConfig = {
      boxName,
      targetDirectory: targetDirectory ?? process.cwd(),
      force,
      interactive: false,
      boxesDirectory: '', // Not used in GitHub mode
      nosync: nosync
    };

    return this.copyBox(config, overrideRegistry);
  }

  /**
   * List all configured registries
   * @returns Promise<Array<{name: string, repository: string, isDefault: boolean}>> List of registries
   */
  async listRegistries(): Promise<Array<{ name: string; repository: string; isDefault: boolean }>> {
    await this.initializeManagers();
    const registries = this.registryManager!.getRegistries();

    return Object.values(registries).map(registry => ({
      name: registry.name,
      repository: registry.repository,
      isDefault: registry.isDefault || false
    }));
  }

  /**
   * Get the default registry name
   * @returns Promise<string> Default registry name
   */
  async getDefaultRegistry(): Promise<string> {
    await this.initializeManagers();
    return this.registryManager!.getDefaultRegistry();
  }

  /**
   * Check if a registry has authentication configured
   * @param registryName Name of the registry
   * @returns Promise<boolean> True if authentication is available
   */
  async hasAuthentication(registryName: string): Promise<boolean> {
    await this.initializeManagers();
    return this.registryManager!.hasAuthentication(registryName);
  }

  /**
   * Test authentication for a registry
   * @param registryName Name of the registry
   * @returns Promise<{authenticated: boolean, user?: string, error?: string}> Authentication test result
   */
  async testAuthentication(registryName: string): Promise<{
    authenticated: boolean;
    user?: string;
    error?: string;
  }> {
    await this.initializeManagers();
    return this.registryManager!.testAuthentication(registryName);
  }

  /**
   * Set authentication token for a registry
   * @param registryName Name of the registry
   * @param token GitHub token
   * @returns Promise<void>
   */
  async setRegistryToken(registryName: string, token: string): Promise<void> {
    await this.configManager.setRegistryToken(registryName, token);
    // Clear cached Octokit instance to use new token
    await this.initializeManagers();
  }

  /**
   * Set global authentication token
   * @param token GitHub token
   * @returns Promise<void>
   */
  async setGlobalToken(token: string): Promise<void> {
    await this.configManager.setGlobalToken(token);
    // Clear cached managers to use new token
    this.registryManager = null;
    this.cacheManager = null;
  }

  /**
   * Get GitHub token for a registry
   * @param registryName Name of the registry
   * @returns Promise<string | undefined> GitHub token
   */
  async getGitHubToken(registryName: string): Promise<string | undefined> {
    const config = await this.configManager.getConfig();

    // First try registry-specific token
    if (config.registries[registryName]?.token) {
      return config.registries[registryName].token;
    }

    // Fall back to global token
    return config.globalToken;
  }

  /**
   * Store manifest locally in the target directory
   * @param boxRef Box reference
   * @param boxInfo Box information
   * @param targetDir Target directory
   * @returns Promise<void>
   */
  private async storeManifestLocally(
    boxRef: BoxReference,
    boxInfo: BoxInfo,
    targetDir: string
  ): Promise<void> {
    try {
      // Store the manifest with source information
      await this.manifestManager.storeLocalManifest(
        targetDir,
        boxInfo.manifest,
        boxRef.registry,
        boxRef.fullReference
      );
    } catch (error) {
      throw new Error(`Failed to store manifest locally: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a box is new or updated compared to local manifest
   * @param boxInfo Remote box information
   * @param targetDir Target directory
   * @returns Promise<'new' | 'updated' | 'identical' | 'unknown'>
   */
  async detectBoxState(
    boxInfo: BoxInfo,
    targetDir: string
  ): Promise<'new' | 'updated' | 'identical' | 'unknown'> {
    try {
      const localManifest = await this.manifestManager.getLocalManifest(targetDir);

      if (!localManifest) {
        return 'new';
      }

      const comparison = this.manifestManager.compareManifests(
        localManifest.manifest,
        boxInfo.manifest
      );

      if (comparison.isIdentical) {
        return 'identical';
      } else {
        return 'updated';
      }
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get local manifest for a directory
   * @param targetDir Target directory
   * @returns Promise<LocalManifestEntry | null>
   */
  async getLocalManifest(targetDir: string): Promise<LocalManifestEntry | null> {
    return this.manifestManager.getLocalManifest(targetDir);
  }

  /**
   * Check if local manifest exists
   * @param targetDir Target directory
   * @returns Promise<boolean>
   */
  async hasLocalManifest(targetDir: string): Promise<boolean> {
    return this.manifestManager.hasLocalManifest(targetDir);
  }

  /**
   * Synchronize local manifest with remote
   * @param boxRef Box reference
   * @param targetDir Target directory
   * @returns Promise<boolean> True if sync was needed and performed
   */
  async syncManifest(boxRef: BoxReference, targetDir: string): Promise<boolean> {
    try {
      const boxInfo = await this.getBoxInfo(boxRef);
      if (!boxInfo) {
        throw new Error(`Box '${boxRef.fullReference}' not found`);
      }

      const state = await this.detectBoxState(boxInfo, targetDir);

      if (state === 'updated' || state === 'new') {
        await this.storeManifestLocally(boxRef, boxInfo, targetDir);
        return true;
      }

      return false;
    } catch (error) {
      throw new Error(`Failed to sync manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get manifest manager instance
   * @returns ManifestManager Manifest manager instance
   */
  getManifestManager(): ManifestManager {
    return this.manifestManager;
  }

  /**
   * Get configuration manager
   * @returns ConfigManager Configuration manager instance
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }
}
