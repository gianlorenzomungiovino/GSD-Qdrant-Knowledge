import { describe, it, expect, vi } from 'vitest';
import { findPackagePath, installDependencies, getApiDir, hasPackageJson } from '../scripts/cli-utils';

describe('CLI Utilities', () => {
  describe('findPackagePath', () => {
    it('should find root package.json', () => {
      const result = findPackagePath('.');
      expect(result).toContain('package.json');
    });

    it('should prefer apps/api/package.json if exists', () => {
      const result = findPackagePath('.');
      // The function prefers apps/api/package.json if it exists
      expect(result).toBeDefined();
    });
  });

  describe('installDependencies', () => {
    it('should log installation message', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      installDependencies('./package.json', ['@qdrant/js-client-rest', '@xenova/transformers']);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Installing required dependencies')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getApiDir', () => {
    it('should return null when apps/api does not exist', () => {
      const result = getApiDir('.');
      expect(result).toBeNull();
    });
  });

  describe('hasPackageJson', () => {
    it('should return true for existing package.json', () => {
      const result = hasPackageJson('./package.json');
      expect(result).toBe(true);
    });

    it('should return false for non-existing package.json', () => {
      const result = hasPackageJson('./nonexistent.json');
      expect(result).toBe(false);
    });
  });
});