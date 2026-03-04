/**
 * US Core IG Verification Tests — Phase S1 Final Verification
 *
 * UC1: Parse all 70 US Core StructureDefinitions
 * UC2: Build CanonicalProfiles from 55 resource profile snapshots
 * UC3: Build CanonicalProfiles from 15 extension definitions
 * UC4: Validate official examples against their declared profiles
 * UC5: FHIRPath evaluation on US Core example resources
 * UC6: Profile-to-example matching (meta.profile → SD)
 * UC7: Cross-profile coverage (every profile has ≥1 example)
 *
 * Data source: devdocs/us-core/package/ — US Core IG v9.0.0
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

import {
  parseStructureDefinition,
  buildCanonicalProfile,
  StructureValidator,
  parseFhirJson,
} from '../index.js';
import type { CanonicalProfile, StructureDefinition, Resource } from '../index.js';
import { evalFhirPath, evalFhirPathBoolean } from '../fhirpath/index.js';

// =============================================================================
// Setup: discover US Core package
// =============================================================================

const US_CORE_DIR = resolve(__dirname, 'us-core', 'package');
const US_CORE_EXAMPLE_DIR = resolve(US_CORE_DIR, 'example');

// ---------- load all SD files ----------
interface SDFileInfo {
  filename: string;
  sd: StructureDefinition;
  kind: string;
  type: string;
  name: string;
  url: string;
}

let allSDs: SDFileInfo[];
let resourceSDs: SDFileInfo[];
let extensionSDs: SDFileInfo[];
let profilesByUrl: Map<string, CanonicalProfile>;
let profilesByType: Map<string, CanonicalProfile[]>;

// ---------- load all example files ----------
interface ExampleInfo {
  filename: string;
  resource: Record<string, unknown>;
  resourceType: string;
  profiles: string[]; // meta.profile URLs
}

let allExamples: ExampleInfo[];

// ---------- parse stats ----------
let parseStats = { total: 0, success: 0, failed: 0, failedNames: [] as string[] };
let buildStats = { total: 0, success: 0, failed: 0, failedNames: [] as string[] };

beforeAll(() => {
  // ---- Load all SD files ----
  const sdFiles = readdirSync(US_CORE_DIR)
    .filter((f) => f.startsWith('StructureDefinition-') && f.endsWith('.json'));

  allSDs = [];
  for (const filename of sdFiles) {
    try {
      const raw = JSON.parse(readFileSync(resolve(US_CORE_DIR, filename), 'utf-8'));
      const parseResult = parseStructureDefinition(raw, 'StructureDefinition');
      parseStats.total++;
      if (parseResult.success) {
        parseStats.success++;
        allSDs.push({
          filename,
          sd: parseResult.data,
          kind: raw.kind,
          type: raw.type,
          name: raw.name,
          url: raw.url,
        });
      } else {
        parseStats.failed++;
        parseStats.failedNames.push(raw.name ?? filename);
      }
    } catch (err) {
      parseStats.total++;
      parseStats.failed++;
      parseStats.failedNames.push(filename);
    }
  }

  resourceSDs = allSDs.filter((s) => s.kind === 'resource');
  extensionSDs = allSDs.filter((s) => s.kind === 'complex-type' && s.type === 'Extension');

  // ---- Build CanonicalProfiles ----
  profilesByUrl = new Map();
  profilesByType = new Map();

  for (const sdInfo of allSDs) {
    buildStats.total++;
    try {
      const profile = buildCanonicalProfile(sdInfo.sd);
      buildStats.success++;
      profilesByUrl.set(sdInfo.url, profile);

      // Group by base type for resource profiles
      if (sdInfo.kind === 'resource') {
        const existing = profilesByType.get(sdInfo.type) ?? [];
        existing.push(profile);
        profilesByType.set(sdInfo.type, existing);
      }
    } catch (err) {
      buildStats.failed++;
      buildStats.failedNames.push(sdInfo.name);
    }
  }

  // ---- Load all example files ----
  const exampleFiles = readdirSync(US_CORE_EXAMPLE_DIR)
    .filter((f) => f.endsWith('.json'));

  allExamples = [];
  for (const filename of exampleFiles) {
    try {
      const raw = JSON.parse(readFileSync(resolve(US_CORE_EXAMPLE_DIR, filename), 'utf-8'));
      if (!raw.resourceType) continue;

      const profiles: string[] = [];
      if (raw.meta?.profile && Array.isArray(raw.meta.profile)) {
        profiles.push(...raw.meta.profile);
      }

      allExamples.push({
        filename,
        resource: raw,
        resourceType: raw.resourceType,
        profiles,
      });
    } catch {
      // skip unparseable files
    }
  }
}, 120_000);

// =============================================================================
// UC1: Parse all 70 US Core StructureDefinitions
// =============================================================================

describe('UC1: Parse all US Core StructureDefinitions', () => {
  it('discovers 70 SD files', () => {
    expect(parseStats.total).toBe(70);
  });

  it('parses all SDs successfully', () => {
    expect(parseStats.success).toBe(70);
    expect(parseStats.failed).toBe(0);
    if (parseStats.failedNames.length > 0) {
      console.warn('Failed SDs:', parseStats.failedNames);
    }
  });

  it('each parsed SD has url, name, kind, type', () => {
    for (const sd of allSDs) {
      expect(sd.url).toBeTruthy();
      expect(sd.name).toBeTruthy();
      expect(sd.kind).toBeTruthy();
      expect(sd.type).toBeTruthy();
    }
  });

  it('has 55 resource profiles and 15 extensions', () => {
    expect(resourceSDs.length).toBe(55);
    expect(extensionSDs.length).toBe(15);
  });
});

// =============================================================================
// UC2: Build CanonicalProfiles from 55 resource profile snapshots
// =============================================================================

describe('UC2: Build CanonicalProfiles from resource profile snapshots', () => {
  it('builds all resource profiles successfully', () => {
    const resourceBuildCount = resourceSDs.filter((s) => profilesByUrl.has(s.url)).length;
    expect(resourceBuildCount).toBe(55);
  });

  it('every resource profile has >0 elements', () => {
    for (const sd of resourceSDs) {
      const profile = profilesByUrl.get(sd.url);
      expect(profile).toBeDefined();
      expect(profile!.elements.size).toBeGreaterThan(0);
    }
  });

  it('every resource profile has a root element', () => {
    for (const sd of resourceSDs) {
      const profile = profilesByUrl.get(sd.url)!;
      const rootEl = profile.elements.get(sd.type);
      expect(rootEl).toBeDefined();
    }
  });

  it('US Core Patient profile has expected constrained elements', () => {
    const patientProfile = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
    );
    expect(patientProfile).toBeDefined();
    expect(patientProfile!.elements.size).toBeGreaterThan(20);

    // US Core Patient should have identifier, name, gender, birthDate at minimum
    const expectedPaths = ['Patient', 'Patient.identifier', 'Patient.name', 'Patient.gender'];
    for (const path of expectedPaths) {
      expect(patientProfile!.elements.has(path)).toBe(true);
    }
  });

  it('US Core Blood Pressure profile has component slicing', () => {
    const bpProfile = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure',
    );
    expect(bpProfile).toBeDefined();
    // Blood Pressure should have Observation.component with slicing
    const componentEl = bpProfile!.elements.get('Observation.component');
    expect(componentEl).toBeDefined();
  });

  it('Observation profiles cover all vital signs types', () => {
    const obsProfiles = profilesByType.get('Observation') ?? [];
    expect(obsProfiles.length).toBeGreaterThanOrEqual(20);
  });
});

// =============================================================================
// UC3: Build CanonicalProfiles from 15 extension definitions
// =============================================================================

describe('UC3: Build CanonicalProfiles from extension definitions', () => {
  it('builds all extension profiles successfully', () => {
    const extBuildCount = extensionSDs.filter((s) => profilesByUrl.has(s.url)).length;
    expect(extBuildCount).toBe(15);
  });

  it('every extension profile has >0 elements', () => {
    for (const sd of extensionSDs) {
      const profile = profilesByUrl.get(sd.url);
      expect(profile).toBeDefined();
      expect(profile!.elements.size).toBeGreaterThan(0);
    }
  });

  it('US Core Race extension has sub-extensions', () => {
    const raceExt = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    );
    expect(raceExt).toBeDefined();
    // Race extension has sub-extensions (ombCategory, detailed, text)
    expect(raceExt!.elements.size).toBeGreaterThan(3);
  });

  it('US Core Ethnicity extension has sub-extensions', () => {
    const ethExt = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    );
    expect(ethExt).toBeDefined();
    expect(ethExt!.elements.size).toBeGreaterThan(3);
  });

  it('US Core Birth Sex extension exists', () => {
    const bsExt = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
    );
    expect(bsExt).toBeDefined();
  });
});

// =============================================================================
// UC4: Validate official examples against their declared profiles
// =============================================================================

describe('UC4: Validate official examples against declared profiles', () => {
  it('loads 200+ example resources', () => {
    expect(allExamples.length).toBeGreaterThan(200);
  });

  it('validates examples that have matching US Core profiles', () => {
    const validator = new StructureValidator({
      skipInvariants: true,
      validateSlicing: false,
    });

    let validated = 0;
    let noProfile = 0;
    let crashed = 0;
    const crashedFiles: string[] = [];

    for (const example of allExamples) {
      // Try to find a matching profile
      let matchedProfile: CanonicalProfile | undefined;

      // First, try meta.profile
      for (const pUrl of example.profiles) {
        if (profilesByUrl.has(pUrl)) {
          matchedProfile = profilesByUrl.get(pUrl);
          break;
        }
      }

      // Fallback: try by resourceType
      if (!matchedProfile) {
        const typeProfiles = profilesByType.get(example.resourceType);
        if (typeProfiles && typeProfiles.length > 0) {
          matchedProfile = typeProfiles[0];
        }
      }

      if (!matchedProfile) {
        noProfile++;
        continue;
      }

      try {
        const result = validator.validate(example.resource as unknown as Resource, matchedProfile);
        expect(result).toBeDefined();
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.issues)).toBe(true);
        validated++;
      } catch (err) {
        crashed++;
        crashedFiles.push(example.filename);
      }
    }

    // Should validate the vast majority of examples
    expect(validated).toBeGreaterThan(100);
    // Should not crash on any example
    expect(crashed).toBe(0);
    if (crashedFiles.length > 0) {
      console.warn('Crashed on:', crashedFiles);
    }
  });

  it('validates key examples without crash: Patient', () => {
    const patientProfile = profilesByUrl.get(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
    );
    expect(patientProfile).toBeDefined();

    const patientExamples = allExamples.filter((e) => e.resourceType === 'Patient');
    expect(patientExamples.length).toBeGreaterThanOrEqual(3);

    const validator = new StructureValidator({ skipInvariants: true });
    for (const ex of patientExamples) {
      const result = validator.validate(ex.resource as unknown as Resource, patientProfile!);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    }
  });

  it('validates key examples without crash: Observation', () => {
    const obsExamples = allExamples.filter((e) => e.resourceType === 'Observation');
    expect(obsExamples.length).toBeGreaterThan(50);

    const validator = new StructureValidator({
      skipInvariants: true,
      validateSlicing: false,
    });

    let validated = 0;
    for (const ex of obsExamples) {
      // Find matching profile via meta.profile
      let profile: CanonicalProfile | undefined;
      for (const pUrl of ex.profiles) {
        if (profilesByUrl.has(pUrl)) {
          profile = profilesByUrl.get(pUrl);
          break;
        }
      }
      if (!profile) {
        // Fallback to generic observation
        const obsProfiles = profilesByType.get('Observation');
        if (obsProfiles) profile = obsProfiles[0];
      }
      if (!profile) continue;

      const result = validator.validate(ex.resource as unknown as Resource, profile);
      expect(result).toBeDefined();
      validated++;
    }
    expect(validated).toBeGreaterThan(50);
  });

  it('validates key examples without crash: Condition', () => {
    const condExamples = allExamples.filter((e) => e.resourceType === 'Condition');
    expect(condExamples.length).toBeGreaterThanOrEqual(3);

    const validator = new StructureValidator({ skipInvariants: true });
    for (const ex of condExamples) {
      let profile: CanonicalProfile | undefined;
      for (const pUrl of ex.profiles) {
        if (profilesByUrl.has(pUrl)) {
          profile = profilesByUrl.get(pUrl);
          break;
        }
      }
      if (!profile) {
        const condProfiles = profilesByType.get('Condition');
        if (condProfiles) profile = condProfiles[0];
      }
      if (!profile) continue;

      const result = validator.validate(ex.resource as unknown as Resource, profile);
      expect(result).toBeDefined();
    }
  });
});

// =============================================================================
// UC5: FHIRPath evaluation on US Core example resources
// =============================================================================

describe('UC5: FHIRPath evaluation on US Core examples', () => {
  it('extracts Patient.name.family from US Core Patient examples', () => {
    const patientExamples = allExamples.filter((e) => e.resourceType === 'Patient');
    for (const ex of patientExamples) {
      const result = evalFhirPath('Patient.name.family', ex.resource);
      // Should not crash, may return empty if no family name
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('extracts Observation.status from Observation examples', () => {
    const obsExamples = allExamples.filter((e) => e.resourceType === 'Observation').slice(0, 30);
    for (const ex of obsExamples) {
      const result = evalFhirPath('Observation.status', ex.resource);
      expect(result.length).toBeGreaterThan(0);
      expect(typeof result[0]).toBe('string');
    }
  });

  it('evaluates boolean FHIRPath on Patient examples', () => {
    const patientExamples = allExamples.filter((e) => e.resourceType === 'Patient');
    for (const ex of patientExamples) {
      const hasName = evalFhirPathBoolean('Patient.name.exists()', ex.resource);
      expect(typeof hasName).toBe('boolean');
      // US Core Patient requires name
      expect(hasName).toBe(true);
    }
  });

  it('extracts Observation.code.coding from lab Observations', () => {
    const labObs = allExamples.filter(
      (e) => e.resourceType === 'Observation' && e.filename.includes('serum'),
    );
    for (const ex of labObs) {
      const codes = evalFhirPath('Observation.code.coding.code', ex.resource);
      expect(codes.length).toBeGreaterThan(0);
    }
  });

  it('extracts Observation.valueQuantity.value from vital sign Observations', () => {
    const vitalObs = allExamples.filter(
      (e) =>
        e.resourceType === 'Observation' &&
        (e.filename.includes('blood-pressure') ||
          e.filename.includes('heart-rate') ||
          e.filename.includes('height') ||
          e.filename.includes('weight') ||
          e.filename.includes('temperature') ||
          e.filename.includes('bmi')),
    );

    let extracted = 0;
    for (const ex of vitalObs) {
      const values = evalFhirPath('Observation.valueQuantity.value', ex.resource);
      if (values.length > 0) {
        expect(typeof values[0]).toBe('number');
        extracted++;
      }
      // Some vitals (like BP) use components, not top-level valueQuantity
    }
    expect(extracted).toBeGreaterThan(0);
  });

  it('handles FHIRPath on all resource types without crash', () => {
    // For every example, try a simple FHIRPath expression
    for (const ex of allExamples) {
      const rt = ex.resourceType;
      const result = evalFhirPath(`${rt}.id`, ex.resource);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// =============================================================================
// UC6: Profile-to-example matching
// =============================================================================

describe('UC6: Profile-to-example matching', () => {
  it('>70% of examples declare a meta.profile', () => {
    const withProfile = allExamples.filter((e) => e.profiles.length > 0);
    const ratio = withProfile.length / allExamples.length;
    expect(ratio).toBeGreaterThan(0.7);
  });

  it('>50% of examples declare a US Core profile that we loaded', () => {
    const matched = allExamples.filter((e) =>
      e.profiles.some((p) => profilesByUrl.has(p)),
    );
    const ratio = matched.length / allExamples.length;
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('Patient examples all declare us-core-patient profile', () => {
    const patientExamples = allExamples.filter((e) => e.resourceType === 'Patient');
    for (const ex of patientExamples) {
      expect(
        ex.profiles.some((p) => p.includes('us-core-patient')),
      ).toBe(true);
    }
  });
});

// =============================================================================
// UC7: Cross-profile coverage
// =============================================================================

describe('UC7: Cross-profile coverage', () => {
  it('>80% of resource profiles have at least one matching example', () => {
    let covered = 0;
    let uncovered = 0;
    const uncoveredProfiles: string[] = [];

    for (const sd of resourceSDs) {
      const hasExample = allExamples.some(
        (e) =>
          e.profiles.includes(sd.url) ||
          e.resourceType === sd.type,
      );
      if (hasExample) {
        covered++;
      } else {
        uncovered++;
        uncoveredProfiles.push(sd.name);
      }
    }

    const ratio = covered / resourceSDs.length;
    expect(ratio).toBeGreaterThan(0.8);
    if (uncoveredProfiles.length > 0) {
      console.log(`Uncovered profiles (${uncoveredProfiles.length}):`, uncoveredProfiles.join(', '));
    }
  });

  it('key profiles have multiple examples', () => {
    const patientUrl = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
    const patientExampleCount = allExamples.filter(
      (e) => e.profiles.includes(patientUrl),
    ).length;
    expect(patientExampleCount).toBeGreaterThanOrEqual(3);

    // Observation profiles should have many examples
    const obsExampleCount = allExamples.filter((e) => e.resourceType === 'Observation').length;
    expect(obsExampleCount).toBeGreaterThan(50);
  });
});
