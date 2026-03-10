/**
 * Search Value Extractor
 *
 * Extracts search index values from FHIR resources using FHIRPath expressions
 * defined in SearchParameter resources.
 *
 * @module integration
 */

import { evalFhirPath } from '../fhirpath/index.js';
import type { Resource } from '../model/index.js';
import type { SearchParameter, SearchParamType, SearchIndexEntry, SearchIndexValue } from './types.js';

/**
 * Extract search index values for a single SearchParameter from a resource.
 */
export function extractSearchValues(
  resource: Resource,
  searchParam: SearchParameter,
): SearchIndexEntry {
  const entry: SearchIndexEntry = {
    code: searchParam.code,
    type: searchParam.type,
    values: [],
  };

  if (!searchParam.expression) {
    return entry;
  }

  // Check if this search parameter applies to this resource type
  if (!searchParam.base.includes(resource.resourceType) && !searchParam.base.includes('Resource')) {
    return entry;
  }

  let rawValues: unknown[];
  try {
    rawValues = evalFhirPath(searchParam.expression, resource);
  } catch {
    // If FHIRPath evaluation fails, return empty
    return entry;
  }

  for (const val of rawValues) {
    const converted = convertValue(val, searchParam.type);
    if (converted) {
      entry.values.push(converted);
    }
  }

  return entry;
}

/**
 * Extract search index values for all applicable SearchParameters from a resource.
 */
export function extractAllSearchValues(
  resource: Resource,
  searchParams: SearchParameter[],
): SearchIndexEntry[] {
  const results: SearchIndexEntry[] = [];

  for (const sp of searchParams) {
    if (!sp.base.includes(resource.resourceType) && !sp.base.includes('Resource')) {
      continue;
    }
    const entry = extractSearchValues(resource, sp);
    if (entry.values.length > 0) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Convert a raw FHIRPath result value to a SearchIndexValue based on the param type.
 */
function convertValue(val: unknown, type: SearchParamType): SearchIndexValue | undefined {
  if (val === null || val === undefined) return undefined;

  switch (type) {
    case 'string':
      return convertString(val);
    case 'token':
      return convertToken(val);
    case 'reference':
      return convertReference(val);
    case 'date':
      return convertDate(val);
    case 'number':
      return convertNumber(val);
    case 'quantity':
      return convertQuantity(val);
    case 'uri':
      return convertUri(val);
    default:
      // composite, special — not handled
      return undefined;
  }
}

function convertString(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'string') {
    return { type: 'string', value: val };
  }
  // HumanName
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    // HumanName → combine family + given
    if ('family' in obj || 'given' in obj) {
      const parts: string[] = [];
      if (typeof obj.family === 'string') parts.push(obj.family);
      if (Array.isArray(obj.given)) {
        for (const g of obj.given) {
          if (typeof g === 'string') parts.push(g);
        }
      }
      if (typeof obj.text === 'string') parts.push(obj.text);
      if (parts.length > 0) {
        return { type: 'string', value: parts.join(' ') };
      }
    }
    // Address → combine line + city + state + postalCode + country
    if ('line' in obj || 'city' in obj || 'state' in obj) {
      const parts: string[] = [];
      if (Array.isArray(obj.line)) {
        for (const l of obj.line) {
          if (typeof l === 'string') parts.push(l);
        }
      }
      if (typeof obj.city === 'string') parts.push(obj.city);
      if (typeof obj.state === 'string') parts.push(obj.state);
      if (typeof obj.postalCode === 'string') parts.push(obj.postalCode);
      if (typeof obj.country === 'string') parts.push(obj.country);
      if (typeof obj.text === 'string') parts.push(obj.text);
      if (parts.length > 0) {
        return { type: 'string', value: parts.join(' ') };
      }
    }
    // Generic text
    if (typeof obj.text === 'string') {
      return { type: 'string', value: obj.text };
    }
    if (typeof obj.value === 'string') {
      return { type: 'string', value: obj.value };
    }
  }
  return undefined;
}

function convertToken(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'string') {
    return { type: 'token', code: val };
  }
  if (typeof val === 'boolean') {
    return { type: 'token', code: String(val) };
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    // Coding
    if ('code' in obj && typeof obj.code === 'string') {
      return {
        type: 'token',
        system: typeof obj.system === 'string' ? obj.system : undefined,
        code: obj.code,
        display: typeof obj.display === 'string' ? obj.display : undefined,
      };
    }
    // CodeableConcept — extract first coding
    if ('coding' in obj && Array.isArray(obj.coding)) {
      for (const coding of obj.coding) {
        const result = convertToken(coding);
        if (result) return result;
      }
      // fallback to text
      if (typeof obj.text === 'string') {
        return { type: 'token', code: obj.text };
      }
    }
    // Identifier
    if ('value' in obj && typeof obj.value === 'string') {
      return {
        type: 'token',
        system: typeof obj.system === 'string' ? obj.system : undefined,
        code: obj.value,
      };
    }
    // ContactPoint
    if ('system' in obj && typeof obj.system === 'string' && !('code' in obj) && !('value' in obj)) {
      return { type: 'token', code: obj.system };
    }
  }
  return undefined;
}

function convertReference(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'string') {
    return parseReferenceString(val);
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.reference === 'string') {
      return parseReferenceString(obj.reference);
    }
  }
  return undefined;
}

function parseReferenceString(ref: string): SearchIndexValue {
  const result: SearchIndexValue = { type: 'reference', reference: ref };
  // Parse resourceType/id pattern
  const match = ref.match(/^([A-Z][a-zA-Z]*)\/([^\s/]+)$/);
  if (match) {
    (result as { type: 'reference'; reference: string; resourceType?: string; id?: string }).resourceType = match[1];
    (result as { type: 'reference'; reference: string; resourceType?: string; id?: string }).id = match[2];
  }
  return result;
}

function convertDate(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'string' && val.length >= 4) {
    return { type: 'date', value: val };
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    // Period → use start
    if ('start' in obj && typeof obj.start === 'string') {
      return { type: 'date', value: obj.start };
    }
  }
  return undefined;
}

function convertNumber(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return { type: 'number', value: val };
  }
  if (typeof val === 'string') {
    const n = Number(val);
    if (Number.isFinite(n)) {
      return { type: 'number', value: n };
    }
  }
  return undefined;
}

function convertQuantity(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if ('value' in obj && typeof obj.value === 'number') {
      return {
        type: 'quantity',
        value: obj.value,
        unit: typeof obj.unit === 'string' ? obj.unit : undefined,
        system: typeof obj.system === 'string' ? obj.system : undefined,
        code: typeof obj.code === 'string' ? obj.code : undefined,
      };
    }
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return { type: 'quantity', value: val };
  }
  return undefined;
}

function convertUri(val: unknown): SearchIndexValue | undefined {
  if (typeof val === 'string') {
    return { type: 'uri', value: val };
  }
  return undefined;
}
