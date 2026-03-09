/**
 * fhir-terminology — InMemoryTerminologyProvider
 *
 * A fully functional in-memory implementation of {@link TerminologyProvider}
 * that stores CodeSystems and ValueSets locally.
 *
 * Suitable for testing, small-scale embedded ValueSets, and offline validation.
 * NOT suitable for large terminology systems (e.g., full SNOMED CT).
 *
 * @module fhir-terminology
 */

import type {
  TerminologyProvider,
  ValidateCodeParams,
  ValidateCodeResult,
  ExpandValueSetParams,
  ValueSetExpansion,
  ValueSetExpansionContains,
  LookupCodeParams,
  LookupCodeResult,
} from '../provider/types.js';
import type { CodeSystemDefinition, ValueSetDefinition } from './types.js';
import { CodeSystemRegistry } from './codesystem-registry.js';
import { ValueSetRegistry } from './valueset-registry.js';
import { isCodeInValueSet } from './valueset-membership.js';

// =============================================================================
// InMemoryTerminologyProvider
// =============================================================================

/**
 * In-memory implementation of TerminologyProvider.
 *
 * Stores CodeSystem and ValueSet definitions in memory and performs
 * code validation, ValueSet expansion, and code lookup locally.
 */
export class InMemoryTerminologyProvider implements TerminologyProvider {
  private readonly csRegistry = new CodeSystemRegistry();
  private readonly vsRegistry = new ValueSetRegistry();

  // ─── Registration ─────────────────────────────────────────────────────

  /**
   * Register a CodeSystem definition.
   */
  registerCodeSystem(cs: CodeSystemDefinition): void {
    this.csRegistry.register(cs);
  }

  /**
   * Register a ValueSet definition.
   */
  registerValueSet(vs: ValueSetDefinition): void {
    this.vsRegistry.register(vs);
  }

