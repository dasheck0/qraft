import { ConfirmationWorkflows, SensitiveFileWarning, ConflictWarning } from './confirmationWorkflows';

describe('ConfirmationWorkflows', () => {
  let confirmationWorkflows: ConfirmationWorkflows;

  beforeEach(() => {
    confirmationWorkflows = new ConfirmationWorkflows();
  });

  afterEach(() => {
    confirmationWorkflows.close();
  });

  describe('confirmationDryRun', () => {
    it('should return confirmed result for yes choice', async () => {
      const result = await confirmationWorkflows.confirmationDryRun('sensitive', 'yes');

      expect(result.confirmed).toBe(true);
      expect(result.choice).toBe('yes');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should return not confirmed result for no choice', async () => {
      const result = await confirmationWorkflows.confirmationDryRun('conflict', 'no');

      expect(result.confirmed).toBe(false);
      expect(result.choice).toBe('no');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should return not confirmed result for cancel choice', async () => {
      const result = await confirmationWorkflows.confirmationDryRun('repository', 'cancel');

      expect(result.confirmed).toBe(false);
      expect(result.choice).toBe('cancel');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should default to yes choice', async () => {
      const result = await confirmationWorkflows.confirmationDryRun('dryrun');

      expect(result.confirmed).toBe(true);
      expect(result.choice).toBe('yes');
    });

    it('should handle different confirmation types', async () => {
      const types = ['sensitive', 'conflict', 'repository', 'dryrun'] as const;
      
      for (const type of types) {
        const result = await confirmationWorkflows.confirmationDryRun(type, 'yes');
        expect(result.confirmed).toBe(true);
        expect(result.choice).toBe('yes');
      }
    });
  });

  describe('sensitive file warnings', () => {
    it('should handle single sensitive file warning', () => {
      const warnings: SensitiveFileWarning[] = [
        {
          file: '.env',
          reason: 'Contains environment variables',
          severity: 'critical',
          suggestions: ['Add to .gitignore', 'Use .env.example instead']
        }
      ];

      // Test that the function exists and can be called
      expect(() => {
        // This would normally show interactive prompts, but we're just testing structure
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });

    it('should handle multiple sensitive file warnings', () => {
      const warnings: SensitiveFileWarning[] = [
        {
          file: '.env',
          reason: 'Contains environment variables',
          severity: 'critical',
          suggestions: ['Add to .gitignore']
        },
        {
          file: 'config/database.yml',
          reason: 'Contains database credentials',
          severity: 'high',
          suggestions: ['Use environment variables', 'Create template file']
        },
        {
          file: 'logs/app.log',
          reason: 'Contains application logs',
          severity: 'medium',
          suggestions: ['Add logs/ to .gitignore']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });

    it('should handle empty warnings array', () => {
      const warnings: SensitiveFileWarning[] = [];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });

    it('should handle warnings without suggestions', () => {
      const warnings: SensitiveFileWarning[] = [
        {
          file: 'secret.key',
          reason: 'Contains secret key',
          severity: 'critical',
          suggestions: []
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });
  });

  describe('conflict warnings', () => {
    it('should handle single conflict warning', () => {
      const conflicts: ConflictWarning[] = [
        {
          type: 'overwrite',
          description: 'File will be overwritten',
          affectedFiles: ['package.json'],
          riskLevel: 'medium',
          recommendations: ['Create backup', 'Review changes']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmConflictResolution(conflicts);
      }).not.toThrow();
    });

    it('should handle multiple conflict warnings', () => {
      const conflicts: ConflictWarning[] = [
        {
          type: 'overwrite',
          description: 'Configuration files will be overwritten',
          affectedFiles: ['package.json', 'tsconfig.json', 'webpack.config.js'],
          riskLevel: 'high',
          recommendations: ['Backup existing files', 'Review differences']
        },
        {
          type: 'merge',
          description: 'Dependencies need to be merged',
          affectedFiles: ['package.json'],
          riskLevel: 'medium',
          recommendations: ['Review dependency conflicts', 'Test after merge']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmConflictResolution(conflicts);
      }).not.toThrow();
    });

    it('should handle conflicts with many affected files', () => {
      const manyFiles = Array.from({ length: 10 }, (_, i) => `file${i}.js`);
      const conflicts: ConflictWarning[] = [
        {
          type: 'version_conflict',
          description: 'Multiple files have version conflicts',
          affectedFiles: manyFiles,
          riskLevel: 'critical',
          recommendations: ['Review all conflicts manually']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmConflictResolution(conflicts);
      }).not.toThrow();
    });

    it('should handle empty conflicts array', () => {
      const conflicts: ConflictWarning[] = [];

      expect(() => {
        confirmationWorkflows.confirmConflictResolution(conflicts);
      }).not.toThrow();
    });
  });

  describe('repository operations', () => {
    it('should handle fork operation', () => {
      const details = {
        repository: 'owner/repo',
        description: 'Fork for contributing',
        impact: ['Create fork in your account', 'Enable pull request workflow']
      };

      expect(() => {
        confirmationWorkflows.confirmRepositoryOperation('fork', details);
      }).not.toThrow();
    });

    it('should handle create PR operation', () => {
      const details = {
        repository: 'owner/repo',
        branch: 'feature/new-box',
        description: 'Add new React box',
        impact: ['Create pull request', 'Request review from maintainers']
      };

      expect(() => {
        confirmationWorkflows.confirmRepositoryOperation('create_pr', details);
      }).not.toThrow();
    });

    it('should handle push operation', () => {
      const details = {
        repository: 'owner/repo',
        branch: 'main',
        impact: ['Push changes to remote', 'Update repository content']
      };

      expect(() => {
        confirmationWorkflows.confirmRepositoryOperation('push', details);
      }).not.toThrow();
    });

    it('should handle overwrite operation', () => {
      const details = {
        repository: 'owner/repo',
        description: 'Overwrite existing box',
        impact: ['Replace existing files', 'Update box metadata']
      };

      expect(() => {
        confirmationWorkflows.confirmRepositoryOperation('overwrite', details);
      }).not.toThrow();
    });

    it('should handle minimal details', () => {
      const details = {
        repository: 'owner/repo'
      };

      expect(() => {
        confirmationWorkflows.confirmRepositoryOperation('fork', details);
      }).not.toThrow();
    });
  });

  describe('dry run results', () => {
    it('should handle low risk operation', () => {
      const summary = {
        operation: 'Create Box',
        filesAffected: 10,
        estimatedTime: '30 seconds',
        riskLevel: 'low' as const,
        warnings: []
      };

      expect(() => {
        confirmationWorkflows.confirmDryRunResults(summary);
      }).not.toThrow();
    });

    it('should handle high risk operation with warnings', () => {
      const summary = {
        operation: 'Overwrite Existing Box',
        filesAffected: 25,
        estimatedTime: '2 minutes',
        riskLevel: 'high' as const,
        warnings: [
          'Sensitive files detected',
          'Existing files will be overwritten',
          'No backup will be created'
        ]
      };

      expect(() => {
        confirmationWorkflows.confirmDryRunResults(summary);
      }).not.toThrow();
    });

    it('should handle critical risk operation', () => {
      const summary = {
        operation: 'Force Push to Main Branch',
        filesAffected: 100,
        estimatedTime: '5 minutes',
        riskLevel: 'critical' as const,
        warnings: [
          'This will overwrite the main branch',
          'All existing history will be lost',
          'This action cannot be undone'
        ]
      };

      expect(() => {
        confirmationWorkflows.confirmDryRunResults(summary);
      }).not.toThrow();
    });

    it('should handle operation with no warnings', () => {
      const summary = {
        operation: 'Create New Box',
        filesAffected: 5,
        estimatedTime: '10 seconds',
        riskLevel: 'low' as const,
        warnings: []
      };

      expect(() => {
        confirmationWorkflows.confirmDryRunResults(summary);
      }).not.toThrow();
    });
  });

  describe('severity and risk levels', () => {
    it('should handle all severity levels', () => {
      const severityLevels = ['low', 'medium', 'high', 'critical'] as const;
      
      severityLevels.forEach(severity => {
        const warnings: SensitiveFileWarning[] = [
          {
            file: 'test.file',
            reason: 'Test reason',
            severity,
            suggestions: ['Test suggestion']
          }
        ];

        expect(() => {
          confirmationWorkflows.confirmSensitiveFiles(warnings);
        }).not.toThrow();
      });
    });

    it('should handle all risk levels', () => {
      const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
      
      riskLevels.forEach(riskLevel => {
        const conflicts: ConflictWarning[] = [
          {
            type: 'overwrite',
            description: 'Test conflict',
            affectedFiles: ['test.file'],
            riskLevel,
            recommendations: ['Test recommendation']
          }
        ];

        expect(() => {
          confirmationWorkflows.confirmConflictResolution(conflicts);
        }).not.toThrow();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very long file names', () => {
      const longFileName = 'a'.repeat(200) + '.js';
      const warnings: SensitiveFileWarning[] = [
        {
          file: longFileName,
          reason: 'Test with long filename',
          severity: 'medium',
          suggestions: ['Handle long names gracefully']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });

    it('should handle special characters in file names', () => {
      const specialFileName = 'file with spaces & special chars!@#$%.js';
      const warnings: SensitiveFileWarning[] = [
        {
          file: specialFileName,
          reason: 'Test with special characters',
          severity: 'low',
          suggestions: []
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });

    it('should handle empty strings', () => {
      const warnings: SensitiveFileWarning[] = [
        {
          file: '',
          reason: '',
          severity: 'low',
          suggestions: ['']
        }
      ];

      expect(() => {
        confirmationWorkflows.confirmSensitiveFiles(warnings);
      }).not.toThrow();
    });
  });
});
