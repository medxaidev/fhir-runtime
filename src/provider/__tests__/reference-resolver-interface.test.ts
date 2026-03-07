/**
 * Tests for ReferenceResolver interface contract
 *
 * Verifies that custom implementations of ReferenceResolver
 * can be created and used correctly through the interface.
 */

import { describe, it, expect } from 'vitest';
import type { ReferenceResolver } from '../types.js';
import type { Resource } from '../../model/index.js';

/**
 * A mock ReferenceResolver that resolves from an in-memory store.
 */
class InMemoryReferenceResolver implements ReferenceResolver {
  private readonly store = new Map<string, Resource>();

  register(reference: string, resource: Resource): void {
    this.store.set(reference, resource);
  }

  async resolve(reference: string): Promise<Resource | undefined> {
    return this.store.get(reference);
  }

  async exists(reference: string): Promise<boolean> {
    return this.store.has(reference);
  }
}

/**
 * A mock ReferenceResolver that always rejects.
 */
class RejectAllReferenceResolver implements ReferenceResolver {
  async resolve(_reference: string): Promise<Resource | undefined> {
    return undefined;
  }

  async exists(_reference: string): Promise<boolean> {
    return false;
  }
}

describe('ReferenceResolver interface contract', () => {
  // ─── InMemoryReferenceResolver ───
  describe('InMemoryReferenceResolver (custom implementation)', () => {
    const resolver = new InMemoryReferenceResolver();
    const patient: Resource = { resourceType: 'Patient' } as Resource;
    resolver.register('Patient/123', patient);

    it('should resolve a registered reference', async () => {
      const result = await resolver.resolve('Patient/123');
      expect(result).toBeDefined();
      expect(result!.resourceType).toBe('Patient');
    });

    it('should return undefined for unregistered reference', async () => {
      const result = await resolver.resolve('Patient/999');
      expect(result).toBeUndefined();
    });

    it('should return true for registered reference existence', async () => {
      const result = await resolver.exists('Patient/123');
      expect(result).toBe(true);
    });

    it('should return false for unregistered reference existence', async () => {
      const result = await resolver.exists('Organization/456');
      expect(result).toBe(false);
    });

    it('should satisfy the ReferenceResolver type', () => {
      const rr: ReferenceResolver = resolver;
      expect(typeof rr.resolve).toBe('function');
      expect(typeof rr.exists).toBe('function');
    });
  });

  // ─── RejectAllReferenceResolver ───
  describe('RejectAllReferenceResolver (custom implementation)', () => {
    const resolver: ReferenceResolver = new RejectAllReferenceResolver();

    it('should always return undefined for resolve', async () => {
      expect(await resolver.resolve('Patient/1')).toBeUndefined();
    });

    it('should always return false for exists', async () => {
      expect(await resolver.exists('Patient/1')).toBe(false);
    });

    it('should return undefined for absolute URL', async () => {
      expect(await resolver.resolve('http://example.org/fhir/Patient/1')).toBeUndefined();
    });

    it('should return false for absolute URL exists', async () => {
      expect(await resolver.exists('http://example.org/fhir/Patient/1')).toBe(false);
    });

    it('should return false for contained reference exists', async () => {
      expect(await resolver.exists('#contained-1')).toBe(false);
    });
  });
});
