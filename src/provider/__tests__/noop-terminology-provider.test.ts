/**
 * Tests for NoOpTerminologyProvider
 *
 * Verifies that the NoOp implementation:
 * - Always returns { result: true } for validateCode
 * - Always returns empty expansion for expandValueSet
 * - Always returns { found: false } for lookupCode
 * - Handles various input shapes gracefully
 */

import { describe, it, expect } from 'vitest';
import { NoOpTerminologyProvider } from '../noop-terminology-provider.js';
import type { TerminologyProvider } from '../types.js';

describe('NoOpTerminologyProvider', () => {
  const provider = new NoOpTerminologyProvider();

  // ─── implements TerminologyProvider ───
  it('should implement the TerminologyProvider interface', () => {
    const tp: TerminologyProvider = provider;
    expect(tp.validateCode).toBeDefined();
    expect(tp.expandValueSet).toBeDefined();
    expect(tp.lookupCode).toBeDefined();
  });

  // ─── validateCode ───
  describe('validateCode', () => {
    it('should return result=true for a simple code', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.result).toBe(true);
    });

    it('should return result=true with valueSetUrl', async () => {
      const result = await provider.validateCode({
        system: 'http://snomed.info/sct',
        code: '73211009',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/clinical-findings',
      });
      expect(result.result).toBe(true);
    });

    it('should return result=true with display', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '12345-6',
        display: 'Some Test',
      });
      expect(result.result).toBe(true);
    });

    it('should return result=true for empty code', async () => {
      const result = await provider.validateCode({
        system: '',
        code: '',
      });
      expect(result.result).toBe(true);
    });

    it('should not include message or display in result', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.message).toBeUndefined();
      expect(result.display).toBeUndefined();
    });
  });

  // ─── expandValueSet ───
  describe('expandValueSet', () => {
    it('should return empty contains array', async () => {
      const result = await provider.expandValueSet({
        url: 'http://hl7.org/fhir/ValueSet/observation-status',
      });
      expect(result.contains).toEqual([]);
    });

    it('should return empty contains with filter', async () => {
      const result = await provider.expandValueSet({
        url: 'http://hl7.org/fhir/ValueSet/observation-status',
        filter: 'final',
      });
      expect(result.contains).toEqual([]);
    });

    it('should return empty contains with pagination', async () => {
      const result = await provider.expandValueSet({
        url: 'http://hl7.org/fhir/ValueSet/observation-status',
        offset: 0,
        count: 10,
      });
      expect(result.contains).toEqual([]);
    });

    it('should not include total in result', async () => {
      const result = await provider.expandValueSet({
        url: 'http://hl7.org/fhir/ValueSet/observation-status',
      });
      expect(result.total).toBeUndefined();
    });

    it('should handle empty url', async () => {
      const result = await provider.expandValueSet({ url: '' });
      expect(result.contains).toEqual([]);
    });
  });

  // ─── lookupCode ───
  describe('lookupCode', () => {
    it('should return found=false for any code', async () => {
      const result = await provider.lookupCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.found).toBe(false);
    });

    it('should not include display in result', async () => {
      const result = await provider.lookupCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.display).toBeUndefined();
    });

    it('should not include definition in result', async () => {
      const result = await provider.lookupCode({
        system: 'http://snomed.info/sct',
        code: '73211009',
      });
      expect(result.definition).toBeUndefined();
    });

    it('should handle empty system and code', async () => {
      const result = await provider.lookupCode({
        system: '',
        code: '',
      });
      expect(result.found).toBe(false);
    });

    it('should return found=false for SNOMED code', async () => {
      const result = await provider.lookupCode({
        system: 'http://snomed.info/sct',
        code: '73211009',
      });
      expect(result.found).toBe(false);
    });
  });
});
