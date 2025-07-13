export interface RepositoryPermissions {
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  canCreatePR: boolean;
  canFork: boolean;
  userRole: 'owner' | 'admin' | 'write' | 'triage' | 'read' | 'none';
  isPublic: boolean;
  isFork: boolean;
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  permissions: RepositoryPermissions;
  alternatives: PermissionAlternative[];
  recommendations: string[];
  requiresAuth: boolean;
}

export interface PermissionAlternative {
  action: 'fork' | 'request_access' | 'use_different_repo' | 'create_pr';
  description: string;
  automated: boolean;
  steps: string[];
}

export interface RepositoryInfo {
  owner: string;
  name: string;
  fullName: string;
  isPublic: boolean;
  isFork: boolean;
  parentRepo?: string | undefined;
  defaultBranch: string;
  permissions?: RepositoryPermissions | undefined;
}

export class PermissionChecker {
  private readonly githubToken?: string | undefined;

  constructor(githubToken?: string | undefined) {
    this.githubToken = githubToken;
  }

  async checkRepositoryPermissions(
    repoOwner: string,
    repoName: string
  ): Promise<PermissionCheckResult> {
    try {
      const repoInfo = await this.getRepositoryInfo(repoOwner, repoName);
      const permissions = await this.getUserPermissions(repoOwner, repoName);
      const alternatives = this.generateAlternatives(repoInfo, permissions);
      const recommendations = this.generateRecommendations(repoInfo, permissions);

      return {
        hasPermission: permissions.canWrite,
        permissions,
        alternatives,
        recommendations,
        requiresAuth: !this.githubToken
      };
    } catch (error) {
      return this.handlePermissionError(error, repoOwner, repoName);
    }
  }

