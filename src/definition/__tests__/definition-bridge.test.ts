/**
 * Tests for DefinitionBridge
 *
 * Testing policy: ≥15 tests covering SD, VS, CS, SP delegation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StructureDefinition } from '../../model/index.js';
import type { FhirContext } from '../../context/index.js';
import type { ValueSet, CodeSystem, SearchParameter } from 'fhir-definition';
import { DefinitionBridge } from '../definition-bridge.js';

// =============================================================================
// Mock FhirContext
// =============================================================================

function createMockContext(sdMap: Map<string, StructureDefinition>): FhirContext {
  return {
    getStructureDefinition(url: string) {
      return sdMap.get(url);
    },
    hasStructureDefinition(url: string) {
      return sdMap.has(url);
    },
    loadStructureDefinition: async (url: string) => {
      const sd = sdMap.get(url);
      if (!sd) throw new Error(`Not found: ${url}`);
      return sd;
    },
    resolveInheritanceChain: async () => [],
    registerStructureDefinition: () => {},
    preloadCoreDefinitions: async () => {},
    getStatistics: () => ({
      totalLoaded: sdMap.size,
      cacheHits: 0,
      cacheMisses: 0,
      loaderCalls: 0,
      chainsResolved: 0,
      registrations: 0,
    }),
    registerCanonicalProfile: () => {},
    getInnerType: () => undefined,
    hasInnerType: () => false,
    dispose: () => {},
  };
}

// =============================================================================
// Test fixtures
// =============================================================================

const patientSD: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/Patient',
  name: 'Patient',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'Patient',
} as StructureDefinition;

const observationSD: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://hl7.org/fhir/StructureDefinition/Observation',
  name: 'Observation',
  status: 'active',
  kind: 'resource',
  abstract: false,
  type: 'Observation',
} as StructureDefinition;

const genderVS: ValueSet = {
  resourceType: 'ValueSet',
  url: 'http://hl7.org/fhir/ValueSet/administrative-gender',
  name: 'AdministrativeGender',
};

const actCodeCS: CodeSystem = {
  resourceType: 'CodeSystem',
  url: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  name: 'ActCode',
};

const patientNameSP: SearchParameter = {
  resourceType: 'SearchParameter',
  url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
  name: 'name',
  code: 'name',
  base: ['Patient'],
  type: 'string',
  expression: 'Patient.name',
};

const patientBirthdateSP: SearchParameter = {
  resourceType: 'SearchParameter',
  url: 'http://hl7.org/fhir/SearchParameter/Patient-birthdate',
  name: 'birthdate',
  code: 'birthdate',
  base: ['Patient'],
  type: 'date',
  expression: 'Patient.birthDate',
};

const observationCodeSP: SearchParameter = {
  resourceType: 'SearchParameter',
  url: 'http://hl7.org/fhir/SearchParameter/Observation-code',
  name: 'code',
  code: 'code',
  base: ['Observation'],
  type: 'token',
  expression: 'Observation.code',
};

const resourceDateSP: SearchParameter = {
  resourceType: 'SearchParameter',
  url: 'http://hl7.org/fhir/SearchParameter/Resource-date',
  name: 'date',
  code: 'date',
  base: ['Patient', 'Observation'],
  type: 'date',
  expression: 'Resource.meta.lastUpdated',
};

// =============================================================================
// Tests
// =============================================================================

describe('DefinitionBridge', () => {
  let sdMap: Map<string, StructureDefinition>;
  let vsMap: Map<string, ValueSet>;
  let csMap: Map<string, CodeSystem>;

  beforeEach(() => {
    sdMap = new Map([
      [patientSD.url!, patientSD],
      [observationSD.url!, observationSD],
    ]);
    vsMap = new Map([[genderVS.url, genderVS]]);
    csMap = new Map([[actCodeCS.url, actCodeCS]]);
  });

  // --- SD delegation ---

  it('should delegate getStructureDefinition to FhirContext', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    const sd = bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(sd).toBeDefined();
    expect(sd!.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
  });

  it('should return undefined for unknown SD URL', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    expect(bridge.getStructureDefinition('http://unknown.org/SD')).toBeUndefined();
  });

  it('should return multiple different SDs', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    expect(bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient')).toBeDefined();
    expect(bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Observation')).toBeDefined();
  });

  // --- VS delegation ---

  it('should delegate getValueSet to valueSets map', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      valueSets: vsMap,
    });
    const vs = bridge.getValueSet('http://hl7.org/fhir/ValueSet/administrative-gender');
    expect(vs).toBeDefined();
    expect(vs!.url).toBe('http://hl7.org/fhir/ValueSet/administrative-gender');
  });

  it('should return undefined for unknown VS URL', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      valueSets: vsMap,
    });
    expect(bridge.getValueSet('http://unknown.org/VS')).toBeUndefined();
  });

  it('should return undefined for VS when no valueSets provided', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    expect(bridge.getValueSet('http://hl7.org/fhir/ValueSet/administrative-gender')).toBeUndefined();
  });

  // --- CS delegation ---

  it('should delegate getCodeSystem to codeSystems map', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      codeSystems: csMap,
    });
    const cs = bridge.getCodeSystem('http://terminology.hl7.org/CodeSystem/v3-ActCode');
    expect(cs).toBeDefined();
    expect(cs!.url).toBe('http://terminology.hl7.org/CodeSystem/v3-ActCode');
  });

  it('should return undefined for unknown CS URL', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      codeSystems: csMap,
    });
    expect(bridge.getCodeSystem('http://unknown.org/CS')).toBeUndefined();
  });

  it('should return undefined for CS when no codeSystems provided', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    expect(bridge.getCodeSystem('http://terminology.hl7.org/CodeSystem/v3-ActCode')).toBeUndefined();
  });

  // --- SP delegation ---

  it('should return search parameters for Patient', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      searchParameters: [patientNameSP, patientBirthdateSP, observationCodeSP, resourceDateSP],
    });
    const sps = bridge.getSearchParameters('Patient');
    expect(sps.length).toBe(3); // name, birthdate, date (multi-base)
    expect(sps.map((s) => s.code)).toContain('name');
    expect(sps.map((s) => s.code)).toContain('birthdate');
    expect(sps.map((s) => s.code)).toContain('date');
  });

  it('should return search parameters for Observation', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      searchParameters: [patientNameSP, patientBirthdateSP, observationCodeSP, resourceDateSP],
    });
    const sps = bridge.getSearchParameters('Observation');
    expect(sps.length).toBe(2); // code, date
    expect(sps.map((s) => s.code)).toContain('code');
    expect(sps.map((s) => s.code)).toContain('date');
  });

  it('should return empty array for unknown resource type', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      searchParameters: [patientNameSP],
    });
    expect(bridge.getSearchParameters('Encounter')).toEqual([]);
  });

  it('should return empty array when no searchParameters provided', () => {
    const bridge = new DefinitionBridge({ context: createMockContext(sdMap) });
    expect(bridge.getSearchParameters('Patient')).toEqual([]);
  });

  it('should handle SP without base gracefully', () => {
    const spNoBase: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.org/sp-no-base',
      name: 'no-base',
    };
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      searchParameters: [spNoBase],
    });
    expect(bridge.getSearchParameters('Patient')).toEqual([]);
  });

  // --- Combined ---

  it('should work with all registries together', () => {
    const bridge = new DefinitionBridge({
      context: createMockContext(sdMap),
      valueSets: vsMap,
      codeSystems: csMap,
      searchParameters: [patientNameSP],
    });
    expect(bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient')).toBeDefined();
    expect(bridge.getValueSet('http://hl7.org/fhir/ValueSet/administrative-gender')).toBeDefined();
    expect(bridge.getCodeSystem('http://terminology.hl7.org/CodeSystem/v3-ActCode')).toBeDefined();
    expect(bridge.getSearchParameters('Patient').length).toBe(1);
  });
});
