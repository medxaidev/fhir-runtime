import { describe, it, expect } from 'vitest';
import {
  isChoiceType,
  getChoiceBaseName,
  buildChoiceJsonKey,
  parseChoiceJsonKey,
  resolveActiveChoiceType,
  resolveChoiceFromJsonKey,
} from '../choice-type-utils.js';
import type { CanonicalElement } from '../../model/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeElement(path: string, types: string[]): CanonicalElement {
  return {
    path,
    id: path,
    min: 0,
    max: 1,
    types: types.map((code) => ({ code })),
    constraints: [],
    mustSupport: false,
    isModifier: false,
    isSummary: false,
  };
}

const valueChoiceElement = makeElement('Observation.value[x]', [
  'Quantity',
  'CodeableConcept',
  'string',
  'boolean',
  'integer',
  'Range',
  'Ratio',
  'SampledData',
  'time',
  'dateTime',
  'Period',
]);

const onsetChoiceElement = makeElement('Condition.onset[x]', [
  'dateTime',
  'Age',
  'Period',
  'Range',
  'string',
]);

const statusElement = makeElement('Observation.status', ['code']);

// ── isChoiceType ──────────────────────────────────────────────────────────

describe('isChoiceType', () => {
  it('returns true for multi-type [x] element', () => {
    expect(isChoiceType(valueChoiceElement)).toBe(true);
  });

  it('returns false for non-[x] element', () => {
    expect(isChoiceType(statusElement)).toBe(false);
  });

  it('returns false for [x] with single type', () => {
    const single = makeElement('Extension.value[x]', ['string']);
    expect(isChoiceType(single)).toBe(false);
  });
});

// ── getChoiceBaseName ─────────────────────────────────────────────────────

describe('getChoiceBaseName', () => {
  it('extracts base from value[x]', () => {
    expect(getChoiceBaseName('Observation.value[x]')).toBe('value');
  });

  it('extracts base from onset[x]', () => {
    expect(getChoiceBaseName('Condition.onset[x]')).toBe('onset');
  });

  it('extracts base from medication[x]', () => {
    expect(getChoiceBaseName('MedicationRequest.medication[x]')).toBe('medication');
  });
});

// ── buildChoiceJsonKey ────────────────────────────────────────────────────

describe('buildChoiceJsonKey', () => {
  it('builds valueQuantity', () => {
    expect(buildChoiceJsonKey('value', 'Quantity')).toBe('valueQuantity');
  });

  it('builds onsetDateTime', () => {
    expect(buildChoiceJsonKey('onset', 'DateTime')).toBe('onsetDateTime');
  });

  it('builds valueString', () => {
    expect(buildChoiceJsonKey('value', 'string')).toBe('valueString');
  });

  it('builds medicationCodeableConcept', () => {
    expect(buildChoiceJsonKey('medication', 'CodeableConcept')).toBe('medicationCodeableConcept');
  });
});

// ── parseChoiceJsonKey ────────────────────────────────────────────────────

describe('parseChoiceJsonKey', () => {
  it('parses valueQuantity', () => {
    expect(parseChoiceJsonKey('valueQuantity', 'value')).toBe('Quantity');
  });

  it('parses onsetDateTime', () => {
    expect(parseChoiceJsonKey('onsetDateTime', 'onset')).toBe('DateTime');
  });

  it('returns null for non-matching key', () => {
    expect(parseChoiceJsonKey('status', 'value')).toBeNull();
  });

  it('returns null for empty remainder', () => {
    expect(parseChoiceJsonKey('value', 'value')).toBeNull();
  });

  it('returns null if remainder starts with lowercase', () => {
    expect(parseChoiceJsonKey('valuex', 'value')).toBeNull();
  });
});

// ── resolveActiveChoiceType ───────────────────────────────────────────────

describe('resolveActiveChoiceType', () => {
  it('resolves active Quantity type', () => {
    const resource = { resourceType: 'Observation', valueQuantity: { value: 120, unit: 'mmHg' } };
    const result = resolveActiveChoiceType(valueChoiceElement, resource);
    expect(result.baseName).toBe('value');
    expect(result.activeType).toBe('Quantity');
    expect(result.activeJsonKey).toBe('valueQuantity');
    expect(result.availableTypes).toContain('Quantity');
    expect(result.availableTypes).toContain('string');
  });

  it('resolves active string type', () => {
    const resource = { resourceType: 'Observation', valueString: 'hello' };
    const result = resolveActiveChoiceType(valueChoiceElement, resource);
    expect(result.activeType).toBe('string');
    expect(result.activeJsonKey).toBe('valueString');
  });

  it('returns null activeType when no variant present', () => {
    const resource = { resourceType: 'Observation' };
    const result = resolveActiveChoiceType(valueChoiceElement, resource);
    expect(result.activeType).toBeNull();
    expect(result.activeJsonKey).toBeNull();
  });
});

// ── resolveChoiceFromJsonKey ──────────────────────────────────────────────

describe('resolveChoiceFromJsonKey', () => {
  const elements = new Map<string, CanonicalElement>();
  elements.set('Observation.value[x]', valueChoiceElement);
  elements.set('Observation.status', statusElement);

  it('resolves valueQuantity to choice element', () => {
    const result = resolveChoiceFromJsonKey('valueQuantity', elements);
    expect(result).not.toBeNull();
    expect(result!.element.path).toBe('Observation.value[x]');
    expect(result!.typeCode).toBe('Quantity');
  });

  it('resolves valueString to choice element', () => {
    const result = resolveChoiceFromJsonKey('valueString', elements);
    expect(result).not.toBeNull();
    expect(result!.typeCode).toBe('string');
  });

  it('returns null for non-choice key', () => {
    const result = resolveChoiceFromJsonKey('status', elements);
    expect(result).toBeNull();
  });

  it('returns null for unknown type', () => {
    const result = resolveChoiceFromJsonKey('valueUnknown', elements);
    expect(result).toBeNull();
  });
});
