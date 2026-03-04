/**
 * StructureDefinition & ElementDefinition Parser
 *
 * Dedicated parser for the most important resource type in Stage-1.
 * All downstream modules (fhir-context, fhir-profile, fhir-validator)
 * depend on correctly parsed StructureDefinitions.
 *
 * Architecture:
 * ```
 * parseStructureDefinition(obj, path)
 *   ├── top-level fields (url, name, status, kind, type, abstract, ...)
 *   ├── sub-types:
 *   │     ├── mapping[] → parseSDMapping()
 *   │     ├── context[] → parseSDContext()
 *   │     ├── snapshot  → parseSnapshot()  → element[] → parseElementDefinition()
 *   │     └── differential → parseDifferential() → element[] → parseElementDefinition()
 *   └── unknown property detection
 *
 * parseElementDefinition(obj, path)
 *   ├── basic fields (path, sliceName, min, max, ...)
 *   ├── sub-types:
 *   │     ├── slicing → parseSlicing() → discriminator[] → parseDiscriminator()
 *   │     ├── base → parseBase()
 *   │     ├── type[] → parseEDType()
 *   │     ├── constraint[] → parseConstraint()
 *   │     ├── binding → parseBinding()
 *   │     ├── example[] → parseExample()  ← contains choice type
 *   │     └── mapping[] → parseEDMapping()
 *   └── choice type fields:
 *         ├── defaultValue[x] → extractChoiceValue()
 *         ├── fixed[x] → extractChoiceValue()
 *         ├── pattern[x] → extractChoiceValue()
 *         ├── minValue[x] → extractChoiceValue()
 *         └── maxValue[x] → extractChoiceValue()
 * ```
 *
 * @module fhir-parser
 */

import type { StructureDefinition } from '../model/structure-definition.js';
import type {
  StructureDefinitionMapping,
  StructureDefinitionContext,
  StructureDefinitionSnapshot,
  StructureDefinitionDifferential,
} from '../model/structure-definition.js';
import type { ElementDefinition } from '../model/element-definition.js';
import type {
  ElementDefinitionSlicing,
  SlicingDiscriminator,
  ElementDefinitionBase,
  ElementDefinitionType,
  ElementDefinitionConstraint,
  ElementDefinitionBinding,
  ElementDefinitionExample,
  ElementDefinitionMapping,
} from '../model/element-definition.js';

import type { ParseResult, ParseIssue } from './parse-error.js';
import { createIssue, parseSuccess, parseFailure, hasErrors } from './parse-error.js';
import { isPlainObject, pathAppend, pathIndex } from './json-parser.js';
import { extractAllChoiceValues, getChoiceFields } from './choice-type-parser.js';

// =============================================================================
// Section 1: Known Property Sets
// =============================================================================

const STRUCTURE_DEFINITION_PROPERTIES = new Set([
  'resourceType',
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension',
  'url',
  'identifier',
  'version',
  'name',
  'title',
  'status',
  'experimental',
  'date',
  'publisher',
  'contact',
  'description',
  'useContext',
  'jurisdiction',
  'purpose',
  'copyright',
  'keyword',
  'fhirVersion',
  'mapping',
  'kind',
  'abstract',
  'context',
  'contextInvariant',
  'type',
  'baseDefinition',
  'derivation',
  'snapshot',
  'differential',
]);

const ELEMENT_DEFINITION_PROPERTIES = new Set([
  'id',
  'extension',
  'modifierExtension',
  'path',
  'representation',
  'sliceName',
  'sliceIsConstraining',
  'label',
  'code',
  'slicing',
  'short',
  'definition',
  'comment',
  'requirements',
  'alias',
  'min',
  'max',
  'base',
  'contentReference',
  'type',
  'meaningWhenMissing',
  'orderMeaning',
  'example',
  'maxLength',
  'condition',
  'constraint',
  'mustSupport',
  'isModifier',
  'isModifierReason',
  'isSummary',
  'binding',
  'mapping',
  // choice type prefixes handled by choice-type-parser
]);

// =============================================================================
// Section 2: ElementDefinition Sub-Type Parsers
// =============================================================================

/**
 * Parse a SlicingDiscriminator object.
 */
