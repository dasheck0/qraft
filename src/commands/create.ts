import chalk from 'chalk';
import { BoxManager } from '../core/boxManager';
import { BoxNameDerivation } from '../core/boxNameDerivation';
import { DirectoryScanner } from '../core/directoryScanner';
import { MetadataGenerator } from '../core/metadataGenerator';
import { RepositoryManager } from '../core/repositoryManager';
import { StructureAnalyzer } from '../core/structureAnalyzer';
import { TagDetector } from '../core/tagDetector';
import { ManifestBuilder } from '../interactive/manifestBuilder';
import { ManifestUtils } from '../utils/manifestUtils';
import { updateCommand } from './update';

interface CreateOptions {
  registry?: string;
  dryRun?: boolean;
  interactive?: boolean;
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
  
  console.log(chalk.cyan('Source:'));
  console.log(chalk.gray(`  📁 Local Directory: ${preview.localPath}`));
  console.log(chalk.gray(`  📊 Estimated Files: ${preview.estimatedFiles} files`));
  
  console.log(chalk.cyan('\nTarget:'));
  console.log(chalk.gray(`  📦 Box Name: ${preview.boxName}`));
  console.log(chalk.gray(`  🏠 Registry: ${preview.registry}`));
  console.log(chalk.gray(`  📍 Target Location: ${preview.targetLocation}`));
  
  console.log(chalk.cyan('\nActions:'));
  if (preview.hasConflicts) {
    console.log(chalk.yellow('  ⚠️  Update existing box'));
  } else {
    console.log(chalk.gray('  ✨ Create new box structure in registry'));
  }
  console.log(chalk.gray(`  📤 Upload ${preview.estimatedFiles} files`));
  console.log(chalk.gray('  🏷️  Generate metadata manifest'));
  console.log(chalk.gray('  🔗 Make box available for download'));
  
  console.log(chalk.cyan('\n❓ Confirmation Required'));
  
  const answer = await createUserPrompt('Do you want to proceed with creating this box? (y/N): ');
  return answer.toLowerCase() === 'y';
}

async function getDefaultRegistry(boxManager: BoxManager): Promise<string> {
  const config = await boxManager.getConfigManager().getConfig();
  if (!config.defaultRegistry) {
    throw new Error('No default registry configured. Please specify a registry with --registry option or configure a default registry.');
  }
  return config.defaultRegistry;
}

async function validateRegistryAccess(registry: string): Promise<void> {
  // Basic format validation
  if (!registry.includes('/')) {
    throw new Error('Registry must be in format "owner/repo"');
  }

  const [owner, repo] = registry.split('/');
  if (!owner || !repo) {
    throw new Error('Invalid registry format. Expected "owner/repo"');
  }

  // TODO: Add actual GitHub API connectivity check in future tasks
  // For now, just validate the format
  console.log(chalk.gray(`Registry validation: ${registry} (format check passed)`));
}

