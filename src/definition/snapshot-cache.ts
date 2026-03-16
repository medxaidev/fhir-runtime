/**
 * SnapshotCache — Lazy Snapshot Generation Cache
 *
 * Provides on-demand snapshot generation with deduplication of concurrent
 * requests for the same StructureDefinition URL.
 *
 * STAGE-B: fhir-server prerequisites (v0.9.0)
 *
 * @module fhir-definition
 */

import type { StructureDefinition } from '../model/index.js';

/**
 * Cache for lazily generated StructureDefinition snapshots.
 *
 * Features:
 * - On-demand generation: snapshots are only generated when first accessed.
 * - Deduplication: concurrent requests for the same URL share a single
 *   generation promise, avoiding redundant work.
 * - Cache hit: subsequent requests return the cached result immediately.
 */
export class SnapshotCache {
  private readonly cache: Map<string, StructureDefinition> = new Map();
  private readonly inProgress: Map<string, Promise<StructureDefinition>> = new Map();

  /**
   * Get a snapshot-expanded StructureDefinition, generating it lazily if needed.
   *
   * @param sdUrl - The canonical URL of the StructureDefinition.
   * @param generator - Async function that generates the snapshot-expanded SD.
   * @returns The snapshot-expanded StructureDefinition.
   */
  async getSnapshot(
    sdUrl: string,
    generator: (url: string) => Promise<StructureDefinition>,
  ): Promise<StructureDefinition> {
    // 1. Cache hit
    const cached = this.cache.get(sdUrl);
    if (cached) return cached;

    // 2. Already in progress (dedup concurrent calls)
    const pending = this.inProgress.get(sdUrl);
    if (pending) return pending;

    // 3. Generate and cache
    const task = generator(sdUrl).then(sd => {
      this.cache.set(sdUrl, sd);
      this.inProgress.delete(sdUrl);
      return sd;
    });
    this.inProgress.set(sdUrl, task);
    return task;
  }

  /**
   * Check if a snapshot is already cached for the given URL.
   */
  has(sdUrl: string): boolean {
    return this.cache.has(sdUrl);
  }

  /**
   * Get the number of cached snapshots.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached snapshots.
   */
  clear(): void {
    this.cache.clear();
    this.inProgress.clear();
  }
}
