import { FileOperations } from './fileOperations';

// Simple unit tests for FileOperations
describe('FileOperations', () => {
  let fileOps: FileOperations;

  beforeEach(() => {
    fileOps = new FileOperations();
  });

  describe('constructor', () => {
    it('should create FileOperations instance', () => {
      expect(fileOps).toBeInstanceOf(FileOperations);
    });
  });

  describe('fileExists', () => {
    it('should return false for non-existent file', async () => {
      const result = await fileOps.fileExists('/non/existent/file.txt');
      expect(result).toBe(false);
    });
  });

  describe('getFileStats', () => {
    it('should return null for non-existent file', async () => {
      const result = await fileOps.getFileStats('/non/existent/file.txt');
      expect(result).toBeNull();
    });
  });

  describe('copyFile', () => {
    it('should return error for non-existent source file', async () => {
      const result = await fileOps.copyFile('/non/existent/source.txt', '/tmp/dest.txt');
      
      expect(result.success).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Source file does not exist');
    });
  });

  describe('copyFiles', () => {
    it('should return empty array for empty file list', async () => {
      const result = await fileOps.copyFiles('/source', '/dest', []);
      expect(result).toEqual([]);
    });
  });

  describe('copyDirectory', () => {
    it('should handle non-existent source directory', async () => {
      const result = await fileOps.copyDirectory('/non/existent/source', '/tmp/dest');
      
      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBeDefined();
    });
  });

  describe('createBackup', () => {
    it('should return null for non-existent file', async () => {
      const result = await fileOps.createBackup('/non/existent/file.txt');
      expect(result).toBeNull();
    });
  });
});