  /**
   * Load CodeSystems and ValueSets from a FHIR Bundle.
   *
   * Scans the bundle entries for resources with resourceType
   * 'CodeSystem' or 'ValueSet' and registers them.
   */
  loadFromBundle(bundle: unknown): void {
    if (!bundle || typeof bundle !== 'object') return;
    const b = bundle as Record<string, unknown>;
    const entries = b['entry'];
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const resource = (entry as Record<string, unknown>)['resource'];
      if (!resource || typeof resource !== 'object') continue;
      const rt = (resource as Record<string, unknown>)['resourceType'];

      if (rt === 'CodeSystem') {
        const cs = parseCodeSystemFromResource(resource as Record<string, unknown>);
        if (cs) this.csRegistry.register(cs);
      } else if (rt === 'ValueSet') {
        const vs = parseValueSetFromResource(resource as Record<string, unknown>);
        if (vs) this.vsRegistry.register(vs);
      }
    }
  }

  // ─── Accessors ────────────────────────────────────────────────────────

  /**
   * Get the internal CodeSystem registry (for advanced use).
   */
  getCodeSystemRegistry(): CodeSystemRegistry {
    return this.csRegistry;
  }

  /**
   * Get the internal ValueSet registry (for advanced use).
   */
  getValueSetRegistry(): ValueSetRegistry {
    return this.vsRegistry;
  }

  // ─── TerminologyProvider interface ────────────────────────────────────

  async validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult> {
    const { system, code, valueSetUrl, display } = params;

    // If valueSetUrl is provided, check membership
    if (valueSetUrl) {
      const vs = this.vsRegistry.get(valueSetUrl);
      if (!vs) {
        return { result: false, message: `ValueSet '${valueSetUrl}' not found.` };
      }

      // When system is empty (plain code string), try all systems in the ValueSet
      let isMember = false;
      let resolvedSystem = system;
      if (!system && vs.compose) {
        for (const inc of vs.compose.include) {
          if (isCodeInValueSet(vs, inc.system, code, this.csRegistry)) {
            isMember = true;
            resolvedSystem = inc.system;
            break;
          }
        }
      } else if (!system && vs.expansion) {
        const match = vs.expansion.contains.find((c) => c.code === code);
        if (match) {
          isMember = true;
          resolvedSystem = match.system;
        }
      } else {
        isMember = isCodeInValueSet(vs, system, code, this.csRegistry);
      }

      if (!isMember) {
        return {
          result: false,
          message: `Code '${code}' from system '${system}' is not in ValueSet '${valueSetUrl}'.`,
        };
      }

      // Optionally validate display
      const concept = this.csRegistry.lookupCode(resolvedSystem, code);
      if (display && concept?.display && concept.display !== display) {
        return {
          result: true,
          message: `Code is valid but display '${display}' does not match preferred display '${concept.display}'.`,
          display: concept.display,
        };
      }

      return {
        result: true,
        message: `Code '${code}' is valid in ValueSet '${valueSetUrl}'.`,
        display: concept?.display,
      };
    }

    // No valueSetUrl → validate code exists in CodeSystem
    const concept = this.csRegistry.lookupCode(system, code);
    if (!concept) {
      return {
        result: false,
        message: `Code '${code}' not found in CodeSystem '${system}'.`,
      };
    }

    return {
      result: true,
      message: `Code '${code}' found in CodeSystem '${system}'.`,
      display: concept.display,
    };
  }

  async expandValueSet(params: ExpandValueSetParams): Promise<ValueSetExpansion> {
    const vs = this.vsRegistry.get(params.url);
    if (!vs) {
      return { contains: [] };
    }

    // If already expanded, use expansion directly
    if (vs.expansion) {
      let contains: readonly ValueSetExpansionContains[] = vs.expansion.contains.map((c) => ({
        system: c.system,
        code: c.code,
        display: c.display,
      }));

      // Apply text filter
      if (params.filter) {
        const f = params.filter.toLowerCase();
        contains = contains.filter(
          (c) =>
            c.code.toLowerCase().includes(f) ||
            (c.display?.toLowerCase().includes(f) ?? false),
        );
      }

      const total = contains.length;

      // Apply pagination
      const offset = params.offset ?? 0;
      const count = params.count ?? contains.length;
      contains = contains.slice(offset, offset + count);

      return { total, contains };
    }

    // Build expansion from compose
    if (vs.compose) {
      const allContains: ValueSetExpansionContains[] = [];

      for (const inc of vs.compose.include) {
        if (inc.concept) {
          for (const c of inc.concept) {
            allContains.push({ system: inc.system, code: c.code, display: c.display });
          }
        } else {
          // Include entire CodeSystem
          const codes = this.csRegistry.allCodes(inc.system);
          for (const code of codes) {
            const concept = this.csRegistry.lookupCode(inc.system, code);
            allContains.push({ system: inc.system, code, display: concept?.display });
          }
        }
      }

      // Apply exclude
      let result = allContains;
      if (vs.compose.exclude) {
        for (const exc of vs.compose.exclude) {
          if (exc.concept) {
            const excludeCodes = new Set(exc.concept.map((c) => `${exc.system}|${c.code}`));
            result = result.filter((c) => !excludeCodes.has(`${c.system}|${c.code}`));
          }
        }
      }

      // Apply text filter
      if (params.filter) {
        const f = params.filter.toLowerCase();
        result = result.filter(
          (c) =>
            c.code.toLowerCase().includes(f) ||
            (c.display?.toLowerCase().includes(f) ?? false),
        );
      }

      const total = result.length;
      const offset = params.offset ?? 0;
      const count = params.count ?? result.length;

      return { total, contains: result.slice(offset, offset + count) };
    }

    return { contains: [] };
  }

  async lookupCode(params: LookupCodeParams): Promise<LookupCodeResult> {
    const concept = this.csRegistry.lookupCode(params.system, params.code);
    if (!concept) {
      return { found: false };
    }
    return {
      found: true,
      display: concept.display,
      definition: concept.definition,
    };
  }
}

// =============================================================================
// Bundle Parsing Helpers
// =============================================================================

