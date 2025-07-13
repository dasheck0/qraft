import chalk from 'chalk';
import * as readline from 'readline';

export type ConfirmationChoice = 'yes' | 'no' | 'cancel';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ConfirmationOptions {
  title?: string;
  message: string;
  details?: string[];
  warningLevel?: 'info' | 'warning' | 'danger';
  defaultChoice?: boolean;
  requireExplicitConfirmation?: boolean;
  showAlternatives?: boolean;
  alternatives?: string[];
}

export interface ConfirmationResult {
  confirmed: boolean;
  choice: ConfirmationChoice;
  timestamp: number;
}

export interface SensitiveFileWarning {
  file: string;
  reason: string;
  severity: SeverityLevel;
  suggestions: string[];
}

export interface ConflictWarning {
  type: 'overwrite' | 'merge' | 'version_conflict';
  description: string;
  affectedFiles: string[];
  riskLevel: RiskLevel;
  recommendations: string[];
}

export class ConfirmationWorkflows {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async confirmSensitiveFiles(warnings: SensitiveFileWarning[]): Promise<ConfirmationResult> {
    console.log(chalk.red('\n🚨 Sensitive Files Detected'));
    console.log(chalk.gray('─'.repeat(50)));

    warnings.forEach((warning, index) => {
      const severityColor = this.getSeverityColor(warning.severity);
      const severityIcon = this.getSeverityIcon(warning.severity);
      
      console.log(`\n${index + 1}. ${severityColor(`${severityIcon} ${warning.file}`)}`);
      console.log(`   ${chalk.gray('Reason:')} ${warning.reason}`);
      console.log(`   ${chalk.gray('Severity:')} ${severityColor(warning.severity.toUpperCase())}`);
      
      if (warning.suggestions.length > 0) {
        console.log(`   ${chalk.gray('Suggestions:')}`);
        warning.suggestions.forEach(suggestion => {
          console.log(`   ${chalk.gray('•')} ${suggestion}`);
        });
      }
    });

    console.log(chalk.gray('\n─'.repeat(50)));
    
    const criticalCount = warnings.filter(w => w.severity === 'critical').length;
    const highCount = warnings.filter(w => w.severity === 'high').length;
    
    let message = `Found ${warnings.length} sensitive file(s)`;
    if (criticalCount > 0) {
      message += ` (${criticalCount} critical)`;
    }
    if (highCount > 0) {
      message += ` (${highCount} high risk)`;
    }

    const options: ConfirmationOptions = {
      title: 'Sensitive Files Warning',
      message,
      warningLevel: criticalCount > 0 ? 'danger' : highCount > 0 ? 'warning' : 'info',
      defaultChoice: false,
      requireExplicitConfirmation: criticalCount > 0,
      showAlternatives: true,
      alternatives: [
        'Review and remove sensitive files',
        'Add files to .gitignore',
        'Use a different source directory',
        'Continue with caution (not recommended)'
      ]
    };

    return this.showConfirmation(options);
  }

