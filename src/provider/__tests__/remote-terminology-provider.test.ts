/**
 * Tests for RemoteTerminologyProvider interface and integration.
 *
 * STAGE-B: v0.9.0
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  RemoteTerminologyProvider,
  RemoteExpandParams,
  RemoteValidateCodeParams,
  RemoteValidateCodeResult,
  RemoteLookupParams,
  RemoteLookupResult,
} from '../remote-terminology-provider.js';

// =============================================================================
// Mock implementation for testing
// =============================================================================

function createMockRemoteProvider(overrides?: Partial<RemoteTerminologyProvider>): RemoteTerminologyProvider {
  return {
    expandValueSet: vi.fn().mockResolvedValue({ resourceType: 'ValueSet', expansion: { contains: [] } }),
    validateCode: vi.fn().mockResolvedValue({ result: true }),
    lookupCode: vi.fn().mockResolvedValue({ name: 'TestSystem', display: 'Test' }),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('RemoteTerminologyProvider Interface', () => {
  describe('expandValueSet', () => {
    it('should accept valid expand parameters', async () => {
      const provider = createMockRemoteProvider();
      const params: RemoteExpandParams = {
        url: 'http://example.org/fhir/ValueSet/test',
        filter: 'abc',
        count: 10,
        offset: 0,
      };
      const result = await provider.expandValueSet(params);
      expect(result).toBeDefined();
      expect(provider.expandValueSet).toHaveBeenCalledWith(params);
    });

    it('should accept minimal expand parameters', async () => {
      const provider = createMockRemoteProvider();
      const params: RemoteExpandParams = { url: 'http://example.org/fhir/ValueSet/test' };
      await provider.expandValueSet(params);
      expect(provider.expandValueSet).toHaveBeenCalledWith(params);
    });
  });

  describe('validateCode', () => {
    it('should validate a code and return result', async () => {
      const provider = createMockRemoteProvider({
        validateCode: vi.fn().mockResolvedValue({ result: true, display: 'Test Code' }),
      });
      const params: RemoteValidateCodeParams = {
        code: '12345-6',
        system: 'http://loinc.org',
        url: 'http://example.org/fhir/ValueSet/test',
      };
      const result: RemoteValidateCodeResult = await provider.validateCode(params);
      expect(result.result).toBe(true);
      expect(result.display).toBe('Test Code');
    });

    it('should return false for invalid code', async () => {
      const provider = createMockRemoteProvider({
        validateCode: vi.fn().mockResolvedValue({ result: false, message: 'Code not found' }),
      });
      const result = await provider.validateCode({ code: 'invalid', system: 'http://loinc.org' });
      expect(result.result).toBe(false);
      expect(result.message).toBe('Code not found');
    });
  });

  describe('lookupCode', () => {
    it('should look up a code and return properties', async () => {
      const provider = createMockRemoteProvider({
        lookupCode: vi.fn().mockResolvedValue({
          name: 'LOINC',
          display: 'Glucose [Mass/volume] in Blood',
          definition: 'Glucose measurement in blood',
          designation: [{ language: 'en', value: 'Blood glucose' }],
          property: [{ code: 'COMPONENT', value: 'Glucose' }],
        }),
      });
      const params: RemoteLookupParams = { code: '2339-0', system: 'http://loinc.org' };
      const result: RemoteLookupResult = await provider.lookupCode(params);
      expect(result.name).toBe('LOINC');
      expect(result.display).toBe('Glucose [Mass/volume] in Blood');
      expect(result.designation).toHaveLength(1);
      expect(result.property).toHaveLength(1);
    });

    it('should accept version and displayLanguage parameters', async () => {
      const provider = createMockRemoteProvider();
      const params: RemoteLookupParams = {
        code: '12345-6',
        system: 'http://loinc.org',
        version: '2.74',
        displayLanguage: 'de',
      };
      await provider.lookupCode(params);
      expect(provider.lookupCode).toHaveBeenCalledWith(params);
    });
  });
});
