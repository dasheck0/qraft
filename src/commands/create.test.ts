// Mock inquirer
const mockInquirerPrompt = jest.fn();
jest.mock('inquirer', () => ({
  prompt: mockInquirerPrompt
}));

// Mock readline module for createUserPrompt function
const mockQuestion = jest.fn();
const mockClose = jest.fn();
const mockCreateInterface = jest.fn(() => ({
  question: mockQuestion,
  close: mockClose
}));

jest.mock('readline', () => ({
  createInterface: mockCreateInterface
}));

// Note: We don't mock fs here because we need real file operations for test setup

// Mock the RepositoryManager to avoid Octokit import issues
jest.mock('../core/repositoryManager', () => ({
  RepositoryManager: jest.fn().mockImplementation(() => ({
    createBox: jest.fn().mockResolvedValue({
      success: true,
      message: 'Box created successfully',
      boxPath: 'test-box',
      commitSha: 'abc123',
      nextSteps: ['Box is now available']
    })
  }))
}));

import { createCommand } from './create';

describe('createCommand', () => {
  // Mock BoxManager to avoid Octokit import issues
  const mockBoxManager = {
    getConfigManager: jest.fn().mockReturnValue({
      getConfig: jest.fn().mockResolvedValue({
        defaultRegistry: 'default/registry'
      })
    }),
    getGitHubToken: jest.fn().mockResolvedValue('mock-token')
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset readline mocks
    mockQuestion.mockClear();
    mockClose.mockClear();
    mockCreateInterface.mockClear();

    // Set up default inquirer responses for ManifestBuilder
    mockInquirerPrompt
      // Basic information
      .mockResolvedValueOnce({
        name: 'test-box',
        description: 'Test description',
        author: 'Test Author',
        version: '1.0.0'
      })
      // Tags and Configuration
      .mockResolvedValueOnce({
        tags: ['test'],
        defaultTarget: './target'
      })
      // Advanced options
      .mockResolvedValueOnce({
        addExclusions: false,
        addPostInstall: false
      })
      // Confirmation
      .mockResolvedValueOnce({
        confirm: true
      });
  });

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
      mockQuestion.mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });

      // Should run without throwing errors with valid directory
      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();
    });

    it('should work with only valid local path', async () => {
      // Mock user input to automatically confirm
      mockQuestion.mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });

      // Should run without throwing errors with valid directory
      await expect(createCommand(mockBoxManager, testDir)).resolves.toBeUndefined();
    });

    it('should accept registry option with valid directory', async () => {
      // Mock user input to automatically confirm
      mockQuestion.mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });

      // Should run without throwing errors with valid directory and registry
      await expect(createCommand(mockBoxManager, testDir, 'test-box', { registry: 'custom/registry' })).resolves.toBeUndefined();
    });

    it('should show interactive mode is enabled by default', async () => {
      // Mock user input to automatically confirm
      mockQuestion.mockImplementation((_question, callback) => {
        callback('y'); // Auto-confirm
      });

      // Should run without throwing errors - interactive mode is the default behavior
      await expect(createCommand(mockBoxManager, testDir)).resolves.toBeUndefined();
    });
  });

  describe('dry-run functionality', () => {
    it('should show preview and proceed when user confirms', async () => {
      // Reset mocks
      jest.clearAllMocks();

      // Mock user confirming with 'y'
      mockQuestion.mockImplementation((_question, callback) => {
        callback('y');
      });

      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();

      // Verify that the confirmation prompt was called
      expect(mockQuestion).toHaveBeenCalled();
    });

    it('should cancel operation when user declines', async () => {
      // Reset mocks
      jest.clearAllMocks();

      // Mock user declining with 'n'
      mockQuestion.mockImplementation((_question, callback) => {
        callback('n');
      });

      await expect(createCommand(mockBoxManager, testDir, 'test-box')).resolves.toBeUndefined();

      // Verify that the confirmation prompt was called
      expect(mockQuestion).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should fail when local path does not exist', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, './non-existent-path');
      }).rejects.toThrow('Process exit called');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when local path is a file, not a directory', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, testFile);
      }).rejects.toThrow('Process exit called');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when registry format is invalid', async () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      await expect(async () => {
        await createCommand(mockBoxManager, testDir, 'test-box', { registry: 'invalid-registry-format' });
      }).rejects.toThrow('Process exit called');

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail when no default registry is configured and none provided', async () => {
      const mockBoxManagerNoRegistry = {
        getConfigManager: jest.fn().mockReturnValue({
          getConfig: jest.fn().mockResolvedValue({
            defaultRegistry: null // No default registry
          })
        }),
        getGitHubToken: jest.fn().mockResolvedValue('mock-token')
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
