import { createCommand } from './create';

describe('createCommand', () => {
  // Mock BoxManager to avoid Octokit import issues
  const mockBoxManager = {
    getConfigManager: jest.fn().mockReturnValue({
      getConfig: jest.fn().mockResolvedValue({
        defaultRegistry: 'default/registry'
      })
    })
  } as any;

  const testDir = './test-temp-dir';
  const testFile = './test-temp-file.txt';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create test directory and file for validation tests
    const fs = require('fs');

    try {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, 'test content');
      // Add a file to the test directory so it's not empty
      fs.writeFileSync(`${testDir}/test-file.txt`, 'test content for directory');
    } catch {
      // Ignore if already exists
    }
  });

  afterEach(() => {
    // Clean up test files
    const fs = require('fs');

    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      fs.rmSync(testFile, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should accept valid local directory and optional box name', async () => {
      // Mock user input to automatically confirm
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      // Should run without throwing errors with valid directory
      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();
    });

    it('should work with only valid local path', async () => {
      // Mock user input to automatically confirm
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      // Should run without throwing errors with valid directory
      await expect(createCommand(mockBoxManager, testDir)).resolves.toBeUndefined();
    });

    it('should accept registry option with valid directory', async () => {
      // Mock user input to automatically confirm
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      // Should run without throwing errors with valid directory and registry
      await expect(createCommand(mockBoxManager, testDir, 'test-box', { registry: 'custom/registry' })).resolves.toBeUndefined();
    });

    it('should show interactive mode is enabled by default', async () => {
      // Mock user input to automatically confirm
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      // Should run without throwing errors - interactive mode is the default behavior
      await expect(createCommand(mockBoxManager, testDir)).resolves.toBeUndefined();
    });
  });

  describe('dry-run functionality', () => {
    it('should show preview and proceed when user confirms', async () => {
      // Mock user input to confirm
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('y'); // User confirms
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();
      expect(mockQuestion).toHaveBeenCalledWith(
        expect.stringContaining('Do you want to proceed'),
        expect.any(Function)
      );
    });

    it('should cancel operation when user declines', async () => {
      // Mock user input to decline
      const mockQuestion = jest.fn().mockImplementation((_question, callback) => {
        callback('n'); // User declines
      });
      const mockReadline = {
        createInterface: jest.fn().mockReturnValue({
          question: mockQuestion,
          close: jest.fn()
        })
      };
      jest.doMock('readline', () => mockReadline);

      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();
      expect(mockQuestion).toHaveBeenCalledWith(
        expect.stringContaining('Do you want to proceed'),
        expect.any(Function)
      );
    });
  });

  describe('validation', () => {
    it('should fail when local path does not exist', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, './non-existent-path');
      }).rejects.toThrow('Path does not exist');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when local path is a file, not a directory', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, testFile);
      }).rejects.toThrow('Path is not a directory');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when registry format is invalid', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, testDir, 'test-box', { registry: 'invalid-registry-format' });
      }).rejects.toThrow('Invalid registry format');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when no default registry is configured and none provided', async () => {
      const mockBoxManagerNoRegistry = {
        getConfigManager: jest.fn().mockReturnValue({
          getConfig: jest.fn().mockResolvedValue({
            defaultRegistry: null // No default registry
          })
        })
      } as any;

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManagerNoRegistry, testDir);
      }).rejects.toThrow('Process exit called');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // Mock an error by making console.log throw
      const originalConsoleLog = console.log;
      console.log = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, './test-path');
      }).rejects.toThrow('Test error');

      // Restore console.log
      console.log = originalConsoleLog;
    });
  });
});
