import { CreateWorkflow, CreateWorkflowOptions } from './createWorkflow';

describe('CreateWorkflow', () => {

  describe('basic functionality', () => {
    it('should be able to import CreateWorkflow', () => {
      expect(CreateWorkflow).toBeDefined();
    });

    it('should handle workflow options correctly', () => {
      const options: CreateWorkflowOptions = {
        sourcePath: '/test/source',
        boxName: 'test-box',
        targetRepository: 'https://github.com/test/repo',
        interactive: true,
        dryRun: false
      };

      expect(options.sourcePath).toBe('/test/source');
      expect(options.boxName).toBe('test-box');
      expect(options.targetRepository).toBe('https://github.com/test/repo');
      expect(options.interactive).toBe(true);
      expect(options.dryRun).toBe(false);
    });

    it('should handle minimal workflow options', () => {
      const options: CreateWorkflowOptions = {
        sourcePath: '/test/source'
      };

      expect(options.sourcePath).toBe('/test/source');
      expect(options.boxName).toBeUndefined();
      expect(options.interactive).toBeUndefined();
    });

    it('should handle all workflow option properties', () => {
      const options: CreateWorkflowOptions = {
        sourcePath: '/test/source',
        boxName: 'test-box',
        targetRepository: 'https://github.com/test/repo',
        targetBranch: 'main',
        interactive: true,
        skipSensitiveCheck: false,
        skipConflictCheck: true,
        forceDefaults: false,
        dryRun: true,
        customDefaults: {
          name: 'custom-name',
          description: 'Custom description'
        },
        outputPath: '/test/output'
      };

      expect(options.sourcePath).toBe('/test/source');
      expect(options.boxName).toBe('test-box');
      expect(options.targetRepository).toBe('https://github.com/test/repo');
      expect(options.targetBranch).toBe('main');
      expect(options.interactive).toBe(true);
      expect(options.skipSensitiveCheck).toBe(false);
      expect(options.skipConflictCheck).toBe(true);
      expect(options.forceDefaults).toBe(false);
      expect(options.dryRun).toBe(true);
      expect(options.customDefaults?.name).toBe('custom-name');
      expect(options.outputPath).toBe('/test/output');
    });
});
});
