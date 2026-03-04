/**
 * Task 7.1: Parser Completeness Audit
 *
 * Verifies that the existing StructureDefinitionParser correctly handles
 * ALL StructureDefinitions in the full FHIR R4 specification bundles,
 * not just the 73 that were tested in Stage-1.
 *
 * Bundles tested:
 * - profiles-resources.json  (~148 resource StructureDefinitions)
 * - profiles-types.json      (~60 type StructureDefinitions)
 * - profiles-others.json     (~40+ conformance StructureDefinitions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseStructureDefinition } from '../structure-definition-parser.js';
import type { ParseIssue } from '../parse-error.js';

// =============================================================================
// Helpers
// =============================================================================

/** Resolve path relative to project root spec directory */
function specPath(filename: string): string {
  return resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4', filename);
}

interface BundleEntry {
  resource?: Record<string, unknown>;
}

interface Bundle {
  resourceType: string;
  entry?: BundleEntry[];
}

interface AuditResult {
  total: number;
  succeeded: number;
  failed: number;
  warnings: number;
  failures: Array<{
    name: string;
    url: string;
    errors: readonly ParseIssue[];
  }>;
  warningDetails: Array<{
    name: string;
    url: string;
    warnings: readonly ParseIssue[];
  }>;
}

/**
 * Load a FHIR Bundle JSON file and extract all StructureDefinition entries.
 */
function loadStructureDefinitionsFromBundle(filename: string): Array<Record<string, unknown>> {
  const raw = readFileSync(specPath(filename), 'utf-8');
  const bundle: Bundle = JSON.parse(raw);

  if (bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
    throw new Error(`${filename} is not a valid FHIR Bundle`);
  }

  return bundle.entry
    .filter((e): e is BundleEntry & { resource: Record<string, unknown> } =>
      e.resource !== undefined && e.resource !== null && e.resource.resourceType === 'StructureDefinition'
    )
    .map((e) => e.resource);
}

/**
 * Run all StructureDefinitions from a bundle through the parser and collect results.
 */
function auditBundle(filename: string): AuditResult {
  const definitions = loadStructureDefinitionsFromBundle(filename);
  const result: AuditResult = {
    total: definitions.length,
    succeeded: 0,
    failed: 0,
    warnings: 0,
    failures: [],
    warningDetails: [],
  };

  for (const sd of definitions) {
    const name = (sd.name as string) ?? '<unknown>';
    const url = (sd.url as string) ?? '<unknown>';
    const parseResult = parseStructureDefinition(sd, 'StructureDefinition');

    if (parseResult.success) {
      result.succeeded++;

      // Collect warnings (excluding UNEXPECTED_PROPERTY which is expected for _element companions)
      const significantWarnings = parseResult.issues.filter(
        (issue) => issue.severity === 'warning'
      );
      if (significantWarnings.length > 0) {
        result.warnings++;
        result.warningDetails.push({ name, url, warnings: significantWarnings });
      }
    } else {
      result.failed++;
      const errors = parseResult.issues.filter((issue) => issue.severity === 'error');
      result.failures.push({ name, url, errors });
    }
  }

  return result;
}

// =============================================================================
// Tests
// =============================================================================

