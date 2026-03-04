/**
 * FHIR JSON Serializer
 *
 * Converts TypeScript model objects back into FHIR R4 JSON.
 * This is the inverse of the parser: it takes a `Resource` (or more
 * specifically a `StructureDefinition`) and produces a FHIR-conformant
 * JSON string or plain object.
 *
 * ## Serialization Rules
 *
 * 1. **resourceType first** — always the first property in output
 * 2. **Choice type restoration** — `ChoiceValue.propertyName` restores the
 *    original JSON property name (e.g., `fixedString`, `patternCoding`)
 * 3. **Empty value omission** — `undefined`, empty arrays `[]`, and
 *    empty objects `{}` are omitted from output
 * 4. **Property ordering** — `resourceType` first, then remaining
 *    properties in alphabetical order (FHIR canonical JSON convention)
 * 5. **Null alignment** — preserved in arrays for primitive `_element` alignment
 *
 * ## Scope (Stage-1)
 *
 * Stage-1 focuses on StructureDefinition serialization. The serializer
 * handles:
 * - All StructureDefinition top-level fields
 * - All ElementDefinition fields including sub-types
 * - Choice type fields (defaultValue[x], fixed[x], pattern[x], minValue[x], maxValue[x])
 * - Example value[x] choice types
 * - snapshot/differential element containers
 *
 * @module fhir-parser
 */

import type { Resource } from '../model/primitives.js';
import type {
  StructureDefinition,
  StructureDefinitionMapping,
  StructureDefinitionContext,
} from '../model/structure-definition.js';
import type {
  ElementDefinition,
  ElementDefinitionSlicing,
  SlicingDiscriminator,
  ElementDefinitionBase,
  ElementDefinitionType,
  ElementDefinitionConstraint,
  ElementDefinitionBinding,
  ElementDefinitionExample,
  ElementDefinitionMapping,
} from '../model/element-definition.js';
import type { ChoiceValue } from './choice-type-parser.js';

// =============================================================================
// Section 1: Public API
// =============================================================================

/**
 * Serialize a Resource object to a FHIR JSON string.
 *
 * Output conforms to FHIR R4 JSON conventions:
 * - `resourceType` is the first property
 * - Remaining properties are in alphabetical order
 * - Choice type fields use their original JSON property names
 * - Empty values (`undefined`, `[]`, `{}`) are omitted
 *
 * @param resource - The Resource to serialize
 * @returns A FHIR JSON string (pretty-printed with 2-space indent)
 *
 * @example
 * ```typescript
 * const sd: StructureDefinition = { resourceType: 'StructureDefinition', ... };
 * const json = serializeToFhirJson(sd);
 * // '{\n  "resourceType": "StructureDefinition",\n  ...\n}'
 * ```
 */
export function serializeToFhirJson(resource: Resource): string {
  const obj = serializeToFhirObject(resource);
  return JSON.stringify(obj, null, 2);
}

/**
 * Serialize a Resource object to a plain JavaScript object suitable
 * for FHIR JSON (without calling `JSON.stringify`).
 *
 * Use this when you need the object form (e.g., for storage or
 * further manipulation) rather than a string.
 *
 * @param resource - The Resource to serialize
 * @returns A plain object conforming to FHIR JSON conventions
 */
export function serializeToFhirObject(
  resource: Resource,
): Record<string, unknown> {
  if (resource.resourceType === 'StructureDefinition') {
    return serializeStructureDefinition(resource as StructureDefinition);
  }
  return serializeGenericResource(resource);
}

// =============================================================================
// Section 2: StructureDefinition Serializer
// =============================================================================

/**
 * Serialize a StructureDefinition to a FHIR JSON object.
 *
 * Handles all top-level fields, sub-types (mapping, context, snapshot,
 * differential), and preserves property ordering conventions.
 */
