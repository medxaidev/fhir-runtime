# fhir-runtime

> **A production-ready FHIR R4 runtime engine for TypeScript/Node.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-2995%20passing-brightgreen)]()

`fhir-runtime` is a **structural FHIR R4 engine** that provides comprehensive capabilities for parsing, validating, and manipulating FHIR resources — without requiring a running FHIR server, database, or external terminology service.

Designed as a pure runtime layer with **zero dependencies**, it's suitable for embedding in servers, CLIs, web applications, or custom platforms.

---

## Features

### Core Capabilities

- FHIR R4 JSON Parsing — Full support for primitives, choice types, extensions
- Profile-Based Validation — 9 structural validation rules + FHIRPath invariants
- Validation Pipeline (STAGE-4) — Composable multi-step pipeline with hooks, batch validation, and enhanced error messages
- Provider Abstraction Layer (STAGE-1) — Terminology and reference contracts with default NoOp implementations
- Snapshot Generation — HAPI-equivalent differential expansion
- FHIRPath Engine — 60+ functions, Pratt parser with AST caching
- Bundle Loading — Load FHIR specification bundles and IGs
- Context Management — Registry, loaders, inheritance resolution
- InnerType Extraction — BackboneElement schema for UI/validation
- OperationOutcomeBuilder — Convert validation, parse, and snapshot results to FHIR R4 `OperationOutcome`

### Quality & Testing

- 2,995 tests across 65 test files — 100% passing
- US Core IG verified — 70 StructureDefinitions, 55 profiles validated
- Validation pipeline tested — 110 pipeline tests including 34 JSON fixture tests
- HAPI-equivalent — 35/35 snapshot fixtures match HAPI output
- Stress tested — Malformed input, deep nesting, large payloads, concurrency
- Zero dependencies — Pure TypeScript, no external runtime deps
- Type-safe — Full TypeScript definitions for all FHIR R4 types

---

## 📦 Installation

```bash
npm install fhir-runtime
```

**Requirements:**

- Node.js ≥18.0.0
- TypeScript ≥5.0 (for TypeScript projects)

---

## 🎮 Try it Online

