/**
 * fhir-terminology — Binding Validator
 *
 * Core logic for validating coded values against FHIR binding constraints.
 * Handles all coded element types: code, Coding, CodeableConcept, Quantity, string.
 *
 * @module fhir-terminology
 */

import type { BindingStrength } from '../model/index.js';
import type { TerminologyProvider } from '../provider/types.js';
import type { BindingValidationResult } from './types.js';
import { severityForBindingStrength, severityWhenNoProvider } from './binding-strength.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Binding constraint used by the validator.
 */
export interface BindingConstraintInput {
  readonly strength: BindingStrength;
  readonly valueSetUrl?: string;
}

/**
 * Validate a coded value against a binding constraint.
 *
 * @param value - The coded value (code string, Coding, CodeableConcept, Quantity).
 * @param binding - The binding constraint from the profile.
 * @param provider - Optional terminology provider for code validation.
 * @returns The binding validation result.
 */
export async function validateBinding(
  value: unknown,
  binding: BindingConstraintInput,
  provider: TerminologyProvider | undefined,
): Promise<BindingValidationResult> {
  // Example bindings are never validated
  if (binding.strength === 'example') {
    return { valid: true, severity: 'information', message: 'Example binding — no validation required.' };
  }

  // No ValueSet URL → can't validate
  if (!binding.valueSetUrl) {
    return { valid: true, severity: 'information', message: 'No ValueSet URL specified in binding.' };
  }

  // No provider → report based on strength
  if (!provider) {
    const severity = severityWhenNoProvider(binding.strength);
    if (!severity) {
      return { valid: true, severity: 'information', message: 'Terminology validation skipped.' };
    }
    return {
      valid: binding.strength !== 'required',
      severity,
      message: `Terminology validation skipped for ${binding.strength} binding to '${binding.valueSetUrl}'.`,
      valueSetUrl: binding.valueSetUrl,
    };
  }

  // Extract codes from the value
  const codes = extractCodedValues(value);
  if (codes.length === 0) {
    // No coded value to validate — valid by default
    return { valid: true, severity: 'information', message: 'No coded value found to validate.' };
  }

  // For CodeableConcept: at least one coding must match for required bindings
  const isCodeableConcept = isCodeableConceptValue(value);
  const results: BindingValidationResult[] = [];

  for (const { system, code, display } of codes) {
    const result = await validateSingleCode(system, code, display, binding, provider);
    results.push(result);
  }

  if (isCodeableConcept && binding.strength === 'required') {
    // At least one coding must be valid
    const anyValid = results.some((r) => r.valid);
    if (anyValid) {
      return { valid: true, severity: 'information', message: 'At least one coding is valid for required binding.' };
    }
    // All failed — return first failure
    return results[0] ?? { valid: false, severity: 'error', message: 'No valid coding found for required binding.' };
  }

  if (isCodeableConcept) {
    // For non-required: report worst result
    const invalid = results.find((r) => !r.valid);
    return invalid ?? results[0] ?? { valid: true, severity: 'information', message: 'CodeableConcept validated.' };
  }

  // Single code — return its result
  return results[0] ?? { valid: true, severity: 'information', message: 'No coded value to validate.' };
}

// =============================================================================
// Internal Helpers
// =============================================================================

interface CodeEntry {
  system: string;
  code: string;
  display?: string;
}

/**
 * Validate a single code against a binding using the provider.
 */
async function validateSingleCode(
  system: string,
  code: string,
  display: string | undefined,
  binding: BindingConstraintInput,
  provider: TerminologyProvider,
): Promise<BindingValidationResult> {
  try {
    const result = await provider.validateCode({
      system,
      code,
      valueSetUrl: binding.valueSetUrl,
      display,
    });

    if (result.result) {
      return {
        valid: true,
        severity: 'information',
        message: result.message ?? `Code '${code}' is valid in ValueSet '${binding.valueSetUrl}'.`,
        code,
        system,
        valueSetUrl: binding.valueSetUrl,
      };
    }

    const severity = severityForBindingStrength(binding.strength) ?? 'information';
    return {
      valid: false,
      severity,
      message: result.message ??
        `Code '${code}' from system '${system}' is not in ValueSet '${binding.valueSetUrl}'.`,
      code,
      system,
      valueSetUrl: binding.valueSetUrl,
    };
  } catch (err) {
    return {
      valid: false,
      severity: 'warning',
      message: `Terminology validation error for code '${code}': ${err instanceof Error ? err.message : String(err)}`,
      code,
      system,
      valueSetUrl: binding.valueSetUrl,
    };
  }
}

/**
 * Extract coded values from a FHIR value.
 *
 * Supports: string (code), Coding, CodeableConcept, Quantity.
 */
export function extractCodedValues(value: unknown): CodeEntry[] {
  if (value === null || value === undefined) return [];

  // Plain string → code primitive
  if (typeof value === 'string') {
    return [{ system: '', code: value }];
  }

  if (typeof value !== 'object') return [];

  const obj = value as Record<string, unknown>;

  // CodeableConcept — has coding array
  if (Array.isArray(obj['coding'])) {
    const entries: CodeEntry[] = [];
    for (const coding of obj['coding']) {
      if (coding && typeof coding === 'object' && typeof (coding as Record<string, unknown>)['code'] === 'string') {
        const c = coding as Record<string, unknown>;
        entries.push({
          system: typeof c['system'] === 'string' ? c['system'] : '',
          code: c['code'] as string,
          display: typeof c['display'] === 'string' ? c['display'] : undefined,
        });
      }
    }
    return entries;
  }

  // Coding object — has code (and optionally system)
  if (typeof obj['code'] === 'string') {
    return [{
      system: typeof obj['system'] === 'string' ? obj['system'] : '',
      code: obj['code'],
      display: typeof obj['display'] === 'string' ? obj['display'] : undefined,
    }];
  }

  return [];
}

/**
 * Check if a value looks like a CodeableConcept (has `coding` array).
 */
function isCodeableConceptValue(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') return false;
  return Array.isArray((value as Record<string, unknown>)['coding']);
}
