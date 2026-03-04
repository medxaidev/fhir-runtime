/**
 * FHIRPath Parser
 *
 * Builds a Pratt parser configured with FHIRPath-specific parselets,
 * and provides the public API for parsing and evaluating FHIRPath expressions.
 *
 * @module fhirpath
 */

import type { Atom } from './types.js';
import { PropertyType } from './types.js';
import type { TypedValue } from './types.js';
import type { InfixParselet, PrefixParselet } from './lexer/parse.js';
import { ParserBuilder } from './lexer/parse.js';
import type { Parser } from './lexer/parse.js';
import {
  ArithmeticOperatorAtom,
  AndAtom,
  AsAtom,
  ConcatAtom,
  ContainsAtom,
  DotAtom,
  EmptySetAtom,
  EqualsAtom,
  EquivalentAtom,
  FhirPathAtom,
  FunctionAtom,
  ImpliesAtom,
  InAtom,
  IndexerAtom,
  IsAtom,
  LiteralAtom,
  NotEqualsAtom,
  NotEquivalentAtom,
  OrAtom,
  SymbolAtom,
  UnaryOperatorAtom,
  UnionAtom,
  XorAtom,
  setFunctionRegistry,
} from './atoms.js';
import { parseDateString } from './date.js';
import { tokenize } from './tokenize.js';
import { toTypedValue, toJsBoolean } from './utils.js';
import { functions } from './functions.js';
import { getExpressionCache } from './cache.js';

// Wire the function registry into atoms
setFunctionRegistry(functions);

// =============================================================================
// Operator Precedence
// =============================================================================

/**
 * FHIRPath operator precedence levels.
 * Lower number = tighter binding.
 * @see https://hl7.org/fhirpath/#operator-precedence
 */
export const OperatorPrecedence = {
  FunctionCall: 0,
  Dot: 1,
  Indexer: 2,
  UnaryAdd: 3,
  UnarySubtract: 3,
  Multiply: 4,
  Divide: 4,
  IntegerDivide: 4,
  Modulo: 4,
  Add: 5,
  Subtract: 5,
  Ampersand: 5,
  Is: 6,
  As: 6,
  Union: 7,
  GreaterThan: 8,
  GreaterThanOrEquals: 8,
  LessThan: 8,
  LessThanOrEquals: 8,
  Equals: 9,
  Equivalent: 9,
  NotEquals: 9,
  NotEquivalent: 9,
  In: 10,
  Contains: 10,
  And: 11,
  Xor: 12,
  Or: 12,
  Implies: 13,
} as const;

// =============================================================================
// Parselets
// =============================================================================

const PARENTHESES_PARSELET: PrefixParselet = {
  parse(parser: Parser) {
    const expr = parser.consumeAndParse();
    if (!parser.match(')')) {
      throw new Error('Parse error: expected `)` got `' + parser.peek()?.value + '`');
    }
    return expr;
  },
};

const INDEXER_PARSELET: InfixParselet = {
  parse(parser: Parser, left: Atom) {
    const expr = parser.consumeAndParse();
    if (!parser.match(']')) {
      throw new Error('Parse error: expected `]`');
    }
    return new IndexerAtom(left, expr);
  },
  precedence: OperatorPrecedence.Indexer,
};

const FUNCTION_CALL_PARSELET: InfixParselet = {
  parse(parser: Parser, left: Atom) {
    if (!(left instanceof SymbolAtom)) {
      throw new Error('Unexpected parentheses');
    }
    const args: Atom[] = [];
    while (!parser.match(')')) {
      args.push(parser.consumeAndParse());
      parser.match(',');
    }
    return new FunctionAtom(left.name, args);
  },
  precedence: OperatorPrecedence.FunctionCall,
};

// =============================================================================
// Quantity parsing
// =============================================================================

interface QuantityLiteral {
  value: number;
  unit?: string;
}

function parseQuantity(str: string): QuantityLiteral {
  const parts = str.split(' ');
  const value = Number.parseFloat(parts[0]);
  let unit = parts[1];
  if (unit?.startsWith("'") && unit.endsWith("'")) {
    unit = unit.substring(1, unit.length - 1);
  } else if (unit) {
    unit = '{' + unit + '}';
  }
  return { value, unit };
}

// =============================================================================
// Parser Builder
// =============================================================================

/**
 * Initialize the FHIRPath parser builder with all prefix and infix parselets.
 */
