/**
 * FHIRPath AST Node Classes (Atoms)
 *
 * Each class implements the {@link Atom} interface and represents a node
 * in the parsed FHIRPath expression tree.
 *
 * **Basic atoms** (Task 6.2):
 * - {@link FhirPathAtom} — Root wrapper
 * - {@link LiteralAtom} — String, number, boolean, DateTime, Quantity literals
 * - {@link SymbolAtom} — Identifiers and variables (`$this`, `%context`)
 * - {@link EmptySetAtom} — The empty set `{}`
 * - {@link UnaryOperatorAtom} — Unary `+` and `-`
 * - {@link DotAtom} — Property navigation (`.`)
 * - {@link FunctionAtom} — Function calls (`where()`, `exists()`, etc.)
 * - {@link IndexerAtom} — Indexer access (`[0]`)
 *
 * **Operator atoms** (Task 6.3):
 * - {@link ArithmeticOperatorAtom} — `+`, `-`, `*`, `/`, `div`, `mod`
 * - {@link ConcatAtom} — String concatenation `&`
 * - {@link UnionAtom} — Collection union `|`
 * - {@link EqualsAtom} / {@link NotEqualsAtom} — `=`, `!=`
 * - {@link EquivalentAtom} / {@link NotEquivalentAtom} — `~`, `!~`
 * - {@link IsAtom} / {@link AsAtom} — Type operators
 * - {@link ContainsAtom} / {@link InAtom} — Membership operators
 * - {@link AndAtom} / {@link OrAtom} / {@link XorAtom} / {@link ImpliesAtom} — Boolean operators
 *
 * @module fhirpath
 */

import type { Atom, AtomContext, TypedValue } from './types.js';
import { InfixOperatorAtom, PrefixOperatorAtom, PropertyType } from './types.js';
import {
  booleanToTypedValue,
  fhirPathArrayEquals,
  fhirPathArrayEquivalent,
  fhirPathArrayNotEquals,
  fhirPathEquals,
  fhirPathIs,
  fhirPathNot,
  getTypedPropertyValue,
  isQuantity,
  isResourceType,
  removeDuplicates,
  singleton,
  toJsBoolean,
  toTypedValue,
} from './utils.js';

// =============================================================================
// Basic Atoms (Task 6.2)
// =============================================================================

/**
 * Root wrapper atom for a parsed FHIRPath expression.
 * Iterates over each input element, setting `$this` for each evaluation.
 */
export class FhirPathAtom implements Atom {
  readonly original: string;
  readonly child: Atom;

