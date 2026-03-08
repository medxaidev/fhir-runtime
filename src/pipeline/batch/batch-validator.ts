/**
 * fhir-pipeline — Batch Validator
 *
 * Validates multiple FHIR resources through a pipeline in sequence,
 * collecting individual results into a {@link BatchResult}.
 *
 * @module fhir-pipeline
 */

import type {
  BatchEntry,
  BatchResult,
  BatchEntryResult,
  ValidationStep,
  PipelineOptions,
} from '../types.js';
import type { HookManager } from '../hooks/hook-manager.js';
import { runPipeline } from '../validation-pipeline.js';

// =============================================================================
// validateBatch
// =============================================================================

/**
 * Validate a batch of resources through the pipeline.
 *
 * Each entry is validated independently using the same pipeline steps
 * and options. Results are collected into a {@link BatchResult}.
 *
 * @param entries - The batch entries to validate.
 * @param steps - The pipeline steps to execute.
 * @param options - Pipeline options.
 * @param hooks - Hook manager for event handling.
 * @returns The aggregated batch result.
 */
export async function validateBatch(
  entries: BatchEntry[],
  steps: ValidationStep[],
  options: PipelineOptions,
  hooks: HookManager,
): Promise<BatchResult> {
  const startTime = performance.now();
  const results: BatchEntryResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await runPipeline(
      entry.resource,
      entry.profile,
      steps,
      options,
      hooks,
    );

    if (result.valid) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      label: entry.label,
      result,
    });
  }

  return {
    total: entries.length,
    passed,
    failed,
    results,
    duration: performance.now() - startTime,
  };
}
