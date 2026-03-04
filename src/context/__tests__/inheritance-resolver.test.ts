/**
 * Unit tests for InheritanceChainResolver
 *
 * Covers:
 * - Simple inheritance chains (1-level, 2-level, 3+ levels)
 * - Root resolution (no baseDefinition)
 * - Circular dependency detection (direct, indirect, self-referencing)
 * - Chain caching and invalidation
 * - Error propagation (ResourceNotFoundError)
 * - Statistics tracking
 *
 * @module fhir-context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StructureDefinition } from '../../model/index.js';
import {
  InheritanceChainResolver,
  type DefinitionProvider,
} from '../inheritance-resolver.js';
import {
  CircularDependencyError,
  ResourceNotFoundError,
} from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const RESOURCE_URL = 'http://hl7.org/fhir/StructureDefinition/Resource';
const DOMAIN_RESOURCE_URL =
  'http://hl7.org/fhir/StructureDefinition/DomainResource';
const PATIENT_URL = 'http://hl7.org/fhir/StructureDefinition/Patient';
const OBSERVATION_URL = 'http://hl7.org/fhir/StructureDefinition/Observation';
const CHINESE_PATIENT_URL =
  'http://example.org/fhir/StructureDefinition/ChinesePatient';

/** Create a minimal StructureDefinition with optional baseDefinition. */
function makeSD(
  url: string,
  name: string,
  baseDefinition?: string,
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: url as any,
    name: name as any,
    status: 'active' as any,
    kind: 'resource' as any,
    abstract: false as any,
    type: name as any,
    ...(baseDefinition ? { baseDefinition: baseDefinition as any } : {}),
  } as StructureDefinition;
}

/**
 * Create a DefinitionProvider backed by a Map.
 * Throws ResourceNotFoundError for unknown URLs.
 */
function createProvider(
  definitions: Map<string, StructureDefinition>,
): DefinitionProvider & { callCount: number } {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async loadStructureDefinition(url: string): Promise<StructureDefinition> {
      callCount++;
      const sd = definitions.get(url);
      if (!sd) {
        throw new ResourceNotFoundError(url, ['test']);
      }
      return sd;
    },
  };
}

/** Standard FHIR R4 base chain: Resource (root), DomainResource, Patient */
function createStandardDefinitions(): Map<string, StructureDefinition> {
  const defs = new Map<string, StructureDefinition>();
  defs.set(RESOURCE_URL, makeSD(RESOURCE_URL, 'Resource'));
  defs.set(
    DOMAIN_RESOURCE_URL,
    makeSD(DOMAIN_RESOURCE_URL, 'DomainResource', RESOURCE_URL),
  );
  defs.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient', DOMAIN_RESOURCE_URL));
  defs.set(
    OBSERVATION_URL,
    makeSD(OBSERVATION_URL, 'Observation', DOMAIN_RESOURCE_URL),
  );
  return defs;
}

// =============================================================================
// Section 1: Simple Inheritance Chains
// =============================================================================

