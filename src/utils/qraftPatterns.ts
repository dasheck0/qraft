import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from './config';

/**
 * Categories of qraft-specific patterns
 */
export enum QraftPatternCategory {
  LOCAL = 'local',
  GLOBAL = 'global',
  CACHE = 'cache',
  CONFIG = 'config'
}

/**
 * A qraft-specific gitignore pattern with metadata
 */
export interface QraftPattern {
  pattern: string;
  category: QraftPatternCategory;
  description: string;
  isStatic: boolean; // true if pattern is always the same, false if it depends on configuration
}

/**
 * Collection of qraft patterns organized by category
 */
export interface QraftPatternCollection {
  local: QraftPattern[];
  global: QraftPattern[];
  cache: QraftPattern[];
  config: QraftPattern[];
}

/**
 * QraftPatterns utility manages all qraft-specific gitignore patterns
 */
export class QraftPatterns {
  private configManager: ConfigManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
  }

  /**
   * Get all static qraft patterns that don't depend on configuration
   * @returns QraftPattern[] Array of static patterns
   */
  getStaticPatterns(): QraftPattern[] {
    return [
      // Local qraft directory
      {
        pattern: '.qraft/',
        category: QraftPatternCategory.LOCAL,
        description: 'Qraft box metadata and sync information',
        isStatic: true
      },
      
      // Local configuration files
      {
        pattern: '.qraftrc',
        category: QraftPatternCategory.CONFIG,
        description: 'Local qraft configuration file',
        isStatic: true
      },
      {
        pattern: '.qraftrc.json',
        category: QraftPatternCategory.CONFIG,
        description: 'Local qraft configuration file (JSON format)',
        isStatic: true
      },
      {
        pattern: '.qraftrc.yaml',
        category: QraftPatternCategory.CONFIG,
        description: 'Local qraft configuration file (YAML format)',
        isStatic: true
      },
      {
        pattern: '.qraftrc.yml',
        category: QraftPatternCategory.CONFIG,
        description: 'Local qraft configuration file (YAML format)',
        isStatic: true
      }
    ];
  }

  /**
   * Get dynamic qraft patterns that depend on configuration
   * @returns Promise<QraftPattern[]> Array of dynamic patterns
   */
  async getDynamicPatterns(): Promise<QraftPattern[]> {
    const patterns: QraftPattern[] = [];

    try {
      const config = await this.configManager.getConfig();

      // Add cache directory patterns
      const cachePatterns = await this.getCachePatterns(config);
      patterns.push(...cachePatterns);

      // Add registry-specific patterns
      const registryPatterns = await this.getRegistryPatterns(config);
      patterns.push(...registryPatterns);

      // Add authentication-related patterns
      const authPatterns = await this.getAuthPatterns(config);
      patterns.push(...authPatterns);

    } catch (error) {
      // If config loading fails, just return empty array for dynamic patterns
      // Static patterns will still be available
    }

    return patterns;
  }

  /**
   * Get cache-related patterns from configuration
   * @param config Qraft configuration
   * @returns Promise<QraftPattern[]> Cache patterns
   */
  private async getCachePatterns(config: any): Promise<QraftPattern[]> {
    const patterns: QraftPattern[] = [];

    // Main cache directory
    if (config.cache?.directory) {
      const cacheDir = config.cache.directory;

      // Only add if it's not the default system cache location
      if (!this.isSystemCacheDirectory(cacheDir)) {
        const relativePattern = this.getRelativePattern(cacheDir);
        if (relativePattern) {
          patterns.push({
            pattern: relativePattern,
            category: QraftPatternCategory.CACHE,
            description: 'Qraft cache directory',
            isStatic: false
          });
        }
      }
    }

    // Temporary cache files
    patterns.push({
      pattern: '.qraft-cache/',
      category: QraftPatternCategory.CACHE,
      description: 'Temporary qraft cache directory',
      isStatic: false
    });

    // Cache lock files
    patterns.push({
      pattern: '.qraft-cache.lock',
      category: QraftPatternCategory.CACHE,
      description: 'Qraft cache lock file',
      isStatic: false
    });

    return patterns;
  }

  /**
   * Get registry-related patterns from configuration
   * @param config Qraft configuration
   * @returns Promise<QraftPattern[]> Registry patterns
   */
  private async getRegistryPatterns(config: any): Promise<QraftPattern[]> {
    const patterns: QraftPattern[] = [];

    // Registry-specific temporary files
    if (config.registries) {
      patterns.push({
        pattern: '.qraft-registry-*',
        category: QraftPatternCategory.LOCAL,
        description: 'Temporary registry files',
        isStatic: false
      });
    }

    // Registry authentication tokens (if stored locally)
    patterns.push({
      pattern: '.qraft-tokens',
      category: QraftPatternCategory.CONFIG,
      description: 'Local registry authentication tokens',
      isStatic: false
    });

    return patterns;
  }

  /**
   * Get authentication-related patterns from configuration
   * @param _config Qraft configuration
   * @returns Promise<QraftPattern[]> Authentication patterns
   */
  private async getAuthPatterns(_config: any): Promise<QraftPattern[]> {
    const patterns: QraftPattern[] = [];

    // GitHub token files
    patterns.push({
      pattern: '.qraft-github-token',
      category: QraftPatternCategory.CONFIG,
      description: 'Local GitHub authentication token',
      isStatic: false
    });

    // SSH key files specific to qraft
    patterns.push({
      pattern: '.qraft-ssh-*',
      category: QraftPatternCategory.CONFIG,
      description: 'Qraft-specific SSH keys',
      isStatic: false
    });

    return patterns;
  }

  /**
   * Get configuration-specific patterns based on current config
   * @returns Promise<QraftPattern[]> Configuration-specific patterns
   */
  async getConfigSpecificPatterns(): Promise<QraftPattern[]> {
    const patterns: QraftPattern[] = [];

    try {
      const config = await this.configManager.getConfig();

      // Add patterns based on enabled features
      if (config.cache?.enabled) {
        patterns.push({
          pattern: '.qraft-temp-*',
          category: QraftPatternCategory.CACHE,
          description: 'Temporary qraft files',
          isStatic: false
        });
      }

      // Add patterns for each configured registry
      if (config.registries) {
        for (const registryName of Object.keys(config.registries)) {
          const safeName = this.sanitizeRegistryName(registryName);
          patterns.push({
            pattern: `.qraft-${safeName}-*`,
            category: QraftPatternCategory.LOCAL,
            description: `Temporary files for ${registryName} registry`,
            isStatic: false
          });
        }
      }

    } catch (error) {
      // If config loading fails, return empty array
    }

    return patterns;
  }

  /**
   * Sanitize registry name for use in file patterns
   * @param registryName Registry name to sanitize
   * @returns string Sanitized name
   */
  private sanitizeRegistryName(registryName: string): string {
    return registryName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Get patterns based on current working directory and config
   * @param targetDirectory Target directory for .gitignore
   * @returns Promise<QraftPattern[]> Context-aware patterns
   */
  async getContextAwarePatterns(targetDirectory: string): Promise<QraftPattern[]> {
    const allPatterns = await this.getAllPatterns();
    const configSpecific = await this.getConfigSpecificPatterns();
    const combined = [...allPatterns, ...configSpecific];

    // Filter patterns based on directory context
    const relevantPatterns: QraftPattern[] = [];

    for (const pattern of combined) {
      if (await this.isPatternRelevantForContext(pattern, targetDirectory)) {
        relevantPatterns.push(pattern);
      }
    }

    return relevantPatterns;
  }

  /**
   * Check if a pattern is relevant for the current context
   * @param pattern Pattern to check
   * @param targetDirectory Target directory
   * @returns Promise<boolean> True if pattern is relevant
   */
  private async isPatternRelevantForContext(pattern: QraftPattern, targetDirectory: string): Promise<boolean> {
    // Always include local patterns
    if (this.isLocalScopePattern(pattern)) {
      return true;
    }

    // For cache patterns, check if cache is enabled and relevant
    if (pattern.category === QraftPatternCategory.CACHE) {
      try {
        const config = await this.configManager.getConfig();
        return config.cache?.enabled === true;
      } catch (error) {
        return false;
      }
    }

    // For config patterns, check if they could exist in target directory
    if (pattern.category === QraftPatternCategory.CONFIG) {
      return this.isConfigPatternRelevant(pattern.pattern, targetDirectory);
    }

    return this.isPatternRelevantForDirectory(pattern, targetDirectory);
  }

  /**
   * Get all qraft patterns (static + dynamic)
   * @returns Promise<QraftPattern[]> Array of all patterns
   */
  async getAllPatterns(): Promise<QraftPattern[]> {
    const staticPatterns = this.getStaticPatterns();
    const dynamicPatterns = await this.getDynamicPatterns();
    
    return [...staticPatterns, ...dynamicPatterns];
  }

  /**
   * Get patterns organized by category
   * @returns Promise<QraftPatternCollection> Patterns organized by category
   */
  async getPatternsByCategory(): Promise<QraftPatternCollection> {
    const allPatterns = await this.getAllPatterns();
    
    const collection: QraftPatternCollection = {
      local: [],
      global: [],
      cache: [],
      config: []
    };
    
    for (const pattern of allPatterns) {
      collection[pattern.category].push(pattern);
    }
    
    return collection;
  }

  /**
   * Get just the pattern strings (for use with GitignoreManager)
   * @returns Promise<string[]> Array of pattern strings
   */
  async getPatternStrings(): Promise<string[]> {
    const patterns = await this.getAllPatterns();
    return patterns.map(p => p.pattern);
  }

  /**
   * Get patterns for a specific category
   * @param category Category to filter by
   * @returns Promise<QraftPattern[]> Patterns in the specified category
   */
  async getPatternsForCategory(category: QraftPatternCategory): Promise<QraftPattern[]> {
    const allPatterns = await this.getAllPatterns();
    return allPatterns.filter(p => p.category === category);
  }

  /**
   * Check if a directory is a system cache directory that shouldn't be ignored
   * @param directory Directory path to check
   * @returns boolean True if it's a system cache directory
   */
  private isSystemCacheDirectory(directory: string): boolean {
    const normalizedDir = path.normalize(directory);
    const homeDir = os.homedir();
    
    // Common system cache locations that we shouldn't ignore
    const systemCachePaths = [
      path.join(homeDir, '.cache'),
      '/tmp',
      '/var/tmp',
      path.join(homeDir, 'Library', 'Caches'), // macOS
      path.join(homeDir, 'AppData', 'Local'), // Windows
    ];
    
    return systemCachePaths.some(systemPath => 
      normalizedDir.startsWith(path.normalize(systemPath))
    );
  }

  /**
   * Convert an absolute path to a relative pattern suitable for .gitignore
   * @param absolutePath Absolute path to convert
   * @returns string Relative pattern
   */
  private getRelativePattern(absolutePath: string): string {
    const cwd = process.cwd();
    
    try {
      const relativePath = path.relative(cwd, absolutePath);
      
      // If the path is outside the current directory, don't create a pattern
      if (relativePath.startsWith('..')) {
        return '';
      }
      
      // Ensure directory patterns end with /
      if (!relativePath.endsWith('/')) {
        return relativePath + '/';
      }
      
      return relativePath;
    } catch (error) {
      // If path.relative fails, return empty string
      return '';
    }
  }

  /**
   * Get the default section title for qraft patterns
   * @returns string Section title
   */
  getSectionTitle(): string {
    return 'Qraft CLI';
  }

  /**
   * Get the default section description for qraft patterns
   * @returns string Section description
   */
  getSectionDescription(): string {
    return 'Files and directories generated by qraft CLI tool';
  }

  /**
   * Get patterns formatted for display (with descriptions)
   * @returns Promise<string[]> Array of formatted pattern descriptions
   */
  async getFormattedPatterns(): Promise<string[]> {
    const patterns = await this.getAllPatterns();

    return patterns.map(pattern =>
      `${pattern.pattern} - ${pattern.description}`
    );
  }

  /**
   * Categorize patterns into local and global scopes
   * @returns Promise<{local: QraftPattern[], global: QraftPattern[]}> Patterns categorized by scope
   */
  async categorizeByScope(): Promise<{
    local: QraftPattern[];
    global: QraftPattern[];
  }> {
    const patterns = await this.getAllPatterns();

    const local: QraftPattern[] = [];
    const global: QraftPattern[] = [];

    for (const pattern of patterns) {
      if (this.isLocalScopePattern(pattern)) {
        local.push(pattern);
      } else {
        global.push(pattern);
      }
    }

    return { local, global };
  }

  /**
   * Get only local-scope patterns (patterns that affect the current project)
   * @returns Promise<QraftPattern[]> Local-scope patterns
   */
  async getLocalPatterns(): Promise<QraftPattern[]> {
    const { local } = await this.categorizeByScope();
    return local;
  }

  /**
   * Get only global-scope patterns (patterns that affect user's system)
   * @returns Promise<QraftPattern[]> Global-scope patterns
   */
  async getGlobalPatterns(): Promise<QraftPattern[]> {
    const { global } = await this.categorizeByScope();
    return global;
  }

  /**
   * Determine if a pattern is local-scope (affects current project only)
   * @param pattern Pattern to check
   * @returns boolean True if pattern is local-scope
   */
  private isLocalScopePattern(pattern: QraftPattern): boolean {
    // Local patterns are those that:
    // 1. Are in the LOCAL category
    // 2. Are relative paths within the project
    // 3. Don't reference user home directory or system paths

    if (pattern.category === QraftPatternCategory.LOCAL) {
      return true;
    }

    // Config files in the project directory are local
    if (pattern.category === QraftPatternCategory.CONFIG) {
      return this.isProjectRelativePattern(pattern.pattern);
    }

    // Cache directories within the project are local
    if (pattern.category === QraftPatternCategory.CACHE) {
      return this.isProjectRelativePattern(pattern.pattern);
    }

    return false;
  }

  /**
   * Check if a pattern is relative to the current project
   * @param pattern Pattern to check
   * @returns boolean True if pattern is project-relative
   */
  private isProjectRelativePattern(pattern: string): boolean {
    // Patterns starting with / are absolute
    if (pattern.startsWith('/')) {
      return false;
    }

    // Patterns starting with ~ reference home directory
    if (pattern.startsWith('~')) {
      return false;
    }

    // Patterns with .. go outside project directory
    if (pattern.includes('..')) {
      return false;
    }

    // Everything else is considered project-relative
    return true;
  }

  /**
   * Get patterns suitable for project-level .gitignore
   * @returns Promise<string[]> Array of project-level pattern strings
   */
  async getProjectPatterns(): Promise<string[]> {
    const localPatterns = await this.getLocalPatterns();
    return localPatterns.map(p => p.pattern);
  }

  /**
   * Get patterns that should be in global .gitignore
   * @returns Promise<string[]> Array of global pattern strings
   */
  async getGlobalGitignorePatterns(): Promise<string[]> {
    const globalPatterns = await this.getGlobalPatterns();
    return globalPatterns.map(p => p.pattern);
  }

  /**
   * Filter patterns based on current working directory context
   * @param targetDirectory Directory where .gitignore will be created
   * @returns Promise<QraftPattern[]> Patterns relevant to the target directory
   */
  async getRelevantPatterns(targetDirectory: string): Promise<QraftPattern[]> {
    const allPatterns = await this.getAllPatterns();
    const relevantPatterns: QraftPattern[] = [];

    for (const pattern of allPatterns) {
      if (this.isPatternRelevantForDirectory(pattern, targetDirectory)) {
        relevantPatterns.push(pattern);
      }
    }

    return relevantPatterns;
  }

  /**
   * Check if a pattern is relevant for a specific directory
   * @param pattern Pattern to check
   * @param targetDirectory Target directory path
   * @returns boolean True if pattern is relevant
   */
  private isPatternRelevantForDirectory(pattern: QraftPattern, targetDirectory: string): boolean {
    // Local patterns are always relevant
    if (this.isLocalScopePattern(pattern)) {
      return true;
    }

    // For global patterns, check if they would affect files in the target directory
    if (pattern.category === QraftPatternCategory.CACHE) {
      // Cache patterns are only relevant if the cache is within or affects the target directory
      return this.isCachePatternRelevant(pattern.pattern, targetDirectory);
    }

    // Config patterns are relevant if they could exist in the target directory
    if (pattern.category === QraftPatternCategory.CONFIG) {
      return this.isConfigPatternRelevant(pattern.pattern, targetDirectory);
    }

    return false;
  }

  /**
   * Check if a cache pattern is relevant for a directory
   * @param pattern Cache pattern
   * @param targetDirectory Target directory
   * @returns boolean True if relevant
   */
  private isCachePatternRelevant(pattern: string, targetDirectory: string): boolean {
    // If pattern is relative, it's relevant
    if (this.isProjectRelativePattern(pattern)) {
      return true;
    }

    // If pattern is absolute, check if it's within the target directory tree
    try {
      const normalizedTarget = path.normalize(targetDirectory);
      const normalizedPattern = path.normalize(pattern.replace(/\/$/, '')); // Remove trailing slash

      return normalizedPattern.startsWith(normalizedTarget);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a config pattern is relevant for a directory
   * @param pattern Config pattern
   * @param _targetDirectory Target directory
   * @returns boolean True if relevant
   */
  private isConfigPatternRelevant(pattern: string, _targetDirectory: string): boolean {
    // Config files are typically relevant for any project directory
    // since they can be created in any project
    return this.isProjectRelativePattern(pattern);
  }

  /**
   * Validate a qraft pattern for correctness and safety
   * @param pattern Pattern to validate
   * @returns {isValid: boolean, errors: string[]} Validation result
   */
  validatePattern(pattern: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for empty pattern
    if (!pattern || pattern.trim().length === 0) {
      errors.push('Pattern cannot be empty');
      return { isValid: false, errors };
    }

    const trimmedPattern = pattern.trim();

    // Check for dangerous patterns
    if (this.isDangerousPattern(trimmedPattern)) {
      errors.push('Pattern is potentially dangerous and could ignore important files');
    }

    // Check for invalid characters
    if (this.hasInvalidCharacters(trimmedPattern)) {
      errors.push('Pattern contains invalid characters');
    }

    // Check for overly broad patterns
    if (this.isOverlyBroadPattern(trimmedPattern)) {
      errors.push('Pattern is too broad and may ignore unintended files');
    }

    // Check for malformed patterns
    if (this.isMalformedPattern(trimmedPattern)) {
      errors.push('Pattern is malformed');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Normalize a pattern to ensure consistency
   * @param pattern Pattern to normalize
   * @returns string Normalized pattern
   */
  normalizePattern(pattern: string): string {
    if (!pattern) {
      return '';
    }

    let normalized = pattern.trim();

    // Remove redundant slashes
    normalized = normalized.replace(/\/+/g, '/');

    // Handle directory patterns consistently
    if (this.isDirectoryPattern(normalized)) {
      // Ensure directory patterns end with /
      if (!normalized.endsWith('/')) {
        normalized += '/';
      }
    }

    // Remove leading ./ if present (except for negation patterns)
    if (normalized.startsWith('./') && !normalized.startsWith('!')) {
      normalized = normalized.slice(2);
    }

    // Normalize path separators for cross-platform compatibility
    normalized = normalized.replace(/\\/g, '/');

    return normalized;
  }

  /**
   * Validate and normalize a collection of patterns
   * @param patterns Array of patterns to process
   * @returns {valid: string[], invalid: {pattern: string, errors: string[]}[]} Processed patterns
   */
  validateAndNormalizePatterns(patterns: string[]): {
    valid: string[];
    invalid: { pattern: string; errors: string[] }[];
  } {
    const valid: string[] = [];
    const invalid: { pattern: string; errors: string[] }[] = [];

    for (const pattern of patterns) {
      const validation = this.validatePattern(pattern);

      if (validation.isValid) {
        const normalized = this.normalizePattern(pattern);
        if (normalized) {
          valid.push(normalized);
        }
      } else {
        invalid.push({
          pattern,
          errors: validation.errors
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * Check if a pattern is dangerous (could ignore important files)
   * @param pattern Pattern to check
   * @returns boolean True if pattern is dangerous
   */
  private isDangerousPattern(pattern: string): boolean {
    const dangerousPatterns = [
      '*',           // Ignores everything
      '**',          // Ignores everything recursively
      '/',           // Ignores root
      '.',           // Ignores current directory
      '..',          // Ignores parent directory
      '*.js',        // Too broad for qraft
      '*.ts',        // Too broad for qraft
      '*.json',      // Too broad for qraft
      'src/',        // Common source directory
      'lib/',        // Common library directory
      'dist/',       // Build output (not qraft-specific)
      'build/',      // Build output (not qraft-specific)
    ];

    return dangerousPatterns.includes(pattern.toLowerCase());
  }

  /**
   * Check if a pattern contains invalid characters
   * @param pattern Pattern to check
   * @returns boolean True if pattern has invalid characters
   */
  private hasInvalidCharacters(pattern: string): boolean {
    // Check for null bytes and other control characters
    if (pattern.includes('\0') || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(pattern)) {
      return true;
    }

    // Check for Windows reserved characters in file names
    if (/[<>:"|?*]/.test(pattern)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a pattern is overly broad
   * @param pattern Pattern to check
   * @returns boolean True if pattern is too broad
   */
  private isOverlyBroadPattern(pattern: string): boolean {
    // Patterns that match too many files
    const broadPatterns = [
      /^\*$/,                    // Just *
      /^\*\*$/,                  // Just **
      /^\*\.\*$/,                // *.*
      /^[a-z]$/,                 // Single letter
      /^[a-z]{1,2}\/$/,          // Very short directory names
    ];

    return broadPatterns.some(regex => regex.test(pattern));
  }

  /**
   * Check if a pattern is malformed
   * @param pattern Pattern to check
   * @returns boolean True if pattern is malformed
   */
  private isMalformedPattern(pattern: string): boolean {
    // Check for unmatched brackets
    const openBrackets = (pattern.match(/\[/g) || []).length;
    const closeBrackets = (pattern.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return true;
    }

    // Check for invalid escape sequences
    if (/\\[^\\\/\[\]{}()*+?.^$|]/.test(pattern)) {
      return true;
    }

    // Check for patterns ending with backslash
    if (pattern.endsWith('\\')) {
      return true;
    }

    return false;
  }

  /**
   * Check if a pattern represents a directory
   * @param pattern Pattern to check
   * @returns boolean True if pattern is for a directory
   */
  private isDirectoryPattern(pattern: string): boolean {
    // Directory patterns typically end with / or are known directory names
    if (pattern.endsWith('/')) {
      return true;
    }

    // Known qraft directory patterns
    const qraftDirectories = [
      '.qraft',
      '.qraft-cache',
      '.qraft-temp',
    ];

    return qraftDirectories.some(dir =>
      pattern === dir || pattern.startsWith(dir + '-')
    );
  }

  /**
   * Get validation rules for qraft patterns
   * @returns object Validation rules and descriptions
   */
  getValidationRules(): {
    rules: { name: string; description: string }[];
    examples: { valid: string[]; invalid: string[] };
  } {
    return {
      rules: [
        {
          name: 'Non-empty',
          description: 'Patterns must not be empty or whitespace-only'
        },
        {
          name: 'Safe patterns',
          description: 'Patterns must not ignore important project files'
        },
        {
          name: 'Valid characters',
          description: 'Patterns must not contain control characters or reserved symbols'
        },
        {
          name: 'Appropriate scope',
          description: 'Patterns should be specific to qraft-generated files'
        },
        {
          name: 'Well-formed',
          description: 'Patterns must have valid gitignore syntax'
        }
      ],
      examples: {
        valid: [
          '.qraft/',
          '.qraftrc',
          '.qraft-cache/',
          '.qraft-temp-*',
          '!.qraft/important.json'
        ],
        invalid: [
          '*',
          '*.js',
          '',
          'src/',
          'pattern\0with\0nulls'
        ]
      }
    };
  }
}
