import { RepositoryForker } from './repositoryForker';

describe('RepositoryForker', () => {
  let repositoryForker: RepositoryForker;

  beforeEach(() => {
    repositoryForker = new RepositoryForker('test-token');
  });

  describe('forkRepositoryDryRun', () => {
    it('should create fork with default settings', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.forkOwner).toBe('testuser');
      expect(result.forkName).toBe('repo');
      expect(result.originalRepo).toBe('owner/repo');
      expect(result.forkUrl).toBe('https://github.com/testuser/repo');
      expect(result.message).toContain('[DRY RUN]');
      expect(result.nextSteps).toHaveLength(3);
      expect(result.nextSteps.every(step => step.includes('[DRY RUN]'))).toBe(true);
    });

    it('should create fork with custom name', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        name: 'custom-repo-name'
      });

      expect(result.forkName).toBe('custom-repo-name');
      expect(result.forkUrl).toBe('https://github.com/testuser/custom-repo-name');
    });

    it('should create fork in organization', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        organization: 'my-org'
      });

      expect(result.forkOwner).toBe('my-org');
      expect(result.forkUrl).toBe('https://github.com/my-org/repo');
    });

    it('should create fork with custom user', async () => {
      const customUser = { login: 'customuser', name: 'Custom User' };
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {}, customUser);

      expect(result.forkOwner).toBe('customuser');
      expect(result.forkUrl).toBe('https://github.com/customuser/repo');
    });

    it('should handle organization and custom name together', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        organization: 'my-org',
        name: 'custom-name'
      });

      expect(result.forkOwner).toBe('my-org');
      expect(result.forkName).toBe('custom-name');
      expect(result.forkUrl).toBe('https://github.com/my-org/custom-name');
    });

    it('should include meaningful next steps', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.nextSteps).toContain('[DRY RUN] Fork would be created and ready to use');
      expect(result.nextSteps).toContain('[DRY RUN] You could create boxes in your fork');
      expect(result.nextSteps).toContain('[DRY RUN] Create a pull request when ready to contribute back');
    });

    it('should preserve original repository information', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('original-owner', 'original-repo');

      expect(result.originalRepo).toBe('original-owner/original-repo');
    });
  });

  describe('canForkRepository', () => {
    it('should handle permission checking errors gracefully', async () => {
      // This will fail because we don't have a real GitHub token
      const result = await repositoryForker.canForkRepository('owner', 'repo');

      expect(result.canFork).toBe(false);
      expect(result.reason).toContain('permissions');
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('without GitHub token', () => {
    beforeEach(() => {
      repositoryForker = new RepositoryForker(); // No token
    });

    it('should indicate authentication required for fork checking', async () => {
      const result = await repositoryForker.canForkRepository('owner', 'repo');

      expect(result.canFork).toBe(false);
      expect(result.reason).toContain('permissions');
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('fork options', () => {
    it('should handle empty options', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {});

      expect(result.success).toBe(true);
      expect(result.forkOwner).toBe('testuser');
      expect(result.forkName).toBe('repo');
    });

    it('should handle undefined options', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.forkOwner).toBe('testuser');
      expect(result.forkName).toBe('repo');
    });

    it('should handle defaultBranchOnly option', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        defaultBranchOnly: true
      });

      expect(result.success).toBe(true);
      // The dry run doesn't actually use this option, but it should not cause errors
    });
  });

  describe('error scenarios', () => {
    it('should handle repository names with special characters', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo-with-dashes');

      expect(result.success).toBe(true);
      expect(result.forkName).toBe('repo-with-dashes');
      expect(result.forkUrl).toBe('https://github.com/testuser/repo-with-dashes');
    });

    it('should handle long repository names', async () => {
      const longName = 'very-long-repository-name-that-might-cause-issues';
      const result = await repositoryForker.forkRepositoryDryRun('owner', longName);

      expect(result.success).toBe(true);
      expect(result.forkName).toBe(longName);
    });

    it('should handle organization names with special characters', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        organization: 'org-with-dashes'
      });

      expect(result.success).toBe(true);
      expect(result.forkOwner).toBe('org-with-dashes');
    });
  });

  describe('URL generation', () => {
    it('should generate correct GitHub URLs', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.forkUrl).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
      expect(result.forkUrl).toBe('https://github.com/testuser/repo');
    });

    it('should generate correct URLs for organizations', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        organization: 'my-org'
      });

      expect(result.forkUrl).toBe('https://github.com/my-org/repo');
    });

    it('should generate correct URLs for custom names', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo', {
        name: 'custom-name'
      });

      expect(result.forkUrl).toBe('https://github.com/testuser/custom-name');
    });
  });

  describe('message formatting', () => {
    it('should include dry run indicator in message', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.message).toContain('[DRY RUN]');
      expect(result.message).toContain('would be forked successfully');
    });

    it('should provide clear success message', async () => {
      const result = await repositoryForker.forkRepositoryDryRun('owner', 'repo');

      expect(result.message).toContain('successfully');
    });
  });
});
