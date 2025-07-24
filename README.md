<div align="left" style="margin-bottom: 16px;">
  <img src="logo.png" alt="Qraft CLI Logo" width="200" height="auto">
</div>

# Qraft CLI

A powerful CLI tool to qraft structured project setups from GitHub template repositories. Pull standardized project templates, documentation scaffolds, and reusable resources from GitHub repositories at any stage of development.

[![npm version](https://badge.fury.io/js/qraft.svg)](https://badge.fury.io/js/qraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why qraft?

We often use the same files and templates for our projects. This ranges from simple markdown files, to configuration files 
or specifc code. Often so small that you don't want to build a generator for it. But still want to have a consistent 
structure and not have to copy and paste files around. Here comes qraft to the rescue. qraft is a tool to pull files and
directories from repositories into your project. It's like a poor man's generator. See more later in the documentation 
on how to register your own repositories as template sources and how to pull files from it. Here is an example repository
that contains real world templates, we use for our projects: https://github.com/dasheck0/qraft-templates.

We chose the name **qraft** as a purposeful twist on “craft.” It reflects the tool’s purpose: to help developers _craft_ structured project setups quickly and consistently using modular templates. The “q” adds uniqueness and avoids naming collisions, while still being short, intuitive, and natural to type in a CLI context:

```bash
npx qraft n8n
npx qraft copy readme --target ./docs
```

Also: Have you ever tried to come up with a short, unique and fitting name for your CLI tool that isn't taken already on npm?


## Features

- 🚀 **GitHub Integration** - Pull templates directly from GitHub repositories
- 📦 **Template Boxes** - Organized collections of files with metadata
- ✨ **Create & Update Workflow** - Create new boxes from local directories or update existing ones
- 🔧 **Interactive Mode** - Browse and select templates with rich previews
- 🏗️ **Registry Support** - Configure multiple template registries
- 🔐 **Authentication** - Support for private repositories with GitHub tokens
- 💾 **Local Caching** - Improved performance with intelligent caching
- 🎯 **Target Directories** - Flexible file placement with overwrite protection
- 🔍 **Box Discovery** - List and search available templates
- 🔄 **Smart Detection** - Automatically detects existing boxes and switches to update workflow
- 🚫 **Gitignore Management** - Automatically manage .gitignore patterns for qraft files

## Installation

### Global Installation
```bash
npm install -g qraft
```

### Use with npx (Recommended)
```bash
npx qraft <command>
```

## Quick Start

Suppose you have a repository `dasheck0/qraft-templates` with the following structure:
```
dasheck0/qraft-templates/
├── n8n/
│   ├── manifest.json
│   ├── package.json
│   ├── .env.example
│   └── ...
├── readme/
│   ├── manifest.json
│   ├── README.md
│   └── ...
└── .tasks/
    ├── manifest.json
    ├── .tasks/
```

Each directory serves as remote `box` that can be copied into your current directory. Each `box` must contain a `.qraft` directory with a `manifest.json` file with the following structure:
```json
{
  "name": "n8n",
  "description": "Standard files for n8n backend projects",
  "author": "Your Name",
  "version": "1.0.0",
  "defaultTarget": "./n8n-setup",
  "tags": ["backend", "n8n", "automation"],
  "exclude": ["manifest.json"],
  "postInstall": [
    "Please run `npm install` after qreating."
  ]
}
``` 

Here is an overview of the paramaters of the `manifest.json` file:

| Parameter       | Description                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| `name`          | Unique name of the box.                                                                   |
| `description`   | Human-readable description of what this box contains. Is used for info command of the cli |
| `author`        | Author of the box.                                                                        |
| `version`       | Version of the box.                                                                       |
| `defaultTarget` | Optional default target directory when no `--target` is specified.                        |
| `tags`          | Optional tags for categorization. Can be searched from the cli                            |
| `exclude`       | Files to exclude when copying (relative to box directory).                                |
| `postInstall`   | Optional post-installation steps to show to the user.                                     |

### Copy a Template Box
```bash
# Copy a template to current directory
npx qraft copy n8n

# Copy to specific directory
npx qraft copy readme --target ./docs

# Force overwrite existing files
npx qraft copy .tasks --force
```

### Manage .gitignore for Qraft Files
```bash
# Add qraft patterns to .gitignore (recommended first step)
npx qraft gitignore

# Preview what would be added
npx qraft gitignore --dry-run

# Add patterns without confirmation prompts
npx qraft gitignore --force
```

### Create a New Box from Local Directory
```bash
# Create a new box from current directory
npx qraft create . my-awesome-box

# Create with specific registry
npx qraft create ./my-project my-box --registry mycompany/templates

# Non-interactive mode (uses defaults)
npx qraft create ./src/components ui-components --no-interactive
```

### Update an Existing Box
When you run `qraft create` on a directory that already contains a `.qraft` directory with a manifest, qraft automatically detects this and switches to update mode:

```bash
# This will detect existing .qraft directory and update the box
npx qraft create ./my-existing-box

# The CLI will show:
# 🔍 Checking for existing box...
# 📦 Existing box detected!
# 🔄 Switching to update workflow...
```

### List Available Templates
```bash
# List all available boxes
npx qraft list

# Interactive browsing mode
npx qraft list -i
```

### Interactive Mode
```bash
# Launch interactive mode for browsing and copying
npx qraft copy n8n -i
```

## The .qraft Directory

When you create a box using `qraft create`, a `.qraft` directory is automatically created in your local directory. This directory contains:

```
.qraft/
├── manifest.json    # Box metadata and configuration
└── metadata.json    # Registry and sync information
```

### manifest.json
Contains the box definition and metadata:
```json
{
  "name": "my-awesome-box",
  "version": "1.0.0",
  "description": "My awesome project template",
  "author": "Your Name",
  "defaultTarget": "./my-awesome-box",
  "tags": ["template", "project"],
  "exclude": [".git", "node_modules", ".qraft"],
  "remotePath": "templates/my-awesome-box"
}
```

### metadata.json
Contains registry and synchronization information:
```json
{
  "sourceRegistry": "mycompany/templates",
  "lastUpdated": "2025-01-13T15:30:00Z",
  "version": "1.0.0"
}
```

This approach allows qraft to:
- **Track box state** - Know which boxes exist locally
- **Smart updates** - Detect changes and suggest version increments
- **Registry sync** - Maintain connection to source registry
- **Conflict resolution** - Handle file changes intelligently

## Commands Overview

| Command | Purpose | Key Options |
|---------|---------|-------------|
| `copy <box>` | Copy template boxes to your project | `-t, --target`, `-f, --force`, `-i, --interactive` |
| `create <path> [name]` | Create/update boxes from local directories | `-r, --registry`, `--no-interactive`, `--remote-path` |
| `list` | Browse available template boxes | `-r, --registry`, `-i, --interactive`, `--all-registries` |
| `info <box>` | Show detailed box information | `-r, --registry` |
| `gitignore` | Manage .gitignore patterns for qraft files | `-d, --dry-run`, `-f, --force`, `-v, --verbose`, `--directory` |
| `config <cmd>` | Manage configuration and registries | `show`, `set`, `add-registry`, `remove-registry` |
| `auth <cmd>` | Handle GitHub authentication | `login`, `logout`, `status`, `token` |
| `cache <cmd>` | Manage local cache | `status`, `clear`, `info`, `list` |

**Quick Command Reference:**
```bash
# Essential workflow
npx qraft gitignore              # Set up .gitignore first
npx qraft copy template-name     # Copy a template
npx qraft create . my-template   # Create your own template

# Discovery and information
npx qraft list                   # Browse available templates
npx qraft info template-name     # Get template details

# Configuration and maintenance
npx qraft config show            # View current settings
npx qraft cache clear            # Clear cache if needed
```

## Commands

> **💡 Tip:** Start with `qraft gitignore` to set up .gitignore patterns before using other qraft commands. This prevents qraft-generated files from being committed to version control.

### `create <path> [box-name]`
Create a new template box from a local directory or update an existing one.

```bash
qraft create <path> [box-name] [options]
```

**Arguments:**
- `<path>` - Local directory path to create box from
- `[box-name]` - Optional box name (defaults to directory name)

**Options:**
- `-r, --registry <registry>` - Target registry for the box
- `--no-interactive` - Skip interactive prompts and use defaults
- `--remote-path <path>` - Custom remote path in registry

**Behavior:**
- **New Box**: If no `.qraft` directory exists, creates a new box with interactive prompts
- **Existing Box**: If `.qraft` directory exists, automatically switches to update workflow
- **Update Workflow**: Prompts for version increment, description updates, and handles conflicts

**Examples:**
```bash
# Create new box from current directory
qraft create . my-project-template

# Create from specific directory
qraft create ./src/components ui-components

# Create with custom registry and remote path
qraft create ./docs documentation --registry mycompany/templates --remote-path docs/templates

# Update existing box (when .qraft directory exists)
qraft create ./my-existing-box  # Automatically detects and updates
```

### `copy <box>`
Copy a template box to your project.

```bash
qraft copy <box> [options]
```

**Options:**
- `-t, --target <directory>` - Target directory (default: current directory)
- `-f, --force` - Force overwrite existing files
- `-r, --registry <registry>` - Use specific registry
- `-i, --interactive` - Interactive mode with prompts
- `-n, --nosync` - Skip creating .qraft directory (no sync tracking)

**Examples:**
```bash
qraft copy n8n
qraft copy readme --target ./documentation
qraft copy .tasks --force
qraft copy myorg/custom-template --registry mycompany/templates
qraft copy config-template --nosync  # Copy without sync tracking
```

### `list`
List available template boxes.

```bash
qraft list [options]
```

**Options:**
- `-r, --registry <registry>` - List boxes from specific registry
- `--all-registries` - List boxes from all configured registries
- `-i, --interactive` - Interactive browsing mode

**Examples:**
```bash
qraft list
qraft list --registry mycompany/templates
qraft list --interactive
```

### `info <box>`
Show detailed information about a template box.

```bash
qraft info <box> [options]
```

**Options:**
- `-r, --registry <registry>` - Use specific registry

**Examples:**
```bash
qraft info n8n
qraft info myorg/custom-template --registry mycompany/templates
```

### `config`
Manage configuration settings.

```bash
qraft config <command> [options]
```

**Subcommands:**
- `show` - Show current configuration
- `set <key> <value>` - Set configuration value
- `get <key>` - Get configuration value
- `add-registry [name] [repository]` - Add a new registry
- `remove-registry <name>` - Remove a registry
- `reset` - Reset configuration to defaults

**Examples:**
```bash
qraft config show
qraft config set defaultRegistry mycompany/templates
qraft config add-registry mycompany mycompany/templates
qraft config remove-registry mycompany
```

### `auth`
Manage GitHub authentication.

```bash
qraft auth <command> [options]
```

**Subcommands:**
- `login` - Set up GitHub authentication
- `token` - Set token for specific registry
- `logout` - Remove authentication
- `status` - Check authentication status

**Examples:**
```bash
qraft auth login
qraft auth token --registry mycompany ghp_xxxxxxxxxxxx
qraft auth status
qraft auth logout
```

### `cache`
Manage local cache.

```bash
qraft cache <command> [options]
```

**Subcommands:**
- `status` - Show cache status and statistics
- `clear` - Clear all cached data
- `info <box>` - Show cache info for specific box
- `list` - List all cached boxes

**Examples:**
```bash
qraft cache status
qraft cache clear
qraft cache info n8n
```

### `gitignore`
Manage .gitignore patterns for qraft-generated files.

```bash
qraft gitignore [options]
```

**Options:**
- `-d, --dry-run` - Show what would be added without making changes
  - Displays a complete preview of changes before execution
  - Shows existing patterns that would be skipped
  - Provides file content preview with proposed additions
  - Safe to run multiple times without side effects
  - Useful for understanding what the command will do

- `-f, --force` - Skip confirmation prompts and create/modify files automatically
  - Bypasses all interactive confirmation prompts
  - Automatically creates .gitignore file if it doesn't exist
  - Automatically adds patterns to existing .gitignore file
  - Ideal for automation, scripts, and CI/CD environments
  - Cannot be combined with --dry-run (conflicting options)

- `-v, --verbose` - Show detailed output
  - Displays startup information and configuration
  - Shows directory analysis and validation results
  - Provides pattern analysis with categorization
  - Reports detailed operation progress and results
  - Includes post-operation validation and file verification

- `--directory <path>` - Target directory (defaults to current directory)
  - Specifies the directory where .gitignore should be created/modified
  - Path can be absolute or relative to current working directory
  - Directory must exist and be writable
  - Useful for batch operations across multiple projects
  - Validates directory accessibility before proceeding

**Description:**
The gitignore command adds qraft-specific patterns to your .gitignore file to prevent qraft-generated files from being committed to version control. It includes patterns for .qraft metadata directories, configuration files, and cache files.

**Examples:**
```bash
# Add qraft patterns to .gitignore in current directory
qraft gitignore

# Preview what patterns would be added
qraft gitignore --dry-run

# Show detailed information during execution
qraft gitignore --verbose

# Skip confirmations and add patterns automatically
qraft gitignore --force

# Add patterns to .gitignore in specific directory
qraft gitignore --directory ./my-project

# Combine verbose and dry-run for detailed preview
qraft gitignore --dry-run --verbose

# Force operation with verbose output for automation logging
qraft gitignore --force --verbose
```

**Option Combinations:**

*Safe exploration:*
```bash
# Best practice: Always preview first
qraft gitignore --dry-run --verbose
# Then execute if satisfied
qraft gitignore
```

*Automation-friendly:*
```bash
# Skip all prompts with detailed logging
qraft gitignore --force --verbose

# Batch operation across multiple directories
qraft gitignore --force --directory ./project1
qraft gitignore --force --directory ./project2
```

*Development workflow:*
```bash
# Check what would happen in verbose detail
qraft gitignore --dry-run --verbose --directory ./new-feature

# Apply changes with confirmation
qraft gitignore --verbose --directory ./new-feature
```

**Invalid Combinations:**
- `--dry-run --force` - Conflicting options (dry-run prevents changes, force skips confirmations)
- Empty `--directory ""` - Invalid directory path

**What gets added:**
The command adds the following patterns to your .gitignore file:
- `.qraft/` - Qraft metadata directory
- `.qraftrc` - Qraft configuration file
- `qraft-cache/` - Local cache directory
- `*.qraft.tmp` - Temporary qraft files

**Behavior:**
- **New .gitignore**: Creates a new .gitignore file with qraft patterns
- **Existing .gitignore**: Adds missing qraft patterns to existing file
- **Duplicate detection**: Skips patterns that already exist
- **Confirmation prompts**: Asks before creating or modifying files (unless --force is used)
- **Dry-run mode**: Shows exactly what would be changed without making modifications

**Exit Codes:**
- `0` - Success (patterns added or no changes needed)
- `1` - Error (invalid options, permission denied, or operation failed)

**Return Behavior:**
- **Success with changes**: Patterns were added to .gitignore file
- **Success without changes**: All patterns already exist in .gitignore
- **Success (dry-run)**: Preview completed successfully
- **Error**: Invalid options, file permissions, or unexpected errors

**Common Scenarios:**

*Setting up a new project:*
```bash
# Initialize your project
mkdir my-new-project && cd my-new-project
git init

# Add qraft patterns to .gitignore before first commit
qraft gitignore

# Now you can safely use qraft commands
qraft copy n8n
qraft create . my-project-template
```

*Adding to existing project:*
```bash
# Navigate to existing project
cd my-existing-project

# Preview what would be added
qraft gitignore --dry-run

# Add patterns with confirmation
qraft gitignore
```

*Automated setup (CI/CD):*
```bash
# Skip confirmations for automated environments
qraft gitignore --force

# Or combine with other commands
qraft gitignore --force && qraft copy deployment-config
```

*Team workflow:*
```bash
# Team lead sets up .gitignore
qraft gitignore --verbose

# Commit the .gitignore file
git add .gitignore
git commit -m "Add qraft patterns to .gitignore"

# Team members can now safely use qraft
qraft copy shared-config
```

*Multiple projects:*
```bash
# Add to multiple project directories
for dir in project1 project2 project3; do
  qraft gitignore --directory ./$dir --force
done
```

## Configuration

### Registry Configuration

qraft supports multiple template registries. The default registry is `dasheck0/qraft-templates`.

#### Adding a Registry
```bash
qraft config add-registry mycompany mycompany/templates
```

#### Setting Default Registry
```bash
qraft config set defaultRegistry mycompany/templates
```

#### Using Registry Override
```bash
qraft copy template-name --registry mycompany/templates
```

### Authentication

For private repositories, you'll need to set up GitHub authentication:

```bash
# Interactive setup
qraft auth login

# Or set a token directly
qraft auth token --registry mycompany ghp_xxxxxxxxxxxx
```

### Box Reference Format

Boxes can be referenced in several ways:

- `boxname` - Uses default registry
- `registry/boxname` - Uses specific registry
- `owner/repo/boxname` - Full GitHub path

## Workflow Examples

### Creating Your First Box

1. **Prepare your template directory:**
   ```bash
   mkdir my-awesome-template
   cd my-awesome-template
   # Add your template files...
   echo "# My Awesome Template" > README.md
   echo "console.log('Hello World');" > index.js
   ```

2. **Create the box:**
   ```bash
   qraft create . my-awesome-template --registry mycompany/templates
   ```

3. **Interactive prompts will guide you:**
   ```
   📦 Creating Box from Local Directory
   🎯 Interactive mode enabled

   ✨ Box Name: my-awesome-template
   📝 Description: [Enter description]
   👤 Author: [Your name]
   🏷️  Tags: [Enter tags separated by commas]
   📍 Remote Path: templates/my-awesome-template

   🔍 Analysis complete - 2 files will be uploaded
   ✅ Proceed with creation? (y/N)
   ```

### Updating an Existing Box

1. **Make changes to your template:**
   ```bash
   cd my-awesome-template
   echo "# Updated documentation" >> README.md
   echo "const version = '2.0.0';" > version.js
   ```

2. **Run create command (auto-detects existing box):**
   ```bash
   qraft create .
   ```

3. **Update workflow automatically starts:**
   ```
   🔍 Checking for existing box...
   📦 Existing box detected!
   🔄 Switching to update workflow...

   📝 Current: my-awesome-template v1.0.0
   🆕 Suggested: my-awesome-template v1.0.1

   📝 Update description? (current: "My awesome template")
   👤 Update author? (current: "Your Name")
   🏷️  Update tags? (current: template, awesome)

   📊 Changes detected:
   ✏️  Modified: README.md
   ➕ Added: version.js

   ✅ Proceed with update? (y/N)
   ```

### Best Practices with Gitignore

**Always set up .gitignore first:**
```bash
# Start any new project with qraft gitignore
mkdir my-project && cd my-project
git init
qraft gitignore  # Do this before any qraft operations
git add .gitignore && git commit -m "Initial .gitignore with qraft patterns"
```

**Integrate with project initialization:**
```bash
# Complete project setup workflow
mkdir awesome-app && cd awesome-app
git init

# Set up gitignore first
qraft gitignore --force

# Copy your base template
qraft copy node-app --target .

# Create your own box for future use
qraft create . awesome-app-template --registry mycompany/templates

# Everything is properly ignored
git add . && git commit -m "Initial project setup"
```

**Team onboarding:**
```bash
# New team member setup
git clone https://github.com/mycompany/awesome-app.git
cd awesome-app

# .gitignore already has qraft patterns (set up by team lead)
# Safe to use qraft commands immediately
qraft copy development-config
qraft copy testing-setup
```

## Global Options

- `-v, --verbose` - Enable verbose output
  - For gitignore command: Shows detailed operation progress and analysis
- `-r, --registry <registry>` - Override default registry
  - Not applicable to gitignore command (operates on local files only)
- `--help` - Show help information
  - `qraft gitignore --help` shows gitignore-specific help
- `--version` - Show version number

**Global vs Command-Specific Options:**
- Global `-v, --verbose` works with gitignore command
- Gitignore-specific options (`--dry-run`, `--force`, `--directory`) only work with gitignore command
- Global options can be combined with command-specific options: `qraft gitignore --verbose --dry-run`

## Environment Variables

- `QRAFT_VERBOSE` - Enable verbose logging (affects gitignore command output)
- `GITHUB_TOKEN` - Default GitHub token for authentication
- `QRAFT_FORCE` - Enable force mode for all commands (skips confirmations)
- `QRAFT_DRY_RUN` - Enable dry-run mode for all commands (preview only)

**Gitignore-specific behavior:**
- When `QRAFT_VERBOSE=true`, gitignore command automatically uses verbose output
- When `QRAFT_FORCE=true`, gitignore command skips all confirmation prompts
- When `QRAFT_DRY_RUN=true`, gitignore command only shows previews without changes
- Environment variables can be overridden by explicit command-line flags

## Troubleshooting

### Authentication Issues
If you encounter authentication errors:

1. Check your token: `qraft auth status`
2. Set up authentication: `qraft auth login`
3. Verify token permissions (repo access required for private repos)

### Cache Issues
If templates seem outdated:

1. Clear cache: `qraft cache clear`
2. Check cache status: `qraft cache status`

### Network Issues
If you can't connect to GitHub:

1. Check internet connection
2. Verify GitHub API access
3. Check if behind corporate firewall

### Box Creation/Update Issues

#### "Manifest corrupted" error
If you see this error when updating a box:
1. Check that `.qraft/manifest.json` exists and is valid JSON
2. Ensure all required fields are present (name, version, description, author)
3. Recreate the box if manifest is severely corrupted: `rm -rf .qraft && qraft create .`

#### "No default registry configured" error
1. Set a default registry: `qraft config set defaultRegistry owner/repo`
2. Or specify registry explicitly: `qraft create . box-name --registry owner/repo`

#### Update workflow not triggered
If `qraft create` doesn't detect your existing box:
1. Ensure `.qraft` directory exists in the target directory
2. Check that `.qraft/manifest.json` contains valid JSON
3. Verify the manifest has required fields (name, version, etc.)

### Gitignore Command Issues

#### "Permission denied" error
If you can't create or modify .gitignore:
1. Check directory permissions: `ls -la`
2. Ensure you have write access to the target directory
3. Try running with elevated permissions if necessary
4. Use `--directory` option to target a writable directory

#### Patterns not being added
If the command succeeds but patterns aren't in .gitignore:
1. Check if patterns already exist (command skips duplicates)
2. Use `--verbose` flag to see detailed operation info
3. Use `--dry-run` to preview what would be added
4. Verify the .gitignore file location with `--verbose`

#### .gitignore file not created
If no .gitignore file appears after running the command:
1. Check if you confirmed the creation prompt (or use `--force`)
2. Verify target directory with `--directory` option
3. Check file permissions in the target directory
4. Use `--verbose` to see detailed execution steps

#### Command hangs or times out
If the command doesn't complete:
1. Check if there are permission prompts waiting for input
2. Use `--force` to skip interactive prompts
3. Verify directory accessibility and permissions
4. Check for filesystem issues or disk space

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/dasheck0/qraft)
- 🐛 [Issue Tracker](https://github.com/dasheck0/qraft/issues)
- 💬 [Discussions](https://github.com/dasheck0/qraft/discussions)
