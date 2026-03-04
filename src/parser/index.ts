/**
 * `fhir-parser` — Public API
 *
 * Unified exports for the FHIR JSON parsing and serialization module.
 * Internal helpers (primitive merging, choice extraction, validation) are
 * intentionally kept private.
 *
 * @packageDocumentation
 */

// --- Parse error types & utilities ---
export type { ParseSeverity, ParseErrorCode, ParseIssue, ParseResult } from './parse-error.js';
export { parseSuccess, parseFailure, createIssue, hasErrors } from './parse-error.js';

// --- JSON parser (generic entry point) ---
export { parseFhirJson, parseFhirObject } from './json-parser.js';

// --- StructureDefinition parser ---
export { parseStructureDefinition, parseElementDefinition } from './structure-definition-parser.js';

// --- Serializer ---
export { serializeToFhirJson, serializeToFhirObject } from './serializer.js';

// --- Choice type types (needed by consumers for type narrowing) ---
export type { ChoiceValue, ChoiceTypeField } from './choice-type-parser.js';
