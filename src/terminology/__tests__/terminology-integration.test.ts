/**
 * Integration tests for Terminology Binding Validation
 *
 * Tests the full flow: InMemoryTerminologyProvider + validateBinding + pipeline.
 * Testing policy: ≥15 integration tests + pipeline integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTerminologyProvider } from '../inmemory-terminology-provider.js';
import { validateBinding } from '../binding-validator.js';
import { isCodeInValueSet } from '../valueset-membership.js';
import { CodeSystemRegistry } from '../codesystem-registry.js';
import { ValueSetRegistry } from '../valueset-registry.js';
import type { CodeSystemDefinition, ValueSetDefinition } from '../types.js';

import adminGenderCS from './fixtures/codesystems/administrative-gender.json';
import obsCatCS from './fixtures/codesystems/observation-category.json';
import hierarchicalCS from './fixtures/codesystems/hierarchical-condition.json';
import adminGenderVS from './fixtures/valuesets/administrative-gender-vs.json';
import obsCatVS from './fixtures/valuesets/observation-category-vs.json';
import expandedGenderVS from './fixtures/valuesets/expanded-gender-vs.json';
import enumConceptsVS from './fixtures/valuesets/enum-concepts-vs.json';
import excludeVS from './fixtures/valuesets/exclude-vs.json';

describe('Terminology Integration', () => {
  let provider: InMemoryTerminologyProvider;

  beforeEach(() => {
    provider = new InMemoryTerminologyProvider();
    provider.registerCodeSystem(adminGenderCS as unknown as CodeSystemDefinition);
    provider.registerCodeSystem(obsCatCS as unknown as CodeSystemDefinition);
    provider.registerCodeSystem(hierarchicalCS as unknown as CodeSystemDefinition);
    provider.registerValueSet(adminGenderVS as unknown as ValueSetDefinition);
    provider.registerValueSet(obsCatVS as unknown as ValueSetDefinition);
    provider.registerValueSet(expandedGenderVS as unknown as ValueSetDefinition);
    provider.registerValueSet(enumConceptsVS as unknown as ValueSetDefinition);
    provider.registerValueSet(excludeVS as unknown as ValueSetDefinition);
  });

  // ─── End-to-end: validateBinding + InMemoryTerminologyProvider ────────

  it('should validate required binding with valid code string', async () => {
    const result = await validateBinding(
      'male',
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should reject required binding with invalid code string', async () => {
    const result = await validateBinding(
      'nonbinary',
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
  });

  it('should validate extensible binding with valid Coding', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'female' },
      { strength: 'extensible', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should warn for extensible binding with invalid Coding', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'xyz' },
      { strength: 'extensible', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('warning');
  });

  it('should info for preferred binding with invalid Coding', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'xyz' },
      { strength: 'preferred', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('information');
  });

  it('should skip example binding entirely', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'xyz' },
      { strength: 'example', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should validate CodeableConcept with required binding (at least one valid)', async () => {
    const cc = {
      coding: [
        { system: 'http://hl7.org/fhir/administrative-gender', code: 'male' },
        { system: 'http://example.org', code: 'custom' },
      ],
    };
    const result = await validateBinding(
      cc,
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should reject CodeableConcept when no coding is valid (required)', async () => {
    const cc = {
      coding: [
        { system: 'http://example.org', code: 'custom1' },
        { system: 'http://example.org', code: 'custom2' },
      ],
    };
    const result = await validateBinding(
      cc,
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      provider,
    );
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
  });

  it('should validate observation-category vital-signs in compose VS', async () => {
    const result = await validateBinding(
      { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' },
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-category' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should validate code in expanded ValueSet', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'other' },
      { strength: 'required', valueSetUrl: 'http://example.org/fhir/ValueSet/expanded-gender' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should validate code in enumerated concept ValueSet', async () => {
    const result = await validateBinding(
      { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' },
      { strength: 'required', valueSetUrl: 'http://example.org/fhir/ValueSet/vital-signs-subset' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  it('should reject code not in enumerated concept ValueSet', async () => {
    const result = await validateBinding(
      { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'imaging' },
      { strength: 'required', valueSetUrl: 'http://example.org/fhir/ValueSet/vital-signs-subset' },
      provider,
    );
    expect(result.valid).toBe(false);
  });

  it('should respect exclude rules in binding validation', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'unknown' },
      { strength: 'required', valueSetUrl: 'http://example.org/fhir/ValueSet/gender-no-unknown' },
      provider,
    );
    expect(result.valid).toBe(false);
  });

  it('should accept non-excluded code in exclude VS', async () => {
    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'female' },
      { strength: 'required', valueSetUrl: 'http://example.org/fhir/ValueSet/gender-no-unknown' },
      provider,
    );
    expect(result.valid).toBe(true);
  });

  // ─── Bundle loading integration ───────────────────────────────────────

  it('should load from bundle and validate end-to-end', async () => {
    const fresh = new InMemoryTerminologyProvider();
    fresh.loadFromBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: adminGenderCS },
        { resource: adminGenderVS },
      ],
    });

    const result = await validateBinding(
      { system: 'http://hl7.org/fhir/administrative-gender', code: 'male' },
      { strength: 'required', valueSetUrl: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
      fresh,
    );
    expect(result.valid).toBe(true);
  });

  // ─── Registry + Membership integration ────────────────────────────────

  it('should use CodeSystemRegistry for hierarchical membership checks', () => {
    const csReg = new CodeSystemRegistry();
    csReg.register(hierarchicalCS as unknown as CodeSystemDefinition);

    const vs: ValueSetDefinition = {
      url: 'http://example.org/vs',
      compose: {
        include: [{
          system: 'http://example.org/fhir/CodeSystem/condition-category',
          filter: [{ property: 'concept', op: 'is-a', value: 'disease' }],
        }],
      },
    };

    expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'disease', csReg)).toBe(true);
    expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'infectious', csReg)).toBe(true);
    expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'bacterial', csReg)).toBe(true);
    expect(isCodeInValueSet(vs, 'http://example.org/fhir/CodeSystem/condition-category', 'finding', csReg)).toBe(false);
  });

  // ─── Cross-module: registries accessed from provider ──────────────────

  it('should expose registries for advanced use', () => {
    const csReg = provider.getCodeSystemRegistry();
    const vsReg = provider.getValueSetRegistry();

    expect(csReg.has('http://hl7.org/fhir/administrative-gender')).toBe(true);
    expect(vsReg.has('http://hl7.org/fhir/ValueSet/administrative-gender')).toBe(true);
    expect(csReg.size).toBeGreaterThanOrEqual(2);
    expect(vsReg.size).toBeGreaterThanOrEqual(4);
  });
});