  constructor(original: string, child: Atom) {
    this.original = original;
    this.child = child;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    try {
      if (input.length > 0) {
        const result: TypedValue[][] = [];
        for (const e of input) {
          result.push(this.child.eval({ parent: context, variables: { $this: e } }, [e]));
        }
        return result.flat();
      } else {
        return this.child.eval(context, []);
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`, { cause: error });
    }
  }

  toString(): string {
    return this.child.toString();
  }
}

/**
 * Literal value atom (string, number, boolean, DateTime, Quantity).
 */
export class LiteralAtom implements Atom {
  public readonly value: TypedValue;

  constructor(value: TypedValue) {
    this.value = value;
  }

  eval(): TypedValue[] {
    return [this.value];
  }

  toString(): string {
    const value = this.value.value;
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    return String(value);
  }
}

/**
 * Symbol atom — identifiers, variables (`$this`, `%context`), and resource type names.
 */
export class SymbolAtom implements Atom {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    if (this.name === '$this') {
      return input;
    }
    const variableValue = this.getVariable(context);
    if (variableValue) {
      return [variableValue];
    }
    if (this.name.startsWith('%')) {
      throw new Error(`Undefined variable ${this.name}`);
    }
    return input.flatMap((e) => this.evalValue(e)).filter((e): e is TypedValue => e?.value !== undefined);
  }

  private getVariable(context: AtomContext): TypedValue | undefined {
    const value = context.variables[this.name];
    if (value !== undefined) {
      return value;
    }
    if (context.parent) {
      return this.getVariable(context.parent);
    }
    return undefined;
  }

  private evalValue(typedValue: TypedValue): TypedValue[] | TypedValue | undefined {
    const input = typedValue.value;
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    // Check if input is a resource matching this symbol name
    if (isResourceType(input, this.name)) {
      return typedValue;
    }

    // Navigate into the property
    const result = getTypedPropertyValue(typedValue, this.name);
    if (result === undefined) {
      return undefined;
    }
    if (Array.isArray(result)) {
      return result;
    }
    return result;
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Empty set atom — represents `{}`.
 */
export class EmptySetAtom implements Atom {
  eval(): TypedValue[] {
    return [];
  }

  toString(): string {
    return '{}';
  }
}

/**
 * Unary operator atom (prefix `+` and `-`).
 */
export class UnaryOperatorAtom extends PrefixOperatorAtom {
  readonly impl: (x: TypedValue[]) => TypedValue[];

  constructor(operator: string, child: Atom, impl: (x: TypedValue[]) => TypedValue[]) {
    super(operator, child);
    this.impl = impl;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    return this.impl(this.child.eval(context, input));
  }

  toString(): string {
    return this.operator + this.child.toString();
  }
}

/**
 * Dot (property navigation) atom.
 * Evaluates left, then feeds result as input to right.
 */
export class DotAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('.', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    return this.right.eval(context, this.left.eval(context, input));
  }

  toString(): string {
    return `${this.left.toString()}.${this.right.toString()}`;
  }
}

/**
 * Function call atom.
 * Delegates to the function registry at evaluation time.
 */
export class FunctionAtom implements Atom {
  readonly name: string;
  readonly args: Atom[];

  constructor(name: string, args: Atom[]) {
    this.name = name;
    this.args = args;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    // Functions are resolved at eval time via the global registry.
    // This will be wired in parse.ts via the functions import.
    const impl = getFunctionImpl(this.name);
    if (!impl) {
      throw new Error('Unrecognized function: ' + this.name);
    }
    return impl(context, input, ...this.args);
  }

  toString(): string {
    return `${this.name}(${this.args.map((arg) => arg.toString()).join(', ')})`;
  }
}

// Function registry — set by parse.ts to avoid circular imports
let _functionRegistry: Record<string, FhirPathFunction> | undefined;

export type FhirPathFunction = (context: AtomContext, input: TypedValue[], ...args: Atom[]) => TypedValue[];

export function setFunctionRegistry(registry: Record<string, FhirPathFunction>): void {
  _functionRegistry = registry;
}

function getFunctionImpl(name: string): FhirPathFunction | undefined {
  return _functionRegistry?.[name];
}

/**
 * Indexer atom — `collection[index]`.
 */
export class IndexerAtom implements Atom {
  readonly left: Atom;
  readonly expr: Atom;

  constructor(left: Atom, expr: Atom) {
    this.left = left;
    this.expr = expr;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const evalResult = this.expr.eval(context, input);
    if (evalResult.length !== 1) {
      return [];
    }
    const index = evalResult[0].value;
    if (typeof index !== 'number') {
      throw new Error('Invalid indexer expression: should return integer');
    }
    const leftResult = this.left.eval(context, input);
    if (!(index in leftResult)) {
      return [];
    }
    return [leftResult[index]];
  }

  toString(): string {
    return `${this.left.toString()}[${this.expr.toString()}]`;
  }
}

// =============================================================================
// Operator Atoms (Task 6.3)
// =============================================================================

/**
 * Base class for boolean-producing infix operators.
 */
export abstract class BooleanInfixOperatorAtom extends InfixOperatorAtom {
  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];
}

/**
 * Arithmetic operator atom — handles `+`, `-`, `*`, `/`, `div`, `mod`,
 * and comparison operators `<`, `<=`, `>`, `>=`.
 * Works on numbers and Quantity values.
 */
export class ArithmeticOperatorAtom extends BooleanInfixOperatorAtom {
  readonly impl: (x: number, y: number) => number | boolean;

  constructor(operator: string, left: Atom, right: Atom, impl: (x: number, y: number) => number | boolean) {
    super(operator, left, right);
    this.impl = impl;
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftEvalResult = this.left.eval(context, input);
    if (leftEvalResult.length !== 1) {
      return [];
    }
    const rightEvalResult = this.right.eval(context, input);
    if (rightEvalResult.length !== 1) {
      return [];
    }
    const leftValue = leftEvalResult[0].value;
    const rightValue = rightEvalResult[0].value;

    // String concatenation with +
    if (this.operator === '+' && typeof leftValue === 'string' && typeof rightValue === 'string') {
      return [{ type: PropertyType.string, value: leftValue + rightValue }];
    }

    const leftNumber = isQuantity(leftValue) ? (leftValue as { value: number }).value : leftValue;
    const rightNumber = isQuantity(rightValue) ? (rightValue as { value: number }).value : rightValue;

    if (typeof leftNumber !== 'number' || typeof rightNumber !== 'number') {
      return [];
    }

    const result = this.impl(leftNumber, rightNumber);
    if (typeof result === 'boolean') {
      return booleanToTypedValue(result);
    } else if (isQuantity(leftValue)) {
      return [{ type: PropertyType.Quantity, value: { ...(leftValue as object), value: result } }];
    } else {
      return [toTypedValue(result)];
    }
  }
}

/**
 * String concatenation operator `&`.
 * Concatenates string values; for non-strings, collects into a union.
 */
export class ConcatAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('&', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    const result = [...leftValue, ...rightValue];
    if (result.length > 0 && result.every((e) => typeof e.value === 'string')) {
      return [{ type: PropertyType.string, value: result.map((e) => e.value as string).join('') }];
    }
    return result;
  }
}

/**
 * Union operator `|`.
 * Combines two collections, removing duplicates.
 */
export class UnionAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('|', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftResult = this.left.eval(context, input);
    const rightResult = this.right.eval(context, input);
    return removeDuplicates([...leftResult, ...rightResult]);
  }
}

/**
 * Equality operator `=`.
 */
export class EqualsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('=', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayEquals(leftValue, rightValue);
  }
}

/**
 * Not-equals operator `!=`.
 */
export class NotEqualsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!=', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayNotEquals(leftValue, rightValue);
  }
}

/**
 * Equivalence operator `~`.
 */
export class EquivalentAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('~', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathArrayEquivalent(leftValue, rightValue);
  }
}

/**
 * Not-equivalent operator `!~`.
 */
export class NotEquivalentAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('!~', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return fhirPathNot(fhirPathArrayEquivalent(leftValue, rightValue));
  }
}

/**
 * Type-check operator `is`.
 */
export class IsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('is', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    if (leftValue.length !== 1) {
      return [];
    }
    const typeName = (this.right as SymbolAtom).name;
    return booleanToTypedValue(fhirPathIs(leftValue[0], typeName));
  }
}

/**
 * Type-cast operator `as`.
 */
export class AsAtom extends InfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('as', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const typeName = (this.right as SymbolAtom).name;
    return leftValue.filter((v) => fhirPathIs(v, typeName));
  }
}

/**
 * Collection membership operator `contains`.
 * `collection contains value` → true if value is in collection.
 */
export class ContainsAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('contains', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const leftValue = this.left.eval(context, input);
    const rightValue = this.right.eval(context, input);
    return booleanToTypedValue(leftValue.some((e) => e.value === rightValue[0]?.value));
  }
}

/**
 * Collection membership operator `in`.
 * `value in collection` → true if value is in collection.
 */
export class InAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('in', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input));
    const right = this.right.eval(context, input);
    if (!left) {
      return [];
    }
    return booleanToTypedValue(right.some((e) => toJsBoolean(fhirPathEquals(left, e))));
  }
}

// =============================================================================
// Boolean Logic Operators
// =============================================================================

/**
 * Logical AND — three-valued logic per FHIRPath spec §6.5.1.
 */
export class AndAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('and', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (left?.value === true && right?.value === true) {
      return booleanToTypedValue(true);
    }
    if (left?.value === false || right?.value === false) {
      return booleanToTypedValue(false);
    }
    return [];
  }
}

/**
 * Logical OR — three-valued logic per FHIRPath spec §6.5.2.
 */
export class OrAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('or', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (left?.value === false && right?.value === false) {
      return booleanToTypedValue(false);
    } else if (left?.value || right?.value) {
      return booleanToTypedValue(true);
    } else {
      return [];
    }
  }
}

/**
 * Logical XOR — three-valued logic per FHIRPath spec §6.5.4.
 */
export class XorAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('xor', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (!left || !right) {
      return [];
    }
    return booleanToTypedValue(left.value !== right.value);
  }
}

/**
 * Logical IMPLIES — three-valued logic per FHIRPath spec §6.5.5.
 */
export class ImpliesAtom extends BooleanInfixOperatorAtom {
  constructor(left: Atom, right: Atom) {
    super('implies', left, right);
  }

  eval(context: AtomContext, input: TypedValue[]): TypedValue[] {
    const left = singleton(this.left.eval(context, input), 'boolean');
    const right = singleton(this.right.eval(context, input), 'boolean');
    if (right?.value === true || left?.value === false) {
      return booleanToTypedValue(true);
    } else if (!left || !right) {
      return [];
    }
    return booleanToTypedValue(false);
  }
}
