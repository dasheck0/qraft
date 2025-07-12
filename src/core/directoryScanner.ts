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

export class DirectoryScanner {
  private defaultExcludePatterns = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    'target',
    '.next',
    '.nuxt',
    'coverage',
    '.nyc_output',
    '.cache',
    'tmp',
    'temp',
    '*.log',
    '.DS_Store',
    'Thumbs.db'
  ];

  private defaultOptions: Required<ScanOptions> = {
    includeContent: false,
    maxContentSize: 1024 * 1024, // 1MB
    maxDepth: 10,
    followSymlinks: false,
    excludePatterns: this.defaultExcludePatterns,
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

  private shouldExclude(fileName: string, relativePath: string, options: Required<ScanOptions>): boolean {
    // Skip hidden files unless explicitly included
    if (!options.includeHidden && fileName.startsWith('.')) {
      return true;
    }

    // Check against exclude patterns
    for (const pattern of options.excludePatterns) {
      if (this.matchesPattern(fileName, pattern) || this.matchesPattern(relativePath, pattern)) {
        return true;
      }
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
}
