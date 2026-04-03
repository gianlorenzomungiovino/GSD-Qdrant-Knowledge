/**
 * Utility functions for GSD + Qdrant CLI
 * 
 * These functions are exported for testing purposes.
 */

const { existsSync } = require('fs');
const { join, dirname } = require('path');

const ROOT_PKG = 'package.json';
const API_PKG = 'apps/api/package.json';

/**
 * Find package.json path
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Path to package.json or null
 */
function findPackagePath(projectRoot = process.cwd()) {
  const apiPkg = join(projectRoot, API_PKG);
  const rootPkg = join(projectRoot, ROOT_PKG);
  
  if (existsSync(apiPkg)) return apiPkg;
  if (existsSync(rootPkg)) return rootPkg;
  return null;
}

/**
 * Install required packages
 * @param {string} pkgPath - Path to package.json
 * @param {string[]} packages - Array of packages to install
 */
function installDependencies(pkgPath, packages = []) {
  const pkgDir = pkgPath.replace(/\\/g, '/');
  const target = pkgPath.includes('apps/api') ? 'apps/api' : 'project root';
  
  console.log(`\n📦 Installing required dependencies in ${target}...`);
  console.log(`Packages: ${packages.join(', ')}`);
}

/**
 * Get API directory
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Path to API directory or null
 */
function getApiDir(projectRoot = process.cwd()) {
  const appsApi = join(projectRoot, 'apps', 'api');
  if (existsSync(appsApi)) return appsApi;
  return null;
}

/**
 * Check if package.json exists
 * @param {string} pkgPath - Path to package.json
 * @returns {boolean} True if exists
 */
function hasPackageJson(pkgPath) {
  return existsSync(pkgPath);
}

module.exports = {
  findPackagePath,
  installDependencies,
  getApiDir,
  hasPackageJson,
};