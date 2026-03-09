import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  topologicalSort,
  findMissingDependencies,
  CircularPackageDependencyError,
} from '../dependency-resolver.js';
import type { PackageManifest } from '../types.js';

function makeManifests(
  entries: Array<{ name: string; version: string; deps?: Record<string, string> }>,
): Map<string, PackageManifest> {
  const map = new Map<string, PackageManifest>();
  for (const e of entries) {
    map.set(e.name, { name: e.name, version: e.version, dependencies: e.deps });
  }
  return map;
}

describe('buildDependencyGraph', () => {
  it('should build graph for single package with no deps', () => {
    const manifests = makeManifests([{ name: 'root', version: '1.0.0' }]);
    const graph = buildDependencyGraph('root', manifests);
    expect(graph.root).toBe('root');
    expect(graph.nodes.size).toBe(1);
    expect(graph.order).toContain('root');
  });

  it('should build graph for package with one dependency', () => {
    const manifests = makeManifests([
      { name: 'root', version: '1.0.0', deps: { dep: '1.0.0' } },
      { name: 'dep', version: '1.0.0' },
    ]);
    const graph = buildDependencyGraph('root', manifests);
    expect(graph.nodes.size).toBe(2);
    expect(graph.order.indexOf('dep')).toBeLessThan(graph.order.indexOf('root'));
  });

  it('should build graph for diamond dependency', () => {
    const manifests = makeManifests([
      { name: 'root', version: '1.0.0', deps: { a: '1.0.0', b: '1.0.0' } },
      { name: 'a', version: '1.0.0', deps: { shared: '1.0.0' } },
      { name: 'b', version: '1.0.0', deps: { shared: '1.0.0' } },
      { name: 'shared', version: '1.0.0' },
    ]);
    const graph = buildDependencyGraph('root', manifests);
    expect(graph.nodes.size).toBe(4);
    // shared must come before a and b
    expect(graph.order.indexOf('shared')).toBeLessThan(graph.order.indexOf('a'));
    expect(graph.order.indexOf('shared')).toBeLessThan(graph.order.indexOf('b'));
  });

  it('should handle deep dependency chain', () => {
    const manifests = makeManifests([
      { name: 'a', version: '1.0.0', deps: { b: '1.0.0' } },
      { name: 'b', version: '1.0.0', deps: { c: '1.0.0' } },
      { name: 'c', version: '1.0.0', deps: { d: '1.0.0' } },
      { name: 'd', version: '1.0.0' },
    ]);
    const graph = buildDependencyGraph('a', manifests);
    expect(graph.order).toEqual(['d', 'c', 'b', 'a']);
  });

  it('should record dependencies that are not in manifest set', () => {
    const manifests = makeManifests([
      { name: 'root', version: '1.0.0', deps: { missing: '1.0.0' } },
    ]);
    const graph = buildDependencyGraph('root', manifests);
    expect(graph.nodes.get('root')!.dependencies).toContain('missing');
    // missing is not in nodes because it's not in manifests
    expect(graph.nodes.has('missing')).toBe(false);
  });

  it('should detect direct circular dependency', () => {
    const manifests = makeManifests([
      { name: 'a', version: '1.0.0', deps: { b: '1.0.0' } },
      { name: 'b', version: '1.0.0', deps: { a: '1.0.0' } },
    ]);
    expect(() => buildDependencyGraph('a', manifests)).toThrow(CircularPackageDependencyError);
  });

  it('should detect indirect circular dependency', () => {
    const manifests = makeManifests([
      { name: 'a', version: '1.0.0', deps: { b: '1.0.0' } },
      { name: 'b', version: '1.0.0', deps: { c: '1.0.0' } },
      { name: 'c', version: '1.0.0', deps: { a: '1.0.0' } },
    ]);
    expect(() => buildDependencyGraph('a', manifests)).toThrow(CircularPackageDependencyError);
  });

  it('should include cycle path in error', () => {
    const manifests = makeManifests([
      { name: 'x', version: '1.0.0', deps: { y: '1.0.0' } },
      { name: 'y', version: '1.0.0', deps: { x: '1.0.0' } },
    ]);
    try {
      buildDependencyGraph('x', manifests);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CircularPackageDependencyError);
      expect((e as CircularPackageDependencyError).cycle.length).toBeGreaterThan(1);
    }
  });

  it('should detect self-referencing dependency', () => {
    const manifests = makeManifests([
      { name: 'self', version: '1.0.0', deps: { self: '1.0.0' } },
    ]);
    expect(() => buildDependencyGraph('self', manifests)).toThrow(CircularPackageDependencyError);
  });

  it('should store version in nodes', () => {
    const manifests = makeManifests([
      { name: 'pkg', version: '3.2.1' },
    ]);
    const graph = buildDependencyGraph('pkg', manifests);
    expect(graph.nodes.get('pkg')!.version).toBe('3.2.1');
  });
});

describe('topologicalSort', () => {
  it('should sort empty graph', () => {
    expect(topologicalSort(new Map())).toEqual([]);
  });

  it('should sort single node', () => {
    const nodes = new Map([['a', { name: 'a', version: '1', dependencies: [] }]]);
    expect(topologicalSort(nodes)).toEqual(['a']);
  });
});

describe('findMissingDependencies', () => {
  it('should find missing dependencies', () => {
    const manifests = makeManifests([
      { name: 'root', version: '1.0.0', deps: { missing1: '1.0.0', missing2: '2.0.0' } },
    ]);
    const graph = buildDependencyGraph('root', manifests);
    const missing = findMissingDependencies(graph, new Set(['root']));
    expect(missing).toContain('missing1');
    expect(missing).toContain('missing2');
  });

  it('should return empty when all deps available', () => {
    const manifests = makeManifests([
      { name: 'root', version: '1.0.0', deps: { dep: '1.0.0' } },
      { name: 'dep', version: '1.0.0' },
    ]);
    const graph = buildDependencyGraph('root', manifests);
    const missing = findMissingDependencies(graph, new Set(['root', 'dep']));
    expect(missing).toHaveLength(0);
  });

  it('should not duplicate missing entries', () => {
    const manifests = makeManifests([
      { name: 'a', version: '1.0.0', deps: { missing: '1.0.0' } },
      { name: 'b', version: '1.0.0', deps: { missing: '1.0.0' } },
    ]);
    // Build manually since both are roots — just test findMissing
    const graph = buildDependencyGraph('a', manifests);
    // Add b manually
    graph.nodes.set('b', { name: 'b', version: '1.0.0', dependencies: ['missing'] });
    const missing = findMissingDependencies(graph, new Set(['a', 'b']));
    expect(missing.filter((m) => m === 'missing')).toHaveLength(1);
  });
});
