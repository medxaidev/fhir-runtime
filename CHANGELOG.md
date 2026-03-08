# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-08

### Added

#### Validation Pipeline & DX Enhancement (STAGE-4)

- **New module: `src/pipeline/`** — Composable validation pipeline with pluggable step architecture
  - `ValidationPipeline` class — orchestrates steps with priority order, failFast, minSeverity filtering
  - `ValidationStep` interface — pluggable validation step contract
  - `PipelineContext` — shared state passed between steps with providers and abort control
  - `PipelineOptions` — pipeline configuration (failFast, maxDepth, minSeverity, providers)
  - `PipelineResult` / `StepResult` — structured validation output with per-step results

- **Built-in validation steps**
  - `StructuralValidationStep` — wraps existing `StructureValidator` (priority: 10)
  - `TerminologyValidationStep` — validates coded elements via `TerminologyProvider` (priority: 20)
  - `InvariantValidationStep` — evaluates FHIRPath constraints (priority: 30)

- **Hook system**
  - `HookManager` class for lifecycle event registration and emission
  - Events: `beforeValidation`, `afterValidation`, `beforeStep`, `afterStep`, `onIssue`, `onError`
  - `PipelineEventHandler` / `PipelineEventData` types

- **Batch validation**
  - `validateBatch()` for validating multiple resources in sequence
  - `BatchEntry` / `BatchResult` / `BatchEntryResult` types
  - Labels for identifying entries in batch results

- **Enhanced error messages**
  - `EnhancedValidationIssue` extending `ValidationIssue` with `suggestion`, `documentationUrl`, `expected`, `actual`
  - `enhanceIssue()` and `enhanceIssues()` functions
  - Enhancement rules for all 16+ `ValidationIssueCode` types

- **Structured validation reports**
  - `ValidationReport` / `ReportSummary` types
  - `generateReport()` function with issue grouping by severity, path, and step

- **New exports in `src/index.ts`** — 14 type exports + 8 value exports from pipeline module

#### Testing

- 110 new tests across 9 test files in `src/pipeline/__tests__/`
  - `validation-pipeline.test.ts` (19 tests — basic flow, failFast, minSeverity)
  - `structural-step.test.ts` (6 tests)
  - `terminology-step.test.ts` (8 tests)
  - `invariant-step.test.ts` (7 tests)
  - `hook-manager.test.ts` (10 tests)
  - `batch-validator.test.ts` (16 JSON fixture tests)
  - `enhanced-messages.test.ts` (18 JSON fixture tests)
  - `report-generator.test.ts` (9 tests)
  - `pipeline-integration.test.ts` (17 end-to-end integration tests)
- 24 JSON fixture files (8 resource fixtures + 16 error message fixtures)
- All v0.3.0 tests remain 100% passing (backward compatibility verified)

### Notes

- This release enables composable, multi-step validation pipelines with lifecycle hooks
- The pipeline wraps existing validation infrastructure; it does not replace `StructureValidator`
- Terminology validation requires an external `TerminologyProvider` implementation
- Batch validation is sequential (no concurrency control)
- This release remains backward compatible with v0.3.0 because the pipeline is an optional enhancement layer

---

## [0.3.0] - 2026-03-07

### Added

#### Provider Abstraction Layer (STAGE-1)

- **New module: `src/provider/`** — Provider abstraction interfaces and default implementations
  - `TerminologyProvider` interface — `validateCode()`, `expandValueSet()`, `lookupCode()`
  - `ReferenceResolver` interface — `resolve()`, `exists()`
  - `NoOpTerminologyProvider` — default implementation, accepts all codes
  - `NoOpReferenceResolver` — default implementation, assumes all references exist
  - `OperationOutcomeBuilder` — converts `ValidationResult`, `ParseResult`, `SnapshotResult` to FHIR R4 OperationOutcome
  - `OperationOutcome`, `OperationOutcomeIssue`, `OperationOutcomeIssueType` types

- **Validator integration** — `ValidationOptions` extended with optional `terminologyProvider` and `referenceResolver` fields (backward compatible)

- **New exports in `src/index.ts`** — 12 type exports + 5 value exports from provider module

#### Testing

