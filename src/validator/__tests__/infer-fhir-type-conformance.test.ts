/**
 * Suite C: inferFhirType Conformance Tests
 *
 * Exhaustive unit tests for every complex type shape that inferFhirType
 * claims to handle. Ensures the heuristic correctly identifies canonical
 * FHIR data type shapes.
 */
import { describe, it, expect } from 'vitest';
import { inferFhirType } from '../validation-rules.js';

// =============================================================================
// C1: Primitive types
// =============================================================================

describe('C1: Primitive type inference', () => {
  it('null → "null"', () => expect(inferFhirType(null)).toBe('null'));
  it('undefined → "null"', () => expect(inferFhirType(undefined)).toBe('null'));
  it('string → "string"', () => expect(inferFhirType('hello')).toBe('string'));
  it('empty string → "string"', () => expect(inferFhirType('')).toBe('string'));
  it('boolean true → "boolean"', () => expect(inferFhirType(true)).toBe('boolean'));
  it('boolean false → "boolean"', () => expect(inferFhirType(false)).toBe('boolean'));
  it('integer → "integer"', () => expect(inferFhirType(42)).toBe('integer'));
  it('zero → "integer"', () => expect(inferFhirType(0)).toBe('integer'));
  it('negative integer → "integer"', () => expect(inferFhirType(-5)).toBe('integer'));
  it('decimal → "decimal"', () => expect(inferFhirType(3.14)).toBe('decimal'));
  it('array → "array"', () => expect(inferFhirType([1, 2, 3])).toBe('array'));
  it('empty array → "array"', () => expect(inferFhirType([])).toBe('array'));
});

// =============================================================================
// C2: ContactPoint — all 7 system values
// =============================================================================

describe('C2: ContactPoint inference', () => {
  const CONTACT_SYSTEMS = ['phone', 'fax', 'email', 'pager', 'url', 'sms', 'other'];

  for (const sys of CONTACT_SYSTEMS) {
    it(`{ system: "${sys}", value: "x" } → "ContactPoint"`, () => {
      expect(inferFhirType({ system: sys, value: 'x' })).toBe('ContactPoint');
    });
  }

  it('{ system: "phone", value: "x", use: "home" } → "ContactPoint"', () => {
    expect(inferFhirType({ system: 'phone', value: '+1-555-0000', use: 'home' })).toBe('ContactPoint');
  });

  it('{ system: "email", value: "x", use: "work" } → "ContactPoint"', () => {
    expect(inferFhirType({ system: 'email', value: 'a@b.com', use: 'work' })).toBe('ContactPoint');
  });

  // Edge: system value not in ContactPoint list but has ContactPoint.use
  it('{ system: "custom", value: "x", use: "home" } → "ContactPoint" (use hint)', () => {
    expect(inferFhirType({ system: 'custom', value: 'x', use: 'home' })).toBe('ContactPoint');
  });

  it('{ system: "custom", value: "x", use: "work" } → "ContactPoint" (use hint)', () => {
    expect(inferFhirType({ system: 'custom', value: 'x', use: 'work' })).toBe('ContactPoint');
  });

  it('{ system: "custom", value: "x", use: "temp" } → "ContactPoint" (use hint)', () => {
    expect(inferFhirType({ system: 'custom', value: 'x', use: 'temp' })).toBe('ContactPoint');
  });

  it('{ system: "custom", value: "x", use: "old" } → "ContactPoint" (use hint)', () => {
    expect(inferFhirType({ system: 'custom', value: 'x', use: 'old' })).toBe('ContactPoint');
  });

  it('{ system: "custom", value: "x", use: "mobile" } → "ContactPoint" (use hint)', () => {
    expect(inferFhirType({ system: 'custom', value: 'x', use: 'mobile' })).toBe('ContactPoint');
  });
});

// =============================================================================
// C3: Identifier
// =============================================================================

