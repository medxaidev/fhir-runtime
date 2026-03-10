/**
 * SearchParameter Parser
 *
 * Parses FHIR SearchParameter JSON resources into typed objects.
 * Supports single resource parsing and batch parsing from Bundles.
 *
 * @module integration
 */

import type { ParseResult } from '../parser/index.js';
import { parseSuccess, parseFailure, createIssue } from '../parser/index.js';
import type { SearchParameter, SearchParamType } from './types.js';

const VALID_SEARCH_PARAM_TYPES: ReadonlySet<string> = new Set([
  'number', 'date', 'string', 'token', 'reference',
  'composite', 'quantity', 'uri', 'special',
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'draft', 'active', 'retired', 'unknown',
]);

/**
 * Parse a single SearchParameter from a JSON object.
 */
export function parseSearchParameter(json: unknown): ParseResult<SearchParameter> {
  if (!json || typeof json !== 'object') {
    return parseFailure([
      createIssue('error', 'INVALID_JSON', 'SearchParameter must be a non-null object', '$'),
    ]);
  }

  const obj = json as Record<string, unknown>;

  if (obj.resourceType !== 'SearchParameter') {
    return parseFailure([
      createIssue('error', 'UNKNOWN_RESOURCE_TYPE',
        `Expected resourceType 'SearchParameter', got '${String(obj.resourceType)}'`,
        'SearchParameter.resourceType'),
    ]);
  }

  const issues: Array<ReturnType<typeof createIssue>> = [];

  // Required fields
  const url = typeof obj.url === 'string' ? obj.url : undefined;
  if (!url) {
    issues.push(createIssue('error', 'INVALID_STRUCTURE', 'SearchParameter.url is required', 'SearchParameter.url'));
  }

  const name = typeof obj.name === 'string' ? obj.name : undefined;
  if (!name) {
    issues.push(createIssue('error', 'INVALID_STRUCTURE', 'SearchParameter.name is required', 'SearchParameter.name'));
  }

  const code = typeof obj.code === 'string' ? obj.code : undefined;
  if (!code) {
    issues.push(createIssue('error', 'INVALID_STRUCTURE', 'SearchParameter.code is required', 'SearchParameter.code'));
  }

  const status = typeof obj.status === 'string' ? obj.status : undefined;
  if (!status || !VALID_STATUSES.has(status)) {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE',
      `SearchParameter.status must be one of: draft, active, retired, unknown. Got '${String(obj.status)}'`,
      'SearchParameter.status'));
  }

  const type = typeof obj.type === 'string' ? obj.type : undefined;
  if (!type || !VALID_SEARCH_PARAM_TYPES.has(type)) {
    issues.push(createIssue('error', 'INVALID_PRIMITIVE',
      `SearchParameter.type must be a valid search param type. Got '${String(obj.type)}'`,
      'SearchParameter.type'));
  }

  let base: string[] | undefined;
  if (Array.isArray(obj.base) && obj.base.every((b: unknown) => typeof b === 'string')) {
    base = obj.base as string[];
  } else {
    issues.push(createIssue('error', 'INVALID_STRUCTURE',
      'SearchParameter.base must be an array of strings',
      'SearchParameter.base'));
  }

  if (issues.some(i => i.severity === 'error')) {
    return parseFailure(issues);
  }

  const result: SearchParameter = {
    resourceType: 'SearchParameter',
    url: url!,
    name: name!,
    status: status as SearchParameter['status'],
    code: code!,
    base: base!,
    type: type as SearchParamType,
  };

  if (typeof obj.id === 'string') result.id = obj.id;
  if (typeof obj.description === 'string') result.description = obj.description;
  if (typeof obj.expression === 'string') result.expression = obj.expression;
  if (typeof obj.version === 'string') result.version = obj.version;
  if (typeof obj.multipleOr === 'boolean') result.multipleOr = obj.multipleOr;
  if (typeof obj.multipleAnd === 'boolean') result.multipleAnd = obj.multipleAnd;

  if (Array.isArray(obj.target) && obj.target.every((t: unknown) => typeof t === 'string')) {
    result.target = obj.target as string[];
  }
  if (Array.isArray(obj.modifier) && obj.modifier.every((m: unknown) => typeof m === 'string')) {
    result.modifier = obj.modifier as string[];
  }
  if (Array.isArray(obj.chain) && obj.chain.every((c: unknown) => typeof c === 'string')) {
    result.chain = obj.chain as string[];
  }

  return parseSuccess(result, issues);
}

/**
 * Parse SearchParameters from a FHIR Bundle JSON object.
 * Extracts all entries with resourceType 'SearchParameter'.
 */
export function parseSearchParametersFromBundle(bundle: unknown): ParseResult<SearchParameter[]> {
  if (!bundle || typeof bundle !== 'object') {
    return parseFailure([
      createIssue('error', 'INVALID_JSON', 'Bundle must be a non-null object', 'Bundle'),
    ]);
  }

  const obj = bundle as Record<string, unknown>;

  if (obj.resourceType !== 'Bundle') {
    return parseFailure([
      createIssue('error', 'UNKNOWN_RESOURCE_TYPE',
        `Expected resourceType 'Bundle', got '${String(obj.resourceType)}'`,
        'Bundle.resourceType'),
    ]);
  }

  const entries = Array.isArray(obj.entry) ? obj.entry : [];
  const results: SearchParameter[] = [];
  const allIssues: Array<ReturnType<typeof createIssue>> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Record<string, unknown> | undefined;
    const resource = entry?.resource as Record<string, unknown> | undefined;

    if (!resource || resource.resourceType !== 'SearchParameter') {
      continue;
    }

    const parsed = parseSearchParameter(resource);
    if (parsed.success && parsed.data) {
      results.push(parsed.data);
    }
    if (parsed.issues) {
      for (const issue of parsed.issues) {
        allIssues.push(createIssue(
          issue.severity,
          issue.code,
          `Bundle.entry[${i}]: ${issue.message}`,
          issue.path,
        ));
      }
    }
  }

  if (allIssues.some(i => i.severity === 'error') && results.length === 0) {
    return parseFailure(allIssues);
  }

  return parseSuccess(results, allIssues);
}