  async confirmConflictResolution(conflicts: ConflictWarning[]): Promise<ConfirmationResult> {
    console.log(chalk.yellow('\n⚠️  Conflicts Detected'));
    console.log(chalk.gray('─'.repeat(50)));

    conflicts.forEach((conflict, index) => {
      const riskColor = this.getRiskColor(conflict.riskLevel);
      const riskIcon = this.getRiskIcon(conflict.riskLevel);
      
      console.log(`\n${index + 1}. ${riskColor(`${riskIcon} ${conflict.type.replace('_', ' ').toUpperCase()}`)}`);
      console.log(`   ${chalk.gray('Description:')} ${conflict.description}`);
      console.log(`   ${chalk.gray('Risk Level:')} ${riskColor(conflict.riskLevel.toUpperCase())}`);
      console.log(`   ${chalk.gray('Affected Files:')} ${conflict.affectedFiles.length} file(s)`);
      
      if (conflict.affectedFiles.length <= 5) {
        conflict.affectedFiles.forEach(file => {
          console.log(`   ${chalk.gray('•')} ${file}`);
        });
      } else {
        conflict.affectedFiles.slice(0, 3).forEach(file => {
          console.log(`   ${chalk.gray('•')} ${file}`);
        });
        console.log(`   ${chalk.gray('•')} ... and ${conflict.affectedFiles.length - 3} more`);
      }
      
      if (conflict.recommendations.length > 0) {
        console.log(`   ${chalk.gray('Recommendations:')}`);
        conflict.recommendations.forEach(rec => {
          console.log(`   ${chalk.gray('•')} ${rec}`);
        });
      }
    });

    console.log(chalk.gray('\n─'.repeat(50)));
    
    const criticalCount = conflicts.filter(c => c.riskLevel === 'critical').length;
    const highCount = conflicts.filter(c => c.riskLevel === 'high').length;
    
    let message = `Found ${conflicts.length} conflict(s)`;
    if (criticalCount > 0) {
      message += ` (${criticalCount} critical)`;
    }
    if (highCount > 0) {
      message += ` (${highCount} high risk)`;
    }

    const options: ConfirmationOptions = {
      title: 'Conflict Resolution',
      message,
      warningLevel: criticalCount > 0 ? 'danger' : highCount > 0 ? 'warning' : 'info',
      defaultChoice: criticalCount === 0,
      requireExplicitConfirmation: criticalCount > 0,
      showAlternatives: true,
      alternatives: [
        'Review conflicts manually',
        'Use backup and replace strategy',
        'Skip conflicting files',
        'Cancel operation'
      ]
    };

    return this.showConfirmation(options);
  }

