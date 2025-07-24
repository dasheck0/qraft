# PRD: Add gitignore Command to qraft CLI

## Introduction/Overview

Add a new `gitignore` command to the qraft CLI that automatically adds qraft-specific files and directories to the `.gitignore` file in the current directory. This command helps users properly exclude qraft-generated artifacts from version control without manually managing gitignore patterns.

Currently, users must manually add qraft-specific patterns to their `.gitignore` files, which can lead to accidentally committing temporary files, cache directories, or local configuration files that should not be tracked in version control.

## Goals

1. **Automate gitignore management**: Automatically add all qraft-related files and directories to `.gitignore`
2. **Prevent accidental commits**: Ensure qraft-generated artifacts are properly excluded from version control
3. **Maintain clean repositories**: Help users keep their repositories free of qraft-specific temporary files
4. **Provide safe defaults**: Only add patterns that are universally safe to ignore for qraft usage
5. **Handle existing files gracefully**: Detect and avoid duplicate entries in existing `.gitignore` files

## User Stories

1. **As a developer using qraft**, I want to quickly set up proper gitignore patterns so that I don't accidentally commit qraft-generated files to my repository.

2. **As a team lead**, I want to ensure all team members have consistent gitignore patterns for qraft-related files so that our repository stays clean.

3. **As a new qraft user**, I want the CLI to help me set up proper version control exclusions so that I don't have to research what files should be ignored.

4. **As an experienced developer**, I want to see what would be added to my gitignore before making changes so that I can review the patterns.

5. **As a developer with an existing project**, I want qraft to intelligently add only missing patterns to my existing `.gitignore` without creating duplicates.

## Functional Requirements

1. **Command Structure**: The command must be accessible as `qraft gitignore` with appropriate options and help text.

2. **Qraft-Specific Pattern Detection**: The command must identify and add patterns for:
   - `.qraft/` directory (local box metadata)
   - `~/.qraftrc` and `.qraftrc*` files (configuration files)
   - Cache directories (typically `~/.cache/qraft/` but configurable)
   - Any other qraft-generated artifacts that should not be committed

3. **File Creation with Permission**: When no `.gitignore` exists:
   - Create the file automatically by default
   - Support `--force` flag to skip confirmation prompts
   - Show clear messaging about file creation

4. **Duplicate Detection**: When `.gitignore` already exists:
   - Parse existing file to detect qraft-related patterns
   - Only add patterns that don't already exist
   - Preserve existing file structure and comments
   - Skip operation if all patterns already exist

5. **Pattern Organization**: Added patterns must be:
   - Grouped together with clear section headers
   - Commented to explain their purpose
   - Formatted consistently with common gitignore conventions

6. **Dry Run Support**: Support `--dry-run` flag that:
   - Shows what patterns would be added
   - Indicates whether file would be created or modified
   - Displays the exact content that would be added
   - Does not modify any files

7. **Error Handling**: The command must handle:
   - Permission errors when creating/modifying `.gitignore`
   - Invalid file formats or corrupted `.gitignore` files
   - Missing parent directories
   - Read-only file systems

8. **Verbose Output**: Provide clear feedback about:
   - What patterns were added
   - What patterns were skipped (already exist)
   - File creation vs. modification
   - Location of the modified `.gitignore` file

## Non-Goals (Out of Scope)

1. **General Development Patterns**: Will not add non-qraft patterns like `node_modules/`, `*.log`, etc.
2. **Project Type Detection**: Will not detect project type (Node.js, Python, etc.) to add language-specific patterns
3. **Global Gitignore Management**: Will not modify global git configuration or global gitignore files
4. **Gitignore Validation**: Will not validate existing gitignore syntax or fix malformed files
5. **Pattern Removal**: Will not provide functionality to remove qraft patterns from gitignore
6. **Custom Pattern Addition**: Will not allow users to specify custom patterns through this command

## Technical Considerations

1. **File System Operations**: Use `fs-extra` for consistent file operations with proper error handling
2. **Pattern Matching**: Implement robust duplicate detection that handles various gitignore pattern formats
3. **Cross-Platform Compatibility**: Ensure patterns work correctly on Windows, macOS, and Linux
4. **Configuration Integration**: Read cache directory and other configurable paths from qraft configuration
5. **Command Integration**: Follow existing qraft CLI patterns for command structure and error handling

## Success Metrics

1. **Adoption Rate**: Track usage of the gitignore command through CLI analytics (if available)
2. **Error Reduction**: Reduce support requests related to accidentally committed qraft files
3. **User Satisfaction**: Positive feedback on ease of gitignore setup
4. **Pattern Accuracy**: Zero false positives (patterns that shouldn't be ignored) in generated patterns

## Open Questions

1. Should the command support removing qraft patterns from gitignore in the future?
2. Should there be integration with `qraft create` to automatically suggest running `gitignore`?
3. How should the command handle very large existing gitignore files (performance considerations)?
4. Should the command support custom comment formatting to match existing gitignore style?
