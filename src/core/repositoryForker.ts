import { PermissionChecker } from './permissionChecker';

export interface ForkResult {
  success: boolean;
  forkUrl: string;
  forkOwner: string;
  forkName: string;
  originalRepo: string;
  message: string;
  nextSteps: string[];
}

export interface ForkOptions {
  organization?: string;
  name?: string;
  defaultBranchOnly?: boolean;
}

export class RepositoryForker {
  private permissionChecker: PermissionChecker;

  constructor(githubToken?: string) {
    this.permissionChecker = new PermissionChecker(githubToken);
  }

  async forkRepository(
    originalOwner: string,
    originalName: string,
    options: ForkOptions = {}
  ): Promise<ForkResult> {
    try {
      // Check if we have permission to fork
      const permissionResult = await this.permissionChecker.checkRepositoryPermissions(
        originalOwner,
        originalName
      );

      if (!permissionResult.permissions.canFork) {
        return {
          success: false,
          forkUrl: '',
          forkOwner: '',
          forkName: '',
          originalRepo: `${originalOwner}/${originalName}`,
          message: 'Cannot fork repository - insufficient permissions',
          nextSteps: [
            'Repository may be private and you don\'t have access',
            'Contact the repository owner for access',
            'Use a different repository where you have permissions'
          ]
        };
      }

      // Check if fork already exists
      const currentUser = await this.permissionChecker.getCurrentUser();
      if (!currentUser) {
        return {
          success: false,
          forkUrl: '',
          forkOwner: '',
          forkName: '',
          originalRepo: `${originalOwner}/${originalName}`,
          message: 'GitHub authentication required for forking',
          nextSteps: [
            'Set up GitHub token: export GITHUB_TOKEN=your_token',
            'Ensure token has repo permissions',
            'Try the operation again'
          ]
        };
      }

      const targetOwner = options.organization || currentUser.login;
      const targetName = options.name || originalName;

      // Check if fork already exists
      const existingFork = await this.checkExistingFork(targetOwner, targetName, originalOwner, originalName);
      if (existingFork) {
        return {
          success: true,
          forkUrl: existingFork.forkUrl,
          forkOwner: targetOwner,
          forkName: targetName,
          originalRepo: `${originalOwner}/${originalName}`,
          message: 'Fork already exists',
          nextSteps: [
            'Fork is ready to use',
            'You can now create boxes in your fork',
            'Consider creating a pull request when ready'
          ]
        };
      }

      // Create the fork
      const forkResult = await this.createFork(originalOwner, originalName, options);
      
      if (forkResult.success) {
        // Wait a moment for GitHub to set up the fork
        await this.waitForForkReady(forkResult.forkOwner, forkResult.forkName);
      }

      return forkResult;

    } catch (error) {
      return {
        success: false,
        forkUrl: '',
        forkOwner: '',
        forkName: '',
        originalRepo: `${originalOwner}/${originalName}`,
        message: `Fork failed: ${error}`,
        nextSteps: [
          'Check your GitHub token permissions',
          'Verify the repository exists and is accessible',
          'Try again or use a different repository'
        ]
      };
    }
  }

