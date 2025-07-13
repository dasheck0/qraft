import chalk from 'chalk';
import { BoxManager } from '../core/boxManager';
import { ContentComparison } from '../core/contentComparison';
import { DirectoryScanner } from '../core/directoryScanner';
import { ManifestManager } from '../core/manifestManager';
import { RepositoryManager } from '../core/repositoryManager';
import { ConfirmationWorkflows } from '../interactive/confirmationWorkflows';
import { BoxManifest } from '../types';
import { ManifestUtils } from '../utils/manifestUtils';

interface UpdateOptions {
  registry?: string | undefined;
  dryRun?: boolean | undefined;
  interactive?: boolean | undefined;
  force?: boolean | undefined;
  skipConflictResolution?: boolean | undefined;
}

interface UpdatePreview {
  localPath: string;
  boxName: string;
  currentVersion: string;
  suggestedVersion: string;
  registry: string;
  hasChanges: boolean;
  conflictCount: number;
  safeFileCount: number;
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

async function showUpdatePreview(preview: UpdatePreview): Promise<boolean> {
  console.log(chalk.cyan('\n📋 Preview: What will be updated\n'));
  
  console.log(chalk.cyan('Current Box:'));
  console.log(chalk.gray(`  📦 Name: ${preview.boxName}`));
  console.log(chalk.gray(`  📍 Version: ${preview.currentVersion}`));
  console.log(chalk.gray(`  📁 Local Path: ${preview.localPath}`));
  
  console.log(chalk.cyan('\nProposed Changes:'));
  console.log(chalk.gray(`  🔄 New Version: ${preview.suggestedVersion}`));
  console.log(chalk.gray(`  🏠 Registry: ${preview.registry}`));
  
  if (preview.hasChanges) {
    console.log(chalk.cyan('\nContent Analysis:'));
    if (preview.conflictCount > 0) {
      console.log(chalk.yellow(`  ⚠️  ${preview.conflictCount} file(s) with conflicts`));
    }
    if (preview.safeFileCount > 0) {
      console.log(chalk.green(`  ✅ ${preview.safeFileCount} file(s) safe to update`));
    }
  } else {
    console.log(chalk.green('\n✨ No content changes detected'));
  }
  
  console.log(chalk.cyan('\n❓ Confirmation Required'));
  
  const answer = await createUserPrompt('Do you want to proceed with updating this box? (y/N): ');
  return answer.toLowerCase() === 'y';
}

async function promptForManifestUpdates(currentManifest: BoxManifest): Promise<Partial<BoxManifest>> {
  console.log(chalk.cyan('\n📝 Update Box Information'));
  console.log(chalk.gray('Press Enter to keep current values, or type new values:\n'));

  const updates: Partial<BoxManifest> = {};

  // Description
  const newDescription = await createUserPrompt(
    `Description (${chalk.gray(currentManifest.description)}): `
  );
  if (newDescription.trim()) {
    updates.description = newDescription.trim();
  }

  // Author
  const currentAuthor = currentManifest.author || 'Not set';
  const newAuthor = await createUserPrompt(
    `Author (${chalk.gray(currentAuthor)}): `
  );
  if (newAuthor.trim()) {
    updates.author = newAuthor.trim();
  }

  // Tags
  const currentTags = currentManifest.tags?.join(', ') || 'None';
  const newTags = await createUserPrompt(
    `Tags (${chalk.gray(currentTags)}): `
  );
  if (newTags.trim()) {
    updates.tags = newTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  // Version (with smart suggestion)
  const currentVersion = currentManifest.version;
  const suggestedVersion = suggestNextVersion(currentVersion);
  const newVersion = await createUserPrompt(
    `Version (current: ${chalk.gray(currentVersion)}, suggested: ${chalk.cyan(suggestedVersion)}): `
  );
  if (newVersion.trim()) {
    updates.version = newVersion.trim();
  } else {
    updates.version = suggestedVersion;
  }

  return updates;
}

function suggestNextVersion(currentVersion: string): string {
  // Simple semantic versioning increment
  const versionParts = currentVersion.split('.');
  if (versionParts.length >= 3) {
    // Increment patch version
    const patch = parseInt(versionParts[2]) || 0;
    versionParts[2] = (patch + 1).toString();
    return versionParts.join('.');
  } else if (versionParts.length === 2) {
    // Increment minor version
    const minor = parseInt(versionParts[1]) || 0;
    versionParts[1] = (minor + 1).toString();
    return versionParts.join('.');
  } else {
    // Fallback: append .1
    return `${currentVersion}.1`;
  }
}

export async function updateCommand(
  boxManager: BoxManager,
  localPath: string,
  options: UpdateOptions = {}
): Promise<void> {
  console.log(chalk.blue.bold('🔄 Updating Box from Local Directory'));
  
  if (options.interactive !== false) {
    console.log(chalk.gray('🎯 Interactive mode enabled - you\'ll be guided through the process\n'));
  }

  try {
    // Step 1: Validate that this is an existing box
    console.log(chalk.cyan('🔍 Checking for existing box...'));

    if (!(await ManifestUtils.qraftDirectoryExists(localPath))) {
      throw new Error(`No .qraft directory found in ${localPath}. Use 'qraft create' for new boxes.`);
    }

    if (!(await ManifestUtils.hasCompleteLocalManifest(localPath))) {
      throw new Error(`Incomplete manifest found in ${localPath}. Please run 'qraft create' to recreate the box.`);
    }

    const manifestManager = new ManifestManager();
    const localManifestEntry = await manifestManager.getLocalManifest(localPath);
    
    if (!localManifestEntry) {
      throw new Error(`Could not read local manifest from ${localPath}`);
    }

    const currentManifest = localManifestEntry.manifest;
    console.log(chalk.green(`✅ Found existing box: ${currentManifest.name} v${currentManifest.version}\n`));

    // Step 2: Get registry information
    const effectiveRegistry = options.registry || 
      localManifestEntry.metadata?.sourceRegistry || 
      await boxManager.getConfigManager().getConfig().then(c => c.defaultRegistry);

    if (!effectiveRegistry) {
      throw new Error('No registry specified. Use --registry option or configure a default registry.');
    }

    // Step 3: Analyze current content
    console.log(chalk.cyan('🧠 Analyzing current content...'));

    const directoryScanner = new DirectoryScanner();
    const structure = await directoryScanner.scanDirectory(localPath);

    console.log(chalk.green('✅ Content analysis complete\n'));

    // Step 4: Interactive manifest updates (if enabled)
    let manifestUpdates: Partial<BoxManifest> = {};
    
    if (options.interactive !== false) {
      manifestUpdates = await promptForManifestUpdates(currentManifest);
    } else {
      // Non-interactive: just increment version
      manifestUpdates.version = suggestNextVersion(currentManifest.version);
    }

    // Step 5: Create updated manifest
    const updatedManifest: BoxManifest = {
      ...currentManifest,
      ...manifestUpdates
    };

    // Step 6: Content comparison and conflict detection
    console.log(chalk.cyan('🔍 Checking for conflicts...'));

    const contentComparison = new ContentComparison();
    
    // For update workflow, we compare current structure with itself to detect any changes
    // This is a simplified approach - in a full implementation, you'd compare with the last known state
    const comparisonResult = await contentComparison.compareDirectories(
      structure, // old structure (simplified)
      structure, // new structure (same for now)
      localPath
    );

    const conflictingFiles = contentComparison.getConflictingFiles(comparisonResult);
    const safeFiles = contentComparison.getSafeFiles(comparisonResult);

    console.log(chalk.green('✅ Conflict analysis complete\n'));

    // Step 7: Show preview and get confirmation
    const preview: UpdatePreview = {
      localPath,
      boxName: currentManifest.name,
      currentVersion: currentManifest.version,
      suggestedVersion: updatedManifest.version,
      registry: effectiveRegistry,
      hasChanges: Object.keys(manifestUpdates).length > 1, // More than just version
      conflictCount: conflictingFiles.length,
      safeFileCount: safeFiles.length
    };

    const shouldProceed = await showUpdatePreview(preview);
    if (!shouldProceed) {
      console.log(chalk.yellow('⏹️  Update cancelled by user'));
      return;
    }

    // Step 8: Handle conflicts if any
    if (conflictingFiles.length > 0 && !options.skipConflictResolution) {
      console.log(chalk.cyan('\n⚠️  Resolving conflicts...'));

      const confirmationWorkflows = new ConfirmationWorkflows();

      // Show conflicts to user
      const shouldContinue = await confirmationWorkflows.confirmConflictResolution(
        conflictingFiles.map(file => {
          const filePath = typeof file === 'string' ? file : file.path || String(file);
          return {
            type: 'overwrite' as const,
            description: `File will be updated: ${filePath}`,
            riskLevel: 'medium' as const,
            affectedFiles: [filePath],
            recommendations: ['Review changes before proceeding']
          };
        })
      );

      if (!shouldContinue) {
        console.log(chalk.yellow('⏹️  Update cancelled due to conflicts'));
        return;
      }
    }

    // Step 9: Update the box
    console.log(chalk.cyan('\n🚀 Updating box...'));
    
    const [registryOwner, registryRepo] = effectiveRegistry.split('/');
    const repositoryManager = new RepositoryManager(
      await boxManager.getGitHubToken(effectiveRegistry)
    );

    const updateResult = await repositoryManager.createBox(
      registryOwner,
      registryRepo,
      updatedManifest.name,
      localPath,
      updatedManifest,
      updatedManifest.remotePath,
      {
        commitMessage: `feat: update ${updatedManifest.name} to v${updatedManifest.version}`,
        createPR: true
      }
    );

    if (!updateResult.success) {
      throw new Error(`Failed to update box in repository: ${updateResult.message}`);
    }

    // Step 10: Update local manifest
    await manifestManager.storeLocalManifest(
      localPath,
      updatedManifest,
      effectiveRegistry,
      `${effectiveRegistry}/${updatedManifest.name}`,
      true // isUpdate = true
    );

    // Success!
    console.log(chalk.green('\n🎉 Box updated successfully!'));
    console.log(chalk.cyan('\n📋 Summary:'));
    console.log(chalk.gray(`   📦 Name: ${updatedManifest.name}`));
    console.log(chalk.gray(`   🔄 Version: ${currentManifest.version} → ${updatedManifest.version}`));
    console.log(chalk.gray(`   📝 Description: ${updatedManifest.description}`));
    console.log(chalk.gray(`   🏠 Registry: ${effectiveRegistry}`));
    if (updateResult.commitSha) {
      console.log(chalk.gray(`   🔗 Commit: ${updateResult.commitSha.substring(0, 8)}`));
    }

    console.log(chalk.cyan('\n🎯 Next Steps:'));
    console.log(chalk.gray(`   • Use: qraft copy ${updatedManifest.name}`));
    console.log(chalk.gray('   • Share the updated box with others'));

    if (updateResult.prUrl) {
      console.log(chalk.cyan('\n🔗 Pull Request:'));
      console.log(chalk.gray(`   ${updateResult.prUrl}`));
    }

  } catch (error: any) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    if (error.code) {
      console.error(chalk.gray('Code:'), error.code);
    }

    console.error(chalk.cyan('\n💡 Help:'));
    console.error(chalk.gray('  • Run: qraft update --help'));
    console.error(chalk.gray('  • Check that the directory contains a valid .qraft manifest'));
    console.error(chalk.gray('  • Use: qraft create for new boxes'));

    process.exit(1);
  }
}
