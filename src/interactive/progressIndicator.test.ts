import { ProgressIndicator } from './progressIndicator';

// Mock process.stdout for testing
const mockStdout = {
  isTTY: true,
  write: jest.fn()
};

// Store original stdout
const originalStdout = process.stdout;

describe('ProgressIndicator', () => {
  let progressIndicator: ProgressIndicator;

  beforeEach(() => {
    // Mock stdout
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      writable: true
    });
    mockStdout.write.mockClear();

    progressIndicator = new ProgressIndicator({
      updateInterval: 10, // Fast updates for testing
      showStepDetails: true
    });
  });

  afterEach(() => {
    // Restore original stdout
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true
    });
  });

  describe('step management', () => {
    it('should add single step', () => {
      progressIndicator.addStep({
        id: 'step1',
        name: 'Test Step',
        description: 'A test step'
      });

      const steps = progressIndicator.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0].id).toBe('step1');
      expect(steps[0].name).toBe('Test Step');
      expect(steps[0].status).toBe('pending');
      expect(steps[0].weight).toBe(1);
    });

    it('should add multiple steps', () => {
      const steps = [
        { id: 'step1', name: 'Step 1', weight: 2 },
        { id: 'step2', name: 'Step 2', weight: 3 },
        { id: 'step3', name: 'Step 3' }
      ];

      progressIndicator.addSteps(steps);

      const addedSteps = progressIndicator.getSteps();
      expect(addedSteps).toHaveLength(3);
      expect(addedSteps[0].weight).toBe(2);
      expect(addedSteps[1].weight).toBe(3);
      expect(addedSteps[2].weight).toBe(1); // Default weight
    });

    it('should set custom weight for steps', () => {
      progressIndicator.addStep({
        id: 'heavy-step',
        name: 'Heavy Step',
        weight: 5
      });

      const steps = progressIndicator.getSteps();
      expect(steps[0].weight).toBe(5);
    });
  });

  describe('progress tracking', () => {
    beforeEach(() => {
      progressIndicator.addSteps([
        { id: 'step1', name: 'Step 1' },
        { id: 'step2', name: 'Step 2' },
        { id: 'step3', name: 'Step 3' }
      ]);
    });

    it('should start with no current step', () => {
      expect(progressIndicator.getCurrentStepIndex()).toBe(-1);
    });

    it('should track start time when started', () => {
      const beforeStart = Date.now();
      progressIndicator.start();
      const afterStart = Date.now();

      const startTime = progressIndicator.getStartTime();
      expect(startTime).toBeGreaterThanOrEqual(beforeStart);
      expect(startTime).toBeLessThanOrEqual(afterStart);
    });

    it('should advance to next step', () => {
      progressIndicator.start();
      progressIndicator.nextStep();

      expect(progressIndicator.getCurrentStepIndex()).toBe(0);
      
      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('running');
      expect(steps[0].startTime).toBeDefined();
    });

    it('should complete current step when advancing', () => {
      progressIndicator.start();
      progressIndicator.nextStep(); // Start step 1
      progressIndicator.nextStep(); // Complete step 1, start step 2

      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('completed');
      expect(steps[0].endTime).toBeDefined();
      expect(steps[1].status).toBe('running');
      expect(progressIndicator.getCurrentStepIndex()).toBe(1);
    });

    it('should complete step by ID', () => {
      progressIndicator.start();
      progressIndicator.nextStep(); // Start step 1

      progressIndicator.completeStep('step1');

      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('completed');
      expect(steps[0].endTime).toBeDefined();
    });

    it('should fail step with error', () => {
      progressIndicator.start();
      progressIndicator.nextStep(); // Start step 1

      progressIndicator.failStep('step1', 'Test error');

      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('failed');
      expect(steps[0].error).toBe('Test error');
      expect(steps[0].endTime).toBeDefined();
    });

    it('should skip step with reason', () => {
      progressIndicator.start();
      progressIndicator.nextStep(); // Start step 1

      progressIndicator.skipStep('step1', 'Not needed');

      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('skipped');
      expect(steps[0].error).toBe('Not needed');
      expect(steps[0].endTime).toBeDefined();
    });

    it('should complete all steps on complete()', () => {
      progressIndicator.start();
      progressIndicator.nextStep(); // Start step 1

      progressIndicator.complete();

      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('completed');
      expect(steps[0].endTime).toBeDefined();
    });
  });

  describe('summary generation', () => {
    beforeEach(() => {
      progressIndicator.addSteps([
        { id: 'step1', name: 'Step 1' },
        { id: 'step2', name: 'Step 2' },
        { id: 'step3', name: 'Step 3' },
        { id: 'step4', name: 'Step 4' }
      ]);
    });

    it('should generate summary with all completed', () => {
      progressIndicator.start();
      
      // Complete all steps
      progressIndicator.nextStep();
      progressIndicator.completeStep();
      progressIndicator.nextStep();
      progressIndicator.completeStep();
      progressIndicator.nextStep();
      progressIndicator.completeStep();
      progressIndicator.nextStep();
      progressIndicator.complete();

      const summary = progressIndicator.getSummary();
      expect(summary.total).toBe(4);
      expect(summary.completed).toBe(4);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(0);
      expect(summary.success).toBe(true);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('should generate summary with mixed results', () => {
      progressIndicator.start();
      
      // Mixed results
      progressIndicator.nextStep();
      progressIndicator.completeStep(); // step1 completed
      progressIndicator.nextStep();
      progressIndicator.failStep('step2', 'Failed'); // step2 failed
      progressIndicator.nextStep();
      progressIndicator.skipStep('step3', 'Skipped'); // step3 skipped
      progressIndicator.nextStep();
      progressIndicator.completeStep(); // step4 completed

      const summary = progressIndicator.getSummary();
      expect(summary.total).toBe(4);
      expect(summary.completed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.success).toBe(false); // Has failures
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });

    it('should consider skipped steps as success if no failures', () => {
      progressIndicator.start();
      
      progressIndicator.nextStep();
      progressIndicator.completeStep(); // step1 completed
      progressIndicator.nextStep();
      progressIndicator.completeStep(); // step2 completed
      progressIndicator.nextStep();
      progressIndicator.skipStep('step3', 'Not needed'); // step3 skipped
      progressIndicator.nextStep();
      progressIndicator.skipStep('step4', 'Not needed'); // step4 skipped

      const summary = progressIndicator.getSummary();
      expect(summary.success).toBe(true); // No failures, only skips
    });
  });

  describe('options handling', () => {
    it('should use default options', () => {
      const indicator = new ProgressIndicator();
      // Test that it doesn't throw and basic functionality works
      indicator.addStep({ id: 'test', name: 'Test' });
      indicator.start();
      expect(indicator.getSteps()).toHaveLength(1);
    });

    it('should use custom options', () => {
      const indicator = new ProgressIndicator({
        showPercentage: false,
        showElapsed: false,
        showETA: false,
        showStepDetails: false,
        clearOnComplete: true,
        updateInterval: 50
      });

      indicator.addStep({ id: 'test', name: 'Test' });
      indicator.start();
      expect(indicator.getSteps()).toHaveLength(1);
    });

    it('should handle custom spinner characters', () => {
      const customSpinner = ['|', '/', '-', '\\'];
      const indicator = new ProgressIndicator({
        spinnerChars: customSpinner,
        updateInterval: 10
      });

      indicator.addStep({ id: 'test', name: 'Test' });
      indicator.start();
      expect(indicator.getSteps()).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty step list', () => {
      progressIndicator.start();
      const summary = progressIndicator.getSummary();
      
      expect(summary.total).toBe(0);
      expect(summary.completed).toBe(0);
      expect(summary.success).toBe(true);
    });

    it('should handle completing non-existent step', () => {
      progressIndicator.addStep({ id: 'step1', name: 'Step 1' });
      progressIndicator.start();
      
      // Try to complete non-existent step
      progressIndicator.completeStep('non-existent');
      
      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('pending'); // Should remain unchanged
    });

    it('should handle failing non-existent step', () => {
      progressIndicator.addStep({ id: 'step1', name: 'Step 1' });
      progressIndicator.start();
      
      // Try to fail non-existent step
      progressIndicator.failStep('non-existent', 'Error');
      
      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('pending'); // Should remain unchanged
    });

    it('should handle operations without current step', () => {
      progressIndicator.addStep({ id: 'step1', name: 'Step 1' });
      progressIndicator.start();
      
      // Try to complete without starting any step
      progressIndicator.completeStep();
      
      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('pending'); // Should remain unchanged
    });

    it('should handle multiple complete calls', () => {
      progressIndicator.addStep({ id: 'step1', name: 'Step 1' });
      progressIndicator.start();
      progressIndicator.nextStep();
      
      progressIndicator.complete();
      progressIndicator.complete(); // Second call should not throw
      
      const steps = progressIndicator.getSteps();
      expect(steps[0].status).toBe('completed');
    });
  });
});
