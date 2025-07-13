import chalk from 'chalk';

export interface ProgressStep {
  id: string;
  name: string;
  description?: string | undefined;
  weight?: number | undefined; // Relative weight for progress calculation
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number | undefined;
  endTime?: number | undefined;
  error?: string | undefined;
}

export interface ProgressOptions {
  showPercentage?: boolean | undefined;
  showElapsed?: boolean | undefined;
  showETA?: boolean | undefined;
  showStepDetails?: boolean | undefined;
  clearOnComplete?: boolean | undefined;
  spinnerChars?: string[] | undefined;
  updateInterval?: number | undefined;
}

export class ProgressIndicator {
  private steps: ProgressStep[] = [];
  private currentStepIndex: number = -1;
  private startTime: number = 0;
  private spinnerIndex: number = 0;
  private intervalId?: NodeJS.Timeout | undefined;
  private options: Required<ProgressOptions>;

  constructor(options: ProgressOptions = {}) {
    this.options = {
      showPercentage: true,
      showElapsed: true,
      showETA: true,
      showStepDetails: true,
      clearOnComplete: false,
      spinnerChars: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      updateInterval: 100,
      ...options
    };
  }

  addStep(step: Omit<ProgressStep, 'status' | 'startTime' | 'endTime'>): void {
    this.steps.push({
      ...step,
      status: 'pending',
      weight: step.weight || 1
    });
  }

  addSteps(steps: Omit<ProgressStep, 'status' | 'startTime' | 'endTime'>[]): void {
    steps.forEach(step => this.addStep(step));
  }

  start(): void {
    this.startTime = Date.now();
    this.currentStepIndex = -1;
    this.render();
    this.startSpinner();
  }

