import { Octokit } from '@octokit/rest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { BoxManifest } from '../types';
import { ManifestManager } from './manifestManager';
import { PermissionChecker } from './permissionChecker';
import { BoxMetadata, PullRequestCreator } from './pullRequestCreator';
import { RepositoryForker } from './repositoryForker';

export interface CreateBoxOptions {
  branch?: string;
  commitMessage?: string;
  createPR?: boolean;
  prTitle?: string;
  prDescription?: string;
}

export interface CreateBoxResult {
  success: boolean;
  message: string;
  boxPath: string;
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  nextSteps: string[];
}

export interface FileToUpload {
  path: string;
  content: string | Buffer;
  encoding?: 'utf-8' | 'base64';
}

export class RepositoryManager {
  private readonly githubToken?: string | undefined;
  private readonly permissionChecker: PermissionChecker;
  private readonly repositoryForker: RepositoryForker;
  private readonly pullRequestCreator: PullRequestCreator;
  private readonly manifestManager: ManifestManager;

  constructor(githubToken?: string | undefined) {
    this.githubToken = githubToken;
    this.permissionChecker = new PermissionChecker(githubToken);
    this.repositoryForker = new RepositoryForker(githubToken);
    this.pullRequestCreator = new PullRequestCreator(githubToken);
    this.manifestManager = new ManifestManager();
  }

  /**
   * Create a new box in a GitHub repository
   */
  async createBox(
    owner: string,
    repo: string,
    boxName: string,
    localPath: string,
    manifest: BoxManifest,
    options: CreateBoxOptions = {}
  ): Promise<CreateBoxResult> {
    try {
      if (!this.githubToken) {
        throw new Error('GitHub token required for creating boxes');
      }

      // Check permissions
      const permissions = await this.permissionChecker.checkRepositoryPermissions(owner, repo);
      
      if (!permissions.permissions.canWrite) {
        // User doesn't have write access, fork the repository
        const forkResult = await this.repositoryForker.forkRepository(owner, repo);
        
        if (!forkResult.success) {
          return {
            success: false,
            message: `Cannot create box: ${forkResult.message}`,
            boxPath: '',
            nextSteps: forkResult.nextSteps
          };
        }

        // Use the fork for creating the box
        return this.createBoxInRepository(
          forkResult.forkOwner,
          forkResult.forkName,
          boxName,
          localPath,
          manifest,
          { ...options, createPR: true }
        );
      }

      // User has write access, create directly
      return this.createBoxInRepository(owner, repo, boxName, localPath, manifest, options);

    } catch (error) {
      return {
        success: false,
        message: `Failed to create box: ${error instanceof Error ? error.message : 'Unknown error'}`,
        boxPath: '',
        nextSteps: [
          'Check your GitHub token permissions',
          'Verify the repository exists and you have access',
          'Try again or contact the repository owner'
        ]
      };
    }
  }

  /**
   * Create box in a specific repository (with write access)
   */
  private async createBoxInRepository(
    owner: string,
    repo: string,
    boxName: string,
    localPath: string,
    manifest: BoxManifest,
    options: CreateBoxOptions
  ): Promise<CreateBoxResult> {
    const octokit = new Octokit({
      auth: this.githubToken,
      userAgent: 'qraft-cli'
    });

    const boxPath = boxName;

    try {
      // Get the default branch if no branch specified
      let branch = options.branch;
      if (!branch) {
        const { data: repoData } = await octokit.rest.repos.get({
          owner,
          repo
        });
        branch = repoData.default_branch;
      }

      // Get the current commit SHA of the branch
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });

      const baseSha = refData.object.sha;

