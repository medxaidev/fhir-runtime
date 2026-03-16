# fhir-runtime — Engine Capability Contract v0.9

> **Status:** Frozen for v0.9.0 Release  
> **FHIR Version:** R4 (4.0.1)  
> **Specification Date:** 2026-03-16  
> **Audience:** Node.js API consumers, CLI consumers, downstream server and persistence layers  
> **Reference Target:** HAPI FHIR R4 for structural equivalence where applicable

---

## 1. Scope

### 1.1 In-Scope (v0.9)

| #   | Capability                                              | Notes                                               |
| --- | ------------------------------------------------------- | --------------------------------------------------- |
| 1   | FHIR R4 JSON parsing and serialization                  | Unchanged from v0.8                                 |
| 2   | StructureDefinition registry and inheritance resolution | Unchanged from v0.8                                 |
| 3   | Snapshot generation                                     | Unchanged from v0.8                                 |
| 4   | Structural validation                                   | Unchanged from v0.8                                 |
| 5   | FHIRPath evaluation and invariant execution             | Unchanged from v0.8                                 |
| 6   | Bundle loading and core definition loading              | Unchanged from v0.8                                 |
| 7   | Provider Abstraction Layer (STAGE-1)                    | Unchanged from v0.8                                 |
| 8   | Default NoOp provider implementations                   | Unchanged from v0.8                                 |
| 9   | OperationOutcomeBuilder support                         | Unchanged from v0.8                                 |
| 10  | Optional validator provider hooks                       | Unchanged from v0.8                                 |
| 11  | Composable Validation Pipeline (STAGE-2)                | Unchanged from v0.8                                 |
| 12  | Built-in validation steps                               | Unchanged from v0.8                                 |
| 13  | Pipeline lifecycle hook system                          | Unchanged from v0.8                                 |
| 14  | Batch validation                                        | Unchanged from v0.8                                 |
| 15  | Enhanced error messages                                 | Unchanged from v0.8                                 |
| 16  | Structured validation reports                           | Unchanged from v0.8                                 |
| 17  | In-memory terminology provider (STAGE-3)                | Unchanged from v0.8                                 |
| 18  | Binding strength validation                             | Unchanged from v0.8                                 |
| 19  | CodeSystem and ValueSet registries                      | Unchanged from v0.8                                 |
| 20  | ValueSet membership evaluation                          | Unchanged from v0.8                                 |
| 21  | Bundle loading for terminology resources                | Unchanged from v0.8                                 |
| 22  | NPM-format IG package loading (STAGE-4)                 | Unchanged from v0.8                                 |
| 23  | Package manifest and index parsing                      | Unchanged from v0.8                                 |
| 24  | Package dependency resolution                           | Unchanged from v0.8                                 |
| 25  | Cross-package canonical URL resolution                  | Unchanged from v0.8                                 |
| 26  | PackageManager for multi-package workflows              | Unchanged from v0.8                                 |
| 27  | SearchParameter definition parsing (STAGE-5)            | Unchanged from v0.8                                 |
| 28  | SearchParameter batch parsing from Bundles              | Unchanged from v0.8                                 |
| 29  | FHIRPath-based search value extraction                  | Unchanged from v0.8                                 |
| 30  | Reference extraction from resources and Bundles         | Unchanged from v0.8                                 |
| 31  | Reference target type validation                        | Unchanged from v0.8                                 |
| 32  | CapabilityStatement REST fragment generation            | Unchanged from v0.8                                 |
| 33  | Resource type registry with FHIR R4 catalog             | Unchanged from v0.8                                 |
| 34  | DefinitionProvider interface (STAGE-6)                  | Unchanged from v0.8                                 |
| 35  | DefinitionBridge adapter                                | Unchanged from v0.8                                 |
| 36  | NoOpDefinitionProvider                                  | Unchanged from v0.8                                 |
| 37  | DefinitionProviderLoader                                | Unchanged from v0.8                                 |
| 38  | createRuntime() factory function                        | Unchanged from v0.8                                 |
| 39  | FhirRuntimeInstance unified interface                   | Extended in v0.9                                    |
| 40  | RemoteTerminologyProvider interface (STAGE-B)           | New in v0.9: contract for remote $expand/$validate-code/$lookup |
| 41  | Batch validation API — validateMany() (STAGE-B)        | New in v0.9: concurrent batch with failFast         |
| 42  | SnapshotCache lazy generation (STAGE-B)                | New in v0.9: on-demand + dedup                      |
| 43  | Snapshot warmup API (STAGE-B)                          | New in v0.9: warmupSnapshots() for server startup   |
| 44  | RuntimeOptions.snapshotMode (STAGE-B)                  | New in v0.9: 'eager' (default) or 'lazy'            |

