# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial documentation and npm package preparation

### Changed
- Improved package configuration for npm publishing
- Downgraded chalk from v5 to v4 for CommonJS compatibility
- Renamed project from "unbox" to "qraft" for npm availability

### Fixed
- Package file inclusion and exclusion rules
- CI test failures on Node.js 18+ due to ES module import issues with chalk v5
















## [1.1.6] - 2025-07-24

### Maintenance
- Merge branch 'feature/add-gitignore-command' into develop

## [1.1.5] - 2025-07-24

### Added
- implement core gitignore management utility

### Maintenance
- changes

## [1.1.4] - 2025-07-22

### Fixed
- allow nested directories in registry

## [1.1.3] - 2025-07-22

### Fixed
- correct --no-sync flag logic in copy command

### Maintenance
- rename --no-sync to --nosync

## [1.1.2] - 2025-07-22

### Maintenance
- set proper version
- update dependencies

## [1.1.1] - 2025-07-22

### Added
- update output messages to indicate sync tracking status
- enhance interactive mode with sync preference prompts and --nosync support
- update copy command handler to pass noSync option to BoxManager
- implement core BoxManager logic for --nosync functionality
- add --nosync flag to copy command CLI interface and types

### Maintenance
- update task list

## [1.1.0] - 2025-07-13

### Added
- implement update workflow with automatic detection
- achieve 100% test success for Strategy 1 implementation
- implement Strategy 1 - Separate Box Name and Remote Path
- add manifest synchronization capabilities to CacheManager
- add manifest storage to RepositoryManager box creation
- integrate manifest synchronization into BoxManager
- add manifest conflict resolution to conflict resolution system
- extend content comparison with manifest comparison support
- add manifest utilities and manager for local manifest operations
- enhance RepositoryManager with automatic default branch detection
- implement truly interactive create command with inquirer
- implement complete box creation functionality with RepositoryManager
- complete task 5.6 - integrated create command workflow architecture
- complete tasks 5.3-5.4 - confirmation workflows and metadata overrides
- complete tasks 5.1-5.2 - interactive UX with metadata prompts and progress indicators
- complete task 4.0 - comprehensive repository management and permission handling
- complete task 3.0 - comprehensive conflict resolution and diff visualization
- complete task 2.0 - advanced metadata generation and box name derivation
- implement smart directory processing and detection (task 2.0)
- implement core create command infrastructure (task 1.0)

### Fixed
- resolve test compatibility issues for Strategy 1
- update tests to match simplified BoxManifest structure
- correct default registry format to owner/repository pattern
- achieve 100% test success rate by fixing readline mocking in create.test.ts
- resolve test failures and improve test reliability

### Documentation
- update documentation
- update README with create command and .qraft directory documentation
- update task documentation to reflect completed manifest sync features
- add section to why qraft

### Changed
- simplify BoxManifest structure by removing unnecessary fields

### Tests
- add comprehensive tests for manifest synchronization features
- fix tests

### Maintenance
- Merge branch 'feature/add-create-command' into develop
- remove some files from vcs
- make generated commit messages commitlint compliant

## [1.0.8] - 2025-07-08

### Fixed
- swallow error

## [1.0.7] - 2025-07-08

### Added
- complete project rename from qreate to qraft

### Maintenance
- rename author

## [1.0.6] - 2025-07-08

### Maintenance
- rename again

## [1.0.5] - 2025-07-08

### Added
- complete project rename from unbox to qreate

### Changed
- rename

### Maintenance
- add logo

## [1.0.4] - 2025-07-08

### Changed
- rename token to comply with github

## [1.0.3] - 2025-07-08

### Fixed
- do not create tag in ci

## [1.0.2] - 2025-07-08

### Fixed
- resolve YAML syntax errors in GitHub Actions workflow

## [1.0.1] - 2025-07-08

### Added
- add automated release script and streamline CI workflow
- complete documentation and npm package deployment preparation
- implement comprehensive interactive mode for all CLI commands
- add comprehensive test suite and project configuration
- implement complete CLI interface with all commands
- complete github registry integration with authentication
- implement core box management system
- complete project setup and configuration

### Fixed
- clean up github actions
- downgrade chalk to v4 for CommonJS compatibility
- resolve file discovery and defaultTarget issues

### Documentation
- update CHANGELOG with chalk downgrade fix
- fix issues in readme file
- add project ideas and notes file

### Maintenance
- set correct commit message in release
- add release script
- remove node 18
- remove node 16
- add pre commit hook
- initial commit

## [1.0.0] - 2024-07-07

### Added
- **Core Features**
  - GitHub integration for pulling templates from remote repositories
  - Template box system with manifest.json support
  - Interactive mode with inquirer.js for browsing and selecting templates
  - Registry support for multiple template sources
  - Local caching system for improved performance
  - Authentication support for private GitHub repositories

- **CLI Commands**
  - `copy <box>` - Copy template boxes to target directories
  - `list` - List available template boxes with descriptions
  - `info <box>` - Show detailed information about template boxes
  - `config` - Manage configuration settings and registries
  - `auth` - Manage GitHub authentication
  - `cache` - Manage local cache

- **Configuration Management**
  - Global configuration file support (.unboxrc)
  - Registry configuration with custom GitHub repositories
  - Token management for private repository access
  - Default registry configuration (dasheck0/qraft-templates)

- **Developer Experience**
  - TypeScript implementation with full type safety
  - Comprehensive test suite with Jest
  - Modular architecture with separation of concerns
  - Verbose logging support for debugging
  - Error handling with user-friendly messages

- **Template Features**
  - Manifest.json metadata support
  - Default target directory configuration
  - File overwrite protection with force flag
  - Template preview functionality
  - Box reference formats (boxname, registry/boxname, owner/repo/boxname)

### Technical Implementation
- Node.js CLI tool with commander.js
- GitHub API integration with @octokit/rest
- File operations with fs-extra
- Interactive prompts with inquirer
- Styled console output with chalk
- Local caching with configurable cache directory
- TypeScript compilation to JavaScript for distribution

### Documentation
- Comprehensive README with usage examples
- API documentation for all commands
- Configuration guide for registries and authentication
- Troubleshooting section for common issues

### Build and Distribution
- NPM package configuration with proper bin entry
- TypeScript compilation pipeline
- Jest testing configuration
- GitHub Actions CI/CD pipeline
- Automated publishing workflow

---

## Release Notes Format

### Types of Changes
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Version Numbering
This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

### Links
- [Unreleased]: https://github.com/dasheck0/qraft/compare/v1.0.0...HEAD
- [1.0.0]: https://github.com/dasheck0/qraft/releases/tag/v1.0.0
