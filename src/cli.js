#!/usr/bin/env node

/**
 * GSD + Qdrant CLI - Main entry point
 * 
 * Installabile globalmente con: npm install -g ./qdrant-template
 * Usabile in qualsiasi progetto Node.js con: gsd-qdrant
 * 
 * Risolve il problema originale: installa le dipendenze PRIMA di eseguire qualsiasi cosa
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } = fs;
const { join, dirname, extname, basename } = require('path');
const readline = require('readline');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = process.cwd();
const ROOT_PKG = join(PROJECT_ROOT, 'package.json');
const API_PKG = join(PROJECT_ROOT, 'apps', 'api', 'package.json');

/**
 * Get file extension for a programming language
 * @param {string} language - Programming language name
 * @returns {string} File extension (e.g., '.js', '.ts')
 */
function getExtensionForLanguage(language) {
  if (!language) return '.js'; // Default to JavaScript
  
  const lang = language.toLowerCase();
  
  const extensions = {
    'javascript': '.js',
    'js': '.js',
    'typescript': '.ts',
    'ts': '.ts',
    'python': '.py',
    'py': '.py',
    'go': '.go',
    'rust': '.rs',
    'java': '.java',
    'c': '.c',
    'cpp': '.cpp',
    'c++': '.cpp',
    'c#': '.cs',
    'ruby': '.rb',
    'php': '.php',
    'swift': '.swift',
    'kt': '.kt',
    'kotlin': '.kt',
    'scala': '.scala',
    'html': '.html',
    'css': '.css',
    'scss': '.scss',
    'less': '.less',
    'json': '.json',
    'yaml': '.yaml',
    'yml': '.yml',
    'markdown': '.md',
    'md': '.md',
    'sql': '.sql',
    'sh': '.sh',
    'bash': '.sh',
    'zsh': '.zsh',
    'powershell': '.ps1',
    'r': '.r',
    'rscript': '.r'
  };
  
  return extensions[lang] || '.js';
}

/**
 * Generate a filename from a snippet name
 * @param {string} name - Snippet name
 * @param {string} extension - File extension
 * @returns {string} Generated filename
 */
function generateFileName(name, extension) {
  // Convert to kebab-case
  let filename = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
  
  // Remove duplicate hyphens
  filename = filename.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  filename = filename.replace(/^-+|-+$/g, '');
  
  // Ensure it doesn't start with a number or special character
  if (/^[0-9]/.test(filename)) {
    filename = `_${filename}`;
  }
  
  // If the name contains "script", ensure it ends with "-script" not "-script-script"
  if (filename.endsWith('-script') && extension === '.js') {
    // Keep as is
  }
  
  return `${filename}${extension}`;
}

// Required packages for setup - these are needed BEFORE running setup
const REQUIRED_PACKAGES = [
  '@qdrant/js-client-rest',
  '@xenova/transformers'
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options,
  });
}

/**
 * Build context from Knowledge Sync results
 */
async function buildContextFromKnowledgeSync(query, project_id, rankedResults, sync) {
  const context = {
    query,
    project_id,
    results: rankedResults,
    files: {},
    typeCounts: {},
    snippetResults: []
  };

  // Group results by file type
  for (const result of rankedResults) {
    const type = result.type || 'doc';
    context.typeCounts[type] = (context.typeCounts[type] || 0) + 1;
    
    // Store file content by source path
    if (result.source) {
      context.files[result.source] = {
        type,
        content: result.content || '',
        summary: result.summary || '',
        tags: result.tags || [],
        score: result.score || 0,
        ...result
      };
    }
  }

  // Separate docs from snippets for proper context building
  const docs = rankedResults.filter(r => r.type === 'doc');
  const snippets = rankedResults.filter(r => r.type === 'code');

  // Build structured context
  context.docs = docs;
  context.snippets = snippets;
  context.totalResults = rankedResults.length;

  return context;
}

/**
 * Build prompt from Knowledge Sync context
 */
