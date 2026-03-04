/**
 * Generic Pratt Parser Framework
 *
 * A top-down operator precedence parser based on
 * {@link https://github.com/JacksonKearl/PrattParse | PrattParse}.
 *
 * The parser uses two kinds of "parselets":
 * - **PrefixParselet** — handles tokens that appear at the start of an expression
 *   (literals, identifiers, unary operators, parenthesised groups)
 * - **InfixParselet** — handles tokens that appear between two expressions
 *   (binary operators, function calls, indexers)
 *
 * @module fhirpath/lexer
 */

import type { Atom } from '../types.js';
import type { Token } from './tokenize.js';

// =============================================================================
// Parselet interfaces
// =============================================================================

/**
 * A parselet that handles a token appearing in prefix position.
 */
export interface PrefixParselet {
  parse(parser: Parser, token: Token): Atom;
}

/**
 * A parselet that handles a token appearing in infix position.
 * `precedence` controls how tightly this operator binds.
 */
export interface InfixParselet {
  precedence: number;
  parse?(parser: Parser, left: Atom, token: Token): Atom;
}

// =============================================================================
// ParserBuilder — fluent API for registering parselets
// =============================================================================

/**
 * Fluent builder for constructing a {@link Parser} with registered parselets.
 *
 * @example
 * ```ts
 * const builder = new ParserBuilder()
 *   .registerPrefix('Number', { parse: (_, token) => new LiteralAtom(...) })
 *   .infixLeft('+', 5, (left, _, right) => new AddAtom(left, right));
 *
 * const parser = builder.construct(tokens);
 * const ast = parser.consumeAndParse();
 * ```
 */
export class ParserBuilder {
  private readonly prefixParselets: Record<string, PrefixParselet> = {};
  private readonly infixParselets: Record<string, InfixParselet> = {};

  public registerInfix(tokenType: string, parselet: InfixParselet): this {
    this.infixParselets[tokenType] = parselet;
    return this;
  }

  public registerPrefix(tokenType: string, parselet: PrefixParselet): this {
    this.prefixParselets[tokenType] = parselet;
    return this;
  }

  /**
   * Register a prefix operator with a given precedence.
   * The builder callback receives the consumed token and the right-hand operand.
   */
  public prefix(tokenType: string, precedence: number, builder: (token: Token, right: Atom) => Atom): this {
    return this.registerPrefix(tokenType, {
      parse(parser, token) {
        const right = parser.consumeAndParse(precedence);
        return builder(token, right);
      },
    });
  }

  /**
   * Register a left-associative infix operator with a given precedence.
   * The builder callback receives left operand, the consumed token, and right operand.
   */
  public infixLeft(
    tokenType: string,
    precedence: number,
    builder: (left: Atom, token: Token, right: Atom) => Atom,
  ): this {
    return this.registerInfix(tokenType, {
      parse(parser, left, token) {
        const right = parser.consumeAndParse(precedence);
        return builder(left, token, right);
      },
      precedence,
    });
  }

  /** Construct a {@link Parser} from the given token stream. */
  public construct(input: Token[]): Parser {
    return new Parser(input, this.prefixParselets, this.infixParselets);
  }
}

// =============================================================================
// Parser — Pratt parser core
// =============================================================================

/**
 * Pratt parser that converts a token stream into an AST of {@link Atom} nodes.
 */
export class Parser {
  private tokens: Token[];
  private readonly prefixParselets: Record<string, PrefixParselet>;
  private readonly infixParselets: Record<string, InfixParselet>;

  constructor(
    tokens: Token[],
    prefixParselets: Record<string, PrefixParselet>,
    infixParselets: Record<string, InfixParselet>,
  ) {
    this.tokens = tokens;
    this.prefixParselets = prefixParselets;
    this.infixParselets = infixParselets;
  }

  /** Returns true if there are more tokens to consume. */
  hasMore(): boolean {
    return this.tokens.length > 0;
  }

  /**
   * If the next token has the expected `id`, consume it and return `true`.
   * Otherwise return `false` without consuming.
   */
  match(expected: string): boolean {
    const token = this.peek();
    if (token?.id !== expected) {
      return false;
    }
    this.consume();
    return true;
  }

  /**
   * Core Pratt parsing loop.
   * Consumes one prefix token, then continues consuming infix tokens
   * as long as their precedence is lower (tighter) than the given threshold.
   *
   * @param precedence - The precedence ceiling (default: `Infinity` = parse everything).
   * @returns The parsed AST node.
   */
  consumeAndParse(precedence = Infinity): Atom {
    const token = this.consume();
    const prefix = this.prefixParselets[token.id];
    if (!prefix) {
      throw new Error(
        `Parse error at "${token.value}" (line ${token.line}, column ${token.column}). No matching prefix parselet.`,
      );
    }

    let left = prefix.parse(this, token);

    while (precedence > this.getPrecedence()) {
      const next = this.consume();
      const infix = this.getInfixParselet(next) as InfixParselet;
      left = (infix.parse as (parser: Parser, left: Atom, token: Token) => Atom)(this, left, next);
    }

    return left;
  }

  /** Returns the precedence of the next infix parselet, or `Infinity` if none. */
  getPrecedence(): number {
    const nextToken = this.peek();
    if (!nextToken) {
      return Infinity;
    }
    const parser = this.getInfixParselet(nextToken);
    if (parser) {
      return parser.precedence;
    }
    return Infinity;
  }

  /**
   * Consume the next token, optionally asserting its `id` and/or `value`.
   * Throws if no tokens remain or if the assertion fails.
   */
  consume(expectedId?: string, expectedValue?: string): Token {
    if (!this.tokens.length) {
      throw new Error('Cant consume unknown more tokens.');
    }
    if (expectedId && this.peek()?.id !== expectedId) {
      const actual = this.peek() as Token;
      throw new Error(
        `Expected ${expectedId} but got "${actual.id}" (${actual.value}) at line ${actual.line} column ${actual.column}.`,
      );
    }
    if (expectedValue && this.peek()?.value !== expectedValue) {
      const actual = this.peek() as Token;
      throw new Error(
        `Expected "${expectedValue}" but got "${actual.value}" at line ${actual.line} column ${actual.column}.`,
      );
    }
    return this.tokens.shift() as Token;
  }

  /** Peek at the next token without consuming it. */
  peek(): Token | undefined {
    return this.tokens.length > 0 ? this.tokens[0] : undefined;
  }

  /** Remove all Comment tokens from the stream. */
  removeComments(): void {
    this.tokens = this.tokens.filter((t) => t.id !== 'Comment');
  }

  /** Look up the infix parselet for a token (by id, or by value for Symbols). */
  getInfixParselet(token: Token): InfixParselet | undefined {
    return this.infixParselets[token.id === 'Symbol' ? token.value : token.id];
  }
}
