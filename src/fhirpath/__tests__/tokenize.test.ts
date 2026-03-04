import { describe, test, expect } from 'vitest';
import { tokenize } from '../tokenize.js';

describe('FHIRPath Tokenizer', () => {
  // ── Empty / whitespace ──────────────────────────────────────────────────
  test('Empty string returns empty array', () => {
    expect(tokenize('')).toStrictEqual([]);
  });

  test('Whitespace-only returns empty array', () => {
    expect(tokenize('   \t\n  ')).toStrictEqual([]);
  });

  // ── Numbers ─────────────────────────────────────────────────────────────
  test('Integer token', () => {
    expect(tokenize('42')).toMatchObject([{ id: 'Number', value: '42' }]);
  });

  test('Decimal token', () => {
    expect(tokenize('3.14')).toMatchObject([{ id: 'Number', value: '3.14' }]);
  });

  test('Negative number is two tokens', () => {
    expect(tokenize('-5')).toMatchObject([
      { id: '-', value: '-' },
      { id: 'Number', value: '5' },
    ]);
  });

  test('Negative decimal is two tokens', () => {
    expect(tokenize('-1.5')).toMatchObject([
      { id: '-', value: '-' },
      { id: 'Number', value: '1.5' },
    ]);
  });

  test('Number with trailing space', () => {
    expect(tokenize('1 ')).toMatchObject([{ id: 'Number', value: '1' }]);
  });

  // ── Strings ─────────────────────────────────────────────────────────────
  test('Single-quoted string', () => {
    expect(tokenize("'hello'")).toMatchObject([{ id: 'String', value: 'hello' }]);
  });

  test('Double-quoted string', () => {
    expect(tokenize('"world"')).toMatchObject([{ id: 'String', value: 'world' }]);
  });

  test('String with escape sequences', () => {
    expect(tokenize("'line1\\nline2'")).toMatchObject([{ id: 'String', value: 'line1\nline2' }]);
  });

  test('String with unicode escape', () => {
    expect(tokenize("'\\u002a'")).toMatchObject([{ id: 'String', value: '*' }]);
  });

  test('String with escaped single quote', () => {
    expect(tokenize("'it\\'s'")).toMatchObject([{ id: 'String', value: "it's" }]);
  });

  test('String with backslash escape', () => {
    expect(tokenize("'\\\\'")).toMatchObject([{ id: 'String', value: '\\' }]);
  });

  // ── DateTime ────────────────────────────────────────────────────────────
  test('DateTime literal with timezone', () => {
    expect(tokenize('@2012-04-15T15:00:00+02:00')).toMatchObject([
      { id: 'DateTime', value: '2012-04-15T15:00:00+02:00' },
    ]);
  });

  test('DateTime literal with Z', () => {
    expect(tokenize('@2024-01-15T10:30:00Z')).toMatchObject([
      { id: 'DateTime', value: '2024-01-15T10:30:00Z' },
    ]);
  });

  test('Date-only literal', () => {
    expect(tokenize('@2024-01-15')).toMatchObject([
      { id: 'DateTime', value: '2024-01-15' },
    ]);
  });

  test('DateTime without timezone gets Z appended', () => {
    expect(tokenize('@2024-01-15T10:30:00')).toMatchObject([
      { id: 'DateTime', value: '2024-01-15T10:30:00Z' },
    ]);
  });

  test('DateTime with milliseconds', () => {
    expect(tokenize('@2024-01-15T10:30:00.123Z')).toMatchObject([
      { id: 'DateTime', value: '2024-01-15T10:30:00.123Z' },
    ]);
  });

  // ── Quantity ─────────────────────────────────────────────────────────────
  test('Quantity with quoted unit', () => {
    expect(tokenize("1 'mg'")).toMatchObject([{ id: 'Quantity', value: "1 'mg'" }]);
  });

  test('Quantity with standard unit', () => {
    expect(tokenize('7 days')).toMatchObject([{ id: 'Quantity', value: '7 days' }]);
  });

  test('Decimal quantity', () => {
    expect(tokenize("1.5 'kg'")).toMatchObject([{ id: 'Quantity', value: "1.5 'kg'" }]);
  });

  // ── Symbols ─────────────────────────────────────────────────────────────
  test('Simple symbol', () => {
    expect(tokenize('name')).toMatchObject([{ id: 'Symbol', value: 'name' }]);
  });

  test('$this symbol', () => {
    expect(tokenize('$this')).toMatchObject([{ id: 'Symbol', value: '$this' }]);
  });

  test('%context symbol', () => {
    expect(tokenize('%context')).toMatchObject([{ id: 'Symbol', value: '%context' }]);
  });

  // ── Keywords ────────────────────────────────────────────────────────────
  test('true keyword', () => {
    expect(tokenize('true')).toMatchObject([{ id: 'true', value: 'true' }]);
  });

  test('false keyword', () => {
    expect(tokenize('false')).toMatchObject([{ id: 'false', value: 'false' }]);
  });

  // ── Operators ───────────────────────────────────────────────────────────
  test('Single-char operators', () => {
    expect(tokenize('( + ) / ( * ')).toMatchObject([
      { id: '(', value: '(' },
      { id: '+', value: '+' },
      { id: ')', value: ')' },
      { id: '/', value: '/' },
      { id: '(', value: '(' },
      { id: '*', value: '*' },
    ]);
  });

  test('Two-char operators', () => {
    expect(tokenize('!= !~ <= >= {}')).toMatchObject([
      { id: '!=', value: '!=' },
      { id: '!~', value: '!~' },
      { id: '<=', value: '<=' },
      { id: '>=', value: '>=' },
      { id: '{}', value: '{}' },
    ]);
  });

  // ── Comments ────────────────────────────────────────────────────────────
  test('Single-line comment', () => {
    expect(tokenize('2 + 2 // comment')).toMatchObject([
      { id: 'Number', value: '2' },
      { id: '+', value: '+' },
      { id: 'Number', value: '2' },
      { id: 'Comment', value: '// comment' },
    ]);
  });

  test('Multi-line comment', () => {
    const tokens = tokenize('/* before */ 2 + 2 /* after */');
    expect(tokens).toMatchObject([
      { id: 'Comment' },
      { id: 'Number', value: '2' },
      { id: '+', value: '+' },
      { id: 'Number', value: '2' },
      { id: 'Comment' },
    ]);
  });

  // ── FHIRPath expressions ───────────────────────────────────────────────
  test('Patient.name.given path', () => {
    expect(tokenize('Patient.name.given')).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' },
    ]);
  });

  test('Union expression', () => {
    expect(tokenize('Practitioner.name | Patient.name')).toMatchObject([
      { id: 'Symbol', value: 'Practitioner' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '|', value: '|' },
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
    ]);
  });

  test('Function call expression', () => {
    expect(tokenize("Patient.telecom.where(system='email')")).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'telecom' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'where' },
      { id: '(', value: '(' },
      { id: 'Symbol', value: 'system' },
      { id: '=', value: '=' },
      { id: 'String', value: 'email' },
      { id: ')', value: ')' },
    ]);
  });

  test('Indexer expression', () => {
    expect(tokenize('Patient.name[0]')).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '[', value: '[' },
      { id: 'Number', value: '0' },
      { id: ']', value: ']' },
    ]);
  });

  // ── Position tracking ──────────────────────────────────────────────────
  test('Tokens have line and column info', () => {
    const tokens = tokenize('a + b');
    expect(tokens[0]).toMatchObject({ line: 1, column: 0 });
    expect(tokens[1]).toMatchObject({ line: 1, column: 2 });
    expect(tokens[2]).toMatchObject({ line: 1, column: 4 });
  });
});
