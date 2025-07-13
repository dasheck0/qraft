import { FileComparison } from './contentComparison';

export interface DiffLine {
  type: 'context' | 'added' | 'deleted' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'unchanged';
  oldPath?: string | undefined;
  hunks: DiffHunk[];
  isBinary: boolean;
  similarity?: number | undefined;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: FileDiff[];
}

export class DiffGenerator {
  generateDiff(comparison: FileComparison): FileDiff {
    const fileDiff: FileDiff = {
      path: comparison.path,
      status: comparison.status,
      hunks: [],
      isBinary: this.isBinaryFile(comparison),
      similarity: comparison.similarity
    };

    if (comparison.status === 'added') {
      fileDiff.hunks = this.generateAddedFileDiff(comparison);
    } else if (comparison.status === 'deleted') {
      fileDiff.hunks = this.generateDeletedFileDiff(comparison);
    } else if (comparison.status === 'modified' && !fileDiff.isBinary) {
      fileDiff.hunks = this.generateModifiedFileDiff(comparison);
    }

    return fileDiff;
  }

  generateMultipleDiffs(comparisons: FileComparison[]): DiffSummary {
    const files: FileDiff[] = [];
    let insertions = 0;
    let deletions = 0;

    for (const comparison of comparisons) {
      if (comparison.status !== 'unchanged') {
        const fileDiff = this.generateDiff(comparison);
        files.push(fileDiff);

        // Count insertions and deletions
        for (const hunk of fileDiff.hunks) {
          for (const line of hunk.lines) {
            if (line.type === 'added') insertions++;
            if (line.type === 'deleted') deletions++;
          }
        }
      }
    }

    return {
      filesChanged: files.length,
      insertions,
      deletions,
      files
    };
  }

  private isBinaryFile(comparison: FileComparison): boolean {
    // Check file extensions that are typically binary
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
    ];

    const extension = comparison.newFile?.extension || comparison.oldFile?.extension || '';
    if (binaryExtensions.includes(extension.toLowerCase())) {
      return true;
    }

    // Check for binary content markers
    const content = comparison.newFile?.content || comparison.oldFile?.content;
    if (content && this.containsBinaryData(content)) {
      return true;
    }

