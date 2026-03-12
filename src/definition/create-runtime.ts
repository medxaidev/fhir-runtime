/**
 * fhir-definition — createRuntime() Factory
 *
 * Convenience factory function that creates a fully configured
 * fhir-runtime instance with a DefinitionProvider, FhirContext,
 * TerminologyProvider, and ReferenceResolver.
 *
 * Supports three usage patterns:
 * 1. With external DefinitionProvider (e.g., from fhir-definition)
 * 2. With FhirContext (legacy/standalone mode)
 * 3. Bare minimum (auto-creates everything with defaults)
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
 *
 * @module fhir-definition
 */

import type { DefinitionProvider, SearchParameter as FhirDefSP } from 'fhir-definition';

import type { Resource } from '../model/index.js';
import type {
  RuntimeOptions,
  FhirRuntimeInstance,
} from './types.js';
import type { FhirContext } from '../context/index.js';
import { FhirContextImpl, MemoryLoader } from '../context/index.js';
import type { TerminologyProvider, ReferenceResolver } from '../provider/index.js';
import { NoOpTerminologyProvider, NoOpReferenceResolver } from '../provider/index.js';
import type { ValidationResult } from '../validator/index.js';
import { StructureValidator } from '../validator/index.js';
import { buildCanonicalProfile } from '../profile/index.js';
import { SnapshotGenerator } from '../profile/index.js';
import type { SearchParameter as RuntimeSP, SearchIndexEntry } from '../integration/index.js';
import { extractSearchValues } from '../integration/index.js';
import { DefinitionBridge } from './definition-bridge.js';
import { DefinitionProviderLoader } from './definition-provider-loader.js';

// =============================================================================
// createRuntime
// =============================================================================

/**
 * Create a fully configured fhir-runtime instance.
 *
 * Usage patterns:
 *
 * **Pattern 1**: With external DefinitionProvider (recommended)
 * ```typescript
 * import { InMemoryDefinitionRegistry } from 'fhir-definition';
 * const registry = new InMemoryDefinitionRegistry();
 * // ... load definitions ...
 * const runtime = await createRuntime({ definitions: registry });
 * ```
 *
 * **Pattern 2**: With FhirContext (legacy/standalone)
 * ```typescript
 * const runtime = await createRuntime({ context });
 * ```
 *
 * **Pattern 3**: Bare minimum (auto-creates everything)
 * ```typescript
 * const runtime = await createRuntime();
 * ```
 *
 * @param options - Configuration options. All fields are optional.
 * @returns A fully configured FhirRuntimeInstance.
 */
export async function createRuntime(
  options?: RuntimeOptions,
): Promise<FhirRuntimeInstance> {
  const opts = options ?? {};
  const preloadCore = opts.preloadCore ?? true;

  // Resolve DefinitionProvider and FhirContext
  let definitions: DefinitionProvider;
  let context: FhirContext;

  if (opts.definitions) {
    // Pattern 1: External DefinitionProvider (from fhir-definition)
    definitions = opts.definitions;

    if (opts.context) {
      // User provided both — use as-is
      context = opts.context;
    } else {
      // Auto-create FhirContext backed by the DefinitionProvider
      const loader = new DefinitionProviderLoader(definitions);
      context = new FhirContextImpl({ loaders: [loader] });
    }

    if (preloadCore) {
      await context.preloadCoreDefinitions();
    }
  } else if (opts.context) {
    // Pattern 2: Legacy FhirContext mode
    context = opts.context;
    definitions = new DefinitionBridge({ context });
  } else {
    // Pattern 3: Bare minimum — create everything from defaults
    const emptyLoader = new MemoryLoader(new Map());
    context = new FhirContextImpl({ loaders: [emptyLoader] });

    if (preloadCore) {
      await context.preloadCoreDefinitions();
    }

    definitions = new DefinitionBridge({ context });
  }

  // Resolve providers with NoOp defaults
  const terminology: TerminologyProvider =
    opts.terminology ?? new NoOpTerminologyProvider();
  const referenceResolver: ReferenceResolver =
    opts.referenceResolver ?? new NoOpReferenceResolver();

  // Pre-create shared validator and snapshot generator
  const validator = new StructureValidator();
  const snapshotGenerator = new SnapshotGenerator(context);

  // Build the runtime instance
  const instance: FhirRuntimeInstance = {
    definitions,
    context,
    terminology,
    referenceResolver,

    async validate(
      resource: Resource,
      profileUrl: string,
    ): Promise<ValidationResult> {
      // 1. Load StructureDefinition
      const sd = await context.loadStructureDefinition(profileUrl);

      // 2. Generate snapshot if needed
      const snapshotResult = await snapshotGenerator.generate(sd);
      const snapshotSd = snapshotResult.structureDefinition;

      // 3. Build CanonicalProfile
      const profile = buildCanonicalProfile(snapshotSd);

      // 4. Run structural validation
      return validator.validate(resource, profile);
    },

    getSearchParameters(resourceType: string): FhirDefSP[] {
      return definitions.getSearchParameters(resourceType);
    },

    extractSearchValues(
      resource: Resource,
      searchParam: RuntimeSP,
    ): SearchIndexEntry {
      return extractSearchValues(resource, searchParam);
    },
  };

  return instance;
}
