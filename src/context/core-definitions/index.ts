/**
 * fhir-context — Core Definitions Index
 *
 * Provides the list of core FHIR R4 StructureDefinition filenames
 * and a utility to load them from the `core-definitions/` directory.
 *
 * These definitions are extracted from the official FHIR R4 v4.0.1
 * specification (`profiles-resources.json` and `profiles-types.json`).
 *
 * @module fhir-context
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StructureDefinition } from '../../model/index.js';
import { parseFhirJson } from '../../parser/index.js';
import { LoaderError } from '../errors.js';

// =============================================================================
// Section 1: Core Definition Manifest
// =============================================================================

/**
 * Base resource types — the foundation of the FHIR type hierarchy.
 * These MUST be loaded first as other definitions depend on them.
 */
export const BASE_RESOURCES = [
  'Resource',
  'DomainResource',
  'Element',
  'BackboneElement',
  'Extension',
] as const;

/**
 * Primitive types — FHIR primitive data types.
 */
export const PRIMITIVE_TYPES = [
  'base64Binary', 'boolean', 'canonical', 'code', 'date', 'dateTime',
  'decimal', 'id', 'instant', 'integer', 'markdown', 'oid',
  'positiveInt', 'string', 'time', 'unsignedInt', 'uri', 'url', 'uuid',
  'xhtml',
] as const;

/**
 * Complex types — FHIR complex data types (non-resource).
 */
export const COMPLEX_TYPES = [
  'Address', 'Age', 'Annotation', 'Attachment', 'CodeableConcept', 'Coding',
  'ContactDetail', 'ContactPoint', 'Count', 'Distance', 'Dosage', 'Duration',
  'HumanName', 'Identifier', 'Meta', 'Money', 'Narrative', 'Period',
  'Quantity', 'Range', 'Ratio', 'Reference', 'SampledData', 'Signature',
  'Timing',
] as const;

/**
 * Core clinical resources — commonly used FHIR resource types.
 */
export const CORE_RESOURCES = [
  'AllergyIntolerance', 'Binary', 'Bundle', 'CarePlan', 'Claim',
  'CodeSystem', 'Condition', 'DiagnosticReport', 'DocumentReference',
  'Encounter', 'Immunization', 'Location', 'Medication', 'MedicationRequest',
  'Observation', 'Organization', 'Patient', 'Practitioner', 'Procedure',
  'Questionnaire', 'ServiceRequest', 'StructureDefinition', 'ValueSet',
] as const;

/**
 * All core definition filenames in dependency order:
 * base → primitives → complex types → resources.
 */
export const ALL_CORE_DEFINITIONS: readonly string[] = [
  ...BASE_RESOURCES,
  ...PRIMITIVE_TYPES,
  ...COMPLEX_TYPES,
  ...CORE_RESOURCES,
];

// =============================================================================
// Section 2: Loading Utilities
// =============================================================================

/**
 * Resolve the absolute path to the `core-definitions/` directory.
 *
 * Works both in ESM (via `import.meta.url`) and when a custom
 * `specDirectory` is provided.
 *
 * @param specDirectory - Optional override directory path
 * @returns Absolute path to the core definitions directory
 */
export function getCoreDefinitionsDir(specDirectory?: string): string {
  if (specDirectory) {
    return specDirectory;
  }
  // Default: same directory as this file
  const thisFile = fileURLToPath(import.meta.url);
  return dirname(thisFile);
}

/**
 * Load a single core StructureDefinition by name (synchronous).
 *
 * @param name - Definition name (e.g., `"Patient"`, `"string"`)
 * @param baseDir - Directory containing the JSON files
 * @returns Parsed StructureDefinition
 * @throws {@link LoaderError} if the file cannot be read or parsed
 */
export function loadCoreDefinitionSync(
  name: string,
  baseDir: string,
): StructureDefinition {
  const filePath = join(baseDir, `${name}.json`);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new LoaderError(
      `http://hl7.org/fhir/StructureDefinition/${name}`,
      'core-definitions',
      err as Error,
    );
  }

  const result = parseFhirJson(raw);
  if (!result.success) {
    const messages = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message)
      .join('; ');
    throw new LoaderError(
      `http://hl7.org/fhir/StructureDefinition/${name}`,
      'core-definitions',
      new Error(`Parse failed: ${messages}`),
    );
  }

  return result.data as StructureDefinition;
}

/**
 * Load a single core StructureDefinition by name (async).
 *
 * @param name - Definition name (e.g., `"Patient"`, `"string"`)
 * @param baseDir - Directory containing the JSON files
 * @returns Parsed StructureDefinition
 * @throws {@link LoaderError} if the file cannot be read or parsed
 */
export async function loadCoreDefinition(
  name: string,
  baseDir: string,
): Promise<StructureDefinition> {
  const filePath = join(baseDir, `${name}.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new LoaderError(
      `http://hl7.org/fhir/StructureDefinition/${name}`,
      'core-definitions',
      err as Error,
    );
  }

  const result = parseFhirJson(raw);
  if (!result.success) {
    const messages = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message)
      .join('; ');
    throw new LoaderError(
      `http://hl7.org/fhir/StructureDefinition/${name}`,
      'core-definitions',
      new Error(`Parse failed: ${messages}`),
    );
  }

  return result.data as StructureDefinition;
}

/**
 * Load all core definitions and return them as a Map.
 *
 * Loads in dependency order (base → primitives → complex → resources).
 *
 * @param specDirectory - Optional override directory path
 * @returns Map of canonical URL → StructureDefinition
 */
export async function loadAllCoreDefinitions(
  specDirectory?: string,
): Promise<Map<string, StructureDefinition>> {
  const baseDir = getCoreDefinitionsDir(specDirectory);
  const result = new Map<string, StructureDefinition>();

  for (const name of ALL_CORE_DEFINITIONS) {
    const sd = await loadCoreDefinition(name, baseDir);
    result.set(sd.url as string, sd);
  }

  return result;
}