    return false;
  }

  private containsBinaryData(content: string): boolean {
    // Simple heuristic: if content contains null bytes or high percentage of non-printable chars
    if (content.includes('\0')) return true;

    let nonPrintable = 0;
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
      const char = content.charCodeAt(i);
      if (char < 32 && char !== 9 && char !== 10 && char !== 13) {
        nonPrintable++;
      }
    }

    return nonPrintable / Math.min(content.length, 1000) > 0.1;
  }

  private generateAddedFileDiff(comparison: FileComparison): DiffHunk[] {
    if (!comparison.newFile?.content) {
      return [{
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: 1,
        lines: [{
          type: 'added',
          content: '(Binary file or no content)',
          newLineNumber: 1
        }]
      }];
    }

    const lines = comparison.newFile.content.split('\n');
    const diffLines: DiffLine[] = lines.map((line, index) => ({
      type: 'added' as const,
      content: line,
      newLineNumber: index + 1
    }));

    return [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: lines.length,
      lines: diffLines
    }];
  }

  private generateDeletedFileDiff(comparison: FileComparison): DiffHunk[] {
    if (!comparison.oldFile?.content) {
      return [{
        oldStart: 1,
        oldCount: 1,
        newStart: 0,
        newCount: 0,
        lines: [{
          type: 'deleted',
          content: '(Binary file or no content)',
          oldLineNumber: 1
        }]
      }];
    }

    const lines = comparison.oldFile.content.split('\n');
    const diffLines: DiffLine[] = lines.map((line, index) => ({
      type: 'deleted' as const,
      content: line,
      oldLineNumber: index + 1
    }));

    return [{
      oldStart: 1,
      oldCount: lines.length,
      newStart: 0,
      newCount: 0,
      lines: diffLines
    }];
  }

  private generateModifiedFileDiff(comparison: FileComparison): DiffHunk[] {
    if (!comparison.oldFile?.content || !comparison.newFile?.content) {
      return [];
    }

    const oldLines = comparison.oldFile.content.split('\n');
    const newLines = comparison.newFile.content.split('\n');

    return this.computeDiff(oldLines, newLines);
  }

  private computeDiff(oldLines: string[], newLines: string[]): DiffHunk[] {
    // Simple diff algorithm using Myers' algorithm (simplified version)
    const lcs = this.longestCommonSubsequence(oldLines, newLines);
    const hunks: DiffHunk[] = [];
    
    let oldIndex = 0;
    let newIndex = 0;
    let currentHunk: DiffHunk | null = null;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex];
      const newLine = newLines[newIndex];

      if (oldIndex < oldLines.length && newIndex < newLines.length && oldLine === newLine) {
        // Lines match - add context
        if (currentHunk) {
          currentHunk.lines.push({
            type: 'context',
            content: oldLine,
            oldLineNumber: oldIndex + 1,
            newLineNumber: newIndex + 1
          });
        }
        oldIndex++;
        newIndex++;
      } else {
        // Lines differ - start new hunk if needed
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldIndex + 1,
            oldCount: 0,
            newStart: newIndex + 1,
            newCount: 0,
            lines: []
          };
        }

        // Add context before changes
        const contextBefore = Math.max(0, oldIndex - 3);
        for (let i = contextBefore; i < oldIndex; i++) {
          if (!currentHunk.lines.some(l => l.oldLineNumber === i + 1)) {
            currentHunk.lines.unshift({
              type: 'context',
              content: oldLines[i],
              oldLineNumber: i + 1,
              newLineNumber: i + 1
            });
          }
        }

        // Handle deletions
        if (oldIndex < oldLines.length && (newIndex >= newLines.length || !this.isInLCS(oldIndex, newIndex, lcs))) {
          currentHunk.lines.push({
            type: 'deleted',
            content: oldLine,
            oldLineNumber: oldIndex + 1
          });
          currentHunk.oldCount++;
          oldIndex++;
        }

        // Handle additions
        if (newIndex < newLines.length && (oldIndex >= oldLines.length || !this.isInLCS(oldIndex, newIndex, lcs))) {
          currentHunk.lines.push({
            type: 'added',
            content: newLine,
            newLineNumber: newIndex + 1
          });
          currentHunk.newCount++;
          newIndex++;
        }

        // If we've processed changes, finalize the hunk
        if (currentHunk.lines.length > 0 && (oldIndex >= oldLines.length || newIndex >= newLines.length || oldLines[oldIndex] === newLines[newIndex])) {
          hunks.push(currentHunk);
          currentHunk = null;
        }
      }
    }

    // Add final hunk if exists
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  private longestCommonSubsequence(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;
    const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          lcs[i][j] = lcs[i - 1][j - 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
      }
    }

    return lcs;
  }

  private isInLCS(oldIndex: number, newIndex: number, lcs: number[][]): boolean {
    // Simplified check - in a real implementation, you'd trace back through the LCS
    return oldIndex < lcs.length - 1 && newIndex < lcs[0].length - 1 && 
           lcs[oldIndex + 1][newIndex + 1] > lcs[oldIndex][newIndex];
  }

  // Format diff as git-style text
  formatDiff(fileDiff: FileDiff): string {
    const lines: string[] = [];

    // File header
    if (fileDiff.status === 'added') {
      lines.push(`diff --git a/${fileDiff.path} b/${fileDiff.path}`);
      lines.push('new file mode 100644');
      lines.push(`index 0000000..${this.generateShortHash()}`);
      lines.push(`--- /dev/null`);
      lines.push(`+++ b/${fileDiff.path}`);
    } else if (fileDiff.status === 'deleted') {
      lines.push(`diff --git a/${fileDiff.path} b/${fileDiff.path}`);
      lines.push('deleted file mode 100644');
      lines.push(`index ${this.generateShortHash()}..0000000`);
      lines.push(`--- a/${fileDiff.path}`);
      lines.push(`+++ /dev/null`);
    } else {
      lines.push(`diff --git a/${fileDiff.path} b/${fileDiff.path}`);
      lines.push(`index ${this.generateShortHash()}..${this.generateShortHash()} 100644`);
      lines.push(`--- a/${fileDiff.path}`);
      lines.push(`+++ b/${fileDiff.path}`);
    }

    if (fileDiff.isBinary) {
      lines.push('Binary files differ');
      return lines.join('\n');
    }

    // Hunks
    for (const hunk of fileDiff.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
      
      for (const line of hunk.lines) {
        let prefix = ' ';
        if (line.type === 'added') prefix = '+';
        if (line.type === 'deleted') prefix = '-';
        
        lines.push(`${prefix}${line.content}`);
      }
    }

    return lines.join('\n');
  }

  private generateShortHash(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  // Generate summary statistics
  generateSummaryText(summary: DiffSummary): string {
    const parts: string[] = [];

    if (summary.filesChanged === 1) {
      parts.push('1 file changed');
    } else {
      parts.push(`${summary.filesChanged} files changed`);
    }

    if (summary.insertions > 0) {
      parts.push(`${summary.insertions} insertion${summary.insertions === 1 ? '' : 's'}(+)`);
    }

    if (summary.deletions > 0) {
      parts.push(`${summary.deletions} deletion${summary.deletions === 1 ? '' : 's'}(-)`);
    }

    return parts.join(', ');
  }

  // Get diff statistics for a single file
  getFileDiffStats(fileDiff: FileDiff): { insertions: number; deletions: number } {
    let insertions = 0;
    let deletions = 0;

    for (const hunk of fileDiff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'added') insertions++;
        if (line.type === 'deleted') deletions++;
      }
    }

    return { insertions, deletions };
  }
}
