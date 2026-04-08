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
const { existsSync, readFileSync, mkdirSync, writeFileSync } = require('fs');
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
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options,
  });
}

function findPackagePath() {
  if (existsSync(API_PKG)) return API_PKG;
  if (existsSync(ROOT_PKG)) return ROOT_PKG;
  return null;
}

function installDependencies(pkgPath, targetDir) {
  const pkgDir = pkgPath.replace(/\\/g, '/');
  
  console.log(`\n📦 Installing required dependencies in ${targetDir}...`);
  run('npm', ['install', ...REQUIRED_PACKAGES], { cwd: pkgDir });
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
    console.log('🚀 GSD + Qdrant CLI');
    console.log('==================\n');

    // Find which package.json to use
    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    const apiDir = existsSync(API_PKG) ? 'apps/api' : null;
    const targetDir = apiDir || 'project root';
    console.log(`📁 Using: ${apiDir ? 'apps/api' : 'project root'}`);

    // Install required packages FIRST (this is the key fix!)
    installDependencies(pkgPath, targetDir);

    // Run setup from templates
    console.log('\n🔧 Running setup...');
    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    // Run initial sync (only if we have an API directory)
    if (apiDir) {
      console.log('\n🧠 Running initial knowledge sync...');
      run('npm', ['run', 'sync-knowledge'], { cwd: join(PROJECT_ROOT, apiDir) });
    } else {
      console.log('\n⚠️  Frontend-only project detected - no sync-knowledge script available');
      console.log('   To sync knowledge manually: npx node scripts/sync-knowledge.js');
    }

    console.log('\n✅ Setup complete!');
    console.log('\nNext step: run your project normally (e.g., `npm run dev`).');
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
    const useQdrant = existsSync(join(SCRIPT_DIR, '..', 'lib', 'gsd-qdrant-sync', 'index.js'));
    
    // Run search (async)
    const runSearch = async () => {
      let sorted = [];
      if (useQdrant) {
        // Use Qdrant-based search
        try {
          const { GSDKnowledgeSync } = require(join(SCRIPT_DIR, '..', 'lib', 'gsd-qdrant-sync', 'index.js'));
          const sync = new GSDKnowledgeSync();
          await sync.init();
          
          const results = await sync.searchWithContext(query, {
            limit: options.limit || 10,
            withContext: options.withContext || false,
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
  } else {
    // Default behavior - run setup
    console.log('🚀 GSD + Qdrant CLI');
    console.log('==================\n');

    // Find which package.json to use
    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    const apiDir = existsSync(API_PKG) ? 'apps/api' : null;
    console.log(`📁 Using: ${apiDir || 'project root'}`);

    // Install required packages FIRST (this is the key fix!)
    installDependencies(pkgPath);

    // Run setup from templates
    console.log('\n🔧 Running setup...');
    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    // Run initial sync
    console.log('\n🧠 Running initial knowledge sync...');
    const syncDir = apiDir ? 'apps/api' : PROJECT_ROOT;
    run('npm', ['run', 'sync-knowledge'], { cwd: syncDir });

    console.log('\n✅ Setup complete!');
    console.log('\nNext step: run your project normally (e.g., `npm run dev`).');
  }
}

main();