function parseDiscriminator(
  obj: Record<string, unknown>,
  path: string,
): { result: SlicingDiscriminator; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.type !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'discriminator.type must be a string', pathAppend(path, 'type')));
  }
  if (typeof obj.path !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'discriminator.path must be a string', pathAppend(path, 'path')));
  }

  const result: SlicingDiscriminator = {
    type: (obj.type as SlicingDiscriminator['type']) ?? ('value' as SlicingDiscriminator['type']),
    path: (obj.path as SlicingDiscriminator['path']) ?? ('' as SlicingDiscriminator['path']),
    ...(obj.id !== undefined && { id: obj.id as SlicingDiscriminator['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as SlicingDiscriminator['extension'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionSlicing object.
 */
function parseSlicing(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionSlicing; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  // Parse discriminator array
  let discriminator: SlicingDiscriminator[] | undefined;
  if (obj.discriminator !== undefined) {
    if (!Array.isArray(obj.discriminator)) {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'slicing.discriminator must be an array', pathAppend(path, 'discriminator')));
    } else {
      discriminator = [];
      for (let i = 0; i < obj.discriminator.length; i++) {
        const item = obj.discriminator[i];
        if (isPlainObject(item)) {
          const parsed = parseDiscriminator(item, pathIndex(pathAppend(path, 'discriminator'), i));
          discriminator.push(parsed.result);
          issues.push(...parsed.issues);
        } else {
          issues.push(createIssue('error', 'INVALID_STRUCTURE', `discriminator[${i}] must be an object`, pathIndex(pathAppend(path, 'discriminator'), i)));
        }
      }
    }
  }

  if (typeof obj.rules !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'slicing.rules must be a string', pathAppend(path, 'rules')));
  }

  const result: ElementDefinitionSlicing = {
    rules: (obj.rules as ElementDefinitionSlicing['rules']) ?? ('open' as ElementDefinitionSlicing['rules']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionSlicing['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionSlicing['extension'] }),
    ...(discriminator !== undefined && { discriminator }),
    ...(obj.description !== undefined && { description: obj.description as ElementDefinitionSlicing['description'] }),
    ...(obj.ordered !== undefined && { ordered: obj.ordered as ElementDefinitionSlicing['ordered'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionBase object.
 */
function parseBase(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionBase; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.path !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'base.path must be a string', pathAppend(path, 'path')));
  }
  if (typeof obj.min !== 'number') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'base.min must be a number', pathAppend(path, 'min')));
  }
  if (typeof obj.max !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'base.max must be a string', pathAppend(path, 'max')));
  }

  const result: ElementDefinitionBase = {
    path: (obj.path as ElementDefinitionBase['path']) ?? ('' as ElementDefinitionBase['path']),
    min: (obj.min as ElementDefinitionBase['min']) ?? (0 as ElementDefinitionBase['min']),
    max: (obj.max as ElementDefinitionBase['max']) ?? ('*' as ElementDefinitionBase['max']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionBase['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionBase['extension'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionType object.
 */
function parseEDType(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionType; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.code !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'type.code must be a string', pathAppend(path, 'code')));
  }

  const result: ElementDefinitionType = {
    code: (obj.code as ElementDefinitionType['code']) ?? ('' as ElementDefinitionType['code']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionType['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionType['extension'] }),
    ...(obj.profile !== undefined && { profile: obj.profile as ElementDefinitionType['profile'] }),
    ...(obj.targetProfile !== undefined && { targetProfile: obj.targetProfile as ElementDefinitionType['targetProfile'] }),
    ...(obj.aggregation !== undefined && { aggregation: obj.aggregation as ElementDefinitionType['aggregation'] }),
    ...(obj.versioning !== undefined && { versioning: obj.versioning as ElementDefinitionType['versioning'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionConstraint object.
 */
function parseConstraint(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionConstraint; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.key !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'constraint.key must be a string', pathAppend(path, 'key')));
  }
  if (typeof obj.severity !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'constraint.severity must be a string', pathAppend(path, 'severity')));
  }
  if (typeof obj.human !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'constraint.human must be a string', pathAppend(path, 'human')));
  }

  const result: ElementDefinitionConstraint = {
    key: (obj.key as ElementDefinitionConstraint['key']) ?? ('' as ElementDefinitionConstraint['key']),
    severity: (obj.severity as ElementDefinitionConstraint['severity']) ?? ('error' as ElementDefinitionConstraint['severity']),
    human: (obj.human as ElementDefinitionConstraint['human']) ?? ('' as ElementDefinitionConstraint['human']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionConstraint['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionConstraint['extension'] }),
    ...(obj.requirements !== undefined && { requirements: obj.requirements as ElementDefinitionConstraint['requirements'] }),
    ...(obj.expression !== undefined && { expression: obj.expression as ElementDefinitionConstraint['expression'] }),
    ...(obj.xpath !== undefined && { xpath: obj.xpath as ElementDefinitionConstraint['xpath'] }),
    ...(obj.source !== undefined && { source: obj.source as ElementDefinitionConstraint['source'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionBinding object.
 */
function parseBinding(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionBinding; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.strength !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'binding.strength must be a string', pathAppend(path, 'strength')));
  }

  const result: ElementDefinitionBinding = {
    strength: (obj.strength as ElementDefinitionBinding['strength']) ?? ('example' as ElementDefinitionBinding['strength']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionBinding['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionBinding['extension'] }),
    ...(obj.description !== undefined && { description: obj.description as ElementDefinitionBinding['description'] }),
    ...(obj.valueSet !== undefined && { valueSet: obj.valueSet as ElementDefinitionBinding['valueSet'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionExample object (contains choice type value[x]).
 */
function parseExample(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionExample; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.label !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'example.label must be a string', pathAppend(path, 'label')));
  }

  // Extract choice type value[x] from example
  const exampleChoiceFields = getChoiceFields('ElementDefinitionExample');
  const { results: choiceResults, issues: choiceIssues } = extractAllChoiceValues(obj, exampleChoiceFields, path);
  issues.push(...choiceIssues);

  const choiceValue = choiceResults.get('value');

  const result: ElementDefinitionExample = {
    label: (obj.label as ElementDefinitionExample['label']) ?? ('' as ElementDefinitionExample['label']),
    value: choiceValue ?? undefined,
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionExample['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionExample['extension'] }),
  };

  return { result, issues };
}

/**
 * Parse an ElementDefinitionMapping object.
 */
function parseEDMapping(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinitionMapping; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.identity !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'mapping.identity must be a string', pathAppend(path, 'identity')));
  }
  if (typeof obj.map !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'mapping.map must be a string', pathAppend(path, 'map')));
  }

  const result: ElementDefinitionMapping = {
    identity: (obj.identity as ElementDefinitionMapping['identity']) ?? ('' as ElementDefinitionMapping['identity']),
    map: (obj.map as ElementDefinitionMapping['map']) ?? ('' as ElementDefinitionMapping['map']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinitionMapping['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinitionMapping['extension'] }),
    ...(obj.language !== undefined && { language: obj.language as ElementDefinitionMapping['language'] }),
    ...(obj.comment !== undefined && { comment: obj.comment as ElementDefinitionMapping['comment'] }),
  };

  return { result, issues };
}

// =============================================================================
// Section 3: Helper — parse array of sub-type objects
// =============================================================================

function parseObjectArray<T>(
  arr: unknown,
  path: string,
  propertyName: string,
  parser: (obj: Record<string, unknown>, path: string) => { result: T; issues: ParseIssue[] },
): { result: T[] | undefined; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (arr === undefined) return { result: undefined, issues };

  const arrayPath = pathAppend(path, propertyName);

  if (!Array.isArray(arr)) {
    issues.push(createIssue('error', 'INVALID_STRUCTURE', `"${propertyName}" must be an array`, arrayPath));
    return { result: undefined, issues };
  }

  const results: T[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const itemPath = pathIndex(arrayPath, i);
    if (isPlainObject(item)) {
      const parsed = parser(item, itemPath);
      results.push(parsed.result);
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', `${propertyName}[${i}] must be an object`, itemPath));
    }
  }

  return { result: results.length > 0 ? results : undefined, issues };
}

// =============================================================================
// Section 4: ElementDefinition Parser
// =============================================================================

/**
 * Parse an ElementDefinition JSON object.
 *
 * ElementDefinition is the most complex data type in FHIR,
 * with ~37 fields and 8 sub-types.
 */
export function parseElementDefinition(
  obj: Record<string, unknown>,
  path: string,
): { result: ElementDefinition; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  // --- Required field: path ---
  if (typeof obj.path !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'ElementDefinition.path must be a string', pathAppend(path, 'path')));
  }

  // --- Parse sub-types ---
  let slicing: ElementDefinitionSlicing | undefined;
  if (obj.slicing !== undefined) {
    if (isPlainObject(obj.slicing)) {
      const parsed = parseSlicing(obj.slicing, pathAppend(path, 'slicing'));
      slicing = parsed.result;
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'slicing must be an object', pathAppend(path, 'slicing')));
    }
  }

  let base: ElementDefinitionBase | undefined;
  if (obj.base !== undefined) {
    if (isPlainObject(obj.base)) {
      const parsed = parseBase(obj.base, pathAppend(path, 'base'));
      base = parsed.result;
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'base must be an object', pathAppend(path, 'base')));
    }
  }

  let binding: ElementDefinitionBinding | undefined;
  if (obj.binding !== undefined) {
    if (isPlainObject(obj.binding)) {
      const parsed = parseBinding(obj.binding, pathAppend(path, 'binding'));
      binding = parsed.result;
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'binding must be an object', pathAppend(path, 'binding')));
    }
  }

  // --- Parse array sub-types ---
  const { result: typeArr, issues: typeIssues } = parseObjectArray(obj.type, path, 'type', parseEDType);
  issues.push(...typeIssues);

  const { result: constraintArr, issues: constraintIssues } = parseObjectArray(obj.constraint, path, 'constraint', parseConstraint);
  issues.push(...constraintIssues);

  const { result: exampleArr, issues: exampleIssues } = parseObjectArray(obj.example, path, 'example', parseExample);
  issues.push(...exampleIssues);

  const { result: mappingArr, issues: mappingIssues } = parseObjectArray(obj.mapping, path, 'mapping', parseEDMapping);
  issues.push(...mappingIssues);

  // --- Extract choice type fields ---
  const edChoiceFields = getChoiceFields('ElementDefinition');
  const { results: choiceResults, issues: choiceIssues, consumedKeys } = extractAllChoiceValues(obj, edChoiceFields, path);
  issues.push(...choiceIssues);
  const consumedKeySet = new Set(consumedKeys);

  // --- Detect unknown properties ---
  for (const key of Object.keys(obj)) {
    if (ELEMENT_DEFINITION_PROPERTIES.has(key)) continue;
    if (key.startsWith('_')) continue; // _element companions
    if (consumedKeySet.has(key)) continue;
    issues.push(createIssue('warning', 'UNEXPECTED_PROPERTY', `Unknown property "${key}" in ElementDefinition`, pathAppend(path, key)));
  }

  // --- Assemble result ---
  const result: ElementDefinition = {
    path: (obj.path as ElementDefinition['path']) ?? ('' as ElementDefinition['path']),
    ...(obj.id !== undefined && { id: obj.id as ElementDefinition['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as ElementDefinition['extension'] }),
    ...(obj.modifierExtension !== undefined && { modifierExtension: obj.modifierExtension as ElementDefinition['modifierExtension'] }),
    ...(obj.representation !== undefined && { representation: obj.representation as ElementDefinition['representation'] }),
    ...(obj.sliceName !== undefined && { sliceName: obj.sliceName as ElementDefinition['sliceName'] }),
    ...(obj.sliceIsConstraining !== undefined && { sliceIsConstraining: obj.sliceIsConstraining as ElementDefinition['sliceIsConstraining'] }),
    ...(obj.label !== undefined && { label: obj.label as ElementDefinition['label'] }),
    ...(obj.code !== undefined && { code: obj.code as ElementDefinition['code'] }),
    ...(slicing !== undefined && { slicing }),
    ...(obj.short !== undefined && { short: obj.short as ElementDefinition['short'] }),
    ...(obj.definition !== undefined && { definition: obj.definition as ElementDefinition['definition'] }),
    ...(obj.comment !== undefined && { comment: obj.comment as ElementDefinition['comment'] }),
    ...(obj.requirements !== undefined && { requirements: obj.requirements as ElementDefinition['requirements'] }),
    ...(obj.alias !== undefined && { alias: obj.alias as ElementDefinition['alias'] }),
    ...(obj.min !== undefined && { min: obj.min as ElementDefinition['min'] }),
    ...(obj.max !== undefined && { max: obj.max as ElementDefinition['max'] }),
    ...(base !== undefined && { base }),
    ...(obj.contentReference !== undefined && { contentReference: obj.contentReference as ElementDefinition['contentReference'] }),
    ...(typeArr !== undefined && { type: typeArr }),
    ...(choiceResults.has('defaultValue') && { defaultValue: choiceResults.get('defaultValue') }),
    ...(obj.meaningWhenMissing !== undefined && { meaningWhenMissing: obj.meaningWhenMissing as ElementDefinition['meaningWhenMissing'] }),
    ...(obj.orderMeaning !== undefined && { orderMeaning: obj.orderMeaning as ElementDefinition['orderMeaning'] }),
    ...(choiceResults.has('fixed') && { fixed: choiceResults.get('fixed') }),
    ...(choiceResults.has('pattern') && { pattern: choiceResults.get('pattern') }),
    ...(exampleArr !== undefined && { example: exampleArr }),
    ...(choiceResults.has('minValue') && { minValue: choiceResults.get('minValue') }),
    ...(choiceResults.has('maxValue') && { maxValue: choiceResults.get('maxValue') }),
    ...(obj.maxLength !== undefined && { maxLength: obj.maxLength as ElementDefinition['maxLength'] }),
    ...(obj.condition !== undefined && { condition: obj.condition as ElementDefinition['condition'] }),
    ...(constraintArr !== undefined && { constraint: constraintArr }),
    ...(obj.mustSupport !== undefined && { mustSupport: obj.mustSupport as ElementDefinition['mustSupport'] }),
    ...(obj.isModifier !== undefined && { isModifier: obj.isModifier as ElementDefinition['isModifier'] }),
    ...(obj.isModifierReason !== undefined && { isModifierReason: obj.isModifierReason as ElementDefinition['isModifierReason'] }),
    ...(obj.isSummary !== undefined && { isSummary: obj.isSummary as ElementDefinition['isSummary'] }),
    ...(binding !== undefined && { binding }),
    ...(mappingArr !== undefined && { mapping: mappingArr }),
  };

  return { result, issues };
}

// =============================================================================
// Section 5: StructureDefinition Sub-Type Parsers
// =============================================================================

/**
 * Parse a StructureDefinitionMapping object.
 */
function parseSDMapping(
  obj: Record<string, unknown>,
  path: string,
): { result: StructureDefinitionMapping; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.identity !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'mapping.identity must be a string', pathAppend(path, 'identity')));
  }

  const result: StructureDefinitionMapping = {
    identity: (obj.identity as StructureDefinitionMapping['identity']) ?? ('' as StructureDefinitionMapping['identity']),
    ...(obj.id !== undefined && { id: obj.id as StructureDefinitionMapping['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as StructureDefinitionMapping['extension'] }),
    ...(obj.modifierExtension !== undefined && { modifierExtension: obj.modifierExtension as StructureDefinitionMapping['modifierExtension'] }),
    ...(obj.uri !== undefined && { uri: obj.uri as StructureDefinitionMapping['uri'] }),
    ...(obj.name !== undefined && { name: obj.name as StructureDefinitionMapping['name'] }),
    ...(obj.comment !== undefined && { comment: obj.comment as StructureDefinitionMapping['comment'] }),
  };

  return { result, issues };
}

/**
 * Parse a StructureDefinitionContext object.
 */
function parseSDContext(
  obj: Record<string, unknown>,
  path: string,
): { result: StructureDefinitionContext; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (typeof obj.type !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'context.type must be a string', pathAppend(path, 'type')));
  }
  if (typeof obj.expression !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'context.expression must be a string', pathAppend(path, 'expression')));
  }

  const result: StructureDefinitionContext = {
    type: (obj.type as StructureDefinitionContext['type']) ?? ('element' as StructureDefinitionContext['type']),
    expression: (obj.expression as StructureDefinitionContext['expression']) ?? ('' as StructureDefinitionContext['expression']),
    ...(obj.id !== undefined && { id: obj.id as StructureDefinitionContext['id'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as StructureDefinitionContext['extension'] }),
    ...(obj.modifierExtension !== undefined && { modifierExtension: obj.modifierExtension as StructureDefinitionContext['modifierExtension'] }),
  };

  return { result, issues };
}