function serializeStructureDefinition(
  sd: StructureDefinition,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // resourceType always first
  result.resourceType = sd.resourceType;

  // Collect all other properties in alphabetical order
  const props: Record<string, unknown> = {};

  // Resource base fields
  assignIfDefined(props, 'id', sd.id);
  assignIfDefined(props, 'meta', sd.meta);
  assignIfDefined(props, 'implicitRules', sd.implicitRules);
  assignIfDefined(props, 'language', sd.language);

  // DomainResource fields
  assignIfDefined(props, 'text', sd.text);
  assignIfNotEmptyArray(props, 'contained', sd.contained);
  assignIfNotEmptyArray(props, 'extension', sd.extension);
  assignIfNotEmptyArray(props, 'modifierExtension', sd.modifierExtension);

  // StructureDefinition metadata
  props.url = sd.url;
  assignIfNotEmptyArray(props, 'identifier', sd.identifier);
  assignIfDefined(props, 'version', sd.version);
  props.name = sd.name;
  assignIfDefined(props, 'title', sd.title);
  props.status = sd.status;
  assignIfDefined(props, 'experimental', sd.experimental);
  assignIfDefined(props, 'date', sd.date);
  assignIfDefined(props, 'publisher', sd.publisher);
  assignIfNotEmptyArray(props, 'contact', sd.contact);
  assignIfDefined(props, 'description', sd.description);
  assignIfNotEmptyArray(props, 'useContext', sd.useContext);
  assignIfNotEmptyArray(props, 'jurisdiction', sd.jurisdiction);
  assignIfDefined(props, 'purpose', sd.purpose);
  assignIfDefined(props, 'copyright', sd.copyright);
  assignIfNotEmptyArray(props, 'keyword', sd.keyword);
  assignIfDefined(props, 'fhirVersion', sd.fhirVersion);

  // Mapping
  if (sd.mapping && sd.mapping.length > 0) {
    props.mapping = sd.mapping.map(serializeSDMapping);
  }

  // Core semantic fields
  props.kind = sd.kind;
  props.abstract = sd.abstract;

  // Context (extension definitions)
  if (sd.context && sd.context.length > 0) {
    props.context = sd.context.map(serializeSDContext);
  }
  assignIfNotEmptyArray(props, 'contextInvariant', sd.contextInvariant);

  props.type = sd.type;
  assignIfDefined(props, 'baseDefinition', sd.baseDefinition);
  assignIfDefined(props, 'derivation', sd.derivation);

  // Snapshot & Differential
  if (sd.snapshot) {
    props.snapshot = serializeElementContainer(sd.snapshot);
  }
  if (sd.differential) {
    props.differential = serializeElementContainer(sd.differential);
  }

  // Sort remaining properties alphabetically and merge
  const sortedKeys = Object.keys(props).sort();
  for (const key of sortedKeys) {
    result[key] = props[key];
  }

  return result;
}

/**
 * Serialize a generic Resource (non-StructureDefinition).
 * Passes through all properties, with resourceType first and rest sorted.
 */
function serializeGenericResource(resource: Resource): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  result.resourceType = resource.resourceType;

  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resource)) {
    if (key === 'resourceType') continue;
    if (value === undefined) continue;
    props[key] = value;
  }

  const sortedKeys = Object.keys(props).sort();
  for (const key of sortedKeys) {
    result[key] = props[key];
  }

  return result;
}

// =============================================================================
// Section 3: Sub-Type Serializers
// =============================================================================

/**
 * Serialize a StructureDefinitionMapping.
 */
function serializeSDMapping(
  mapping: StructureDefinitionMapping,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', mapping.id);
  assignIfNotEmptyArray(result, 'extension', mapping.extension);
  assignIfNotEmptyArray(result, 'modifierExtension', mapping.modifierExtension);
  result.identity = mapping.identity;
  assignIfDefined(result, 'uri', mapping.uri);
  assignIfDefined(result, 'name', mapping.name);
  assignIfDefined(result, 'comment', mapping.comment);
  return result;
}

/**
 * Serialize a StructureDefinitionContext.
 */
function serializeSDContext(
  context: StructureDefinitionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', context.id);
  assignIfNotEmptyArray(result, 'extension', context.extension);
  assignIfNotEmptyArray(result, 'modifierExtension', context.modifierExtension);
  result.type = context.type;
  result.expression = context.expression;
  return result;
}

/**
 * Serialize a snapshot or differential element container.
 */
function serializeElementContainer(
  container: { element: ElementDefinition[]; id?: unknown; extension?: unknown[]; modifierExtension?: unknown[] },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', container.id);
  assignIfNotEmptyArray(result, 'extension', container.extension);
  assignIfNotEmptyArray(result, 'modifierExtension', container.modifierExtension);
  result.element = container.element.map(serializeElementDefinition);
  return result;
}

// =============================================================================
// Section 4: ElementDefinition Serializer
// =============================================================================

/**
 * Serialize an ElementDefinition to a FHIR JSON object.
 *
 * Handles all 37+ fields, sub-types, and choice type restoration.
 * Choice type fields (defaultValue, fixed, pattern, minValue, maxValue)
 * are stored as `ChoiceValue` objects in the model; this function
 * restores them to their original JSON property names.
 */
