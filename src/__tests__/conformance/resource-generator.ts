/**
 * Minimal Valid Resource Generator
 *
 * Walks a CanonicalProfile and produces a minimal JSON object that satisfies
 * all required (min >= 1) elements with conformant placeholder values.
 *
 * Used by conformance tests to verify the validator does not produce
 * false-positive errors on valid resources.
 */
import type { CanonicalProfile, CanonicalElement, TypeConstraint } from '../../model/canonical-profile.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a minimal valid resource from a CanonicalProfile.
 *
 * Only populates elements with `min >= 1`. All values are minimal but
 * structurally valid for the declared type constraints.
 */
export function generateMinimalResource(profile: CanonicalProfile): Record<string, unknown> {
  const resource: Record<string, unknown> = {
    resourceType: profile.type,
    id: `gen-${profile.type.toLowerCase()}`,
  };

  // Gather all non-root, non-slice elements
  const elements = Array.from(profile.elements.values()).filter(
    (el) => el.path !== profile.type && !el.sliceName,
  );

  for (const element of elements) {
    // Only populate required elements (min >= 1)
    if (element.min < 1) continue;

    // Skip if a parent backbone is optional and absent — we only populate
    // elements whose entire ancestor chain is required
    const segments = element.path.split('.');
    let ancestorOptional = false;
    for (let i = 2; i < segments.length; i++) {
      const ancestorPath = segments.slice(0, i).join('.');
      const ancestorEl = profile.elements.get(ancestorPath);
      if (ancestorEl && ancestorEl.min < 1) {
        ancestorOptional = true;
        break;
      }
    }
    if (ancestorOptional) continue;

    // Handle choice type [x] elements
    if (element.path.endsWith('[x]')) {
      if (element.types.length === 0) continue;
      const choiceType = element.types[0];
      const value = generateValueForType(choiceType, element, profile);
      if (value !== undefined) {
        // Build concrete path: e.g., MedicationRequest.medication[x] → MedicationRequest.medicationCodeableConcept
        const basePath = element.path.slice(0, -3); // remove [x]
        const baseName = basePath.split('.').pop()!;
        const suffix = capitalizeFirst(choiceType.code);
        const concretePath = basePath.slice(0, basePath.length - baseName.length) + baseName + suffix;
        setNestedValue(resource, concretePath, profile.type, value, element);
      }
      continue;
    }

    // Generate value and set it at the correct path
    const value = generateValue(element, profile);
    if (value !== undefined) {
      setNestedValue(resource, element.path, profile.type, value, element);
    }
  }

  return resource;
}

/**
 * Generate a bare-minimum resource with only resourceType and id.
 * Used to verify no false cardinality errors on optional elements.
 */