  private async checkExistingFork(
    targetOwner: string,
    targetName: string,
    originalOwner: string,
    originalName: string
  ): Promise<{ forkUrl: string } | null> {
    try {
      const response = await fetch(`https://api.github.com/repos/${targetOwner}/${targetName}`, {
        headers: {
          'Authorization': `token ${this.getGitHubToken()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'qraft-cli'
        }
      });

      if (response.ok) {
        const data = await response.json() as any;
        
        // Check if this is actually a fork of the original repository
        if (data.fork && data.parent && data.parent.full_name === `${originalOwner}/${originalName}`) {
          return {
            forkUrl: data.html_url
          };
        }
      }
    } catch {
      // Ignore errors - fork doesn't exist
    }

    return null;
  }

  private async createFork(
    originalOwner: string,
    originalName: string,
    options: ForkOptions
  ): Promise<ForkResult> {
    const forkData: any = {};
    
    if (options.organization) {
      forkData.organization = options.organization;
    }
    
    if (options.name) {
      forkData.name = options.name;
    }
    
    if (options.defaultBranchOnly) {
      forkData.default_branch_only = true;
    }

    const response = await fetch(`https://api.github.com/repos/${originalOwner}/${originalName}/forks`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.getGitHubToken()}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'qraft-cli',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(forkData)
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
    }

    const data = await response.json() as any;

    return {
      success: true,
      forkUrl: data.html_url,
      forkOwner: data.owner.login,
      forkName: data.name,
      originalRepo: `${originalOwner}/${originalName}`,
      message: 'Repository forked successfully',
      nextSteps: [
        'Fork created and ready to use',
        'You can now create boxes in your fork',
        'Create a pull request when ready to contribute back'
      ]
    };
  }

  private async waitForForkReady(forkOwner: string, forkName: string, maxWaitTime = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 2000; // 2 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`https://api.github.com/repos/${forkOwner}/${forkName}`, {
          headers: {
            'Authorization': `token ${this.getGitHubToken()}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'qraft-cli'
          }
        });

        if (response.ok) {
          const data = await response.json() as any;
          // Check if the fork is ready (has content)
          if (!data.size || data.size === 0) {
            // Fork might still be setting up, wait a bit more
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            continue;
          }
          return; // Fork is ready
        }
      } catch {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Fork setup took too long, but it might still work
    console.warn('Fork setup took longer than expected, but it should be ready soon');
  }

  private getGitHubToken(): string {
    // Access the token through the permission checker
    if (!this.permissionChecker.hasGitHubToken()) {
      throw new Error('GitHub token required for forking operations');
    }
    
    // In a real implementation, we'd need to expose the token or use a different approach
    // For now, we'll assume the token is available through environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token not found in environment variables');
    }
    
    return token;
  }

  // Check if a repository can be forked
  async canForkRepository(owner: string, name: string): Promise<{
    canFork: boolean;
    reason: string;
    alternatives: string[];
  }> {
    try {
      const permissionResult = await this.permissionChecker.checkRepositoryPermissions(owner, name);
      
      if (!permissionResult.permissions.canFork) {
        return {
          canFork: false,
          reason: 'Insufficient permissions to fork repository',
          alternatives: [
            'Request access from repository owner',
            'Use a different public repository',
            'Create your own repository'
          ]
        };
      }

      if (!this.permissionChecker.hasGitHubToken()) {
        return {
          canFork: false,
          reason: 'GitHub authentication required',
          alternatives: [
            'Set up GitHub token',
            'Use GitHub CLI for authentication',
            'Fork manually through GitHub web interface'
          ]
        };
      }

      return {
        canFork: true,
        reason: 'Repository can be forked',
        alternatives: []
      };

    } catch (error) {
      return {
        canFork: false,
        reason: `Error checking fork permissions: ${error}`,
        alternatives: [
          'Verify repository exists',
          'Check your GitHub token',
          'Try a different repository'
        ]
      };
    }
  }

  // Get fork information for an existing fork
  async getForkInfo(forkOwner: string, forkName: string): Promise<{
    isFork: boolean;
    parentRepo?: string;
    isUpToDate?: boolean;
    behindBy?: number;
    aheadBy?: number;
  }> {
    try {
      const response = await fetch(`https://api.github.com/repos/${forkOwner}/${forkName}`, {
        headers: {
          'Authorization': `token ${this.getGitHubToken()}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'qraft-cli'
        }
      });

      if (!response.ok) {
        throw new Error('Repository not found or not accessible');
      }

      const data = await response.json() as any;

      if (!data.fork) {
        return {
          isFork: false
        };
      }

      // Get comparison with parent
      const parentRepo = data.parent.full_name;
      const compareResponse = await fetch(
        `https://api.github.com/repos/${parentRepo}/compare/${data.parent.default_branch}...${forkOwner}:${data.default_branch}`,
        {
          headers: {
            'Authorization': `token ${this.getGitHubToken()}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'qraft-cli'
          }
        }
      );

      let behindBy = 0;
      let aheadBy = 0;
      let isUpToDate = true;

      if (compareResponse.ok) {
        const compareData = await compareResponse.json() as any;
        behindBy = compareData.behind_by || 0;
        aheadBy = compareData.ahead_by || 0;
        isUpToDate = behindBy === 0 && aheadBy === 0;
      }

      return {
        isFork: true,
        parentRepo,
        isUpToDate,
        behindBy,
        aheadBy
      };

    } catch (error) {
      throw new Error(`Failed to get fork info: ${error}`);
    }
  }

  // Test method for dry-run forking
  async forkRepositoryDryRun(
    originalOwner: string,
    originalName: string,
    options: ForkOptions = {},
    mockUser = { login: 'testuser', name: 'Test User' }
  ): Promise<ForkResult> {
    const targetOwner = options.organization || mockUser.login;
    const targetName = options.name || originalName;

    return {
      success: true,
      forkUrl: `https://github.com/${targetOwner}/${targetName}`,
      forkOwner: targetOwner,
      forkName: targetName,
      originalRepo: `${originalOwner}/${originalName}`,
      message: '[DRY RUN] Repository would be forked successfully',
      nextSteps: [
        '[DRY RUN] Fork would be created and ready to use',
        '[DRY RUN] You could create boxes in your fork',
        '[DRY RUN] Create a pull request when ready to contribute back'
      ]
    };
  }
}
