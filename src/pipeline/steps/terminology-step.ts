/**
 * fhir-pipeline — TerminologyValidationStep
 *
 * Validates coded elements against their declared bindings using
 * the {@link TerminologyProvider} from the pipeline context.
 *
 * If no terminology provider is available, the step is skipped.
 *
 * @module fhir-pipeline
 */

import type { CanonicalProfile, Resource } from '../../model/index.js';
import type { ValidationIssue } from '../../validator/types.js';
import { createValidationIssue } from '../../validator/types.js';
import { extractValues } from '../../validator/path-extractor.js';
import type { ValidationStep, PipelineContext } from '../types.js';

// =============================================================================
// TerminologyValidationStep
// =============================================================================

/**
 * Pipeline step that validates coded element bindings via a TerminologyProvider.
 *
 * Iterates over profile elements that have a binding constraint and validates
 * coded values against the bound ValueSet using the provider's `validateCode()`.
 *
 * Binding strength determines severity:
 * - `required` → error
 * - `extensible` → warning
 * - `preferred` / `example` → information
 */
export class TerminologyValidationStep implements ValidationStep {
  readonly name = 'terminology';
  readonly priority = 20;

  shouldRun(_resource: Resource, _profile: CanonicalProfile): boolean {
    return true;
  }

  async validate(
    resource: Resource,
    profile: CanonicalProfile,
    context: PipelineContext,
  ): Promise<ValidationIssue[]> {
    const provider = context.terminologyProvider;
    if (!provider) {
      return [];
    }

    const issues: ValidationIssue[] = [];

    for (const element of profile.elements.values()) {
      if (element.path === profile.type) continue;
      if (!element.binding) continue;
      if (!element.binding.valueSetUrl) continue;

      const values = extractValues(
        resource as unknown as Record<string, unknown>,
        element.path,
      );

      for (const value of values) {
        const codes = extractCodes(value);
        for (const { system, code, display } of codes) {
          try {
            const result = await provider.validateCode({
              system,
              code,
              valueSetUrl: element.binding.valueSetUrl,
              display,
            });

            if (!result.result) {
              const severity = bindingSeverity(element.binding.strength);
              issues.push(
                createValidationIssue(
                  severity,
                  'TYPE_MISMATCH',
                  `Code '${code}' from system '${system}' is not valid in ValueSet '${element.binding.valueSetUrl}'` +
                  (result.message ? `: ${result.message}` : ''),
                  {
                    path: element.path,
                    diagnostics: `Binding strength: ${element.binding.strength}`,
                  },
                ),
              );
            }
          } catch {
            issues.push(
              createValidationIssue(
                'warning',
                'INTERNAL_ERROR',
                `Terminology validation failed for code '${code}' at '${element.path}'`,
                { path: element.path },
              ),
            );
          }
        }
      }
    }

    return issues;
  }
}

// =============================================================================
// Helpers
// =============================================================================

interface CodeEntry {
  system: string;
  code: string;
  display?: string;
}

/**
 * Extract code entries from a FHIR value.
 *
 * Supports:
 * - Plain string (code type) → system='', code=value
 * - Coding object → { system, code, display }
 * - CodeableConcept → extract from coding array
 */
function extractCodes(value: unknown): CodeEntry[] {
  if (value === null || value === undefined) return [];

  if (typeof value === 'string') {
    return [{ system: '', code: value }];
  }

  if (typeof value !== 'object') return [];

  const obj = value as Record<string, unknown>;

  // Coding object
  if (typeof obj['code'] === 'string') {
    return [{
      system: (typeof obj['system'] === 'string' ? obj['system'] : ''),
      code: obj['code'],
      display: typeof obj['display'] === 'string' ? obj['display'] : undefined,
    }];
  }

  // CodeableConcept with coding array
  if (Array.isArray(obj['coding'])) {
    const entries: CodeEntry[] = [];
    for (const coding of obj['coding']) {
      if (coding && typeof coding === 'object' && typeof coding['code'] === 'string') {
        entries.push({
          system: typeof coding['system'] === 'string' ? coding['system'] : '',
          code: coding['code'],
          display: typeof coding['display'] === 'string' ? coding['display'] : undefined,
        });
      }
    }
    return entries;
  }

  return [];
}

/**
 * Map binding strength to issue severity.
 */
function bindingSeverity(
  strength: string | undefined,
): 'error' | 'warning' | 'information' {
  switch (strength) {
    case 'required':
      return 'error';
    case 'extensible':
      return 'warning';
    default:
      return 'information';
  }
}

/**
 * Exported for testing.
 */
export { extractCodes as _extractCodes, bindingSeverity as _bindingSeverity };
