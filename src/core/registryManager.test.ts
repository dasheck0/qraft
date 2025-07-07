import { BoxReference, RegistryManagerConfig } from '../types';

// Simple unit tests for RegistryManager types and interfaces
describe('RegistryManager Types', () => {
  describe('RegistryManagerConfig', () => {
    it('should define valid registry configuration structure', () => {
      const mockConfig: RegistryManagerConfig = {
        defaultRegistry: 'dasheck0',
        registries: {
          'dasheck0': {
            name: 'dasheck0',
            repository: 'dasheck0/unbox-templates',
            isDefault: true
          },
          'myorg': {
            name: 'myorg',
            repository: 'myorg/custom-templates',
            token: 'test-token'
          }
        }
      };

      expect(mockConfig.defaultRegistry).toBe('dasheck0');
      expect(Object.keys(mockConfig.registries)).toHaveLength(2);
      expect(mockConfig.registries['dasheck0']).toBeDefined();
      expect(mockConfig.registries['myorg']).toBeDefined();
    });
  });

  describe('BoxReference', () => {
    it('should define valid box reference structure', () => {
      const boxRef: BoxReference = {
        registry: 'dasheck0',
        boxName: 'n8n',
        fullReference: 'dasheck0/n8n'
      };

      expect(boxRef.registry).toBe('dasheck0');
      expect(boxRef.boxName).toBe('n8n');
      expect(boxRef.fullReference).toBe('dasheck0/n8n');
    });

    it('should support simple box references', () => {
      const boxRef: BoxReference = {
        registry: 'dasheck0',
        boxName: 'n8n',
        fullReference: 'n8n'
      };

      expect(boxRef.registry).toBe('dasheck0');
      expect(boxRef.boxName).toBe('n8n');
      expect(boxRef.fullReference).toBe('n8n');
    });
  });

  describe('Box reference parsing logic', () => {
    it('should handle different reference formats', () => {
      // Test data for different reference formats
      const testCases = [
        {
          input: 'n8n',
          expected: { registry: 'default', boxName: 'n8n', parts: 1 }
        },
        {
          input: 'myorg/n8n',
          expected: { registry: 'myorg', boxName: 'n8n', parts: 2 }
        },
        {
          input: 'myorg/templates/n8n',
          expected: { registry: 'myorg/templates', boxName: 'n8n', parts: 3 }
        }
      ];

      testCases.forEach(testCase => {
        const parts = testCase.input.split('/');
        expect(parts.length).toBe(testCase.expected.parts);

        if (parts.length === 1) {
          expect(parts[0]).toBe(testCase.expected.boxName);
        } else {
          expect(parts[parts.length - 1]).toBe(testCase.expected.boxName);
        }
      });
    });
  });
});
