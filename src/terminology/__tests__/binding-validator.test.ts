/**
 * Tests for validateBinding()
 *
 * Testing policy: ≥15 JSON fixture tests for binding validation.
 */

import { describe, it, expect } from 'vitest';
import { validateBinding, extractCodedValues } from '../binding-validator.js';
import type { BindingConstraintInput } from '../binding-validator.js';
import type { TerminologyProvider, ValidateCodeResult } from '../../provider/types.js';

// =============================================================================
// Mock provider helpers
// =============================================================================

function makeProvider(validateFn: (p: { system: string; code: string }) => ValidateCodeResult): TerminologyProvider {
  return {
    async validateCode(params) { return validateFn(params); },
    async expandValueSet() { return { contains: [] }; },
    async lookupCode() { return { found: false }; },
  };
}

const acceptAll = makeProvider(() => ({ result: true, message: 'ok' }));
const rejectAll = makeProvider(() => ({ result: false, message: 'rejected' }));

function makeSelectiveProvider(validCodes: Set<string>): TerminologyProvider {
  return makeProvider(({ code }) => validCodes.has(code)
    ? { result: true, message: 'valid' }
    : { result: false, message: `Code '${code}' not found` });
}

// =============================================================================
// Tests
// =============================================================================

describe('validateBinding()', () => {
  // ─── Example binding (always skipped) ─────────────────────────────────
  it('should skip validation for example binding', async () => {
    const result = await validateBinding('any-code', { strength: 'example', valueSetUrl: 'http://example.org/vs' }, rejectAll);
    expect(result.valid).toBe(true);
  });

  // ─── No ValueSet URL ──────────────────────────────────────────────────
  it('should return valid when no ValueSet URL', async () => {
    const result = await validateBinding('code', { strength: 'required' }, acceptAll);
    expect(result.valid).toBe(true);
  });

  // ─── No provider ──────────────────────────────────────────────────────
  it('should warn for required binding when no provider', async () => {
    const result = await validateBinding('code', { strength: 'required', valueSetUrl: 'http://example.org/vs' }, undefined);
    expect(result.severity).toBe('warning');
    expect(result.message).toContain('skipped');
  });

  it('should info for extensible binding when no provider', async () => {
    const result = await validateBinding('code', { strength: 'extensible', valueSetUrl: 'http://example.org/vs' }, undefined);
    expect(result.severity).toBe('information');
  });

  it('should skip preferred binding when no provider', async () => {
    const result = await validateBinding('code', { strength: 'preferred', valueSetUrl: 'http://example.org/vs' }, undefined);
    expect(result.valid).toBe(true);
  });

  // ─── Required binding: valid code ─────────────────────────────────────
  it('should accept valid code for required binding', async () => {
    const result = await validateBinding(
      'male',
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      acceptAll,
    );
    expect(result.valid).toBe(true);
  });

  // ─── Required binding: invalid code ───────────────────────────────────
  it('should reject invalid code for required binding with error severity', async () => {
    const result = await validateBinding(
      'invalid',
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
  });

  // ─── Extensible binding: invalid code ─────────────────────────────────
  it('should reject invalid code for extensible binding with warning severity', async () => {
    const result = await validateBinding(
      'invalid',
      { strength: 'extensible', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('warning');
  });

  // ─── Preferred binding: invalid code ──────────────────────────────────
  it('should reject invalid code for preferred binding with information severity', async () => {
    const result = await validateBinding(
      'invalid',
      { strength: 'preferred', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('information');
  });

  // ─── Coding object ────────────────────────────────────────────────────
  it('should validate Coding object', async () => {
    const coding = { system: 'http://loinc.org', code: '12345-6' };
    const result = await validateBinding(
      coding,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      acceptAll,
    );
    expect(result.valid).toBe(true);
  });

  it('should reject invalid Coding object', async () => {
    const coding = { system: 'http://loinc.org', code: 'invalid' };
    const result = await validateBinding(
      coding,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
  });

  // ─── CodeableConcept ──────────────────────────────────────────────────
  it('should accept CodeableConcept when at least one coding is valid (required)', async () => {
    const cc = {
      coding: [
        { system: 'http://loinc.org', code: 'valid' },
        { system: 'http://snomed.info', code: 'invalid' },
      ],
    };
    const provider = makeSelectiveProvider(new Set(['valid']));
    const result = await validateBinding(
      cc,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should reject CodeableConcept when no coding is valid (required)', async () => {
    const cc = {
      coding: [
        { system: 'http://loinc.org', code: 'bad1' },
        { system: 'http://snomed.info', code: 'bad2' },
      ],
    };
    const result = await validateBinding(
      cc,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
  });

  // ─── Null / undefined / empty ─────────────────────────────────────────
  it('should return valid for null value', async () => {
    const result = await validateBinding(
      null,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(true);
  });

  it('should return valid for undefined value', async () => {
    const result = await validateBinding(
      undefined,
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      rejectAll,
    );
    expect(result.valid).toBe(true);
  });

  // ─── Provider error handling ──────────────────────────────────────────
  it('should handle provider errors gracefully', async () => {
    const errorProvider: TerminologyProvider = {
      async validateCode() { throw new Error('Network error'); },
      async expandValueSet() { return { contains: [] }; },
      async lookupCode() { return { found: false }; },
    };
    const result = await validateBinding(
      'code',
      { strength: 'required', valueSetUrl: 'http://example.org/vs' },
      errorProvider,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('warning');
    expect(result.message).toContain('error');
  });
});

// =============================================================================
// extractCodedValues tests
// =============================================================================

describe('extractCodedValues()', () => {
  it('should extract from plain string', () => {
    const codes = extractCodedValues('male');
    expect(codes).toEqual([{ system: '', code: 'male' }]);
  });

  it('should extract from Coding', () => {
    const codes = extractCodedValues({ system: 'http://loinc.org', code: '12345-6', display: 'Test' });
    expect(codes).toEqual([{ system: 'http://loinc.org', code: '12345-6', display: 'Test' }]);
  });

  it('should extract from CodeableConcept', () => {
    const codes = extractCodedValues({
      coding: [
        { system: 'http://loinc.org', code: 'a' },
        { system: 'http://snomed.info', code: 'b' },
      ],
    });
    expect(codes.length).toBe(2);
  });

  it('should return empty for null', () => {
    expect(extractCodedValues(null)).toEqual([]);
  });

  it('should return empty for number', () => {
    expect(extractCodedValues(42)).toEqual([]);
  });
});
