/**
 * Tests for binding strength: example
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

describe('Binding strength: example', () => {
  it('should return undefined severity (skip validation)', () => {
    expect(severityForBindingStrength('example')).toBeUndefined();
  });

  it('should return undefined severity when no provider (skip)', () => {
    expect(severityWhenNoProvider('example')).toBeUndefined();
  });

  it('should NOT require validation', () => {
    expect(requiresValidation('example')).toBe(false);
  });

  it('should have correct description', () => {
    const desc = bindingStrengthDescription('example');
    expect(desc).toContain('not expected');
  });

  it('should be the least strict binding level', () => {
    // example always skips
    expect(severityForBindingStrength('example')).toBeUndefined();
    expect(severityForBindingStrength('preferred')).toBe('information');
  });

  it('should never produce issues regardless of provider availability', () => {
    expect(severityWhenNoProvider('example')).toBeUndefined();
    expect(severityForBindingStrength('example')).toBeUndefined();
  });
});
