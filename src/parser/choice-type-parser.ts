/**
 * FHIR Choice Type [x] Parser
 *
 * Handles FHIR R4 choice type property dispatch. In FHIR JSON, a choice
 * type element like `value[x]` does not appear as a single property.
 * Instead, the property name includes a type suffix:
 *
 * ```json
 * { "valueString": "hello" }
 * { "valueQuantity": { "value": 42, "unit": "kg" } }
 * ```
 *
 * This module:
 * 1. Defines the `ChoiceTypeField` descriptor and `ChoiceValue` result type
 * 2. Provides `extractChoiceValue()` to scan an object for matching properties
 * 3. Detects multiple-value conflicts (e.g., both `valueString` and `valueBoolean`)
 * 4. Consumes `_element` companions for primitive choice type variants
 * 5. Maintains a registry of all known choice type fields in the model
 *
 * @see https://hl7.org/fhir/R4/formats.html#choice
 * @see ADR-003: FHIR R4 Choice Type [x] Representation Strategy
 * @module fhir-parser
 */

import type { ParseIssue } from './parse-error.js';
import { createIssue } from './parse-error.js';
import { pathAppend } from './json-parser.js';

// =============================================================================
// Section 1: Core Types
// =============================================================================

/**
 * Definition of a choice type [x] field.
 *
 * Each choice type field has a base name and a set of allowed type suffixes.
 * The actual JSON property name is `baseName` + one of `allowedTypes`.
 *
 * @example
 * ```typescript
 * const field: ChoiceTypeField = {
 *   baseName: 'value',
 *   allowedTypes: ['String', 'Boolean', 'Integer', 'Quantity', ...],
 * };
 * // Matches: valueString, valueBoolean, valueInteger, valueQuantity, ...
 * ```
 */
export interface ChoiceTypeField {
  /** Base property name (e.g., "value", "defaultValue", "fixed") */
  readonly baseName: string;
  /** Allowed type suffixes (e.g., ["String", "Boolean", "Quantity"]) */
  readonly allowedTypes: readonly string[];
}

/**
 * Parsed choice type value.
 *
 * Preserves the original JSON property name for round-trip serialization.
 */
export interface ChoiceValue {
  /** Type suffix (e.g., "String", "Quantity") */
  readonly typeName: string;
  /** The actual value from JSON */
  readonly value: unknown;
  /** Original JSON property name (e.g., "valueString") — for serialization */
  readonly propertyName: string;
  /** _element companion data, if present */
  readonly elementExtension?: unknown;
}

// =============================================================================
// Section 2: Extraction Logic
// =============================================================================

/**
 * Extract a choice type value from a JSON object.
 *
 * Scans all properties of `obj` looking for keys that match
 * `choiceField.baseName` + one of `choiceField.allowedTypes`.
 *
 * Handles:
 * - Single match → returns `ChoiceValue` with type info
 * - No match → returns `null` (field not present)
 * - Multiple matches → returns first match + `MULTIPLE_CHOICE_VALUES` error
 * - Unknown suffix → `INVALID_CHOICE_TYPE` error
 * - `_element` companion → consumed and attached to result
 *
 * @param obj - The raw JSON object to scan
 * @param choiceField - The choice type field definition
 * @param path - JSON path for error reporting
 * @returns Extracted value, issues, and list of consumed keys
 *
 * @example
 * ```typescript
 * const field = { baseName: 'value', allowedTypes: ['String', 'Boolean'] };
 * const obj = { valueString: 'hello' };
 * const { result, consumedKeys } = extractChoiceValue(obj, field, 'Extension');
 * // result = { typeName: 'String', value: 'hello', propertyName: 'valueString' }
 * // consumedKeys = ['valueString']
 * ```
 */
