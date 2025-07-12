import { PullRequestCreator, BoxMetadata } from './pullRequestCreator';

describe('PullRequestCreator', () => {
  let prCreator: PullRequestCreator;
  let mockBoxMetadata: BoxMetadata;

  beforeEach(() => {
    prCreator = new PullRequestCreator('test-token');
    mockBoxMetadata = {
      name: 'react-typescript-starter',
      description: 'A modern React TypeScript starter template',
      tags: ['react', 'typescript', 'frontend'],
      framework: 'React',
      language: 'TypeScript',
      fileCount: 25,
      size: '2.5MB',
      features: ['Hot reload', 'ESLint configuration', 'Jest testing setup']
    };
  });

  describe('generatePRPreview', () => {
    it('should generate title with framework', () => {
      const preview = prCreator.generatePRPreview(mockBoxMetadata);

      expect(preview.title).toBe('Add react-typescript-starter box (React TypeScript)');
    });

    it('should generate title without framework', () => {
      const metadata = { ...mockBoxMetadata, framework: 'none' };
      const preview = prCreator.generatePRPreview(metadata);

      expect(preview.title).toBe('Add react-typescript-starter box (TypeScript)');
    });

    it('should use custom title when provided', () => {
      const preview = prCreator.generatePRPreview(mockBoxMetadata, {
        title: 'Custom PR Title'
      });

      expect(preview.title).toBe('Custom PR Title');
    });

    it('should generate comprehensive description', () => {
      const preview = prCreator.generatePRPreview(mockBoxMetadata);

      expect(preview.description).toContain('## 📦 New Box: react-typescript-starter');
      expect(preview.description).toContain('A modern React TypeScript starter template');
      expect(preview.description).toContain('**Language**: TypeScript');
      expect(preview.description).toContain('**Framework**: React');
      expect(preview.description).toContain('**Files**: 25 files');
      expect(preview.description).toContain('**Size**: 2.5MB');
      expect(preview.description).toContain('**Tags**: react, typescript, frontend');
      expect(preview.description).toContain('### ✨ Features');
      expect(preview.description).toContain('- Hot reload');
      expect(preview.description).toContain('- ESLint configuration');
      expect(preview.description).toContain('- Jest testing setup');
      expect(preview.description).toContain('qraft create my-project react-typescript-starter');
    });

    it('should handle metadata without optional fields', () => {
      const minimalMetadata: BoxMetadata = {
        name: 'simple-box',
        tags: [],
        language: 'JavaScript',
        fileCount: 5,
        size: '100KB'
      };

      const preview = prCreator.generatePRPreview(minimalMetadata);

      expect(preview.description).toContain('## 📦 New Box: simple-box');
      expect(preview.description).toContain('**Language**: JavaScript');
      expect(preview.description).not.toContain('**Framework**:');
      expect(preview.description).not.toContain('### ✨ Features');
    });

    it('should generate correct branch names', () => {
      const preview = prCreator.generatePRPreview(mockBoxMetadata);

      expect(preview.baseBranch).toBe('main');
      expect(preview.headBranch).toBe('add-react-typescript-starter-box');
    });

    it('should use custom branch names when provided', () => {
      const preview = prCreator.generatePRPreview(mockBoxMetadata, {
        baseBranch: 'develop',
        headBranch: 'feature/new-box'
      });

      expect(preview.baseBranch).toBe('develop');
      expect(preview.headBranch).toBe('feature/new-box');
    });

    it('should use custom description when provided', () => {
      const customDescription = 'This is a custom PR description';
      const preview = prCreator.generatePRPreview(mockBoxMetadata, {
        description: customDescription
      });

      expect(preview.description).toBe(customDescription);
    });
  });

  describe('createPullRequestDryRun', () => {
    it('should create successful dry run result', async () => {
      const result = await prCreator.createPullRequestDryRun('owner', 'repo', mockBoxMetadata);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/123');
      expect(result.prNumber).toBe(123);
      expect(result.title).toBe('Add react-typescript-starter box (React TypeScript)');
      expect(result.message).toContain('[DRY RUN]');
      expect(result.nextSteps).toHaveLength(4);
      expect(result.nextSteps.every(step => step.includes('[DRY RUN]'))).toBe(true);
    });

    it('should use custom options in dry run', async () => {
      const options = {
        title: 'Custom Title',
        description: 'Custom Description',
        baseBranch: 'develop',
        headBranch: 'feature/test'
      };

      const result = await prCreator.createPullRequestDryRun('owner', 'repo', mockBoxMetadata, options);

      expect(result.title).toBe('Custom Title');
      expect(result.description).toBe('Custom Description');
    });
  });

  describe('validatePROptions', () => {
    it('should validate valid options', () => {
      const options = {
        title: 'Valid Title',
        description: 'Valid description',
        labels: ['enhancement', 'documentation'],
        assignees: ['user1', 'user2'],
        reviewers: ['reviewer1']
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject title that is too long', () => {
      const options = {
        title: 'a'.repeat(257) // 257 characters
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Title must be 256 characters or less');
    });

    it('should reject description that is too long', () => {
      const options = {
        description: 'a'.repeat(65537) // 65537 characters
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Description must be 65536 characters or less');
    });

    it('should reject too many labels', () => {
      const options = {
        labels: Array(101).fill('label') // 101 labels
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Maximum 100 labels allowed');
    });

    it('should reject labels that are too long', () => {
      const options = {
        labels: ['a'.repeat(51)] // 51 characters
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Label "' + 'a'.repeat(51) + '" must be 50 characters or less');
    });

    it('should reject too many assignees', () => {
      const options = {
        assignees: Array(11).fill('user') // 11 assignees
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Maximum 10 assignees allowed');
    });

    it('should reject too many reviewers', () => {
      const options = {
        reviewers: Array(16).fill('reviewer') // 16 reviewers
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Maximum 15 reviewers allowed');
    });

    it('should handle empty options', () => {
      const validation = prCreator.validatePROptions({});

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should accumulate multiple errors', () => {
      const options = {
        title: 'a'.repeat(257),
        labels: Array(101).fill('label'),
        assignees: Array(11).fill('user')
      };

      const validation = prCreator.validatePROptions(options);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(3);
    });
  });

  describe('checkExistingPR', () => {
    it('should handle missing token gracefully', async () => {
      const prCreatorNoToken = new PullRequestCreator();
      const result = await prCreatorNoToken.checkExistingPR('owner', 'repo', 'box-name');

      expect(result.exists).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle box names with special characters', () => {
      const metadata = { ...mockBoxMetadata, name: 'box-with-dashes_and_underscores' };
      const preview = prCreator.generatePRPreview(metadata);

      expect(preview.title).toContain('box-with-dashes_and_underscores');
      expect(preview.headBranch).toBe('add-box-with-dashes_and_underscores-box');
    });

    it('should handle empty tags array', () => {
      const metadata = { ...mockBoxMetadata, tags: [] };
      const preview = prCreator.generatePRPreview(metadata);

      expect(preview.description).not.toContain('**Tags**:');
    });

    it('should handle missing features', () => {
      const metadata = { ...mockBoxMetadata };
      delete metadata.features;
      const preview = prCreator.generatePRPreview(metadata);

      expect(preview.description).not.toContain('### ✨ Features');
    });

    it('should handle empty features array', () => {
      const metadata = { ...mockBoxMetadata, features: [] };
      const preview = prCreator.generatePRPreview(metadata);

      expect(preview.description).not.toContain('### ✨ Features');
    });
  });
});
