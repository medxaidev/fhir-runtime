/**
 * FHIRPath-specific tokenizer.
 *
 * Thin wrapper around the generic {@link Tokenizer} that provides
 * FHIRPath keywords and operators.
 *
 * @module fhirpath
 */

import type { Token } from './lexer/tokenize.js';
import { Tokenizer } from './lexer/tokenize.js';

/** FHIRPath keywords that are treated as their own token type. */
export const FHIRPATH_KEYWORDS = ['true', 'false'];

/** FHIRPath multi-character operators. */
export const FHIRPATH_OPERATORS = ['!=', '!~', '<=', '>=', '{}', '->'];

/**
 * Tokenize a FHIRPath expression string into a token array.
 * @param str - The FHIRPath expression.
 * @returns Array of tokens.
 */
export function tokenize(str: string): Token[] {
  return new Tokenizer(str, FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS).tokenize();
}