export function extractChoiceValue(
  obj: Record<string, unknown>,
  choiceField: ChoiceTypeField,
  path: string,
): { result: ChoiceValue | null; issues: ParseIssue[]; consumedKeys: string[] } {
  const issues: ParseIssue[] = [];
  const consumedKeys: string[] = [];
  const matches: Array<{ typeName: string; propertyName: string; value: unknown }> = [];

  const { baseName, allowedTypes } = choiceField;
  const allowedSet = new Set(allowedTypes);

  // Scan all object keys for potential matches
  for (const key of Object.keys(obj)) {
    // Skip keys that don't start with the base name
    if (!key.startsWith(baseName)) continue;

    const suffix = key.slice(baseName.length);

    // Must have a suffix and it must start with uppercase
    if (suffix.length === 0) continue;
    if (suffix[0] !== suffix[0].toUpperCase() || suffix[0] === suffix[0].toLowerCase()) continue;

    // This key matches the choice type pattern
    consumedKeys.push(key);

    // Also consume the _element companion if present
    const underscoreKey = `_${key}`;
    if (obj[underscoreKey] !== undefined) {
      consumedKeys.push(underscoreKey);
    }

    if (allowedSet.has(suffix)) {
      matches.push({ typeName: suffix, propertyName: key, value: obj[key] });
    } else {
      // Unknown type suffix
      issues.push(
        createIssue(
          'error',
          'INVALID_CHOICE_TYPE',
          `Unknown type suffix "${suffix}" for choice field "${baseName}[x]". ` +
          `Allowed types: ${allowedTypes.join(', ')}`,
          pathAppend(path, key),
        ),
      );
    }
  }

  // No matches found
  if (matches.length === 0) {
    return { result: null, issues, consumedKeys };
  }

  // Multiple matches — report error but use the first one
  if (matches.length > 1) {
    const names = matches.map((m) => m.propertyName).join(', ');
    issues.push(
      createIssue(
        'error',
        'MULTIPLE_CHOICE_VALUES',
        `Choice field "${baseName}[x]" has multiple values: ${names}. Only one is allowed.`,
        pathAppend(path, baseName),
      ),
    );
  }

  const match = matches[0];

  // Attach _element companion if present
  const underscoreKey = `_${match.propertyName}`;
  const elementExtension = obj[underscoreKey];

  const result: ChoiceValue = {
    typeName: match.typeName,
    value: match.value,
    propertyName: match.propertyName,
    ...(elementExtension !== undefined && { elementExtension }),
  };

  return { result, issues, consumedKeys };
}

/**
 * Extract all choice type values from a JSON object for a given set of fields.
 *
 * Convenience function that calls `extractChoiceValue` for each field definition
 * and aggregates results.
 *
 * @param obj - The raw JSON object
 * @param choiceFields - Array of choice type field definitions
 * @param path - JSON path for error reporting
 * @returns Map of baseName → ChoiceValue, all issues, and all consumed keys
 */
export function extractAllChoiceValues(
  obj: Record<string, unknown>,
  choiceFields: readonly ChoiceTypeField[],
  path: string,
): {
  results: ReadonlyMap<string, ChoiceValue>;
  issues: ParseIssue[];
  consumedKeys: string[];
} {
  const results = new Map<string, ChoiceValue>();
  const allIssues: ParseIssue[] = [];
  const allConsumedKeys: string[] = [];

  for (const field of choiceFields) {
    const { result, issues, consumedKeys } = extractChoiceValue(obj, field, path);
    allIssues.push(...issues);
    allConsumedKeys.push(...consumedKeys);

    if (result !== null) {
      results.set(field.baseName, result);
    }
  }

  return { results, issues: allIssues, consumedKeys: allConsumedKeys };
}

// =============================================================================
// Section 3: Allowed Type Suffixes
// =============================================================================

/**
 * All FHIR R4 data types that can appear as choice type suffixes.
 *
 * This covers all primitive types (capitalized) and common complex types.
 * Used by choice fields that allow "any FHIR data type" (~50 types).
 *
 * @see https://hl7.org/fhir/R4/datatypes.html
 */
export const ALL_FHIR_TYPE_SUFFIXES: readonly string[] = [
  // Primitive types (capitalized for JSON property names)
  'Boolean',
  'Integer',
  'Decimal',
  'String',
  'Uri',
  'Url',
  'Canonical',
  'Base64Binary',
  'Instant',
  'Date',
  'DateTime',
  'Time',
  'Code',
  'Oid',
  'Id',
  'Markdown',
  'UnsignedInt',
  'PositiveInt',
  'Uuid',

  // Complex types
  'Address',
  'Age',
  'Annotation',
  'Attachment',
  'CodeableConcept',
  'Coding',
  'ContactPoint',
  'Count',
  'Distance',
  'Duration',
  'HumanName',
  'Identifier',
  'Money',
  'Period',
  'Quantity',
  'Range',
  'Ratio',
  'Reference',
  'SampledData',
  'Signature',
  'Timing',

  // Special types
  'ContactDetail',
  'Contributor',
  'DataRequirement',
  'Expression',
  'ParameterDefinition',
  'RelatedArtifact',
  'TriggerDefinition',
  'UsageContext',
  'Dosage',
  'Meta',
] as const;

/**
 * Type suffixes for minValue[x] and maxValue[x] fields.
 *
 * These are restricted to orderable types only.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.minValue_x_
 */
export const MIN_MAX_VALUE_TYPE_SUFFIXES: readonly string[] = [
  'Date',
  'DateTime',
  'Instant',
  'Time',
  'Decimal',
  'Integer',
  'PositiveInt',
  'UnsignedInt',
  'Quantity',
] as const;

