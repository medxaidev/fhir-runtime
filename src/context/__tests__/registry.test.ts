/**
 * Unit tests for StructureDefinitionRegistry
 *
 * Covers:
 * - Registration and retrieval
 * - Version support (url|version format)
 * - Deletion (versioned and unversioned)
 * - Statistics tracking
 * - Edge cases and error handling
 * - URL utility functions
 *
 * @module fhir-context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StructureDefinition } from '../../model/index.js';
import {
  StructureDefinitionRegistry,
  parseVersionedUrl,
  buildVersionedKey,
} from '../registry.js';
import { InvalidStructureDefinitionError } from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal valid StructureDefinition for testing. */
function makeSD(
  url: string,
  name: string,
  version?: string,
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: url as any,
    name: name as any,
    status: 'active' as any,
    kind: 'resource' as any,
    abstract: false as any,
    type: name as any,
    ...(version ? { version: version as any } : {}),
  } as StructureDefinition;
}

const PATIENT_URL = 'http://hl7.org/fhir/StructureDefinition/Patient';
const OBSERVATION_URL = 'http://hl7.org/fhir/StructureDefinition/Observation';
const DOMAIN_RESOURCE_URL =
  'http://hl7.org/fhir/StructureDefinition/DomainResource';
const RESOURCE_URL = 'http://hl7.org/fhir/StructureDefinition/Resource';
const CUSTOM_PROFILE_URL = 'http://example.org/fhir/StructureDefinition/ChinesePatient';

// =============================================================================
// Section 1: URL Utility Functions
// =============================================================================

describe('parseVersionedUrl', () => {
  it('parses a bare URL without version', () => {
    const result = parseVersionedUrl(PATIENT_URL);
    expect(result.url).toBe(PATIENT_URL);
    expect(result.version).toBeUndefined();
  });

  it('parses a URL with version suffix', () => {
    const result = parseVersionedUrl(`${PATIENT_URL}|4.0.1`);
    expect(result.url).toBe(PATIENT_URL);
    expect(result.version).toBe('4.0.1');
  });

  it('handles version with multiple dots', () => {
    const result = parseVersionedUrl(`${CUSTOM_PROFILE_URL}|1.2.3-beta.1`);
    expect(result.url).toBe(CUSTOM_PROFILE_URL);
    expect(result.version).toBe('1.2.3-beta.1');
  });

  it('handles empty version after pipe', () => {
    const result = parseVersionedUrl(`${PATIENT_URL}|`);
    expect(result.url).toBe(PATIENT_URL);
    expect(result.version).toBe('');
  });

  it('uses first pipe only (URL with multiple pipes)', () => {
    const result = parseVersionedUrl('http://example.org/Profile|1.0|extra');
    expect(result.url).toBe('http://example.org/Profile');
    expect(result.version).toBe('1.0|extra');
  });
});

describe('buildVersionedKey', () => {
  it('returns bare URL when version is undefined', () => {
    expect(buildVersionedKey(PATIENT_URL, undefined)).toBe(PATIENT_URL);
  });

  it('returns url|version when version is provided', () => {
    expect(buildVersionedKey(PATIENT_URL, '4.0.1')).toBe(
      `${PATIENT_URL}|4.0.1`,
    );
  });

  it('returns bare URL when version is empty string', () => {
    // empty string is falsy → treated as no version
    expect(buildVersionedKey(PATIENT_URL, '')).toBe(PATIENT_URL);
  });
});

// =============================================================================
// Section 2: Registration & Retrieval
// =============================================================================

