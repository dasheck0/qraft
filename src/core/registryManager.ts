import { Octokit } from '@octokit/rest';
import {
  BoxInfo,
  BoxManifest,
  BoxReference,
  RegistryConfig,
  RegistryManagerConfig
} from '../types';

/**
 * RegistryManager handles GitHub API integration for remote template repositories
 */
export class RegistryManager {
  private config: RegistryManagerConfig;
  private octokitInstances: Map<string, Octokit> = new Map();

  constructor(config: RegistryManagerConfig) {
    this.config = config;
  }

  /**
   * Parse a box reference string into registry and box name components
   * @param reference Box reference (e.g., "n8n", "myorg/n8n", "myorg/templates/n8n")
   * @param overrideRegistry Optional registry to override the parsed registry
   * @returns BoxReference Parsed reference information
   */
  parseBoxReference(reference: string, overrideRegistry?: string): BoxReference {
    const parts = reference.split('/');
    let registry: string;
    let boxName: string;

    if (parts.length === 1) {
      // Simple box name, use override registry or default registry
      registry = overrideRegistry || this.config.defaultRegistry;
      boxName = parts[0];
    } else if (parts.length === 2) {
      // Registry/boxName format
      registry = overrideRegistry || parts[0];
      boxName = parts[1];
    } else {
      // Assume last part is box name, everything before is registry
      boxName = parts[parts.length - 1];
      registry = overrideRegistry || parts.slice(0, -1).join('/');
    }

    // Validate that the registry exists in configuration
    if (!this.config.registries[registry]) {
      throw new Error(`Registry '${registry}' is not configured. Available registries: ${Object.keys(this.config.registries).join(', ')}`);
    }

    return {
      registry,
      boxName,
      fullReference: reference
    };
  }

  /**
   * Resolve registry name to full registry configuration
   * @param registryName Registry name or alias
   * @returns RegistryConfig Registry configuration
   */
  resolveRegistry(registryName: string): RegistryConfig {
    const registry = this.config.registries[registryName];
    if (!registry) {
      throw new Error(`Registry '${registryName}' not found. Available registries: ${Object.keys(this.config.registries).join(', ')}`);
    }
    return registry;
  }

  /**
   * Get the effective registry for a box reference
   * @param reference Box reference
   * @param overrideRegistry Optional registry override
   * @returns string Effective registry name
   */
  getEffectiveRegistry(reference: string, overrideRegistry?: string): string {
    if (overrideRegistry) {
      // Validate override registry exists
      if (!this.config.registries[overrideRegistry]) {
        throw new Error(`Override registry '${overrideRegistry}' is not configured`);
      }
      return overrideRegistry;
    }

    const parts = reference.split('/');
    if (parts.length === 1) {
      // Simple box name, use default registry
      return this.config.defaultRegistry;
    } else {
      // Extract registry from reference
      const registryFromRef = parts.length === 2 ? parts[0] : parts.slice(0, -1).join('/');

      // Validate registry exists
      if (!this.config.registries[registryFromRef]) {
        throw new Error(`Registry '${registryFromRef}' from reference '${reference}' is not configured`);
      }

      return registryFromRef;
    }
  }

  /**
   * Get or create an Octokit instance for a specific registry
   * @param registryName Name of the registry
   * @returns Promise<Octokit> Configured Octokit instance
   */
  private async getOctokitInstance(registryName: string): Promise<Octokit> {
    if (this.octokitInstances.has(registryName)) {
      return this.octokitInstances.get(registryName)!;
    }

    const registryConfig = this.config.registries[registryName];
    if (!registryConfig) {
      throw new Error(`Registry '${registryName}' not found in configuration`);
    }

    const octokitConfig: any = {
      baseUrl: registryConfig.baseUrl || 'https://api.github.com'
    };

    // Add authentication if token is available
    const token = this.getAuthToken(registryName);
    if (token) {
      octokitConfig.auth = token;
    }

    const octokit = new Octokit(octokitConfig);
    this.octokitInstances.set(registryName, octokit);

    return octokit;
  }

  /**
   * Get authentication token for a registry
   * @param registryName Name of the registry
   * @returns string | undefined Authentication token or undefined if not available
   */
  private getAuthToken(registryName: string): string | undefined {
    const registryConfig = this.config.registries[registryName];
    if (!registryConfig) {
      return undefined;
    }

    // Priority: registry-specific token > global token
    return registryConfig.token || this.config.globalToken;
  }

