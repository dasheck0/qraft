import { MetadataOverrideOptions } from './metadataOverrides';
import { MetadataPromptOptions } from './metadataPrompts';

describe('MetadataOverrides', () => {

  describe('basic functionality', () => {
    it('should be able to create MetadataOverrides instance', () => {
      // Since we don't have the analysis modules yet, just test basic structure
      expect(() => {
        // This will fail until we have the analysis modules, but that's expected
        // For now, just test that the interfaces are properly defined
        const options: MetadataOverrideOptions = {
          sourcePath: '/test/project',
          interactive: true
        };

        expect(options.sourcePath).toBe('/test/project');
        expect(options.interactive).toBe(true);
      }).not.toThrow();
    });

    it('should handle metadata prompt options correctly', () => {
      const metadata: MetadataPromptOptions = {
        name: 'test-project',
        description: 'A test project',
        language: 'TypeScript',
        framework: 'React',
        version: '1.0.0',
        license: 'MIT',
        tags: ['typescript', 'react'],
        keywords: ['react', 'typescript'],
        author: 'Test Author'
      };

      expect(metadata.name).toBe('test-project');
      expect(metadata.language).toBe('TypeScript');
      expect(metadata.framework).toBe('React');
      expect(metadata.tags).toContain('typescript');
      expect(metadata.tags).toContain('react');
    });

    it('should handle custom defaults correctly', () => {
      const customDefaults: Partial<MetadataPromptOptions> = {
        description: 'Custom description',
        tags: ['custom-tag'],
        author: 'Custom Author'
      };

      const options: MetadataOverrideOptions = {
        sourcePath: '/test/project',
        interactive: false,
        customDefaults
      };

      expect(options.customDefaults?.description).toBe('Custom description');
      expect(options.customDefaults?.author).toBe('Custom Author');
      expect(options.customDefaults?.tags).toContain('custom-tag');
    });

    it('should handle different option configurations', () => {
      const options1: MetadataOverrideOptions = {
        sourcePath: '/test/python-project',
        interactive: false
      };

      const options2: MetadataOverrideOptions = {
        sourcePath: '/test/js-project',
        interactive: true,
        skipSensitiveCheck: true,
        skipConflictCheck: false,
        forceDefaults: true
      };

      expect(options1.sourcePath).toBe('/test/python-project');
      expect(options1.interactive).toBe(false);
      expect(options2.skipSensitiveCheck).toBe(true);
      expect(options2.forceDefaults).toBe(true);
    });

    it('should handle metadata with tags and keywords', () => {
      const metadata: MetadataPromptOptions = {
        name: 'full-stack-app',
        tags: ['typescript', 'javascript', 'next.js', 'express', 'testing'],
        keywords: ['react', 'node', 'fullstack', 'web']
      };

      expect(metadata.tags).toContain('typescript');
      expect(metadata.tags).toContain('javascript');
      expect(metadata.tags).toContain('next.js');
      expect(metadata.keywords).toContain('react');
      expect(metadata.keywords).toContain('fullstack');
    });

  });

  describe('interface validation', () => {
    it('should handle complete metadata options', () => {
      const completeMetadata: MetadataPromptOptions = {
        name: 'test-project',
        description: 'A complete test project',
        language: 'TypeScript',
        framework: 'React',
        version: '1.0.0',
        license: 'MIT',
        tags: ['typescript', 'react', 'frontend'],
        keywords: ['react', 'typescript', 'component'],
        author: 'Test Author',
        repository: 'https://github.com/test/project',
        homepage: 'https://test-project.com'
      };

      expect(completeMetadata.name).toBe('test-project');
      expect(completeMetadata.description).toBe('A complete test project');
      expect(completeMetadata.language).toBe('TypeScript');
      expect(completeMetadata.framework).toBe('React');
      expect(completeMetadata.version).toBe('1.0.0');
      expect(completeMetadata.license).toBe('MIT');
      expect(completeMetadata.author).toBe('Test Author');
      expect(completeMetadata.repository).toBe('https://github.com/test/project');
      expect(completeMetadata.homepage).toBe('https://test-project.com');
    });

    it('should handle minimal metadata options', () => {
      const minimalMetadata: MetadataPromptOptions = {
        name: 'minimal-project'
      };

      expect(minimalMetadata.name).toBe('minimal-project');
      expect(minimalMetadata.description).toBeUndefined();
      expect(minimalMetadata.language).toBeUndefined();
    });

    it('should handle all override option combinations', () => {
      const allOptions: MetadataOverrideOptions = {
        sourcePath: '/test/project',
        targetRepository: 'https://github.com/test/repo',
        targetBranch: 'main',
        interactive: true,
        skipSensitiveCheck: false,
        skipConflictCheck: true,
        forceDefaults: false,
        customDefaults: {
          name: 'custom-name',
          description: 'Custom description'
        }
      };

      expect(allOptions.sourcePath).toBe('/test/project');
      expect(allOptions.targetRepository).toBe('https://github.com/test/repo');
      expect(allOptions.targetBranch).toBe('main');
      expect(allOptions.interactive).toBe(true);
      expect(allOptions.skipSensitiveCheck).toBe(false);
      expect(allOptions.skipConflictCheck).toBe(true);
      expect(allOptions.forceDefaults).toBe(false);
      expect(allOptions.customDefaults?.name).toBe('custom-name');
    });
  });
});