describe('StructureDefinitionRegistry', () => {
  let registry: StructureDefinitionRegistry;

  beforeEach(() => {
    registry = new StructureDefinitionRegistry();
  });

  describe('register and get', () => {
    it('registers and retrieves a StructureDefinition by URL', () => {
      const sd = makeSD(PATIENT_URL, 'Patient');
      registry.register(sd);

      const result = registry.get(PATIENT_URL);
      expect(result).toBe(sd);
    });

    it('registers multiple definitions', () => {
      const patient = makeSD(PATIENT_URL, 'Patient');
      const observation = makeSD(OBSERVATION_URL, 'Observation');
      registry.register(patient);
      registry.register(observation);

      expect(registry.get(PATIENT_URL)).toBe(patient);
      expect(registry.get(OBSERVATION_URL)).toBe(observation);
      expect(registry.size).toBe(2);
    });

    it('returns undefined for unregistered URL', () => {
      expect(registry.get(PATIENT_URL)).toBeUndefined();
    });

    it('replaces existing definition with same URL', () => {
      const sd1 = makeSD(PATIENT_URL, 'Patient');
      const sd2 = makeSD(PATIENT_URL, 'PatientUpdated');
      registry.register(sd1);
      registry.register(sd2);

      expect(registry.get(PATIENT_URL)).toBe(sd2);
      expect(registry.size).toBe(1);
    });

    it('throws InvalidStructureDefinitionError when url is missing', () => {
      const sd = { resourceType: 'StructureDefinition' } as StructureDefinition;
      expect(() => registry.register(sd)).toThrow(
        InvalidStructureDefinitionError,
      );
    });

    it('error message includes name when url is missing', () => {
      const sd = {
        resourceType: 'StructureDefinition',
        name: 'BadProfile' as any,
      } as StructureDefinition;
      expect(() => registry.register(sd)).toThrow(/BadProfile/);
    });
  });

  // ===========================================================================
  // Section 3: Version Support
  // ===========================================================================

  describe('version support', () => {
    it('registers versioned definition and retrieves by url|version', () => {
      const sd = makeSD(PATIENT_URL, 'Patient', '4.0.1');
      registry.register(sd);

      const result = registry.get(`${PATIENT_URL}|4.0.1`);
      expect(result).toBe(sd);
    });

    it('retrieves versioned definition by bare URL (latest)', () => {
      const sd = makeSD(PATIENT_URL, 'Patient', '4.0.1');
      registry.register(sd);

      // Bare URL should resolve to latest
      const result = registry.get(PATIENT_URL);
      expect(result).toBe(sd);
    });

    it('latest version is the most recently registered', () => {
      const v1 = makeSD(PATIENT_URL, 'Patient', '3.0.0');
      const v2 = makeSD(PATIENT_URL, 'Patient', '4.0.1');
      registry.register(v1);
      registry.register(v2);

      // Bare URL → latest (v2)
      expect(registry.get(PATIENT_URL)).toBe(v2);
      // Exact version → exact match
      expect(registry.get(`${PATIENT_URL}|3.0.0`)).toBe(v1);
      expect(registry.get(`${PATIENT_URL}|4.0.1`)).toBe(v2);
      // Two entries in primary map
      expect(registry.size).toBe(2);
    });

    it('returns undefined for non-existent version', () => {
      const sd = makeSD(PATIENT_URL, 'Patient', '4.0.1');
      registry.register(sd);

      expect(registry.get(`${PATIENT_URL}|9.9.9`)).toBeUndefined();
    });

    it('unversioned registration uses bare URL as key', () => {
      const sd = makeSD(PATIENT_URL, 'Patient');
      registry.register(sd);

      expect(registry.get(PATIENT_URL)).toBe(sd);
      // url| with empty version → parseVersionedUrl yields version='',
      // buildVersionedKey treats '' as falsy → bare URL lookup succeeds
      expect(registry.get(`${PATIENT_URL}|`)).toBe(sd);
    });

    it('versioned and unversioned coexist independently', () => {
      const unversioned = makeSD(CUSTOM_PROFILE_URL, 'ChinesePatient');
      const versioned = makeSD(CUSTOM_PROFILE_URL, 'ChinesePatient', '1.0.0');
      registry.register(unversioned);
      registry.register(versioned);

      // Bare URL → latest (versioned, registered last)
      expect(registry.get(CUSTOM_PROFILE_URL)).toBe(versioned);
      // Exact version
      expect(registry.get(`${CUSTOM_PROFILE_URL}|1.0.0`)).toBe(versioned);
      // Unversioned entry still in primary map
      expect(registry.size).toBe(2);
    });
  });

  // ===========================================================================
  // Section 4: has()
  // ===========================================================================

  describe('has', () => {
    it('returns false for empty registry', () => {
      expect(registry.has(PATIENT_URL)).toBe(false);
    });

    it('returns true after registration', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      expect(registry.has(PATIENT_URL)).toBe(true);
    });

    it('returns true for versioned lookup', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      expect(registry.has(`${PATIENT_URL}|4.0.1`)).toBe(true);
    });

    it('returns false for wrong version', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      expect(registry.has(`${PATIENT_URL}|3.0.0`)).toBe(false);
    });
  });

  // ===========================================================================
  // Section 5: delete()
  // ===========================================================================

  describe('delete', () => {
    it('deletes by bare URL', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      expect(registry.delete(PATIENT_URL)).toBe(true);
      expect(registry.has(PATIENT_URL)).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('returns false when deleting non-existent URL', () => {
      expect(registry.delete(PATIENT_URL)).toBe(false);
    });

    it('deletes by versioned URL', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      expect(registry.delete(`${PATIENT_URL}|4.0.1`)).toBe(true);
      expect(registry.has(`${PATIENT_URL}|4.0.1`)).toBe(false);
    });

    it('versioned delete removes latest index if it pointed to deleted key', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      registry.delete(`${PATIENT_URL}|4.0.1`);
      // Bare URL should no longer resolve
      expect(registry.has(PATIENT_URL)).toBe(false);
    });

    it('versioned delete does not affect other versions', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '3.0.0'));
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      registry.delete(`${PATIENT_URL}|3.0.0`);

      expect(registry.has(`${PATIENT_URL}|3.0.0`)).toBe(false);
      expect(registry.has(`${PATIENT_URL}|4.0.1`)).toBe(true);
      // Latest still points to 4.0.1
      expect(registry.get(PATIENT_URL)).toBeDefined();
    });
  });

  // ===========================================================================
  // Section 6: clear()
  // ===========================================================================

  describe('clear', () => {
    it('removes all entries', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      registry.register(makeSD(OBSERVATION_URL, 'Observation'));
      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has(PATIENT_URL)).toBe(false);
      expect(registry.has(OBSERVATION_URL)).toBe(false);
    });

    it('resets statistics', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      registry.get(PATIENT_URL);
      registry.get('http://nonexistent');
      registry.clear();

      expect(registry.queryCount).toBe(0);
      expect(registry.hitCount).toBe(0);
      expect(registry.missCount).toBe(0);
    });
  });

  // ===========================================================================
  // Section 7: getAllKeys() and getAllUrls()
  // ===========================================================================

  describe('getAllKeys and getAllUrls', () => {
    it('getAllKeys returns all primary map keys', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      registry.register(makeSD(OBSERVATION_URL, 'Observation'));

      const keys = registry.getAllKeys();
      expect(keys).toContain(`${PATIENT_URL}|4.0.1`);
      expect(keys).toContain(OBSERVATION_URL);
      expect(keys).toHaveLength(2);
    });

    it('getAllUrls returns bare URLs only', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      registry.register(makeSD(OBSERVATION_URL, 'Observation'));

      const urls = registry.getAllUrls();
      expect(urls).toContain(PATIENT_URL);
      expect(urls).toContain(OBSERVATION_URL);
      expect(urls).toHaveLength(2);
    });

    it('getAllKeys returns empty array for empty registry', () => {
      expect(registry.getAllKeys()).toEqual([]);
    });

    it('getAllUrls returns empty array for empty registry', () => {
      expect(registry.getAllUrls()).toEqual([]);
    });
  });

  // ===========================================================================
  // Section 8: Statistics
  // ===========================================================================

  describe('statistics', () => {
    it('starts with zero counters', () => {
      expect(registry.queryCount).toBe(0);
      expect(registry.hitCount).toBe(0);
      expect(registry.missCount).toBe(0);
      expect(registry.hitRate).toBe(0);
    });

    it('tracks cache hits', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      registry.get(PATIENT_URL);

      expect(registry.queryCount).toBe(1);
      expect(registry.hitCount).toBe(1);
      expect(registry.missCount).toBe(0);
      expect(registry.hitRate).toBe(1);
    });

    it('tracks cache misses', () => {
      registry.get(PATIENT_URL);

      expect(registry.queryCount).toBe(1);
      expect(registry.hitCount).toBe(0);
      expect(registry.missCount).toBe(1);
      expect(registry.hitRate).toBe(0);
    });

    it('computes hit rate correctly', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      registry.get(PATIENT_URL); // hit
      registry.get(PATIENT_URL); // hit
      registry.get(OBSERVATION_URL); // miss

      expect(registry.queryCount).toBe(3);
      expect(registry.hitCount).toBe(2);
      expect(registry.missCount).toBe(1);
      expect(registry.hitRate).toBeCloseTo(2 / 3);
    });

    it('has() does not affect statistics', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient'));
      registry.has(PATIENT_URL);
      registry.has(OBSERVATION_URL);

      expect(registry.queryCount).toBe(0);
    });
  });

  // ===========================================================================
  // Section 9: Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles very long URLs', () => {
      const longUrl = `http://example.org/${'a'.repeat(500)}`;
      const sd = makeSD(longUrl, 'LongUrl');
      registry.register(sd);
      expect(registry.get(longUrl)).toBe(sd);
    });

    it('handles URL with special characters', () => {
      const specialUrl =
        'http://example.org/fhir/StructureDefinition/My-Profile_v2';
      const sd = makeSD(specialUrl, 'MyProfile');
      registry.register(sd);
      expect(registry.get(specialUrl)).toBe(sd);
    });

    it('handles registering many definitions', () => {
      for (let i = 0; i < 100; i++) {
        registry.register(
          makeSD(`http://example.org/SD/${i}`, `SD${i}`),
        );
      }
      expect(registry.size).toBe(100);
      expect(registry.get('http://example.org/SD/50')).toBeDefined();
      expect(registry.get('http://example.org/SD/99')).toBeDefined();
    });

    it('size reflects actual entry count (versioned)', () => {
      registry.register(makeSD(PATIENT_URL, 'Patient', '3.0.0'));
      registry.register(makeSD(PATIENT_URL, 'Patient', '4.0.1'));
      // Two distinct versioned entries
      expect(registry.size).toBe(2);
      // But only one bare URL
      expect(registry.getAllUrls()).toHaveLength(1);
    });

    it('preserves StructureDefinition object identity', () => {
      const sd = makeSD(PATIENT_URL, 'Patient');
      registry.register(sd);
      // Should be the exact same object, not a copy
      expect(registry.get(PATIENT_URL)).toBe(sd);
    });
  });
});
