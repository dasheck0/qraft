import { ManifestBuilder } from './manifestBuilder';
import { BoxMetadata } from '../core/metadataGenerator';

// Mock inquirer
jest.mock('inquirer');
import inquirer from 'inquirer';
const mockInquirer = inquirer as jest.Mocked<typeof inquirer>;

describe('ManifestBuilder', () => {
  let manifestBuilder: ManifestBuilder;
  let mockMetadata: BoxMetadata;

  beforeEach(() => {
    jest.clearAllMocks();
    manifestBuilder = new ManifestBuilder();
    
    mockMetadata = {
      name: 'test-box',
      description: 'A test box for testing',
      author: 'Test Author',
      version: '1.0.0',
      language: 'javascript',
      framework: 'react',
      tags: ['test', 'example'],
      keywords: ['testing', 'demo'],
      category: 'development'
    };
  });

  describe('buildQuickManifest', () => {
    it('should build manifest with minimal prompts when using defaults', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({
          name: 'my-box',
          description: 'My test box',
          useDefaults: true
        });

      const result = await manifestBuilder.buildQuickManifest(mockMetadata);

      expect(result).toEqual({
        name: 'my-box',
        description: 'My test box',
        author: 'Test Author',
        version: '1.0.0',
        defaultTarget: './target',
        language: 'javascript',
        framework: 'react',
        tags: ['test', 'example'],
        features: ['testing', 'demo']
      });
    });

    it('should validate box name format', async () => {
      const promptSpy = jest.spyOn(mockInquirer, 'prompt');
      
      // Mock the prompt call
      promptSpy.mockResolvedValueOnce({
        name: 'valid-box-name',
        description: 'Test description',
        useDefaults: true
      });

      await manifestBuilder.buildQuickManifest(mockMetadata);

      // Check that the validation function was called
      const promptCall = promptSpy.mock.calls[0][0] as any[];
      const namePrompt = promptCall.find(p => p.name === 'name');
      
      expect(namePrompt.validate('valid-box-name')).toBe(true);
      expect(namePrompt.validate('Invalid Box Name')).toContain('lowercase');
      expect(namePrompt.validate('')).toContain('required');
    });

    it('should use suggested options when provided', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({
          name: 'suggested-name',
          description: 'Suggested description',
          useDefaults: true
        });

      const options = {
        suggestedName: 'suggested-name',
        suggestedDescription: 'Suggested description',
        suggestedAuthor: 'Suggested Author',
        suggestedTags: ['suggested', 'tags'],
        defaultTarget: './custom-target'
      };

      const result = await manifestBuilder.buildQuickManifest(mockMetadata, options);

      expect(result.name).toBe('suggested-name');
      expect(result.description).toBe('Suggested description');
      expect(result.author).toBe('Suggested Author');
      expect(result.tags).toEqual(['suggested', 'tags']);
      expect(result.defaultTarget).toBe('./custom-target');
    });

    it('should fall back to full interactive mode when not using defaults', async () => {
      // Mock the quick prompt
      mockInquirer.prompt
        .mockResolvedValueOnce({
          name: 'test-box',
          description: 'Test description',
          useDefaults: false
        })
        // Mock the full interactive prompts
        .mockResolvedValueOnce({
          name: 'test-box',
          description: 'Test description',
          author: 'Test Author',
          version: '1.0.0'
        })
        .mockResolvedValueOnce({
          language: 'javascript',
          framework: 'react',
          tags: ['test']
        })
        .mockResolvedValueOnce({
          features: ['testing'],
          defaultTarget: './target',
          usageSimple: 'Usage instructions'
        })
        .mockResolvedValueOnce({
          addExclusions: false,
          addPostInstall: false
        })
        .mockResolvedValueOnce({
          confirm: true
        });

      const result = await manifestBuilder.buildQuickManifest(mockMetadata);

      expect(result.name).toBe('test-box');
      expect(result.description).toBe('Test description');
      expect(mockInquirer.prompt).toHaveBeenCalledTimes(6); // Quick + 5 full interactive steps
    });
  });

  describe('buildManifest', () => {
    it('should build complete manifest through interactive process', async () => {
      mockInquirer.prompt
        // Basic information
        .mockResolvedValueOnce({
          name: 'interactive-box',
          description: 'Interactive test box',
          author: 'Interactive Author',
          version: '2.0.0'
        })
        // Categorization
        .mockResolvedValueOnce({
          language: 'typescript',
          framework: 'vue',
          tags: ['interactive', 'test']
        })
        // Features and usage
        .mockResolvedValueOnce({
          features: ['interactive', 'testing'],
          defaultTarget: './dist',
          usageSimple: 'Custom usage instructions'
        })
        // Advanced options
        .mockResolvedValueOnce({
          addExclusions: true,
          exclude: ['*.log', '.env'],
          addPostInstall: true,
          postInstall: ['npm install', 'npm run build']
        })
        // Confirmation
        .mockResolvedValueOnce({
          confirm: true
        });

      const result = await manifestBuilder.buildManifest(mockMetadata);

      expect(result).toEqual({
        name: 'interactive-box',
        description: 'Interactive test box',
        author: 'Interactive Author',
        version: '2.0.0',
        defaultTarget: './dist',
        language: 'typescript',
        framework: 'vue',
        tags: ['interactive', 'test'],
        features: ['interactive', 'testing'],
        usage: 'Custom usage instructions',
        exclude: ['*.log', '.env'],
        postInstall: ['npm install', 'npm run build']
      });
    });

    it('should retry when user rejects manifest', async () => {
      mockInquirer.prompt
        // First attempt
        .mockResolvedValueOnce({
          name: 'first-attempt',
          description: 'First attempt',
          author: 'Author',
          version: '1.0.0'
        })
        .mockResolvedValueOnce({
          language: 'javascript',
          framework: '',
          tags: []
        })
        .mockResolvedValueOnce({
          features: [],
          defaultTarget: './target'
        })
        .mockResolvedValueOnce({
          addExclusions: false,
          addPostInstall: false
        })
        .mockResolvedValueOnce({
          confirm: false // Reject first attempt
        })
        // Second attempt
        .mockResolvedValueOnce({
          name: 'second-attempt',
          description: 'Second attempt',
          author: 'Author',
          version: '1.0.0'
        })
        .mockResolvedValueOnce({
          language: 'javascript',
          framework: '',
          tags: []
        })
        .mockResolvedValueOnce({
          features: [],
          defaultTarget: './target'
        })
        .mockResolvedValueOnce({
          addExclusions: false,
          addPostInstall: false
        })
        .mockResolvedValueOnce({
          confirm: true // Accept second attempt
        });

      const result = await manifestBuilder.buildManifest(mockMetadata);

      expect(result.name).toBe('second-attempt');
      expect(mockInquirer.prompt).toHaveBeenCalledTimes(10); // 5 calls for each attempt
    });

    it('should handle empty optional fields correctly', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({
          name: 'minimal-box',
          description: 'Minimal box',
          author: 'Author',
          version: '1.0.0'
        })
        .mockResolvedValueOnce({
          language: '',
          framework: '',
          tags: []
        })
        .mockResolvedValueOnce({
          features: [],
          defaultTarget: './target'
        })
        .mockResolvedValueOnce({
          addExclusions: false,
          addPostInstall: false
        })
        .mockResolvedValueOnce({
          confirm: true
        });

      const result = await manifestBuilder.buildManifest(mockMetadata);

      expect(result).toEqual({
        name: 'minimal-box',
        description: 'Minimal box',
        author: 'Author',
        version: '1.0.0',
        defaultTarget: './target',
        language: undefined,
        framework: undefined,
        tags: undefined,
        features: undefined,
        usage: undefined,
        exclude: undefined,
        postInstall: undefined
      });
    });
  });
});
