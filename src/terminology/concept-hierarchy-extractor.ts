/**
 * Concept Hierarchy Extractor
 *
 * Flattens a FHIR CodeSystem's nested concept[] tree into flat parent-child rows,
 * suitable for writing into a `code_system_concept` database table.
 *
 * Accepts either a raw FHIR CodeSystem JSON or the runtime CodeSystemDefinition.
 *
 * @module fhir-terminology
 */

import type { CodeSystemDefinition, CodeSystemConcept } from './types.js';

/**
 * A flattened row representing a single concept in a CodeSystem hierarchy.
 * Designed for persistence in a concept hierarchy table.
 */
export interface ConceptRow {
  /** Unique ID: `{codeSystemUrl}:{code}` */
  id: string;
  /** CodeSystem canonical URL */
  codeSystemUrl: string;
  /** CodeSystem version */
  codeSystemVersion?: string;
  /** concept.code */
  code: string;
  /** concept.display */
  display?: string;
  /** Parent concept code (null for root concepts) */
  parentCode: string | null;
  /** Hierarchy depth (root = 0) */
  level: number;
}

/**
 * Flatten a CodeSystem's nested concept hierarchy into parent-child rows.
 *
 * Recursively walks the concept tree and produces one {@link ConceptRow} per concept,
 * recording the parent code and nesting level.
 *
 * Accepts either:
 * - A raw FHIR CodeSystem JSON (with `concept[]` containing nested `concept[]`)
 * - A runtime `CodeSystemDefinition` (with `concepts[]` containing `children[]`)
 *
 * @param codeSystem - A FHIR CodeSystem or CodeSystemDefinition
 * @returns Flat array of concept rows with parent-child relationships
 */
export function flattenConceptHierarchy(
  codeSystem: CodeSystemDefinition | RawCodeSystem,
): ConceptRow[] {
  const rows: ConceptRow[] = [];
  const url = codeSystem.url ?? '';
  const version = codeSystem.version;

  // Detect input format: raw FHIR uses `concept`, runtime uses `concepts`
  const rootConcepts = isRawCodeSystem(codeSystem)
    ? codeSystem.concept
    : codeSystem.concepts;

  if (!Array.isArray(rootConcepts) || rootConcepts.length === 0) return rows;

  function walk(
    concepts: ReadonlyArray<RawConcept | CodeSystemConcept>,
    parentCode: string | null,
    level: number,
  ): void {
    for (const c of concepts) {
      const code = (c as any).code;
      if (typeof code !== 'string') continue;

      rows.push({
        id: `${url}:${code}`,
        codeSystemUrl: url,
        codeSystemVersion: version,
        code,
        display: typeof (c as any).display === 'string' ? (c as any).display : undefined,
        parentCode,
        level,
      });

      // Raw FHIR: nested concept[], Runtime: children[]
      const children = (c as any).concept ?? (c as any).children;
      if (Array.isArray(children) && children.length > 0) {
        walk(children, code, level + 1);
      }
    }
  }

  walk(rootConcepts, null, 0);
  return rows;
}

// ── Internal types for raw FHIR CodeSystem JSON ────────────────────────────

/** Minimal shape of a raw FHIR CodeSystem JSON */
interface RawCodeSystem {
  url?: string;
  version?: string;
  concept?: RawConcept[];
  [key: string]: unknown;
}

/** Minimal shape of a raw FHIR CodeSystem concept */
interface RawConcept {
  code: string;
  display?: string;
  concept?: RawConcept[];
  [key: string]: unknown;
}

function isRawCodeSystem(cs: any): cs is RawCodeSystem {
  return Array.isArray(cs.concept) || (!('concepts' in cs) && !Array.isArray(cs.concepts));
}
