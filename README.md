<div align="left" style="margin-bottom: 16px;">
  <img src="logo.png" alt="Qraft CLI Logo" width="200" height="auto">
</div>

# Qraft CLI

A powerful CLI tool to qraft structured project setups from GitHub template repositories. Pull standardized project templates, documentation scaffolds, and reusable resources from GitHub repositories at any stage of development.

[![npm version](https://badge.fury.io/js/qraft.svg)](https://badge.fury.io/js/qraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why qraft?

We chose the name **qraft** as a purposeful twist on “craft.” It reflects the tool’s purpose: to help developers _craft_ structured project setups quickly and consistently using modular templates. The “q” adds uniqueness and avoids naming collisions, while still being short, intuitive, and natural to type in a CLI context:

```bash
npx qraft n8n
npx qraft copy readme --target ./docs
```

Also: Have you ever tried to come up with a short, unique and fitting name for your CLI tool that isn't taken already on npm?


## Features

- 🚀 **GitHub Integration** - Pull templates directly from GitHub repositories
- 📦 **Template Boxes** - Organized collections of files with metadata
- 🔧 **Interactive Mode** - Browse and select templates with rich previews
- 🏗️ **Registry Support** - Configure multiple template registries
- 🔐 **Authentication** - Support for private repositories with GitHub tokens
- 💾 **Local Caching** - Improved performance with intelligent caching
- 🎯 **Target Directories** - Flexible file placement with overwrite protection
- 🔍 **Box Discovery** - List and search available templates

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

Each directory serves as remote `box` that can be `qraftd` into your current directory. Each `box` must contain a `manifest.json` file with the following structure:
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

## Commands

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

**Examples:**
```bash
qraft copy n8n
qraft copy readme --target ./documentation
qraft copy .tasks --force
qraft copy myorg/custom-template --registry mycompany/templates
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

## Global Options

- `-v, --verbose` - Enable verbose output
- `-r, --registry <registry>` - Override default registry
- `--help` - Show help information
- `--version` - Show version number

## Environment Variables

- `QRAFT_VERBOSE` - Enable verbose logging
- `GITHUB_TOKEN` - Default GitHub token for authentication

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
