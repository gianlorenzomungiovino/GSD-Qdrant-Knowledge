# CLI Improvements - Universal Project Support

## Problem Solved

The `gsd-qdrant` CLI was failing to work correctly in frontend-only projects (e.g., React/Vite apps) because:

1. **Collection creation was skipped** - The setup script would fail early if it couldn't fetch templates from `gsd-setup-templates`
2. **No graceful handling of missing `src/lib`** - The script assumed `src/lib` directory always exists
3. **No graceful handling of missing `src/server.js`** - The script assumed a Node.js backend always exists
4. **Unclear error messages** - Users didn't know why the setup failed or what to do next

## Changes Made

### 1. Graceful Template Fetching

**Before:**
```javascript
const { points } = await client.scroll(TEMPLATE_COLLECTION, { ... });
if (!points || points.length === 0) {
  throw new Error('No templates found in collection ' + TEMPLATE_COLLECTION);
}
```

**After:**
```javascript
let points = [];
try {
  const { points: fetchedPoints } = await client.scroll(TEMPLATE_COLLECTION, { ... });
  if (fetchedPoints && fetchedPoints.length > 0) {
    points = fetchedPoints;
  } else {
    console.log('⚠️  No templates found in collection ' + TEMPLATE_COLLECTION);
    console.log('   Continuing with project setup anyway...\n');
  }
} catch (err) {
  console.warn(`⚠️  Could not fetch templates: ${err.message}`);
  console.log('   Continuing with project setup anyway...\n');
}
```

### 2. Universal Collection Creation

**Always creates the project collection**, regardless of whether:
- Templates were fetched successfully
- An API directory exists
- The project is frontend-only or full-stack

```javascript
console.log('\n🗄️  Creating Qdrant collection for project...');
try {
  await client.createCollection(PROJECT_COLLECTION, {
    vectors: { [VECTOR_NAME]: { size: 384, distance: 'Cosine' } },
  });
  console.log(`✅ Created collection: ${PROJECT_COLLECTION}`);
} catch (err) {
  if (err.message.includes("already exists")) {
    console.log(`ℹ️  Collection ${PROJECT_COLLECTION} already exists`);
  } else {
    console.warn(`⚠️  Could not create collection: ${err.message}`);
  }
}
```

### 3. Conditional npm Scripts Update

**Only updates package.json** if an API directory exists:

```javascript
if (API_DIR) {
  // Add sync-knowledge scripts
  pkg.scripts['sync-knowledge'] = 'node src/lib/gsd-qdrant-sync/index.js sync';
  // ...
} else {
  console.log('⚠️  No API directory found - skipping npm scripts update (frontend-only project)');
  console.log('   You can manually run sync-knowledge with: npx node scripts/sync-knowledge.js');
}
```

### 4. Conditional Hook Installation

**Only installs post-commit hook** if a `.git/hooks` directory exists:

```javascript
if (existsSync(join(PROJECT_ROOT, '.git', 'hooks'))) {
  await installPostCommitHook(PROJECT_ROOT, API_DIR);
}
```

The hook itself checks for the existence of `sync-knowledge` script before running it.

### 5. Conditional Server Patching

**Only patches `src/server.js`** if it exists:

```javascript
async function patchServerForWatcher(apiDir) {
  if (!apiDir) {
    console.log('⚠️  No API directory found, skipping watcher auto-start patch');
    return;
  }
  // ... rest of the function
}
```

### 6. Improved Error Handling for package.json

**Handles null API_DIR correctly:**

```javascript
function getPackageJsonPath(projectRoot, apiDir) {
  if (apiDir) {
    const apiPkg = join(apiDir, 'package.json');
    if (existsSync(apiPkg)) return apiPkg;
  }
  return join(projectRoot, 'package.json');
}
```

## Result

The CLI now works universally:

| Project Type | Collection Created | npm Scripts | Post-Commit Hook | Server Patch |
|--------------|-------------------|-------------|------------------|--------------|
| Frontend-only (Vite/React) | ✅ | ⚠️ (manual only) | ✅ | N/A |
| Backend-only (Express/Nest) | ✅ | ✅ | ✅ | ✅ |
| Full-stack (Monorepo) | ✅ | ✅ | ✅ | ✅ |

## Testing

Tested successfully with:
- ✅ Frontend-only project (`vite-project` in `prova_landing_page`)
- ✅ Created collection `vite-project-gsd`
- ✅ Installed post-commit hook with graceful fallback

## Next Steps

Consider adding:
1. A standalone `sync-knowledge.js` script for frontend-only projects
2. Better documentation on how to use the CLI in different project types
3. Optional flag to force collection creation even if templates fail to fetch