describe('Task 7.1: Parser Completeness Audit', () => {
  describe('profiles-resources.json', () => {
    let audit: AuditResult;

    it('should load the bundle', () => {
      audit = auditBundle('profiles-resources.json');
      expect(audit.total).toBeGreaterThan(100);
    });

    it('should parse all resource StructureDefinitions without errors', () => {
      if (audit.failures.length > 0) {
        const summary = audit.failures.map(
          (f) => `  ${f.name} (${f.url}):\n${f.errors.map((e) => `    [${e.path}] ${e.message}`).join('\n')}`
        ).join('\n');
        console.error(`\n=== profiles-resources.json FAILURES (${audit.failures.length}/${audit.total}) ===\n${summary}`);
      }
      expect(audit.failed).toBe(0);
      expect(audit.succeeded).toBe(audit.total);
    });

    it('should report audit statistics', () => {
      console.log(`\n=== profiles-resources.json AUDIT ===`);
      console.log(`  Total:     ${audit.total}`);
      console.log(`  Succeeded: ${audit.succeeded}`);
      console.log(`  Failed:    ${audit.failed}`);
      console.log(`  With warnings: ${audit.warnings}`);
      if (audit.warningDetails.length > 0) {
        const warnSummary = audit.warningDetails.slice(0, 5).map(
          (w) => `  ${w.name}: ${w.warnings.length} warning(s)`
        ).join('\n');
        console.log(`  Warning samples:\n${warnSummary}`);
      }
      expect(audit.total).toBeGreaterThan(0);
    });
  });

  describe('profiles-types.json', () => {
    let audit: AuditResult;

    it('should load the bundle', () => {
      audit = auditBundle('profiles-types.json');
      expect(audit.total).toBeGreaterThan(30);
    });

    it('should parse all type StructureDefinitions without errors', () => {
      if (audit.failures.length > 0) {
        const summary = audit.failures.map(
          (f) => `  ${f.name} (${f.url}):\n${f.errors.map((e) => `    [${e.path}] ${e.message}`).join('\n')}`
        ).join('\n');
        console.error(`\n=== profiles-types.json FAILURES (${audit.failures.length}/${audit.total}) ===\n${summary}`);
      }
      expect(audit.failed).toBe(0);
      expect(audit.succeeded).toBe(audit.total);
    });

    it('should report audit statistics', () => {
      console.log(`\n=== profiles-types.json AUDIT ===`);
      console.log(`  Total:     ${audit.total}`);
      console.log(`  Succeeded: ${audit.succeeded}`);
      console.log(`  Failed:    ${audit.failed}`);
      console.log(`  With warnings: ${audit.warnings}`);
      expect(audit.total).toBeGreaterThan(0);
    });
  });

  describe('profiles-others.json', () => {
    let audit: AuditResult;

    it('should load the bundle', () => {
      audit = auditBundle('profiles-others.json');
      expect(audit.total).toBeGreaterThan(10);
    });

    it('should parse all other StructureDefinitions without errors', () => {
      if (audit.failures.length > 0) {
        const summary = audit.failures.map(
          (f) => `  ${f.name} (${f.url}):\n${f.errors.map((e) => `    [${e.path}] ${e.message}`).join('\n')}`
        ).join('\n');
        console.error(`\n=== profiles-others.json FAILURES (${audit.failures.length}/${audit.total}) ===\n${summary}`);
      }
      expect(audit.failed).toBe(0);
      expect(audit.succeeded).toBe(audit.total);
    });

    it('should report audit statistics', () => {
      console.log(`\n=== profiles-others.json AUDIT ===`);
      console.log(`  Total:     ${audit.total}`);
      console.log(`  Succeeded: ${audit.succeeded}`);
      console.log(`  Failed:    ${audit.failed}`);
      console.log(`  With warnings: ${audit.warnings}`);
      expect(audit.total).toBeGreaterThan(0);
    });
  });

  describe('Cross-bundle summary', () => {
    it('should parse all StructureDefinitions across all bundles', () => {
      const resources = auditBundle('profiles-resources.json');
      const types = auditBundle('profiles-types.json');
      const others = auditBundle('profiles-others.json');

      const totalAll = resources.total + types.total + others.total;
      const failedAll = resources.failed + types.failed + others.failed;
      const succeededAll = resources.succeeded + types.succeeded + others.succeeded;

      console.log(`\n=== CROSS-BUNDLE SUMMARY ===`);
      console.log(`  profiles-resources.json: ${resources.succeeded}/${resources.total}`);
      console.log(`  profiles-types.json:     ${types.succeeded}/${types.total}`);
      console.log(`  profiles-others.json:    ${others.succeeded}/${others.total}`);
      console.log(`  TOTAL: ${succeededAll}/${totalAll} (${failedAll} failures)`);

      expect(failedAll).toBe(0);
      expect(succeededAll).toBe(totalAll);
    });
  });
});