describe('C3: Identifier inference', () => {
  it('{ system: "http://example.org", value: "123" } → "Identifier"', () => {
    expect(inferFhirType({ system: 'http://example.org', value: '123' })).toBe('Identifier');
  });

  it('{ system: "http://hl7.org/fhir/sid/us-ssn", value: "111223333" } → "Identifier"', () => {
    expect(inferFhirType({ system: 'http://hl7.org/fhir/sid/us-ssn', value: '111223333' })).toBe('Identifier');
  });

  it('{ system: "urn:oid:2.16.840", value: "MRN001", use: "official" } → "Identifier"', () => {
    // "official" is an Identifier.use value, not a ContactPoint.use value
    expect(inferFhirType({ system: 'urn:oid:2.16.840', value: 'MRN001', use: 'official' })).toBe('Identifier');
  });

  it('{ system: "http://example.org", value: "x", type: {...} } → "Identifier" (not ContactPoint)', () => {
    expect(inferFhirType({
      system: 'http://example.org',
      value: 'x',
      type: { coding: [{ code: 'MR' }] },
    })).toBe('Identifier');
  });
});

// =============================================================================
// C4: Coding
// =============================================================================

describe('C4: Coding inference', () => {
  it('{ system: "http://loinc.org", code: "12345-6" } → "Coding"', () => {
    expect(inferFhirType({ system: 'http://loinc.org', code: '12345-6' })).toBe('Coding');
  });

  it('{ system: "http://snomed.info/sct", code: "123", display: "test" } → "Coding"', () => {
    expect(inferFhirType({ system: 'http://snomed.info/sct', code: '123', display: 'test' })).toBe('Coding');
  });

  it('{ code: "test" } without system → NOT Coding (no system)', () => {
    // This doesn't match Coding pattern (requires system + code)
    const result = inferFhirType({ code: 'test' });
    expect(result).not.toBe('Coding');
  });
});

// =============================================================================
// C5: CodeableConcept
// =============================================================================

describe('C5: CodeableConcept inference', () => {
  it('{ coding: [{ system: "x", code: "y" }] } → "CodeableConcept"', () => {
    expect(inferFhirType({ coding: [{ system: 'x', code: 'y' }] })).toBe('CodeableConcept');
  });

  it('{ coding: [], text: "free text" } → "CodeableConcept"', () => {
    expect(inferFhirType({ coding: [], text: 'free text' })).toBe('CodeableConcept');
  });
});

// =============================================================================
// C6: Quantity and sub-types
// =============================================================================

describe('C6: Quantity inference', () => {
  it('{ value: 10, unit: "mg" } → "Quantity"', () => {
    expect(inferFhirType({ value: 10, unit: 'mg' })).toBe('Quantity');
  });

  it('{ value: 1.5, system: "http://unitsofmeasure.org", code: "mg" } → "Quantity"', () => {
    expect(inferFhirType({ value: 1.5, system: 'http://unitsofmeasure.org', code: 'mg' })).toBe('Quantity');
  });

  it('{ value: 0, unit: "kg" } → "Quantity"', () => {
    expect(inferFhirType({ value: 0, unit: 'kg' })).toBe('Quantity');
  });
});

// =============================================================================
// C7: Reference
// =============================================================================

describe('C7: Reference inference', () => {
  it('{ reference: "Patient/123" } → "Reference"', () => {
    expect(inferFhirType({ reference: 'Patient/123' })).toBe('Reference');
  });

  it('{ reference: "Patient/123", display: "John" } → "Reference"', () => {
    expect(inferFhirType({ reference: 'Patient/123', display: 'John' })).toBe('Reference');
  });

  it('{ reference: "#contained-1" } → "Reference"', () => {
    expect(inferFhirType({ reference: '#contained-1' })).toBe('Reference');
  });
});

// =============================================================================
// C8: Period
// =============================================================================

describe('C8: Period inference', () => {
  it('{ start: "2024-01-01" } → "Period"', () => {
    expect(inferFhirType({ start: '2024-01-01' })).toBe('Period');
  });

  it('{ end: "2024-12-31" } → "Period"', () => {
    expect(inferFhirType({ end: '2024-12-31' })).toBe('Period');
  });

  it('{ start: "2024-01-01", end: "2024-12-31" } → "Period"', () => {
    expect(inferFhirType({ start: '2024-01-01', end: '2024-12-31' })).toBe('Period');
  });
});

