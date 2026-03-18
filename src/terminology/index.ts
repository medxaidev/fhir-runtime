/**
 * fhir-terminology — Barrel Export
 *
 * Terminology binding validation module for FHIR R4.
 *
 * @module fhir-terminology
 */

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  CodeSystemDefinition,
  CodeSystemConcept,
  ValueSetDefinition,
  ValueSetCompose,
  ValueSetComposeInclude,
  ValueSetComposeConcept,
  ValueSetComposeFilter,
  ValueSetExpansionDef,
  ValueSetExpansionContainsDef,
  BindingValidationResult,
} from './types.js';

// ─── Binding Validator ──────────────────────────────────────────────────────
export { validateBinding, extractCodedValues } from './binding-validator.js';
export type { BindingConstraintInput } from './binding-validator.js';

// ─── Binding Strength ───────────────────────────────────────────────────────
export {
  severityForBindingStrength,
  severityWhenNoProvider,
  requiresValidation,
  bindingStrengthDescription,
} from './binding-strength.js';

// ─── Registries ─────────────────────────────────────────────────────────────
export { CodeSystemRegistry } from './codesystem-registry.js';
export { ValueSetRegistry } from './valueset-registry.js';

// ─── ValueSet Membership ────────────────────────────────────────────────────
export { isCodeInValueSet } from './valueset-membership.js';

// ─── InMemoryTerminologyProvider ────────────────────────────────────────
export { InMemoryTerminologyProvider } from './inmemory-terminology-provider.js';

// ─── Concept Hierarchy Extractor (v0.11.0) ─────────────────────────────
export type { ConceptRow } from './concept-hierarchy-extractor.js';
export { flattenConceptHierarchy } from './concept-hierarchy-extractor.js';
