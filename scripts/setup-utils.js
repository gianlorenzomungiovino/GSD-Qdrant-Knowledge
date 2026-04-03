/**
 * Utility functions for setup-from-templates
 * 
 * These functions are exported for testing purposes.
 */

const fs = require('fs');
const { join, basename, dirname } = require('path');

const existsSync = fs.existsSync;

/**
 * Get project name from package.json
 * @param {string} projectRoot - Project root directory
 * @returns {string} Project name
 */
function getProjectName(projectRoot) {
  try {
    const pkgPath = join(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name;
    }
  } catch (_e) {}
  return basename(projectRoot.replace(/\\/g, '/'));
}

/**
 * Find project root directory
 * @param {string} startDir - Starting directory
 * @returns {string} Project root directory
 */
function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    try {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) return dir;
    } catch (_e) {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/**
 * Get API directory
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} API directory path or null
 */
function getApiDir(projectRoot) {
  const appsApi = join(projectRoot, 'apps', 'api');
  if (existsSync(appsApi)) return appsApi;
  return null;
}

/**
 * Get package.json path
 * @param {string} projectRoot - Project root directory
 * @param {string} apiDir - API directory path
 * @returns {string} Package.json path
 */
function getPackageJsonPath(projectRoot, apiDir) {
  const apiPkg = join(apiDir, 'package.json');
  if (existsSync(apiPkg)) return apiPkg;
  return join(projectRoot, 'package.json');
}

module.exports = {
  getProjectName,
  findProjectRoot,
  getApiDir,
  getPackageJsonPath,
  existsSync,
};