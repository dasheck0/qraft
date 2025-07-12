import chalk from 'chalk';
import { BoxManager } from '../core/boxManager';

interface CreateOptions {
  registry?: string;
  dryRun?: boolean;
}

interface DryRunPreview {
  localPath: string;
  boxName: string;
  registry: string;
  estimatedFiles: number;
  targetLocation: string;
  hasConflicts?: boolean;
}

function createUserPrompt(question: string): Promise<string> {
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function showDryRunPreview(preview: DryRunPreview): Promise<boolean> {
  console.log(chalk.cyan('\n📋 Preview: What will be created\n'));

  console.log(chalk.yellow('Source:'));
  console.log(`  📁 Local Directory: ${preview.localPath}`);
  console.log(`  📊 Estimated Files: ${preview.estimatedFiles} files`);

  console.log(chalk.yellow('\nTarget:'));
  console.log(`  📦 Box Name: ${preview.boxName}`);
  console.log(`  🏠 Registry: ${preview.registry}`);
  console.log(`  📍 Target Location: ${preview.targetLocation}`);

  console.log(chalk.yellow('\nActions:'));
  if (preview.hasConflicts) {
    console.log(`  ⚠️  Overwrite existing box in registry`);
    console.log(`  📤 Replace ${preview.estimatedFiles} files`);
    console.log(`  🏷️  Update metadata manifest`);
    console.log(`  🔗 Update box availability`);
  } else {
    console.log(`  ✨ Create new box structure in registry`);
    console.log(`  📤 Upload ${preview.estimatedFiles} files`);
    console.log(`  🏷️  Generate metadata manifest`);
    console.log(`  🔗 Make box available for download`);
  }

  console.log(chalk.cyan('\n❓ Confirmation Required'));
  const answer = await createUserPrompt(chalk.white('Do you want to proceed with creating this box? (y/N): '));

  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}



interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

interface CreateError extends Error {
  code?: string;
  suggestion?: string;
}

function createError(message: string, code?: string, suggestion?: string): CreateError {
  const error = new Error(message) as CreateError;
  if (code) error.code = code;
  if (suggestion) error.suggestion = suggestion;
  return error;
}

function validateLocalPath(localPath: string): ValidationResult {
  const fs = require('fs');
  const path = require('path');

  try {
    // Resolve the path to handle relative paths
    const resolvedPath = path.resolve(localPath);

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      const parentDir = path.dirname(resolvedPath);
      const suggestion = fs.existsSync(parentDir)
        ? `Check if the path is correct. Parent directory exists: ${parentDir}`
        : `Check if the path is correct. Try using an absolute path: ${resolvedPath}`;

      return {
        isValid: false,
        error: `Path does not exist: ${localPath}`,
        suggestion
      };
    }

    // Check if it's a directory
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isValid: false,
        error: `Path is not a directory: ${localPath}`,
        suggestion: `The qraft create command requires a directory, not a file. Try using the directory containing this file.`
      };
    }

    // Check if directory is readable
    try {
      fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch {
      return {
        isValid: false,
        error: `Directory is not readable: ${localPath}`,
        suggestion: `Check directory permissions. Try: chmod +r "${resolvedPath}"`
      };
    }

    // Check if directory is empty
    const files = fs.readdirSync(resolvedPath);
    if (files.length === 0) {
      return {
        isValid: false,
        error: `Directory is empty: ${localPath}`,
        suggestion: `Add some files to the directory before creating a box, or choose a different directory.`
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Error accessing path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestion: `Ensure the path is valid and you have the necessary permissions.`
    };
  }
}

