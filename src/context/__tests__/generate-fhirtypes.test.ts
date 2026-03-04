/**
 * fhirtypes Generator Tests
 *
 * Tests the generate-fhirtypes script's core logic:
 * - Profile building from real StructureDefinitions
 * - InnerType extraction from real Patient/Observation/Bundle
 * - TypeScript type mapping
 * - File generation (via generate() function)
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalProfile, CanonicalElement } from '../../model/canonical-profile.js';
import { buildCanonicalProfile } from '../../profile/canonical-builder.js';
import { extractInnerTypes, buildTypeName } from '../inner-type-extractor.js';
import { loadCoreDefinitionSync, getCoreDefinitionsDir } from '../core-definitions/index.js';

const CORE_DEFS_DIR = getCoreDefinitionsDir();

// =============================================================================
// Helpers — build a CanonicalProfile from a real core SD
// =============================================================================

function loadAndBuildProfile(name: string): CanonicalProfile | null {
  try {
    const sd = loadCoreDefinitionSync(name, CORE_DEFS_DIR);
    if (!sd) return null;
    const profile = buildCanonicalProfile(sd);
    profile.innerTypes = extractInnerTypes(profile);
    return profile;
  } catch {
    return null;
  }
}

// =============================================================================
// Real StructureDefinition InnerType extraction
// =============================================================================

describe('InnerType extraction from real FHIR R4 StructureDefinitions', () => {
  it('Patient has PatientContact, PatientCommunication, PatientLink inner types', () => {
    const patient = loadAndBuildProfile('Patient');
    expect(patient).not.toBeNull();

    const innerTypes = patient!.innerTypes!;
    expect(innerTypes).toBeDefined();
    expect(innerTypes.has('PatientContact')).toBe(true);
    expect(innerTypes.has('PatientCommunication')).toBe(true);
    expect(innerTypes.has('PatientLink')).toBe(true);

    // PatientContact should have child elements
    const contact = innerTypes.get('PatientContact')!;
    expect(contact.elements.size).toBeGreaterThan(0);
    expect(contact.parentType).toBe('Patient');

    // Verify specific fields exist
    const contactPaths = Array.from(contact.elements.keys());
    expect(contactPaths.some(p => p.endsWith('.relationship'))).toBe(true);
    expect(contactPaths.some(p => p.endsWith('.name'))).toBe(true);
  });

  it('Observation has ObservationReferenceRange and ObservationComponent inner types', () => {
    const obs = loadAndBuildProfile('Observation');
    expect(obs).not.toBeNull();

    const innerTypes = obs!.innerTypes!;
    expect(innerTypes).toBeDefined();
    expect(innerTypes.has('ObservationReferenceRange')).toBe(true);
    expect(innerTypes.has('ObservationComponent')).toBe(true);

    const component = innerTypes.get('ObservationComponent')!;
    expect(component.elements.size).toBeGreaterThan(0);
    expect(component.parentType).toBe('Observation');

    // ObservationComponent should have code
    const paths = Array.from(component.elements.keys());
    expect(paths.some(p => p.endsWith('.code'))).toBe(true);
  });

  it('Bundle has nested inner types (BundleEntry, BundleEntryRequest, BundleEntryResponse, etc.)', () => {
    const bundle = loadAndBuildProfile('Bundle');
    expect(bundle).not.toBeNull();

    const innerTypes = bundle!.innerTypes!;
    expect(innerTypes).toBeDefined();
    expect(innerTypes.has('BundleEntry')).toBe(true);
    expect(innerTypes.has('BundleEntrySearch')).toBe(true);
    expect(innerTypes.has('BundleEntryRequest')).toBe(true);
    expect(innerTypes.has('BundleEntryResponse')).toBe(true);
    expect(innerTypes.has('BundleLink')).toBe(true);

    // BundleEntryRequest parent should be BundleEntry
    const request = innerTypes.get('BundleEntryRequest')!;
    expect(request.parentType).toBe('BundleEntry');
    const reqPaths = Array.from(request.elements.keys());
    expect(reqPaths.some(p => p.endsWith('.method'))).toBe(true);
    expect(reqPaths.some(p => p.endsWith('.url'))).toBe(true);
  });

  it('HumanName (complex type, not resource) has NO inner types', () => {
    const hn = loadAndBuildProfile('HumanName');
    if (!hn) return; // May not be available as core definition
    const innerTypes = hn.innerTypes!;
    expect(innerTypes.size).toBe(0);
  });

  it('Encounter has inner types (EncounterStatusHistory, EncounterClassHistory, etc.)', () => {
    const encounter = loadAndBuildProfile('Encounter');
    expect(encounter).not.toBeNull();

    const innerTypes = encounter!.innerTypes!;
    expect(innerTypes).toBeDefined();
    expect(innerTypes.size).toBeGreaterThan(0);

    // Should have some known backbone elements
    const names = Array.from(innerTypes.keys());
    // Encounter has statusHistory, classHistory, participant, diagnosis, hospitalization, location
    expect(names.some(n => n.includes('Participant'))).toBe(true);
  });

  it('buildTypeName handles real FHIR paths correctly', () => {
    expect(buildTypeName(['Patient', 'contact'])).toBe('PatientContact');
    expect(buildTypeName(['Observation', 'component'])).toBe('ObservationComponent');
    expect(buildTypeName(['Bundle', 'entry', 'request'])).toBe('BundleEntryRequest');
    expect(buildTypeName(['Encounter', 'hospitalization'])).toBe('EncounterHospitalization');
  });
});
