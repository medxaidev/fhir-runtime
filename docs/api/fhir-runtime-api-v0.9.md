# fhir-runtime — API Reference v0.9

> **Package:** `fhir-runtime@0.9.0`  
> **FHIR Version:** R4 (4.0.1)  
> **Release Date:** 2026-03-16  
> **License:** MIT  
> **Node.js:** >=18.0.0  
> **Module Format:** ESM (primary) + CJS (compatibility)  
> **Dependencies:** `fhir-definition@0.6.0`  
> **Companion Document:** `docs/specs/engine-capability-contract-v0.9.md`

This document is the public API reference for `fhir-runtime` at `v0.9.0`.

Compared with `v0.8.1`, this release adds the completed **fhir-server Prerequisites (STAGE-B)**:

- `RemoteTerminologyProvider` — interface for delegating terminology operations to remote servers
- `validateMany()` — batch validation API with concurrency control and fail-fast
- `SnapshotCache` — lazy snapshot generation with concurrent deduplication
- `warmupSnapshots()` / `getSnapshotCacheSize()` — server-side snapshot management
- `setRemoteTerminologyProvider()` / `getRemoteTerminologyProvider()` — runtime injection points

Any symbol not exported from `src/index.ts` remains internal and may change without notice.

---

## Table of Contents

1. [Top-Level Export Surface](#1-top-level-export-surface)
2. [Modules 1–12: Unchanged](#2-12-modules-unchanged)
3. [v0.9 Additions: Provider Module](#13-v09-additions-provider-module)
4. [v0.9 Additions: Definition Module](#14-v09-additions-definition-module)
5. [Compatibility Notes](#15-compatibility-notes)

---

## 1. Top-Level Export Surface

### 1.1 Core Runtime Exports

- `model`, `parser`, `context`, `profile`, `validator`, `fhirpath`
- `provider` (STAGE-1: v0.3.0, **extended in v0.9.0**)
- `terminology` (STAGE-3: v0.5.0)
- `package` (STAGE-4: v0.6.0)
- `integration` (STAGE-5: v0.7.0)
- `pipeline` (STAGE-2: v0.4.0)
- `definition` (STAGE-6: v0.8.0, **extended in v0.9.0**)

### 1.2 Export Count

| Version | Modules | Type Exports | Value Exports | Total |
|---------|---------|-------------|---------------|-------|
| v0.7.0  | 11      | 177         | 142           | ~319  |
| v0.8.0  | 12      | 188         | 146           | ~334  |
| v0.9.0  | 12      | 198         | 147           | ~350  |

---

## 2–12. Modules: model, parser, context, profile, validator, fhirpath, provider, terminology, package, pipeline, integration, definition

See [fhir-runtime-api-v0.8.md](./fhir-runtime-api-v0.8.md) — unchanged from v0.8.

---

## 13. v0.9 Additions: Provider Module

**Source:** `src/provider/remote-terminology-provider.ts`  
**Added in:** v0.9.0 (STAGE-B)

### 13.1 RemoteTerminologyProvider Interface

| Method | Signature | Description |
|--------|-----------|-------------|
| `expandValueSet` | `(params: RemoteExpandParams) => Promise<unknown>` | Delegate $expand to remote server |
| `validateCode` | `(params: RemoteValidateCodeParams) => Promise<RemoteValidateCodeResult>` | Delegate $validate-code |
| `lookupCode` | `(params: RemoteLookupParams) => Promise<RemoteLookupResult>` | Delegate $lookup |

### 13.2 Parameter Types

| Type | Key Fields |
|------|------------|
| `RemoteExpandParams` | url?, valueSet?, filter?, count?, offset?, displayLanguage?, includeDesignations? |
| `RemoteValidateCodeParams` | code, url?, system?, display?, version? |
| `RemoteValidateCodeResult` | result: boolean, message?, display? |
| `RemoteLookupParams` | code, system, version?, displayLanguage? |
| `RemoteLookupResult` | name, display?, definition?, designation?, property? |

---

## 14. v0.9 Additions: Definition Module

### 14.1 BatchValidation Types

| Type | Description |
|------|-------------|
| `BatchValidationOptions` | `{ concurrency?: number, failFast?: boolean }` |
| `BatchValidationResult` | `{ valid: boolean, results: ValidationResult[], errorCount: number, warningCount: number }` |

### 14.2 FhirRuntimeInstance — New Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `validateMany` | `(resources: {resource, profileUrl}[], options?) => Promise<BatchValidationResult>` | Batch validation with concurrency |
| `setRemoteTerminologyProvider` | `(provider: RemoteTerminologyProvider) => void` | Inject remote terminology |
| `getRemoteTerminologyProvider` | `() => RemoteTerminologyProvider \| undefined` | Get registered provider |
| `warmupSnapshots` | `(resourceTypes: string[]) => Promise<void>` | Pre-warm snapshot cache |
| `getSnapshotCacheSize` | `() => number` | Monitor cached snapshots |

### 14.3 RuntimeOptions — New Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `snapshotMode` | `'eager' \| 'lazy'` | `'eager'` | Snapshot generation strategy |

### 14.4 SnapshotCache Class

| Method | Signature | Description |
|--------|-----------|-------------|
| `getSnapshot` | `(sdUrl, generator) => Promise<StructureDefinition>` | Get or generate snapshot |
| `has` | `(sdUrl: string) => boolean` | Check cache hit |
| `size` | `() => number` | Number of cached entries |
| `clear` | `() => void` | Clear all cached snapshots |

---

## 15. Compatibility Notes

### 15.1 Backward Compatibility

**v0.9.0 is fully backward compatible with v0.8.x.** All existing APIs remain unchanged.

### 15.2 Dependency Change

- **v0.8.1**: `fhir-definition@0.5.0`
- **v0.9.0**: `fhir-definition@0.6.0`

---

**Last Updated:** 2026-03-16  
**Status:** Stable  
**Next Release:** TBD
