/**
 * Tests for NoOpReferenceResolver
 *
 * Verifies that the NoOp implementation:
 * - Always returns undefined for resolve
 * - Always returns true for exists
 * - Handles various reference formats gracefully
 */

import { describe, it, expect } from 'vitest';
import { NoOpReferenceResolver } from '../noop-reference-resolver.js';
import type { ReferenceResolver } from '../types.js';

describe('NoOpReferenceResolver', () => {
  const resolver = new NoOpReferenceResolver();

  // ─── implements ReferenceResolver ───
  it('should implement the ReferenceResolver interface', () => {
    const rr: ReferenceResolver = resolver;
    expect(rr.resolve).toBeDefined();
    expect(rr.exists).toBeDefined();
  });

  // ─── resolve ───
  describe('resolve', () => {
    it('should return undefined for a relative reference', async () => {
      const result = await resolver.resolve('Patient/123');
      expect(result).toBeUndefined();
    });

    it('should return undefined for an absolute reference', async () => {
      const result = await resolver.resolve('http://example.org/fhir/Patient/123');
      expect(result).toBeUndefined();
    });

    it('should return undefined for a contained reference', async () => {
      const result = await resolver.resolve('#contained-1');
      expect(result).toBeUndefined();
    });

    it('should return undefined for an empty reference', async () => {
      const result = await resolver.resolve('');
      expect(result).toBeUndefined();
    });

    it('should return undefined for a URN reference', async () => {
      const result = await resolver.resolve('urn:uuid:12345678-1234-1234-1234-123456789abc');
      expect(result).toBeUndefined();
    });
  });

  // ─── exists ───
  describe('exists', () => {
    it('should return true for a relative reference', async () => {
      const result = await resolver.exists('Patient/123');
      expect(result).toBe(true);
    });

    it('should return true for an absolute reference', async () => {
      const result = await resolver.exists('http://example.org/fhir/Patient/123');
      expect(result).toBe(true);
    });

    it('should return true for a contained reference', async () => {
      const result = await resolver.exists('#contained-1');
      expect(result).toBe(true);
    });

    it('should return true for an empty reference', async () => {
      const result = await resolver.exists('');
      expect(result).toBe(true);
    });

    it('should return true for a URN reference', async () => {
      const result = await resolver.exists('urn:uuid:12345678-1234-1234-1234-123456789abc');
      expect(result).toBe(true);
    });
  });
});