function serializeElementDefinition(ed: ElementDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // BackboneElement base
  assignIfDefined(result, 'id', ed.id);
  assignIfNotEmptyArray(result, 'extension', ed.extension);
  assignIfNotEmptyArray(result, 'modifierExtension', ed.modifierExtension);

  // Core path & identity
  result.path = ed.path;
  assignIfNotEmptyArray(result, 'representation', ed.representation);
  assignIfDefined(result, 'sliceName', ed.sliceName);
  assignIfDefined(result, 'sliceIsConstraining', ed.sliceIsConstraining);
  assignIfDefined(result, 'label', ed.label);
  assignIfNotEmptyArray(result, 'code', ed.code);

  // Slicing
  if (ed.slicing) {
    result.slicing = serializeSlicing(ed.slicing);
  }

  // Documentation
  assignIfDefined(result, 'short', ed.short);
  assignIfDefined(result, 'definition', ed.definition);
  assignIfDefined(result, 'comment', ed.comment);
  assignIfDefined(result, 'requirements', ed.requirements);
  assignIfNotEmptyArray(result, 'alias', ed.alias);

  // Cardinality
  assignIfDefined(result, 'min', ed.min);
  assignIfDefined(result, 'max', ed.max);

  // Base
  if (ed.base) {
    result.base = serializeBase(ed.base);
  }

  // Content reference
  assignIfDefined(result, 'contentReference', ed.contentReference);

  // Type
  if (ed.type && ed.type.length > 0) {
    result.type = ed.type.map(serializeEDType);
  }

  // Choice type fields — restore to original JSON property names
  serializeChoiceValue(result, ed.defaultValue);
  assignIfDefined(result, 'meaningWhenMissing', ed.meaningWhenMissing);
  assignIfDefined(result, 'orderMeaning', ed.orderMeaning);
  serializeChoiceValue(result, ed.fixed);
  serializeChoiceValue(result, ed.pattern);

  // Examples
  if (ed.example && ed.example.length > 0) {
    result.example = ed.example.map(serializeExample);
  }

  // Value range (choice types)
  serializeChoiceValue(result, ed.minValue);
  serializeChoiceValue(result, ed.maxValue);

  // Max length
  assignIfDefined(result, 'maxLength', ed.maxLength);

  // Constraints
  assignIfNotEmptyArray(result, 'condition', ed.condition);
  if (ed.constraint && ed.constraint.length > 0) {
    result.constraint = ed.constraint.map(serializeConstraint);
  }

  // Flags
  assignIfDefined(result, 'mustSupport', ed.mustSupport);
  assignIfDefined(result, 'isModifier', ed.isModifier);
  assignIfDefined(result, 'isModifierReason', ed.isModifierReason);
  assignIfDefined(result, 'isSummary', ed.isSummary);

  // Binding
  if (ed.binding) {
    result.binding = serializeBinding(ed.binding);
  }

  // Mapping
  if (ed.mapping && ed.mapping.length > 0) {
    result.mapping = ed.mapping.map(serializeEDMapping);
  }

  return result;
}

// =============================================================================
// Section 5: ElementDefinition Sub-Type Serializers
// =============================================================================

/**
 * Serialize ElementDefinitionSlicing.
 */
function serializeSlicing(
  slicing: ElementDefinitionSlicing,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', slicing.id);
  assignIfNotEmptyArray(result, 'extension', slicing.extension);

  if (slicing.discriminator && slicing.discriminator.length > 0) {
    result.discriminator = slicing.discriminator.map(serializeDiscriminator);
  }

  assignIfDefined(result, 'description', slicing.description);
  assignIfDefined(result, 'ordered', slicing.ordered);
  result.rules = slicing.rules;
  return result;
}

/**
 * Serialize SlicingDiscriminator.
 */
function serializeDiscriminator(
  disc: SlicingDiscriminator,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', disc.id);
  assignIfNotEmptyArray(result, 'extension', disc.extension);
  result.type = disc.type;
  result.path = disc.path;
  return result;
}

/**
 * Serialize ElementDefinitionBase.
 */
function serializeBase(
  base: ElementDefinitionBase,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', base.id);
  assignIfNotEmptyArray(result, 'extension', base.extension);
  result.path = base.path;
  result.min = base.min;
  result.max = base.max;
  return result;
}

/**
 * Serialize ElementDefinitionType.
 */
