import { describe, it, expect } from 'vitest';
import { getProjectName, findProjectRoot, getApiDir, getPackageJsonPath, existsSync } from '../scripts/setup-utils';

describe('Setup Utilities', () => {
  describe('getProjectName', () => {
    it('should get project name from package.json', () => {
      const name = getProjectName('.');
      expect(name).toBe('gsd-qdrant-cli');
    });

    it('should fallback to directory name if no package.json', () => {
      const name = getProjectName('/tmp');
      expect(name).toBeDefined();
    });
  });

  describe('findProjectRoot', () => {
    it('should find project root with package.json', () => {
      const root = findProjectRoot('.');
      expect(root).toBeDefined();
      expect(root.startsWith('.')).toBe(true);
    });
  });

  describe('getApiDir', () => {
    it('should return null when apps/api does not exist', () => {
      const apiDir = getApiDir('.');
      expect(apiDir).toBeNull();
    });
  });

  describe('getPackageJsonPath', () => {
    it('should return correct package.json path', () => {
      const pkgPath = getPackageJsonPath('.', 'apps/api');
      expect(pkgPath).toContain('package.json');
    });
  });

  describe('existsSync', () => {
    it('should return true for existing file', () => {
      expect(existsSync('./package.json')).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(existsSync('./nonexistent.json')).toBe(false);
    });
  });
});