/**
 * Parse a snapshot or differential object containing element[].
 */
function parseElementContainer(
  obj: Record<string, unknown>,
  path: string,
): { result: { element: ElementDefinition[]; id?: string; extension?: unknown[]; modifierExtension?: unknown[] }; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (!Array.isArray(obj.element)) {
    issues.push(createIssue('error', 'INVALID_STRUCTURE', 'element must be an array', pathAppend(path, 'element')));
    return {
      result: {
        element: [],
        ...(obj.id !== undefined && { id: obj.id as string }),
      },
      issues,
    };
  }

  const elements: ElementDefinition[] = [];
  for (let i = 0; i < obj.element.length; i++) {
    const item = obj.element[i];
    const itemPath = pathIndex(pathAppend(path, 'element'), i);
    if (isPlainObject(item)) {
      const parsed = parseElementDefinition(item, itemPath);
      elements.push(parsed.result);
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', `element[${i}] must be an object`, itemPath));
    }
  }

  const result = {
    element: elements,
    ...(obj.id !== undefined && { id: obj.id as string }),
    ...(obj.extension !== undefined && { extension: obj.extension as unknown[] }),
    ...(obj.modifierExtension !== undefined && { modifierExtension: obj.modifierExtension as unknown[] }),
  };

  return { result, issues };
}