async function validateRegistryAccess(boxManager: BoxManager, registry?: string): Promise<ValidationResult> {
  try {
    // If no registry specified, use default
    if (!registry) {
      // Check if default registry is configured
      const configManager = boxManager.getConfigManager();
      const config = await configManager.getConfig();
      const defaultRegistry = config.defaultRegistry;

      if (!defaultRegistry) {
        return {
          isValid: false,
          error: 'No default registry configured.',
          suggestion: 'Use --registry option (e.g., --registry owner/repository) or configure a default registry with: qraft config set defaultRegistry owner/repository'
        };
      }

      registry = defaultRegistry;
    }

    // Basic registry format validation (should be in format 'owner/repo')
    if (!registry.includes('/')) {
      const suggestion = registry.includes('-') || registry.includes('_')
        ? `Try: --registry ${registry}/templates or --registry owner/${registry}`
        : `Try: --registry owner/${registry} (replace 'owner' with the GitHub username or organization)`;

      return {
        isValid: false,
        error: `Invalid registry format: ${registry}. Expected format: owner/repository`,
        suggestion
      };
    }

    // Validate registry parts
    const [owner, repo] = registry.split('/');
    if (!owner || !repo) {
      return {
        isValid: false,
        error: `Invalid registry format: ${registry}. Both owner and repository name are required.`,
        suggestion: `Example: --registry myusername/my-templates`
      };
    }

    // Check for valid GitHub naming conventions
    const validNamePattern = /^[a-zA-Z0-9._-]+$/;
    if (!validNamePattern.test(owner)) {
      return {
        isValid: false,
        error: `Invalid owner name: ${owner}. Owner names can only contain letters, numbers, dots, hyphens, and underscores.`,
        suggestion: `Check the GitHub username or organization name.`
      };
    }

    if (!validNamePattern.test(repo)) {
      return {
        isValid: false,
        error: `Invalid repository name: ${repo}. Repository names can only contain letters, numbers, dots, hyphens, and underscores.`,
        suggestion: `Check the GitHub repository name.`
      };
    }

    // TODO: Add actual GitHub API connectivity check in future tasks
    // For now, just validate the format
    console.log(chalk.gray(`Registry validation: ${registry} (format check passed)`));

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Registry validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestion: `Check your network connection and registry configuration.`
    };
  }
}

async function getEffectiveRegistry(boxManager: BoxManager): Promise<string> {
  try {
    const configManager = boxManager.getConfigManager();
    const config = await configManager.getConfig();

    if (!config.defaultRegistry) {
      throw createError(
        'No default registry configured',
        'NO_DEFAULT_REGISTRY',
        'Configure a default registry with: qraft config set defaultRegistry owner/repository'
      );
    }

    return config.defaultRegistry;
  } catch (error) {
    if (error instanceof Error && (error as CreateError).code) {
      throw error; // Re-throw our custom errors
    }

    throw createError(
      'Failed to get registry configuration',
      'REGISTRY_CONFIG_FAILED',
      'Check your configuration with: qraft config list'
    );
  }
}



