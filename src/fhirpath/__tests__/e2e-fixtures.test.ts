/**
 * Fixture-driven End-to-End FHIRPath Tests (Task 6.9)
 *
 * Loads JSON fixtures from fixtures/04-e2e/ and runs each test case
 * through evalFhirPath with realistic FHIR resources.
 */

import { describe, test, expect } from 'vitest';
import { evalFhirPath } from '../parse.js';
import { toTypedValue } from '../utils.js';

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Fixture loader
// =============================================================================

const fixtureDir = path.join(__dirname, 'fixtures', '04-e2e');

interface SingleResourceFixture {
  description: string;
  resource: Record<string, unknown>;
  tests: Array<{
    expression: string;
    expected: unknown[];
    description?: string;
  }>;
}

interface MultiResourceFixture {
  description: string;
  tests: Array<{
    description: string;
    resource: Record<string, unknown>;
    expression: string;
    expected: unknown[];
  }>;
}

function loadFixture(filename: string): SingleResourceFixture | MultiResourceFixture {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, filename), 'utf-8'));
}

function runSingleResourceFixture(filename: string): void {
  const fixture = loadFixture(filename) as SingleResourceFixture;
  describe(fixture.description, () => {
    for (const tc of fixture.tests) {
      const label = tc.description ?? tc.expression;
      test(label, () => {
        const result = evalFhirPath(tc.expression, [toTypedValue(fixture.resource)]);
        expect(result).toStrictEqual(tc.expected);
      });
    }
  });
}

function runMultiResourceFixture(filename: string): void {
  const fixture = loadFixture(filename) as MultiResourceFixture;
  describe(fixture.description, () => {
    for (const tc of fixture.tests) {
      test(tc.description, () => {
        const result = evalFhirPath(tc.expression, [toTypedValue(tc.resource)]);
        expect(result).toStrictEqual(tc.expected);
      });
    }
  });
}

// =============================================================================
// Run all E2E fixtures
// =============================================================================

runSingleResourceFixture('01-navigation.json');
runSingleResourceFixture('02-functions.json');
runSingleResourceFixture('03-operators.json');
runSingleResourceFixture('04-string-math.json');
runMultiResourceFixture('05-complex-scenarios.json');
