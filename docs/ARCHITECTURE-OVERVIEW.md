# FHIR Runtime Architecture Overview

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17  
**Target Audience:** Integration developers, system architects

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Design Principles](#design-principles)
3. [Module Architecture](#module-architecture)
4. [Data Flow](#data-flow)
5. [Key Components](#key-components)
6. [Extension Points](#extension-points)
7. [Performance Characteristics](#performance-characteristics)
8. [Deployment Patterns](#deployment-patterns)

---

## System Overview

`fhir-runtime` is a **structural FHIR R4 engine** designed as a lightweight, embeddable runtime layer. It provides comprehensive parsing, validation, and manipulation capabilities without external service dependencies.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  (FHIR Server, CLI Tool, Web App, Data Pipeline)               │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                    fhir-runtime (v0.9.0)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Definition  │  │   Pipeline   │  │ Integration  │         │
│  │   Module     │  │   Module     │  │   Module     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Package    │  │ Terminology  │  │   Provider   │         │
│  │   Module     │  │   Module     │  │   Module     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  FHIRPath    │  │  Validator   │  │   Profile    │         │
│  │   Module     │  │   Module     │  │   Module     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Context    │  │    Parser    │  │    Model     │         │
│  │   Module     │  │   Module     │  │   Module     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│              fhir-definition (v0.6.0)                           │
│  (FHIR Knowledge Engine - DefinitionProvider interface)        │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Layer 1: Foundation (Model, Parser, Context)**
- FHIR R4 type definitions with branded primitives
- JSON parsing/serialization with validation
- StructureDefinition registry and loading

**Layer 2: Core Engine (Profile, Validator, FHIRPath)**
- Snapshot generation (HAPI-equivalent)
- Structural validation (9 rules + invariants)
- FHIRPath expression evaluation (60+ functions)

**Layer 3: Abstraction (Provider, Terminology, Package)**
- Terminology/reference provider contracts
- In-memory terminology validation
- IG package loading and management

**Layer 4: Integration (Pipeline, Integration, Definition)**
- Composable validation pipeline
- SearchParameter and reference extraction
- fhir-definition integration

---

## Design Principles

### 1. Zero Runtime Dependencies

**Principle:** Minimize external dependencies to reduce bundle size and installation complexity.

**Implementation:**
- Single dependency: `fhir-definition@0.6.0` (FHIR knowledge engine)
- All FHIR logic implemented in-house
- No external service calls required

**Benefits:**
- Fast installation (`npm install` completes in seconds)
- Small bundle size (ESM + CJS < 1MB)
- No version conflicts with application dependencies

---

### 2. Deterministic Behavior

**Principle:** Same input always produces same output, no hidden state.

**Implementation:**
- Pure functions for parsing and validation
- Explicit context passing (no global state)
- Immutable data structures where possible
- No random number generation or timestamps in core logic

**Benefits:**
- Predictable behavior in production
- Easy to test and debug
- Safe for concurrent operations

---

### 3. Type Safety

**Principle:** Leverage TypeScript's type system for compile-time safety.

**Implementation:**
- Branded primitive types (`FhirString`, `FhirInteger`, etc.)
- Full type definitions for all FHIR R4 resources
- Generic types for parse results and validation results
- Discriminated unions for choice types

**Benefits:**
- Catch errors at compile time
- Better IDE autocomplete
- Self-documenting API

---

### 4. Fail-Fast with Detailed Errors

**Principle:** Detect errors early and provide actionable error messages.

**Implementation:**
- Validation at parse time
- Path-based error reporting
- Severity levels (error, warning, information)
- Expected vs. actual values in error messages

**Benefits:**
- Easier debugging
- Better developer experience
- Faster development cycles

---

### 5. Extensibility

**Principle:** Provide extension points for custom behavior.

**Implementation:**
- Interface-based abstractions (`TerminologyProvider`, `ReferenceResolver`)
- Custom loader support (`StructureDefinitionLoader`)
- Pluggable validation steps (`ValidationStep`)
- Event hooks for pipeline monitoring

**Benefits:**
- Adapt to different deployment scenarios
- Integrate with existing systems
- Add custom business rules

---

### 6. Performance by Default

**Principle:** Optimize common paths without sacrificing correctness.

**Implementation:**
- AST caching for FHIRPath expressions (LRU, 128 entries)
- Lazy evaluation where possible
- Streaming bundle loading
- Snapshot caching with TTL

**Benefits:**
- Fast validation in production
- Low memory footprint
- Scales to large datasets

---

## Module Architecture

### Dependency Graph

```
Definition ──────────────────────────────────────────────┐
    │                                                     │
    ├─> Pipeline ──> Validator ──> Profile ──> Context   │
    │       │            │              │          │     │
    │       │            │              │          ├─> Model
    │       │            │              │          │
    │       │            │              │          ├─> Parser
    │       │            │              │
    │       │            ├─> FHIRPath ──┘
    │       │
    │       ├─> Terminology ──> Provider
    │
    ├─> Integration ──> Context
    │                    │
    │                    ├─> FHIRPath
    │
    └─> Package ──> Context
```

### Module Descriptions

#### 1. Model Module (Foundation)

**Purpose:** FHIR R4 type definitions

**Exports:** 67 types (primitives, complex types, resources)

**Key Types:**
- Branded primitives: `FhirString`, `FhirInteger`, `FhirBoolean`, etc.
- Complex types: `Element`, `Extension`, `Coding`, `CodeableConcept`, `Reference`
- Resources: `StructureDefinition`, `ElementDefinition`
- Canonical types: `CanonicalProfile`, `CanonicalElement`

**Dependencies:** None

**Design Notes:**
- Branded types prevent accidental mixing of string types
- Enums for controlled vocabularies
- Structural typing for flexibility

---

#### 2. Parser Module (Foundation)

**Purpose:** JSON parsing and serialization

**Exports:** 12 functions, 6 types

**Key Functions:**
- `parseFhirJson()` — Parse JSON string
- `parseFhirObject()` — Parse JavaScript object
- `serializeToFhirJson()` — Serialize to JSON
- `parseStructureDefinition()` — Parse StructureDefinition

**Dependencies:** Model

**Design Notes:**
- Validates primitives during parse
- Handles choice types (`value[x]`)
- Detailed error messages with paths
- Preserves unknown fields (forward compatibility)

---

#### 3. Context Module (Foundation)

**Purpose:** StructureDefinition registry and loading

**Exports:** 25 functions/classes, 8 types

**Key Classes:**
- `FhirContextImpl` — Main context class
- `MemoryLoader` — In-memory loader
- `FileSystemLoader` — File system loader
- `CompositeLoader` — Multi-loader with fallback

**Dependencies:** Model, Parser

**Design Notes:**
- Lazy loading of definitions
- Inheritance resolution (base → derived)
- Bundle loading support
- 73 core definitions bundled

---

#### 4. Profile Module (Core Engine)

**Purpose:** Snapshot generation and canonical profiles

**Exports:** 38 functions/classes, 12 types

**Key Classes:**
- `SnapshotGenerator` — Generate snapshots from differentials

**Key Functions:**
- `buildCanonicalProfile()` — Build canonical from snapshot
- `mergeConstraints()` — Merge base + differential constraints
- Path utilities (30+ functions)

**Dependencies:** Model, Parser, Context

**Design Notes:**
- HAPI-equivalent snapshot generation
- 35/35 HAPI fixtures match
- Handles slicing, choice types, BackboneElements
- Constraint tightening validation

---

#### 5. Validator Module (Core Engine)

**Purpose:** Structural validation

**Exports:** 6 functions/classes, 4 types

**Key Classes:**
- `StructureValidator` — Main validator

**Validation Rules:**
1. Required fields present
2. Cardinality constraints (min/max)
3. Type constraints
4. Fixed value constraints
5. Pattern constraints
6. FHIRPath invariants
7. Terminology bindings
8. Reference target types
9. Slicing rules

**Dependencies:** Model, Parser, Profile, FHIRPath

**Design Notes:**
- Configurable validation options
- Detailed issue reporting with paths
- Supports custom terminology providers

---

#### 6. FHIRPath Module (Core Engine)

**Purpose:** FHIRPath expression evaluation

**Exports:** 4 functions

**Key Functions:**
- `evalFhirPath()` — Evaluate to array
- `evalFhirPathBoolean()` — Evaluate to boolean
- `evalFhirPathString()` — Evaluate to string
- `evalFhirPathTyped()` — Evaluate to typed values

**Supported Functions:** 60+ (collection, string, math, type, date/time, utility)

**Dependencies:** Model

**Design Notes:**
- Pratt parser for operator precedence
- AST caching (LRU, 128 entries)
- Type-safe evaluation
- Supports FHIR R4 FHIRPath spec

---

#### 7. Provider Module (Abstraction)

**Purpose:** Abstraction layer for external services

**Exports:** 8 types, 5 functions

**Key Interfaces:**
- `TerminologyProvider` — Terminology service contract
- `RemoteTerminologyProvider` — Remote terminology service
- `ReferenceResolver` — Reference resolution contract

**Key Classes:**
- `NoOpTerminologyProvider` — No-op implementation
- `NoOpReferenceResolver` — No-op implementation

**Dependencies:** Model

**Design Notes:**
- Interface-based design for flexibility
- NoOp implementations for development
- OperationOutcome builders for FHIR-native errors

---

#### 8. Terminology Module (Abstraction)

**Purpose:** In-memory terminology validation

**Exports:** 11 functions/classes, 10 types

**Key Classes:**
- `InMemoryTerminologyProvider` — In-memory provider
- `CodeSystemRegistry` — CodeSystem registry with hierarchy
- `ValueSetRegistry` — ValueSet registry with expansion

**Key Functions:**
- `validateBinding()` — Validate coded value against binding
- `extractCodedValues()` — Extract Coding from CodeableConcept

**Dependencies:** Model, Provider

**Design Notes:**
- Supports all 4 binding strengths (required, extensible, preferred, example)
- Hierarchical CodeSystem support
- ValueSet expansion with compose/include/exclude
- Bundle loading for terminology resources

---

#### 9. Package Module (Abstraction)

**Purpose:** IG package loading and management

**Exports:** 13 functions/classes, 7 types

**Key Classes:**
- `NpmPackageLoader` — Load NPM FHIR packages
- `PackageManager` — Multi-package management

**Key Functions:**
- `parsePackageManifest()` — Parse package.json
- `parsePackageIndex()` — Parse .index.json
- `buildDependencyGraph()` — Build dependency graph
- `topologicalSort()` — Sort packages by dependencies
- `resolveCanonical()` — Version-aware canonical resolution

**Dependencies:** Model, Parser, Context

**Design Notes:**
- Supports NPM FHIR package format
- Dependency resolution with cycle detection
- Cross-package canonical resolution
- Verified with US Core v9.0.0 (70 SDs, 20 ValueSets)

---

#### 10. Integration Module (Layer 4)

**Purpose:** Server/persistence integration utilities

**Exports:** 9 functions/classes, 6 types

**Key Functions:**
- `parseSearchParameter()` — Parse SearchParameter resource
- `extractSearchValues()` — Extract search index values
- `extractReferences()` — Extract all references from resource
- `buildCapabilityFragment()` — Build CapabilityStatement fragment

**Key Classes:**
- `ResourceTypeRegistry` — Registry of 148 R4 resource types

**Dependencies:** Model, Parser, Context, FHIRPath

**Design Notes:**
- FHIRPath-based search value extraction
- Supports all 7 search parameter types (string, token, reference, date, number, quantity, uri)
- Reference extraction handles literal, contained, absolute, logical references
- CapabilityStatement generation for REST APIs

---

#### 11. Pipeline Module (Layer 4)

**Purpose:** Composable validation pipeline

**Exports:** 8 functions/classes, 11 types

**Key Classes:**
- `ValidationPipeline` — Main pipeline orchestrator
- `StructuralValidationStep` — Structural validation
- `TerminologyValidationStep` — Terminology validation
- `InvariantValidationStep` — FHIRPath invariant validation
- `HookManager` — Event hook management

**Key Functions:**
- `generateReport()` — Generate structured report
- `enhanceIssue()` — Enhance issue with suggestions

**Dependencies:** Model, Validator, Terminology, Provider

**Design Notes:**
- Pluggable validation steps with priority ordering
- Lifecycle hooks (step:start, step:complete, pipeline:complete)
- Batch validation support
- Enhanced error messages with fix suggestions
- Configurable fail-fast mode

---

#### 12. Definition Module (Layer 4)

**Purpose:** Integration with fhir-definition

**Exports:** 9 types, 4 classes/functions

**Key Functions:**
- `createRuntime()` — One-step runtime factory

**Key Classes:**
- `DefinitionBridge` — Adapter from FhirContext to DefinitionProvider
- `DefinitionProviderLoader` — Adapter from DefinitionProvider to StructureDefinitionLoader
- `SnapshotCache` — LRU cache for generated snapshots

**Dependencies:** All modules, fhir-definition

**Design Notes:**
- Direct dependency on fhir-definition@0.6.0
- Re-exports types from fhir-definition
- Three integration patterns (external provider, FhirContext, bare minimum)
- Lazy snapshot generation with caching
- Warmup support for preloading snapshots

---

## Data Flow

### Parse Flow

```
JSON String
    │
    ├─> parseFhirJson()
    │       │
    │       ├─> Validate JSON syntax
    │       ├─> Parse resourceType
    │       ├─> Parse primitives (branded types)
    │       ├─> Parse choice types (value[x])
    │       ├─> Parse extensions
    │       └─> Return ParseResult
    │
    └─> ParseResult { success, data, issues }
```

### Validation Flow

```
Resource + Profile URL
    │
    ├─> createRuntime() or FhirContext
    │       │
    │       ├─> Load StructureDefinition
    │       ├─> Generate snapshot (if needed)
    │       ├─> Build CanonicalProfile
    │       │
    │       └─> CanonicalProfile
    │
    ├─> ValidationPipeline.validate()
    │       │
    │       ├─> StructuralValidationStep
    │       │       ├─> Check required fields
    │       │       ├─> Check cardinality
    │       │       ├─> Check types
    │       │       └─> Issues
    │       │
    │       ├─> TerminologyValidationStep
    │       │       ├─> Extract coded values
    │       │       ├─> Validate bindings
    │       │       └─> Issues
    │       │
    │       ├─> InvariantValidationStep
    │       │       ├─> Evaluate FHIRPath expressions
    │       │       ├─> Check constraints
    │       │       └─> Issues
    │       │
    │       └─> PipelineResult
    │
    └─> ValidationResult { valid, issues }
```

### Snapshot Generation Flow

```
Profile StructureDefinition (differential)
    │
    ├─> SnapshotGenerator.generate()
    │       │
    │       ├─> Resolve base definition
    │       │       │
    │       │       └─> FhirContext.resolveStructureDefinition()
    │       │
    │       ├─> Get base snapshot
    │       │       │
    │       │       └─> Recursive generate if needed
    │       │
    │       ├─> Sort differential elements
    │       │
    │       ├─> Merge base + differential
    │       │       │
    │       │       ├─> For each base element:
    │       │       │       ├─> Find matching diff elements
    │       │       │       ├─> Merge constraints
    │       │       │       ├─> Handle slicing
    │       │       │       └─> Add to snapshot
    │       │       │
    │       │       └─> Snapshot elements
    │       │
    │       ├─> Build canonical profile
    │       │
    │       └─> SnapshotResult
    │
    └─> StructureDefinition (with snapshot)
```

### Package Loading Flow

```
NPM Package Directory
    │
    ├─> NpmPackageLoader
    │       │
    │       ├─> Load package.json (manifest)
    │       ├─> Load .index.json (resource index)
    │       │
    │       └─> PackageLoader
    │
    ├─> PackageManager.registerPackage()
    │       │
    │       ├─> Build dependency graph
    │       ├─> Topological sort
    │       ├─> Load resources
    │       │       │
    │       │       ├─> Filter by resource type
    │       │       ├─> Parse resources
    │       │       └─> Register in context
    │       │
    │       └─> Package registered
    │
    └─> PackageManager.resolveCanonical()
            │
            ├─> Parse canonical URL (url|version)
            ├─> Search across packages
            └─> Resolved resource
```

---

## Key Components

### FhirContext

**Role:** Central registry for StructureDefinitions

**Responsibilities:**
- Load and cache StructureDefinitions
- Resolve canonical URLs
- Manage loaders
- Track statistics

**Lifecycle:**
```typescript
// 1. Create context
const ctx = new FhirContextImpl({ loaders: [loader] });

// 2. Preload core definitions (optional but recommended)
await ctx.preloadCoreDefinitions();

// 3. Load additional definitions
await ctx.loadBundle(igBundle);

// 4. Resolve definitions
const sd = await ctx.resolveStructureDefinition(url);

// 5. Use throughout application lifecycle
```

---

### SnapshotGenerator

**Role:** Generate snapshots from differential profiles

**Algorithm:**
1. Resolve base definition
2. Get base snapshot (recursive if needed)
3. Sort differential elements by path
4. For each base element:
   - Find matching differential elements
   - Merge constraints (cardinality, types, binding, etc.)
   - Handle slicing (new slices, slice constraints)
   - Add merged element to snapshot
5. Validate unconsumed differential elements
6. Build canonical profile

**Complexity:** O(n × m) where n = base elements, m = differential elements

**Optimizations:**
- Early exit on unconsumed differentials
- Path-based indexing for fast lookups
- Cached base snapshots

---

### StructureValidator

**Role:** Validate resources against profiles

**Validation Rules:**
1. **Required fields** — Check `min >= 1`
2. **Cardinality** — Check `min <= count <= max`
3. **Type constraints** — Check value matches allowed types
4. **Fixed values** — Check value equals fixed value
5. **Pattern values** — Check value matches pattern
6. **FHIRPath invariants** — Evaluate constraint expressions
7. **Terminology bindings** — Validate codes against ValueSets
8. **Reference targets** — Check reference type matches allowed targets
9. **Slicing rules** — Validate slice membership and constraints

**Performance:** O(n) where n = number of elements in resource

---

### FHIRPath Engine

**Role:** Evaluate FHIRPath expressions

**Architecture:**
- **Lexer** — Tokenize expression string
- **Parser** — Build AST using Pratt parsing
- **Evaluator** — Walk AST and evaluate nodes
- **Function Library** — 60+ built-in functions

**Caching:**
- LRU cache for parsed ASTs (128 entries)
- Cache key: expression string
- Invalidation: LRU eviction

**Performance:** 
- Parse: O(n) where n = expression length
- Evaluate: O(m) where m = AST nodes
- Cached parse: O(1)

---

### ValidationPipeline

**Role:** Orchestrate multi-step validation

**Architecture:**
```
Pipeline
    │
    ├─> Step 1 (priority 10)
    ├─> Step 2 (priority 20)
    ├─> Step 3 (priority 30)
    │
    └─> Aggregate results
```

**Features:**
- Priority-based step ordering
- Fail-fast mode (stop on first error)
- Lifecycle hooks (monitoring, logging)
- Batch validation
- Enhanced error messages

**Extensibility:**
```typescript
class CustomStep implements ValidationStep {
  name = 'custom';
  priority = 100;
  
  async validate(resource, profile, context) {
    // Custom validation logic
    return { issues: [] };
  }
}

pipeline.addStep(new CustomStep());
```

---

## Extension Points

### 1. Custom Loaders

Implement `StructureDefinitionLoader` interface:

```typescript
interface StructureDefinitionLoader {
  load(url: string): Promise<StructureDefinition | null>;
  loadAll(): Promise<StructureDefinition[]>;
}
```

**Use Cases:**
- Load from database
- Load from HTTP API
- Load from custom file format
- Load with caching/memoization

---

### 2. Custom Terminology Providers

Implement `TerminologyProvider` interface:

```typescript
interface TerminologyProvider {
  validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult>;
  expandValueSet(params: ExpandValueSetParams): Promise<ValueSetExpansion>;
  lookupCode(params: LookupCodeParams): Promise<LookupCodeResult>;
}
```

**Use Cases:**
- External terminology server (tx.fhir.org)
- Database-backed terminology
- Cached terminology with fallback
- Custom terminology logic

---

### 3. Custom Validation Steps

Implement `ValidationStep` interface:

```typescript
interface ValidationStep {
  name: string;
  priority: number;
  validate(
    resource: any,
    profile: CanonicalProfile,
    context: PipelineContext
  ): Promise<StepResult>;
}
```

**Use Cases:**
- Business rule validation
- Custom constraint checking
- External service validation
- Audit logging

---

### 4. Pipeline Hooks

Register event handlers:

```typescript
pipeline.on('step:start', (data) => {
  console.log(`Starting ${data.stepName}`);
});

pipeline.on('step:complete', (data) => {
  console.log(`Completed ${data.stepName} in ${data.duration}ms`);
});

pipeline.on('pipeline:complete', (data) => {
  console.log(`Total issues: ${data.result.issues.length}`);
});
```

**Use Cases:**
- Performance monitoring
- Logging and auditing
- Metrics collection
- Progress reporting

---

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Parse JSON | O(n) | n = JSON size |
| Validate resource | O(m) | m = element count |
| Generate snapshot | O(b × d) | b = base elements, d = diff elements |
| Evaluate FHIRPath | O(e) | e = AST nodes (cached parse) |
| Load bundle | O(r) | r = resource count |
| Resolve canonical | O(1) | With indexing |

### Space Complexity

| Component | Space | Notes |
|-----------|-------|-------|
| FhirContext | O(s) | s = StructureDefinition count |
| SnapshotCache | O(c) | c = cache size (configurable) |
| FHIRPath cache | O(128) | Fixed LRU size |
| ValidationPipeline | O(i) | i = issue count |

### Benchmarks (Approximate)

| Operation | Time | Notes |
|-----------|------|-------|
| Parse Patient | ~1ms | Simple resource |
| Validate Patient | ~5ms | With US Core profile |
| Generate snapshot | ~10ms | Medium complexity profile |
| Evaluate FHIRPath | ~0.1ms | Cached AST |
| Load US Core package | ~500ms | 70 SDs, 20 ValueSets |

---

## Deployment Patterns

### Pattern 1: FHIR Server

```
┌─────────────────────────────────────────┐
│         Express.js / Fastify            │
├─────────────────────────────────────────┤
│         fhir-runtime (singleton)        │
├─────────────────────────────────────────┤
│    PostgreSQL (resource storage)        │
│    Redis (search index cache)           │
└─────────────────────────────────────────┘
```

**Initialization:**
```typescript
// app.ts
const runtime = await createRuntime({
  definitions: registry,
  terminologyProvider: new HttpTerminologyProvider('https://tx.fhir.org'),
});

app.locals.runtime = runtime;
```

**Request Handler:**
```typescript
app.post('/fhir/:resourceType', async (req, res) => {
  const runtime = req.app.locals.runtime;
  const result = await runtime.validate(req.body, profileUrl);
  // ... handle result
});
```

---

### Pattern 2: CLI Tool

```
┌─────────────────────────────────────────┐
│         CLI (Commander.js)              │
├─────────────────────────────────────────┤
│    fhir-runtime (per-command instance)  │
├─────────────────────────────────────────┤
│    File System (IG packages, resources) │
└─────────────────────────────────────────┘
```

**Command:**
```typescript
program
  .command('validate')
  .action(async (file, options) => {
    const runtime = await createRuntime();
    const resource = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const result = await runtime.validate(resource, options.profile);
    // ... output result
  });
```

---

### Pattern 3: Web Application

```
┌─────────────────────────────────────────┐
│      React / Vue / Angular              │
├─────────────────────────────────────────┤
│    fhir-runtime (browser bundle)        │
├─────────────────────────────────────────┤
│    IndexedDB (local cache)              │
└─────────────────────────────────────────┘
```

**Component:**
```typescript
import { parseFhirJson, StructureValidator } from 'fhir-runtime';

function ValidatorComponent({ json, profile }) {
  const [errors, setErrors] = useState([]);
  
  useEffect(() => {
    const result = parseFhirJson(json);
    if (!result.success) {
      setErrors(result.issues);
      return;
    }
    
    const validator = new StructureValidator();
    const validationResult = validator.validate(result.data, profile);
    setErrors(validationResult.issues);
  }, [json, profile]);
  
  // ... render errors
}
```

---

### Pattern 4: Data Pipeline

```
┌─────────────────────────────────────────┐
│    ETL Pipeline (Node.js streams)       │
├─────────────────────────────────────────┤
│    fhir-runtime (batch validation)      │
├─────────────────────────────────────────┤
│    S3 / Data Lake (source/destination)  │
└─────────────────────────────────────────┘
```

**Pipeline:**
```typescript
const runtime = await createRuntime();

const stream = fs.createReadStream('resources.ndjson')
  .pipe(split())
  .pipe(new Transform({
    objectMode: true,
    async transform(line, enc, callback) {
      const resource = JSON.parse(line);
      const result = await runtime.validate(resource, profileUrl);
      
      if (result.valid) {
        this.push(resource);
      } else {
        console.error(`Invalid: ${resource.id}`, result.issues);
      }
      
      callback();
    }
  }))
  .pipe(fs.createWriteStream('valid-resources.ndjson'));
```

---

## Next Steps

- **[Integration Guide](./INTEGRATION-GUIDE.md)** — Setup and integration patterns
- **[API Reference](./API-REFERENCE.md)** — Complete API documentation
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues and solutions

---

**Questions?**

- GitHub Issues: https://github.com/medxaidev/fhir-runtime/issues
- Documentation: https://github.com/medxaidev/fhir-runtime#readme
