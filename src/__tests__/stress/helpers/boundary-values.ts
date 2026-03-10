/**
 * Stress Test Helpers — Boundary Values
 *
 * Provides edge-case values for brute-force testing across all modules.
 */

// =============================================================================
// String boundaries
// =============================================================================

export const BOUNDARY_STRINGS: readonly string[] = [
  '',
  ' ',
  '\t',
  '\n',
  '\r\n',
  '\0',
  'a'.repeat(10_000),
  '\u{1F3E5}'.repeat(100),       // 🏥 emoji
  '<script>alert("xss")</script>',
  "'; DROP TABLE resources; --",
  'null',
  'undefined',
  'NaN',
  'Infinity',
  '\uFEFF',                      // BOM
  '\u200B',                      // zero-width space
  '\u202E',                      // RTL override
  'http://example.com/' + 'a'.repeat(5000),
];

// =============================================================================
// Number boundaries
// =============================================================================

export const BOUNDARY_NUMBERS: readonly number[] = [
  0, -0, 1, -1,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Infinity,
  -Infinity,
  NaN,
  0.1 + 0.2, // floating point weirdness
  1e308,
  5e-324,
];

// =============================================================================
// JSON boundary inputs for parseFhirJson
// =============================================================================

export const MALFORMED_JSON_INPUTS: ReadonlyArray<[string, string]> = [
  ['empty string', ''],
  ['whitespace only', '   \n\t  '],
  ['plain text', 'not json at all'],
  ['number literal', '42'],
  ['boolean literal', 'true'],
  ['null literal', 'null'],
  ['array literal', '[]'],
  ['array of objects', '[{"a":1}]'],
  ['empty object', '{}'],
  ['invalid JSON syntax', '{ bad: json }'],
  ['truncated JSON', '{"resourceType":"Patient","id":'],
  ['trailing comma', '{"resourceType":"Patient","id":"1",}'],
  ['single quotes', "{'resourceType':'Patient'}"],
  ['missing closing brace', '{"resourceType":"Patient"'],
  ['double open brace', '{{"resourceType":"Patient"}}'],
  ['JSON with BOM', '\uFEFF{"resourceType":"Patient","id":"1"}'],
  ['undefined resourceType', '{"id":"1","name":"test"}'],
  ['empty resourceType', '{"resourceType":"","id":"1"}'],
  ['null resourceType', '{"resourceType":null,"id":"1"}'],
  ['numeric resourceType', '{"resourceType":123,"id":"1"}'],
  ['boolean resourceType', '{"resourceType":true,"id":"1"}'],
  ['array resourceType', '{"resourceType":["Patient"],"id":"1"}'],
  ['unknown resourceType', '{"resourceType":"FakeResource","id":"1"}'],
  ['nested null', '{"resourceType":"Patient","name":[null]}'],
  ['deeply empty', '{"resourceType":"Patient","name":[{}]}'],
];

// =============================================================================
// Type confusion inputs for FHIR resources
// =============================================================================

export const TYPE_CONFUSION_PATIENTS: ReadonlyArray<[string, string]> = [
  ['id as number', '{"resourceType":"Patient","id":123}'],
  ['active as string', '{"resourceType":"Patient","active":"true"}'],
  ['name as string', '{"resourceType":"Patient","name":"John"}'],
  ['birthDate as boolean', '{"resourceType":"Patient","birthDate":true}'],
  ['birthDate as number', '{"resourceType":"Patient","birthDate":19900101}'],
  ['gender as number', '{"resourceType":"Patient","gender":1}'],
  ['name.family as number', '{"resourceType":"Patient","name":[{"family":123}]}'],
  ['name.given as string', '{"resourceType":"Patient","name":[{"given":"John"}]}'],
  ['identifier as object', '{"resourceType":"Patient","identifier":{"system":"x"}}'],
  ['telecom as string', '{"resourceType":"Patient","telecom":"555-1234"}'],
];

// =============================================================================
// Random JSON generator
// =============================================================================

