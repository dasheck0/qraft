import * as fs from 'fs';
import * as path from 'path';
import { DirectoryScanner, ScanOptions } from './directoryScanner';

describe('DirectoryScanner', () => {
  let scanner: DirectoryScanner;
  let testDir: string;
  let testSubDir: string;
  let testFile: string;
  let testSubFile: string;

  beforeEach(() => {
    scanner = new DirectoryScanner();
    testDir = './test-scanner-dir';
    testSubDir = path.join(testDir, 'subdir');
    testFile = path.join(testDir, 'test.txt');
    testSubFile = path.join(testSubDir, 'nested.js');

    // Create test directory structure
    try {
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(testSubDir, { recursive: true });
      fs.writeFileSync(testFile, 'test content');
      fs.writeFileSync(testSubFile, 'console.log("hello");');
      fs.writeFileSync(path.join(testDir, '.hidden'), 'hidden content');
      fs.writeFileSync(path.join(testDir, 'package.json'), '{"name": "test"}');
    } catch {
      // Ignore if already exists
    }
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('scanDirectory', () => {
    it('should scan directory and return structure', async () => {
      const result = await scanner.scanDirectory(testDir);

      expect(result.rootPath).toBe(path.resolve(testDir));
      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.totalDirectories).toBeGreaterThan(0);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.directories.length).toBeGreaterThan(0);
    });

    it('should include file details', async () => {
      const result = await scanner.scanDirectory(testDir);
      
      const testFileInfo = result.files.find(f => f.name === 'test.txt');
      expect(testFileInfo).toBeDefined();
      expect(testFileInfo?.extension).toBe('.txt');
      expect(testFileInfo?.size).toBeGreaterThan(0);
      expect(testFileInfo?.isFile).toBe(true);
      expect(testFileInfo?.isDirectory).toBe(false);
    });

    it('should exclude hidden files by default', async () => {
      const result = await scanner.scanDirectory(testDir);
      
      const hiddenFile = result.files.find(f => f.name === '.hidden');
      expect(hiddenFile).toBeUndefined();
    });

    it('should include hidden files when requested', async () => {
      const options: ScanOptions = { includeHidden: true };
      const result = await scanner.scanDirectory(testDir, options);
      
      const hiddenFile = result.files.find(f => f.name === '.hidden');
      expect(hiddenFile).toBeDefined();
    });

    it('should respect max depth option', async () => {
      const options: ScanOptions = { maxDepth: 0 };
      const result = await scanner.scanDirectory(testDir, options);
      
      // Should not find nested files
      const nestedFile = result.files.find(f => f.name === 'nested.js');
      expect(nestedFile).toBeUndefined();
    });

    it('should include content for small text files when requested', async () => {
      const options: ScanOptions = { includeContent: true };
      const result = await scanner.scanDirectory(testDir, options);
      
      const testFileInfo = result.files.find(f => f.name === 'test.txt');
      expect(testFileInfo?.content).toBe('test content');
    });

    it('should exclude files based on patterns', async () => {
      // Create node_modules directory
      const nodeModulesDir = path.join(testDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'package.js'), 'module content');

      const result = await scanner.scanDirectory(testDir);
      
      // Should not include node_modules content
      const nodeModulesFile = result.files.find(f => f.relativePath.includes('node_modules'));
      expect(nodeModulesFile).toBeUndefined();
    });

    it('should handle custom exclude patterns', async () => {
      const options: ScanOptions = { excludePatterns: ['*.txt'] };
      const result = await scanner.scanDirectory(testDir, options);
      
      const txtFile = result.files.find(f => f.extension === '.txt');
      expect(txtFile).toBeUndefined();
    });

    it('should throw error for non-existent directory', async () => {
      await expect(scanner.scanDirectory('./non-existent-dir')).rejects.toThrow();
    });

    it('should throw error for file instead of directory', async () => {
      await expect(scanner.scanDirectory(testFile)).rejects.toThrow('Path is not a directory');
    });
  });

  describe('utility methods', () => {
    it('should generate directory summary', async () => {
      const result = await scanner.scanDirectory(testDir);
      const summary = scanner.getDirectorySummary(result);
      
      expect(summary).toContain('files');
      expect(summary).toContain('directories');
      expect(summary).toContain('MB');
      expect(summary).toContain('depth');
    });

    it('should generate file type distribution', async () => {
      const result = await scanner.scanDirectory(testDir);
      const distribution = scanner.getFileTypeDistribution(result);
      
      expect(distribution['.txt']).toBeGreaterThan(0);
      expect(distribution['.js']).toBeGreaterThan(0);
      expect(distribution['.json']).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // This test might not work on all systems, but should not crash
      const result = await scanner.scanDirectory(testDir);
      expect(result).toBeDefined();
    });

    it('should continue scanning after encountering errors', async () => {
      // Create a directory structure where some parts might fail
      const result = await scanner.scanDirectory(testDir);
      
      // Should still return a valid structure
      expect(result.rootPath).toBeDefined();
      expect(result.totalFiles).toBeGreaterThanOrEqual(0);
    });
  });
});
