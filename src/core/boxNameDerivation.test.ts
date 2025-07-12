import { BoxNameDerivation } from './boxNameDerivation';
import { DirectoryStructure, FileInfo } from './directoryScanner';
import { StructureAnalysis } from './structureAnalyzer';
import { TagDetectionResult } from './tagDetector';

describe('BoxNameDerivation', () => {
  let derivation: BoxNameDerivation;

  beforeEach(() => {
    derivation = new BoxNameDerivation();
  });

  const createMockStructure = (
    files: Partial<FileInfo>[] = [],
    directories: Partial<FileInfo>[] = []
  ): DirectoryStructure => ({
    files: files.map(f => ({
      path: f.path || '/test/file',
      relativePath: f.relativePath || 'file',
      name: f.name || 'file',
      extension: f.extension || '',
      size: f.size || 100,
      isDirectory: false,
      isFile: true,
      lastModified: new Date(),
      content: f.content,
      ...f
    })),
    directories: directories.map(d => ({
      path: d.path || '/test/dir',
      relativePath: d.relativePath || 'dir',
      name: d.name || 'dir',
      extension: '',
      size: 0,
      isDirectory: true,
      isFile: false,
      lastModified: new Date(),
      ...d
    })),
    totalFiles: files.length,
    totalDirectories: directories.length,
    totalSize: files.reduce((sum, f) => sum + (f.size || 100), 0),
    depth: 2,
    rootPath: '/test'
  });

  const createMockTags = (overrides: Partial<TagDetectionResult> = {}): TagDetectionResult => ({
    fileTypeTags: [],
    semanticTags: [],
    frameworkTags: [],
    toolingTags: [],
    allTags: [],
    confidence: {},
    ...overrides
  });

  const createMockAnalysis = (overrides: Partial<StructureAnalysis> = {}): StructureAnalysis => ({
    projectType: 'Test Project',
    primaryLanguage: 'TypeScript',
    framework: undefined,
    targetSuggestions: [],
    isMonorepo: false,
    hasTests: false,
    hasDocumentation: false,
    complexity: 'simple',
    ...overrides
  });

  describe('deriveBoxName', () => {
    it('should use provided name when given', () => {
      const structure = createMockStructure();
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./test-dir', structure, tags, analysis, 'custom-name');

      expect(result.primaryName).toBe('custom-name');
      expect(result.confidence).toBe(1.0);
      expect(result.derivationPath).toEqual(['user-provided']);
    });

    it('should derive name from package.json', () => {
      const packageJsonContent = JSON.stringify({ name: 'my-awesome-package' });
      const structure = createMockStructure([
        { name: 'package.json', content: packageJsonContent }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./test-dir', structure, tags, analysis);

      expect(result.primaryName).toBe('my-awesome-package');
      expect(result.confidence).toBe(0.95);
      expect(result.derivationPath).toContain('package');
    });

    it('should derive name from directory name', () => {
      const structure = createMockStructure();
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./my-project-dir', structure, tags, analysis);

      expect(result.primaryName).toBe('my-project-dir');
      expect(result.confidence).toBe(0.8);
      expect(result.derivationPath).toContain('directory');
    });

    it('should enhance directory name with framework', () => {
      const structure = createMockStructure();
      const tags = createMockTags({ frameworkTags: ['react'] });
      const analysis = createMockAnalysis({ framework: 'react' });

      const result = derivation.deriveBoxName('./my-app', structure, tags, analysis);

      // Should have enhanced name as alternative (not primary since confidence is lower)
      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-app-react'
        })
      );
    });

    it('should enhance directory name with language', () => {
      const structure = createMockStructure();
      const tags = createMockTags({ fileTypeTags: ['python'] });
      const analysis = createMockAnalysis({ primaryLanguage: 'Python', framework: undefined });

      const result = derivation.deriveBoxName('./my-script', structure, tags, analysis);

      // Should have enhanced name as alternative
      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-script-python'
        })
      );
    });

    it('should generate semantic-based names', () => {
      const structure = createMockStructure();
      const tags = createMockTags({ semanticTags: ['api', 'ai'] });
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./my-project', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-project-api',
          category: 'semantic'
        })
      );
    });

    it('should detect monorepo structure', () => {
      const structure = createMockStructure([], [
        { name: 'packages', relativePath: 'packages' }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis({ isMonorepo: true });

      const result = derivation.deriveBoxName('./workspace', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'workspace-monorepo',
          category: 'structure'
        })
      );
    });

    it('should detect Next.js patterns', () => {
      const structure = createMockStructure();
      const tags = createMockTags({ frameworkTags: ['nextjs'] });
      const analysis = createMockAnalysis({ framework: 'nextjs' });

      const result = derivation.deriveBoxName('./my-app', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-app-next-app',
          category: 'structure'
        })
      );
    });

    it('should detect library structure', () => {
      const structure = createMockStructure([], [
        { name: 'src', relativePath: 'src' },
        { name: 'tests', relativePath: 'tests' }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./my-lib', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-lib-library',
          category: 'structure'
        })
      );
    });

    it('should detect fullstack structure', () => {
      const structure = createMockStructure([], [
        { name: 'frontend', relativePath: 'frontend' },
        { name: 'backend', relativePath: 'backend' }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./my-app', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-app-fullstack',
          category: 'structure'
        })
      );
    });

    it('should detect Docker configuration', () => {
      const structure = createMockStructure([
        { name: 'Dockerfile', relativePath: 'Dockerfile' }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./my-app', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'my-app-docker',
          category: 'structure'
        })
      );
    });

    it('should detect Terraform configuration', () => {
      const structure = createMockStructure([
        { name: 'main.tf', relativePath: 'main.tf' }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./infrastructure', structure, tags, analysis);

      expect(result.alternatives).toContainEqual(
        expect.objectContaining({
          name: 'infrastructure-terraform',
          category: 'structure'
        })
      );
    });

    it('should sanitize names properly', () => {
      const structure = createMockStructure();
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./My@Project/Name!', structure, tags, analysis);

      // The function extracts the last part of the path and sanitizes it
      expect(result.primaryName).toBe('name');
    });

    it('should handle scoped package names', () => {
      const packageJsonContent = JSON.stringify({ name: '@company/my-package' });
      const structure = createMockStructure([
        { name: 'package.json', content: packageJsonContent }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const result = derivation.deriveBoxName('./test-dir', structure, tags, analysis);

      expect(result.primaryName).toBe('company-my-package');
    });
  });

  describe('validateName', () => {
    it('should validate correct names', () => {
      expect(derivation.validateName('my-project')).toEqual({ valid: true });
      expect(derivation.validateName('project123')).toEqual({ valid: true });
      expect(derivation.validateName('simple')).toEqual({ valid: true });
    });

    it('should reject empty names', () => {
      expect(derivation.validateName('')).toEqual({
        valid: false,
        reason: 'Name cannot be empty'
      });
      expect(derivation.validateName('   ')).toEqual({
        valid: false,
        reason: 'Name cannot be empty'
      });
    });

    it('should reject short names', () => {
      expect(derivation.validateName('a')).toEqual({
        valid: false,
        reason: 'Name must be at least 2 characters long'
      });
    });

    it('should reject invalid characters', () => {
      expect(derivation.validateName('My Project')).toEqual({
        valid: false,
        reason: 'Name contains invalid characters. Use only letters, numbers, and hyphens.'
      });
    });

    it('should reject reserved names', () => {
      expect(derivation.validateName('api')).toEqual({
        valid: false,
        reason: '"api" is a reserved name'
      });
    });
  });

  describe('getNameSuggestions', () => {
    it('should return sorted suggestions by confidence', () => {
      const packageJsonContent = JSON.stringify({ name: 'package-name' });
      const structure = createMockStructure([
        { name: 'package.json', content: packageJsonContent }
      ]);
      const tags = createMockTags({ frameworkTags: ['react'] });
      const analysis = createMockAnalysis({ framework: 'react' });

      const suggestions = derivation.getNameSuggestions('./my-app', structure, tags, analysis, 3);

      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(suggestions[1].confidence);
      expect(suggestions[1].confidence).toBeGreaterThanOrEqual(suggestions[2].confidence);
    });
  });
});
