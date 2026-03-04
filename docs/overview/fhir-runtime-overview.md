# fhir-runtime — Technical Overview

> **Package:** `fhir-runtime`  
> **Version:** 0.2.0  
> **FHIR Version:** R4 (4.0.1)  
> **Runtime:** Node.js >=18.0.0  
> **Language:** TypeScript 5.9  
> **License:** MIT

---

## What is fhir-runtime?

`fhir-runtime` is a **structural FHIR R4 engine** for TypeScript/Node.js. It provides the foundational capabilities needed to parse, validate, and manipulate FHIR R4 resources — without requiring a running FHIR server, database, or external terminology service.

It is designed as a pure runtime layer with no database or HTTP dependencies, making it suitable for embedding in:

- **Servers** — validation gate for REST FHIR operations
- **CLIs** — parse, validate, generate snapshots, evaluate FHIRPath
- **Web applications** — client-side FHIR processing
- **Custom platforms** — embedded FHIR capabilities

### HAPI FHIR Equivalence

The library targets **structural equivalence** with [HAPI FHIR](https://hapifhir.io/) (Java), the de facto reference implementation for FHIR tooling:

| fhir-runtime         | HAPI FHIR                                         |
| -------------------- | ------------------------------------------------- |
| `FhirContextImpl`    | `FhirContext` + `DefaultProfileValidationSupport` |
| `SnapshotGenerator`  | `ProfileUtilities.generateSnapshot()`             |
| `StructureValidator` | `FhirInstanceValidator`                           |
| `evalFhirPath()`     | `FHIRPathEngine.evaluate()`                       |
| `CompositeLoader`    | `ValidationSupportChain`                          |

Snapshot generation has been validated against 35 HAPI-generated fixtures with 100% pass rate.

---

## Architecture

### Module Structure

```
src/
├── model/        ← FHIR R4 type definitions (branded primitives, enums, complex types)
├── parser/       ← JSON parsing & serialization
├── context/      ← SD registry, loaders, inheritance resolution, bundle loading
├── profile/      ← Snapshot generation, canonical builder, constraint merging
├── validator/    ← Structural validation (9 rules + FHIRPath invariants)
└── fhirpath/     ← FHIRPath expression engine (Pratt parser, 60+ functions)
```

### Dependency Direction

```
model ← parser ← context ← profile ← validator
                                  ↑
                              fhirpath
```

Strictly enforced: each module may only import from modules to its left. The `fhirpath` module is used by `validator` for invariant evaluation.

### Key Design Principles

1. **No external runtime dependencies** — Zero npm dependencies. All FHIR logic is self-contained.
2. **Structured results over exceptions** — `ParseResult`, `SnapshotResult`, `ValidationResult` instead of throws.
3. **Deterministic** — Same input always produces same output. No global state, no side effects.
4. **Snapshot-driven validation** — The validator operates on `CanonicalProfile` (resolved snapshot), not raw StructureDefinitions.
5. **CanonicalProfile as semantic model** — A pre-resolved, O(1)-lookup representation converting FHIR's verbose SD structure into an efficient runtime model.

---

## Capabilities

### 1. Parsing & Serialization

Parse FHIR R4 JSON with full support for:

- Primitive `_element` split (value + extension objects)
- Choice type `[x]` dispatch and tagging
- Null alignment in sparse arrays
- StructureDefinition-specific parsing (37 ElementDefinition fields)

```typescript
import { parseFhirJson, serializeToFhirJson } from "fhir-runtime";

const result = parseFhirJson(jsonString);
if (result.success) {
  const resource = result.data;
  const roundTripped = serializeToFhirJson(resource);
}
```

### 2. Context & Registry

Manage StructureDefinition lifecycle — loading, caching, registration, and inheritance chain resolution.

```typescript
import { FhirContextImpl, MemoryLoader } from "fhir-runtime";

const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(sdMap)] });
await ctx.preloadCoreDefinitions(); // 73 bundled R4 base definitions

const patient = await ctx.loadStructureDefinition(
  "http://hl7.org/fhir/StructureDefinition/Patient",
);
const chain = await ctx.resolveInheritanceChain(patient.url!);
// → [Patient, DomainResource, Resource]
```

Three loader implementations: `MemoryLoader`, `FileSystemLoader`, `CompositeLoader` (chain of responsibility, equivalent to HAPI's `ValidationSupportChain`).

### 3. Snapshot Generation

Generate complete snapshots by expanding differentials against base definition chains. HAPI-semantically-equivalent.

```typescript
import { SnapshotGenerator } from "fhir-runtime";

const generator = new SnapshotGenerator(ctx, { generateCanonical: true });
const result = await generator.generate(myProfile);

if (result.success) {
  const snapshot = result.structureDefinition.snapshot;
  const canonical = result.canonical; // CanonicalProfile for validation
}
```

Supports: base-driven merge, constraint tightening, slicing (extension/type/value), circular dependency detection, unconsumed differential detection.

### 4. Structural Validation

Validate FHIR resource instances against CanonicalProfiles with 9 validation rules:

```typescript
import { StructureValidator, buildCanonicalProfile } from "fhir-runtime";

const validator = new StructureValidator({ skipInvariants: false });
const profile = buildCanonicalProfile(patientSD);
const result = validator.validate(patientResource, profile);

if (!result.valid) {
  for (const issue of result.issues) {
    console.error(`${issue.severity}: ${issue.message} at ${issue.path}`);
  }
}
```

**Validation rules:** cardinality, required elements, type compatibility, fixed values, pattern values, choice types, reference targets, slicing discriminators, FHIRPath invariants.

### 5. FHIRPath Expression Engine

Parse and evaluate FHIRPath expressions with 60+ standard functions, built on a Pratt parser with AST caching.

```typescript
import { evalFhirPath, evalFhirPathBoolean } from "fhir-runtime";

const names = evalFhirPath("Patient.name.given", patient);
// → ['John', 'Jane']

const isValid = evalFhirPathBoolean(
  "name.where(use='official').exists()",
  patient,
);
// → true
```

Covers FHIRPath §5.1–5.9, §6.3, §6.5, plus FHIR-specific functions (`resolve`, `extension`, `hasValue`).

### 6. InnerType Schema (CanonicalProfile + BackboneElement)

Extract BackboneElement inner types from profiles for downstream consumption (UI forms, recursive validation):

```typescript
import { extractInnerTypes, buildCanonicalProfile } from "fhir-runtime";

const profile = buildCanonicalProfile(patientSD);
const innerTypes = extractInnerTypes(profile);
// PatientContact, PatientCommunication, PatientLink

const ctx = new FhirContextImpl({ loaders: [] });
ctx.registerCanonicalProfile(profile);
const contactSchema = ctx.getInnerType("PatientContact");
```

---

## Bundle Loading

Load FHIR specification bundles (e.g., `profiles-resources.json`) to populate registries:

```typescript
import { loadBundleFromFile } from "fhir-runtime";

const result = loadBundleFromFile("spec/fhir/r4/profiles-resources.json", {
  filterKind: "resource",
  excludeAbstract: true,
});
// result.profiles: CanonicalProfile[] (146 resource types)
// result.stats: { total, loaded, skipped, failed }
```

---

## Error Handling

All capabilities return structured results instead of throwing:

| Capability | Result Type        | Success Check |
| ---------- | ------------------ | ------------- |
| Parsing    | `ParseResult<T>`   | `.success`    |
| Snapshot   | `SnapshotResult`   | `.success`    |
| Validation | `ValidationResult` | `.valid`      |

Three error class hierarchies for exceptional cases:

- `ContextError` → `ResourceNotFoundError`, `CircularDependencyError`, `LoaderError`, `InvalidStructureDefinitionError`
- `ProfileError` → `SnapshotCircularDependencyError`, `BaseNotFoundError`, `ConstraintViolationError`, `UnconsumedDifferentialError`
- `ValidatorError` → `ProfileNotFoundError`, `ValidationFailedError`

---

## Testing & Quality Assurance

`fhir-runtime` has undergone extensive testing to ensure production readiness:

### Test Coverage

- **2,400+ unit tests** across all modules
- **45 test files** covering parser, context, profile, validator, and FHIRPath
- **100% pass rate** on HAPI-generated snapshot fixtures (35/35)

### US Core IG Verification

- **70 US Core StructureDefinitions** successfully parsed
- **55 resource profiles** converted to CanonicalProfiles
- **15 extension definitions** processed
- **Official examples validated** against declared profiles
- **FHIRPath evaluation** on US Core resources
- **Profile-to-example matching** verified

### Stress Testing

- **Malformed input resilience** — graceful error handling
- **Deep nesting stress** — recursive structure validation
- **Large payload stress** — bundle processing performance
- **FHIRPath complexity stress** — complex expression evaluation
- **Memory pressure** — batch processing stability
- **Concurrent safety** — parallel operation validation

---

## Package Details

| Property                 | Value                                          |
| ------------------------ | ---------------------------------------------- |
| npm package              | `fhir-runtime`                                 |
| Entry point (ESM)        | `dist/esm/index.mjs`                           |
| Entry point (CJS)        | `dist/cjs/index.cjs`                           |
| Type declarations        | `dist/index.d.ts`                              |
| Runtime dependencies     | None                                           |
| Dev dependencies         | TypeScript 5.9, vitest, esbuild, api-extractor |
| Build output             | ESM + CJS + d.ts (api-extractor rolled up)     |
| Bundled core definitions | 73 FHIR R4 StructureDefinitions                |
| Public exports           | ~211 symbols across 6 modules                  |
| Test count               | 2,400+ tests across 45 test files              |

---

## Related Documents

- **Capability Contract:** [`docs/specs/engine-capability-contract-v0.2.md`](../specs/engine-capability-contract-v0.2.md)
- **Frozen API Reference:** [`docs/api/fhir-runtime-api-v0.2.md`](../api/fhir-runtime-api-v0.2.md)
- **Main README:** [`README.md`](../../README.md)
