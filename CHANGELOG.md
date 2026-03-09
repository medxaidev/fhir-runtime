# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-03-09

### Added

#### IG Package & Canonical Resolution (STAGE-4)

- **New module: `src/package/`** — FHIR IG NPM package loading and canonical resolution
  - `NpmPackageLoader` class — implements `StructureDefinitionLoader` for CompositeLoader integration
  - `PackageManager` class — multi-package management with dependency resolution
  - `parsePackageManifest()` / `parsePackageManifestFromString()` — parse `package.json`
  - `parsePackageIndex()` / `parsePackageIndexFromString()` — parse `.index.json`
  - `filterIndexByResourceType()` — filter index entries by resource type
  - `buildDependencyGraph()` — recursive dependency resolution with topological sorting
  - `topologicalSort()` — dependency-order sorting
  - `findMissingDependencies()` — detect unresolved dependencies
  - `CircularPackageDependencyError` — thrown on circular dependency detection
  - `parseCanonicalUrl()` — split `url|version` canonical format
  - `resolveCanonical()` — version-aware cross-package canonical URL resolution
  - `resolveAllByType()` — enumerate all resources of a type across packages
  - `CONFORMANCE_RESOURCE_TYPES` constant

- **NpmPackageLoader features**
  - `.index.json` fast lookup with filesystem scan fallback
  - `resourceTypes` filter for selective loading
  - `loadAllStructureDefinitions()` / `loadAllValueSets()` / `loadAllCodeSystems()` bulk loading
  - `loadResource()` — load any resource by canonical URL
  - `resolveCanonical()` — resolve URL to file entry

- **PackageManager features**
  - `registerPackage()` — register extracted IG packages
  - `discoverPackages()` — auto-discover packages in cache directory
  - `resolveDependencies()` — build dependency graph with topological ordering
  - `resolveCanonical()` / `resolveAllByType()` — cross-package resolution
  - `createLoader()` — create CompositeLoader for FhirContext integration

- **Type definitions** — 9 new type exports: `PackageManifest`, `PackageIndex`, `PackageIndexEntry`, `NpmPackageLoaderOptions`, `PackageManagerOptions`, `PackageInfo`, `DependencyGraph`, `DependencyNode`, `CanonicalResolution`

- **New exports in `src/index.ts`** — 10 type exports + 16 value exports from package module

#### Testing

- 138 new tests across 7 test files in `src/package/__tests__/`
  - `package-manifest-parser.test.ts` (13 tests)
  - `package-index-parser.test.ts` (14 tests)
  - `npm-package-loader.test.ts` (32 tests — index, scan, load, filter, bulk)
  - `dependency-resolver.test.ts` (15 tests — graph, topo sort, cycle, diamond, missing)
  - `canonical-resolver.test.ts` (22 tests — version, multi-loader, all types)
  - `package-manager.test.ts` (17 tests — register, discover, resolve, create loader)
  - `integration.test.ts` (25 tests — 11 mock + 14 real US Core v9.0.0)
- 3 mock IG packages (test-ig, dep-ig, no-index-ig) with 11 JSON resource fixtures
- Real US Core v9.0.0 package integration (214 files: 70 SDs, 20 ValueSets, 4 CodeSystems)
- All v0.5.0 tests remain 100% passing (backward compatibility verified)
- Total: 3,266 tests across 82 test files

### Notes

- `NpmPackageLoader` implements `StructureDefinitionLoader` — drop-in compatible with `CompositeLoader` and `FhirContextImpl`
- Package extraction from `.tgz` must be done externally (no download/extraction support by design)
- Version ranges in dependencies not supported (exact match only)
- Browser compatibility requires abstracting `node:fs` calls
- This release remains backward compatible with v0.5.0

---

## [0.5.0] - 2026-03-09

### Added

#### Terminology Binding Validation (STAGE-3)

- **New module: `src/terminology/`** — Terminology binding validation with in-memory provider
  - `InMemoryTerminologyProvider` class — fully functional `TerminologyProvider` implementation
  - `validateBinding()` — binding strength-aware code validation
  - `extractCodedValues()` — extract codes from FHIR coded elements (code, Coding, CodeableConcept)
  - `CodeSystemRegistry` — in-memory CodeSystem storage with hierarchical concept lookup
  - `ValueSetRegistry` — in-memory ValueSet storage
  - `isCodeInValueSet()` — ValueSet membership evaluation (expansion, compose, filters)

- **Binding strength validation**
  - `severityForBindingStrength()` — map strength to issue severity
  - `severityWhenNoProvider()` — severity when no provider available
  - `requiresValidation()` — whether binding needs validation
  - `bindingStrengthDescription()` — human-readable strength description

