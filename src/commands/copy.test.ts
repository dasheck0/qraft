// Mock inquirer before any imports
const mockInquirerPrompt = jest.fn();
jest.mock('inquirer', () => ({
  default: { prompt: mockInquirerPrompt },
  prompt: mockInquirerPrompt
}));

// Mock chalk to return plain strings so output assertions are readable
jest.mock('chalk', () => {
  const identity = (s: string) => s;
  const tagged = Object.assign(identity, {
    bold: identity,
    red: Object.assign(identity, { bold: identity }),
    green: Object.assign(identity, { bold: identity }),
    blue: Object.assign(identity, { bold: identity }),
    yellow: identity,
    gray: identity,
    cyan: identity,
  });
  return {
    default: tagged,
    ...tagged,
    red: tagged.red,
    green: tagged.green,
    blue: tagged.blue,
    yellow: tagged.yellow,
    gray: tagged.gray,
    cyan: tagged.cyan,
  };
});

// Mock InteractiveMode
const mockInteractiveCopyBox = jest.fn();
jest.mock('../interactive/interactiveMode', () => ({
  InteractiveMode: jest.fn().mockImplementation(() => ({
    copyBox: mockInteractiveCopyBox
  }))
}));

import { copyCommand } from './copy';

// ── helpers ────────────────────────────────────────────────────────────────

function makeMockBoxManager(overrides: Record<string, jest.Mock> = {}) {
  return {
    parseBoxReference: jest.fn().mockResolvedValue({
      registry: 'test-owner',
      boxName: 'test-box',
      fullReference: 'test-owner/test-box'
    }),
    boxExists: jest.fn().mockResolvedValue(true),
    getBoxInfo: jest.fn().mockResolvedValue({
      manifest: {
        name: 'test-box',
        description: 'A test box',
        version: '1.0.0',
        files: [],
        defaultTarget: './target',
        postInstall: []
      },
      files: ['file1.ts', 'file2.ts']
    }),
    copyBox: jest.fn().mockResolvedValue({
      success: true,
      message: 'Copied successfully',
      copiedFiles: ['/target/file1.ts', '/target/file2.ts'],
      skippedFiles: []
    }),
    ...overrides
  } as any;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('copyCommand', () => {
  let mockBoxManager: ReturnType<typeof makeMockBoxManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBoxManager = makeMockBoxManager();
  });

  // ── --yes flag ────────────────────────────────────────────────────────────

  describe('--yes flag', () => {
    it('should skip the confirmation prompt when --yes is set', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true });

      expect(mockInquirerPrompt).not.toHaveBeenCalled();
      expect(mockBoxManager.copyBox).toHaveBeenCalledTimes(1);
    });

    it('should copy the box successfully when --yes is set', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true });

      expect(mockBoxManager.copyBox).toHaveBeenCalledTimes(1);
    });

    it('should not call the prompt even when target is not set', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true });

      const promptCalls = mockInquirerPrompt.mock.calls;
      const confirmCalls = promptCalls.filter((args: any[]) => {
        const questions = args[0];
        return Array.isArray(questions)
          ? questions.some((q: any) => q.name === 'confirm')
          : questions?.name === 'confirm';
      });
      expect(confirmCalls.length).toBe(0);
    });
  });

  // ── --force flag skips prompt ─────────────────────────────────────────────

  describe('--force flag', () => {
    it('should skip the confirmation prompt when --force is set', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { force: true });

      const promptCalls = mockInquirerPrompt.mock.calls;
      const confirmCalls = promptCalls.filter((args: any[]) => {
        const questions = args[0];
        return Array.isArray(questions)
          ? questions.some((q: any) => q.name === 'confirm')
          : questions?.name === 'confirm';
      });
      expect(confirmCalls.length).toBe(0);
    });
  });

  // ── no flag → prompt is shown ─────────────────────────────────────────────

  describe('without --yes, --force, or --interactive', () => {
    it('should show the confirmation prompt', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({ confirm: true });

      await copyCommand(mockBoxManager, 'test-owner/test-box', {});

      expect(mockInquirerPrompt).toHaveBeenCalled();
    });

    it('should proceed with copy when user confirms', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({ confirm: true });

      await copyCommand(mockBoxManager, 'test-owner/test-box', {});

      expect(mockBoxManager.copyBox).toHaveBeenCalledTimes(1);
    });

    it('should cancel the copy when user declines', async () => {
      mockInquirerPrompt.mockResolvedValueOnce({ confirm: false });

      await copyCommand(mockBoxManager, 'test-owner/test-box', {});

      expect(mockBoxManager.copyBox).not.toHaveBeenCalled();
    });
  });

  // ── --interactive delegates to InteractiveMode ────────────────────────────

  describe('--interactive flag', () => {
    it('should delegate to InteractiveMode and skip the direct prompt', async () => {
      mockInteractiveCopyBox.mockResolvedValue({ success: true });

      await copyCommand(mockBoxManager, 'test-owner/test-box', { interactive: true });

      expect(mockInteractiveCopyBox).toHaveBeenCalledWith(
        'test-owner/test-box',
        expect.any(Object)
      );
      expect(mockInquirerPrompt).not.toHaveBeenCalled();
    });

    it('should exit with code 1 when InteractiveMode returns failure', async () => {
      mockInteractiveCopyBox.mockResolvedValue({ success: false });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(
        copyCommand(mockBoxManager, 'test-owner/test-box', { interactive: true })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  // ── box not found ─────────────────────────────────────────────────────────

  describe('box not found', () => {
    it('should exit with code 1 when box does not exist', async () => {
      mockBoxManager.boxExists.mockResolvedValue(false);

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(
        copyCommand(mockBoxManager, 'test-owner/missing-box', { yes: true })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  // ── copy failure ──────────────────────────────────────────────────────────

  describe('copy failure', () => {
    it('should exit with code 1 when copyBox returns failure', async () => {
      mockBoxManager.copyBox.mockResolvedValue({
        success: false,
        message: 'Network error',
        error: new Error('Network error')
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(
        copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should handle authentication errors without re-throwing', async () => {
      mockBoxManager.parseBoxReference.mockRejectedValue(
        new Error('Authentication failed: bad credentials')
      );

      // Should not throw — auth errors are caught and printed
      await expect(
        copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true })
      ).resolves.toBeUndefined();
    });

    it('should handle rate-limit errors without re-throwing', async () => {
      mockBoxManager.parseBoxReference.mockRejectedValue(
        new Error('GitHub rate limit exceeded')
      );

      await expect(
        copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true })
      ).resolves.toBeUndefined();
    });

    it('should re-throw unknown errors', async () => {
      mockBoxManager.parseBoxReference.mockRejectedValue(
        new Error('Something completely unexpected')
      );

      await expect(
        copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true })
      ).rejects.toThrow('Something completely unexpected');
    });
  });

  // ── --yes and --force equivalence ─────────────────────────────────────────

  describe('--yes and --force are equivalent for prompt suppression', () => {
    it('should call copyBox exactly once for --yes', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { yes: true });
      expect(mockBoxManager.copyBox).toHaveBeenCalledTimes(1);
    });

    it('should call copyBox exactly once for --force', async () => {
      await copyCommand(mockBoxManager, 'test-owner/test-box', { force: true });
      expect(mockBoxManager.copyBox).toHaveBeenCalledTimes(1);
    });
  });
});
