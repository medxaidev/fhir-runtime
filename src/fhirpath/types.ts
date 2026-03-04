/**
 * FHIRPath Core Types
 *
 * Defines the fundamental types used throughout the FHIRPath engine:
 * - {@link TypedValue} — A value paired with its FHIR type
 * - {@link PropertyType} — Enum of all FHIR property types
 * - {@link Atom} — AST node interface for parsed expressions
 * - {@link AtomContext} — Evaluation context with variable scoping
 *
 * @module fhirpath
 */

// =============================================================================
// PropertyType — FHIR type identifiers
// =============================================================================

/**
 * Enum of FHIR property type identifiers used in {@link TypedValue}.
 * Covers all FHIR R4 primitive types and commonly used complex types.
 */
export const PropertyType = {
  // Primitives
  boolean: 'boolean',
  integer: 'integer',
  decimal: 'decimal',
  string: 'string',
  uri: 'uri',
  url: 'url',
  canonical: 'canonical',
  base64Binary: 'base64Binary',
  instant: 'instant',
  date: 'date',
  dateTime: 'dateTime',
  time: 'time',
  code: 'code',
  oid: 'oid',
  id: 'id',
  markdown: 'markdown',
  unsignedInt: 'unsignedInt',
  positiveInt: 'positiveInt',
  uuid: 'uuid',
  xhtml: 'xhtml',

  // Complex types
  BackboneElement: 'BackboneElement',
  CodeableConcept: 'CodeableConcept',
  Coding: 'Coding',
  Quantity: 'Quantity',
  Reference: 'Reference',
  Period: 'Period',
  Identifier: 'Identifier',
  HumanName: 'HumanName',
  Address: 'Address',
  ContactPoint: 'ContactPoint',
  Attachment: 'Attachment',
  Extension: 'Extension',
} as const;

export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

// =============================================================================
// TypedValue — A value with its FHIR type
// =============================================================================

/**
 * A value paired with its FHIR type identifier.
 * This is the fundamental unit of data flowing through the FHIRPath engine.
 *
 * @example
 * ```ts
 * const tv: TypedValue = { type: PropertyType.string, value: 'hello' };
 * ```
 */
export interface TypedValue {
  readonly type: string;
  readonly value: unknown;
}

// =============================================================================
// AtomContext — Evaluation context with variable scoping
// =============================================================================

/**
 * Evaluation context for FHIRPath expressions.
 * Supports nested scoping via the `parent` chain, used by functions
 * like `where()` and `select()` that introduce `$this`.
 */
export interface AtomContext {
  readonly parent?: AtomContext;
  readonly variables: Record<string, TypedValue>;
}

// =============================================================================
// Atom — AST node interface
// =============================================================================

/**
 * Interface for all AST nodes in the FHIRPath expression tree.
 * Each node can evaluate itself given a context and input collection.
 */
export interface Atom {
  /**
   * Evaluate this atom against the given input collection.
   * @param context - The evaluation context (variables, parent scope).
   * @param input - The input collection of typed values.
   * @returns The result collection.
   */
  eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  /** Returns a string representation of this atom (for debugging). */
  toString(): string;
}

// =============================================================================
// Abstract base classes for operator atoms
// =============================================================================

/**
 * Base class for prefix (unary) operator atoms.
 * Examples: unary `-`, unary `+`
 */
export abstract class PrefixOperatorAtom implements Atom {
  readonly operator: string;
  readonly child: Atom;

  constructor(operator: string, child: Atom) {
    this.operator = operator;
    this.child = child;
  }

  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  toString(): string {
    return `${this.operator}(${this.child.toString()})`;
  }
}

/**
 * Base class for infix (binary) operator atoms.
 * Examples: `+`, `-`, `=`, `and`, `or`
 */
export abstract class InfixOperatorAtom implements Atom {
  readonly operator: string;
  readonly left: Atom;
  readonly right: Atom;

  constructor(operator: string, left: Atom, right: Atom) {
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  toString(): string {
    return `(${this.left.toString()} ${this.operator} ${this.right.toString()})`;
  }
}
