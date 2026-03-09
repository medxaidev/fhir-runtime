/**
 * Tests for binding strength: required
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

describe('Binding strength: required', () => {
  it('should return error severity when code is not in ValueSet', () => {
    expect(severityForBindingStrength('required')).toBe('error');
  });

  it('should return warning severity when no provider is available', () => {
    expect(severityWhenNoProvider('required')).toBe('warning');
  });

  it('should require validation', () => {
    expect(requiresValidation('required')).toBe(true);
  });

  it('should have correct description', () => {
    const desc = bindingStrengthDescription('required');
    expect(desc).toContain('SHALL');
    expect(desc).toContain('value set');
  });

  it('should be the strictest binding level', () => {
    // required is stricter than extensible (error vs warning)
    expect(severityForBindingStrength('required')).toBe('error');
    expect(severityForBindingStrength('extensible')).toBe('warning');
  });

  it('should warn about skipped validation even when no provider', () => {
    // required + no provider = warning (not just information)
    const sev = severityWhenNoProvider('required');
    expect(sev).toBe('warning');
    // vs extensible + no provider = information
    expect(severityWhenNoProvider('extensible')).toBe('information');
  });
});