function serializeEDType(
  type: ElementDefinitionType,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', type.id);
  assignIfNotEmptyArray(result, 'extension', type.extension);
  result.code = type.code;
  assignIfNotEmptyArray(result, 'profile', type.profile);
  assignIfNotEmptyArray(result, 'targetProfile', type.targetProfile);
  assignIfNotEmptyArray(result, 'aggregation', type.aggregation);
  assignIfDefined(result, 'versioning', type.versioning);
  return result;
}

/**
 * Serialize ElementDefinitionConstraint.
 */
function serializeConstraint(
  constraint: ElementDefinitionConstraint,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', constraint.id);
  assignIfNotEmptyArray(result, 'extension', constraint.extension);
  result.key = constraint.key;
  assignIfDefined(result, 'requirements', constraint.requirements);
  result.severity = constraint.severity;
  result.human = constraint.human;
  assignIfDefined(result, 'expression', constraint.expression);
  assignIfDefined(result, 'xpath', constraint.xpath);
  assignIfDefined(result, 'source', constraint.source);
  return result;
}

/**
 * Serialize ElementDefinitionBinding.
 */
function serializeBinding(
  binding: ElementDefinitionBinding,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', binding.id);
  assignIfNotEmptyArray(result, 'extension', binding.extension);
  result.strength = binding.strength;
  assignIfDefined(result, 'description', binding.description);
  assignIfDefined(result, 'valueSet', binding.valueSet);
  return result;
}

/**
 * Serialize ElementDefinitionExample.
 *
 * The `value` field is a choice type stored as a `ChoiceValue` object.
 * This function restores it to the original JSON property name.
 */
function serializeExample(
  example: ElementDefinitionExample,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', example.id);
  assignIfNotEmptyArray(result, 'extension', example.extension);
  result.label = example.label;

  // Restore choice type value
  const choiceVal = example.value;
  if (choiceVal !== undefined && choiceVal !== null) {
    if (isChoiceValue(choiceVal)) {
      result[choiceVal.propertyName] = choiceVal.value;
      if (choiceVal.elementExtension !== undefined) {
        result[`_${choiceVal.propertyName}`] = choiceVal.elementExtension;
      }
    } else {
      // Fallback: if not a ChoiceValue, store as-is under a generic key
      result.value = choiceVal;
    }
  }

  return result;
}

/**
 * Serialize ElementDefinitionMapping.
 */
function serializeEDMapping(
  mapping: ElementDefinitionMapping,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  assignIfDefined(result, 'id', mapping.id);
  assignIfNotEmptyArray(result, 'extension', mapping.extension);
  result.identity = mapping.identity;
  assignIfDefined(result, 'language', mapping.language);
  result.map = mapping.map;
  assignIfDefined(result, 'comment', mapping.comment);
  return result;
}

// =============================================================================
// Section 6: Choice Type Serialization
// =============================================================================

/**
 * Check whether a value is a `ChoiceValue` object (duck typing).
 *
 * A ChoiceValue has: `typeName`, `value`, `propertyName`.
 */
function isChoiceValue(val: unknown): val is ChoiceValue {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.typeName === 'string' &&
    typeof obj.propertyName === 'string' &&
    'value' in obj
  );
}

/**
 * Serialize a choice type value onto the result object.
 *
 * If the value is a `ChoiceValue`, restores the original JSON property name
 * (e.g., `fixedString`, `patternCoding`). Also restores `_element` companion
 * if present.
 *
 * @param result - The target object to write properties onto
 * @param choiceVal - The choice type value (may be undefined, null, or ChoiceValue)
 */
function serializeChoiceValue(
  result: Record<string, unknown>,
  choiceVal: unknown,
): void {
  if (choiceVal === undefined || choiceVal === null) return;

  if (isChoiceValue(choiceVal)) {
    result[choiceVal.propertyName] = choiceVal.value;
    if (choiceVal.elementExtension !== undefined) {
      result[`_${choiceVal.propertyName}`] = choiceVal.elementExtension;
    }
  }
}

// =============================================================================
// Section 7: Utility Helpers
// =============================================================================

/**
 * Assign a value to the result object only if it is defined (not undefined).
 */
function assignIfDefined(
  result: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) {
    result[key] = value;
  }
}

/**
 * Assign an array to the result object only if it is defined and non-empty.
 */
function assignIfNotEmptyArray(
  result: Record<string, unknown>,
  key: string,
  value: unknown[] | undefined,
): void {
  if (value !== undefined && Array.isArray(value) && value.length > 0) {
    result[key] = value;
  }
}
