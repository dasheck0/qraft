import { ConfigManager } from './config';
import { QraftPatternCategory, QraftPatterns } from './qraftPatterns';

// Mock the ConfigManager
jest.mock('./config');

// Helper function for creating mock configs
const createMockConfig = (overrides = {}) => ({
  defaultRegistry: 'default',
  registries: {},
  ...overrides
});

// Helper function for creating mock registry configs
const createMockRegistry = (name: string, repository = `owner/${name}`) => ({
  name,
  repository
});

describe('QraftPatterns', () => {
  let qraftPatterns: QraftPatterns;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  beforeEach(() => {
    mockConfigManager = new ConfigManager() as jest.Mocked<ConfigManager>;
    qraftPatterns = new QraftPatterns(mockConfigManager);
  });

  describe('getStaticPatterns', () => {
    it('should return all static qraft patterns', () => {
      const patterns = qraftPatterns.getStaticPatterns();
      
      expect(patterns).toHaveLength(5);
      expect(patterns.every(p => p.isStatic)).toBe(true);
      
      const patternStrings = patterns.map(p => p.pattern);
      expect(patternStrings).toContain('.qraft/');
      expect(patternStrings).toContain('.qraftrc');
      expect(patternStrings).toContain('.qraftrc.json');
      expect(patternStrings).toContain('.qraftrc.yaml');
      expect(patternStrings).toContain('.qraftrc.yml');
    });

    it('should categorize patterns correctly', () => {
      const patterns = qraftPatterns.getStaticPatterns();
      
      const localPatterns = patterns.filter(p => p.category === QraftPatternCategory.LOCAL);
      const configPatterns = patterns.filter(p => p.category === QraftPatternCategory.CONFIG);
      
      expect(localPatterns).toHaveLength(1);
      expect(localPatterns[0].pattern).toBe('.qraft/');
      
      expect(configPatterns).toHaveLength(4);
    });
  });

  describe('getDynamicPatterns', () => {
    it('should return empty array when config loading fails', async () => {
      mockConfigManager.getConfig.mockRejectedValue(new Error('Config error'));
      
      const patterns = await qraftPatterns.getDynamicPatterns();
      expect(patterns).toEqual([]);
    });

    it('should include cache patterns when cache is configured', async () => {
      const mockConfig = {
        defaultRegistry: 'test/registry',
        cache: {
          directory: '/custom/cache/path',
          enabled: true,
          ttl: 3600
        },
        registries: {
          'test/registry': createMockRegistry('test/registry')
        }
      };
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      
      const patterns = await qraftPatterns.getDynamicPatterns();
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === QraftPatternCategory.CACHE)).toBe(true);
      expect(patterns.some(p => p.pattern.includes('.qraft-cache'))).toBe(true);
    });

    it('should include registry patterns when registries are configured', async () => {
      const mockConfig = {
        defaultRegistry: 'test/registry',
        registries: {
          'test/registry': createMockRegistry('test/registry')
        }
      };
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      
      const patterns = await qraftPatterns.getDynamicPatterns();
      
      expect(patterns.some(p => p.pattern.includes('registry'))).toBe(true);
    });
  });

  describe('getAllPatterns', () => {
    it('should combine static and dynamic patterns', async () => {
      const mockConfig = {
        defaultRegistry: 'test/registry',
        cache: { directory: '/test/cache', enabled: true, ttl: 3600 },
        registries: { 'test/registry': createMockRegistry('test') }
      };
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);
      
      const patterns = await qraftPatterns.getAllPatterns();
      
      expect(patterns.length).toBeGreaterThan(5); // More than just static patterns
      expect(patterns.some(p => p.isStatic)).toBe(true);
      expect(patterns.some(p => !p.isStatic)).toBe(true);
    });
  });

  describe('getPatternsByCategory', () => {
    it('should organize patterns by category', async () => {
      mockConfigManager.getConfig.mockResolvedValue({
        defaultRegistry: 'default',
        registries: {}
      });
      
      const collection = await qraftPatterns.getPatternsByCategory();
      
      expect(collection).toHaveProperty('local');
      expect(collection).toHaveProperty('global');
      expect(collection).toHaveProperty('cache');
      expect(collection).toHaveProperty('config');
      
      expect(Array.isArray(collection.local)).toBe(true);
      expect(Array.isArray(collection.config)).toBe(true);
    });
  });

  describe('getPatternStrings', () => {
    it('should return array of pattern strings', async () => {
      mockConfigManager.getConfig.mockResolvedValue({
        defaultRegistry: 'default',
        registries: {}
      });

      const patterns = await qraftPatterns.getPatternStrings();
      
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.every(p => typeof p === 'string')).toBe(true);
      expect(patterns).toContain('.qraft/');
    });
  });

  describe('categorizeByScope', () => {
    it('should separate local and global patterns', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());
      
      const { local, global } = await qraftPatterns.categorizeByScope();
      
      expect(Array.isArray(local)).toBe(true);
      expect(Array.isArray(global)).toBe(true);
      
      // .qraft/ should be in local scope
      expect(local.some(p => p.pattern === '.qraft/')).toBe(true);
    });
  });

  describe('getRelevantPatterns', () => {
    it('should filter patterns based on target directory', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());
      const targetDir = '/test/project';
      
      const patterns = await qraftPatterns.getRelevantPatterns(targetDir);
      
      expect(Array.isArray(patterns)).toBe(true);
      // Should include at least the basic local patterns
      expect(patterns.some(p => p.pattern === '.qraft/')).toBe(true);
    });
  });

  describe('getSectionTitle and getSectionDescription', () => {
    it('should return appropriate section metadata', () => {
      expect(qraftPatterns.getSectionTitle()).toBe('Qraft CLI');
      expect(qraftPatterns.getSectionDescription()).toBe('Files and directories generated by qraft CLI tool');
    });
  });

  describe('getFormattedPatterns', () => {
    it('should return patterns with descriptions', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());

      const formatted = await qraftPatterns.getFormattedPatterns();
      
      expect(Array.isArray(formatted)).toBe(true);
      expect(formatted.every(p => p.includes(' - '))).toBe(true);
      expect(formatted.some(p => p.includes('.qraft/'))).toBe(true);
    });
  });

  describe('validatePattern', () => {
    it('should validate correct patterns', () => {
      const validPatterns = [
        '.qraft/',
        '.qraftrc',
        '.qraft-cache/',
        '!.qraft/important.json'
      ];

      for (const pattern of validPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should reject dangerous patterns', () => {
      const dangerousPatterns = [
        '*',
        '**',
        '*.js',
        'src/',
        'dist/'
      ];

      for (const pattern of dangerousPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('dangerous'))).toBe(true);
      }
    });

    it('should reject empty patterns', () => {
      const emptyPatterns = ['', '   ', '\t\n'];

      for (const pattern of emptyPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('empty'))).toBe(true);
      }
    });

    it('should reject patterns with invalid characters', () => {
      const invalidPatterns = [
        'pattern\0with\0nulls',
        'pattern<with>invalid',
        'pattern|with|pipes'
      ];

      for (const pattern of invalidPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('invalid characters'))).toBe(true);
      }
    });

    it('should reject overly broad patterns', () => {
      const broadPatterns = [
        '*.*',
        'a',
        'ab/'
      ];

      for (const pattern of broadPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('too broad'))).toBe(true);
      }
    });

    it('should reject malformed patterns', () => {
      const malformedPatterns = [
        'pattern[with[unmatched',
        'pattern\\',
        'pattern\\invalid'
      ];

      for (const pattern of malformedPatterns) {
        const result = qraftPatterns.validatePattern(pattern);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('malformed'))).toBe(true);
      }
    });
  });

  describe('normalizePattern', () => {
    it('should normalize directory patterns', () => {
      expect(qraftPatterns.normalizePattern('.qraft')).toBe('.qraft/');
      expect(qraftPatterns.normalizePattern('.qraft-cache')).toBe('.qraft-cache/');
      expect(qraftPatterns.normalizePattern('.qraft/')).toBe('.qraft/');
    });

    it('should remove leading ./ except for negation', () => {
      expect(qraftPatterns.normalizePattern('./pattern')).toBe('pattern');
      expect(qraftPatterns.normalizePattern('!./pattern')).toBe('!./pattern');
    });

    it('should normalize path separators', () => {
      expect(qraftPatterns.normalizePattern('path\\to\\file')).toBe('path/to/file');
    });

    it('should remove redundant slashes', () => {
      expect(qraftPatterns.normalizePattern('path//to///file')).toBe('path/to/file');
    });

    it('should handle empty input', () => {
      expect(qraftPatterns.normalizePattern('')).toBe('');
      expect(qraftPatterns.normalizePattern('   ')).toBe('');
    });
  });

  describe('validateAndNormalizePatterns', () => {
    it('should separate valid and invalid patterns', () => {
      const patterns = [
        '.qraft/',
        '*',
        '.qraftrc',
        '*.js',
        '.qraft-cache'
      ];

      const result = qraftPatterns.validateAndNormalizePatterns(patterns);

      expect(result.valid).toContain('.qraft/');
      expect(result.valid).toContain('.qraftrc');
      expect(result.valid).toContain('.qraft-cache/'); // Should be normalized

      expect(result.invalid.some(i => i.pattern === '*')).toBe(true);
      expect(result.invalid.some(i => i.pattern === '*.js')).toBe(true);
    });
  });

  describe('getValidationRules', () => {
    it('should return validation rules and examples', () => {
      const rules = qraftPatterns.getValidationRules();

      expect(rules).toHaveProperty('rules');
      expect(rules).toHaveProperty('examples');
      expect(Array.isArray(rules.rules)).toBe(true);
      expect(Array.isArray(rules.examples.valid)).toBe(true);
      expect(Array.isArray(rules.examples.invalid)).toBe(true);

      expect(rules.rules.length).toBeGreaterThan(0);
      expect(rules.examples.valid.length).toBeGreaterThan(0);
      expect(rules.examples.invalid.length).toBeGreaterThan(0);
    });
  });

  describe('getConfigSpecificPatterns', () => {
    it('should return patterns based on enabled features', async () => {
      const mockConfig = createMockConfig({
        cache: { enabled: true, ttl: 3600, directory: '/test/cache' },
        registries: {
          'test/registry': createMockRegistry('test'),
          'another-registry': createMockRegistry('another')
        }
      });
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const patterns = await qraftPatterns.getConfigSpecificPatterns();

      expect(patterns.some(p => p.pattern.includes('.qraft-temp'))).toBe(true);
      expect(patterns.some(p => p.pattern.includes('.qraft-test-'))).toBe(true);
      expect(patterns.some(p => p.pattern.includes('.qraft-another-registry-'))).toBe(true);
    });

    it('should handle config loading errors gracefully', async () => {
      mockConfigManager.getConfig.mockRejectedValue(new Error('Config error'));

      const patterns = await qraftPatterns.getConfigSpecificPatterns();
      expect(patterns).toEqual([]);
    });
  });

  describe('getContextAwarePatterns', () => {
    it('should return context-aware patterns', async () => {
      const mockConfig = createMockConfig({
        cache: { enabled: true, ttl: 3600, directory: '/test/cache' },
        registries: { 'test/registry': createMockRegistry('test') }
      });
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const patterns = await qraftPatterns.getContextAwarePatterns('/test/project');

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.pattern === '.qraft/')).toBe(true);
    });

    it('should filter out irrelevant patterns', async () => {
      const mockConfig = createMockConfig({
        cache: { enabled: false, ttl: 3600, directory: '/test/cache' }
      });
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const patterns = await qraftPatterns.getContextAwarePatterns('/test/project');

      // Should still include local patterns
      expect(patterns.some(p => p.pattern === '.qraft/')).toBe(true);
      // But may exclude some cache patterns if cache is disabled
    });
  });

  describe('getLocalPatterns and getGlobalPatterns', () => {
    it('should separate local and global patterns correctly', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());

      const localPatterns = await qraftPatterns.getLocalPatterns();
      const globalPatterns = await qraftPatterns.getGlobalPatterns();

      expect(localPatterns.some(p => p.pattern === '.qraft/')).toBe(true);
      expect(localPatterns.length).toBeGreaterThan(0);
      expect(Array.isArray(globalPatterns)).toBe(true);
    });
  });

  describe('getProjectPatterns and getGlobalGitignorePatterns', () => {
    it('should return appropriate pattern strings for different scopes', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());

      const projectPatterns = await qraftPatterns.getProjectPatterns();
      const globalPatterns = await qraftPatterns.getGlobalGitignorePatterns();

      expect(Array.isArray(projectPatterns)).toBe(true);
      expect(Array.isArray(globalPatterns)).toBe(true);
      expect(projectPatterns.every(p => typeof p === 'string')).toBe(true);
      expect(globalPatterns.every(p => typeof p === 'string')).toBe(true);
    });
  });

  describe('getPatternsForCategory', () => {
    it('should filter patterns by category', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());

      const localPatterns = await qraftPatterns.getPatternsForCategory(QraftPatternCategory.LOCAL);
      const configPatterns = await qraftPatterns.getPatternsForCategory(QraftPatternCategory.CONFIG);

      expect(localPatterns.every(p => p.category === QraftPatternCategory.LOCAL)).toBe(true);
      expect(configPatterns.every(p => p.category === QraftPatternCategory.CONFIG)).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined config manager', () => {
      const patternsWithoutConfig = new QraftPatterns();
      expect(patternsWithoutConfig).toBeDefined();
    });

    it('should handle empty config', async () => {
      mockConfigManager.getConfig.mockResolvedValue(createMockConfig());

      const patterns = await qraftPatterns.getAllPatterns();
      expect(patterns.length).toBeGreaterThan(0); // Should still have static patterns
    });

    it('should handle malformed config', async () => {
      mockConfigManager.getConfig.mockResolvedValue(null as any);

      const patterns = await qraftPatterns.getDynamicPatterns();
      expect(patterns).toEqual([]);
    });

    it('should sanitize registry names correctly', async () => {
      const mockConfig = createMockConfig({
        registries: {
          'test/registry-with-special@chars!': createMockRegistry('test'),
          'UPPERCASE-Registry': createMockRegistry('upper')
        }
      });
      mockConfigManager.getConfig.mockResolvedValue(mockConfig);

      const patterns = await qraftPatterns.getConfigSpecificPatterns();

      // Should contain sanitized registry names
      expect(patterns.some(p => p.pattern.includes('.qraft-test-registry-with-special-chars-'))).toBe(true);
      expect(patterns.some(p => p.pattern.includes('.qraft-uppercase-registry-'))).toBe(true);
    });
  });
});
