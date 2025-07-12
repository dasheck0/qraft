import * as fs from 'fs';
import * as path from 'path';

export interface FileInfo {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  lastModified: Date;
  content?: string | undefined; // For small text files
}

export interface DirectoryStructure {
  files: FileInfo[];
  directories: FileInfo[];
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  depth: number;
  rootPath: string;
}

export interface ScanOptions {
  includeContent?: boolean;
  maxContentSize?: number; // Max file size to read content (in bytes)
  maxDepth?: number;
  followSymlinks?: boolean;
  excludePatterns?: string[];
  includeHidden?: boolean;
}

export interface ExclusionPatterns {
  directories: string[];
  files: string[];
  extensions: string[];
  patterns: string[];
}

export class DirectoryScanner {
  private readonly defaultExcludePatterns: ExclusionPatterns = {
    directories: [
      // Version control
      '.git', '.svn', '.hg', '.bzr',
      // Dependencies
      'node_modules', 'vendor', '__pycache__', '.venv', 'venv', 'env',
      // Build outputs
      'dist', 'build', 'out', 'target', 'bin', 'obj',
      // Framework specific
      '.next', '.nuxt', '.vuepress', '.docusaurus',
      // Testing and coverage
      'coverage', '.nyc_output', '.pytest_cache', '__tests__/__snapshots__',
      // Caches
      '.cache', '.parcel-cache', '.webpack', '.rollup.cache',
      // Temporary
      'tmp', 'temp', '.tmp',
      // IDE
      '.vscode', '.idea', '.vs',
      // OS
      '.DS_Store', 'Thumbs.db'
    ],
    files: [
      // Logs
      '*.log', '*.log.*', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
      // OS files
      '.DS_Store', 'Thumbs.db', 'desktop.ini',
      // Editor files
      '*~', '*.swp', '*.swo', '.#*',
      // Build artifacts
      '*.pyc', '*.pyo', '*.class', '*.o', '*.so', '*.dll', '*.exe',
      // Package files
      '*.tar.gz', '*.zip', '*.rar', '*.7z',
      // Lock files (optional - might want to include these)
      // 'package-lock.json', 'yarn.lock', 'Pipfile.lock'
    ],
    extensions: [
      '.tmp', '.temp', '.bak', '.backup', '.old', '.orig'
    ],
    patterns: [
      // Backup files
      '*~', '*.bak', '*.backup', '*.old', '*.orig',
      // Temporary files
      '*.tmp', '*.temp', '#*#', '.#*',
      // Compiled files
      '*.pyc', '*.pyo', '*.class', '*.o', '*.so'
    ]
  };

  private readonly defaultOptions: Required<ScanOptions> = {
    includeContent: false,
    maxContentSize: 1024 * 1024, // 1MB
    maxDepth: 10,
    followSymlinks: false,
    excludePatterns: this.flattenExclusionPatterns(this.defaultExcludePatterns),
    includeHidden: false
  };

  async scanDirectory(directoryPath: string, options: ScanOptions = {}): Promise<DirectoryStructure> {
    const opts = { ...this.defaultOptions, ...options };
    const resolvedPath = path.resolve(directoryPath);

    // Validate directory exists and is accessible
    await this.validateDirectory(resolvedPath);

    const structure: DirectoryStructure = {
      files: [],
      directories: [],
      totalFiles: 0,
      totalDirectories: 0,
      totalSize: 0,
      depth: 0,
      rootPath: resolvedPath
    };

    await this.scanRecursive(resolvedPath, resolvedPath, structure, opts, 0);

    return structure;
  }

  private async validateDirectory(directoryPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(directoryPath);
      
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
      }

