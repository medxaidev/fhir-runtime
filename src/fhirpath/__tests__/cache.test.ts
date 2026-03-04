/**
 * Tests for LRU Cache and expression caching integration.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { LRUCache, getExpressionCache, clearExpressionCache } from '../cache.js';
import { parseFhirPath, evalFhirPath, evalFhirPathBoolean, evalFhirPathString } from '../parse.js';
import { toTypedValue } from '../utils.js';

// =============================================================================
// §1 LRU Cache — Core Behavior
// =============================================================================

describe('LRUCache: core behavior', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  test('constructor rejects maxSize < 1', () => {
    expect(() => new LRUCache(0)).toThrow(RangeError);
    expect(() => new LRUCache(-1)).toThrow(RangeError);
  });

  test('maxSize and initial size', () => {
    expect(cache.maxSize).toBe(3);
    expect(cache.size).toBe(0);
  });

  test('set and get basic', () => {
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(1);
  });

  test('get returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  test('set overwrites existing key', () => {
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  test('has() checks existence without affecting LRU order', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(false);
  });

  test('delete() removes entry', () => {
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  test('delete() returns false for missing key', () => {
    expect(cache.delete('missing')).toBe(false);
  });

  test('clear() removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});

// =============================================================================
// §2 LRU Cache — Eviction Policy
// =============================================================================

describe('LRUCache: eviction policy', () => {
  test('evicts least-recently-used when full', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Cache is full: [a, b, c]
    cache.set('d', 4);
    // 'a' should be evicted: [b, c, d]
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('get() promotes entry to most-recently-used', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Access 'a' to promote it
    cache.get('a');
    // Now LRU order: [b, c, a]
    cache.set('d', 4);
    // 'b' should be evicted: [c, a, d]
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('set() on existing key promotes it', () => {
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Update 'a' to promote it
    cache.set('a', 10);
    cache.set('d', 4);
    // 'b' should be evicted
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(10);
  });

  test('cache of size 1 always keeps last entry', () => {
    const cache = new LRUCache<string, number>(1);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(1);
  });

  test('multiple evictions in sequence', () => {
    const cache = new LRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts a
    cache.set('d', 4); // evicts b
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });
});

// =============================================================================
// §3 LRU Cache — Statistics
// =============================================================================

describe('LRUCache: statistics', () => {
  test('initial stats are zero', () => {
    const cache = new LRUCache<string, number>(5);
    expect(cache.gets).toBe(0);
    expect(cache.hits).toBe(0);
    expect(cache.hitRate).toBe(0);
  });

  test('tracks hits and misses', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('b'); // miss
    cache.get('a'); // hit
    expect(cache.gets).toBe(3);
    expect(cache.hits).toBe(2);
  });

  test('hitRate calculation', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('b'); // miss
    expect(cache.hitRate).toBeCloseTo(0.5);
  });

  test('hitRate is 1.0 for all hits', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.get('a');
    cache.get('a');
    cache.get('a');
    expect(cache.hitRate).toBe(1);
  });

  test('resetStats() clears counters', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.get('a');
    cache.get('b');
    cache.resetStats();
    expect(cache.gets).toBe(0);
    expect(cache.hits).toBe(0);
    expect(cache.hitRate).toBe(0);
    // Data is still there
    expect(cache.get('a')).toBe(1);
  });

  test('clear() does not reset stats', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.get('a');
    cache.clear();
    expect(cache.gets).toBe(1);
    expect(cache.hits).toBe(1);
  });
});

// =============================================================================
// §4 LRU Cache — Iterators
// =============================================================================

describe('LRUCache: iterators', () => {
  test('entries() iterates in LRU order', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    const entries = Array.from(cache.entries());
    expect(entries).toStrictEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  test('entries() reflects promotion order', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // promote a
    const entries = Array.from(cache.entries());
    expect(entries).toStrictEqual([['b', 2], ['c', 3], ['a', 1]]);
  });

  test('keys() iterates in LRU order', () => {
    const cache = new LRUCache<string, number>(5);
    cache.set('x', 10);
    cache.set('y', 20);
    expect(Array.from(cache.keys())).toStrictEqual(['x', 'y']);
  });

  test('entries() on empty cache', () => {
    const cache = new LRUCache<string, number>(5);
    expect(Array.from(cache.entries())).toStrictEqual([]);
  });

  test('keys() after eviction', () => {
    const cache = new LRUCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts a
    expect(Array.from(cache.keys())).toStrictEqual(['b', 'c']);
  });
});

// =============================================================================
// §5 Expression Cache Integration
// =============================================================================

describe('Expression cache integration', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  test('parseFhirPath caches parsed expressions', () => {
    const cache = getExpressionCache();
    const ast1 = parseFhirPath('1 + 2');
    const ast2 = parseFhirPath('1 + 2');
    expect(ast1).toBe(ast2); // same reference
    expect(cache.size).toBe(1);
  });

  test('different expressions get different cache entries', () => {
    const cache = getExpressionCache();
    parseFhirPath('1 + 2');
    parseFhirPath('3 + 4');
    parseFhirPath('Patient.name');
    expect(cache.size).toBe(3);
  });

  test('cache hit rate increases with repeated expressions', () => {
    const cache = getExpressionCache();
    parseFhirPath('Patient.name');
    parseFhirPath('Patient.name');
    parseFhirPath('Patient.name');
    parseFhirPath('Patient.id');
    // 4 parses: 1st miss, 2nd hit, 3rd hit, 4th miss → 2 hits / 4 gets
    expect(cache.hits).toBe(2);
    expect(cache.gets).toBe(4);
    expect(cache.hitRate).toBe(0.5);
  });

  test('clearExpressionCache resets cache', () => {
    parseFhirPath('1 + 2');
    const cache = getExpressionCache();
    expect(cache.size).toBe(1);
    clearExpressionCache();
    expect(cache.size).toBe(0);
    expect(cache.gets).toBe(0);
  });

  test('evalFhirPath uses cached AST', () => {
    const cache = getExpressionCache();
    evalFhirPath('1 + 2', []);
    evalFhirPath('1 + 2', []);
    expect(cache.hits).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// §6 High-level Convenience API
// =============================================================================

describe('evalFhirPathBoolean', () => {
  const patient = {
    resourceType: 'Patient',
    id: 'test',
    active: true,
    name: [{ family: 'Smith', given: ['John'] }],
  };

  test('returns true for truthy expression', () => {
    expect(evalFhirPathBoolean('Patient.active', patient)).toBe(true);
  });

  test('returns false for falsy expression', () => {
    expect(evalFhirPathBoolean('Patient.deceased.exists()', patient)).toBe(false);
  });

  test('returns true for non-empty collection', () => {
    expect(evalFhirPathBoolean('Patient.name.exists()', patient)).toBe(true);
  });

  test('returns false for empty collection', () => {
    expect(evalFhirPathBoolean('Patient.telecom.exists()', patient)).toBe(false);
  });

  test('works with comparison expressions', () => {
    expect(evalFhirPathBoolean('Patient.name.count() > 0', patient)).toBe(true);
    expect(evalFhirPathBoolean('Patient.name.count() > 5', patient)).toBe(false);
  });

  test('works with boolean literals', () => {
    expect(evalFhirPathBoolean('true', [])).toBe(true);
    expect(evalFhirPathBoolean('false', [])).toBe(false);
  });
});

describe('evalFhirPathString', () => {
  const patient = {
    resourceType: 'Patient',
    id: 'test-123',
    name: [{ family: 'Smith', given: ['John'] }],
    gender: 'male',
  };

  test('returns string value', () => {
    expect(evalFhirPathString('Patient.id', patient)).toBe('test-123');
  });

  test('returns first value when multiple', () => {
    expect(evalFhirPathString('Patient.name.given', patient)).toBe('John');
  });

  test('returns undefined for empty result', () => {
    expect(evalFhirPathString('Patient.deceased', patient)).toBeUndefined();
  });

  test('converts number to string', () => {
    expect(evalFhirPathString('Patient.name.count()', patient)).toBe('1');
  });

  test('converts boolean to string', () => {
    expect(evalFhirPathString('Patient.name.exists()', patient)).toBe('true');
  });

  test('returns gender string', () => {
    expect(evalFhirPathString('Patient.gender', patient)).toBe('male');
  });
});