export function randomPrimitive(): unknown {
  const r = Math.random();
  if (r < 0.15) return null;
  if (r < 0.3) return Math.floor(Math.random() * 10000) - 5000;
  if (r < 0.45) return Math.random() > 0.5;
  if (r < 0.6) return Math.random().toString(36).substring(2);
  if (r < 0.7) return '';
  if (r < 0.8) return 'a'.repeat(Math.floor(Math.random() * 200));
  return String(Math.random());
}

export function randomJson(maxDepth = 5, currentDepth = 0): unknown {
  if (currentDepth >= maxDepth || Math.random() > 0.7) {
    return randomPrimitive();
  }

  if (Math.random() > 0.5) {
    // Object
    const obj: Record<string, unknown> = {};
    const keyCount = Math.floor(Math.random() * 8);
    for (let i = 0; i < keyCount; i++) {
      const key = Math.random().toString(36).substring(2, 8);
      obj[key] = randomJson(maxDepth, currentDepth + 1);
    }
    return obj;
  } else {
    // Array
    const arrLen = Math.floor(Math.random() * 5);
    return Array.from({ length: arrLen }, () =>
      randomJson(maxDepth, currentDepth + 1),
    );
  }
}

export function randomFhirLikeJson(): string {
  const resourceTypes = ['Patient', 'Observation', 'Condition', 'Encounter', 'Bundle', 'FakeType'];
  const rt = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
  const obj: Record<string, unknown> = {
    resourceType: rt,
    id: Math.random().toString(36).substring(2),
  };

  // Add random fields
  const fieldCount = Math.floor(Math.random() * 10);
  for (let i = 0; i < fieldCount; i++) {
    const key = Math.random().toString(36).substring(2, 8);
    obj[key] = randomJson(3);
  }

  return JSON.stringify(obj);
}

// =============================================================================
// Deep nesting builders
// =============================================================================

export function buildDeepExtension(depth: number): string {
  let ext: any = { url: 'http://example.com/ext', valueString: 'leaf' };
  for (let i = 0; i < depth; i++) {
    ext = { url: `http://example.com/ext-${i}`, extension: [ext] };
  }
  return JSON.stringify({
    resourceType: 'Patient',
    id: 'deep-ext',
    extension: [ext],
  });
}

export function buildDeepContained(depth: number): string {
  let resource: any = { resourceType: 'Basic', id: 'leaf' };
  for (let i = depth - 1; i >= 0; i--) {
    resource = {
      resourceType: 'Basic',
      id: `level-${i}`,
      contained: [resource],
    };
  }
  return JSON.stringify(resource);
}

// =============================================================================
// Large resource builders
// =============================================================================

export function buildLargePatient(nameCount: number): string {
  const names = Array.from({ length: nameCount }, (_, i) => ({
    use: 'official',
    family: `Family-${i}`,
    given: [`Given-${i}-A`, `Given-${i}-B`],
  }));
  return JSON.stringify({ resourceType: 'Patient', id: 'large-patient', name: names });
}

export function buildLargeObservation(componentCount: number): string {
  const components = Array.from({ length: componentCount }, (_, i) => ({
    code: { coding: [{ system: 'http://loinc.org', code: `code-${i}` }] },
    valueQuantity: { value: i, unit: 'mg' },
  }));
  return JSON.stringify({
    resourceType: 'Observation',
    id: 'large-obs',
    status: 'final',
    code: { text: 'large' },
    component: components,
  });
}

export function buildLargeBundle(entryCount: number): object {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    resource: {
      resourceType: 'Patient',
      id: `patient-${i}`,
      name: [{ family: `Family-${i}`, given: [`Given-${i}`] }],
      active: i % 2 === 0,
    },
  }));
  return { resourceType: 'Bundle', type: 'collection', entry: entries };
}

export function buildBundleWithReferences(
  resourceCount: number,
  refsPerResource: number,
): object {
  const entries = Array.from({ length: resourceCount }, (_, i) => ({
    resource: {
      resourceType: 'Patient',
      id: `patient-${i}`,
      managingOrganization: { reference: `Organization/org-${i}` },
      generalPractitioner: Array.from({ length: refsPerResource - 1 }, (__, j) => ({
        reference: `Practitioner/pract-${i}-${j}`,
      })),
    },
  }));
  return { resourceType: 'Bundle', type: 'collection', entry: entries };
}
