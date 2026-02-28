import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Built-in patterns that are always ignored when uploading a box.
 * These cover the most common cases that must never end up in a registry.
 */
const BUILTIN_IGNORE_PATTERNS: string[] = [
  // qraft metadata – never upload box tracking info
  '.qraft',
  '.qraft/',

  // Version control
  '.git',
  '.svn',
  '.hg',

  // Dependency directories
  'node_modules',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'env',

  // Build outputs
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',

  // Test / coverage artefacts
  'coverage',
  '.nyc_output',
  '.pytest_cache',

  // Caches
  '.cache',
  '.parcel-cache',

  // Temporary directories
  'tmp',
  'temp',
  '.tmp',

  // IDE / OS noise
  '.vscode',
  '.idea',
  '.DS_Store',
  'Thumbs.db',

  // Log files
  '*.log',

  // Compiled artefacts
  '*.pyc',
  '*.pyo',
  '*.class',
];

/**
 * Name of the project-level ignore file users can create.
 */
export const QRAFTIGNORE_FILENAME = '.qraftignore';

/**
 * Reads and parses a `.qraftignore` file, stripping comments and blank lines.
 * Returns an empty array if the file does not exist.
 */
async function loadQraftIgnoreFile(projectRoot: string): Promise<string[]> {
  const filePath = path.join(projectRoot, QRAFTIGNORE_FILENAME);

  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, 'utf-8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Converts a glob-style pattern (supporting `*` wildcards) to a RegExp.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special regex chars
    .replace(/\*/g, '.*'); // glob * → .*
  return new RegExp(`^${escaped}$`);
}

/**
 * Returns `true` when `segment` matches `pattern`.
 * Patterns without wildcards are compared as exact strings.
 */
function matchesSegment(segment: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    return patternToRegex(pattern).test(segment);
  }
  return segment === pattern;
}

/**
 * Determines whether a relative file path should be ignored.
 *
 * Rules applied in order:
 * 1. Each path segment is checked against every pattern.
 * 2. A leading slash in a pattern anchors it to the root of the scanned tree.
 * 3. Patterns without a slash match against any individual segment.
 *
 * @param relativePath  Forward-slash path relative to the scanned root.
 * @param patterns      Combined list of built-in + user-provided patterns.
 */
export function shouldIgnorePath(relativePath: string, patterns: string[]): boolean {
  const normalised = relativePath.replace(/\\/g, '/').replace(/\/$/, '');
  const segments = normalised.split('/');

  for (const raw of patterns) {
    const pattern = raw.replace(/\/$/, ''); // strip trailing slash — we match names

    if (pattern.startsWith('/')) {
      // Anchored pattern: match only against the first segment (root-level)
      const anchored = pattern.slice(1);
      if (matchesSegment(segments[0], anchored)) {
        return true;
      }
    } else if (pattern.includes('/')) {
      // Pattern with a slash but not anchored: match against the full path
      if (patternToRegex(pattern).test(normalised)) {
        return true;
      }
    } else {
      // Simple pattern: match against each individual path segment
      if (segments.some(seg => matchesSegment(seg, pattern))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * QraftIgnore combines built-in ignore rules with an optional per-project
 * `.qraftignore` file to decide which files to exclude when creating or
 * updating a box.
 *
 * Usage:
 * ```ts
 * const ignore = await QraftIgnore.create('/path/to/project');
 * if (!ignore.ignores('node_modules/lodash/index.js')) {
 *   // include file
 * }
 * ```
 */
export class QraftIgnore {
  private readonly patterns: string[];

  private constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  /**
   * Creates a QraftIgnore instance for the given project root.
   * Merges built-in patterns with patterns from `.qraftignore` (if present).
   *
   * @param projectRoot  Absolute path to the directory being scanned.
   */
  static async create(projectRoot: string): Promise<QraftIgnore> {
    const userPatterns = await loadQraftIgnoreFile(projectRoot);
    const combined = [...BUILTIN_IGNORE_PATTERNS, ...userPatterns];
    return new QraftIgnore(combined);
  }

  /**
   * Returns `true` if the given relative path should be excluded from the box.
   *
   * @param relativePath  Path relative to the project root (forward slashes).
   */
  ignores(relativePath: string): boolean {
    return shouldIgnorePath(relativePath, this.patterns);
  }

  /**
   * Returns all active patterns (built-in + user-defined).
   */
  getPatterns(): string[] {
    return [...this.patterns];
  }

  /**
   * Returns only the built-in patterns (useful for display / debugging).
   */
  static getBuiltinPatterns(): string[] {
    return [...BUILTIN_IGNORE_PATTERNS];
  }
}
