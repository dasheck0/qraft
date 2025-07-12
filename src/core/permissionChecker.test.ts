import { PermissionChecker } from './permissionChecker';

describe('PermissionChecker', () => {
  let permissionChecker: PermissionChecker;

  beforeEach(() => {
    permissionChecker = new PermissionChecker();
  });

  describe('parseRepositoryUrl', () => {
    it('should parse HTTPS GitHub URLs', () => {
      const result = PermissionChecker.parseRepositoryUrl('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should parse HTTPS GitHub URLs with .git suffix', () => {
      const result = PermissionChecker.parseRepositoryUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should parse SSH GitHub URLs', () => {
      const result = PermissionChecker.parseRepositoryUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should parse short format URLs', () => {
      const result = PermissionChecker.parseRepositoryUrl('owner/repo');
      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should handle URLs with trailing paths', () => {
      const result = PermissionChecker.parseRepositoryUrl('https://github.com/owner/repo/tree/main');
      expect(result).toEqual({ owner: 'owner', name: 'repo' });
    });

    it('should return null for invalid URLs', () => {
      expect(PermissionChecker.parseRepositoryUrl('invalid-url')).toBeNull();
      expect(PermissionChecker.parseRepositoryUrl('https://gitlab.com/owner/repo')).toBeNull();
      expect(PermissionChecker.parseRepositoryUrl('')).toBeNull();
    });
  });

  describe('hasGitHubToken', () => {
    it('should return false when no token is provided', () => {
      const checker = new PermissionChecker();
      expect(checker.hasGitHubToken()).toBe(false);
    });

    it('should return true when token is provided', () => {
      const checker = new PermissionChecker('test-token');
      expect(checker.hasGitHubToken()).toBe(true);
    });
  });

  describe('checkPermissionsDryRun', () => {
    it('should return default permissions for public repo without token', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo');

      expect(result.hasPermission).toBe(false);
      expect(result.permissions.canRead).toBe(true);
      expect(result.permissions.canWrite).toBe(false);
      expect(result.permissions.canCreatePR).toBe(true);
      expect(result.permissions.canFork).toBe(true);
      expect(result.permissions.userRole).toBe('read');
      expect(result.requiresAuth).toBe(true);
    });

    it('should return write permissions when provided', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: true,
        userRole: 'write'
      });

      expect(result.hasPermission).toBe(true);
      expect(result.permissions.canWrite).toBe(true);
      expect(result.permissions.userRole).toBe('write');
    });

    it('should generate fork alternative for read-only access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: false,
        canFork: true
      });

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          action: 'fork',
          description: expect.stringContaining('Fork the repository'),
          automated: true
        })
      );
    });

    it('should generate PR alternative for read access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: false,
        canCreatePR: true
      });

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          action: 'create_pr',
          description: expect.stringContaining('Create a pull request'),
          automated: true
        })
      );
    });

    it('should generate request access alternative for no access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: false,
        canWrite: false,
        canCreatePR: false,
        canFork: false
      });

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          action: 'request_access',
          description: expect.stringContaining('Request access'),
          automated: false
        })
      );
    });

    it('should always include use different repo alternative', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo');

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          action: 'use_different_repo',
          description: expect.stringContaining('Use a different repository'),
          automated: false
        })
      );
    });

    it('should recommend authentication when no token', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo');

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Set up GitHub authentication')
      );
    });

    it('should recommend forking for read-only access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: false,
        canFork: true
      });

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Fork the repository')
      );
    });

    it('should recommend requesting access when no fork possible', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: false,
        canFork: false
      });

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Request collaborator access')
      );
    });

    it('should recommend PR to upstream for fork with write access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canWrite: true,
        isFork: true
      });

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Consider creating PR to upstream')
      );
    });

    it('should recommend fork workflow for read-only users', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        userRole: 'read'
      });

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('read-only access - use fork workflow')
      );
    });

    it('should handle private repo with no access', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: false,
        isPublic: false
      });

      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Repository is private and you don\'t have access')
      );
      expect(result.recommendations).toContainEqual(
        expect.stringContaining('Contact the owner to request access')
      );
    });
  });

  describe('with GitHub token', () => {
    beforeEach(() => {
      permissionChecker = new PermissionChecker('test-token');
    });

    it('should not require auth when token is provided', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo');

      expect(result.requiresAuth).toBe(false);
    });

    it('should not recommend authentication when token exists', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo');

      expect(result.recommendations).not.toContainEqual(
        expect.stringContaining('Set up GitHub authentication')
      );
    });
  });

  describe('permission levels', () => {
    it('should handle admin permissions', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: true,
        canWrite: true,
        canAdmin: true,
        userRole: 'admin'
      });

      expect(result.hasPermission).toBe(true);
      expect(result.permissions.canAdmin).toBe(true);
      expect(result.permissions.userRole).toBe('admin');
    });

    it('should handle write permissions', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: true,
        canWrite: true,
        canAdmin: false,
        userRole: 'write'
      });

      expect(result.hasPermission).toBe(true);
      expect(result.permissions.canWrite).toBe(true);
      expect(result.permissions.canAdmin).toBe(false);
    });

    it('should handle triage permissions', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: true,
        canWrite: false,
        userRole: 'triage'
      });

      expect(result.hasPermission).toBe(false);
      expect(result.permissions.userRole).toBe('triage');
    });

    it('should handle no permissions', async () => {
      const result = await permissionChecker.checkPermissionsDryRun('owner', 'repo', {
        canRead: false,
        canWrite: false,
        canCreatePR: false,
        canFork: false,
        userRole: 'none'
      });

      expect(result.hasPermission).toBe(false);
      expect(result.permissions.userRole).toBe('none');
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });
});
