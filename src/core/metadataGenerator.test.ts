import { DirectoryStructure, FileInfo } from './directoryScanner';
import { MetadataGenerator } from './metadataGenerator';
import { StructureAnalysis } from './structureAnalyzer';
import { TagDetectionResult } from './tagDetector';

describe('MetadataGenerator', () => {
  let generator: MetadataGenerator;

  beforeEach(() => {
    generator = new MetadataGenerator();
  });

  const createMockStructure = (files: Partial<FileInfo>[] = []): DirectoryStructure => ({
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
    directories: [],
    totalFiles: files.length,
    totalDirectories: 0,
    totalSize: files.reduce((sum, f) => sum + (f.size || 100), 0),
    depth: 1,
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

  describe('generateMetadata', () => {
    it('should generate basic metadata for a simple project', () => {
      const structure = createMockStructure([
        { name: 'index.ts', extension: '.ts' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['typescript'],
        allTags: ['typescript']
      });
      const analysis = createMockAnalysis();

      const metadata = generator.generateMetadata('test-box', structure, tags, analysis);

      expect(metadata.name).toBe('test-box');
      expect(metadata.language).toBe('TypeScript');
      expect(metadata.tags).toContain('typescript');
      expect(metadata.category).toBe('general');
      expect(metadata.structure.complexity).toBe('simple');
      expect(metadata.files.total).toBe(1);
    });

    it('should extract metadata from package.json', () => {
      const packageJsonContent = JSON.stringify({
        name: 'my-project',
        version: '2.1.0',
        description: 'A test project',
        author: 'John Doe',
        license: 'MIT',
        repository: 'https://github.com/user/repo',
        homepage: 'https://example.com'
      });

      const structure = createMockStructure([
        { name: 'package.json', content: packageJsonContent }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const metadata = generator.generateMetadata('test-box', structure, tags, analysis);

      expect(metadata.version).toBe('2.1.0');
      expect(metadata.author).toBe('John Doe');
      expect(metadata.license).toBe('MIT');
      expect(metadata.repository).toBe('https://github.com/user/repo');
      expect(metadata.homepage).toBe('https://example.com');
    });

    it('should extract description from README', () => {
      const readmeContent = `# My Project

This is a comprehensive description of my project that does amazing things.

## Installation
...`;

      const structure = createMockStructure([
        { name: 'README.md', content: readmeContent }
      ]);
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const metadata = generator.generateMetadata('test-box', structure, tags, analysis);

      expect(metadata.description).toBe('This is a comprehensive description of my project that does amazing things.');
    });

    it('should generate AI/ML specific metadata', () => {
      const structure = createMockStructure([
        { name: 'model.py', extension: '.py' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['python'],
        semanticTags: ['ai'],
        allTags: ['python', 'ai']
      });
      const analysis = createMockAnalysis({
        projectType: 'AI/ML Project',
        primaryLanguage: 'Python'
      });

      const metadata = generator.generateMetadata('ml-model', structure, tags, analysis);

      expect(metadata.category).toBe('ai-ml');
      expect(metadata.description).toContain('AI/ML');
      expect(metadata.description).toContain('machine learning');
      expect(metadata.keywords).toContain('ai');
      expect(metadata.requirements.python).toBe('>=3.8');
    });

    it('should generate React project metadata', () => {
      const packageJsonContent = JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        scripts: { start: 'react-scripts start', build: 'react-scripts build' }
      });

      const structure = createMockStructure([
        { name: 'package.json', content: packageJsonContent },
        { name: 'App.jsx', extension: '.jsx' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['javascript'],
        frameworkTags: ['react'],
        allTags: ['javascript', 'react']
      });
      const analysis = createMockAnalysis({
        projectType: 'React Application',
        primaryLanguage: 'JavaScript',
        framework: 'react'
      });

      const metadata = generator.generateMetadata('react-app', structure, tags, analysis);

      expect(metadata.category).toBe('frontend');
      expect(metadata.framework).toBe('react');
      expect(metadata.description).toContain('React application');
      expect(metadata.usage.installation).toContain('npm install');
      expect(metadata.usage.quickStart).toContain('npm start');
      expect(metadata.requirements.dependencies).toContain('react');
    });

    it('should generate Next.js project metadata', () => {
      const structure = createMockStructure([
        { name: 'next.config.js', extension: '.js' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['typescript'],
        frameworkTags: ['nextjs'],
        allTags: ['typescript', 'nextjs']
      });
      const analysis = createMockAnalysis({
        projectType: 'Next.js Application',
        framework: 'nextjs'
      });

      const metadata = generator.generateMetadata('nextjs-app', structure, tags, analysis);

      expect(metadata.category).toBe('fullstack');
      expect(metadata.framework).toBe('nextjs');
      expect(metadata.description).toContain('Next.js application');
      expect(metadata.usage.quickStart).toContain('npm run dev');
      expect(metadata.keywords).toContain('ssr');
    });

    it('should generate API project metadata', () => {
      const structure = createMockStructure([
        { name: 'server.js', extension: '.js' }
      ]);
      const tags = createMockTags({
        fileTypeTags: ['javascript'],
        semanticTags: ['api'],
        frameworkTags: ['express'],
        allTags: ['javascript', 'api', 'express']
      });
      const analysis = createMockAnalysis({
        projectType: 'API Service',
        primaryLanguage: 'JavaScript',
        framework: 'express'
      });

      const metadata = generator.generateMetadata('api-server', structure, tags, analysis);

      expect(metadata.category).toBe('backend');
      expect(metadata.description).toContain('REST API');
      expect(metadata.usage.examples).toContain('curl http://localhost:3000/api/health');
    });

    it('should handle overrides correctly', () => {
      const structure = createMockStructure();
      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const overrides = {
        name: 'custom-name',
        description: 'Custom description',
        version: '3.0.0',
        author: 'Custom Author',
        category: 'custom-category'
      };

      const metadata = generator.generateMetadata('original-name', structure, tags, analysis, overrides);

      expect(metadata.name).toBe('custom-name');
      expect(metadata.description).toBe('Custom description');
      expect(metadata.version).toBe('3.0.0');
      expect(metadata.author).toBe('Custom Author');
      expect(metadata.category).toBe('custom-category');
    });

    it('should generate structure information', () => {
      const structure = createMockStructure([
        { name: 'test.spec.js', extension: '.js' },
        { name: 'README.md', extension: '.md' }
      ]);
      const tags = createMockTags({
        semanticTags: ['workflow'],
        toolingTags: ['docker']
      });
      const analysis = createMockAnalysis({
        hasTests: true,
        hasDocumentation: true,
        complexity: 'moderate'
      });

      const metadata = generator.generateMetadata('test-project', structure, tags, analysis);

      expect(metadata.structure.hasTests).toBe(true);
      expect(metadata.structure.hasDocumentation).toBe(true);
      expect(metadata.structure.hasCICD).toBe(true);
      expect(metadata.structure.hasDocker).toBe(true);
      expect(metadata.structure.complexity).toBe('moderate');
    });

    it('should generate file statistics', () => {
      const structure = createMockStructure([
        { name: 'file1.js', extension: '.js', size: 1000 },
        { name: 'file2.js', extension: '.js', size: 2000 },
        { name: 'file3.ts', extension: '.ts', size: 1500 }
      ]);
      structure.totalSize = 4500;

      const tags = createMockTags();
      const analysis = createMockAnalysis();

      const metadata = generator.generateMetadata('test-project', structure, tags, analysis);

      expect(metadata.files.total).toBe(3);
      expect(metadata.files.size).toBe('0.00MB');
      expect(metadata.files.types['.js']).toBe(2);
      expect(metadata.files.types['.ts']).toBe(1);
    });
  });

  describe('generateTemplate', () => {
    it('should generate a metadata template', () => {
      const structure = createMockStructure();
      const tags = createMockTags({ allTags: ['typescript', 'react'] });
      const analysis = createMockAnalysis();

      const metadata = generator.generateMetadata('test-box', structure, tags, analysis);
      const template = generator.generateTemplate(metadata);

      expect(template).toContain('name: "test-box"');
      expect(template).toContain('typescript, react');
      expect(template).toContain('# Box Metadata Template');
    });
  });
});
