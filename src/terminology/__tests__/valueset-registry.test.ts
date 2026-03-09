/**
 * Tests for ValueSetRegistry
 *
 * Testing policy: ≥5 unit tests for registry operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValueSetRegistry } from '../valueset-registry.js';
import type { ValueSetDefinition } from '../types.js';

describe('ValueSetRegistry', () => {
  let registry: ValueSetRegistry;

  beforeEach(() => {
    registry = new ValueSetRegistry();
  });

  it('should start empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.urls()).toEqual([]);
  });

  it('should register and retrieve a ValueSet', () => {
    const vs: ValueSetDefinition = { url: 'http://example.org/vs', name: 'Test' };
    registry.register(vs);
    expect(registry.size).toBe(1);
    expect(registry.has('http://example.org/vs')).toBe(true);
    expect(registry.get('http://example.org/vs')).toBe(vs);
  });

  it('should replace a ValueSet with the same URL', () => {
    const vs1: ValueSetDefinition = { url: 'http://example.org/vs', name: 'V1' };
    const vs2: ValueSetDefinition = { url: 'http://example.org/vs', name: 'V2' };
    registry.register(vs1);
    registry.register(vs2);
    expect(registry.size).toBe(1);
    expect(registry.get('http://example.org/vs')?.name).toBe('V2');
  });

  it('should remove a ValueSet', () => {
    registry.register({ url: 'http://example.org/vs' });
    expect(registry.remove('http://example.org/vs')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.remove('http://example.org/vs')).toBe(false);
  });

  it('should clear all ValueSets', () => {
    registry.register({ url: 'http://example.org/a' });
    registry.register({ url: 'http://example.org/b' });
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('should return undefined for unknown URL', () => {
    expect(registry.get('http://unknown.org')).toBeUndefined();
    expect(registry.has('http://unknown.org')).toBe(false);
  });

  it('should list all URLs', () => {
    registry.register({ url: 'http://example.org/a' });
    registry.register({ url: 'http://example.org/b' });
    const urls = registry.urls();
    expect(urls).toContain('http://example.org/a');
    expect(urls).toContain('http://example.org/b');
    expect(urls.length).toBe(2);
  });
});