      // Get the base tree
      const { data: baseCommit } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: baseSha
      });

      // Collect all files to upload
      const filesToUpload = await this.collectFiles(localPath, boxPath);
      
      // Add manifest.json
      filesToUpload.push({
        path: `${boxPath}/manifest.json`,
        content: JSON.stringify(manifest, null, 2),
        encoding: 'utf-8'
      });

      // Create tree with all files
      const tree = filesToUpload.map(file => ({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        content: typeof file.content === 'string' ? file.content : file.content.toString('base64')
      }));

      const { data: newTree } = await octokit.rest.git.createTree({
        owner,
        repo,
        tree,
        base_tree: baseCommit.tree.sha
      });

      // Create commit
      const commitMessage = options.commitMessage || `Add ${boxName} box`;
      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseSha]
      });

      // Update the branch reference
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha
      });

      // Store local manifest copy after successful creation
      try {
        await this.storeLocalManifestCopy(localPath, manifest, `${owner}/${repo}`, boxName);
      } catch (manifestError) {
        // Log manifest storage error but don't fail the entire operation
        console.warn(`Warning: Failed to store local manifest copy: ${manifestError instanceof Error ? manifestError.message : 'Unknown error'}`);
      }

      const result: CreateBoxResult = {
        success: true,
        message: `Box '${boxName}' created successfully`,
        boxPath,
        commitSha: newCommit.sha,
        nextSteps: [
          `Box '${boxName}' is now available in the registry`,
          `You can download it using: qraft copy ${boxName}`,
          'Share the box with others by sharing the registry'
        ]
      };

      // Create PR if requested (for forks)
      if (options.createPR) {
        const boxMetadata: BoxMetadata = {
          name: manifest.name,
          description: manifest.description,
          tags: manifest.tags || [],
          fileCount: filesToUpload.length - 1, // Exclude manifest.json
          size: this.calculateTotalSize(filesToUpload)
        };

        const prOptions: any = {
          headBranch: branch
        };

        if (options.prTitle) {
          prOptions.title = options.prTitle;
        }

        if (options.prDescription) {
          prOptions.description = options.prDescription;
        }

        const prResult = await this.pullRequestCreator.createPullRequest(
          owner,
          repo,
          boxMetadata,
          prOptions
        );

        if (prResult.success) {
          result.prUrl = prResult.prUrl;
          result.prNumber = prResult.prNumber;
          result.nextSteps = [
            `Pull request created: ${prResult.prUrl}`,
            'Wait for review and approval',
            'Box will be available after PR is merged'
          ];
        }
      }

      return result;

    } catch (error) {
      return {
        success: false,
        message: `Failed to create box in repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
        boxPath,
        nextSteps: [
          'Check your GitHub token permissions',
          'Verify the repository exists and you have write access',
          'Ensure the branch exists',
          'Try again or contact the repository owner'
        ]
      };
    }
  }

  /**
   * Collect all files from local directory
   */
  private async collectFiles(localPath: string, boxPath: string): Promise<FileToUpload[]> {
    const files: FileToUpload[] = [];
    
    const scanDirectory = async (dirPath: string, relativePath: string = '') => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/');
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativeFilePath);
        } else if (entry.isFile()) {
          const content = await fs.readFile(fullPath);
          const isText = this.isTextFile(fullPath);
          
          files.push({
            path: `${boxPath}/${relativeFilePath}`,
            content: isText ? content.toString('utf-8') : content,
            encoding: isText ? 'utf-8' : 'base64'
          });
        }
      }
    };

    await scanDirectory(localPath);
    return files;
  }

  /**
   * Check if a file is a text file
   */
  private isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.sass',
      '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
      '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
      '.rs', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.dockerfile',
      '.gitignore', '.gitattributes', '.editorconfig', '.eslintrc', '.prettierrc'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext) || path.basename(filePath).startsWith('.');
  }

  /**
   * Calculate total size of files
   */
  private calculateTotalSize(files: FileToUpload[]): string {
    const totalBytes = files.reduce((sum, file) => {
      const size = typeof file.content === 'string'
        ? Buffer.byteLength(file.content, 'utf-8')
        : file.content.length;
      return sum + size;
    }, 0);

    if (totalBytes < 1024) return `${totalBytes}B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)}KB`;
    return `${(totalBytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Store local manifest copy after box creation
   * @param localPath Local path where the box was created from
   * @param manifest Box manifest
   * @param registry Registry identifier (owner/repo)
   * @param boxName Box name
   * @returns Promise<void>
   */
  private async storeLocalManifestCopy(
    localPath: string,
    manifest: BoxManifest,
    registry: string,
    boxName: string
  ): Promise<void> {
    try {
      // Store the manifest with source information
      await this.manifestManager.storeLocalManifest(
        localPath,
        manifest,
        registry,
        `${registry}/${boxName}`
      );
    } catch (error) {
      throw new Error(`Failed to store local manifest copy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get manifest manager instance
   * @returns ManifestManager Manifest manager instance
   */
  getManifestManager(): ManifestManager {
    return this.manifestManager;
  }
}
