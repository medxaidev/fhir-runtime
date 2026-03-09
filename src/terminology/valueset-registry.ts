/**
 * fhir-terminology — ValueSet Registry
 *
 * In-memory registry for ValueSet definitions.
 * Supports registration, lookup by URL, and batch operations.
 *
 * @module fhir-terminology
 */

import type { ValueSetDefinition } from './types.js';

// =============================================================================
// ValueSetRegistry
// =============================================================================

/**
 * In-memory registry for ValueSet definitions.
 *
 * Stores ValueSets by their canonical URL and provides lookup operations.
 */
export class ValueSetRegistry {
  private readonly valueSets = new Map<string, ValueSetDefinition>();

  /**
   * Register a ValueSet definition.
   *
   * If a ValueSet with the same URL is already registered, it is replaced.
   */
  register(vs: ValueSetDefinition): void {
    this.valueSets.set(vs.url, vs);
  }

  /**
   * Retrieve a ValueSet by its canonical URL.
   */
  get(url: string): ValueSetDefinition | undefined {
    return this.valueSets.get(url);
  }

  /**
   * Check whether a ValueSet is registered.
   */
  has(url: string): boolean {
    return this.valueSets.has(url);
  }

  /**
   * Remove a ValueSet from the registry.
   */
  remove(url: string): boolean {
    return this.valueSets.delete(url);
  }

  /**
   * Return the number of registered ValueSets.
   */
  get size(): number {
    return this.valueSets.size;
  }

  /**
   * Return all registered ValueSet URLs.
   */
  urls(): string[] {
    return [...this.valueSets.keys()];
  }

  /**
   * Clear all registered ValueSets.
   */
  clear(): void {
    this.valueSets.clear();
  }
}