describe('InheritanceChainResolver', () => {
  let definitions: Map<string, StructureDefinition>;
  let provider: DefinitionProvider & { callCount: number };
  let resolver: InheritanceChainResolver;

  beforeEach(() => {
    definitions = createStandardDefinitions();
    provider = createProvider(definitions);
    resolver = new InheritanceChainResolver(provider);
  });

  describe('simple chains', () => {
    it('resolves root resource (no baseDefinition)', async () => {
      const chain = await resolver.resolve(RESOURCE_URL);
      expect(chain).toEqual([RESOURCE_URL]);
    });

    it('resolves 1-level chain (DomainResource → Resource)', async () => {
      const chain = await resolver.resolve(DOMAIN_RESOURCE_URL);
      expect(chain).toEqual([DOMAIN_RESOURCE_URL, RESOURCE_URL]);
    });

    it('resolves 2-level chain (Patient → DomainResource → Resource)', async () => {
      const chain = await resolver.resolve(PATIENT_URL);
      expect(chain).toEqual([
        PATIENT_URL,
        DOMAIN_RESOURCE_URL,
        RESOURCE_URL,
      ]);
    });

    it('resolves 3-level chain (ChinesePatient → Patient → DomainResource → Resource)', async () => {
      definitions.set(
        CHINESE_PATIENT_URL,
        makeSD(CHINESE_PATIENT_URL, 'ChinesePatient', PATIENT_URL),
      );

      const chain = await resolver.resolve(CHINESE_PATIENT_URL);
      expect(chain).toEqual([
        CHINESE_PATIENT_URL,
        PATIENT_URL,
        DOMAIN_RESOURCE_URL,
        RESOURCE_URL,
      ]);
    });

    it('resolves Observation chain independently', async () => {
      const chain = await resolver.resolve(OBSERVATION_URL);
      expect(chain).toEqual([
        OBSERVATION_URL,
        DOMAIN_RESOURCE_URL,
        RESOURCE_URL,
      ]);
    });
  });

  // ===========================================================================
  // Section 2: Circular Dependency Detection
  // ===========================================================================

  describe('circular dependency detection', () => {
    it('detects self-referencing profile (A → A)', async () => {
      const selfRefUrl = 'http://example.org/SelfRef';
      definitions.set(
        selfRefUrl,
        makeSD(selfRefUrl, 'SelfRef', selfRefUrl),
      );

      await expect(resolver.resolve(selfRefUrl)).rejects.toThrow(
        CircularDependencyError,
      );
    });

    it('detects direct circular dependency (A → B → A)', async () => {
      const urlA = 'http://example.org/A';
      const urlB = 'http://example.org/B';
      definitions.set(urlA, makeSD(urlA, 'A', urlB));
      definitions.set(urlB, makeSD(urlB, 'B', urlA));

      await expect(resolver.resolve(urlA)).rejects.toThrow(
        CircularDependencyError,
      );
    });

    it('detects indirect circular dependency (A → B → C → A)', async () => {
      const urlA = 'http://example.org/A';
      const urlB = 'http://example.org/B';
      const urlC = 'http://example.org/C';
      definitions.set(urlA, makeSD(urlA, 'A', urlB));
      definitions.set(urlB, makeSD(urlB, 'B', urlC));
      definitions.set(urlC, makeSD(urlC, 'C', urlA));

      await expect(resolver.resolve(urlA)).rejects.toThrow(
        CircularDependencyError,
      );
    });

    it('circular dependency error contains the cycle chain', async () => {
      const urlA = 'http://example.org/A';
      const urlB = 'http://example.org/B';
      definitions.set(urlA, makeSD(urlA, 'A', urlB));
      definitions.set(urlB, makeSD(urlB, 'B', urlA));

      try {
        await resolver.resolve(urlA);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CircularDependencyError);
        const circErr = err as CircularDependencyError;
        expect(circErr.chain).toContain(urlA);
        expect(circErr.chain).toContain(urlB);
        // The cycle should end with the repeated URL
        expect(circErr.chain[circErr.chain.length - 1]).toBe(urlA);
      }
    });
  });

  // ===========================================================================
  // Section 3: Error Propagation
  // ===========================================================================

  describe('error propagation', () => {
    it('throws ResourceNotFoundError for unknown URL', async () => {
      await expect(
        resolver.resolve('http://example.org/NonExistent'),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws ResourceNotFoundError when base definition is missing', async () => {
      const profileUrl = 'http://example.org/BrokenProfile';
      definitions.set(
        profileUrl,
        makeSD(profileUrl, 'BrokenProfile', 'http://example.org/Missing'),
      );

      await expect(resolver.resolve(profileUrl)).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });

  // ===========================================================================
  // Section 4: Caching
  // ===========================================================================

  describe('caching', () => {
    it('caches resolved chains', async () => {
      await resolver.resolve(PATIENT_URL);
      const callsBefore = provider.callCount;

      // Second resolve should use cache
      const chain = await resolver.resolve(PATIENT_URL);
      expect(chain).toEqual([
        PATIENT_URL,
        DOMAIN_RESOURCE_URL,
        RESOURCE_URL,
      ]);
      expect(provider.callCount).toBe(callsBefore);
    });

    it('caches sub-chains automatically', async () => {
      // Resolving Patient also caches DomainResource and Resource chains
      await resolver.resolve(PATIENT_URL);
      const callsBefore = provider.callCount;

      const domainChain = await resolver.resolve(DOMAIN_RESOURCE_URL);
      expect(domainChain).toEqual([DOMAIN_RESOURCE_URL, RESOURCE_URL]);
      // No additional provider calls
      expect(provider.callCount).toBe(callsBefore);
    });

    it('invalidate removes cached chain for specific URL', async () => {
      await resolver.resolve(PATIENT_URL);
      expect(resolver.cacheSize).toBeGreaterThan(0);

      resolver.invalidate(PATIENT_URL);

      // Patient chain should be gone, but Resource (not containing Patient) may remain
      // Re-resolve should call provider again
      const callsBefore = provider.callCount;
      await resolver.resolve(PATIENT_URL);
      expect(provider.callCount).toBeGreaterThan(callsBefore);
    });

    it('invalidate removes chains that contain the invalidated URL', async () => {
      definitions.set(
        CHINESE_PATIENT_URL,
        makeSD(CHINESE_PATIENT_URL, 'ChinesePatient', PATIENT_URL),
      );
      await resolver.resolve(CHINESE_PATIENT_URL);

      // Invalidating Patient should also remove ChinesePatient's chain
      resolver.invalidate(PATIENT_URL);

      const callsBefore = provider.callCount;
      await resolver.resolve(CHINESE_PATIENT_URL);
      expect(provider.callCount).toBeGreaterThan(callsBefore);
    });

    it('clearCache removes all cached chains', async () => {
      await resolver.resolve(PATIENT_URL);
      await resolver.resolve(OBSERVATION_URL);
      expect(resolver.cacheSize).toBeGreaterThan(0);

      resolver.clearCache();
      expect(resolver.cacheSize).toBe(0);
    });
  });

  // ===========================================================================
  // Section 5: Statistics
  // ===========================================================================

  describe('statistics', () => {
    it('starts with zero resolution count', () => {
      expect(resolver.resolutionCount).toBe(0);
      expect(resolver.cacheSize).toBe(0);
    });

    it('increments resolution count on resolve', async () => {
      await resolver.resolve(PATIENT_URL);
      expect(resolver.resolutionCount).toBe(1);
    });

    it('does not increment resolution count on cache hit', async () => {
      await resolver.resolve(PATIENT_URL);
      await resolver.resolve(PATIENT_URL);
      expect(resolver.resolutionCount).toBe(1);
    });

    it('cacheSize reflects number of cached chains', async () => {
      await resolver.resolve(PATIENT_URL);
      // Should cache: Patient, DomainResource, Resource (3 sub-chains)
      expect(resolver.cacheSize).toBe(3);
    });
  });

  // ===========================================================================
  // Section 6: Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles deep chain (5+ levels)', async () => {
      const urls = [
        'http://example.org/Level5',
        'http://example.org/Level4',
        'http://example.org/Level3',
        'http://example.org/Level2',
        'http://example.org/Level1',
        RESOURCE_URL,
      ];

      // Level5 → Level4 → Level3 → Level2 → Level1 → Resource
      for (let i = 0; i < urls.length - 1; i++) {
        definitions.set(
          urls[i],
          makeSD(urls[i], `Level${urls.length - i}`, urls[i + 1]),
        );
      }

      const chain = await resolver.resolve(urls[0]);
      expect(chain).toEqual(urls);
      expect(chain).toHaveLength(6);
    });

    it('two independent chains share common base cache', async () => {
      // Patient and Observation both go through DomainResource → Resource
      await resolver.resolve(PATIENT_URL);
      const callsBefore = provider.callCount;

      await resolver.resolve(OBSERVATION_URL);
      // Observation loads itself, but DomainResource and Resource are cached
      // So only 1 additional provider call (for Observation itself)
      expect(provider.callCount).toBe(callsBefore + 1);
    });
  });
});
