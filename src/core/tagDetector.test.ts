import { TagDetector } from './tagDetector';
import { DirectoryStructure, FileInfo } from './directoryScanner';

describe('TagDetector', () => {
  let detector: TagDetector;

  beforeEach(() => {
    detector = new TagDetector();
  });

  const createMockStructure = (files: Partial<FileInfo>[]): DirectoryStructure => ({
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

  describe('detectTags', () => {
    it('should detect TypeScript tags', async () => {
      const structure = createMockStructure([
        { name: 'index.ts', extension: '.ts' },
        { name: 'tsconfig.json', extension: '.json' }
      ]);

      const result = await detector.detectTags(structure);

      expect(result.fileTypeTags).toContain('typescript');
      expect(result.allTags).toContain('typescript');
      expect(result.confidence.typescript).toBeGreaterThan(0);
    });

    it('should detect JavaScript tags', async () => {
      const structure = createMockStructure([
        { name: 'index.js', extension: '.js' },
        { name: 'package.json', extension: '.json' }
      ]);

      const result = await detector.detectTags(structure);

      expect(result.fileTypeTags).toContain('javascript');
      expect(result.confidence.javascript).toBeGreaterThan(0);
    });

    it('should detect Python tags', async () => {
      const structure = createMockStructure([
        { name: 'main.py', extension: '.py' },
        { name: 'requirements.txt', extension: '.txt' }
      ]);

      const result = await detector.detectTags(structure);

      expect(result.fileTypeTags).toContain('python');
      expect(result.confidence.python).toBeGreaterThan(0);
    });

    it('should detect React framework tags', async () => {
      const structure = createMockStructure([
        { name: 'App.jsx', extension: '.jsx' },
        { name: 'component.tsx', extension: '.tsx' }
      ]);

      const packageJson = {
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' }
      };

      const result = await detector.detectTags(structure, packageJson);

      expect(result.frameworkTags).toContain('react');
      expect(result.confidence.react).toBeGreaterThan(0);
    });

    it('should detect Next.js framework tags', async () => {
      const structure = createMockStructure([
        { name: 'next.config.js', extension: '.js' }
      ]);
      structure.directories = [{
        path: '/test/pages',
        relativePath: 'pages',
        name: 'pages',
        extension: '',
        size: 0,
        isDirectory: true,
        isFile: false,
        lastModified: new Date()
      }];

      const packageJson = {
        dependencies: { next: '^13.0.0' }
      };

      const result = await detector.detectTags(structure, packageJson);

      expect(result.frameworkTags).toContain('nextjs');
      expect(result.confidence.nextjs).toBeGreaterThan(0);
    });

    it('should detect Docker tooling tags', async () => {
      const structure = createMockStructure([
        { name: 'Dockerfile', extension: '' },
        { name: 'docker-compose.yml', extension: '.yml' }
      ]);

      const result = await detector.detectTags(structure);

      expect(result.toolingTags).toContain('docker');
      expect(result.confidence.docker).toBeGreaterThan(0);
    });

    it('should detect AI/ML semantic tags', async () => {
      const structure = createMockStructure([
        { name: 'model.py', extension: '.py' },
        { name: 'train.py', extension: '.py' }
      ]);
      structure.directories = [{
        path: '/test/models',
        relativePath: 'models',
        name: 'models',
        extension: '',
        size: 0,
        isDirectory: true,
        isFile: false,
        lastModified: new Date()
      }];

      const packageJson = {
        dependencies: { tensorflow: '^2.0.0', pandas: '^1.0.0' }
      };

      const result = await detector.detectTags(structure, packageJson);

      expect(result.semanticTags).toContain('ai');
      expect(result.confidence.ai).toBeGreaterThan(0);
    });

    it('should detect documentation semantic tags', async () => {
      const structure = createMockStructure([
        { name: 'README.md', extension: '.md' },
        { name: 'CHANGELOG.md', extension: '.md' }
      ]);
      structure.directories = [{
        path: '/test/docs',
        relativePath: 'docs',
        name: 'docs',
        extension: '',
        size: 0,
        isDirectory: true,
        isFile: false,
        lastModified: new Date()
      }];

      const result = await detector.detectTags(structure);

      expect(result.semanticTags).toContain('documentation');
      expect(result.confidence.documentation).toBeGreaterThan(0);
    });

    it('should detect testing semantic tags', async () => {
      const structure = createMockStructure([
        { name: 'app.test.js', extension: '.js' },
        { name: 'jest.config.js', extension: '.js' }
      ]);
      structure.directories = [{
        path: '/test/__tests__',
        relativePath: '__tests__',
        name: '__tests__',
        extension: '',
        size: 0,
        isDirectory: true,
        isFile: false,
        lastModified: new Date()
      }];

      const packageJson = {
        devDependencies: { jest: '^29.0.0' }
      };

      const result = await detector.detectTags(structure, packageJson);

      expect(result.semanticTags).toContain('testing');
      expect(result.confidence.testing).toBeGreaterThan(0);
    });

    it('should detect content-based tags', async () => {
      const structure = createMockStructure([
        { 
          name: 'server.js', 
          extension: '.js',
          content: 'const express = require("express");'
        }
      ]);

      const result = await detector.detectTags(structure);

      expect(result.frameworkTags).toContain('express');
      expect(result.confidence.express).toBeGreaterThan(0);
    });

    it('should sort tags by confidence', async () => {
      const structure = createMockStructure([
        { name: 'index.ts', extension: '.ts' },
        { name: 'tsconfig.json', extension: '.json' },
        { name: 'App.tsx', extension: '.tsx' }
      ]);

      const packageJson = {
        dependencies: { 
          typescript: '^4.0.0',
          react: '^18.0.0',
          'react-dom': '^18.0.0'
        }
      };

      const result = await detector.detectTags(structure, packageJson);

      // Should have both TypeScript and React
      expect(result.fileTypeTags).toContain('typescript');
      expect(result.frameworkTags).toContain('react');
      
      // Tags should be sorted by confidence
      expect(result.allTags.length).toBeGreaterThan(0);
      for (let i = 1; i < result.allTags.length; i++) {
        const prevConfidence = result.confidence[result.allTags[i - 1]];
        const currentConfidence = result.confidence[result.allTags[i]];
        expect(prevConfidence).toBeGreaterThanOrEqual(currentConfidence);
      }
    });

    it('should filter out low confidence tags', async () => {
      const structure = createMockStructure([
        { name: 'random.txt', extension: '.txt' }
      ]);

      const result = await detector.detectTags(structure);

      // Should not include tags with very low confidence
      for (const tag of result.allTags) {
        expect(result.confidence[tag]).toBeGreaterThan(0.1);
      }
    });
  });

  describe('utility methods', () => {
    it('should get tag description', () => {
      const description = detector.getTagDescription('typescript');
      expect(description).toBe('TypeScript project');
    });

    it('should return tag name for unknown tags', () => {
      const description = detector.getTagDescription('unknown-tag');
      expect(description).toBe('unknown-tag');
    });

    it('should get available tags by category', () => {
      const tags = detector.getAvailableTags();
      
      expect(tags.fileType).toContain('typescript');
      expect(tags.fileType).toContain('javascript');
      expect(tags.framework).toContain('react');
      expect(tags.semantic).toContain('ai');
      expect(tags.tooling).toContain('docker');
    });
  });
});