  private async getRepositoryInfo(owner: string, name: string): Promise<RepositoryInfo> {
    const url = `https://api.github.com/repos/${owner}/${name}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'qraft-cli'
    };

    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository ${owner}/${name} not found or not accessible`);
      }
      if (response.status === 403) {
        throw new Error(`Access forbidden to repository ${owner}/${name}`);
      }
      throw new Error(`Failed to fetch repository info: ${response.statusText}`);
    }

    const data = await response.json() as any;

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      isPublic: !data.private,
      isFork: data.fork,
      parentRepo: data.parent ? data.parent.full_name : undefined,
      defaultBranch: data.default_branch,
      permissions: data.permissions ? {
        canRead: data.permissions.pull,
        canWrite: data.permissions.push,
        canAdmin: data.permissions.admin,
        canCreatePR: data.permissions.pull,
        canFork: !data.private || data.permissions.pull,
        userRole: this.determineUserRole(data.permissions),
        isPublic: !data.private,
        isFork: data.fork
      } : undefined
    };
  }

  private async getUserPermissions(owner: string, name: string): Promise<RepositoryPermissions> {
    if (!this.githubToken) {
      // Without authentication, we can only access public repos for reading
      const repoInfo = await this.getRepositoryInfo(owner, name);
      return {
        canRead: repoInfo.isPublic,
        canWrite: false,
        canAdmin: false,
        canCreatePR: repoInfo.isPublic,
        canFork: repoInfo.isPublic,
        userRole: 'none',
        isPublic: repoInfo.isPublic,
        isFork: repoInfo.isFork
      };
    }

    // Use the permissions from repository info if available
    const repoInfo = await this.getRepositoryInfo(owner, name);
    if (repoInfo.permissions) {
      return repoInfo.permissions;
    }

    // Fallback: try to determine permissions through API calls
    return await this.probePermissions(owner, name);
  }

  private async probePermissions(owner: string, name: string): Promise<RepositoryPermissions> {
    const headers = {
      'Authorization': `token ${this.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'qraft-cli'
    };

    // Check if we can access the repo at all
    try {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers });
      const canRead = repoResponse.ok;

      if (!canRead) {
        return {
          canRead: false,
          canWrite: false,
          canAdmin: false,
          canCreatePR: false,
          canFork: false,
          userRole: 'none',
          isPublic: false,
          isFork: false
        };
      }

      const repoData = await repoResponse.json() as any;

      // Try to check if we can create a branch (indicates write access)
      const branchResponse = await fetch(
        `https://api.github.com/repos/${owner}/${name}/git/refs/heads`,
        { headers }
      );
      const canWrite = branchResponse.ok;

      return {
        canRead: true,
        canWrite,
        canAdmin: false, // Would need more specific checks
        canCreatePR: true,
        canFork: !repoData.private,
        userRole: canWrite ? 'write' : 'read',
        isPublic: !repoData.private,
        isFork: repoData.fork
      };
    } catch {
      return {
        canRead: false,
        canWrite: false,
        canAdmin: false,
        canCreatePR: false,
        canFork: false,
        userRole: 'none',
        isPublic: false,
        isFork: false
      };
    }
  }

  private determineUserRole(permissions: any): RepositoryPermissions['userRole'] {
    if (permissions.admin) return 'admin';
    if (permissions.maintain) return 'admin';
    if (permissions.push) return 'write';
    if (permissions.triage) return 'triage';
    if (permissions.pull) return 'read';
    return 'none';
  }

  private generateAlternatives(
    _repoInfo: RepositoryInfo,
    permissions: RepositoryPermissions
  ): PermissionAlternative[] {
    const alternatives: PermissionAlternative[] = [];

    // If no write access, suggest forking
    if (!permissions.canWrite && permissions.canFork) {
      alternatives.push({
        action: 'fork',
        description: 'Fork the repository to your account and create a pull request',
        automated: true,
        steps: [
          'Fork the repository to your GitHub account',
          'Create the box in your forked repository',
          'Create a pull request to the original repository'
        ]
      });
    }

    // If can create PR but not write directly
    if (!permissions.canWrite && permissions.canCreatePR) {
      alternatives.push({
        action: 'create_pr',
        description: 'Create a pull request with your changes',
        automated: true,
        steps: [
          'Create a new branch in the repository',
          'Commit your box changes to the branch',
          'Create a pull request for review'
        ]
      });
    }

    // If no access at all, suggest requesting access
    if (!permissions.canRead && !permissions.canWrite) {
      alternatives.push({
        action: 'request_access',
        description: 'Request access to the repository',
        automated: false,
        steps: [
          'Contact the repository owner',
          'Request collaborator access',
          'Wait for approval'
        ]
      });
    }

    // Suggest using a different repository
    alternatives.push({
      action: 'use_different_repo',
      description: 'Use a different repository where you have write access',
      automated: false,
      steps: [
        'Choose a repository where you have write permissions',
        'Update your registry configuration',
        'Create the box in the accessible repository'
      ]
    });

    return alternatives;
  }

  private generateRecommendations(
    repoInfo: RepositoryInfo,
    permissions: RepositoryPermissions
  ): string[] {
    const recommendations: string[] = [];

    if (!this.githubToken) {
      recommendations.push('🔑 Set up GitHub authentication for better access control');
      recommendations.push('Use: export GITHUB_TOKEN=your_token_here');
    }

    if (!permissions.canWrite) {
      if (permissions.canFork) {
        recommendations.push('🍴 Fork the repository to contribute changes');
      } else {
        recommendations.push('📝 Request collaborator access from the repository owner');
      }
    }

    if (repoInfo.isFork && permissions.canWrite) {
      recommendations.push('🔄 Consider creating PR to upstream repository');
    }

    if (permissions.userRole === 'read') {
      recommendations.push('📖 You have read-only access - use fork workflow for contributions');
    }

    if (!permissions.canRead) {
      recommendations.push('🔒 Repository is private and you don\'t have access');
      recommendations.push('Contact the owner to request access');
    }

    return recommendations;
  }

  private handlePermissionError(
    error: any,
    _owner: string,
    _name: string
  ): PermissionCheckResult {
    const errorMessage = error.message || 'Unknown error';
    
    return {
      hasPermission: false,
      permissions: {
        canRead: false,
        canWrite: false,
        canAdmin: false,
        canCreatePR: false,
        canFork: false,
        userRole: 'none',
        isPublic: false,
        isFork: false
      },
      alternatives: [
        {
          action: 'use_different_repo',
          description: 'Use a different repository',
          automated: false,
          steps: [
            'Verify the repository exists and is accessible',
            'Check your GitHub token permissions',
            'Use a repository where you have access'
          ]
        }
      ],
      recommendations: [
        `❌ Error: ${errorMessage}`,
        '🔍 Verify repository exists and is accessible',
        '🔑 Check your GitHub authentication'
      ],
      requiresAuth: !this.githubToken
    };
  }

  // Utility method to validate repository URL format
  static parseRepositoryUrl(url: string): { owner: string; name: string } | null {
    // Handle various GitHub URL formats
    const patterns = [
      /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
      /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
      /^([^/]+)\/([^/]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          name: match[2]
        };
      }
    }

    return null;
  }

  // Check if user has GitHub token configured
  hasGitHubToken(): boolean {
    return !!this.githubToken;
  }

  // Get current user info (requires token)
  async getCurrentUser(): Promise<{ login: string; name: string } | null> {
    if (!this.githubToken) return null;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'qraft-cli'
        }
      });

      if (response.ok) {
        const data = await response.json() as any;
        return {
          login: data.login,
          name: data.name || data.login
        };
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  // Test method for checking permissions without making actual API calls
  async checkPermissionsDryRun(
    repoOwner: string,
    repoName: string,
    mockPermissions?: Partial<RepositoryPermissions>
  ): Promise<PermissionCheckResult> {
    const defaultPermissions: RepositoryPermissions = {
      canRead: true,
      canWrite: false,
      canAdmin: false,
      canCreatePR: true,
      canFork: true,
      userRole: 'read',
      isPublic: true,
      isFork: false,
      ...mockPermissions
    };

    const mockRepoInfo: RepositoryInfo = {
      owner: repoOwner,
      name: repoName,
      fullName: `${repoOwner}/${repoName}`,
      isPublic: defaultPermissions.isPublic,
      isFork: defaultPermissions.isFork,
      defaultBranch: 'main',
      permissions: defaultPermissions
    };

    const alternatives = this.generateAlternatives(mockRepoInfo, defaultPermissions);
    const recommendations = this.generateRecommendations(mockRepoInfo, defaultPermissions);

    return {
      hasPermission: defaultPermissions.canWrite,
      permissions: defaultPermissions,
      alternatives,
      recommendations,
      requiresAuth: !this.githubToken
    };
  }
}
