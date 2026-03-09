/**
 * fhir-terminology — CodeSystem Registry
 *
 * In-memory registry for CodeSystem definitions.
 * Supports registration, lookup by URL, and hierarchical concept search.
 *
 * @module fhir-terminology
 */

import type { CodeSystemDefinition, CodeSystemConcept } from './types.js';

// =============================================================================
// CodeSystemRegistry
// =============================================================================

/**
 * In-memory registry for CodeSystem definitions.
 *
 * Stores CodeSystems by their canonical URL and provides lookup
 * operations for code validation.
 */
export class CodeSystemRegistry {
  private readonly systems = new Map<string, CodeSystemDefinition>();

  /**
   * Register a CodeSystem definition.
   *
   * If a CodeSystem with the same URL is already registered, it is replaced.
   */
  register(cs: CodeSystemDefinition): void {
    this.systems.set(cs.url, cs);
  }

  /**
   * Retrieve a CodeSystem by its canonical URL.
   */
  get(url: string): CodeSystemDefinition | undefined {
    return this.systems.get(url);
  }

  /**
   * Check whether a CodeSystem is registered.
   */
  has(url: string): boolean {
    return this.systems.has(url);
  }

  /**
   * Remove a CodeSystem from the registry.
   */
  remove(url: string): boolean {
    return this.systems.delete(url);
  }

  /**
   * Return the number of registered CodeSystems.
   */
  get size(): number {
    return this.systems.size;
  }

  /**
   * Return all registered CodeSystem URLs.
   */
  urls(): string[] {
    return [...this.systems.keys()];
  }

  /**
   * Clear all registered CodeSystems.
   */
  clear(): void {
    this.systems.clear();
  }

  /**
   * Look up a code in a CodeSystem.
   *
   * Searches the concept hierarchy recursively.
   *
   * @returns The matching concept, or `undefined` if not found.
   */
  lookupCode(systemUrl: string, code: string): CodeSystemConcept | undefined {
    const cs = this.systems.get(systemUrl);
    if (!cs) return undefined;
    return findConcept(cs.concepts, code);
  }

  /**
   * Check whether a code exists in a CodeSystem.
   */
  hasCode(systemUrl: string, code: string): boolean {
    return this.lookupCode(systemUrl, code) !== undefined;
  }

  /**
   * Check whether `descendantCode` is a descendant of `ancestorCode`
   * in the given CodeSystem hierarchy (is-a relationship).
   */
  isDescendantOf(systemUrl: string, descendantCode: string, ancestorCode: string): boolean {
    const cs = this.systems.get(systemUrl);
    if (!cs) return false;
    const ancestorNode = findConcept(cs.concepts, ancestorCode);
    if (!ancestorNode || !ancestorNode.children) return false;
    return findConcept(ancestorNode.children, descendantCode) !== undefined;
  }

  /**
   * Collect all codes in a CodeSystem (flat list).
   */
  allCodes(systemUrl: string): string[] {
    const cs = this.systems.get(systemUrl);
    if (!cs) return [];
    const codes: string[] = [];
    collectCodes(cs.concepts, codes);
    return codes;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Recursively search for a concept by code.
 */
function findConcept(
  concepts: readonly CodeSystemConcept[],
  code: string,
): CodeSystemConcept | undefined {
  for (const c of concepts) {
    if (c.code === code) return c;
    if (c.children) {
      const found = findConcept(c.children, code);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Recursively collect all codes.
 */
function collectCodes(concepts: readonly CodeSystemConcept[], out: string[]): void {
  for (const c of concepts) {
    out.push(c.code);
    if (c.children) {
      collectCodes(c.children, out);
    }
  }
}
