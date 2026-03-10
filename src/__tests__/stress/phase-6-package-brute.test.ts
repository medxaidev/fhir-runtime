/**
 * Phase 6 — Package/IG Brute-Force Tests
 *
 * Tests package manifest parsing, dependency resolution, canonical URL
 * parsing, and circular dependency detection under adversarial inputs.
 */
import { describe, it, expect } from 'vitest';

import {
  parsePackageManifest,
  parsePackageManifestFromString,
  buildDependencyGraph,
  topologicalSort,
  findMissingDependencies,
  CircularPackageDependencyError,
  parseCanonicalUrl,
} from '../../package/index.js';
import type { PackageManifest, DependencyNode } from '../../package/index.js';
import { BOUNDARY_STRINGS } from './helpers/boundary-values.js';

// =============================================================================
// Scenario A: Corrupted package.json
// =============================================================================

describe('P6-A: Corrupted package manifest', () => {
  it('parsePackageManifest returns undefined for invalid inputs', () => {
    const invalids: unknown[] = [
      null,
      undefined,
      42,
      true,
      'string',
      [],
      {},                                        // empty object
      { name: 'pkg' },                           // missing version
      { version: '1.0.0' },                      // missing name
      { name: '', version: '1.0.0' },            // empty name
      { name: 'pkg', version: '' },              // empty version
      { name: 123, version: '1.0.0' },           // non-string name
      { name: 'pkg', version: 123 },             // non-string version
      { name: null, version: null },             // null fields
    ];

    for (const input of invalids) {
      const result = parsePackageManifest(input);
      expect(result).toBeUndefined();
    }
  });

  it('parsePackageManifestFromString handles non-JSON strings', () => {
    const invalids = [
      '',
      'not-json',
      '{}',
      '{name:"pkg"}', // invalid JSON (unquoted keys)
      '{"name": "pkg"}', // missing version
      'null',
      '[]',
      '42',
    ];

    for (const input of invalids) {
      const result = parsePackageManifestFromString(input);
      // Should either be undefined or a valid manifest
      if (result !== undefined) {
        expect(typeof result.name).toBe('string');
        expect(typeof result.version).toBe('string');
      }
    }
  });

  it('parsePackageManifestFromString handles boundary strings', () => {
    for (const str of BOUNDARY_STRINGS) {
      // Should not throw
      const result = parsePackageManifestFromString(str);
      expect(result === undefined || typeof result === 'object').toBe(true);
    }
  });

  it('parsePackageManifest handles valid manifest with extra fields', () => {
    const result = parsePackageManifest({
      name: 'test-pkg',
      version: '1.0.0',
      fhirVersions: ['4.0.1'],
      type: 'ig',
      description: 'Test package',
      dependencies: {
        'hl7.fhir.r4.core': '4.0.1',
        'hl7.fhir.us.core': '5.0.1',
      },
      extraField: 'ignored',
      nested: { deep: true },
    });

    expect(result).toBeDefined();
    expect(result!.name).toBe('test-pkg');
    expect(result!.version).toBe('1.0.0');
    expect(result!.dependencies).toBeDefined();
  });

  it('parsePackageManifest handles dependencies with non-string values', () => {
    const result = parsePackageManifest({
      name: 'test-pkg',
      version: '1.0.0',
      dependencies: {
        'valid-dep': '1.0.0',
        'invalid-dep-1': 123,
        'invalid-dep-2': null,
        'invalid-dep-3': true,
        'invalid-dep-4': {},
      },
    });

    expect(result).toBeDefined();
    // Only 'valid-dep' should be included
    if (result!.dependencies) {
      expect(result!.dependencies['valid-dep']).toBe('1.0.0');
    }
  });
});

// =============================================================================
// Scenario B: Circular dependency detection
// =============================================================================

describe('P6-B: Circular dependency detection', () => {
  it('detects direct circular dependency (A → B → A)', () => {
    const manifests = new Map<string, PackageManifest>([
      ['pkg-a', { name: 'pkg-a', version: '1.0.0', dependencies: { 'pkg-b': '1.0.0' } }],
      ['pkg-b', { name: 'pkg-b', version: '1.0.0', dependencies: { 'pkg-a': '1.0.0' } }],
    ]);

    expect(() => buildDependencyGraph('pkg-a', manifests)).toThrow(
      CircularPackageDependencyError,
    );
  });

  it('detects indirect circular dependency (A → B → C → A)', () => {
    const manifests = new Map<string, PackageManifest>([
      ['pkg-a', { name: 'pkg-a', version: '1.0.0', dependencies: { 'pkg-b': '1.0.0' } }],
      ['pkg-b', { name: 'pkg-b', version: '1.0.0', dependencies: { 'pkg-c': '1.0.0' } }],
      ['pkg-c', { name: 'pkg-c', version: '1.0.0', dependencies: { 'pkg-a': '1.0.0' } }],
    ]);

    expect(() => buildDependencyGraph('pkg-a', manifests)).toThrow(
      CircularPackageDependencyError,
    );
  });

  it('handles self-referencing package', () => {
    const manifests = new Map<string, PackageManifest>([
      ['pkg-a', { name: 'pkg-a', version: '1.0.0', dependencies: { 'pkg-a': '1.0.0' } }],
    ]);

    expect(() => buildDependencyGraph('pkg-a', manifests)).toThrow(
      CircularPackageDependencyError,
    );
  });

  it('handles missing root package gracefully', () => {
    const manifests = new Map<string, PackageManifest>();

    // Should not crash — root package simply doesn't exist
    const graph = buildDependencyGraph('nonexistent', manifests);
    expect(graph).toBeDefined();
  });
});

