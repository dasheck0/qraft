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

### Fixed
- Package file inclusion and exclusion rules
- CI test failures on Node.js 18+ due to ES module import issues with chalk v5


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
  - Default registry configuration (dasheck0/unbox-templates)

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
- [Unreleased]: https://github.com/dasheck0/unbox/compare/v1.0.0...HEAD
- [1.0.0]: https://github.com/dasheck0/unbox/releases/tag/v1.0.0
