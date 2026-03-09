/**
 * fhir-package — Dependency Resolver
 *
 * Resolves package dependencies into a topologically sorted dependency graph.
 * Detects circular dependencies.
 *
 * @module fhir-package
 */

import type { DependencyGraph, DependencyNode, PackageManifest } from './types.js';

/**
 * Error thrown when a circular dependency is detected.
 */
export class CircularPackageDependencyError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Circular package dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CircularPackageDependencyError';
    this.cycle = cycle;
  }
}

/**
 * Build a dependency graph from a set of package manifests.
 *
 * @param rootName - The root package name (e.g., 'hl7.fhir.us.core')
 * @param manifests - Map of package name → PackageManifest for all available packages
 * @returns A dependency graph with topological ordering
 * @throws {@link CircularPackageDependencyError} if circular dependencies are detected
 */
export function buildDependencyGraph(
  rootName: string,
  manifests: Map<string, PackageManifest>,
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection

  // Recursively build nodes
  function visit(name: string, path: string[]): void {
    if (visited.has(name)) return;

    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      throw new CircularPackageDependencyError(cycle);
    }

    visiting.add(name);
    path.push(name);

    const manifest = manifests.get(name);
    const deps: string[] = [];

    if (manifest?.dependencies) {
      for (const depName of Object.keys(manifest.dependencies)) {
        deps.push(depName);
        // Only visit dependencies that are available in our manifest set
        if (manifests.has(depName)) {
          visit(depName, [...path]);
        }
      }
    }

    visiting.delete(name);
    visited.add(name);

    nodes.set(name, {
      name,
      version: manifest?.version ?? 'unknown',
      dependencies: deps,
    });
  }

  visit(rootName, []);

  // Topological sort (post-order DFS → reverse)
  const order = topologicalSort(nodes);

  return { root: rootName, nodes, order };
}

/**
 * Perform topological sort on the dependency graph.
 * Returns packages in dependency order (dependencies first, root last).
 */
export function topologicalSort(nodes: Map<string, DependencyNode>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function dfs(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);

    const node = nodes.get(name);
    if (node) {
      for (const dep of node.dependencies) {
        if (nodes.has(dep)) {
          dfs(dep);
        }
      }
    }

    result.push(name);
  }

  for (const name of nodes.keys()) {
    dfs(name);
  }

  return result;
}

/**
 * Get the list of missing dependencies (declared but not available).
 */
export function findMissingDependencies(
  graph: DependencyGraph,
  availablePackages: Set<string>,
): string[] {
  const missing: string[] = [];

  for (const node of graph.nodes.values()) {
    for (const dep of node.dependencies) {
      if (!availablePackages.has(dep) && !graph.nodes.has(dep)) {
        if (!missing.includes(dep)) {
          missing.push(dep);
        }
      }
    }
  }

  return missing;
}
