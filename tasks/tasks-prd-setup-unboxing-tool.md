# Tasks for `unbox` Template Unboxer CLI

Based on the PRD: `prd-setup-unboxing-tool.md`

## Relevant Files

- `src/cli.ts` - Main CLI entry point that handles command parsing and routing
- `src/cli.test.ts` - Unit tests for CLI functionality
- `src/core/boxManager.ts` - Core logic for managing boxes (listing, copying, validation)
- `src/core/boxManager.test.ts` - Unit tests for box management
- `src/core/fileOperations.ts` - File system operations (copying, overwrite protection)
- `src/core/fileOperations.test.ts` - Unit tests for file operations
- `src/interactive/inquirer.ts` - Interactive mode implementation using inquirer
- `src/interactive/inquirer.test.ts` - Unit tests for interactive mode
- `src/utils/console.ts` - Styled console output utilities using chalk
- `src/utils/console.test.ts` - Unit tests for console utilities
- `src/types/index.ts` - TypeScript type definitions for the project
- `package.json` - Package configuration with dependencies and bin entry
- `bin/unbox.js` - Compiled executable script for npx usage
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Jest configuration for TypeScript testing
- `boxes/` - Directory containing template boxes
- `boxes/.tasks/manifest.json` - Manifest for .tasks box
- `boxes/n8n/manifest.json` - Manifest for n8n box
- `boxes/readme/manifest.json` - Manifest for readme box
- `README.md` - Project documentation and usage instructions
- `.npmignore` - Files to exclude from npm package
- `.github/workflows/publish.yml` - GitHub Action for automated npm publishing
- `CHANGELOG.md` - Version history and release notes

### Notes

- Unit tests should be placed alongside the code files they are testing
- Use `npm test` to run all tests (Jest with TypeScript support)
- TypeScript files in `src/` will be compiled to `dist/` for distribution
- The `boxes/` directory will contain subdirectories for each template box
- Each box directory must contain a `manifest.json` file with metadata
- The executable `bin/unbox.js` will reference the compiled TypeScript output

## Tasks

- [ ] 1.0 Project Setup and Configuration
  - [ ] 1.1 Initialize Node.js project with TypeScript configuration
  - [ ] 1.2 Install and configure dependencies (commander, inquirer, chalk, fs-extra)
  - [ ] 1.3 Install and configure development dependencies (TypeScript, Jest, @types packages)
  - [ ] 1.4 Set up TypeScript configuration (tsconfig.json) with appropriate compiler options
  - [ ] 1.5 Configure Jest for TypeScript testing (jest.config.js)
  - [ ] 1.6 Set up package.json with proper bin entry and build scripts
  - [ ] 1.7 Create basic project directory structure (src/, dist/, boxes/, bin/)
- [ ] 2.0 Core Box Management System
  - [ ] 2.1 Define TypeScript interfaces for Box manifest and configuration
  - [ ] 2.2 Implement box discovery and listing functionality
  - [ ] 2.3 Implement manifest.json parsing and validation
  - [ ] 2.4 Create file operations module with overwrite protection
  - [ ] 2.5 Implement box copying logic with target directory support
  - [ ] 2.6 Add error handling for missing boxes and invalid operations
- [ ] 3.0 CLI Interface Implementation
  - [ ] 3.1 Set up commander.js for command parsing and routing
  - [ ] 3.2 Implement basic box pulling command (npx unbox <boxname>)
  - [ ] 3.3 Implement directory-specific pulling (npx unbox --dir <dirname>)
  - [ ] 3.4 Add target directory option (--target flag)
  - [ ] 3.5 Implement force overwrite flag (--force)
  - [ ] 3.6 Create list command for available boxes (npx unbox list)
  - [ ] 3.7 Add help and version commands
- [ ] 4.0 Interactive Mode Development
  - [ ] 4.1 Set up inquirer.js for interactive prompts
  - [ ] 4.2 Create box selection interface with descriptions
  - [ ] 4.3 Implement box preview functionality
  - [ ] 4.4 Add confirmation prompts for file operations
  - [ ] 4.5 Integrate interactive mode with core box management
- [ ] 5.0 Template Boxes Creation and Testing
  - [ ] 5.1 Create .tasks box with manifest.json and sample files
  - [ ] 5.2 Create n8n box with manifest.json and relevant templates
  - [ ] 5.3 Create readme box with manifest.json and documentation templates
  - [ ] 5.4 Write comprehensive unit tests for all core modules
  - [ ] 5.5 Write integration tests for CLI commands
  - [ ] 5.6 Test interactive mode functionality
- [ ] 6.0 Documentation and NPM Package Deployment Preparation
  - [ ] 6.1 Write comprehensive README.md with installation and usage instructions
  - [ ] 6.2 Create .npmignore file to exclude development files from package
  - [ ] 6.3 Set up GitHub Actions workflow for automated testing and publishing
  - [ ] 6.4 Create CHANGELOG.md for version tracking
  - [ ] 6.5 Configure package.json for proper npm publishing (files, keywords, etc.)
  - [ ] 6.6 Add TypeScript declaration files generation to build process
  - [ ] 6.7 Test package installation and usage via npx locally
  - [ ] 6.8 Prepare for initial npm package publication
