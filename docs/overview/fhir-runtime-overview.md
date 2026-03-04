# @medxai/fhir-core — Technical Overview

> **Package:** `@medxai/fhir-core`  
> **Version:** 0.1.0  
> **FHIR Version:** R4 (4.0.1)  
> **Runtime:** Node.js >=18.0.0  
> **Language:** TypeScript 5.9  
> **License:** Apache-2.0

---

## What is @medxai/fhir-core?

`@medxai/fhir-core` is a **structural FHIR R4 engine** for TypeScript/Node.js. It provides the foundational capabilities needed to parse, validate, and manipulate FHIR R4 resources — without requiring a running FHIR server, database, or external terminology service.

It is the core library in the MedXAI platform stack, designed to be consumed by:

- **CLI tools** — parse, validate, generate snapshots, evaluate FHIRPath
- **Server layers** — validation gate for REST FHIR operations
- **Client SDKs** — type-safe resource handling
- **UI components** — profile-driven form rendering via InnerType schema

### HAPI FHIR Equivalence

The library targets **structural equivalence** with [HAPI FHIR](https://hapifhir.io/) (Java), the de facto reference implementation for FHIR tooling:

| MedXAI               | HAPI FHIR                                         |
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
packages/fhir-core/src/
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
5. **CanonicalProfile as semantic model** — A pre-resolved, O(1)-lookup representation unique to MedXAI, converting FHIR's verbose SD structure into an efficient runtime model.

---

## Capabilities

### 1. Parsing & Serialization

Parse FHIR R4 JSON with full support for:

- Primitive `_element` split (value + extension objects)
- Choice type `[x]` dispatch and tagging
- Null alignment in sparse arrays
- StructureDefinition-specific parsing (37 ElementDefinition fields)

```typescript
import { parseFhirJson, serializeToFhirJson } from "@medxai/fhir-core";

const result = parseFhirJson(jsonString);
if (result.success) {
  const resource = result.data;
  const roundTripped = serializeToFhirJson(resource);
}
```

### 2. Context & Registry

Manage StructureDefinition lifecycle — loading, caching, registration, and inheritance chain resolution.

```typescript
import { FhirContextImpl, MemoryLoader } from "@medxai/fhir-core";

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
import { SnapshotGenerator } from "@medxai/fhir-core";

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
import { StructureValidator, buildCanonicalProfile } from "@medxai/fhir-core";

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
import { evalFhirPath, evalFhirPathBoolean } from "@medxai/fhir-core";

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
import { extractInnerTypes, buildCanonicalProfile } from "@medxai/fhir-core";

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
import { loadBundleFromFile } from "@medxai/fhir-core";

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

## Package Details

| Property                    | Value                                          |
| --------------------------- | ---------------------------------------------- |
| npm package                 | `@medxai/fhir-core`                            |
| Entry point (ESM)           | `dist/esm/index.mjs`                           |
| Entry point (CJS)           | `dist/cjs/index.cjs`                           |
| Type declarations           | `dist/index.d.ts`                              |
| Runtime dependencies        | None                                           |
| Dev dependencies            | TypeScript 5.9, vitest, esbuild, api-extractor |
| Build output                | ESM + CJS + d.ts (api-extractor rolled up)     |
| Bundled core definitions    | 73 FHIR R4 StructureDefinitions                |
| Public exports              | ~211 symbols across 6 modules                  |
| Test count (fhir-core only) | ~2400+ tests                                   |

---

## Related Documents

- **Capability Contract:** [`docs/specs/engine-capability-contract-v0.1.md`](../specs/engine-capability-contract-v0.1.md)
- **Frozen API Reference:** [`docs/api/fhir-core-api-v0.1.md`](../api/fhir-core-api-v0.1.md)
- **Root Documentation Index:** [`docs/README.md`](../../../../docs/README.md)
