/**
 * Reference Extractor
 *
 * Extracts all Reference elements from FHIR resources by walking the
 * resource tree and identifying Reference-typed properties.
 *
 * @module integration
 */

import type { Resource } from '../model/index.js';
import type { ReferenceInfo, ReferenceType } from './types.js';

/**
 * Extract all References from a single FHIR resource.
 */
export function extractReferences(resource: Resource): ReferenceInfo[] {
  const results: ReferenceInfo[] = [];
  walkObject(resource, resource.resourceType, results);
  return results;
}

/**
 * Extract all References from a FHIR Bundle.
 */
export function extractReferencesFromBundle(bundle: unknown): ReferenceInfo[] {
  if (!bundle || typeof bundle !== 'object') return [];
  const obj = bundle as Record<string, unknown>;
  if (!Array.isArray(obj.entry)) return [];

  const results: ReferenceInfo[] = [];
  for (const entry of obj.entry) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const resource = e.resource;
    if (!resource || typeof resource !== 'object') continue;
    const res = resource as Record<string, unknown>;
    if (typeof res.resourceType !== 'string') continue;
    results.push(...extractReferences(resource as Resource));
  }
  return results;
}

/**
 * Validate that all References in a resource point to allowed target types
 * based on the CanonicalProfile element type constraints.
 */
export function validateReferenceTargets(
  resource: Resource,
  profile: { elements: Map<string, { types: Array<{ code: string; targetProfiles?: string[] }> }> },
): Array<{ path: string; reference: string; message: string }> {
  const refs = extractReferences(resource);
  const issues: Array<{ path: string; reference: string; message: string }> = [];

  for (const ref of refs) {
    if (!ref.targetType) continue;

    // Find matching element in profile
    const element = profile.elements.get(ref.path);
    if (!element) continue;

    // Check if any type constraint is Reference with targetProfiles
    const refTypes = element.types.filter(t => t.code === 'Reference');
    if (refTypes.length === 0) continue;

    const allTargetProfiles = refTypes.flatMap(t => t.targetProfiles ?? []);
    if (allTargetProfiles.length === 0) continue;

    // Check if target type is allowed
    const targetUrl = `http://hl7.org/fhir/StructureDefinition/${ref.targetType}`;
    const allowed = allTargetProfiles.some(profile =>
      profile === targetUrl || profile.endsWith(`/${ref.targetType}`),
    );

    if (!allowed) {
      issues.push({
        path: ref.path,
        reference: ref.reference,
        message: `Reference target type '${ref.targetType}' is not allowed. Expected one of: ${allTargetProfiles.join(', ')}`,
      });
    }
  }

  return issues;
}

// =============================================================================
// Internal tree walker
// =============================================================================

function walkObject(
  obj: unknown,
  currentPath: string,
  results: ReferenceInfo[],
): void {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      walkObject(obj[i], `${currentPath}[${i}]`, results);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Check if this object is a Reference
  if (isReference(record)) {
    const info = buildReferenceInfo(record, currentPath);
    if (info) {
      results.push(info);
    }
  }

  // Recurse into child properties
  for (const [key, value] of Object.entries(record)) {
    // Skip primitive extensions and meta
    if (key.startsWith('_') || key === 'resourceType') continue;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const childPath = `${currentPath}.${key}`;
        if (value[i] && typeof value[i] === 'object') {
          walkObject(value[i], childPath, results);
        }
      }
    } else if (value && typeof value === 'object') {
      walkObject(value, `${currentPath}.${key}`, results);
    }
  }
}

function isReference(obj: Record<string, unknown>): boolean {
  // A FHIR Reference has either .reference (literal/absolute) or .identifier (logical)
  return (
    (typeof obj.reference === 'string') ||
    (typeof obj.identifier === 'object' && obj.identifier !== null && !('resourceType' in obj))
  );
}

function buildReferenceInfo(
  obj: Record<string, unknown>,
  path: string,
): ReferenceInfo | undefined {
  const display = typeof obj.display === 'string' ? obj.display : undefined;

  if (typeof obj.reference === 'string') {
    const ref = obj.reference;
    const refType = classifyReference(ref);
    const { targetType, targetId } = parseReferenceValue(ref);

    return {
      path,
      reference: ref,
      targetType,
      referenceType: refType,
      targetId,
      display,
    };
  }

  // Logical reference (identifier only, no .reference)
  if (typeof obj.identifier === 'object' && obj.identifier !== null) {
    const id = obj.identifier as Record<string, unknown>;
    const system = typeof id.system === 'string' ? id.system : '';
    const value = typeof id.value === 'string' ? id.value : '';
    const targetType = typeof obj.type === 'string' ? obj.type : undefined;

    return {
      path,
      reference: `${system}|${value}`,
      targetType,
      referenceType: 'logical',
      display,
    };
  }

  return undefined;
}

function classifyReference(ref: string): ReferenceType {
  if (ref.startsWith('#')) return 'contained';
  if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('urn:')) return 'absolute';
  return 'literal';
}

function parseReferenceValue(ref: string): { targetType?: string; targetId?: string } {
  if (ref.startsWith('#')) {
    return { targetId: ref.slice(1) };
  }

  // Absolute URL: try to extract resource type and id from path
  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    const match = ref.match(/\/([A-Z][a-zA-Z]*)\/([^\s/?#]+)(?:\?|#|$)/);
    if (match) {
      return { targetType: match[1], targetId: match[2] };
    }
    return {};
  }

  // Literal: ResourceType/id
  const match = ref.match(/^([A-Z][a-zA-Z]*)\/([^\s/]+)$/);
  if (match) {
    return { targetType: match[1], targetId: match[2] };
  }

  return {};
}
