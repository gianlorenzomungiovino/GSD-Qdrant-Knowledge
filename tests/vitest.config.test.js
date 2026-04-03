import { describe, it, expect } from 'vitest';

describe('Test Framework', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should calculate correctly', () => {
    expect(1 + 1).toBe(2);
  });
});