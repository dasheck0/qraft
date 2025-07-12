import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfirmationWorkflows, ConflictWarning, SensitiveFileWarning } from '../interactive/confirmationWorkflows';
import { MetadataOverrideOptions, MetadataOverrides } from '../interactive/metadataOverrides';
import { MetadataPromptOptions } from '../interactive/metadataPrompts';
import { ProgressIndicator } from '../interactive/progressIndicator';

export interface CreateWorkflowOptions {
  sourcePath: string;
  boxName?: string;
  targetRepository?: string;
  targetBranch?: string;
  interactive?: boolean;
  skipSensitiveCheck?: boolean;
  skipConflictCheck?: boolean;
  forceDefaults?: boolean;
  dryRun?: boolean;
  customDefaults?: Partial<MetadataPromptOptions>;
  outputPath?: string;
}

export interface CreateWorkflowResult {
  success: boolean;
  boxName: string;
  metadata: MetadataPromptOptions;
  filesProcessed: number;
  warnings: string[];
  errors: string[];
  outputPath?: string;
  duration: number;
  skipped: string[];
}

export interface WorkflowStep {
  name: string;
  description: string;
  weight: number;
  required: boolean;
}

export class CreateWorkflow {
  private readonly metadataOverrides: MetadataOverrides;
  private readonly confirmationWorkflows: ConfirmationWorkflows;
  private readonly progressIndicator: ProgressIndicator;

  constructor() {
    this.metadataOverrides = new MetadataOverrides();
    this.confirmationWorkflows = new ConfirmationWorkflows();
    this.progressIndicator = new ProgressIndicator();
  }

  async execute(options: CreateWorkflowOptions): Promise<CreateWorkflowResult> {
    const startTime = Date.now();
    const result: CreateWorkflowResult = {
      success: false,
      boxName: options.boxName || path.basename(options.sourcePath),
      metadata: {} as MetadataPromptOptions,
      filesProcessed: 0,
      warnings: [],
      errors: [],
      duration: 0,
      skipped: []
    };

    try {
      console.log(chalk.cyan('\n🚀 Starting box creation workflow...'));
      console.log(chalk.gray(`Source: ${options.sourcePath}`));
      console.log(chalk.gray(`Target: ${options.targetRepository || 'local'}`));
      
      // Initialize progress tracking
      this.progressIndicator.start();

      // Step 1: Validate source path
      await this.executeStep('validate-source', async () => {
        await this.validateSourcePath(options.sourcePath);
      });

      // Step 2: Collect metadata with smart defaults
      await this.executeStep('collect-metadata', async () => {
        const metadataOptions: MetadataOverrideOptions = {
          sourcePath: options.sourcePath,
          ...(options.targetRepository && { targetRepository: options.targetRepository }),
          ...(options.targetBranch && { targetBranch: options.targetBranch }),
          ...(options.interactive !== undefined && { interactive: options.interactive }),
          ...(options.skipSensitiveCheck !== undefined && { skipSensitiveCheck: options.skipSensitiveCheck }),
          ...(options.skipConflictCheck !== undefined && { skipConflictCheck: options.skipConflictCheck }),
          ...(options.forceDefaults !== undefined && { forceDefaults: options.forceDefaults }),
          ...(options.customDefaults && { customDefaults: options.customDefaults })
        };

        result.metadata = await this.metadataOverrides.collectMetadataWithDefaults(metadataOptions);
        result.boxName = result.metadata.name || result.boxName;
      });

      // Step 3: Analyze source files (sensitive file detection)
      if (!options.skipSensitiveCheck) {
        await this.executeStep('analyze-sensitive-files', async () => {
          const sensitiveFiles = await this.detectSensitiveFiles(options.sourcePath);
          if (sensitiveFiles.length > 0) {
            const confirmation = await this.confirmationWorkflows.confirmSensitiveFiles(sensitiveFiles);
            if (!confirmation.confirmed) {
              throw new Error('Operation cancelled due to sensitive files');
            }
            result.warnings.push(`${sensitiveFiles.length} sensitive file(s) detected but proceeding as confirmed`);
          }
        });
      } else {
        this.progressIndicator.skipStep('analyze-sensitive-files', 'Skipped by user option');
        result.skipped.push('Sensitive file analysis');
      }

      // Step 4: Check for conflicts
      if (!options.skipConflictCheck && options.targetRepository) {
        await this.executeStep('check-conflicts', async () => {
          const conflicts = await this.detectConflicts(options.sourcePath, options.targetRepository!);
          if (conflicts.length > 0) {
            const confirmation = await this.confirmationWorkflows.confirmConflictResolution(conflicts);
            if (!confirmation.confirmed) {
              throw new Error('Operation cancelled due to conflicts');
            }
            result.warnings.push(`${conflicts.length} conflict(s) detected but proceeding as confirmed`);
          }
        });
      } else {
        this.progressIndicator.skipStep('check-conflicts', 'Skipped - no target repository or disabled by user');
        result.skipped.push('Conflict detection');
      }

      // Step 5: Dry run preview (if requested)
      if (options.dryRun) {
        await this.executeStep('dry-run-preview', async () => {
          const dryRunSummary = await this.generateDryRunSummary(options, result);
          const confirmation = await this.confirmationWorkflows.confirmDryRunResults(dryRunSummary);
          if (!confirmation.confirmed) {
            throw new Error('Operation cancelled after dry run preview');
          }
        });
      } else {
        this.progressIndicator.skipStep('dry-run-preview', 'Dry run not requested');
        result.skipped.push('Dry run preview');
      }

      // Step 6: Process files
      await this.executeStep('process-files', async () => {
        result.filesProcessed = await this.processFiles(options.sourcePath, result.metadata, options.outputPath);
      });

      // Step 7: Generate box metadata file
      await this.executeStep('generate-metadata', async () => {
        await this.generateBoxMetadata(result.metadata, options.outputPath || options.sourcePath);
      });

      // Step 8: Finalize and cleanup
      await this.executeStep('finalize', async () => {
        result.outputPath = options.outputPath || options.sourcePath;
        await this.finalizeBox(result);
      });

      result.success = true;
      result.duration = Date.now() - startTime;

      // Show completion summary
      this.showCompletionSummary(result);

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));
      
