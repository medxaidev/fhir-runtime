import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize } from '../tokenize.js';
import { evalFhirPath } from '../parse.js';
import { toTypedValue } from '../utils.js';

// =============================================================================
// Helper to load JSON fixtures
// =============================================================================

function loadFixture(relativePath: string): any {
  const fullPath = join(__dirname, 'fixtures', relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
}

// =============================================================================
// 01 — Tokenizer fixtures
// =============================================================================

describe('Tokenizer Fixtures', () => {
  const tokenizerFixtures = [
    '01-tokenizer/01-basic-tokens.json',
    '01-tokenizer/02-datetime-quantity.json',
    '01-tokenizer/03-fhirpath-expressions.json',
    '01-tokenizer/04-string-escapes.json',
    '01-tokenizer/05-comments.json',
  ];

  for (const fixturePath of tokenizerFixtures) {
    const fixture = loadFixture(fixturePath);

    describe(fixture.description, () => {
      for (const testCase of fixture.cases) {
        test(`tokenize: ${testCase.input || '(empty)'}`, () => {
          const tokens = tokenize(testCase.input);

          if (testCase.expected) {
            expect(tokens).toMatchObject(testCase.expected);
          }

          if (testCase.expectedLength !== undefined) {
            expect(tokens).toHaveLength(testCase.expectedLength);
          }

          if (testCase.expectedLast) {
            expect(tokens[tokens.length - 1]).toMatchObject(testCase.expectedLast);
          }
        });
      }
    });
  }
});

// =============================================================================
// 02 — Evaluation fixtures (no resource context)
// =============================================================================

describe('Evaluation Fixtures', () => {
  const evalFixtures = [
    '02-evaluation/01-arithmetic.json',
    '02-evaluation/02-comparison-equality.json',
    '02-evaluation/03-boolean-logic.json',
    '02-evaluation/04-string-concat.json',
  ];

  for (const fixturePath of evalFixtures) {
    const fixture = loadFixture(fixturePath);

    describe(fixture.description, () => {
      for (const testCase of fixture.cases) {
        test(`eval: ${testCase.expression}`, () => {
          const result = evalFhirPath(testCase.expression, []);
          expect(result).toStrictEqual(testCase.expected);
        });
      }
    });
  }
});

// =============================================================================
// 03 — Resource navigation fixtures
// =============================================================================

describe('Resource Navigation Fixtures', () => {
  const fixture = loadFixture('02-evaluation/05-resource-navigation.json');

  describe(fixture.description, () => {
    const resource = toTypedValue(fixture.resource);

    for (const testCase of fixture.cases) {
      test(`eval: ${testCase.expression}`, () => {
        const result = evalFhirPath(testCase.expression, [resource]);
        expect(result).toStrictEqual(testCase.expected);
      });
    }
  });
});
