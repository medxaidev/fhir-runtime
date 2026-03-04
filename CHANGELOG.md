# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- ✅ **Snapshot generation** — HAPI-equivalent differential expansion
- ✅ **FHIRPath** — 60+ functions with Pratt parser
- ✅ **Context management** — Registry, loaders, inheritance resolution

---

## Roadmap

### Planned for v0.3.0

- Terminology service integration (ValueSet expansion, code validation)
- Additional IG support (more Implementation Guides verified)
- Performance optimizations
- Enhanced error messages

### Planned for v1.0.0

- Stable API freeze
- Long-term support commitment
- Production deployment guidelines
- Enterprise support options

---

## Links

- **Repository**: https://github.com/medxaidev/medxai
- **Issues**: https://github.com/medxaidev/medxai/issues
- **Documentation**: [docs/](docs/)
- **License**: [MIT](LICENSE)

---

[0.2.0]: https://github.com/medxaidev/medxai/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/medxaidev/medxai/releases/tag/v0.1.0