      this.progressIndicator.failStep(error instanceof Error ? error.message : String(error));
      console.error(chalk.red('\n❌ Box creation failed:'), error instanceof Error ? error.message : String(error));
    } finally {
      this.progressIndicator.complete();
      this.confirmationWorkflows.close();
    }

    return result;
  }

  private async executeStep(_stepName: string, operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.progressIndicator.failStep(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async validateSourcePath(sourcePath: string): Promise<void> {
    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isDirectory()) {
        throw new Error(`Source path must be a directory: ${sourcePath}`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }
      throw error;
    }
  }

  private async detectSensitiveFiles(_sourcePath: string): Promise<SensitiveFileWarning[]> {
    // Mock implementation - in real implementation, this would use SensitiveFileDetector
    const warnings: SensitiveFileWarning[] = [];

    // This is a simplified implementation for demonstration
    // Real implementation would recursively scan files and match patterns

    return warnings;
  }

  private async detectConflicts(_sourcePath: string, _targetRepository: string): Promise<ConflictWarning[]> {
    // Mock implementation - in real implementation, this would use ConflictDetector
    const conflicts: ConflictWarning[] = [];

    // This is a simplified implementation for demonstration
    // Real implementation would compare with target repository

    return conflicts;
  }

  private async generateDryRunSummary(options: CreateWorkflowOptions, result: Partial<CreateWorkflowResult>) {
    const fileCount = await this.countFiles(options.sourcePath);
    
    return {
      operation: `Create box "${result.boxName}"`,
      filesAffected: fileCount,
      estimatedTime: this.estimateProcessingTime(fileCount),
      riskLevel: this.assessRiskLevel(result.warnings || []),
      warnings: result.warnings || []
    };
  }

  private async countFiles(sourcePath: string): Promise<number> {
    // Simplified file counting - real implementation would recursively count files
    try {
      const entries = await fs.readdir(sourcePath);
      return entries.length;
    } catch {
      return 0;
    }
  }

  private estimateProcessingTime(fileCount: number): string {
    const secondsPerFile = 0.1;
    const totalSeconds = Math.max(1, Math.round(fileCount * secondsPerFile));
    
    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
    } else {
      const minutes = Math.round(totalSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
  }

  private assessRiskLevel(warnings: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (warnings.some(w => w.includes('critical'))) return 'critical';
    if (warnings.some(w => w.includes('sensitive'))) return 'high';
    if (warnings.length > 0) return 'medium';
    return 'low';
  }

  private async processFiles(sourcePath: string, _metadata: MetadataPromptOptions, _outputPath?: string): Promise<number> {
    // Mock implementation - real implementation would copy/process files
    const fileCount = await this.countFiles(sourcePath);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, fileCount * 10)));

    return fileCount;
  }

  private async generateBoxMetadata(metadata: MetadataPromptOptions, outputPath: string): Promise<void> {
    const metadataFile = path.join(outputPath, 'box.json');
    const boxMetadata = {
      ...metadata,
      createdAt: new Date().toISOString(),
      version: metadata.version || '1.0.0'
    };
    
    await fs.writeFile(metadataFile, JSON.stringify(boxMetadata, null, 2));
  }

  private async finalizeBox(_result: CreateWorkflowResult): Promise<void> {
    // Mock implementation - real implementation would handle final steps
    // like creating git repository, pushing to remote, etc.
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private showCompletionSummary(result: CreateWorkflowResult): void {
    console.log(chalk.green('\n✅ Box creation completed successfully!'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.yellow('Box Name:')} ${result.boxName}`);
    console.log(`${chalk.yellow('Files Processed:')} ${result.filesProcessed}`);
    console.log(`${chalk.yellow('Duration:')} ${(result.duration / 1000).toFixed(1)}s`);

    if (result.warnings.length > 0) {
      console.log(`${chalk.yellow('Warnings:')} ${result.warnings.length}`);
      result.warnings.forEach(warning => {
        console.log(`  ${chalk.yellow('⚠')} ${warning}`);
      });
    }

    if (result.skipped.length > 0) {
      console.log(`${chalk.gray('Skipped:')} ${result.skipped.join(', ')}`);
    }

    if (result.outputPath) {
      console.log(`${chalk.yellow('Output:')} ${result.outputPath}`);
    }

    console.log(chalk.gray('─'.repeat(50)));
  }

  // Test helper methods
  async workflowDryRun(options: CreateWorkflowOptions): Promise<CreateWorkflowResult> {
    return this.execute({ ...options, dryRun: true });
  }

  async validateWorkflowOptions(options: CreateWorkflowOptions): Promise<boolean> {
    try {
      await this.validateSourcePath(options.sourcePath);
      return true;
    } catch {
      return false;
    }
  }
}
