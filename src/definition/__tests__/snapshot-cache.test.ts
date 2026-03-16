/**
 * Tests for SnapshotCache — lazy snapshot generation with deduplication.
 *
 * STAGE-B: v0.9.0
 */
import { describe, it, expect, vi } from 'vitest';
import { SnapshotCache } from '../snapshot-cache.js';
import type { StructureDefinition } from '../../model/index.js';

function makeFakeSD(url: string): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url,
    name: url.split('/').pop() ?? 'Unknown',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: url.split('/').pop() ?? 'Unknown',
    derivation: 'specialization',
    snapshot: { element: [] },
  } as unknown as StructureDefinition;
}

describe('SnapshotCache', () => {
  it('should start empty', () => {
    const cache = new SnapshotCache();
    expect(cache.size()).toBe(0);
    expect(cache.has('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(false);
  });

  it('should generate and cache a snapshot on first access', async () => {
    const cache = new SnapshotCache();
    const generator = vi.fn().mockImplementation(async (url: string) => makeFakeSD(url));

    const result = await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);
    expect(result).toBeDefined();
    expect(result.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(cache.size()).toBe(1);
    expect(cache.has('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(true);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it('should return cached result on second access without regenerating', async () => {
    const cache = new SnapshotCache();
    const generator = vi.fn().mockImplementation(async (url: string) => makeFakeSD(url));

    await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);
    const second = await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);

    expect(second.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(generator).toHaveBeenCalledTimes(1); // NOT called again
  });

  it('should deduplicate concurrent requests for the same URL', async () => {
    const cache = new SnapshotCache();
    let resolveGenerator: ((sd: StructureDefinition) => void) | undefined;
    const generator = vi.fn().mockImplementation(
      (url: string) => new Promise<StructureDefinition>((resolve) => {
        resolveGenerator = () => resolve(makeFakeSD(url));
      }),
    );

    // Start two concurrent requests
    const p1 = cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);
    const p2 = cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);

    // Generator should only be called once
    expect(generator).toHaveBeenCalledTimes(1);

    // Resolve the generator
    resolveGenerator!(makeFakeSD('http://hl7.org/fhir/StructureDefinition/Patient'));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2); // Same instance
    expect(cache.size()).toBe(1);
  });

  it('should cache different URLs independently', async () => {
    const cache = new SnapshotCache();
    const generator = vi.fn().mockImplementation(async (url: string) => makeFakeSD(url));

    await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);
    await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Observation', generator);

    expect(cache.size()).toBe(2);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  it('should clear all cached snapshots', async () => {
    const cache = new SnapshotCache();
    const generator = vi.fn().mockImplementation(async (url: string) => makeFakeSD(url));

    await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Patient', generator);
    await cache.getSnapshot('http://hl7.org/fhir/StructureDefinition/Observation', generator);
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(false);
  });
});