**[FHIR Runtime Playground](https://medxai.com.cn/fhir-runtime-playground/)** — Interactive browser-based playground to experiment with fhir-runtime capabilities:

- 🔍 **Parse FHIR Resources** — Test JSON parsing with real-time feedback
- ✅ **Validate Resources** — Validate against profiles and see detailed issues
- 📸 **Generate Snapshots** — Visualize differential expansion
- 🧮 **Evaluate FHIRPath** — Interactive FHIRPath expression testing
- 📚 **Example Library** — Pre-loaded examples and profiles
- 💾 **Share & Export** — Save and share your experiments

**Playground Repository:** [github.com/medxaidev/fhir-runtime-playground](https://github.com/medxaidev/fhir-runtime-playground)

---

## 🚀 Quick Start

### Parse a FHIR Resource

```typescript
import { parseFhirJson } from "fhir-runtime";

const result = parseFhirJson(`{
  "resourceType": "Patient",
  "id": "example",
  "name": [{ "family": "Doe", "given": ["John"] }]
}`);

if (result.success) {
  console.log(result.data.resourceType); // "Patient"
  console.log(result.data.name[0].family); // "Doe"
}
```

### Validate Against a Profile

```typescript
import {
  StructureValidator,
  buildCanonicalProfile,
  parseStructureDefinition,
} from "fhir-runtime";

// Load a profile
const sdResult = parseStructureDefinition(profileJson);
const profile = buildCanonicalProfile(sdResult.data);

// Validate a resource
const validator = new StructureValidator();
const result = validator.validate(patientResource, profile);

if (!result.valid) {
  result.issues.forEach((issue) => {
    console.error(`${issue.severity}: ${issue.message} at ${issue.path}`);
  });
}
```

### Validate with Pipeline (v0.4.0)

```typescript
import {
  ValidationPipeline,
  StructuralValidationStep,
  TerminologyValidationStep,
  InvariantValidationStep,
  generateReport,
  enhanceIssues,
} from "fhir-runtime";

const pipeline = new ValidationPipeline({
  failFast: true,
  minSeverity: "warning",
});
pipeline.addStep(new StructuralValidationStep());
pipeline.addStep(new TerminologyValidationStep());
pipeline.addStep(new InvariantValidationStep());

const result = await pipeline.validate(resource, profile);
const report = generateReport(result);
const enhanced = enhanceIssues(result.issues);
```

### Generate a Snapshot

```typescript
import { FhirContextImpl, SnapshotGenerator } from "fhir-runtime";

const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();

const generator = new SnapshotGenerator(ctx, { generateCanonical: true });
const result = await generator.generate(myProfile);

if (result.success) {
  console.log(
    `Generated ${result.structureDefinition.snapshot.element.length} elements`,
  );
}
```

### Evaluate FHIRPath

```typescript
import { evalFhirPath, evalFhirPathBoolean } from "fhir-runtime";

const patient = { resourceType: "Patient", name: [{ given: ["John"] }] };

const names = evalFhirPath("Patient.name.given", patient);
// → ['John']

const hasOfficial = evalFhirPathBoolean(
  "name.where(use='official').exists()",
  patient,
);
// → false
```

---

## 📚 Documentation

- **[Technical Overview](docs/overview/fhir-runtime-overview.md)** — Architecture, design principles, capabilities
- **[API Reference](docs/api/fhir-runtime-api-v0.4.md)** — Public API reference for the v0.4.0 release surface
- **[Capability Contract](docs/specs/engine-capability-contract-v0.4.md)** — Behavioral guarantees and release contract for v0.4.0
- **[Release Notes v0.4.0](docs/releases/v0.4.0.md)** — Detailed v0.4.0 release notes

---

## 🧪 Testing & Quality

### Test Coverage

```
✅ 2,995 tests across 65 test files
✅ 100% pass rate on HAPI snapshot fixtures (35/35)
✅ All 8 modules fully tested (model, parser, context, profile, validator, fhirpath, provider, pipeline)
✅ Validation pipeline tested — 110 pipeline tests including 34 JSON fixture tests
```

### v0.4.0 Validation Pipeline Coverage

```
✅ 110 new tests across 9 pipeline-focused test files
✅ ValidationPipeline — basic flow, failFast, minSeverity (19 tests)
✅ Built-in steps — structural, terminology, invariant (21 tests)
✅ Hook system — lifecycle events, async handlers (10 tests)
✅ Batch validation — 16 JSON fixture tests
✅ Enhanced messages — 18 JSON fixture tests
✅ Report generator — 9 tests
✅ End-to-end integration — 17 tests
```

### US Core IG Verification

```
✅ 70 US Core StructureDefinitions parsed
✅ 55 resource profiles converted to CanonicalProfiles
✅ 15 extension definitions processed
✅ Official examples validated against declared profiles
✅ FHIRPath evaluation on US Core resources
✅ Profile-to-example matching verified
```

### Stress Testing

```
✅ Malformed input resilience — graceful error handling
✅ Deep nesting stress — recursive structure validation
✅ Large payload stress — bundle processing performance
✅ FHIRPath complexity — complex expression evaluation
✅ Memory pressure — batch processing stability
✅ Concurrent safety — parallel operation validation
```

---

## 🏗️ Architecture

### Module Structure

```
src/
├── model/        ← FHIR R4 type definitions (branded primitives, enums, complex types)
├── parser/       ← JSON parsing & serialization
├── context/      ← SD registry, loaders, inheritance resolution, bundle loading
├── profile/      ← Snapshot generation, canonical builder, constraint merging
├── validator/    ← Structural validation (9 rules + FHIRPath invariants)
├── fhirpath/     ← FHIRPath expression engine (Pratt parser, 60+ functions)
├── provider/     ← Terminology/reference abstractions, NoOp providers, OperationOutcomeBuilder
└── pipeline/     ← Composable validation pipeline, hooks, batch, reports, enhanced messages
```

### HAPI FHIR Equivalence

| fhir-runtime         | HAPI FHIR                                         |
| -------------------- | ------------------------------------------------- |
| `FhirContextImpl`    | `FhirContext` + `DefaultProfileValidationSupport` |
| `SnapshotGenerator`  | `ProfileUtilities.generateSnapshot()`             |
| `StructureValidator` | `FhirInstanceValidator`                           |
| `evalFhirPath()`     | `FHIRPathEngine.evaluate()`                       |
| `CompositeLoader`    | `ValidationSupportChain`                          |

---

## 🎯 Use Cases

- **FHIR Servers** — Validation layer for REST operations
- **FHIR Server Foundations** — Start `fhir-server` development with NoOp providers before terminology is implemented
- **CLI Tools** — Parse, validate, generate snapshots, evaluate FHIRPath
- **Web Applications** — Client-side FHIR processing without server dependency
- **IG Publishers** — Profile validation and snapshot generation
- **Testing Frameworks** — FHIR resource validation in test suites
- **Data Pipelines** — ETL with FHIR validation and transformation

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📊 Package Details

| Property                 | Value                           |
| ------------------------ | ------------------------------- |
| Package name             | `fhir-runtime`                  |
| Version                  | 0.4.0                           |
| License                  | MIT                             |
| FHIR Version             | R4 (4.0.1)                      |
| Module formats           | ESM + CJS                       |
| Runtime dependencies     | None (zero dependencies)        |
| Bundled core definitions | 73 FHIR R4 StructureDefinitions |
| Public exports           | 250+ symbols across 8 modules   |
| Test coverage            | 2,995 tests across 65 files     |

---

## 🆕 Release Highlights

### v0.4.0

- **Validation Pipeline** — Composable `ValidationPipeline` with pluggable steps, priority ordering, and failFast mode
- **Built-in steps** — `StructuralValidationStep`, `TerminologyValidationStep`, `InvariantValidationStep`
- **Hook system** — Lifecycle events for monitoring and customizing validation flow
- **Batch validation** — Validate multiple resources in a single pipeline run
- **Enhanced errors** — Fix suggestions, documentation links, expected/actual values
- **Validation reports** — Structured reports with multi-axis issue grouping
- **110 new tests** — 2,995 total across 65 test files

### v0.3.0

- **Provider Abstraction Layer landed** — `TerminologyProvider` and `ReferenceResolver` are now part of the public API
- **Default NoOp implementations** — Safe placeholders for higher-level services and integration work
- **OperationOutcomeBuilder support** — Convert structured engine results into FHIR-native error payloads
- **Backward compatible** — Existing validation flows continue to work with optional provider hooks

---

## 🔗 Related Projects

- **[FHIR Runtime Playground](https://medxai.com.cn/fhir-runtime-playground/)** — Interactive online playground ([GitHub](https://github.com/medxaidev/fhir-runtime-playground))
- **[HAPI FHIR](https://hapifhir.io/)** — Reference Java implementation
- **[HL7 FHIR Specification](https://hl7.org/fhir/R4/)** — Official FHIR R4 spec
- **[US Core IG](https://www.hl7.org/fhir/us/core/)** — US Core Implementation Guide

---

## ⚡ Performance

- **Zero dependencies** — Minimal bundle size, fast installation
- **AST caching** — FHIRPath expressions cached (LRU, 128 entries)
- **Deterministic** — Same input always produces same output
- **Memory efficient** — Streaming bundle loading, lazy evaluation

---

**Made with ❤️ for the FHIR community**
