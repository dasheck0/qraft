# Tasks: Add --no-sync Flag to Copy Command

## Relevant Files

- `src/cli.ts` - CLI command definition where the new --no-sync flag needs to be added
- `src/commands/copy.ts` - Copy command implementation that needs to handle the new flag
- `src/commands/copy.test.ts` - Unit tests for copy command functionality
- `src/types.ts` - Type definitions that need to be updated for new interfaces
- `src/core/boxManager.ts` - Core logic for copying boxes that needs conditional manifest storage
- `src/core/boxManager.test.ts` - Unit tests for BoxManager functionality
- `src/interactive/interactiveMode.ts` - Interactive mode that needs sync preference prompts
- `src/interactive/interactiveMode.test.ts` - Unit tests for interactive mode functionality

### Notes

- Unit tests should typically be placed alongside the code files they are testing
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration
- Ensure 100% test coverage for new functionality as per user requirements
- All existing tests must continue to pass to maintain backward compatibility

## Tasks

- [x] 1.0 Update CLI Interface and Type Definitions
  - [x] 1.1 Add --no-sync flag (with -n alias) to copy command in src/cli.ts
  - [x] 1.2 Update CopyOptions interface in src/commands/copy.ts to include noSync property
  - [x] 1.3 Update BoxOperationConfig interface in src/types.ts to include optional noSync property
  - [x] 1.4 Update command description and help text to document the new flag
- [x] 2.0 Implement Core Logic Changes in BoxManager
  - [x] 2.1 Modify BoxManager.copyBox() method to accept noSync parameter
  - [x] 2.2 Add conditional logic to skip storeManifestLocally() when noSync is true
  - [x] 2.3 Ensure file copying functionality works identically regardless of sync setting
  - [x] 2.4 Update copyBoxByName() method to support noSync parameter
- [x] 3.0 Update Copy Command Handler
  - [x] 3.1 Pass noSync option from CLI to BoxManager in copy command
  - [x] 3.2 Update non-interactive copy workflow to handle noSync flag
  - [x] 3.3 Ensure backward compatibility - default behavior unchanged when flag not provided
- [x] 4.0 Enhance Interactive Mode with Sync Preferences
  - [x] 4.1 Add sync preference prompt to InteractiveMode.copyBox() method
  - [x] 4.2 Update interactive workflow to respect explicit --no-sync flag when provided
  - [x] 4.3 Pass user's sync preference choice to BoxManager
  - [x] 4.4 Handle sync preference in interactive mode configuration
- [x] 5.0 Update Output Messages and User Experience
  - [x] 5.1 Modify success messages to indicate sync tracking status
  - [x] 5.2 Add informational message when no-sync mode is used
  - [x] 5.3 Update existing sync-enabled messages to be more explicit
  - [x] 5.4 Ensure consistent messaging across interactive and non-interactive modes
