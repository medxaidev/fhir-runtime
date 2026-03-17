# fhir-runtime

> **A production-ready FHIR R4 runtime engine for TypeScript/Node.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-4250%20passing-brightgreen)]()

`fhir-runtime` is a **structural FHIR R4 engine** that provides comprehensive capabilities for parsing, validating, and manipulating FHIR resources — without requiring a running FHIR server, database, or external terminology service.

Designed as a lightweight runtime layer with a single dependency (`fhir-definition`), it's suitable for embedding in servers, CLIs, web applications, or custom platforms.

**🎮 Live Demo:** [fhir-runtime-tools.vercel.app/](https://fhir-runtime-tools.vercel.app/) — Try fhir-runtime in your browser

---

## Features

### Core Capabilities

- FHIR R4 JSON Parsing — Full support for primitives, choice types, extensions
- Profile-Based Validation — 9 structural validation rules + FHIRPath invariants
- Validation Pipeline (STAGE-2) — Composable multi-step pipeline with hooks, batch validation, and enhanced error messages
- Terminology Binding (STAGE-3) — InMemoryTerminologyProvider, binding strength validation, CS/VS registries
- IG Package Loading (STAGE-4) — NpmPackageLoader, PackageManager, cross-package canonical resolution
- Server/Persistence Integration (STAGE-5) — SearchParameter parsing, search value extraction, reference extraction, CapabilityStatement generation
- **fhir-definition Integration (STAGE-6)** — `DefinitionProvider` interface, `DefinitionBridge` adapter, `createRuntime()` factory, `DefinitionProviderLoader`
- **fhir-server Prerequisites (STAGE-B)** — `RemoteTerminologyProvider` interface, `validateMany()` batch API, `SnapshotCache` lazy loading, `warmupSnapshots()`
- **Profile Slicing & UI Utilities (STAGE-7)** — `SlicedElement`/`SliceDefinition` types, `matchSlice()`, `generateSliceSkeleton()`, Choice Type helpers (`isChoiceType()`, `resolveActiveChoiceType()`), BackboneElement helpers (`isBackboneElement()`, `getBackboneChildren()`), `inferComplexType` fix
- Provider Abstraction Layer (STAGE-1) — Terminology and reference contracts with default NoOp implementations
- Snapshot Generation — HAPI-equivalent differential expansion
- FHIRPath Engine — 60+ functions, Pratt parser with AST caching
- Bundle Loading — Load FHIR specification bundles and IGs
- Context Management — Registry, loaders, inheritance resolution
- InnerType Extraction — BackboneElement schema for UI/validation
- OperationOutcomeBuilder — Convert validation, parse, and snapshot results to FHIR R4 `OperationOutcome`

### Quality & Testing

- ~4,250 tests across 114 test files — 100% passing
- US Core IG verified — 70 StructureDefinitions loaded from real US Core v9.0.0 package
- IG package tested — 138 package tests including real US Core integration
- Integration tested — 110 tests for SearchParameter, value extraction, references, capability builder
- Definition integration tested — 59 tests for DefinitionProvider, DefinitionBridge, createRuntime, E2E
- Batch validation tested — 28 new tests for validateMany, RemoteTerminologyProvider, SnapshotCache
- Profile slicing tested — 69 new tests for slicing extraction, matching, choice types, backbone elements
- HAPI-equivalent — 35/35 snapshot fixtures match HAPI output
- Stress tested — Malformed input, deep nesting, large payloads, concurrency
- Single dependency — `fhir-definition@0.6.0` (FHIR Knowledge Engine)
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

**Live Demo:** [fhir-runtime-tools.vercel.app/](https://fhir-runtime-tools.vercel.app/)

**[FHIR Runtime Tools](https://fhir-runtime-tools.vercel.app/)** — Developer toolset built on fhir-runtime, providing utilities for FHIR resource inspection, debugging, and development workflows.

---

## � Related Projects

### fhir-runtime-cli

**Command-line interface for fhir-runtime** — A powerful CLI tool for FHIR resource validation, IG package management, and development workflows.

**Key Features:**

- **Validate** — Validate FHIR resources against profiles with support for local IG packages
- **IG Package Loading** — Load and inspect FHIR Implementation Guide packages
- **Search Parameters** — List and explore SearchParameters for resource types
- **Batch Operations** — Validate multiple resources in batch mode
- **Configuration Support** — `.fhir-runtime.json` config file for project-specific settings

**Installation:**

```bash
npm install -g fhir-runtime-cli
```

**Quick Example:**

```bash
# Validate a Patient resource against US Core profile
fhir-runtime-cli validate \
  --file patient.json \
  --profile http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient \
  --ig-path ./fhir-packages/hl7.fhir.us.core

# List SearchParameters for Patient resource type
fhir-runtime-cli search-params Patient

# Load and inspect an IG package
fhir-runtime-cli load-package ./fhir-packages/hl7.fhir.us.core
```

**Repository:** [github.com/medxaidev/fhir-runtime-cli](https://github.com/medxaidev/fhir-runtime-cli)

---

## �🚀 Quick Start

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

### Validate with Pipeline + Terminology (v0.5.0)

```typescript
import {
  ValidationPipeline,
  StructuralValidationStep,
  TerminologyValidationStep,
  InvariantValidationStep,
  InMemoryTerminologyProvider,
  generateReport,
} from "fhir-runtime";

// Set up terminology provider
const terminology = new InMemoryTerminologyProvider();
terminology.loadFromBundle(terminologyBundle);

const pipeline = new ValidationPipeline({
  terminologyProvider: terminology,
  failFast: true,
  minSeverity: "warning",
});
pipeline.addStep(new StructuralValidationStep());
pipeline.addStep(new TerminologyValidationStep());
pipeline.addStep(new InvariantValidationStep());

const result = await pipeline.validate(resource, profile);
const report = generateReport(result);
```

### createRuntime() — One-step Setup (v0.8.0)

```typescript
import { createRuntime } from "fhir-runtime";

// Pattern 1: With fhir-definition (recommended)
import { InMemoryDefinitionRegistry, loadFromDirectory } from "fhir-definition";
const registry = new InMemoryDefinitionRegistry();
await loadFromDirectory("./definitions", registry);
const runtime = await createRuntime({ definitions: registry });

// Pattern 2: Bare minimum (auto-loads R4 core definitions)
const runtime2 = await createRuntime();

// Validate
const result = await runtime.validate(
  patient,
  "http://hl7.org/fhir/StructureDefinition/Patient",
);

// Get search parameters
const sps = runtime.getSearchParameters("Patient");
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
- **[API Reference](docs/api/fhir-runtime-api-v0.7.md)** — Public API reference for the v0.7.0 release surface
- **[Capability Contract](docs/specs/engine-capability-contract-v0.7.md)** — Behavioral guarantees and release contract for v0.7.0
- **[Release Notes v0.7.0](docs/releases/v0.7.0.md)** — Detailed v0.7.0 release notes

---

## 🧪 Testing & Quality

### Test Coverage

```
✅ 3,376 tests across 88 test files
✅ 100% pass rate on HAPI snapshot fixtures (35/35)
✅ All 11 modules fully tested (model, parser, context, profile, validator, fhirpath, provider, terminology, package, pipeline, integration)
✅ IG package tested — 138 package tests including real US Core v9.0.0 integration
✅ Integration tested — 110 tests for SearchParameter, value extraction, references, capability
```

### v0.7.0 Integration Coverage

```
✅ 110 new tests across 6 integration test files
✅ SearchParameter parser — 24 tests
✅ Search value extractor — 21 tests (string, token, reference, date, number, quantity, uri)
✅ Reference extractor — 22 tests (literal, contained, absolute, logical, bundle)
✅ CapabilityStatement builder — 12 tests
✅ Resource type registry — 16 tests
✅ End-to-end integration — 15 tests
```

### v0.6.0 Package Coverage

```
✅ 138 new tests across 7 package-focused test files
✅ Package manifest parser — 13 tests
✅ Package index parser — 14 tests
✅ NpmPackageLoader — 32 tests (index, scan, load, filter, bulk)
✅ Dependency resolver — 15 tests (graph, topo sort, cycle detection)
✅ Canonical resolver — 22 tests (version-aware, multi-loader)
✅ PackageManager — 17 tests (register, discover, resolve)
✅ Integration — 25 tests (11 mock + 14 real US Core v9.0.0)
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
├── terminology/  ← Binding validation, InMemoryTerminologyProvider, CS/VS registries
├── package/      ← IG package loading, NpmPackageLoader, PackageManager, canonical resolution
├── integration/  ← SearchParameter, search value extraction, references, CapabilityStatement
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
| Version                  | 0.7.0                           |
| License                  | MIT                             |
| FHIR Version             | R4 (4.0.1)                      |
| Module formats           | ESM + CJS                       |
| Runtime dependencies     | None (zero dependencies)        |
| Bundled core definitions | 73 FHIR R4 StructureDefinitions |
| Public exports           | ~280+ symbols across 11 modules |
| Test coverage            | 3,376 tests across 88 files     |

---

## 🆕 Release Highlights

### v0.7.0

- **SearchParameter Parsing** — `parseSearchParameter()` and `parseSearchParametersFromBundle()` for typed SearchParameter resource parsing
- **Search Value Extraction** — `extractSearchValues()` and `extractAllSearchValues()` using FHIRPath to extract indexable values from resources
- **Reference Extraction** — `extractReferences()` walks resource tree to find all Reference elements (literal, logical, contained, absolute)
- **CapabilityStatement Builder** — `buildCapabilityFragment()` generates REST fragments from profiles and search parameters
- **Resource Type Registry** — `ResourceTypeRegistry` with `FHIR_R4_RESOURCE_TYPES` (148 R4 resource types)
- **Reference Validation** — `validateReferenceTargets()` checks reference target types against profile constraints
- **110 new tests** — 3,376 total across 88 test files

### v0.6.0

- **IG Package Loading** — `NpmPackageLoader` for loading FHIR IG packages from extracted NPM directories
- **PackageManager** — Register, discover, and manage multiple IG packages with dependency resolution
- **Canonical Resolution** — Version-aware cross-package canonical URL resolution (`url|version`)
- **Dependency Graph** — Topological sorting with circular dependency detection
- **US Core verified** — Real US Core v9.0.0 package loaded and validated (70 SDs, 20 ValueSets)
- **138 new tests** — 3,266 total across 82 test files

### v0.5.0

- **Terminology Binding Validation** — `InMemoryTerminologyProvider` with full `TerminologyProvider` interface
- **Binding strength** — `required` / `extensible` / `preferred` / `example` validation
- **Registries** — `CodeSystemRegistry` (hierarchical) + `ValueSetRegistry` for in-memory terminology storage
- **ValueSet membership** — expansion, compose include/exclude, hierarchical filters

### v0.4.0

- **Validation Pipeline** — Composable `ValidationPipeline` with pluggable steps, priority ordering, and failFast mode
- **Built-in steps** — `StructuralValidationStep`, `TerminologyValidationStep`, `InvariantValidationStep`
- **Hook system** — Lifecycle events for monitoring and customizing validation flow
- **Batch validation** — Validate multiple resources in a single pipeline run
- **Enhanced errors** — Fix suggestions, documentation links, expected/actual values
- **Validation reports** — Structured reports with multi-axis issue grouping

### v0.3.0

- **Provider Abstraction Layer landed** — `TerminologyProvider` and `ReferenceResolver` are now part of the public API
- **Default NoOp implementations** — Safe placeholders for higher-level services and integration work
- **OperationOutcomeBuilder support** — Convert structured engine results into FHIR-native error payloads
- **Backward compatible** — Existing validation flows continue to work with optional provider hooks

---

## 🔗 Related Projects

- **[FHIR Runtime Tools](https://fhir-runtime-tools.vercel.app/)** — Developer toolset built on fhir-runtime ([GitHub](https://github.com/medxai/fhir-runtime-tools))
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
