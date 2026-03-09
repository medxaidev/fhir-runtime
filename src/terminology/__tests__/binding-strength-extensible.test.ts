/**
 * Tests for binding strength: extensible
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

describe('Binding strength: extensible', () => {
  it('should return warning severity when code is not in ValueSet', () => {
    expect(severityForBindingStrength('extensible')).toBe('warning');
  });

  it('should return information severity when no provider is available', () => {
    expect(severityWhenNoProvider('extensible')).toBe('information');
  });

  it('should require validation', () => {
    expect(requiresValidation('extensible')).toBe(true);
  });

  it('should have correct description', () => {
    const desc = bindingStrengthDescription('extensible');
    expect(desc).toContain('SHALL');
    expect(desc).toContain('if any of the codes');
  });

  it('should be less strict than required', () => {
    expect(severityForBindingStrength('extensible')).toBe('warning');
    expect(severityForBindingStrength('required')).toBe('error');
  });

  it('should produce lower severity than required when no provider', () => {
    expect(severityWhenNoProvider('extensible')).toBe('information');
    expect(severityWhenNoProvider('required')).toBe('warning');
  });
});