function parseCodeSystemFromResource(r: Record<string, unknown>): CodeSystemDefinition | undefined {
  const url = r['url'];
  if (typeof url !== 'string') return undefined;

  const concepts = parseConcepts(r['concept'] ?? r['concepts']);

  return {
    url,
    version: typeof r['version'] === 'string' ? r['version'] : undefined,
    name: typeof r['name'] === 'string' ? r['name'] : undefined,
    concepts,
  };
}

function parseConcepts(raw: unknown): CodeSystemDefinition['concepts'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === 'object' && typeof c['code'] === 'string')
    .map((c) => {
      const obj = c as Record<string, unknown>;
      return {
        code: obj['code'] as string,
        display: typeof obj['display'] === 'string' ? obj['display'] : undefined,
        definition: typeof obj['definition'] === 'string' ? obj['definition'] : undefined,
        children: parseConcepts(obj['concept'] ?? obj['children']),
      };
    });
}

function parseValueSetFromResource(r: Record<string, unknown>): ValueSetDefinition | undefined {
  const url = r['url'];
  if (typeof url !== 'string') return undefined;

  const vs: ValueSetDefinition = {
    url,
    version: typeof r['version'] === 'string' ? r['version'] : undefined,
    name: typeof r['name'] === 'string' ? r['name'] : undefined,
  };

  // Parse compose
  const compose = r['compose'];
  if (compose && typeof compose === 'object') {
    const composeObj = compose as Record<string, unknown>;
    const include = parseComposeIncludes(composeObj['include']);
    const exclude = parseComposeIncludes(composeObj['exclude']);
    (vs as { compose: ValueSetDefinition['compose'] }).compose = {
      include,
      ...(exclude.length > 0 ? { exclude } : {}),
    };
  }

  // Parse expansion
  const expansion = r['expansion'];
  if (expansion && typeof expansion === 'object') {
    const expObj = expansion as Record<string, unknown>;
    const contains = parseExpansionContains(expObj['contains']);
    (vs as { expansion: ValueSetDefinition['expansion'] }).expansion = {
      total: typeof expObj['total'] === 'number' ? expObj['total'] : undefined,
      contains,
    };
  }

  return vs;
}

function parseComposeIncludes(raw: unknown): import('./types.js').ValueSetComposeInclude[] {
  if (!Array.isArray(raw)) return [];
  const result: import('./types.js').ValueSetComposeInclude[] = [];

  for (const inc of raw) {
    if (!inc || typeof inc !== 'object') continue;
    const obj = inc as Record<string, unknown>;
    if (typeof obj['system'] !== 'string') continue;

    let concept: { code: string; display?: string }[] | undefined;
    if (Array.isArray(obj['concept'])) {
      concept = [];
      for (const c of obj['concept']) {
        if (c && typeof c === 'object' && typeof (c as Record<string, unknown>)['code'] === 'string') {
          const co = c as Record<string, unknown>;
          concept.push({
            code: co['code'] as string,
            display: typeof co['display'] === 'string' ? co['display'] : undefined,
          });
        }
      }
    }

    let filter: import('./types.js').ValueSetComposeFilter[] | undefined;
    if (Array.isArray(obj['filter'])) {
      filter = [];
      for (const f of obj['filter']) {
        if (f && typeof f === 'object') {
          const fo = f as Record<string, unknown>;
          filter.push({
            property: typeof fo['property'] === 'string' ? fo['property'] : '',
            op: (typeof fo['op'] === 'string' ? fo['op'] : '=') as import('./types.js').ValueSetComposeFilter['op'],
            value: typeof fo['value'] === 'string' ? fo['value'] : '',
          });
        }
      }
    }

    result.push({
      system: obj['system'] as string,
      version: typeof obj['version'] === 'string' ? obj['version'] : undefined,
      ...(concept ? { concept } : {}),
      ...(filter ? { filter } : {}),
    });
  }

  return result;
}

function parseExpansionContains(raw: unknown): { system: string; code: string; display?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === 'object' && typeof c['system'] === 'string' && typeof c['code'] === 'string')
    .map((c) => {
      const obj = c as Record<string, unknown>;
      return {
        system: obj['system'] as string,
        code: obj['code'] as string,
        display: typeof obj['display'] === 'string' ? obj['display'] : undefined,
      };
    });
}
