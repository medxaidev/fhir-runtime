/**
 * Tests for ValueSet Membership
 *
 * Testing policy: ≥15 JSON fixture tests for compose + expansion membership.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isCodeInValueSet } from '../valueset-membership.js';
import { CodeSystemRegistry } from '../codesystem-registry.js';
import type { ValueSetDefinition, CodeSystemDefinition } from '../types.js';

import adminGenderCS from './fixtures/codesystems/administrative-gender.json';
import hierarchicalCS from './fixtures/codesystems/hierarchical-condition.json';
import obsCatCS from './fixtures/codesystems/observation-category.json';
import adminGenderVS from './fixtures/valuesets/administrative-gender-vs.json';
import obsCatVS from './fixtures/valuesets/observation-category-vs.json';
import expandedGenderVS from './fixtures/valuesets/expanded-gender-vs.json';
import enumConceptsVS from './fixtures/valuesets/enum-concepts-vs.json';
import excludeVS from './fixtures/valuesets/exclude-vs.json';

describe('ValueSet Membership', () => {
  let csRegistry: CodeSystemRegistry;

  beforeEach(() => {
    csRegistry = new CodeSystemRegistry();
    csRegistry.register(adminGenderCS as unknown as CodeSystemDefinition);
    csRegistry.register(hierarchicalCS as unknown as CodeSystemDefinition);
    csRegistry.register(obsCatCS as unknown as CodeSystemDefinition);
  });

  // ─── Expansion-based membership ───────────────────────────────────────
  describe('Expansion-based membership', () => {
    it('should find code in expanded ValueSet', () => {
      expect(isCodeInValueSet(
        expandedGenderVS as unknown as ValueSetDefinition,
        'http://hl7.org/fhir/administrative-gender', 'male',
      )).toBe(true);
    });

    it('should find all codes in expanded ValueSet', () => {
      const vs = expandedGenderVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'female')).toBe(true);
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'other')).toBe(true);
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'unknown')).toBe(true);
    });

    it('should reject code not in expanded ValueSet', () => {
      expect(isCodeInValueSet(
        expandedGenderVS as unknown as ValueSetDefinition,
        'http://hl7.org/fhir/administrative-gender', 'nonbinary',
      )).toBe(false);
    });

    it('should reject code with wrong system in expanded ValueSet', () => {
      expect(isCodeInValueSet(
        expandedGenderVS as unknown as ValueSetDefinition,
        'http://other.org', 'male',
      )).toBe(false);
    });

    it('should prefer expansion over compose when both exist', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        expansion: {
          contains: [{ system: 'http://example.org', code: 'a' }],
        },
        compose: {
          include: [{ system: 'http://example.org', concept: [{ code: 'b' }] }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://example.org', 'a')).toBe(true);
      expect(isCodeInValueSet(vs, 'http://example.org', 'b')).toBe(false);
    });
  });

  // ─── Compose-based membership: whole system include ───────────────────
  describe('Compose-based: whole system include', () => {
    it('should include any code from included system', () => {
      const vs = adminGenderVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'male', csRegistry)).toBe(true);
    });

    it('should include all codes from included system', () => {
      const vs = obsCatVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', csRegistry)).toBe(true);
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'laboratory', csRegistry)).toBe(true);
    });

    it('should reject code from different system', () => {
      const vs = adminGenderVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://other.org', 'male', csRegistry)).toBe(false);
    });
  });

  // ─── Compose-based membership: enumerated concepts ────────────────────
  describe('Compose-based: enumerated concepts', () => {
    it('should include enumerated concept', () => {
      const vs = enumConceptsVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', csRegistry)).toBe(true);
    });

    it('should include second enumerated concept', () => {
      const vs = enumConceptsVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'laboratory', csRegistry)).toBe(true);
    });

    it('should reject concept not in enumerated list', () => {
      const vs = enumConceptsVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'imaging', csRegistry)).toBe(false);
    });
  });

  // ─── Compose-based membership: exclude ────────────────────────────────
  describe('Compose-based: exclude rules', () => {
    it('should include non-excluded code', () => {
      const vs = excludeVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'male', csRegistry)).toBe(true);
    });

    it('should exclude explicitly excluded code', () => {
      const vs = excludeVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'unknown', csRegistry)).toBe(false);
    });

    it('should include other non-excluded codes', () => {
      const vs = excludeVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'female', csRegistry)).toBe(true);
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'other', csRegistry)).toBe(true);
    });
  });

  // ─── Compose-based membership: filters ────────────────────────────────
  describe('Compose-based: filters', () => {
    it('should match is-a filter (ancestor itself)', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        compose: {
          include: [{
            system: 'http://example.org/fhir/CodeSystem/condition-category',
            filter: [{ property: 'concept', op: 'is-a', value: 'infectious' }],
          }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'infectious', csRegistry)).toBe(true);
    });

    it('should match is-a filter (descendant)', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        compose: {
          include: [{
            system: 'http://example.org/fhir/CodeSystem/condition-category',
            filter: [{ property: 'concept', op: 'is-a', value: 'infectious' }],
          }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'bacterial', csRegistry)).toBe(true);
    });

    it('should reject non-descendant for is-a filter', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        compose: {
          include: [{
            system: 'http://example.org/fhir/CodeSystem/condition-category',
            filter: [{ property: 'concept', op: 'is-a', value: 'infectious' }],
          }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'finding', csRegistry)).toBe(false);
    });

    it('should match in filter', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        compose: {
          include: [{
            system: 'http://hl7.org/fhir/administrative-gender',
            filter: [{ property: 'concept', op: 'in', value: 'male,female' }],
          }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'male', csRegistry)).toBe(true);
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'other', csRegistry)).toBe(false);
    });

    it('should match regex filter', () => {
      const vs: ValueSetDefinition = {
        url: 'http://example.org/vs',
        compose: {
          include: [{
            system: 'http://hl7.org/fhir/administrative-gender',
            filter: [{ property: 'concept', op: 'regex', value: '^m' }],
          }],
        },
      };
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'male', csRegistry)).toBe(true);
      expect(isCodeInValueSet(vs, 'http://hl7.org/fhir/administrative-gender', 'female', csRegistry)).toBe(false);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('should return false for ValueSet with no compose and no expansion', () => {
      const vs: ValueSetDefinition = { url: 'http://example.org/empty' };
      expect(isCodeInValueSet(vs, 'http://example.org', 'a')).toBe(false);
    });

    it('should work without csRegistry for enumerated concepts', () => {
      const vs = enumConceptsVS as unknown as ValueSetDefinition;
      expect(isCodeInValueSet(vs, 'http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs')).toBe(true);
    });
  });
});