export function generateBareResource(resourceType: string): Record<string, unknown> {
  return {
    resourceType,
    id: `bare-${resourceType.toLowerCase()}`,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// Value generation by type
// =============================================================================

function generateValue(element: CanonicalElement, profile: CanonicalProfile): unknown {
  // If there's a fixed value, use it
  if (element.fixed !== undefined) {
    return element.fixed;
  }

  // If there's a pattern value, use it as the base
  if (element.pattern !== undefined) {
    return element.pattern;
  }

  // No type constraints → backbone element, skip (children fill it)
  if (element.types.length === 0) {
    return undefined;
  }

  const tc = element.types[0];
  return generateValueForType(tc, element, profile);
}

function generateValueForType(
  tc: TypeConstraint,
  element: CanonicalElement,
  _profile: CanonicalProfile,
): unknown {
  const code = tc.code;

  // FHIRPath System types (used in core SDs for primitive elements)
  if (code.startsWith('http://hl7.org/fhirpath/System.')) {
    return generateFhirPathSystemValue(code);
  }

  switch (code) {
    // --- Primitives ---
    case 'string':
    case 'markdown':
      return 'test-string';
    case 'uri':
    case 'url':
    case 'canonical':
    case 'oid':
      return 'http://example.org/test';
    case 'code':
      return inferCodeValue(element);
    case 'id':
      return 'test-id';
    case 'boolean':
      return true;
    case 'integer':
    case 'unsignedInt':
      return 0;
    case 'positiveInt':
      return 1;
    case 'decimal':
      return 1.0;
    case 'date':
      return '2024-01-01';
    case 'dateTime':
      return '2024-01-01T00:00:00Z';
    case 'instant':
      return '2024-01-01T00:00:00.000Z';
    case 'time':
      return '12:00:00';
    case 'base64Binary':
      return 'dGVzdA=='; // "test" base64
    case 'uuid':
      return 'urn:uuid:00000000-0000-0000-0000-000000000000';
    case 'xhtml':
      return '<div xmlns="http://www.w3.org/1999/xhtml">test</div>';

    // --- Complex types ---
    case 'CodeableConcept':
      return { coding: [{ system: 'http://example.org', code: 'test' }], text: 'test' };
    case 'Coding':
      return { system: 'http://example.org', code: 'test' };
    case 'Quantity':
    case 'SimpleQuantity':
    case 'Age':
    case 'Count':
    case 'Distance':
    case 'Duration':
    case 'Money':
    case 'MoneyQuantity':
      return { value: 1, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' };
    case 'Reference':
      return generateReference(tc);
    case 'Identifier':
      return { system: 'http://example.org/ids', value: 'test-id' };
    case 'ContactPoint':
      return { system: 'phone', value: '+1-555-0000' };
    case 'HumanName':
      return { family: 'Test', given: ['Test'] };
    case 'Address':
      return { line: ['123 Test St'], city: 'Test', country: 'US' };
    case 'Period':
      return { start: '2024-01-01' };
    case 'Range':
      return { low: { value: 0 }, high: { value: 100 } };
    case 'Ratio':
      return { numerator: { value: 1 }, denominator: { value: 1 } };
    case 'SampledData':
      return { origin: { value: 0 }, period: 1, dimensions: 1, data: 'test' };
    case 'Attachment':
      return { contentType: 'text/plain' };
    case 'Narrative':
      return { status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">test</div>' };
    case 'Meta':
      return { versionId: '1' };
    case 'Extension':
      return { url: 'http://example.org/ext' };
    case 'Dosage':
      return { text: 'test dosage' };
    case 'Timing':
      return {};
    case 'ContactDetail':
      return { name: 'Test' };
    case 'Contributor':
      return { type: 'author', name: 'Test' };
    case 'DataRequirement':
      return { type: 'Patient' };
    case 'ParameterDefinition':
      return { use: 'in', type: 'string' };
    case 'RelatedArtifact':
      return { type: 'documentation' };
    case 'TriggerDefinition':
      return { type: 'named-event' };
    case 'UsageContext':
      return {
        code: { system: 'http://terminology.hl7.org/CodeSystem/usage-context-type', code: 'task' },
        valueCodeableConcept: { text: 'test' },
      };
    case 'Expression':
      return { language: 'text/fhirpath', expression: 'true' };
    case 'Signature':
      return {
        type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1' }],
        when: '2024-01-01T00:00:00Z',
        who: { reference: 'Practitioner/1' },
      };
    case 'Annotation':
      return { text: 'test annotation' };
    case 'BackboneElement':
      return {};

    // Resource types used as element types (e.g., contained)
    case 'Resource':
      return { resourceType: 'Basic', id: 'contained-1', code: { text: 'test' } };

    default:
      // Unknown complex type — return empty object as backbone
      return {};
  }
}

function generateFhirPathSystemValue(url: string): unknown {
  switch (url) {
    case 'http://hl7.org/fhirpath/System.String':
      return 'test-string';
    case 'http://hl7.org/fhirpath/System.Boolean':
      return true;
    case 'http://hl7.org/fhirpath/System.Integer':
      return 0;
    case 'http://hl7.org/fhirpath/System.Decimal':
      return 1.0;
    case 'http://hl7.org/fhirpath/System.DateTime':
      return '2024-01-01T00:00:00Z';
    case 'http://hl7.org/fhirpath/System.Date':
      return '2024-01-01';
    case 'http://hl7.org/fhirpath/System.Time':
      return '12:00:00';
    default:
      return 'unknown-fhirpath-system';
  }
}

function generateReference(tc: TypeConstraint): Record<string, unknown> {
  // If target profiles specify a resource type, use it
  if (tc.targetProfiles && tc.targetProfiles.length > 0) {
    const targetUrl = tc.targetProfiles[0];
    // Extract resource type from canonical URL (e.g., "http://hl7.org/fhir/StructureDefinition/Patient" → "Patient")
    const parts = targetUrl.split('/');
    const targetType = parts[parts.length - 1];
    // Only use as reference type if it looks like a resource type (starts with uppercase)
    if (targetType && /^[A-Z]/.test(targetType)) {
      return { reference: `${targetType}/1` };
    }
  }
  return { reference: 'Resource/1' };
}

function inferCodeValue(element: CanonicalElement): string {
  // Try to pick a reasonable code from binding or path
  const path = element.path.toLowerCase();
  if (path.endsWith('.status')) return 'active';
  if (path.endsWith('.gender')) return 'unknown';
  if (path.endsWith('.use')) return 'official';
  if (path.endsWith('.intent')) return 'order';
  if (path.endsWith('.priority')) return 'routine';
  if (path.endsWith('.kind')) return 'instance';
  if (path.endsWith('.mode')) return 'working';
  if (path.endsWith('.type')) return 'document';
  if (path.endsWith('.severity')) return 'error';
  if (path.endsWith('.language')) return 'en';
  if (path.endsWith('.direction')) return 'ascending';
  if (path.endsWith('.resourcetype')) return 'Patient';
  return 'test-code';
}

// =============================================================================
// Path utilities
// =============================================================================

function setNestedValue(
  obj: Record<string, unknown>,
  elementPath: string,
  rootType: string,
  value: unknown,
  element: CanonicalElement,
): void {
  // Convert "Patient.name.given" → ["name", "given"]
  const pathParts = elementPath.replace(`${rootType}.`, '').split('.');
  if (pathParts.length === 0) return;

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in current)) {
      // If the next level needs to be an array (max > 1 or unbounded), wrap in array
      current[part] = {};
    }
    const next = current[part];
    if (Array.isArray(next)) {
      if (next.length === 0) next.push({});
      current = next[0] as Record<string, unknown>;
    } else {
      current = next as Record<string, unknown>;
    }
  }

  const lastPart = pathParts[pathParts.length - 1];

  // If the element is repeatable (max > 1) and the value isn't already an array, wrap it
  const isArray = element.max === 'unbounded' || (typeof element.max === 'number' && element.max > 1);
  if (isArray && !Array.isArray(value)) {
    current[lastPart] = [value];
  } else {
    current[lastPart] = value;
  }
}