      // Check if directory is readable
      await fs.promises.access(directoryPath, fs.constants.R_OK);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Cannot access directory: ${error.message}`);
      }
      throw new Error(`Cannot access directory: ${directoryPath}`);
    }
  }

  private async scanRecursive(
    currentPath: string,
    rootPath: string,
    structure: DirectoryStructure,
    options: Required<ScanOptions>,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth > options.maxDepth) {
      return;
    }

    structure.depth = Math.max(structure.depth, currentDepth);

    try {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        // Skip if excluded
        if (this.shouldExclude(entry.name, relativePath, options)) {
          continue;
        }

        // Handle symlinks
        if (entry.isSymbolicLink() && !options.followSymlinks) {
          continue;
        }

        const stats = await fs.promises.stat(fullPath);
        const fileInfo: FileInfo = {
          path: fullPath,
          relativePath,
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          lastModified: stats.mtime
        };

        if (stats.isDirectory()) {
          structure.directories.push(fileInfo);
          structure.totalDirectories++;
          
          // Recursively scan subdirectory
          await this.scanRecursive(fullPath, rootPath, structure, options, currentDepth + 1);
        } else if (stats.isFile()) {
          // Add content for small text files if requested
          if (options.includeContent && this.shouldIncludeContent(fileInfo, options)) {
            try {
              fileInfo.content = await fs.promises.readFile(fullPath, 'utf-8');
            } catch {
              // If we can't read as text, skip content
              fileInfo.content = undefined;
            }
          }

          structure.files.push(fileInfo);
          structure.totalFiles++;
          structure.totalSize += stats.size;
        }
      }
    } catch (error) {
      // Log error but continue scanning other directories
      console.warn(`Warning: Could not scan directory ${currentPath}:`, error);
    }
  }

  private flattenExclusionPatterns(patterns: ExclusionPatterns): string[] {
    return [
      ...patterns.directories,
      ...patterns.files,
      ...patterns.extensions,
      ...patterns.patterns
    ];
  }

  private shouldExclude(fileName: string, relativePath: string, options: Required<ScanOptions>): boolean {
    // Skip hidden files unless explicitly included
    if (!options.includeHidden && fileName.startsWith('.')) {
      // Allow some important hidden files for analysis (but they may still be flagged as sensitive)
      const allowedHiddenFiles = ['.gitignore', '.gitattributes', '.editorconfig', '.env.example', '.env', '.env.local', '.env.production'];
      if (!allowedHiddenFiles.includes(fileName)) {
        return true;
      }
    }

    // Check against comprehensive exclusion patterns
    if (this.isExcludedByPatterns(fileName, relativePath, this.defaultExcludePatterns)) {
      return true;
    }

    // Check against user-provided exclude patterns
    for (const pattern of options.excludePatterns) {
      if (this.matchesPattern(fileName, pattern) || this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  private isExcludedByPatterns(fileName: string, relativePath: string, patterns: ExclusionPatterns): boolean {
    // Check directory exclusions
    const pathParts = relativePath.split('/');
    for (const part of pathParts) {
      if (patterns.directories.includes(part)) {
        return true;
      }
    }

    // Check file exclusions
    if (patterns.files.some(pattern => this.matchesPattern(fileName, pattern))) {
      return true;
    }

    // Check extension exclusions
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    if (patterns.extensions.includes(extension)) {
      return true;
    }

    // Check pattern exclusions
    if (patterns.patterns.some(pattern => this.matchesPattern(fileName, pattern))) {
      return true;
    }

    return false;
  }

  private matchesPattern(text: string, pattern: string): boolean {
    // Simple glob-like pattern matching
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(text);
    }
    
    return text === pattern || text.includes(pattern);
  }

  private shouldIncludeContent(fileInfo: FileInfo, options: Required<ScanOptions>): boolean {
    // Only include content for small text files
    if (fileInfo.size > options.maxContentSize) {
      return false;
    }

    // Check if it's likely a text file based on extension
    const textExtensions = [
      '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
      '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs',
      '.html', '.css', '.scss', '.sass', '.less', '.xml', '.yaml', '.yml',
      '.toml', '.ini', '.cfg', '.conf', '.sh', '.bat', '.ps1', '.sql',
      '.dockerfile', '.gitignore', '.gitattributes', '.editorconfig'
    ];

    return textExtensions.includes(fileInfo.extension) || !fileInfo.extension;
  }

  // Utility method to get directory summary
  getDirectorySummary(structure: DirectoryStructure): string {
    const { totalFiles, totalDirectories, totalSize, depth } = structure;
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    return `${totalFiles} files, ${totalDirectories} directories, ${sizeInMB}MB, depth: ${depth}`;
  }

  // Get file type distribution
  getFileTypeDistribution(structure: DirectoryStructure): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const file of structure.files) {
      const ext = file.extension || 'no-extension';
      distribution[ext] = (distribution[ext] || 0) + 1;
    }

    return distribution;
  }

  // Get exclusion patterns for a specific category
  getExclusionPatterns(category?: keyof ExclusionPatterns): string[] {
    if (category) {
      return this.defaultExcludePatterns[category];
    }
    return this.flattenExclusionPatterns(this.defaultExcludePatterns);
  }

  // Check if a path would be excluded
  wouldBeExcluded(filePath: string, options: Partial<ScanOptions> = {}): boolean {
    const opts = { ...this.defaultOptions, ...options };
    const fileName = filePath.split('/').pop() || '';
    return this.shouldExclude(fileName, filePath, opts);
  }

  // Get exclusion statistics for a directory
  async getExclusionStats(directoryPath: string): Promise<{
    totalItems: number;
    excludedItems: number;
    includedItems: number;
    exclusionReasons: Record<string, number>;
  }> {
    const fs = require('fs');
    const path = require('path');

    let totalItems = 0;
    let excludedItems = 0;
    const exclusionReasons: Record<string, number> = {};

    const scanForStats = async (currentPath: string, relativePath: string = ''): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          totalItems++;
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (this.shouldExclude(entry.name, entryRelativePath, this.defaultOptions)) {
            excludedItems++;

            // Determine exclusion reason
            if (entry.name.startsWith('.') && !this.defaultOptions.includeHidden) {
              exclusionReasons['hidden files'] = (exclusionReasons['hidden files'] || 0) + 1;
            } else if (this.defaultExcludePatterns.directories.includes(entry.name)) {
              exclusionReasons['excluded directories'] = (exclusionReasons['excluded directories'] || 0) + 1;
            } else if (this.defaultExcludePatterns.files.some(pattern => this.matchesPattern(entry.name, pattern))) {
              exclusionReasons['excluded files'] = (exclusionReasons['excluded files'] || 0) + 1;
            } else {
              exclusionReasons['pattern matches'] = (exclusionReasons['pattern matches'] || 0) + 1;
            }
          } else if (entry.isDirectory()) {
            // Recursively scan non-excluded directories
            const fullPath = path.join(currentPath, entry.name);
            await scanForStats(fullPath, entryRelativePath);
          }
        }
      } catch {
        // Ignore errors and continue
      }
    };

    await scanForStats(path.resolve(directoryPath));

    return {
      totalItems,
      excludedItems,
      includedItems: totalItems - excludedItems,
      exclusionReasons
    };
  }
}