export async function createCommand(
  boxManager: BoxManager,
  localPath: string,
  boxName?: string,
  options: CreateOptions = {}
): Promise<void> {
  // Step 0: Check if this is an existing box that should be updated instead
  console.log(chalk.cyan('🔍 Checking for existing box...'));

  if (await ManifestUtils.qraftDirectoryExists(localPath)) {
    if (await ManifestUtils.hasCompleteLocalManifest(localPath)) {
      console.log(chalk.yellow('📦 Existing box detected!'));
      console.log(chalk.gray('This directory already contains a qraft box with manifest.'));
      console.log(chalk.gray('Switching to update workflow instead of create workflow.\n'));

      // Route to update command instead
      return updateCommand(boxManager, localPath, {
        registry: options.registry,
        dryRun: options.dryRun,
        interactive: options.interactive
      });
    } else {
      console.log(chalk.yellow('⚠️  Incomplete .qraft directory found'));
      console.log(chalk.gray('The .qraft directory exists but manifest files are incomplete.'));

      if (options.interactive !== false) {
        const answer = await createUserPrompt('Do you want to recreate the box? This will overwrite existing .qraft files. (y/N): ');
        if (answer.toLowerCase() !== 'y') {
          console.log(chalk.yellow('⏹️  Operation cancelled by user'));
          return;
        }

        // Clean up incomplete .qraft directory
        await ManifestUtils.removeQraftDirectory(localPath);
        console.log(chalk.gray('🧹 Cleaned up incomplete .qraft directory\n'));
      } else {
        throw new Error('Incomplete .qraft directory found. Use --interactive mode to recreate or manually clean up the .qraft directory.');
      }
    }
  }

  const manifestBuilder = new ManifestBuilder();

  console.log(chalk.blue.bold('📦 Creating Box from Local Directory'));

  if (options.interactive !== false) {
    console.log(chalk.gray('🎯 Interactive mode enabled - you\'ll be guided through the process\n'));
  }

  try {
    // Step 1: Quick validation
    console.log(chalk.cyan('🔍 Validating setup...'));

    const directoryScanner = new DirectoryScanner();
    const structure = await directoryScanner.scanDirectory(localPath);

    const effectiveRegistry = options.registry || await getDefaultRegistry(boxManager);
    await validateRegistryAccess(effectiveRegistry);

    console.log(chalk.green('✅ Setup validated\n'));

    // Step 2: Analyze and generate smart defaults
    console.log(chalk.cyan('🧠 Analyzing project...'));

    const tagDetector = new TagDetector();
    const tags = await tagDetector.detectTags(structure);

    const structureAnalyzer = new StructureAnalyzer();
    const analysis = structureAnalyzer.analyzeStructure(structure, tags);

    const boxNameDerivation = new BoxNameDerivation();
    const nameResult = boxNameDerivation.deriveBoxName(localPath, structure, tags, analysis);

    const metadataGenerator = new MetadataGenerator();
    const suggestedName = boxName || nameResult.primaryName;
    const generatedMetadata = metadataGenerator.generateMetadata(
      suggestedName,
      structure,
      tags,
      analysis
    );

    console.log(chalk.green('✅ Analysis complete\n'));

    // Step 3: Interactive manifest building
    const manifestOptions = {
      suggestedName,
      suggestedDescription: generatedMetadata.description,
      suggestedAuthor: generatedMetadata.author || undefined,
      suggestedTags: generatedMetadata.tags || undefined,
      defaultTarget: './target',
      suggestedRemotePath: localPath, // Use local path as suggested remote path
      localPath: localPath
    };

    const manifest = options.interactive === false
      ? await manifestBuilder.buildQuickManifest(generatedMetadata, manifestOptions)
      : await manifestBuilder.buildManifest(generatedMetadata, manifestOptions);

    // Step 4: Show preview and get final confirmation
    const preview: DryRunPreview = {
      localPath,
      boxName: manifest.name,
      registry: effectiveRegistry,
      estimatedFiles: structure.files.length,
      targetLocation: `${effectiveRegistry}/${manifest.name}`,
      hasConflicts: false
    };

    const shouldProceed = await showDryRunPreview(preview);
    if (!shouldProceed) {
      console.log(chalk.yellow('⏹️  Operation cancelled by user'));
      return;
    }

    // Step 5: Create the box
    console.log(chalk.cyan('\n🚀 Creating box...'));
    
    const [registryOwner, registryRepo] = effectiveRegistry.split('/');
    const repositoryManager = new RepositoryManager(
      await boxManager.getGitHubToken(effectiveRegistry)
    );

    const createResult = await repositoryManager.createBox(
      registryOwner,
      registryRepo,
      manifest.name,
      localPath,
      manifest,
      manifest.remotePath, // Use remotePath from manifest
      {
        commitMessage: `Add ${manifest.name} box - ${manifest.description}`,
        createPR: true
      }
    );

    if (!createResult.success) {
      throw new Error(`Failed to create box in repository: ${createResult.message}`);
    }

    // Success!
    console.log(chalk.green('\n🎉 Box created successfully!'));
    console.log(chalk.cyan('\n📋 Summary:'));
    console.log(chalk.gray(`   📦 Name: ${manifest.name}`));
    console.log(chalk.gray(`   📝 Description: ${manifest.description}`));
    console.log(chalk.gray(`   🏠 Registry: ${effectiveRegistry}`));
    if (createResult.commitSha) {
      console.log(chalk.gray(`   🔗 Commit: ${createResult.commitSha.substring(0, 8)}`));
    }

    console.log(chalk.cyan('\n🎯 Next Steps:'));
    console.log(chalk.gray(`   • Use: qraft copy ${manifest.name}`));
    console.log(chalk.gray('   • Share the registry with others'));

    if (createResult.prUrl) {
      console.log(chalk.cyan('\n🔗 Pull Request:'));
      console.log(chalk.gray(`   ${createResult.prUrl}`));
    }

  } catch (error: any) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.code) {
      console.error(chalk.gray('Code:'), error.code);
    }

    console.error(chalk.cyan('\n💡 Help:'));
    console.error(chalk.gray('  • Run: qraft create --help'));
    console.error(chalk.gray('  • Check your directory and registry settings'));

    process.exit(1);
  }
}
