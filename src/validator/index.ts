/**
 * fhir-validator — Barrel Exports
 *
 * Re-exports all public types, interfaces, error classes, and helper
 * functions from the FHIR validator module.
 *
 * Public surface:
 * - Types: ValidationOptions, ValidationResult, ValidationIssue, etc.
 * - Errors: ValidatorError hierarchy
 * - Helpers: createValidationIssue, hasValidationErrors, etc.
 *
 * @module fhir-validator
 */

// ─── Types & Interfaces ───
export type {
  ValidationOptions,
  ValidationResult,
  ValidationIssue,
  ValidationIssueCode,
  ValidationContext,
} from './types.js';

// ─── Helper Functions ───
export {
  createValidationIssue,
  createValidationContext,
  resolveValidationOptions,
  hasValidationErrors,
  filterIssuesBySeverity,
  filterIssuesByCode,
} from './types.js';

// ─── Path Extractor ───
export {
  extractValues,
  pathExists,
  findChoiceTypeField,
  normalizeChoicePath,
  extractChoiceTypeSuffix,
} from './path-extractor.js';

// ─── Validation Rules ───
export {
  validateCardinality,
  validateRequired,
  validateType,
  validateChoiceType,
  inferFhirType,
  deepEqual,
  validateFixed,
  matchesPattern,
  validatePattern,
  extractReferenceType,
  validateReference,
} from './validation-rules.js';

// ─── Slicing Validator ───
export {
  validateSlicing,
  findMatchingSlice,
  matchesDiscriminator,
  isSliceOrderValid,
  extractValueAtPath,
  getSliceDiscriminatorValue,
  getSliceTypes,
} from './slicing-validator.js';

// ─── Structure Validator ───
export { StructureValidator } from './structure-validator.js';

// ─── Invariant Validator ───
export type { InvariantValidationOptions } from './invariant-validator.js';
export {
  validateInvariants,
  validateSingleInvariant,
  validateAllInvariants,
} from './invariant-validator.js';

// ─── Errors ───
export {
  ValidatorError,
  ProfileNotFoundError,
  ValidationFailedError,
} from './errors.js';
