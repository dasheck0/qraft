import { DirectoryStructure, FileInfo } from './directoryScanner';
import { StructureAnalyzer } from './structureAnalyzer';
import { TagDetectionResult } from './tagDetector';

describe('StructureAnalyzer', () => {
  let analyzer: StructureAnalyzer;

  beforeEach(() => {
    analyzer = new StructureAnalyzer();
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

  describe('analyzeStructure', () => {
    it('should detect Next.js project structure', () => {
      const structure = createMockStructure(
        [{ name: 'index.tsx', extension: '.tsx' }],
        [{ name: 'pages', relativePath: 'pages' }]
      );
      const tags = createMockTags({
        frameworkTags: ['nextjs'],
        fileTypeTags: ['typescript']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.projectType).toBe('Next.js Application');
      expect(analysis.framework).toBe('nextjs');
      expect(analysis.primaryLanguage).toBe('Typescript');
      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'web/nextjs',
          category: 'framework'
        })
      );
    });

    it('should detect React project structure', () => {
      const structure = createMockStructure(
        [{ name: 'App.jsx', extension: '.jsx' }],
        [{ name: 'components', relativePath: 'src/components' }]
      );
      const tags = createMockTags({
        frameworkTags: ['react'],
        fileTypeTags: ['javascript']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.projectType).toBe('React Application');
      expect(analysis.framework).toBe('react');
      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'web/react',
          category: 'framework'
        })
      );
    });

    it('should detect Python AI/ML project', () => {
      const structure = createMockStructure(
        [
          { name: 'model.py', extension: '.py' },
          { name: 'train.py', extension: '.py' }
        ],
        [{ name: 'models', relativePath: 'models' }]
      );
      const tags = createMockTags({
        fileTypeTags: ['python'],
        semanticTags: ['ai']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.projectType).toBe('AI/ML Project');
      expect(analysis.primaryLanguage).toBe('Python');
      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'ai-ml',
          category: 'purpose'
        })
      );
    });

    it('should detect monorepo structure', () => {
      const structure = createMockStructure(
        [],
        [
          { name: 'packages', relativePath: 'packages' },
          { name: 'apps', relativePath: 'apps' }
        ]
      );
      const tags = createMockTags();

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.projectType).toBe('Monorepo');
      expect(analysis.isMonorepo).toBe(true);
      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'monorepo',
          category: 'structure'
        })
      );
    });

    it('should detect API project', () => {
      const structure = createMockStructure(
        [{ name: 'server.js', extension: '.js' }],
        [{ name: 'api', relativePath: 'api' }]
      );
      const tags = createMockTags({
        semanticTags: ['api'],
        frameworkTags: ['express']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.projectType).toBe('Express.js API');
      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'backend/api',
          category: 'purpose'
        })
      );
    });

    it('should detect testing presence', () => {
      const structure = createMockStructure(
        [{ name: 'app.test.js', extension: '.js' }],
        [{ name: '__tests__', relativePath: '__tests__' }]
      );
      const tags = createMockTags();

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.hasTests).toBe(true);
    });

    it('should detect documentation presence', () => {
      const structure = createMockStructure(
        [{ name: 'README.md', extension: '.md' }],
        [{ name: 'docs', relativePath: 'docs' }]
      );
      const tags = createMockTags();

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.hasDocumentation).toBe(true);
    });

    it('should assess project complexity', () => {
      // Simple project
      const simpleStructure = createMockStructure(
        [{ name: 'index.js', extension: '.js' }],
        []
      );
      const simpleTags = createMockTags();
      const simpleAnalysis = analyzer.analyzeStructure(simpleStructure, simpleTags);
      expect(simpleAnalysis.complexity).toBe('simple');

      // Complex project
      const complexStructure = createMockStructure(
        Array.from({ length: 60 }, (_, i) => ({ name: `file${i}.js`, extension: '.js' })),
        Array.from({ length: 20 }, (_, i) => ({ name: `dir${i}`, relativePath: `dir${i}` }))
      );
      complexStructure.depth = 6;
      const complexTags = createMockTags();
      const complexAnalysis = analyzer.analyzeStructure(complexStructure, complexTags);
      expect(complexAnalysis.complexity).toBe('complex');
    });

    it('should handle multiple language files', () => {
      const structure = createMockStructure([
        { name: 'app.ts', extension: '.ts' },
        { name: 'utils.ts', extension: '.ts' },
        { name: 'legacy.js', extension: '.js' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['typescript', 'javascript']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.primaryLanguage).toBe('Typescript'); // More .ts files
    });

    it('should generate infrastructure suggestions', () => {
      const structure = createMockStructure(
        [{ name: 'Dockerfile', extension: '' }],
        [{ name: 'k8s', relativePath: 'k8s' }]
      );
      const tags = createMockTags({
        toolingTags: ['docker']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      expect(analysis.targetSuggestions).toContainEqual(
        expect.objectContaining({
          path: 'infrastructure/kubernetes',
          category: 'purpose'
        })
      );
    });

    it('should sort suggestions by confidence', () => {
      const structure = createMockStructure(
        [],
        [
          { name: 'pages', relativePath: 'pages' }, // High confidence
          { name: 'utils', relativePath: 'utils' }  // Lower confidence
        ]
      );
      const tags = createMockTags({
        frameworkTags: ['nextjs']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);

      // Should be sorted by confidence (highest first)
      for (let i = 1; i < analysis.targetSuggestions.length; i++) {
        expect(analysis.targetSuggestions[i - 1].confidence)
          .toBeGreaterThanOrEqual(analysis.targetSuggestions[i].confidence);
      }
    });
  });

  describe('utility methods', () => {
    it('should get best target suggestion', () => {
      const structure = createMockStructure();
      const tags = createMockTags({
        frameworkTags: ['nextjs']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);
      const bestTarget = analyzer.getBestTargetSuggestion(analysis);

      expect(bestTarget).toBe('web/nextjs');
    });

    it('should return general for no suggestions', () => {
      const structure = createMockStructure();
      const tags = createMockTags();

      const analysis = analyzer.analyzeStructure(structure, tags);
      const bestTarget = analyzer.getBestTargetSuggestion(analysis);

      expect(bestTarget).toBe('general');
    });

    it('should categorize suggestions', () => {
      const structure = createMockStructure(
        [],
        [{ name: 'pages', relativePath: 'pages' }]
      );
      const tags = createMockTags({
        frameworkTags: ['nextjs'],
        semanticTags: ['api']
      });

      const analysis = analyzer.analyzeStructure(structure, tags);
      const categorized = analyzer.getSuggestionsByCategory(analysis);

      expect(categorized.framework).toHaveLength(1);
      expect(categorized.purpose).toHaveLength(1);
      expect(categorized.language).toHaveLength(0);
      expect(categorized.structure).toHaveLength(0);
    });
  });
});
