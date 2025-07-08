# Unbox CLI

A powerful CLI tool to unbox pre-configured template files into your projects. Pull standardized project templates, documentation scaffolds, and reusable resources from GitHub repositories at any stage of development.

[![npm version](https://badge.fury.io/js/dasheck0-unbox.svg)](https://badge.fury.io/js/dasheck0-unbox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
npm install -g unbox
```

### Use with npx (Recommended)
```bash
npx unbox <command>
```

## Quick Start

Suppose you have a repository `dasheck0/unbox-templates` with the following structure:
```
dasheck0/unbox-templates/
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

Each directory serves as remote `box` that can be `unboxed` into your current directory. Each `box` must contain a `manifest.json` file with the following structure:
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
    "Please run `npm install` after unboxing."
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
npx unbox copy n8n

# Copy to specific directory
npx unbox copy readme --target ./docs

# Force overwrite existing files
npx unbox copy .tasks --force
```

### List Available Templates
```bash
# List all available boxes
npx unbox list

# Interactive browsing mode
npx unbox list -i
```

### Interactive Mode
```bash
# Launch interactive mode for browsing and copying
npx unbox copy n8n -i
```

## Commands

### `copy <box>`
Copy a template box to your project.

```bash
unbox copy <box> [options]
```

**Options:**
- `-t, --target <directory>` - Target directory (default: current directory)
- `-f, --force` - Force overwrite existing files
- `-r, --registry <registry>` - Use specific registry
- `-i, --interactive` - Interactive mode with prompts

**Examples:**
```bash
unbox copy n8n
unbox copy readme --target ./documentation
unbox copy .tasks --force
unbox copy myorg/custom-template --registry mycompany/templates
```

### `list`
List available template boxes.

```bash
unbox list [options]
```

**Options:**
- `-r, --registry <registry>` - List boxes from specific registry
- `--all-registries` - List boxes from all configured registries
- `-i, --interactive` - Interactive browsing mode

**Examples:**
```bash
unbox list
unbox list --registry mycompany/templates
unbox list --interactive
```

### `info <box>`
Show detailed information about a template box.

```bash
unbox info <box> [options]
```

**Options:**
- `-r, --registry <registry>` - Use specific registry

**Examples:**
```bash
unbox info n8n
unbox info myorg/custom-template --registry mycompany/templates
```

### `config`
Manage configuration settings.

```bash
unbox config <command> [options]
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
unbox config show
unbox config set defaultRegistry mycompany/templates
unbox config add-registry mycompany mycompany/templates
unbox config remove-registry mycompany
```

### `auth`
Manage GitHub authentication.

```bash
unbox auth <command> [options]
```

**Subcommands:**
- `login` - Set up GitHub authentication
- `token` - Set token for specific registry
- `logout` - Remove authentication
- `status` - Check authentication status

**Examples:**
```bash
unbox auth login
unbox auth token --registry mycompany ghp_xxxxxxxxxxxx
unbox auth status
unbox auth logout
```

### `cache`
Manage local cache.

```bash
unbox cache <command> [options]
```

**Subcommands:**
- `status` - Show cache status and statistics
- `clear` - Clear all cached data
- `info <box>` - Show cache info for specific box
- `list` - List all cached boxes

**Examples:**
```bash
unbox cache status
unbox cache clear
unbox cache info n8n
```

## Configuration

### Registry Configuration

Unbox supports multiple template registries. The default registry is `dasheck0/unbox-templates`.

#### Adding a Registry
```bash
unbox config add-registry mycompany mycompany/templates
```

#### Setting Default Registry
```bash
unbox config set defaultRegistry mycompany/templates
```

#### Using Registry Override
```bash
unbox copy template-name --registry mycompany/templates
```

### Authentication

For private repositories, you'll need to set up GitHub authentication:

```bash
# Interactive setup
unbox auth login

# Or set a token directly
unbox auth token --registry mycompany ghp_xxxxxxxxxxxx
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

## Troubleshooting

### Authentication Issues
If you encounter authentication errors:

1. Check your token: `unbox auth status`
2. Set up authentication: `unbox auth login`
3. Verify token permissions (repo access required for private repos)

### Cache Issues
If templates seem outdated:

1. Clear cache: `unbox cache clear`
2. Check cache status: `unbox cache status`

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

- 📖 [Documentation](https://github.com/dasheck0/unbox)
- 🐛 [Issue Tracker](https://github.com/dasheck0/unbox/issues)
- 💬 [Discussions](https://github.com/dasheck0/unbox/discussions)