  async confirmRepositoryOperation(
    operation: 'fork' | 'create_pr' | 'push' | 'overwrite',
    details: {
      repository: string;
      branch?: string;
      description?: string;
      impact?: string[];
    }
  ): Promise<ConfirmationResult> {
    const operationTitles = {
      fork: '🍴 Fork Repository',
      create_pr: '📝 Create Pull Request',
      push: '📤 Push Changes',
      overwrite: '⚠️  Overwrite Existing Box'
    };

    const operationMessages = {
      fork: `Fork repository ${details.repository} to your account`,
      create_pr: `Create pull request in ${details.repository}`,
      push: `Push changes to ${details.repository}${details.branch ? ` (${details.branch})` : ''}`,
      overwrite: `Overwrite existing box in ${details.repository}`
    };

    console.log(chalk.cyan(`\n${operationTitles[operation]}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.yellow('Operation:')} ${operationMessages[operation]}`);
    
    if (details.description) {
      console.log(`${chalk.yellow('Description:')} ${details.description}`);
    }
    
    if (details.impact && details.impact.length > 0) {
      console.log(`${chalk.yellow('Impact:')}`);
      details.impact.forEach(item => {
        console.log(`  ${chalk.gray('•')} ${item}`);
      });
    }

    const options: ConfirmationOptions = {
      title: operationTitles[operation],
      message: operationMessages[operation],
      warningLevel: operation === 'overwrite' ? 'warning' : 'info',
      defaultChoice: operation !== 'overwrite',
      requireExplicitConfirmation: operation === 'overwrite'
    };

    return this.showConfirmation(options);
  }

  async confirmDryRunResults(
    summary: {
      operation: string;
      filesAffected: number;
      estimatedTime: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      warnings: string[];
    }
  ): Promise<ConfirmationResult> {
    console.log(chalk.cyan('\n📋 Operation Preview'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.yellow('Operation:')} ${summary.operation}`);
    console.log(`${chalk.yellow('Files Affected:')} ${summary.filesAffected}`);
    console.log(`${chalk.yellow('Estimated Time:')} ${summary.estimatedTime}`);
    
    const riskColor = this.getRiskColor(summary.riskLevel);
    console.log(`${chalk.yellow('Risk Level:')} ${riskColor(summary.riskLevel.toUpperCase())}`);
    
    if (summary.warnings.length > 0) {
      console.log(`${chalk.yellow('Warnings:')}`);
      summary.warnings.forEach(warning => {
        console.log(`  ${chalk.red('⚠')} ${warning}`);
      });
    }

    const options: ConfirmationOptions = {
      title: 'Confirm Operation',
      message: `Proceed with ${summary.operation.toLowerCase()}?`,
      warningLevel: summary.riskLevel === 'critical' ? 'danger' : 
                   summary.riskLevel === 'high' ? 'warning' : 'info',
      defaultChoice: summary.riskLevel !== 'critical',
      requireExplicitConfirmation: summary.riskLevel === 'critical'
    };

    return this.showConfirmation(options);
  }

  private async showConfirmation(options: ConfirmationOptions): Promise<ConfirmationResult> {
    console.log(chalk.gray('\n─'.repeat(50)));
    
    if (options.details && options.details.length > 0) {
      options.details.forEach(detail => {
        console.log(`${chalk.gray('•')} ${detail}`);
      });
      console.log();
    }

    if (options.showAlternatives && options.alternatives && options.alternatives.length > 0) {
      console.log(chalk.cyan('Alternatives:'));
      options.alternatives.forEach((alt, index) => {
        console.log(`  ${chalk.gray(`${index + 1}.`)} ${alt}`);
      });
      console.log();
    }

    const warningColor = this.getWarningColor(options.warningLevel || 'info');
    const prompt = options.requireExplicitConfirmation 
      ? 'Type "yes" to confirm, or "no" to cancel'
      : options.defaultChoice 
        ? 'Continue? (Y/n)'
        : 'Continue? (y/N)';

    console.log(warningColor(`${options.message}`));
    const answer = await this.question(`${prompt}: `);

    let confirmed = false;
    let choice: 'yes' | 'no' | 'cancel' = 'cancel';

    if (options.requireExplicitConfirmation) {
      if (answer.toLowerCase() === 'yes') {
        confirmed = true;
        choice = 'yes';
      } else if (answer.toLowerCase() === 'no') {
        confirmed = false;
        choice = 'no';
      } else {
        confirmed = false;
        choice = 'cancel';
      }
    } else {
      const input = answer.trim().toLowerCase();
      if (!input) {
        confirmed = options.defaultChoice || false;
        choice = confirmed ? 'yes' : 'no';
      } else if (input === 'y' || input === 'yes') {
        confirmed = true;
        choice = 'yes';
      } else if (input === 'n' || input === 'no') {
        confirmed = false;
        choice = 'no';
      } else {
        confirmed = false;
        choice = 'cancel';
      }
    }

    this.close();

    return {
      confirmed,
      choice,
      timestamp: Date.now()
    };
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  private getSeverityColor(severity: string): (text: string) => string {
    switch (severity) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.blue;
      default: return chalk.gray;
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🔵';
      default: return '⚪';
    }
  }

  private getRiskColor(risk: string): (text: string) => string {
    switch (risk) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.green;
      default: return chalk.gray;
    }
  }

  private getRiskIcon(risk: string): string {
    switch (risk) {
      case 'critical': return '💀';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return '✅';
      default: return 'ℹ️';
    }
  }

  private getWarningColor(level: string): (text: string) => string {
    switch (level) {
      case 'danger': return chalk.red.bold;
      case 'warning': return chalk.yellow;
      case 'info': return chalk.cyan;
      default: return chalk.white;
    }
  }

  close(): void {
    this.rl.close();
  }

  // Test helper methods
  async confirmationDryRun(
    _type: 'sensitive' | 'conflict' | 'repository' | 'dryrun',
    mockChoice: ConfirmationChoice = 'yes'
  ): Promise<ConfirmationResult> {
    return {
      confirmed: mockChoice === 'yes',
      choice: mockChoice,
      timestamp: Date.now()
    };
  }
}