export function initFhirPathParserBuilder(): ParserBuilder {
  return new ParserBuilder()
    // ── Prefix parselets (literals, symbols, grouping) ──────────────────
    .registerPrefix('String', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.string, value: token.value }),
    })
    .registerPrefix('DateTime', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.dateTime, value: parseDateString(token.value) }),
    })
    .registerPrefix('Quantity', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.Quantity, value: parseQuantity(token.value) }),
    })
    .registerPrefix('Number', {
      parse: (_, token) =>
        new LiteralAtom({
          type: token.value.includes('.') ? PropertyType.decimal : PropertyType.integer,
          value: Number.parseFloat(token.value),
        }),
    })
    .registerPrefix('true', { parse: () => new LiteralAtom({ type: PropertyType.boolean, value: true }) })
    .registerPrefix('false', { parse: () => new LiteralAtom({ type: PropertyType.boolean, value: false }) })
    .registerPrefix('Symbol', { parse: (_, token) => new SymbolAtom(token.value) })
    .registerPrefix('{}', { parse: () => new EmptySetAtom() })
    .registerPrefix('(', PARENTHESES_PARSELET)

    // ── Infix parselets (indexer, function call) ────────────────────────
    .registerInfix('[', INDEXER_PARSELET)
    .registerInfix('(', FUNCTION_CALL_PARSELET)

    // ── Prefix operators ────────────────────────────────────────────────
    .prefix('+', OperatorPrecedence.UnaryAdd, (_, right) => new UnaryOperatorAtom('+', right, (x) => x))
    .prefix(
      '-',
      OperatorPrecedence.UnarySubtract,
      (_, right) => new ArithmeticOperatorAtom('-', right, right, (_, y) => -y),
    )

    // ── Dot (property navigation) ───────────────────────────────────────
    .infixLeft('.', OperatorPrecedence.Dot, (left, _, right) => new DotAtom(left, right))

    // ── Arithmetic operators ────────────────────────────────────────────
    .infixLeft('/', OperatorPrecedence.Divide, (left, _, right) =>
      new ArithmeticOperatorAtom('/', left, right, (x, y) => x / y))
    .infixLeft('*', OperatorPrecedence.Multiply, (left, _, right) =>
      new ArithmeticOperatorAtom('*', left, right, (x, y) => x * y))
    .infixLeft('+', OperatorPrecedence.Add, (left, _, right) =>
      new ArithmeticOperatorAtom('+', left, right, (x, y) => x + y))
    .infixLeft('-', OperatorPrecedence.Subtract, (left, _, right) =>
      new ArithmeticOperatorAtom('-', left, right, (x, y) => x - y))
    .infixLeft('div', OperatorPrecedence.IntegerDivide, (left, _, right) =>
      new ArithmeticOperatorAtom('div', left, right, (x, y) => Math.trunc(x / y)))
    .infixLeft('mod', OperatorPrecedence.Modulo, (left, _, right) =>
      new ArithmeticOperatorAtom('mod', left, right, (x, y) => x % y))

    // ── String concatenation ────────────────────────────────────────────
    .infixLeft('&', OperatorPrecedence.Ampersand, (left, _, right) => new ConcatAtom(left, right))

    // ── Union ───────────────────────────────────────────────────────────
    .infixLeft('|', OperatorPrecedence.Union, (left, _, right) => new UnionAtom(left, right))

    // ── Comparison operators ────────────────────────────────────────────
    .infixLeft('<', OperatorPrecedence.LessThan, (left, _, right) =>
      new ArithmeticOperatorAtom('<', left, right, (x, y) => x < y))
    .infixLeft('<=', OperatorPrecedence.LessThanOrEquals, (left, _, right) =>
      new ArithmeticOperatorAtom('<=', left, right, (x, y) => x <= y))
    .infixLeft('>', OperatorPrecedence.GreaterThan, (left, _, right) =>
      new ArithmeticOperatorAtom('>', left, right, (x, y) => x > y))
    .infixLeft('>=', OperatorPrecedence.GreaterThanOrEquals, (left, _, right) =>
      new ArithmeticOperatorAtom('>=', left, right, (x, y) => x >= y))

    // ── Equality / equivalence ──────────────────────────────────────────
    .infixLeft('=', OperatorPrecedence.Equals, (left, _, right) => new EqualsAtom(left, right))
    .infixLeft('!=', OperatorPrecedence.NotEquals, (left, _, right) => new NotEqualsAtom(left, right))
    .infixLeft('~', OperatorPrecedence.Equivalent, (left, _, right) => new EquivalentAtom(left, right))
    .infixLeft('!~', OperatorPrecedence.NotEquivalent, (left, _, right) => new NotEquivalentAtom(left, right))

    // ── Type operators ──────────────────────────────────────────────────
    .infixLeft('as', OperatorPrecedence.As, (left, _, right) => new AsAtom(left, right))
    .infixLeft('is', OperatorPrecedence.Is, (left, _, right) => new IsAtom(left, right))

    // ── Membership operators ────────────────────────────────────────────
    .infixLeft('contains', OperatorPrecedence.Contains, (left, _, right) => new ContainsAtom(left, right))
    .infixLeft('in', OperatorPrecedence.In, (left, _, right) => new InAtom(left, right))

    // ── Boolean operators ───────────────────────────────────────────────
    .infixLeft('and', OperatorPrecedence.And, (left, _, right) => new AndAtom(left, right))
    .infixLeft('or', OperatorPrecedence.Or, (left, _, right) => new OrAtom(left, right))
    .infixLeft('xor', OperatorPrecedence.Xor, (left, _, right) => new XorAtom(left, right))
    .infixLeft('implies', OperatorPrecedence.Implies, (left, _, right) => new ImpliesAtom(left, right));
}