  nextStep(): void {
    // Complete current step if running
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep.status === 'running') {
        currentStep.status = 'completed';
        currentStep.endTime = Date.now();
      }
    }

    // Move to next step
    this.currentStepIndex++;
    if (this.currentStepIndex < this.steps.length) {
      const nextStep = this.steps[this.currentStepIndex];
      nextStep.status = 'running';
      nextStep.startTime = Date.now();
    }

    this.render();
  }

  completeStep(stepId?: string, success: boolean = true): void {
    let step: ProgressStep | undefined;
    
    if (stepId) {
      step = this.steps.find(s => s.id === stepId);
    } else if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      step = this.steps[this.currentStepIndex];
    }

    if (step) {
      step.status = success ? 'completed' : 'failed';
      step.endTime = Date.now();
      this.render();
    }
  }

  failStep(stepId?: string, error?: string): void {
    let step: ProgressStep | undefined;
    
    if (stepId) {
      step = this.steps.find(s => s.id === stepId);
    } else if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      step = this.steps[this.currentStepIndex];
    }

    if (step) {
      step.status = 'failed';
      step.endTime = Date.now();
      step.error = error;
      this.render();
    }
  }

  skipStep(stepId?: string, reason?: string): void {
    let step: ProgressStep | undefined;
    
    if (stepId) {
      step = this.steps.find(s => s.id === stepId);
    } else if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      step = this.steps[this.currentStepIndex];
    }

    if (step) {
      step.status = 'skipped';
      step.endTime = Date.now();
      step.error = reason;
      this.render();
    }
  }

  complete(): void {
    // Complete any remaining running step
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep.status === 'running') {
        currentStep.status = 'completed';
        currentStep.endTime = Date.now();
      }
    }

    this.stopSpinner();
    this.render();

    if (this.options.clearOnComplete) {
      this.clear();
    }
  }

  private render(): void {
    if (!process.stdout.isTTY) return;

    this.clear();

    const progress = this.calculateProgress();
    const elapsed = Date.now() - this.startTime;
    const eta = this.calculateETA(progress, elapsed);

    // Progress bar
    const barWidth = 30;
    const filledWidth = Math.round(barWidth * progress);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

    let output = '';

    // Main progress line
    output += chalk.cyan('Progress: ');
    output += chalk.green(`[${progressBar}]`);

    if (this.options.showPercentage) {
      output += chalk.yellow(` ${(progress * 100).toFixed(1)}%`);
    }

    if (this.options.showElapsed) {
      output += chalk.gray(` | Elapsed: ${this.formatTime(elapsed)}`);
    }

    if (this.options.showETA && eta > 0) {
      output += chalk.gray(` | ETA: ${this.formatTime(eta)}`);
    }

    output += '\n';

    // Current step with spinner
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      const spinner = currentStep.status === 'running' ? (this.options.spinnerChars?.[this.spinnerIndex] || '') : '';
      output += chalk.blue(`${spinner} ${currentStep.name}`);
      if (currentStep.description) {
        output += chalk.gray(` - ${currentStep.description}`);
      }
      output += '\n';
    }

    // Step details
    if (this.options.showStepDetails) {
      this.steps.forEach((step, index) => {
        const icon = this.getStepIcon(step.status);
        const color = this.getStepColor(step.status);
        const prefix = index === this.currentStepIndex ? '→ ' : '  ';
        
        output += `${prefix}${color(icon)} ${color(step.name)}`;
        
        if (step.status === 'failed' && step.error) {
          output += chalk.red(` (${step.error})`);
        } else if (step.status === 'skipped' && step.error) {
          output += chalk.yellow(` (${step.error})`);
        }
        
        output += '\n';
      });
    }

    process.stdout.write(output);
  }

  private calculateProgress(): number {
    const totalWeight = this.steps.reduce((sum, step) => sum + (step.weight || 1), 0);
    const completedWeight = this.steps
      .filter(step => step.status === 'completed')
      .reduce((sum, step) => sum + (step.weight || 1), 0);
    
    // Add partial progress for current running step
    let runningWeight = 0;
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep.status === 'running' && currentStep.startTime) {
        // Assume 50% progress for running step (could be more sophisticated)
        runningWeight = (currentStep.weight || 1) * 0.5;
      }
    }

    return totalWeight > 0 ? (completedWeight + runningWeight) / totalWeight : 0;
  }

  private calculateETA(progress: number, elapsed: number): number {
    if (progress <= 0) return 0;
    const totalEstimated = elapsed / progress;
    return Math.max(0, totalEstimated - elapsed);
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private getStepIcon(status: ProgressStep['status']): string {
    switch (status) {
      case 'pending': return '○';
      case 'running': return '●';
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'skipped': return '⊘';
      default: return '○';
    }
  }

  private getStepColor(status: ProgressStep['status']): (text: string) => string {
    switch (status) {
      case 'pending': return chalk.gray;
      case 'running': return chalk.blue;
      case 'completed': return chalk.green;
      case 'failed': return chalk.red;
      case 'skipped': return chalk.yellow;
      default: return chalk.gray;
    }
  }

  private startSpinner(): void {
    this.intervalId = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % (this.options.spinnerChars?.length || 1);
      this.render();
    }, this.options.updateInterval);
  }

  private stopSpinner(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private clear(): void {
    if (!process.stdout.isTTY) return;
    
    // Clear previous output
    const linesToClear = this.options.showStepDetails ? this.steps.length + 3 : 3;
    for (let i = 0; i < linesToClear; i++) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
    }
    process.stdout.write('\x1b[1G'); // Move to beginning of line
  }

  // Get summary of completed operations
  getSummary(): {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    duration: number;
    success: boolean;
  } {
    const total = this.steps.length;
    const completed = this.steps.filter(s => s.status === 'completed').length;
    const failed = this.steps.filter(s => s.status === 'failed').length;
    const skipped = this.steps.filter(s => s.status === 'skipped').length;
    const duration = Date.now() - this.startTime;
    const success = failed === 0 && completed + skipped === total;

    return { total, completed, failed, skipped, duration, success };
  }

  // Display final summary
  displaySummary(): void {
    const summary = this.getSummary();
    
    console.log(chalk.cyan('\n📊 Operation Summary:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`${chalk.yellow('Total Steps:')} ${summary.total}`);
    console.log(`${chalk.green('Completed:')} ${summary.completed}`);
    
    if (summary.failed > 0) {
      console.log(`${chalk.red('Failed:')} ${summary.failed}`);
    }
    
    if (summary.skipped > 0) {
      console.log(`${chalk.yellow('Skipped:')} ${summary.skipped}`);
    }
    
    console.log(`${chalk.blue('Duration:')} ${this.formatTime(summary.duration)}`);
    console.log(`${chalk.cyan('Status:')} ${summary.success ? chalk.green('Success') : chalk.red('Failed')}`);
    console.log(chalk.gray('─'.repeat(40)));
  }

  // Test helper methods
  getSteps(): ProgressStep[] {
    return [...this.steps];
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getStartTime(): number {
    return this.startTime;
  }

  // Simulate progress for testing
  simulateProgress(stepId: string, _progressPercent: number): void {
    const step = this.steps.find(s => s.id === stepId);
    if (step && step.status === 'running') {
      // This is a simplified simulation - in real use, progress would be tracked differently
      this.render();
    }
  }
}
