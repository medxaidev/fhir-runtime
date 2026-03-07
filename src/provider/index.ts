/**
 * fhir-provider — Barrel Exports
 *
 * Re-exports all public types, interfaces, and implementations from
 * the FHIR provider module.
 *
 * Public surface:
 * - Types: TerminologyProvider, ReferenceResolver, OperationOutcome, etc.
 * - NoOp implementations: NoOpTerminologyProvider, NoOpReferenceResolver
 * - Builders: buildOperationOutcome, buildOperationOutcomeFromParse, buildOperationOutcomeFromSnapshot
 *
 * @module fhir-provider
 */

// ─── Types & Interfaces ───
export type {
  TerminologyProvider,
  ValidateCodeParams,
  ValidateCodeResult,
  ExpandValueSetParams,
  ValueSetExpansion,
  ValueSetExpansionContains,
  LookupCodeParams,
  LookupCodeResult,
  ReferenceResolver,
  OperationOutcome,
  OperationOutcomeIssue,
  OperationOutcomeIssueType,
} from './types.js';

// ─── NoOp Implementations ───
export { NoOpTerminologyProvider } from './noop-terminology-provider.js';
export { NoOpReferenceResolver } from './noop-reference-resolver.js';

// ─── OperationOutcome Builders ───
export {
  buildOperationOutcome,
  buildOperationOutcomeFromParse,
  buildOperationOutcomeFromSnapshot,
} from './operation-outcome-builder.js';