- 97 new tests across 6 test files in `src/provider/__tests__/`
  - `noop-terminology-provider.test.ts` (16 tests)
  - `noop-reference-resolver.test.ts` (11 tests)
  - `terminology-provider-interface.test.ts` (8 tests)
  - `reference-resolver-interface.test.ts` (10 tests)
  - `operation-outcome-builder.test.ts` (33 tests — 18 validation + 7 parse + 8 snapshot)
  - `validator-provider-integration.test.ts` (19 tests)
- All v0.2.0 tests remain 100% passing (backward compatibility verified)

### Notes

- This release enables `fhir-server` to begin development using NoOp providers as placeholders
- Provider interfaces use `Promise`-based async API; actual terminology validation will be implemented in STAGE-2 (v0.4.0)
- OperationOutcome types are self-contained in `src/provider/types.ts`, not added to the model module
- This release remains backward compatible with v0.2.0 because all provider integration points are optional

---

## [0.2.0] - 2026-03-04

### Changed

- **Package renamed** from `@medxai/fhir-core` to `fhir-runtime`
- **License changed** from Apache-2.0 to MIT
- Updated all documentation to reflect new package name and branding
- Updated package.json metadata (repository, bugs, homepage)

### Added

#### Testing & Quality Assurance

- **US Core IG Verification Suite**
  - 70 US Core StructureDefinitions successfully parsed
  - 55 resource profiles converted to CanonicalProfiles
  - 15 extension definitions processed
  - Official examples validated against declared profiles
  - FHIRPath evaluation on US Core resources
  - Profile-to-example matching verification

- **Comprehensive Stress Testing**
  - Malformed input resilience testing
  - Deep nesting stress tests
  - Large payload stress tests (bundle processing)
  - FHIRPath complexity stress tests
  - Memory pressure tests (batch processing)
  - Concurrent safety tests (parallel operations)

- **Test Coverage Expansion**
  - Expanded to 2,400+ tests across 45 test files
  - 100% pass rate maintained
  - All 6 modules fully tested

#### Documentation

- Created new v0.2 API reference (`docs/api/fhir-runtime-api-v0.2.md`)
- Created new v0.2 capability contract (`docs/specs/engine-capability-contract-v0.2.md`)
- Updated technical overview with testing section
- Completely rewrote README.md with:
  - Production-ready presentation
  - Quick start examples
  - Comprehensive testing documentation
  - Architecture diagrams
  - Use cases and performance notes

### Fixed

- No bug fixes in this release (documentation and testing focus)

### Deprecated

- Old package name `@medxai/fhir-core` (use `fhir-runtime` instead)
- v0.1 documentation files (use v0.2 versions)

### Security

- No security changes in this release

---

## [0.1.0] - 2026-03-04 (Initial Release as @medxai/fhir-core)

### Added

#### Core Capabilities

- **FHIR R4 JSON Parsing & Serialization**
  - Full support for all FHIR R4 resource types
  - Primitive `_element` split handling
  - Choice type `[x]` dispatch and tagging
  - Null alignment in sparse arrays
  - StructureDefinition-specific parsing (37 ElementDefinition fields)

- **Context & Registry Management**
  - StructureDefinition registry with inheritance resolution
  - Pluggable loader architecture (MemoryLoader, FileSystemLoader, CompositeLoader)
  - Bundle loading (profiles-resources, profiles-types)
  - 73 bundled FHIR R4 core definitions
  - InnerType extraction for BackboneElement schemas

- **Snapshot Generation**
  - HAPI-semantically-equivalent snapshot generation
  - Base-driven merge algorithm
  - Constraint tightening validation
  - Slicing support (extension, type, value)
  - Circular dependency detection
  - Validated against 35 HAPI-generated fixtures (100% pass rate)

- **Profile-Based Validation**
  - 9 structural validation rules:
    - Cardinality (min/max)
    - Required elements
    - Type compatibility
    - Fixed values
    - Pattern values
    - Choice types
    - Reference targets
    - Slicing discriminators
    - FHIRPath invariants
  - Snapshot-driven validation using CanonicalProfile
  - Structured result objects (no-throw contract)

