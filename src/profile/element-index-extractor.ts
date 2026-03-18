/**
 * Element Index Extractor
 *
 * Extracts element index rows from a StructureDefinition's snapshot,
 * suitable for writing into a `structure_element_index` database table.
 *
 * @module fhir-profile
 */

import type { StructureDefinition } from '../model/index.js';

/**
 * A flattened row representing a single element from a StructureDefinition snapshot.
 * Designed for persistence in an element index table.
 */
export interface ElementIndexRow {
  /** Unique ID: `{sd.id}:{element.id}` or `{sd.id}:{element.path}` */
  id: string;
  /** The SD's id */
  structureId: string;
  /** element.path (e.g. "Patient.name.given") */
  path: string;
  /** element.min */
  min?: number;
  /** element.max */
  max?: string;
  /** element.type[].code array */
  typeCodes: string[];
  /** Whether this is a slice (element.sliceName exists) */
  isSlice: boolean;
  /** element.sliceName */
  sliceName?: string;
  /** Whether this is an Extension (type[0].code === 'Extension') */
  isExtension: boolean;
  /** element.binding.valueSet */
  bindingValueSet?: string;
  /** element.mustSupport */
  mustSupport: boolean;
}

/**
 * Extract element index rows from a StructureDefinition snapshot.
 *
 * Each snapshot element is converted to an {@link ElementIndexRow} containing
 * the key structural metadata fields needed for element-level indexing.
 *
 * @param sd - A StructureDefinition with snapshot
 * @returns Array of element index rows
 */
export function extractElementIndexRows(sd: StructureDefinition): ElementIndexRow[] {
  const elements = (sd.snapshot as any)?.element;
  if (!Array.isArray(elements)) return [];

  const structureId = (sd.id ?? sd.url ?? 'unknown') as string;

  return elements.map((el: any) => {
    const typeCodes: string[] = Array.isArray(el.type)
      ? el.type.map((t: any) => t.code).filter((c: any): c is string => typeof c === 'string')
      : [];

    const elementId = el.id ?? el.path ?? '';

    return {
      id: `${structureId}:${elementId}`,
      structureId,
      path: el.path ?? '',
      min: typeof el.min === 'number' ? el.min : undefined,
      max: typeof el.max === 'string' ? el.max : undefined,
      typeCodes,
      isSlice: typeof el.sliceName === 'string' && el.sliceName.length > 0,
      sliceName: typeof el.sliceName === 'string' ? el.sliceName : undefined,
      isExtension: typeCodes.includes('Extension'),
      bindingValueSet: typeof el.binding?.valueSet === 'string' ? el.binding.valueSet : undefined,
      mustSupport: el.mustSupport === true,
    };
  });
}