// Singleton builder instance
const fhirPathParserBuilder = initFhirPathParserBuilder();

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse a FHIRPath expression string into an AST.
 * Results are cached in the global expression cache for reuse.
 *
 * @param input - The FHIRPath expression string.
 * @returns The parsed AST as a {@link FhirPathAtom}.
 */
export function parseFhirPath(input: string): FhirPathAtom {
  const cache = getExpressionCache();
  const cached = cache.get(input) as FhirPathAtom | undefined;
  if (cached) {
    return cached;
  }
  const tokens = tokenize(input);
  const parser = fhirPathParserBuilder.construct(tokens);
  parser.removeComments();
  const ast = new FhirPathAtom(input, parser.consumeAndParse());
  cache.set(input, ast);
  return ast;
}

/**
 * Evaluate a FHIRPath expression against a resource or other object.
 * Accepts raw values (auto-wrapped in TypedValue) or pre-wrapped TypedValue arrays.
 *
 * @param expression - The FHIRPath expression string or pre-parsed AST.
 * @param input - The resource or object to evaluate against.
 * @returns Array of result values (unwrapped from TypedValue).
 */
export function evalFhirPath(expression: string | FhirPathAtom, input: unknown): unknown[] {
  const array = Array.isArray(input) ? input : [input];
  for (let i = 0; i < array.length; i++) {
    const el = array[i];
    if (!(typeof el === 'object' && el !== null && 'type' in el && 'value' in el)) {
      array[i] = toTypedValue(array[i]);
    }
  }
  return evalFhirPathTyped(expression, array as TypedValue[]).map((e) => e.value);
}

/**
 * Evaluate a FHIRPath expression against typed input values.
 *
 * @param expression - The FHIRPath expression string or pre-parsed AST.
 * @param input - Array of TypedValue inputs.
 * @param variables - Optional variable bindings.
 * @returns Array of TypedValue results.
 */
export function evalFhirPathTyped(
  expression: string | FhirPathAtom,
  input: TypedValue[],
  variables: Record<string, TypedValue> = {},
): TypedValue[] {
  const ast = typeof expression === 'string' ? parseFhirPath(expression) : expression;
  return ast.eval({ variables }, input).map((v) => ({
    type: v.type,
    value: v.value?.valueOf(),
  }));
}

// =============================================================================
// High-level convenience API
// =============================================================================

/**
 * Evaluate a FHIRPath expression and return a boolean result.
 *
 * Useful for invariant validation where the expression must evaluate to `true`.
 * Uses FHIRPath boolean semantics: empty → false, single truthy → true.
 *
 * @param expression - FHIRPath expression string or pre-parsed AST.
 * @param input - The resource or typed values to evaluate against.
 * @param variables - Optional variable bindings.
 * @returns Boolean result of the expression.
 */
export function evalFhirPathBoolean(
  expression: string | FhirPathAtom,
  input: unknown,
  variables: Record<string, TypedValue> = {},
): boolean {
  const array = Array.isArray(input) ? input : [input];
  for (let i = 0; i < array.length; i++) {
    const el = array[i];
    if (!(typeof el === 'object' && el !== null && 'type' in el && 'value' in el)) {
      array[i] = toTypedValue(array[i]);
    }
  }
  const result = evalFhirPathTyped(expression, array as TypedValue[], variables);
  return toJsBoolean(result);
}

/**
 * Evaluate a FHIRPath expression and return the first result as a string.
 *
 * Useful for extracting display values, identifiers, etc.
 *
 * @param expression - FHIRPath expression string or pre-parsed AST.
 * @param input - The resource or typed values to evaluate against.
 * @param variables - Optional variable bindings.
 * @returns The first result value as a string, or `undefined` if empty.
 */
export function evalFhirPathString(
  expression: string | FhirPathAtom,
  input: unknown,
  variables: Record<string, TypedValue> = {},
): string | undefined {
  const results = evalFhirPath(expression, input);
  if (results.length === 0) {
    return undefined;
  }
  const first = results[0];
  return first === undefined || first === null ? undefined : String(first);
}