- **FHIRPath Expression Engine**
  - 60+ standard FHIRPath functions
  - Pratt parser with operator precedence
  - AST caching (LRU, 128 entries)
  - Support for FHIRPath §5.1–5.9, §6.3, §6.5
  - FHIR-specific functions (resolve, extension, hasValue)
  - Variable scoping ($this, $index, $total)

#### Architecture & Design

- **Zero runtime dependencies** — Pure TypeScript implementation
- **Structured results over exceptions** — ParseResult, SnapshotResult, ValidationResult
- **Deterministic** — Same input always produces same output
- **Type-safe** — Full TypeScript definitions for all FHIR R4 types
- **Modular architecture** — 6 independent modules (model, parser, context, profile, validator, fhirpath)

#### Package Details

- ESM + CJS module formats
- Full TypeScript type declarations
- 211 public exports across 6 modules
- Node.js ≥18.0.0 support
- TypeScript 5.9 compatibility

---

## Version Comparison

### API Compatibility

- **v0.2.0 is fully compatible with v0.1.0** — No breaking changes
- All 211 exports remain unchanged
- Only package name and license changed

### Migration from v0.1.0 to v0.2.0

```diff
- import { parseFhirJson } from '@medxai/fhir-core';
+ import { parseFhirJson } from 'fhir-runtime';
```

```diff
- npm install @medxai/fhir-core
+ npm install fhir-runtime
```

---

## Release Notes

### v0.4.0 Highlights

This release focuses on **composable validation and developer experience** enhancements:

- ✅ **Validation Pipeline** — Composable `ValidationPipeline` with pluggable steps, priority ordering, and failFast mode
- ✅ **Built-in steps** — `StructuralValidationStep`, `TerminologyValidationStep`, `InvariantValidationStep`
- ✅ **Hook system** — Lifecycle events for monitoring and customizing validation flow
- ✅ **Batch validation** — Validate multiple resources in a single pipeline run
- ✅ **Enhanced errors** — Fix suggestions, documentation links, expected/actual values
- ✅ **Validation reports** — Structured reports with multi-axis issue grouping
- ✅ **110 new tests** — 2,995 total across 65 test files

### v0.3.0 Highlights

This release focuses on **provider abstraction and integration readiness** for downstream services:

- ✅ **Provider contracts released** — `TerminologyProvider` and `ReferenceResolver` are now public APIs
- ✅ **NoOp defaults included** — Higher-level projects can integrate immediately without live terminology or persistence backends
- ✅ **OperationOutcome builders added** — Engine result objects can now be translated into FHIR-native response payloads
- ✅ **Validator hooks prepared** — Optional provider fields are available without breaking existing validation flows

### v0.2.0 Highlights

This release focuses on **production readiness** through extensive testing and documentation improvements:

- ✅ **2,400+ tests** — Comprehensive test coverage across all modules
- ✅ **US Core IG verified** — Real-world Implementation Guide validation
- ✅ **Stress tested** — Resilience under extreme conditions
- ✅ **Zero dependencies** — No external runtime dependencies
- ✅ **HAPI-equivalent** — 100% snapshot fixture compatibility

### v0.1.0 Highlights

Initial release providing complete FHIR R4 structural capabilities:

- ✅ **Parsing** — Full FHIR R4 JSON support
- ✅ **Validation** — 9 structural rules + FHIRPath invariants
- ✅ **Snapshot generation** — HAPI-semantically-equivalent differential expansion
- ✅ **FHIRPath** — 60+ functions with Pratt parser
- ✅ **Context management** — Registry, loaders, inheritance resolution

---

## Roadmap

### Planned for v0.5.0

- IG package loading (.tgz) and NpmPackageLoader
- Dependency resolution for IG packages
- Cross-package canonical resolution
- Package registry support

### Planned for v1.0.0

- Stable API freeze
- Long-term support commitment
- Production deployment guidelines
- Enterprise support options

---

## Links

- **Repository**: https://github.com/medxaidev/fhir-runtime
- **Issues**: https://github.com/medxaidev/fhir-runtime/issues
- **Documentation**: [docs/](docs/)
- **License**: [MIT](LICENSE)

---

[0.4.0]: https://github.com/medxaidev/fhir-runtime/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/medxaidev/fhir-runtime/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/medxaidev/fhir-runtime/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/medxaidev/fhir-runtime/releases/tag/v0.1.0