/**
 * Type suffixes for UsageContext.value[x].
 * @see https://hl7.org/fhir/R4/metadatatypes-definitions.html#UsageContext.value_x_
 */
export const USAGE_CONTEXT_VALUE_TYPE_SUFFIXES: readonly string[] = [
  'CodeableConcept',
  'Quantity',
  'Range',
  'Reference',
] as const;

// =============================================================================
// Section 4: Choice Type Registry
// =============================================================================

/**
 * All known choice type fields in the fhir-model, grouped by host type.
 *
 * This registry is used by the parser to know which choice type fields
 * exist on each type, enabling proper extraction and validation.
 *
 * Coverage: 8 choice type fields across 4 host types.
 *
 * | Host Type                  | Base Name      | Allowed Types |
 * |----------------------------|----------------|---------------|
 * | Extension                  | value          | All (~50)     |
 * | UsageContext               | value          | 4             |
 * | ElementDefinition          | defaultValue   | All (~50)     |
 * | ElementDefinition          | fixed          | All (~50)     |
 * | ElementDefinition          | pattern        | All (~50)     |
 * | ElementDefinition          | minValue       | 9             |
 * | ElementDefinition          | maxValue       | 9             |
 * | ElementDefinitionExample   | value          | All (~50)     |
 */
export const CHOICE_TYPE_FIELDS: ReadonlyMap<string, readonly ChoiceTypeField[]> = new Map<
  string,
  readonly ChoiceTypeField[]
>([
  [
    'Extension',
    [
      { baseName: 'value', allowedTypes: ALL_FHIR_TYPE_SUFFIXES },
    ],
  ],
  [
    'UsageContext',
    [
      { baseName: 'value', allowedTypes: USAGE_CONTEXT_VALUE_TYPE_SUFFIXES },
    ],
  ],
  [
    'ElementDefinition',
    [
      { baseName: 'defaultValue', allowedTypes: ALL_FHIR_TYPE_SUFFIXES },
      { baseName: 'fixed', allowedTypes: ALL_FHIR_TYPE_SUFFIXES },
      { baseName: 'pattern', allowedTypes: ALL_FHIR_TYPE_SUFFIXES },
      { baseName: 'minValue', allowedTypes: MIN_MAX_VALUE_TYPE_SUFFIXES },
      { baseName: 'maxValue', allowedTypes: MIN_MAX_VALUE_TYPE_SUFFIXES },
    ],
  ],
  [
    'ElementDefinitionExample',
    [
      { baseName: 'value', allowedTypes: ALL_FHIR_TYPE_SUFFIXES },
    ],
  ],
]);

/**
 * Get the choice type base names for a given host type.
 *
 * Returns an array of base names (e.g., `['value']` for Extension,
 * `['defaultValue', 'fixed', 'pattern', 'minValue', 'maxValue']` for
 * ElementDefinition).
 *
 * This can be used to pass `choiceFieldBases` to `parseComplexObject`
 * for Pass 3 key matching, or for other custom parsing logic.
 *
 * @param hostType - The FHIR type name (e.g., "Extension", "ElementDefinition")
 * @returns Array of base names, or empty array if no choice fields
 */
export function getChoiceFieldBases(hostType: string): readonly string[] {
  const fields = CHOICE_TYPE_FIELDS.get(hostType);
  if (!fields) return [];
  return fields.map((f) => f.baseName);
}

/**
 * Get the choice type field definitions for a given host type.
 *
 * @param hostType - The FHIR type name
 * @returns Array of ChoiceTypeField definitions, or empty array
 */
export function getChoiceFields(hostType: string): readonly ChoiceTypeField[] {
  return CHOICE_TYPE_FIELDS.get(hostType) ?? [];
}

/**
 * Check whether a property name matches any choice type field for a host type.
 *
 * @param key - The JSON property name to check
 * @param hostType - The FHIR type name
 * @returns The matching ChoiceTypeField and extracted suffix, or null
 */
export function matchChoiceTypeProperty(
  key: string,
  hostType: string,
): { field: ChoiceTypeField; suffix: string } | null {
  const fields = CHOICE_TYPE_FIELDS.get(hostType);
  if (!fields) return null;

  for (const field of fields) {
    if (!key.startsWith(field.baseName)) continue;

    const suffix = key.slice(field.baseName.length);
    if (suffix.length === 0) continue;
    if (suffix[0] !== suffix[0].toUpperCase() || suffix[0] === suffix[0].toLowerCase()) continue;

    return { field, suffix };
  }

  return null;
}
