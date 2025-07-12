import { SensitiveFileDetector } from './sensitiveFileDetector';
import { FileInfo } from './directoryScanner';

describe('SensitiveFileDetector', () => {
  let detector: SensitiveFileDetector;

  beforeEach(() => {
    detector = new SensitiveFileDetector();
  });

  const createMockFile = (overrides: Partial<FileInfo>): FileInfo => ({
    path: '/test/file',
    relativePath: 'file',
    name: 'file',
    extension: '',
    size: 100,
    isDirectory: false,
    isFile: true,
    lastModified: new Date(),
    ...overrides
  });

  describe('detectSensitiveFiles', () => {
    it('should detect .env files as critical', () => {
      const files = [
        createMockFile({ name: '.env', relativePath: '.env' }),
        createMockFile({ name: 'normal.txt', relativePath: 'normal.txt' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.severityCounts.critical).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('critical');
      expect(result.sensitiveFiles[0].reasons).toContain('Environment file with potential secrets');
    });

    it('should detect environment-specific .env files', () => {
      const files = [
        createMockFile({ name: '.env.local', relativePath: '.env.local' }),
        createMockFile({ name: '.env.production', relativePath: '.env.production' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(2);
      expect(result.severityCounts.critical).toBe(2);
    });

    it('should detect API keys in content', () => {
      const files = [
        createMockFile({
          name: 'config.js',
          content: 'const API_KEY = "sk-1234567890abcdef";'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('critical');
      expect(result.sensitiveFiles[0].reasons).toContain('Potential API key in file content');
    });

    it('should detect AWS access keys', () => {
      const files = [
        createMockFile({
          name: 'aws-config.json',
          content: '{"accessKeyId": "AKIAIOSFODNN7EXAMPLE"}'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('critical');
      expect(result.sensitiveFiles[0].reasons).toContain('AWS Access Key ID detected');
    });

    it('should detect private keys', () => {
      const files = [
        createMockFile({
          name: 'private.key',
          content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('critical');
      expect(result.sensitiveFiles[0].reasons).toContain('Private key detected in file');
    });

    it('should detect GitHub tokens', () => {
      const files = [
        createMockFile({
          name: 'deploy.sh',
          content: 'export GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef123456'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('high');
      expect(result.sensitiveFiles[0].reasons).toContain('GitHub personal access token');
    });

    it('should detect database URLs', () => {
      const files = [
        createMockFile({
          name: 'database.js',
          content: 'const DATABASE_URL = "mongodb://user:pass@localhost:27017/db";'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('high');
      expect(result.sensitiveFiles[0].reasons).toContain('MongoDB connection string with credentials');
    });

    it('should detect hardcoded passwords', () => {
      const files = [
        createMockFile({
          name: 'auth.js',
          content: 'const password = "mySecretPassword123";'
        })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(1);
      expect(result.sensitiveFiles[0].severity).toBe('high');
      expect(result.sensitiveFiles[0].reasons).toContain('Hardcoded password detected');
    });

    it('should detect SSH private keys by filename', () => {
      const files = [
        createMockFile({ name: 'id_rsa', relativePath: '.ssh/id_rsa' }),
        createMockFile({ name: 'id_ed25519', relativePath: '.ssh/id_ed25519' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(2);
      expect(result.severityCounts.high).toBe(2);
    });

    it('should detect PEM and key files by extension', () => {
      const files = [
        createMockFile({ name: 'cert.pem', extension: '.pem' }),
        createMockFile({ name: 'private.key', extension: '.key' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(2);
      expect(result.severityCounts.high).toBe(2);
    });

    it('should detect configuration files as medium risk', () => {
      const files = [
        createMockFile({ name: 'config.json', extension: '.json' }),
        createMockFile({ name: 'config.yaml', extension: '.yaml' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(2);
      expect(result.severityCounts.medium).toBe(2);
    });

    it('should handle multiple severity levels correctly', () => {
      const files = [
        createMockFile({ name: '.env' }), // critical
        createMockFile({ name: 'id_rsa' }), // high
        createMockFile({ name: 'config.json', extension: '.json' }), // medium
        createMockFile({ name: 'normal.txt' }) // none
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(3);
      expect(result.severityCounts.critical).toBe(1);
      expect(result.severityCounts.high).toBe(1);
      expect(result.severityCounts.medium).toBe(1);
      expect(result.severityCounts.low).toBe(0);
    });

    it('should provide appropriate recommendations', () => {
      const files = [
        createMockFile({ name: '.env' }), // critical
        createMockFile({ name: 'id_rsa' }) // high
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.recommendations).toContain('🚨 CRITICAL: Remove all critical sensitive files before creating the box');
      expect(result.recommendations).toContain('⚠️  HIGH: Review and secure high-risk files');
      expect(result.recommendations).toContain('📋 Add sensitive files to .gitignore');
    });

    it('should not flag normal files', () => {
      const files = [
        createMockFile({ name: 'README.md', content: 'This is a readme file' }),
        createMockFile({ name: 'index.js', content: 'console.log("Hello world");' }),
        createMockFile({ name: 'package.json', content: '{"name": "test"}' })
      ];

      const result = detector.detectSensitiveFiles(files);

      expect(result.totalSensitiveFiles).toBe(0);
      expect(result.recommendations).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should check if individual file is sensitive', () => {
      const sensitiveFile = createMockFile({ name: '.env' });
      const normalFile = createMockFile({ name: 'README.md' });

      expect(detector.isFileSensitive(sensitiveFile)).toBe(true);
      expect(detector.isFileSensitive(normalFile)).toBe(false);
    });

    it('should get patterns by severity', () => {
      const criticalPatterns = detector.getPatternsBySeverity('critical');
      const highPatterns = detector.getPatternsBySeverity('high');

      expect(criticalPatterns.length).toBeGreaterThan(0);
      expect(highPatterns.length).toBeGreaterThan(0);
      expect(criticalPatterns.every(p => p.severity === 'critical')).toBe(true);
      expect(highPatterns.every(p => p.severity === 'high')).toBe(true);
    });
  });
});
