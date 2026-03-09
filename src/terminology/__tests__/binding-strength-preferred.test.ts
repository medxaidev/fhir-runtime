/**
 * Tests for binding strength: preferred
 *
 * Testing policy: ≥5 unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  severityForBindingStrength,
  severityWhenNoProvider,
  requiresValidation,
  bindingStrengthDescription,
} from '../binding-strength.js';

describe('Binding strength: preferred', () => {
  it('should return information severity when code is not in ValueSet', () => {
    expect(severityForBindingStrength('preferred')).toBe('information');
  });

  it('should return undefined severity when no provider (skip)', () => {
    expect(severityWhenNoProvider('preferred')).toBeUndefined();
  });

  it('should require validation', () => {
    expect(requiresValidation('preferred')).toBe(true);
  });

  it('should have correct description', () => {
    const desc = bindingStrengthDescription('preferred');
    expect(desc).toContain('encouraged');
    expect(desc).toContain('not required');
  });

  it('should be less strict than extensible', () => {
    expect(severityForBindingStrength('preferred')).toBe('information');
    expect(severityForBindingStrength('extensible')).toBe('warning');
  });

  it('should not report when no provider (preferred is optional)', () => {
    expect(severityWhenNoProvider('preferred')).toBeUndefined();
  });
});
