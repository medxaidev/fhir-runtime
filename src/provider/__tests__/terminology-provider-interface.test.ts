/**
 * Tests for TerminologyProvider interface contract
 *
 * Verifies that custom implementations of TerminologyProvider
 * can be created and used correctly through the interface.
 */

import { describe, it, expect } from 'vitest';
import type {
  TerminologyProvider,
  ValidateCodeParams,
  ValidateCodeResult,
  ExpandValueSetParams,
  ValueSetExpansion,
  LookupCodeParams,
  LookupCodeResult,
} from '../types.js';

/**
 * A mock TerminologyProvider that rejects all codes.
 * Used to verify the interface contract.
 */
class RejectAllProvider implements TerminologyProvider {
  async validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult> {
    return {
      result: false,
      message: `Code '${params.code}' not found in system '${params.system}'`,
    };
  }

  async expandValueSet(_params: ExpandValueSetParams): Promise<ValueSetExpansion> {
    return { total: 0, contains: [] };
  }

  async lookupCode(_params: LookupCodeParams): Promise<LookupCodeResult> {
    return { found: false };
  }
}

/**
 * A mock TerminologyProvider that accepts specific codes.
 */
class AllowListProvider implements TerminologyProvider {
  private readonly allowedCodes = new Map<string, string>();

  constructor(codes: Array<{ system: string; code: string; display: string }>) {
    for (const c of codes) {
      this.allowedCodes.set(`${c.system}|${c.code}`, c.display);
    }
  }

  async validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult> {
    const key = `${params.system}|${params.code}`;
    const display = this.allowedCodes.get(key);
    if (display !== undefined) {
      return { result: true, display };
    }
    return { result: false, message: `Unknown code: ${key}` };
  }

  async expandValueSet(_params: ExpandValueSetParams): Promise<ValueSetExpansion> {
    const contains = Array.from(this.allowedCodes.entries()).map(([key, display]) => {
      const [system, code] = key.split('|');
      return { system, code, display };
    });
    return { total: contains.length, contains };
  }

  async lookupCode(params: LookupCodeParams): Promise<LookupCodeResult> {
    const key = `${params.system}|${params.code}`;
    const display = this.allowedCodes.get(key);
    if (display !== undefined) {
      return { found: true, display };
    }
    return { found: false };
  }
}

describe('TerminologyProvider interface contract', () => {
  // ─── RejectAllProvider ───
  describe('RejectAllProvider (custom implementation)', () => {
    const provider: TerminologyProvider = new RejectAllProvider();

    it('should reject a code with result=false', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.result).toBe(false);
      expect(result.message).toContain('12345-6');
    });

    it('should return empty expansion with total=0', async () => {
      const result = await provider.expandValueSet({
        url: 'http://hl7.org/fhir/ValueSet/anything',
      });
      expect(result.total).toBe(0);
      expect(result.contains).toEqual([]);
    });

    it('should return found=false for lookupCode', async () => {
      const result = await provider.lookupCode({
        system: 'http://loinc.org',
        code: '12345-6',
      });
      expect(result.found).toBe(false);
    });
  });

  // ─── AllowListProvider ───
  describe('AllowListProvider (custom implementation)', () => {
    const provider: TerminologyProvider = new AllowListProvider([
      { system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' },
      { system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' },
    ]);

    it('should accept a known code', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '8480-6',
      });
      expect(result.result).toBe(true);
      expect(result.display).toBe('Systolic blood pressure');
    });

    it('should reject an unknown code', async () => {
      const result = await provider.validateCode({
        system: 'http://loinc.org',
        code: '99999-9',
      });
      expect(result.result).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('should expand with known codes', async () => {
      const result = await provider.expandValueSet({
        url: 'http://example.org/ValueSet/bp-codes',
      });
      expect(result.total).toBe(2);
      expect(result.contains).toHaveLength(2);
      expect(result.contains[0].code).toBe('8480-6');
    });

    it('should look up a known code', async () => {
      const result = await provider.lookupCode({
        system: 'http://loinc.org',
        code: '8462-4',
      });
      expect(result.found).toBe(true);
      expect(result.display).toBe('Diastolic blood pressure');
    });

    it('should not find an unknown code on lookup', async () => {
      const result = await provider.lookupCode({
        system: 'http://loinc.org',
        code: '99999-9',
      });
      expect(result.found).toBe(false);
    });
  });
});