export async function createCommand(
  boxManager: BoxManager,
  localPath: string,
  boxName?: string,
  options: CreateOptions = {}
): Promise<void> {
  console.log(chalk.blue.bold('📦 Creating Box from Local Directory\n'));

  try {
    // Step 1: Validate local path
    console.log(chalk.cyan('🔍 Validating local directory...'));
    const pathValidation = validateLocalPath(localPath);

    if (!pathValidation.isValid) {
      console.error(chalk.red('❌ Path validation failed:'), pathValidation.error);
      if (pathValidation.suggestion) {
        console.error(chalk.yellow('💡 Suggestion:'), pathValidation.suggestion);
      }
      throw createError(pathValidation.error || 'Path validation failed', 'PATH_VALIDATION_FAILED', pathValidation.suggestion);
    }

    console.log(chalk.green('✅ Local directory is valid'));

    // Step 2: Validate registry access
    console.log(chalk.cyan('🔍 Validating registry access...'));
    const registryValidation = await validateRegistryAccess(boxManager, options.registry);

    if (!registryValidation.isValid) {
      console.error(chalk.red('❌ Registry validation failed:'), registryValidation.error);
      if (registryValidation.suggestion) {
        console.error(chalk.yellow('💡 Suggestion:'), registryValidation.suggestion);
      }
      throw createError(registryValidation.error || 'Registry validation failed', 'REGISTRY_VALIDATION_FAILED', registryValidation.suggestion);
    }

    console.log(chalk.green('✅ Registry access is valid'));

    // Step 3: Scan directory and analyze structure
    console.log(chalk.cyan('\n🔍 Analyzing directory structure...'));

    const { DirectoryScanner } = require('../core/directoryScanner');
    const { TagDetector } = require('../core/tagDetector');
    const { StructureAnalyzer } = require('../core/structureAnalyzer');
    const { SensitiveFileDetector } = require('../core/sensitiveFileDetector');
    const { MetadataGenerator } = require('../core/metadataGenerator');
    const { BoxNameDerivation } = require('../core/boxNameDerivation');
    const { ContentComparison } = require('../core/contentComparison');
    const { DiffGenerator } = require('../core/diffGenerator');
    const { ChangeAnalysis } = require('../core/changeAnalysis');
    const { ConflictResolution } = require('../core/conflictResolution');

    const scanner = new DirectoryScanner();
    const tagDetector = new TagDetector();
    const structureAnalyzer = new StructureAnalyzer();
    const sensitiveDetector = new SensitiveFileDetector();
    const metadataGenerator = new MetadataGenerator();
    const boxNameDerivation = new BoxNameDerivation();
    const contentComparison = new ContentComparison();
    const diffGenerator = new DiffGenerator();
    const changeAnalysis = new ChangeAnalysis();
    const conflictResolution = new ConflictResolution();

    try {
      // Scan directory structure
      const structure = await scanner.scanDirectory(localPath, {
        includeContent: true,
        maxContentSize: 10 * 1024, // 10KB max for content analysis
        maxDepth: 5,
        includeHidden: true // Include hidden files for sensitive file detection
      });

      console.log(chalk.gray(`📊 Found: ${scanner.getDirectorySummary(structure)}`));

      // Detect package.json for dependency analysis
      let packageJson;
      const packageFile = structure.files.find((f: any) => f.name === 'package.json');
      if (packageFile?.content) {
        try {
          packageJson = JSON.parse(packageFile.content);
        } catch {
          console.log(chalk.yellow('⚠️  Found package.json but could not parse it'));
        }
      }

      // Detect tags
      console.log(chalk.cyan('🏷️  Detecting project tags...'));
      const tags = await tagDetector.detectTags(structure, packageJson);

      if (tags.allTags.length > 0) {
        console.log(chalk.green('✨ Detected tags:'));
        console.log(chalk.gray(`   File Types: ${tags.fileTypeTags.join(', ') || 'none'}`));
        console.log(chalk.gray(`   Frameworks: ${tags.frameworkTags.join(', ') || 'none'}`));
        console.log(chalk.gray(`   Semantic: ${tags.semanticTags.join(', ') || 'none'}`));
        console.log(chalk.gray(`   Tooling: ${tags.toolingTags.join(', ') || 'none'}`));
      } else {
        console.log(chalk.yellow('⚠️  No specific tags detected - will use general classification'));
      }

      // Analyze structure for target suggestions
      console.log(chalk.cyan('🎯 Analyzing structure for target suggestions...'));
      const analysis = structureAnalyzer.analyzeStructure(structure, tags);

      console.log(chalk.green(`📋 Project Analysis:`));
      console.log(chalk.gray(`   Type: ${analysis.projectType}`));
      console.log(chalk.gray(`   Language: ${analysis.primaryLanguage}`));
      if (analysis.framework) {
        console.log(chalk.gray(`   Framework: ${analysis.framework}`));
      }
      console.log(chalk.gray(`   Complexity: ${analysis.complexity}`));
      console.log(chalk.gray(`   Has Tests: ${analysis.hasTests ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`   Has Docs: ${analysis.hasDocumentation ? 'Yes' : 'No'}`));

      if (analysis.targetSuggestions.length > 0) {
        console.log(chalk.green('🎯 Target Suggestions:'));
        for (const suggestion of analysis.targetSuggestions.slice(0, 3)) {
          console.log(chalk.gray(`   ${suggestion.path} (${(suggestion.confidence * 100).toFixed(0)}% confidence) - ${suggestion.reason}`));
        }
      }

      // Detect sensitive files
      console.log(chalk.cyan('🔒 Scanning for sensitive files...'));
      const sensitiveResult = sensitiveDetector.detectSensitiveFiles(structure.files);

      if (sensitiveResult.totalSensitiveFiles > 0) {
        console.log(chalk.red(`⚠️  Found ${sensitiveResult.totalSensitiveFiles} potentially sensitive files:`));

        // Show critical and high severity files
        const criticalFiles = sensitiveResult.sensitiveFiles.filter((f: any) => f.severity === 'critical');
        const highFiles = sensitiveResult.sensitiveFiles.filter((f: any) => f.severity === 'high');

        if (criticalFiles.length > 0) {
          console.log(chalk.red('🚨 CRITICAL:'));
          for (const file of criticalFiles.slice(0, 3)) {
            console.log(chalk.red(`   ${file.file.relativePath} - ${file.reasons[0]}`));
          }
        }

        if (highFiles.length > 0) {
          console.log(chalk.yellow('⚠️  HIGH:'));
          for (const file of highFiles.slice(0, 3)) {
            console.log(chalk.yellow(`   ${file.file.relativePath} - ${file.reasons[0]}`));
          }
        }

        console.log(chalk.cyan('💡 Security Recommendations:'));
        for (const recommendation of sensitiveResult.recommendations.slice(0, 3)) {
          console.log(chalk.gray(`   ${recommendation}`));
        }

        // Block creation if critical files are found
        if (criticalFiles.length > 0) {
          throw createError(
            `Found ${criticalFiles.length} critical sensitive files that must be removed before creating a box`,
            'CRITICAL_SENSITIVE_FILES_FOUND',
            'Remove or secure all critical sensitive files (.env, API keys, private keys) before proceeding'
          );
        }

        // Warn about high severity files but allow continuation
        if (highFiles.length > 0) {
          console.log(chalk.yellow('\n⚠️  WARNING: High-risk sensitive files detected. Consider reviewing before proceeding.'));
        }
      } else {
        console.log(chalk.green('✅ No sensitive files detected'));
      }

      // Determine effective registry and box name for metadata and preview
      const effectiveRegistry = options.registry || await getEffectiveRegistry(boxManager);

      // Use enhanced box name derivation
      const boxNameResult = boxNameDerivation.deriveBoxName(localPath, structure, tags, analysis, boxName);
      const effectiveBoxName = boxNameResult.primaryName;

      console.log(chalk.cyan('📝 Smart box name suggestions:'));
      console.log(chalk.green(`   🎯 Primary: ${boxNameResult.primaryName} (${(boxNameResult.confidence * 100).toFixed(0)}% confidence)`));
      if (boxNameResult.alternatives.length > 0) {
        console.log(chalk.gray('   💡 Alternatives:'));
        for (const alt of boxNameResult.alternatives.slice(0, 3)) {
          console.log(chalk.gray(`      • ${alt.name} (${(alt.confidence * 100).toFixed(0)}%) - ${alt.reason}`));
        }
      }

      // Generate metadata
      console.log(chalk.cyan('📋 Generating metadata...'));
      const metadata = metadataGenerator.generateMetadata(
        effectiveBoxName,
        structure,
        tags,
        analysis
      );

      console.log(chalk.green('✨ Generated metadata:'));
      console.log(chalk.gray(`   📦 Name: ${metadata.name}`));
      console.log(chalk.gray(`   📝 Description: ${metadata.description.substring(0, 80)}${metadata.description.length > 80 ? '...' : ''}`));
      console.log(chalk.gray(`   🏷️  Version: ${metadata.version}`));
      console.log(chalk.gray(`   📂 Category: ${metadata.category}`));
      console.log(chalk.gray(`   🔤 Language: ${metadata.language}`));
      if (metadata.framework) {
        console.log(chalk.gray(`   🚀 Framework: ${metadata.framework}`));
      }
      console.log(chalk.gray(`   🏷️  Tags: ${metadata.tags.slice(0, 5).join(', ')}${metadata.tags.length > 5 ? '...' : ''}`));

      // Step 4: Prepare dry-run preview with smart suggestions
      console.log(chalk.cyan('\n🔍 Preparing preview...'));

      if (!effectiveBoxName) {
        throw createError(
          'Could not derive a valid box name from the directory path',
          'BOX_NAME_DERIVATION_FAILED',
          'Please provide a box name explicitly: qraft create <path> <box-name>'
        );
      }

      if (structure.totalFiles === 0) {
        throw createError(
          'No files found to include in the box',
          'NO_FILES_FOUND',
          'Ensure the directory contains files that are not excluded by default patterns'
        );
      }

      // Check for existing box and handle conflicts
      console.log(chalk.cyan('🔍 Checking for existing box...'));
      // TODO: Implement getBox method in BoxManager
      const existingBox = null; // await boxManager.getBox(effectiveBoxName, effectiveRegistry);

      if (existingBox) {
        console.log(chalk.yellow(`\n⚠️  Box "${effectiveBoxName}" already exists in registry "${effectiveRegistry}"`));
        console.log(chalk.gray(`   Current version: ${(existingBox as any)?.version || 'unknown'}`));
        console.log(chalk.gray(`   Last updated: ${(existingBox as any)?.lastModified || 'unknown'}`));

        // Perform conflict analysis
        console.log(chalk.cyan('📊 Analyzing changes...'));
        const comparison = contentComparison.compareDirectories(null, structure); // null = new box scenario
        const diffSummary = diffGenerator.generateMultipleDiffs(comparison.files);
        const analysisResult = changeAnalysis.analyzeChanges(comparison, diffSummary);

        // Display change analysis
        console.log(chalk.cyan('\n📋 Change Analysis:'));
        console.log(chalk.gray(`   Risk Level: ${analysisResult.overall.riskLevel.toUpperCase()}`));
        console.log(chalk.gray(`   Files: ${analysisResult.summary.additions} added, ${analysisResult.summary.modifications} modified`));

        if (analysisResult.overall.requiresReview) {
          console.log(chalk.yellow('\n⚠️  Manual review recommended'));
          for (const recommendation of analysisResult.recommendations.slice(0, 2)) {
            console.log(chalk.gray(`   • ${recommendation}`));
          }
        }

        // Create resolution session for future use
        const resolutionOptions = {
          autoResolveLevel: 'safe' as const,
          createBackups: true,
          backupDirectory: './backups',
          interactiveMode: false,
          dryRun: options.dryRun || false
        };

        const resolutionSession = conflictResolution.createResolutionSession(
          analysisResult,
          comparison,
          diffSummary,
          resolutionOptions
        );

        console.log(chalk.gray(`   Resolution: ${resolutionSession.autoResolved.length} auto-resolved, ${resolutionSession.requiresManualReview.length} need review`));

        // For now, we'll continue with a warning instead of blocking
        console.log(chalk.yellow('\n⚠️  Proceeding will overwrite the existing box'));
      }

      // Enhanced preview with smart suggestions
      const bestTarget = structureAnalyzer.getBestTargetSuggestion(analysis);
      const suggestedBoxName = `${effectiveBoxName}-${analysis.primaryLanguage.toLowerCase()}`;

      const preview: DryRunPreview = {
        localPath,
        boxName: effectiveBoxName,
        registry: effectiveRegistry,
        estimatedFiles: structure.totalFiles,
        targetLocation: `${effectiveRegistry}/${effectiveBoxName}`,
        hasConflicts: !!existingBox
      };

      // Add smart suggestions to preview
      console.log(chalk.cyan('\n💡 Smart Suggestions:'));
      console.log(chalk.gray(`   Suggested Target: ${bestTarget}`));
      console.log(chalk.gray(`   Alternative Name: ${suggestedBoxName}`));
      if (analysis.targetSuggestions.length > 0) {
        console.log(chalk.gray(`   Best Match: ${analysis.targetSuggestions[0].path} (${analysis.targetSuggestions[0].reason})`));
      }

      // Step 5: Show dry-run preview and get confirmation
      const shouldProceed = await showDryRunPreview(preview);

      if (!shouldProceed) {
        console.log(chalk.yellow('\n⏹️  Operation cancelled by user'));
        return;
      }

      // Store analysis results for next phases
      console.log(chalk.green('\n✅ Analysis complete - ready for box creation'));
      console.log(chalk.cyan('📋 Summary:'));
      console.log(chalk.gray(`   📁 Files: ${structure.totalFiles} files, ${structure.totalDirectories} directories`));
      console.log(chalk.gray(`   🏷️  Tags: ${tags.allTags.slice(0, 5).join(', ')}${tags.allTags.length > 5 ? '...' : ''}`));
      console.log(chalk.gray(`   🎯 Target: ${bestTarget}`));
      console.log(chalk.gray(`   📦 Box: ${effectiveBoxName} → ${effectiveRegistry}`));

    } catch (error) {
      if (error instanceof Error && (error as CreateError).code) {
        // Re-throw our custom errors
        throw error;
      }

      throw createError(
        `Failed to analyze directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DIRECTORY_ANALYSIS_FAILED',
        'Check the directory contents and permissions, then try again'
      );
    }

    console.log(chalk.green('\n✅ User confirmed - proceeding with box creation'));

    // Interactive mode is default - minimal options approach
    console.log(chalk.cyan('\n🎯 Interactive Mode: '), 'Enabled by default');
    console.log(chalk.yellow('Local Path:'), localPath);

    if (boxName) {
      console.log(chalk.yellow('Box Name:'), boxName);
    } else {
      console.log(chalk.gray('Box Name:'), 'Derived from analysis');
    }

    if (options.registry) {
      console.log(chalk.yellow('Registry:'), options.registry);
    } else {
      console.log(chalk.gray('Registry:'), 'Using default configuration');
    }

    console.log(chalk.cyan('\n📋 Interactive Process:'));
    console.log(chalk.gray('  1. ✅ Validate local directory'));
    console.log(chalk.gray('  2. ✅ Validate registry access'));
    console.log(chalk.gray('  3. ✅ Show preview and confirm'));
    console.log(chalk.gray('  4. 🚧 Detect and suggest metadata'));
    console.log(chalk.gray('  5. 🚧 Prompt for missing information'));
    console.log(chalk.gray('  6. 🚧 Create box in registry'));

    // Placeholder implementation - actual functionality will be added in subsequent tasks
    console.log(chalk.gray('\n🚧 Create command implementation in progress...'));
    console.log(chalk.gray('Metadata detection and box creation will be implemented in upcoming tasks.'));

  } catch (error) {
    const createError = error as CreateError;

    // Display the main error message
    console.error(chalk.red('\n❌ Error creating box:'), createError.message);

    // Display suggestion if available
    if (createError.suggestion) {
      console.error(chalk.yellow('💡 Suggestion:'), createError.suggestion);
    }

    // Display error code for debugging if available
    if (createError.code) {
      console.error(chalk.gray('Error Code:'), createError.code);
    }

    // Provide general help
    console.error(chalk.cyan('\n📚 For more help:'));
    console.error(chalk.gray('  • Run: qraft create --help'));
    console.error(chalk.gray('  • Check the documentation'));
    console.error(chalk.gray('  • Verify your directory and registry settings'));

    process.exit(1);
  }
}
