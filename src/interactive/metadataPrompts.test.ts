import { DetectedDefaults, MetadataPrompter, MetadataPromptOptions } from './metadataPrompts';

describe('MetadataPrompter', () => {
  describe('validateMetadata', () => {
    it('should validate required fields', () => {
      const validMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript'
      };

      const result = MetadataPrompter.validateMetadata(validMetadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing name', () => {
      const invalidMetadata: MetadataPromptOptions = {
        language: 'TypeScript'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box name is required');
    });

    it('should reject empty name', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: '',
        language: 'TypeScript'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box name is required');
    });

    it('should reject invalid name characters', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test box with spaces',
        language: 'TypeScript'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box name can only contain letters, numbers, hyphens, and underscores');
    });

    it('should accept valid name characters', () => {
      const validNames = ['test-box', 'test_box', 'TestBox123', 'test-box-v2'];
      
      for (const name of validNames) {
        const metadata: MetadataPromptOptions = {
          name,
          language: 'TypeScript'
        };
        
        const result = MetadataPrompter.validateMetadata(metadata);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject missing language', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Primary language is required');
    });

    it('should validate version format', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        version: 'invalid-version'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Version should follow semantic versioning (e.g., 1.0.0)');
    });

    it('should accept valid version formats', () => {
      const validVersions = ['1.0.0', '2.1.3', '0.0.1', '1.0.0-alpha', '2.1.0-beta.1'];
      
      for (const version of validVersions) {
        const metadata: MetadataPromptOptions = {
          name: 'test-box',
          language: 'TypeScript',
          version
        };
        
        const result = MetadataPrompter.validateMetadata(metadata);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate repository URL format', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        repository: 'invalid-url'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Repository URL should start with http:// or https://');
    });

    it('should accept valid repository URLs', () => {
      const validUrls = [
        'https://github.com/user/repo',
        'http://gitlab.com/user/repo',
        'https://bitbucket.org/user/repo'
      ];
      
      for (const repository of validUrls) {
        const metadata: MetadataPromptOptions = {
          name: 'test-box',
          language: 'TypeScript',
          repository
        };
        
        const result = MetadataPrompter.validateMetadata(metadata);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate homepage URL format', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        homepage: 'invalid-url'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Homepage URL should start with http:// or https://');
    });

    it('should limit number of tags', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        tags: Array(21).fill('tag') // 21 tags
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Maximum 20 tags allowed');
    });

    it('should limit number of keywords', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        keywords: Array(51).fill('keyword') // 51 keywords
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Maximum 50 keywords allowed');
    });

    it('should accumulate multiple errors', () => {
      const invalidMetadata: MetadataPromptOptions = {
        name: 'invalid name with spaces',
        version: 'invalid-version',
        repository: 'invalid-url'
      };

      const result = MetadataPrompter.validateMetadata(invalidMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4); // name, language, version, repository
    });
  });

  describe('generateSuggestions', () => {
    it('should suggest testing tag when tests are detected', () => {
      const detectedDefaults: DetectedDefaults = {
        hasTests: true
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Consider adding "testing" to your tags');
    });

    it('should suggest documentation tag when docs are detected', () => {
      const detectedDefaults: DetectedDefaults = {
        hasDocs: true
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Consider adding "documentation" to your tags');
    });

    it('should suggest package manager as keyword', () => {
      const detectedDefaults: DetectedDefaults = {
        packageManager: 'npm'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Detected npm - consider adding to keywords');
    });

    it('should suggest framework in tags', () => {
      const detectedDefaults: DetectedDefaults = {
        framework: 'React'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Framework detected: React - ensure it\'s in your tags');
    });

    it('should not suggest framework for "none"', () => {
      const detectedDefaults: DetectedDefaults = {
        framework: 'none'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).not.toContain(expect.stringContaining('Framework detected'));
    });

    it('should suggest adding description when missing', () => {
      const detectedDefaults: DetectedDefaults = {};

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Consider adding a description to help users understand your box');
    });

    it('should suggest adding license when missing', () => {
      const detectedDefaults: DetectedDefaults = {};

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toContain('Consider specifying a license (MIT is common for open source)');
    });

    it('should not suggest description when present', () => {
      const detectedDefaults: DetectedDefaults = {
        description: 'A test box'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).not.toContain('Consider adding a description to help users understand your box');
    });

    it('should not suggest license when present', () => {
      const detectedDefaults: DetectedDefaults = {
        license: 'MIT'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).not.toContain('Consider specifying a license (MIT is common for open source)');
    });

    it('should return empty array for complete defaults', () => {
      const detectedDefaults: DetectedDefaults = {
        description: 'A complete box',
        license: 'MIT',
        framework: 'none'
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toHaveLength(0);
    });

    it('should handle multiple suggestions', () => {
      const detectedDefaults: DetectedDefaults = {
        hasTests: true,
        hasDocs: true,
        packageManager: 'yarn',
        framework: 'Vue',
        description: 'A Vue.js project', // Add description to avoid suggestion
        license: 'MIT' // Add license to avoid suggestion
      };

      const suggestions = MetadataPrompter.generateSuggestions(detectedDefaults);
      expect(suggestions).toHaveLength(4);
      expect(suggestions).toContain('Consider adding "testing" to your tags');
      expect(suggestions).toContain('Consider adding "documentation" to your tags');
      expect(suggestions).toContain('Detected yarn - consider adding to keywords');
      expect(suggestions).toContain('Framework detected: Vue - ensure it\'s in your tags');
    });
  });

  describe('edge cases', () => {
    it('should handle empty metadata object', () => {
      const result = MetadataPrompter.validateMetadata({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box name is required');
      expect(result.errors).toContain('Primary language is required');
    });

    it('should handle metadata with only whitespace', () => {
      const metadata: MetadataPromptOptions = {
        name: '   ',
        language: '   '
      };

      const result = MetadataPrompter.validateMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Box name is required');
      expect(result.errors).toContain('Primary language is required');
    });

    it('should handle empty arrays', () => {
      const metadata: MetadataPromptOptions = {
        name: 'test-box',
        language: 'TypeScript',
        tags: [],
        keywords: []
      };

      const result = MetadataPrompter.validateMetadata(metadata);
      expect(result.valid).toBe(true);
    });
  });
});
