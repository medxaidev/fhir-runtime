/**
 * FHIRPath Module — Public API
 *
 * @module fhirpath
 */

// Core types
export type { TypedValue, AtomContext, Atom } from './types.js';
export { PropertyType, PrefixOperatorAtom, InfixOperatorAtom } from './types.js';

// Lexer (generic, reusable for FML)
export type { Token, Marker, TokenizerOptions } from './lexer/tokenize.js';
export { Tokenizer } from './lexer/tokenize.js';
export type { PrefixParselet, InfixParselet } from './lexer/parse.js';
export { ParserBuilder, Parser } from './lexer/parse.js';

// FHIRPath tokenizer
export { tokenize, FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS } from './tokenize.js';

// FHIRPath parser & evaluator
export { parseFhirPath, evalFhirPath, evalFhirPathTyped, evalFhirPathBoolean, evalFhirPathString, OperatorPrecedence, initFhirPathParserBuilder } from './parse.js';

// Expression cache
export { LRUCache, getExpressionCache, setExpressionCache, clearExpressionCache, DEFAULT_CACHE_SIZE } from './cache.js';

// Atoms
export {
  FhirPathAtom,
  LiteralAtom,
  SymbolAtom,
  EmptySetAtom,
  UnaryOperatorAtom,
  DotAtom,
  FunctionAtom,
  IndexerAtom,
  ArithmeticOperatorAtom,
  ConcatAtom,
  UnionAtom,
  EqualsAtom,
  NotEqualsAtom,
  EquivalentAtom,
  NotEquivalentAtom,
  IsAtom,
  AsAtom,
  ContainsAtom,
  InAtom,
  AndAtom,
  OrAtom,
  XorAtom,
  ImpliesAtom,
  BooleanInfixOperatorAtom,
} from './atoms.js';

// Utilities
export {
  booleanToTypedValue,
  toTypedValue,
  toJsBoolean,
  singleton,
  getTypedPropertyValue,
  fhirPathEquals,
  fhirPathArrayEquals,
  fhirPathArrayNotEquals,
  fhirPathEquivalent,
  fhirPathArrayEquivalent,
  fhirPathNot,
  removeDuplicates,
  fhirPathIs,
  isQuantity,
  isResource,
  isResourceType,
} from './utils.js';

// Date utilities
export { parseDateString } from './date.js';

// Functions registry
export { functions } from './functions.js';
export type { FhirPathFunction } from './functions.js';