// =============================================================================
// Section 6: StructureDefinition Parser — Public API
// =============================================================================

/**
 * Parse a StructureDefinition JSON object.
 *
 * This is the most important parse function in Stage-1. All downstream
 * modules (fhir-context, fhir-profile, fhir-validator) depend on
 * correctly parsed StructureDefinitions.
 *
 * @param obj - A parsed JSON object (already validated as having resourceType = "StructureDefinition")
 * @param path - Current JSON path (for error reporting)
 */
export function parseStructureDefinition(
  obj: Record<string, unknown>,
  path: string,
): ParseResult<StructureDefinition> {
  const issues: ParseIssue[] = [];

  // --- Validate required fields ---
  if (typeof obj.url !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.url is required and must be a string', pathAppend(path, 'url')));
  }
  if (typeof obj.name !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.name is required and must be a string', pathAppend(path, 'name')));
  }
  if (typeof obj.status !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.status is required and must be a string', pathAppend(path, 'status')));
  }
  if (typeof obj.kind !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.kind is required and must be a string', pathAppend(path, 'kind')));
  }
  if (typeof obj.abstract !== 'boolean') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.abstract is required and must be a boolean', pathAppend(path, 'abstract')));
  }
  if (typeof obj.type !== 'string') {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE', 'StructureDefinition.type is required and must be a string', pathAppend(path, 'type')));
  }

  // --- Parse sub-types ---
  const { result: mappingArr, issues: mappingIssues } = parseObjectArray(obj.mapping, path, 'mapping', parseSDMapping);
  issues.push(...mappingIssues);

  const { result: contextArr, issues: contextIssues } = parseObjectArray(obj.context, path, 'context', parseSDContext);
  issues.push(...contextIssues);

  // --- Parse snapshot ---
  let snapshot: StructureDefinitionSnapshot | undefined;
  if (obj.snapshot !== undefined) {
    if (isPlainObject(obj.snapshot)) {
      const parsed = parseElementContainer(obj.snapshot, pathAppend(path, 'snapshot'));
      snapshot = parsed.result as StructureDefinitionSnapshot;
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'snapshot must be an object', pathAppend(path, 'snapshot')));
    }
  }

  // --- Parse differential ---
  let differential: StructureDefinitionDifferential | undefined;
  if (obj.differential !== undefined) {
    if (isPlainObject(obj.differential)) {
      const parsed = parseElementContainer(obj.differential, pathAppend(path, 'differential'));
      differential = parsed.result as StructureDefinitionDifferential;
      issues.push(...parsed.issues);
    } else {
      issues.push(createIssue('error', 'INVALID_STRUCTURE', 'differential must be an object', pathAppend(path, 'differential')));
    }
  }

  // --- Detect unknown properties ---
  for (const key of Object.keys(obj)) {
    if (STRUCTURE_DEFINITION_PROPERTIES.has(key)) continue;
    if (key.startsWith('_')) continue; // _element companions
    issues.push(createIssue('warning', 'UNEXPECTED_PROPERTY', `Unknown property "${key}" in StructureDefinition`, pathAppend(path, key)));
  }

  // --- Assemble result ---
  const sd: StructureDefinition = {
    resourceType: 'StructureDefinition',
    url: (obj.url as StructureDefinition['url']) ?? ('' as StructureDefinition['url']),
    name: (obj.name as StructureDefinition['name']) ?? ('' as StructureDefinition['name']),
    status: (obj.status as StructureDefinition['status']) ?? ('unknown' as StructureDefinition['status']),
    kind: (obj.kind as StructureDefinition['kind']) ?? ('resource' as StructureDefinition['kind']),
    abstract: (obj.abstract as StructureDefinition['abstract']) ?? false,
    type: (obj.type as StructureDefinition['type']) ?? ('' as StructureDefinition['type']),
    // Optional Resource fields
    ...(obj.id !== undefined && { id: obj.id as StructureDefinition['id'] }),
    ...(obj.meta !== undefined && { meta: obj.meta as StructureDefinition['meta'] }),
    ...(obj.implicitRules !== undefined && { implicitRules: obj.implicitRules as StructureDefinition['implicitRules'] }),
    ...(obj.language !== undefined && { language: obj.language as StructureDefinition['language'] }),
    ...(obj.text !== undefined && { text: obj.text as StructureDefinition['text'] }),
    ...(obj.contained !== undefined && { contained: obj.contained as StructureDefinition['contained'] }),
    ...(obj.extension !== undefined && { extension: obj.extension as StructureDefinition['extension'] }),
    ...(obj.modifierExtension !== undefined && { modifierExtension: obj.modifierExtension as StructureDefinition['modifierExtension'] }),
    // Optional metadata fields
    ...(obj.identifier !== undefined && { identifier: obj.identifier as StructureDefinition['identifier'] }),
    ...(obj.version !== undefined && { version: obj.version as StructureDefinition['version'] }),
    ...(obj.title !== undefined && { title: obj.title as StructureDefinition['title'] }),
    ...(obj.experimental !== undefined && { experimental: obj.experimental as StructureDefinition['experimental'] }),
    ...(obj.date !== undefined && { date: obj.date as StructureDefinition['date'] }),
    ...(obj.publisher !== undefined && { publisher: obj.publisher as StructureDefinition['publisher'] }),
    ...(obj.contact !== undefined && { contact: obj.contact as StructureDefinition['contact'] }),
    ...(obj.description !== undefined && { description: obj.description as StructureDefinition['description'] }),
    ...(obj.useContext !== undefined && { useContext: obj.useContext as StructureDefinition['useContext'] }),
    ...(obj.jurisdiction !== undefined && { jurisdiction: obj.jurisdiction as StructureDefinition['jurisdiction'] }),
    ...(obj.purpose !== undefined && { purpose: obj.purpose as StructureDefinition['purpose'] }),
    ...(obj.copyright !== undefined && { copyright: obj.copyright as StructureDefinition['copyright'] }),
    ...(obj.keyword !== undefined && { keyword: obj.keyword as StructureDefinition['keyword'] }),
    ...(obj.fhirVersion !== undefined && { fhirVersion: obj.fhirVersion as StructureDefinition['fhirVersion'] }),
    // Sub-types
    ...(mappingArr !== undefined && { mapping: mappingArr }),
    ...(contextArr !== undefined && { context: contextArr }),
    ...(obj.contextInvariant !== undefined && { contextInvariant: obj.contextInvariant as StructureDefinition['contextInvariant'] }),
    ...(obj.baseDefinition !== undefined && { baseDefinition: obj.baseDefinition as StructureDefinition['baseDefinition'] }),
    ...(obj.derivation !== undefined && { derivation: obj.derivation as StructureDefinition['derivation'] }),
    ...(snapshot !== undefined && { snapshot }),
    ...(differential !== undefined && { differential }),
  };

  if (hasErrors(issues)) {
    return parseFailure<StructureDefinition>(issues);
  }

  return parseSuccess(sd, issues);
}