- **CodeSystem features**
  - Hierarchical concept lookup with recursive traversal
  - `isDescendantOf()` for is-a relationship checks in hierarchical CodeSystems
  - `allCodes()` for flat enumeration of all codes

- **ValueSet membership**
  - Pre-expanded ValueSet evaluation (expansion.contains)
  - Compose-based evaluation (include/exclude rules)
  - Enumerated concept matching
  - Filter operations: `is-a`, `is-not-a`, `in`, `not-in`, `=`, `regex`, `exists`
  - CodeSystem hierarchy traversal for `is-a` filters

- **Bundle loading**
  - `loadFromBundle()` on InMemoryTerminologyProvider
  - Automatic CodeSystem and ValueSet extraction from FHIR Bundles

- **Type definitions** — 11 new type exports: `CodeSystemDefinition`, `CodeSystemConcept`, `ValueSetDefinition`, `ValueSetCompose`, `ValueSetComposeInclude`, `ValueSetComposeConcept`, `ValueSetComposeFilter`, `ValueSetExpansionDef`, `ValueSetExpansionContainsDef`, `BindingValidationResult`, `BindingConstraintInput`

- **New exports in `src/index.ts`** — 11 type exports + 10 value exports from terminology module

#### Testing

- 133 new tests across 10 test files in `src/terminology/__tests__/`
  - `binding-strength-required.test.ts` (6 tests)
  - `binding-strength-extensible.test.ts` (6 tests)
  - `binding-strength-preferred.test.ts` (6 tests)
  - `binding-strength-example.test.ts` (6 tests)
  - `codesystem-registry.test.ts` (13 tests)
  - `valueset-registry.test.ts` (7 tests)
  - `valueset-membership.test.ts` (21 JSON fixture tests)
  - `binding-validator.test.ts` (21 tests)
  - `inmemory-terminology-provider.test.ts` (30 JSON fixture tests)
  - `terminology-integration.test.ts` (17 end-to-end integration tests)
- 8 JSON fixture files (3 CodeSystems + 5 ValueSets)
- All v0.4.0 tests remain 100% passing (backward compatibility verified)
- Total: 3,128 tests across 75 test files

### Notes

- `TerminologyValidationStep` (STAGE-2 pipeline) is now fully functional with `InMemoryTerminologyProvider`
- `InMemoryTerminologyProvider` is suitable for testing and small-scale embedded ValueSets, NOT for large CodeSystems like full SNOMED CT
- No remote terminology server support by design (belongs to fhir-server layer)
- This release remains backward compatible with v0.4.0

---

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

### v0.6.0 Highlights

This release completes **IG package loading and canonical resolution**:

- **NpmPackageLoader** — Load FHIR IG packages from extracted NPM directories
- **PackageManager** — Register, discover, manage multiple IG packages
- **Canonical Resolution** — Version-aware cross-package `url|version` resolution
- **Dependency Graph** — Topological sorting with circular dependency detection
- **US Core verified** — Real US Core v9.0.0 loaded (70 SDs, 20 ValueSets, 4 CodeSystems)
- **138 new tests** — 3,266 total across 82 test files

### v0.5.0 Highlights

This release completes **terminology binding validation**:

- **InMemoryTerminologyProvider** — Full `TerminologyProvider` implementation for local validation
- **Binding strength** — `required` / `extensible` / `preferred` / `example` validation
- **Registries** — `CodeSystemRegistry` (hierarchical) + `ValueSetRegistry`
- **ValueSet membership** — expansion, compose, filters (is-a, regex, etc.)
- **Pipeline integration** — `TerminologyValidationStep` now fully functional
- **133 new tests** — 3,128 total across 75 test files

### v0.4.0 Highlights

This release focuses on **composable validation and developer experience** enhancements:

- **Validation Pipeline** — Composable `ValidationPipeline` with pluggable steps, priority ordering, and failFast mode
- **Built-in steps** — `StructuralValidationStep`, `TerminologyValidationStep`, `InvariantValidationStep`
- **Hook system** — Lifecycle events for monitoring and customizing validation flow
- **Batch validation** — Validate multiple resources in a single pipeline run
- **Enhanced errors** — Fix suggestions, documentation links, expected/actual values
- **Validation reports** — Structured reports with multi-axis issue grouping
- **110 new tests** — 2,995 total across 65 test files

### v0.3.0 Highlights

This release focuses on **provider abstraction and integration readiness** for downstream services:

- **Provider contracts released** — `TerminologyProvider` and `ReferenceResolver` are now public APIs
- **NoOp defaults included** — Higher-level projects can integrate immediately without live terminology or persistence backends
- **OperationOutcome builders added** — Engine result objects can now be translated into FHIR-native response payloads
- **Validator hooks prepared** — Optional provider fields are available without breaking existing validation flows

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