  /**
   * Check if a registry has authentication configured
   * @param registryName Name of the registry
   * @returns boolean True if authentication is available
   */
  hasAuthentication(registryName: string): boolean {
    return this.getAuthToken(registryName) !== undefined;
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
    try {
      const octokit = await this.getOctokitInstance(registryName);

      // Try to get authenticated user info
      const { data: user } = await octokit.rest.users.getAuthenticated();

      return {
        authenticated: true,
        user: user.login
      };
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's an authentication error
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
          return {
            authenticated: false,
            error: 'Invalid or expired authentication token'
          };
        }

        // Check if no authentication was provided but required
        if (error.message.includes('403') && error.message.includes('rate limit')) {
          return {
            authenticated: false,
            error: 'No authentication provided - required for private repositories or to avoid rate limits'
          };
        }

        return {
          authenticated: false,
          error: error.message
        };
      }

      return {
        authenticated: false,
        error: 'Unknown authentication error'
      };
    }
  }

  /**
   * List all boxes available in a registry
   * @param registryName Name of the registry (optional, uses default if not provided)
   * @returns Promise<string[]> Array of box names
   */
  async listBoxes(registryName?: string): Promise<string[]> {
    const registry = registryName || this.config.defaultRegistry;
    const registryConfig = this.config.registries[registry];
    
    if (!registryConfig) {
      throw new Error(`Registry '${registry}' not found`);
    }

    try {
      const octokit = await this.getOctokitInstance(registry);
      const [owner, repo] = registryConfig.repository.split('/');

      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: ''
      });

      if (!Array.isArray(data)) {
        return [];
      }

      // Filter for directories that contain manifest.json
      const boxes: string[] = [];
      for (const item of data) {
        if (item.type === 'dir') {
          try {
            // Check if manifest.json exists in this directory
            await octokit.rest.repos.getContent({
              owner,
              repo,
              path: `${item.name}/manifest.json`
            });
            boxes.push(item.name);
          } catch (error) {
            // Directory doesn't contain manifest.json, skip it
            continue;
          }
        }
      }

      return boxes.sort();
    } catch (error) {
      if (error instanceof Error) {
        // Check for authentication errors
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
          throw new Error(`Authentication failed for registry '${registry}'. Please check your GitHub token.`);
        }

        if (error.message.includes('403')) {
          if (error.message.includes('rate limit')) {
            throw new Error(`Rate limit exceeded for registry '${registry}'. Consider adding authentication to increase rate limits.`);
          }
          throw new Error(`Access denied to registry '${registry}'. This may be a private repository requiring authentication.`);
        }

        if (error.message.includes('404')) {
          throw new Error(`Repository not found for registry '${registry}'. Please check the repository name.`);
        }

        throw new Error(`Failed to list boxes from registry '${registry}': ${error.message}`);
      }

      throw new Error(`Failed to list boxes from registry '${registry}': Unknown error`);
    }
  }

  /**
   * Get box information from a registry
   * @param boxRef Box reference
   * @returns Promise<BoxInfo | null> Box information or null if not found
   */
  async getBoxInfo(boxRef: BoxReference): Promise<BoxInfo | null> {
    const registryConfig = this.config.registries[boxRef.registry];
    if (!registryConfig) {
      throw new Error(`Registry '${boxRef.registry}' not found`);
    }

    try {
      const octokit = await this.getOctokitInstance(boxRef.registry);
      const [owner, repo] = registryConfig.repository.split('/');

      // Get manifest.json
      const manifestResponse = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: `${boxRef.boxName}/manifest.json`
      });

      if (Array.isArray(manifestResponse.data) || manifestResponse.data.type !== 'file') {
        return null;
      }

      // Decode manifest content
      const manifestContent = Buffer.from(manifestResponse.data.content, 'base64').toString('utf-8');
      const manifest: BoxManifest = JSON.parse(manifestContent);

      // Validate required fields
      if (!manifest.name || !manifest.description || !manifest.author || !manifest.version) {
        throw new Error(`Invalid manifest for box '${boxRef.boxName}': missing required fields`);
      }

      // Get list of files in the box
      const files = await this.getBoxFiles(boxRef);

      return {
        manifest,
        path: `${registryConfig.repository}/${boxRef.boxName}`,
        files
      };

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('404')) {
          return null; // Box not found
        }

        // Check for authentication errors
        if (error.message.includes('401') || error.message.includes('Bad credentials')) {
          throw new Error(`Authentication failed for registry '${boxRef.registry}'. Please check your GitHub token.`);
        }

        if (error.message.includes('403')) {
          if (error.message.includes('rate limit')) {
            throw new Error(`Rate limit exceeded for registry '${boxRef.registry}'. Consider adding authentication to increase rate limits.`);
          }
          throw new Error(`Access denied to box '${boxRef.fullReference}'. This may be a private repository requiring authentication.`);
        }
      }

      throw error;
    }
  }

  /**
   * Get list of files in a box
   * @param boxRef Box reference
   * @returns Promise<string[]> Array of relative file paths
   */
  async getBoxFiles(boxRef: BoxReference): Promise<string[]> {
    const registryConfig = this.config.registries[boxRef.registry];
    if (!registryConfig) {
      throw new Error(`Registry '${boxRef.registry}' not found`);
    }

    try {
      const octokit = await this.getOctokitInstance(boxRef.registry);
      const [owner, repo] = registryConfig.repository.split('/');

      const files: string[] = [];

      const scanDirectory = async (dirPath: string, relativePath: string = ''): Promise<void> => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: dirPath
          });

          if (!Array.isArray(data)) {
            // If data is not an array, it might be a single file
            if (data.type === 'file') {
              const itemRelativePath = relativePath ? `${relativePath}/${data.name}` : data.name;
              // Skip manifest.json in root
              if (!(data.name === 'manifest.json' && relativePath === '')) {
                files.push(itemRelativePath);
              }
            }
            return;
          }

          for (const item of data) {
            const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;

            // Skip manifest.json in root
            if (item.name === 'manifest.json' && relativePath === '') {
              continue;
            }

            if (item.type === 'dir') {
              await scanDirectory(`${dirPath}/${item.name}`, itemRelativePath);
            } else {
              files.push(itemRelativePath);
            }
          }
        } catch (scanError) {
          // Log the error but don't fail the entire operation
          console.warn(`Warning: Failed to scan directory '${dirPath}': ${scanError instanceof Error ? scanError.message : 'Unknown error'}`);

          // If it's a 404, the directory might not exist, which is okay
          if (scanError instanceof Error && scanError.message.includes('404')) {
            return;
          }

          // For other errors, we should still throw to avoid silent failures
          throw scanError;
        }
      };

      await scanDirectory(boxRef.boxName);
      return files.sort();

    } catch (error) {
      throw new Error(`Failed to get files for box '${boxRef.fullReference}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a file from a box
   * @param boxRef Box reference
   * @param filePath Relative file path within the box
   * @returns Promise<Buffer> File content as buffer
   */
  async downloadFile(boxRef: BoxReference, filePath: string): Promise<Buffer> {
    const registryConfig = this.config.registries[boxRef.registry];
    if (!registryConfig) {
      throw new Error(`Registry '${boxRef.registry}' not found`);
    }

    try {
      const octokit = await this.getOctokitInstance(boxRef.registry);
      const [owner, repo] = registryConfig.repository.split('/');

      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: `${boxRef.boxName}/${filePath}`
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`File '${filePath}' is not a regular file`);
      }

      return Buffer.from(data.content, 'base64');

    } catch (error) {
      throw new Error(`Failed to download file '${filePath}' from box '${boxRef.fullReference}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a box exists in a registry
   * @param boxRef Box reference
   * @returns Promise<boolean> True if box exists
   */
  async boxExists(boxRef: BoxReference): Promise<boolean> {
    try {
      const boxInfo = await this.getBoxInfo(boxRef);
      return boxInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the default registry name
   * @returns string Default registry name
   */
  getDefaultRegistry(): string {
    return this.config.defaultRegistry;
  }

  /**
   * Get all configured registries
   * @returns Record<string, RegistryConfig> Map of registry configurations
   */
  getRegistries(): Record<string, RegistryConfig> {
    return { ...this.config.registries };
  }
}