function buildPromptFromKnowledgeSync(context, query) {
  const lines = [];

  // Header
  lines.push('=== GSD Knowledge Sharing Context ===');
  lines.push('');

  // Search results summary
  lines.push('## SEARCH RESULTS SUMMARY');
  lines.push(`Query: "${query}"`);
  lines.push(`Total results: ${context.totalResults}`);
  lines.push(`Docs found: ${context.docs?.length || 0}`);
  lines.push(`Code snippets found: ${context.snippets?.length || 0}`);
  lines.push('');

  // Document results
  if (context.docs && context.docs.length > 0) {
    lines.push('## DOCUMENTS');
    for (const doc of context.docs) {
      lines.push(`### ${doc.summary || doc.source}`);
      lines.push(`Type: ${doc.subtype || 'documentation'}`);
      if (doc.tags && doc.tags.length > 0) {
        lines.push(`Tags: ${doc.tags.join(', ')}`);
      }
      lines.push('');
      lines.push(doc.content || 'No content available');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // Code snippet results
  if (context.snippets && context.snippets.length > 0) {
    lines.push('## CODE SNIPPETS');
    for (const snippet of context.snippets) {
      lines.push(`### ${snippet.summary || snippet.source}`);
      lines.push(`Language: ${snippet.language || 'unknown'}`);
      if (snippet.kindDetail) {
        lines.push(`Type: ${snippet.kindDetail}`);
      }
      if (snippet.scope) {
        lines.push(`Scope: ${snippet.scope}`);
      }
      lines.push('');
      lines.push(snippet.content || 'No content available');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // User query
  lines.push('---');
  lines.push('## USER QUERY');
  lines.push(query);
  lines.push('');
  lines.push('Please provide a detailed response based on the context above.');

  return lines.join('\n');
}

function findPackagePath() {
  if (existsSync(API_PKG)) return API_PKG;
  if (existsSync(ROOT_PKG)) return ROOT_PKG;
  return null;
}

function areRequiredPackagesInstalled(projectRoot, pkgPath) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const declaredDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    for (const dep of REQUIRED_PACKAGES) {
      if (!declaredDeps[dep]) return false;
      require.resolve(dep, { paths: [projectRoot] });
    }

    return true;
  } catch (_err) {
    return false;
  }
}

function installDependencies(pkgPath, targetDir) {
  if (areRequiredPackagesInstalled(PROJECT_ROOT, pkgPath)) {
    console.log(`📦 Dependencies: ok`);
    return 'ok';
  }
  
  // Usa path.sep per compatibilità cross-platform
  const pkgDir = pkgPath.split('/').join(require('path').sep);
  console.log(`📦 Dependencies: installing missing packages...`);
  const result = run('npm', ['install', ...REQUIRED_PACKAGES], { cwd: pkgDir });
  if (result.status !== 0) {
    console.error('❌ Dependency installation failed.');
    process.exit(result.status || 1);
  }
  return 'installed';
}

/**
 * Create gsd-qdrant directory and required files
 * @param {string} projectRoot - The project root directory
 */
function createGsdQdrantDirectory(projectRoot) {
  const gsdQdrantDir = join(projectRoot, 'gsd-qdrant');
  const stateFile = join(gsdQdrantDir, '.qdrant-sync-state.json');
  const packageFile = join(gsdQdrantDir, 'package.json');
  const indexFile = join(gsdQdrantDir, 'index.js');
  
  // Create gsd-qdrant directory
  if (!existsSync(gsdQdrantDir)) {
    mkdirSync(gsdQdrantDir, { recursive: true });
    console.log(`📂 Created directory: gsd-qdrant/`);
  }
  
  // Create .qdrant-sync-state.json if it doesn't exist (V2.0 structure)
  if (!existsSync(stateFile)) {
    const state = {
      lastSync: null,
      indexed: {}
    };
    writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    console.log(`📝 Created: gsd-qdrant/.qdrant-sync-state.json`);
  }

  if (!existsSync(packageFile)) {
    writeFileSync(packageFile, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
    console.log(`📝 Created: gsd-qdrant/package.json`);
  }
  
  // Create index.js if it doesn't exist
  if (!existsSync(indexFile)) {
    const templateIndexFile = join(SCRIPT_DIR, 'gsd-qdrant-template.js');
    copyFileSync(templateIndexFile, indexFile);
    console.log(`📝 Created: gsd-qdrant/index.js`);
  }
}

/**
 * Add entry to .gitignore (if .gitignore exists)
 * @param {string} projectRoot - The project root directory
 * @param {string} entry - Entry to add (e.g., 'gsd-qdrant/')
 */
async function addToGitignore(projectRoot, entry) {
  const gitignorePath = join(projectRoot, '.gitignore');
  
  // If .gitignore doesn't exist, skip
  if (!existsSync(gitignorePath)) {
    console.log('ℹ️  .gitignore not found, skipping');
    return;
  }

  // Read current content
  const content = await fs.promises.readFile(gitignorePath, 'utf8');
  
  // Check if entry already exists
  const lines = content.split('\n');
  const hasEntry = lines.some(line => line.trim() === entry);
  
  if (hasEntry) {
    console.log('ℹ️  Entry already in .gitignore');
    return;
  }

  // Add entry to end of file
  await fs.promises.writeFile(gitignorePath, content + '\n' + entry + '\n', 'utf8');
  console.log(`📝 Added '${entry}' to .gitignore`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle --version flag
  if (args[0] === '--version' || args[0] === '-v') {
    const pkgPath = join(SCRIPT_DIR, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(`gsd-qdrant-cli v${pkg.version}`);
    process.exit(0);
  }
  
  if (args.length === 0) {
    console.log('🚀 GSD + Qdrant CLI\n');

    // Create gsd-qdrant directory and files
    createGsdQdrantDirectory(PROJECT_ROOT);

    // Find which package.json to use
    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    console.log(`📁 Project: ${basename(PROJECT_ROOT)}`);
    installDependencies(pkgPath, 'project root');

    // Run setup-from-templates.js
    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    // Add gsd-qdrant/ to .gitignore (if it exists)
    await addToGitignore(PROJECT_ROOT, 'gsd-qdrant/');

    const syncScript = join(SCRIPT_DIR, '..', 'scripts', 'sync-knowledge.js');
    const syncResult = spawnSync('node', [syncScript], { 
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });

    if (syncResult.status !== 0) {
      console.error('\n❌ Initial knowledge sync failed. Collections may be empty.');
      process.exit(syncResult.status || 1);
    }

    console.log('\n✅ Ready');
  } else if (args[0] === 'snippet' && args[1] === 'search') {
    // Snippet search command
    const query = args[2] || '';
    const options = {};
    
    // Parse flags
    for (let i = 3; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const value = args[i + 1];
        if (key === 'tags') options.tags = value.split(',');
        if (key === 'language') options.language = value;
        if (key === 'type') options.type = value;
        if (key === 'context') options.withContext = true;
        if (key === 'limit') options.limit = parseInt(value, 10);
      }
    }
    
    if (!query) {
      console.log('❌ Please provide a search query.');
      console.log('Usage: gsd-qdrant snippet search <query> [--tags <tag1,tag2>] [--language <lang>] [--type <type>] [--context] [--limit <n>]');
      console.log('');
      console.log('Options:');
      console.log('  --tags      Filter by tags (comma-separated)');
      console.log('  --language  Filter by programming language');
      console.log('  --type      Filter by snippet type');
      console.log('  --context   Include context from .md files in results');
      console.log('  --limit     Maximum number of results (default: 10)');
      process.exit(1);
    }
    
    // Check if we should use Qdrant or local database
    const runtimeSyncPath = join(PROJECT_ROOT, 'gsd-qdrant', 'index.js');
    const useQdrant = existsSync(runtimeSyncPath);
    
    // Run search (async)
    const runSearch = async () => {
      let sorted = [];
      if (useQdrant) {
        // Use Qdrant-based search
        try {
          const { GSDKnowledgeSync } = require(runtimeSyncPath);
          const sync = new GSDKnowledgeSync();
          await sync.init();
          
          const results = await sync.searchWithContext(query, {
            limit: options.limit || 10,
            type: options.type || undefined,
          });
          
          sorted = results;
        } catch (err) {
          console.log('⚠️  Qdrant search failed, falling back to local database:', err.message);
          // Fall through to local database
        }
      }
      
      // If Qdrant didn't work, use local database
      if (sorted.length === 0) {
        const snippetRanking = require('./snippet-ranking');
        const snippets = snippetRanking.loadDatabase();
        
        const filtered = snippetRanking.filterAndRankSnippets(snippets, query, options);
        sorted = snippetRanking.sortSnippetsByRelevance(filtered);
      }
      
      console.log('🔍 Snippet Search');
      console.log('='.repeat(50));
      console.log(`Query: "${query}"`);
      if (options.withContext) {
        console.log(`With Context: Yes`);
      }
      console.log(`Found ${sorted.length} results:`);
      
      sorted.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.path || result.name} (score: ${result.score || result.relevanceScore})`);
        console.log(`     Type: ${result.type}, Scope: ${result.scope}`);
        if (result.milestone || result.slice || result.task) {
          console.log(`     GSD: ${result.milestone || ''} ${result.slice || ''} ${result.task || ''}`.trim());
        }
        console.log(`     ${result.content?.slice(0, 200) || 'No content'}`);
        
        // Show context if available
        if (result.context && result.context.length > 0) {
          console.log(`     Context: ${result.context.length} related documents`);
          result.context.forEach(ctx => {
            console.log(`       - ${ctx.source} (${ctx.ids.length} IDs: ${ctx.ids.slice(0, 3).join(', ')})`);
          });
        }
      });
      
      console.log('='.repeat(50));
      console.log('✅ Search complete!');
    };
    
    runSearch().catch(err => {
      console.error('Error during search:', err.message);
      process.exit(1);
    });
    return; // Exit main function early
  } else if (args[0] === 'snippet' && args[1] === 'apply') {
    // Snippet apply command
    const query = args[2] || '';
    
    if (!query) {
      console.log('❌ Please provide a query for the snippet to apply.');
      console.log('Usage: gsd-qdrant snippet apply <query>');
      console.log('Example: gsd-qdrant snippet apply "script per docker"');
      process.exit(1);
    }
    
    // Load modules
    const snippetRanking = require('./snippet-ranking');
    const intentDetector = require('./intent-detector');
    const contextAnalyzer = require('./context-analyzer');
    
    // Detect intent from the query
    const intent = intentDetector.detectIntent(query);
    
    // Load and search snippets
    const snippets = snippetRanking.loadDatabase();
    const filtered = snippetRanking.filterAndRankSnippets(snippets, intent.query, {
      tags: intent.filters.tags || [],
      language: (intent.filters.language && !intent.filters.tags?.includes(intent.filters.language)) ? intent.filters.language : '',
      type: intent.filters.type || '',
      crossProject: intent.filters.crossProject || true
    });
    
    // Sort by relevance
    const sorted = snippetRanking.sortSnippetsByRelevance(filtered);
    
    console.log('📝 Snippet Apply');
    console.log('='.repeat(50));
    console.log(`Query: "${query}"`);
    console.log('\n🔍 Intent Analysis:');
    console.log(`   Type: ${intent.type}`);
    console.log(`   Search terms: ${intent.query || '(none)'}`);
    console.log(`   Filters: ${JSON.stringify(intent.filters) || '(none)'}`);
    console.log(`   Preferences: ${JSON.stringify(intent.preferences) || '(none)'}`);
    
    if (sorted.length === 0) {
      console.log('\n⚠️  No matching snippets found.');
      console.log('='.repeat(50));
      console.log('✅ Search complete (no results)');
      process.exit(0);
    }
    
    // Display top match with full metadata
    const topMatch = sorted[0];
    console.log('\n🎯 Top Match:');
    console.log('─'.repeat(50));
    console.log(`   Name: ${topMatch.name}`);
    console.log(`   Type: ${topMatch.type}`);
    console.log(`   Language: ${topMatch.language}`);
    console.log(`   Source: ${topMatch.sourceFile}:${topMatch.sourceLine}`);
    console.log(`   Description: ${topMatch.description}`);
    if (topMatch.tags && topMatch.tags.length > 0) {
      console.log(`   Tags: ${topMatch.tags.join(', ')}`);
    }
    console.log(`   Relevance Score: ${topMatch.relevanceScore}`);
    console.log('─'.repeat(50));
    console.log('\n📦 Code Content:');
    console.log('─'.repeat(50));
    console.log(topMatch.content);
    console.log('─'.repeat(50));
    
    // Analyze project context for placement recommendation
    console.log('\n🔍 Analyzing project structure...');
    const projectContext = contextAnalyzer.analyzeProjectContext();
    
    // Recommend code placement based on intent and project context
    const placement = contextAnalyzer.recommendCodePlacement(topMatch.description || query, projectContext);
    
    console.log('\n💡 Placement Recommendation:');
    console.log('─'.repeat(50));
    console.log(`   Path: ${placement.path}`);
    console.log(`   Reason: ${placement.reason}`);
    console.log(`   Intent Type: ${placement.intent}`);
    console.log(`   Confidence: ${(placement.confidence * 100).toFixed(0)}%`);
    console.log('─'.repeat(50));
    
    // Determine file path and extension
    const fileExtension = getExtensionForLanguage(topMatch.language);
    // Use the snippet's source file name for consistency
    const baseFileName = topMatch.sourceFile ? basename(topMatch.sourceFile).replace(extname(topMatch.sourceFile), '') : 'snippet';
    const fileName = `${baseFileName}${fileExtension}`;
    const filePath = join(PROJECT_ROOT, placement.path, fileName);
    
    console.log(`\n📁 Target File: ${filePath}`);
    
    // Handle file existence
    let willOverwrite = false;
    if (existsSync(filePath)) {
      console.log(`\n⚠️  File already exists: ${filePath}`);
      
      // Create readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      // Add timeout for non-interactive mode
      const timeout = setTimeout(() => {
        console.log('\n⚠️  No user input received, defaulting to overwrite.');
        willOverwrite = true;
        rl.close();
      }, 1000);
      
      await new Promise((resolve) => {
        rl.question('Would you like to overwrite it? (y/N): ', (answer) => {
          clearTimeout(timeout);
          const response = answer.toLowerCase().trim();
          willOverwrite = response === 'y' || response === 'yes';
          rl.close();
          resolve();
        });
      });
      
      if (!willOverwrite) {
        console.log('❌ File not created (user declined to overwrite).');
        console.log('✅ Operation cancelled.');
        process.exit(0);
      }
    } else {
      // Create directory if it doesn't exist
      const dirPath = dirname(filePath);
      if (!existsSync(dirPath)) {
        console.log(`\n📂 Creating directory: ${dirPath}`);
        mkdirSync(dirPath, { recursive: true });
      }
    }
    
    // Write the file
    try {
      writeFileSync(filePath, topMatch.content, 'utf8');
      console.log(`\n✅ File created successfully: ${filePath}`);
      console.log(`   Language: ${topMatch.language || 'JavaScript'}`);
      console.log(`   Extension: ${fileExtension}`);
      console.log(`   Size: ${Buffer.from(topMatch.content, 'utf8').length} bytes`);
    } catch (err) {
      console.error(`\n❌ Error writing file: ${err.message}`);
      process.exit(1);
    }
    
    console.log('='.repeat(50));
    console.log('✅ Snippet applied successfully!');
  } else if (args[0] === 'context') {
    // Knowledge Sharing - Context Builder using GSDKnowledgeSync
    const { GSDKnowledgeSync } = require('./gsd-qdrant-template.js');
    
    const query = args[1] || '';
    const project_id = basename(PROJECT_ROOT);
    
    if (!query) {
      console.log('❌ Please provide a query for context building.');
      console.log('Usage: gsd-qdrant context <query>');
      console.log('Example: gsd-qdrant context "come implementare il login"');
      process.exit(1);
    }
    
    // Initialize Knowledge Sync
    const sync = new GSDKnowledgeSync();
    await sync.init();
    
    // Generate query embedding and search
    const vector = await sync.embedText(query);
    const limit = 10;
    
    // Search without filter first
    const hits = await sync.client.search(sync.collectionName, { 
      vector: { name: sync.vectorName, vector }, 
      limit,
      with_payload: true, 
      with_vector: false
    });
    
    // Filter results by project and relevance
    let filtered = hits;
    if (project_id) {
      filtered = filtered.filter(h => h.payload.project_id === project_id);
    }
    
    // Rank results with recency and importance
    const ranked = filtered.map(hit => {
      const recencyScore = Math.min(1, (Date.now() - hit.payload.timestamp) / (30 * 24 * 60 * 60 * 1000));
      const importanceScore = (hit.payload.importance || 1) / 5;
      const score = hit.score * 0.7 + (1 - recencyScore) * 0.2 + importanceScore * 0.1;
      return { ...hit.payload, score };
    }).sort((a, b) => b.score - a.score);
    
    // Build context from ranked results
    const context = await buildContextFromKnowledgeSync(query, project_id, ranked, sync);
    
    // Build final prompt
    const prompt = buildPromptFromKnowledgeSync(context, query);
    
    console.log('\n' + '='.repeat(60));
    console.log(prompt);
    console.log('='.repeat(60));
    
  } else {
    createGsdQdrantDirectory(PROJECT_ROOT);

    console.log('🚀 GSD + Qdrant CLI\n');

    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    console.log(`📁 Project: ${basename(PROJECT_ROOT)}`);
    installDependencies(pkgPath, 'project root');

    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    const syncScript = join(SCRIPT_DIR, '..', 'scripts', 'sync-knowledge.js');
    const syncResult = spawnSync('node', [syncScript], { cwd: PROJECT_ROOT, stdio: 'inherit' });
    if (syncResult.status !== 0) {
      console.error('\n❌ Initial knowledge sync failed. Collections may be empty.');
      process.exit(syncResult.status || 1);
    }

    console.log('\n✅ Ready');
  }
}

main();