// =============================================================================
// C9: HumanName
// =============================================================================

describe('C9: HumanName inference', () => {
  it('{ family: "Doe" } → "HumanName"', () => {
    expect(inferFhirType({ family: 'Doe' })).toBe('HumanName');
  });

  it('{ given: ["John"] } → "HumanName"', () => {
    expect(inferFhirType({ given: ['John'] })).toBe('HumanName');
  });

  it('{ family: "Doe", given: ["John", "Michael"], use: "official" } → "HumanName"', () => {
    expect(inferFhirType({ family: 'Doe', given: ['John', 'Michael'], use: 'official' })).toBe('HumanName');
  });
});

// =============================================================================
// C10: Address
// =============================================================================

describe('C10: Address inference', () => {
  it('{ line: ["123 Main St"], city: "Springfield" } → "Address"', () => {
    expect(inferFhirType({ line: ['123 Main St'], city: 'Springfield' })).toBe('Address');
  });

  it('{ city: "Springfield", state: "IL" } → "Address"', () => {
    expect(inferFhirType({ city: 'Springfield', state: 'IL' })).toBe('Address');
  });
});

// =============================================================================
// C11: Ratio
// =============================================================================

describe('C11: Ratio inference', () => {
  it('{ numerator: { value: 1 }, denominator: { value: 1 } } → "Ratio"', () => {
    expect(inferFhirType({ numerator: { value: 1 }, denominator: { value: 1 } })).toBe('Ratio');
  });
});

// =============================================================================
// C12: Attachment
// =============================================================================

describe('C12: Attachment inference', () => {
  it('{ contentType: "text/plain" } → "Attachment"', () => {
    expect(inferFhirType({ contentType: 'text/plain' })).toBe('Attachment');
  });

  it('{ data: "dGVzdA==" } → "Attachment"', () => {
    expect(inferFhirType({ data: 'dGVzdA==' })).toBe('Attachment');
  });
});

// =============================================================================
// C13: Meta
// =============================================================================

describe('C13: Meta inference', () => {
  it('{ versionId: "1" } → "Meta"', () => {
    expect(inferFhirType({ versionId: '1' })).toBe('Meta');
  });

  it('{ lastUpdated: "2024-01-01T00:00:00Z" } → "Meta"', () => {
    expect(inferFhirType({ lastUpdated: '2024-01-01T00:00:00Z' })).toBe('Meta');
  });

  it('{ profile: ["http://example.org/profile"] } → "Meta"', () => {
    expect(inferFhirType({ profile: ['http://example.org/profile'] })).toBe('Meta');
  });
});

// =============================================================================
// C14: Narrative
// =============================================================================

describe('C14: Narrative inference', () => {
  it('{ status: "generated", div: "<div>...</div>" } → "Narrative"', () => {
    expect(inferFhirType({ status: 'generated', div: '<div xmlns="http://www.w3.org/1999/xhtml">test</div>' })).toBe('Narrative');
  });
});

// =============================================================================
// C15: Extension
// =============================================================================

describe('C15: Extension inference', () => {
  it('{ url: "http://example.org/ext", valueString: "test" } → "Extension"', () => {
    expect(inferFhirType({ url: 'http://example.org/ext', valueString: 'test' })).toBe('Extension');
  });

  it('{ url: "http://example.org/ext", valueBoolean: true } → "Extension"', () => {
    expect(inferFhirType({ url: 'http://example.org/ext', valueBoolean: true })).toBe('Extension');
  });

  it('{ url: "http://example.org/ext", valueCodeableConcept: { text: "x" } } → "Extension"', () => {
    expect(inferFhirType({ url: 'http://example.org/ext', valueCodeableConcept: { text: 'x' } })).toBe('Extension');
  });
});

// =============================================================================
// C16: BackboneElement fallback
// =============================================================================

describe('C16: BackboneElement fallback', () => {
  it('empty object → "BackboneElement"', () => {
    expect(inferFhirType({})).toBe('BackboneElement');
  });

  it('object with unknown keys → "BackboneElement"', () => {
    expect(inferFhirType({ foo: 'bar', baz: 123 })).toBe('BackboneElement');
  });
});