### 1.2 Out-of-Scope (v0.9)

| #   | Excluded Capability                                          | Rationale                        |
| --- | ------------------------------------------------------------ | -------------------------------- |
| 1   | SQL generation / search index creation                       | Persistence-layer concern        |
| 2   | SearchParameter query execution                              | Persistence-layer concern        |
| 3   | Full CapabilityStatement resource generation                 | Server-layer concern             |
| 4   | REST routing / endpoint registration                         | Server-layer concern             |
| 5   | Remote terminology HTTP implementation                       | Server-layer concern (interface defined in v0.9) |
| 6   | .tgz package download from registry                          | CLI/server-layer concern         |
| 7   | ValueSet expansion (full)                                    | Future: fhir-terminology module  |
| 8   | Code validation against remote terminology servers           | Server-layer concern (interface defined in v0.9) |
| 9   | XML/RDF serialization                                        | Not planned                      |
| 10  | FHIR R5/R6 support                                           | Not planned for v0.x             |

---

## 2. Behavioral Guarantees — New in v0.9

### 2.1 RemoteTerminologyProvider Contract

**Interface**: `RemoteTerminologyProvider` (defined in fhir-runtime, implemented in fhir-server)

**Guarantees**:
1. fhir-runtime defines the interface only — zero HTTP calls in runtime
2. `setRemoteTerminologyProvider()` / `getRemoteTerminologyProvider()` on FhirRuntimeInstance
3. Optional: runtime functions without a remote provider (falls back to local)

### 2.2 validateMany() Contract

**Signature**: `validateMany(resources, options?) => Promise<BatchValidationResult>`

**Guarantees**:
1. Empty array returns `{ valid: true, results: [], errorCount: 0, warningCount: 0 }`
2. Results array has 1:1 correspondence with input array
3. `concurrency` controls chunk size (default: 4)
4. `failFast: true` stops at first error-level issue
5. Uses SnapshotCache — repeated profile URLs don't regenerate snapshots

### 2.3 SnapshotCache Contract

**Guarantees**:
1. Cache hit: O(1) Map lookup
2. Concurrent dedup: multiple requests for same URL share one Promise
3. `warmupSnapshots()` pre-generates snapshots for given resource types
4. `getSnapshotCacheSize()` returns current cached count
5. `snapshotMode: 'eager'` preserves v0.8 behavior (backward compatible)

---

## 3. Version History

| Version | Date       | Stage    | Key Additions                                    |
|---------|------------|----------|--------------------------------------------------|
| v0.3.0  | 2025-xx-xx | STAGE-1  | Provider Abstraction Layer                       |
| v0.4.0  | 2025-xx-xx | STAGE-2  | Validation Pipeline                              |
| v0.5.0  | 2025-xx-xx | STAGE-3  | Terminology Binding                              |
| v0.6.0  | 2025-xx-xx | STAGE-4  | IG Package Loading                               |
| v0.7.0  | 2026-03-10 | STAGE-5  | Server/Persistence Integration                   |
| v0.8.0  | 2026-03-12 | STAGE-6  | fhir-definition Integration                      |
| v0.9.0  | 2026-03-16 | STAGE-B  | fhir-server Prerequisites                        |

---

**Last Updated:** 2026-03-16  
**Status:** Frozen  
**Next Review:** v1.0.0
