/**
 * Tests for InMemoryTerminologyProvider
 *
 * Testing policy: ≥15 JSON fixture tests for validateCode,
 * ≥5 for expandValueSet, ≥5 for lookupCode.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTerminologyProvider } from '../inmemory-terminology-provider.js';
import type { CodeSystemDefinition, ValueSetDefinition } from '../types.js';

import adminGenderCS from './fixtures/codesystems/administrative-gender.json';
import obsCatCS from './fixtures/codesystems/observation-category.json';
import adminGenderVS from './fixtures/valuesets/administrative-gender-vs.json';
import obsCatVS from './fixtures/valuesets/observation-category-vs.json';
import expandedGenderVS from './fixtures/valuesets/expanded-gender-vs.json';
import enumConceptsVS from './fixtures/valuesets/enum-concepts-vs.json';
import excludeVS from './fixtures/valuesets/exclude-vs.json';

describe('InMemoryTerminologyProvider', () => {
  let provider: InMemoryTerminologyProvider;

  beforeEach(() => {
    provider = new InMemoryTerminologyProvider();
    provider.registerCodeSystem(adminGenderCS as unknown as CodeSystemDefinition);
    provider.registerCodeSystem(obsCatCS as unknown as CodeSystemDefinition);
    provider.registerValueSet(adminGenderVS as unknown as ValueSetDefinition);
    provider.registerValueSet(obsCatVS as unknown as ValueSetDefinition);
    provider.registerValueSet(expandedGenderVS as unknown as ValueSetDefinition);
    provider.registerValueSet(enumConceptsVS as unknown as ValueSetDefinition);
    provider.registerValueSet(excludeVS as unknown as ValueSetDefinition);
  });

  // =========================================================================
  // validateCode — ≥15 tests
  // =========================================================================

  describe('validateCode', () => {
    it('should validate code in compose-based ValueSet (whole system)', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender',
      });
      expect(result.result).toBe(true);
    });

    it('should reject code not in ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'nonbinary',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender',
      });
      expect(result.result).toBe(false);
    });

    it('should validate code in expanded ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'female',
        valueSetUrl: 'http://example.org/fhir/ValueSet/expanded-gender',
      });
      expect(result.result).toBe(true);
    });

    it('should reject code not in expanded ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'xyz',
        valueSetUrl: 'http://example.org/fhir/ValueSet/expanded-gender',
      });
      expect(result.result).toBe(false);
    });

    it('should validate code in enumerated concept ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
        valueSetUrl: 'http://example.org/fhir/ValueSet/vital-signs-subset',
      });
      expect(result.result).toBe(true);
    });

    it('should reject code not in enumerated concept ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'imaging',
        valueSetUrl: 'http://example.org/fhir/ValueSet/vital-signs-subset',
      });
      expect(result.result).toBe(false);
    });

    it('should respect exclude rules', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'unknown',
        valueSetUrl: 'http://example.org/fhir/ValueSet/gender-no-unknown',
      });
      expect(result.result).toBe(false);
    });

    it('should accept non-excluded code', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
        valueSetUrl: 'http://example.org/fhir/ValueSet/gender-no-unknown',
      });
      expect(result.result).toBe(true);
    });

    it('should return false for unknown ValueSet', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
        valueSetUrl: 'http://unknown.org/vs',
      });
      expect(result.result).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should validate code against CodeSystem when no valueSetUrl', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
      });
      expect(result.result).toBe(true);
    });

    it('should reject code not in CodeSystem when no valueSetUrl', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'nonbinary',
      });
      expect(result.result).toBe(false);
    });

    it('should return false for unknown CodeSystem when no valueSetUrl', async () => {
      const result = await provider.validateCode({
        system: 'http://unknown.org/cs',
        code: 'a',
      });
      expect(result.result).toBe(false);
    });

    it('should include display in result when code is valid', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
      });
      expect(result.display).toBe('Male');
    });

    it('should validate observation-category code', async () => {
      const result = await provider.validateCode({
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'laboratory',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-category',
      });
      expect(result.result).toBe(true);
    });

    it('should report display mismatch but still valid', async () => {
      const result = await provider.validateCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender',
        display: 'Wrong Display',
      });
      expect(result.result).toBe(true);
      expect(result.message).toContain('display');
    });

    it('should validate all 4 gender codes', async () => {
      for (const code of ['male', 'female', 'other', 'unknown']) {
        const result = await provider.validateCode({
          system: 'http://hl7.org/fhir/administrative-gender',
          code,
          valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender',
        });
        expect(result.result).toBe(true);
      }
    });
  });

  // =========================================================================
  // expandValueSet — ≥5 tests
  // =========================================================================

  describe('expandValueSet', () => {
    it('should expand from pre-expanded ValueSet', async () => {
      const result = await provider.expandValueSet({ url: 'http://example.org/fhir/ValueSet/expanded-gender' });
      expect(result.total).toBe(4);
      expect(result.contains.length).toBe(4);
    });

    it('should expand from compose-based ValueSet', async () => {
      const result = await provider.expandValueSet({ url: 'http://hl7.org/fhir/ValueSet/administrative-gender' });
      expect(result.contains.length).toBe(4);
    });

    it('should expand enumerated concept ValueSet', async () => {
      const result = await provider.expandValueSet({ url: 'http://example.org/fhir/ValueSet/vital-signs-subset' });
      expect(result.contains.length).toBe(2);
      expect(result.contains.map((c) => c.code)).toContain('vital-signs');
    });

    it('should apply text filter', async () => {
      const result = await provider.expandValueSet({
        url: 'http://example.org/fhir/ValueSet/expanded-gender',
        filter: 'mal',
      });
      expect(result.contains.length).toBe(2); // male + female
    });

    it('should apply pagination', async () => {
      const result = await provider.expandValueSet({
        url: 'http://example.org/fhir/ValueSet/expanded-gender',
        offset: 1,
        count: 2,
      });
      expect(result.contains.length).toBe(2);
      expect(result.total).toBe(4);
    });

    it('should return empty for unknown ValueSet', async () => {
      const result = await provider.expandValueSet({ url: 'http://unknown.org/vs' });
      expect(result.contains).toEqual([]);
    });
  });

  // =========================================================================
  // lookupCode — ≥5 tests
  // =========================================================================

  describe('lookupCode', () => {
    it('should look up existing code', async () => {
      const result = await provider.lookupCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
      });
      expect(result.found).toBe(true);
      expect(result.display).toBe('Male');
    });

    it('should return definition when available', async () => {
      const result = await provider.lookupCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'male',
      });
      expect(result.definition).toBe('Male.');
    });

    it('should return found=false for unknown code', async () => {
      const result = await provider.lookupCode({
        system: 'http://hl7.org/fhir/administrative-gender',
        code: 'xyz',
      });
      expect(result.found).toBe(false);
    });

    it('should return found=false for unknown system', async () => {
      const result = await provider.lookupCode({
        system: 'http://unknown.org',
        code: 'male',
      });
      expect(result.found).toBe(false);
    });

    it('should look up observation category code', async () => {
      const result = await provider.lookupCode({
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
      });
      expect(result.found).toBe(true);
      expect(result.display).toBe('Vital Signs');
    });
  });

  // =========================================================================
  // loadFromBundle
  // =========================================================================

  describe('loadFromBundle', () => {
    it('should load CodeSystems and ValueSets from bundle', () => {
      const fresh = new InMemoryTerminologyProvider();
      fresh.loadFromBundle({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: adminGenderCS },
          { resource: adminGenderVS },
        ],
      });
      const csReg = fresh.getCodeSystemRegistry();
      const vsReg = fresh.getValueSetRegistry();
      expect(csReg.has('http://hl7.org/fhir/administrative-gender')).toBe(true);
      expect(vsReg.has('http://hl7.org/fhir/ValueSet/administrative-gender')).toBe(true);
    });

    it('should ignore non-object bundle', () => {
      const fresh = new InMemoryTerminologyProvider();
      fresh.loadFromBundle(null);
      fresh.loadFromBundle('string');
      expect(fresh.getCodeSystemRegistry().size).toBe(0);
    });

    it('should ignore entries without resource', () => {
      const fresh = new InMemoryTerminologyProvider();
      fresh.loadFromBundle({
        resourceType: 'Bundle',
        entry: [{ fullUrl: 'http://example.org' }],
      });
      expect(fresh.getCodeSystemRegistry().size).toBe(0);
    });
  });
});
