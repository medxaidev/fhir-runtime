# fhir-runtime

> **A production-ready FHIR R4 runtime engine for TypeScript/Node.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-2400%2B%20passing-brightgreen)]()

`fhir-runtime` is a **structural FHIR R4 engine** that provides comprehensive capabilities for parsing, validating, and manipulating FHIR resources — without requiring a running FHIR server, database, or external terminology service.

Designed as a pure runtime layer with **zero dependencies**, it's suitable for embedding in servers, CLIs, web applications, or custom platforms.

---

## ✨ Features

### Core Capabilities

- **🔍 FHIR R4 JSON Parsing** — Full support for primitives, choice types, extensions
- **✅ Profile-Based Validation** — 9 structural validation rules + FHIRPath invariants
- **📸 Snapshot Generation** — HAPI-equivalent differential expansion
- **🧮 FHIRPath Engine** — 60+ functions, Pratt parser with AST caching
- **📦 Bundle Loading** — Load FHIR specification bundles and IGs
- **🔄 Context Management** — Registry, loaders, inheritance resolution
- **🎯 InnerType Extraction** — BackboneElement schema for UI/validation

### Quality & Testing

- **2,400+ tests** across 45 test files — 100% passing
- **US Core IG verified** — 70 StructureDefinitions, 55 profiles validated
- **HAPI-equivalent** — 35/35 snapshot fixtures match HAPI output
- **Stress tested** — Malformed input, deep nesting, large payloads, concurrency
- **Zero dependencies** — Pure TypeScript, no external runtime deps
- **Type-safe** — Full TypeScript definitions for all FHIR R4 types

---

## 📦 Installation

```bash
npm install fhir-runtime
```

**Requirements:**

- Node.js ≥18.0.0
- TypeScript ≥5.0 (for TypeScript projects)

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
- **[API Reference](docs/api/fhir-runtime-api-v0.2.md)** — Complete API documentation (211 exports)
- **[Capability Contract](docs/specs/engine-capability-contract-v0.2.md)** — Behavioral guarantees, error semantics

---

## 🧪 Testing & Quality

### Test Coverage

```
✅ 2,400+ tests across 45 test files
✅ 100% pass rate on HAPI snapshot fixtures (35/35)
✅ All 6 modules fully tested (parser, context, profile, validator, fhirpath, model)
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
└── fhirpath/     ← FHIRPath expression engine (Pratt parser, 60+ functions)
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
- **CLI Tools** — Parse, validate, generate snapshots, evaluate FHIRPath
- **Web Applications** — Client-side FHIR processing without server dependency
- **IG Publishers** — Profile validation and snapshot generation
- **Testing Frameworks** — FHIR resource validation in test suites
- **Data Pipelines** — ETL with FHIR validation and transformation

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! This project maintains:

- **Zero runtime dependencies** — Keep it that way
- **100% test pass rate** — All tests must pass
- **Type safety** — Full TypeScript coverage
- **HAPI equivalence** — Snapshot generation must match HAPI output

---

## 📊 Package Details

| Property                 | Value                           |
| ------------------------ | ------------------------------- |
| Package name             | `fhir-runtime`                  |
| Version                  | 0.2.0                           |
| License                  | MIT                             |
| FHIR Version             | R4 (4.0.1)                      |
| Module formats           | ESM + CJS                       |
| Runtime dependencies     | None (zero dependencies)        |
| Bundled core definitions | 73 FHIR R4 StructureDefinitions |
| Public exports           | 211 symbols across 6 modules    |
| Test coverage            | 2,400+ tests across 45 files    |

---

## 🔗 Related Projects

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