// =============================================================================
// Scenario C: Large dependency graph
// =============================================================================

describe('P6-C: Large dependency graph', () => {
  it('handles 50-package linear dependency chain', () => {
    const manifests = new Map<string, PackageManifest>();

    for (let i = 0; i < 50; i++) {
      const deps: Record<string, string> = {};
      if (i > 0) {
        deps[`pkg-${i - 1}`] = '1.0.0';
      }
      manifests.set(`pkg-${i}`, {
        name: `pkg-${i}`,
        version: '1.0.0',
        dependencies: Object.keys(deps).length > 0 ? deps : undefined,
      });
    }

    const graph = buildDependencyGraph('pkg-49', manifests);
    expect(graph).toBeDefined();
    expect(graph.order.length).toBe(50);
  });

  it('handles 50-package fan-out dependency (root depends on all)', () => {
    const manifests = new Map<string, PackageManifest>();

    const rootDeps: Record<string, string> = {};
    for (let i = 1; i <= 49; i++) {
      rootDeps[`pkg-${i}`] = '1.0.0';
      manifests.set(`pkg-${i}`, { name: `pkg-${i}`, version: '1.0.0' });
    }
    manifests.set('root', { name: 'root', version: '1.0.0', dependencies: rootDeps });

    const graph = buildDependencyGraph('root', manifests);
    expect(graph).toBeDefined();
    expect(graph.order.length).toBe(50);
  });

  it('topologicalSort handles various graph shapes', () => {
    // Diamond: A → B, A → C, B → D, C → D
    const nodes = new Map<string, DependencyNode>([
      ['A', { name: 'A', version: '1.0.0', dependencies: ['B', 'C'] }],
      ['B', { name: 'B', version: '1.0.0', dependencies: ['D'] }],
      ['C', { name: 'C', version: '1.0.0', dependencies: ['D'] }],
      ['D', { name: 'D', version: '1.0.0', dependencies: [] }],
    ]);

    const order = topologicalSort(nodes);
    expect(order).toHaveLength(4);
    // D must come before B and C, which must come before A
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'));
  });

  it('findMissingDependencies detects missing packages', () => {
    const nodes = new Map<string, DependencyNode>([
      ['A', { name: 'A', version: '1.0.0', dependencies: ['B', 'C'] }],
      ['B', { name: 'B', version: '1.0.0', dependencies: [] }],
      // C is missing from nodes
    ]);

    const graph = { root: 'A', nodes, order: ['B', 'A'] };
    const available = new Set(['A', 'B']);
    const missing = findMissingDependencies(graph, available);
    expect(missing).toContain('C');
  });
});

// =============================================================================
// Scenario D: Canonical URL edge cases
// =============================================================================

describe('P6-D: Canonical URL parsing', () => {
  it('parses standard canonical URLs', () => {
    const result = parseCanonicalUrl('http://hl7.org/fhir/StructureDefinition/Patient|4.0.1');
    expect(result.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.version).toBe('4.0.1');
  });

  it('parses canonical URL without version', () => {
    const result = parseCanonicalUrl('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.version).toBeUndefined();
  });

  it('handles empty string', () => {
    const result = parseCanonicalUrl('');
    expect(result.url).toBe('');
    expect(result.version).toBeUndefined();
  });

  it('handles URL with multiple pipe characters', () => {
    const result = parseCanonicalUrl('http://example.com/||version');
    expect(result.url).toBe('http://example.com/');
    expect(result.version).toBe('|version');
  });

  it('handles very long URLs', () => {
    const longUrl = 'http://example.com/' + 'a'.repeat(5000);
    const result = parseCanonicalUrl(longUrl);
    expect(result.url).toBe(longUrl);
    expect(result.version).toBeUndefined();
  });

  it('handles various boundary string canonical URLs', () => {
    for (const str of BOUNDARY_STRINGS) {
      // Should not throw
      const result = parseCanonicalUrl(str);
      expect(result).toBeDefined();
      expect(typeof result.url).toBe('string');
    }
  });

  it('handles URL that is just a pipe', () => {
    const result = parseCanonicalUrl('|');
    expect(result.url).toBe('');
    expect(result.version).toBe('');
  });

  it('handles URL ending with pipe', () => {
    const result = parseCanonicalUrl('http://example.com/SD|');
    expect(result.url).toBe('http://example.com/SD');
    expect(result.version).toBe('');
  });
});
