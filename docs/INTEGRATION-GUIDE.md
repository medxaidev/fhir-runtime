# FHIR Runtime Integration Guide

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17  
**Minimum Requirements:** Node.js ≥18.0.0, TypeScript ≥5.0

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Integration Patterns](#integration-patterns)
5. [Module-by-Module Guide](#module-by-module-guide)
6. [Advanced Usage](#advanced-usage)
7. [Performance Optimization](#performance-optimization)
8. [Migration Guide](#migration-guide)

---

## Overview

`fhir-runtime` is a production-ready FHIR R4 runtime engine designed for embedding in servers, CLIs, web applications, and custom platforms. It provides comprehensive parsing, validation, and manipulation capabilities without requiring external services.

### Key Characteristics

- **Zero runtime dependencies** (single dev dependency: `fhir-definition@0.6.0`)
- **Dual module format** — ESM + CJS for maximum compatibility
- **Type-safe** — Full TypeScript definitions for all FHIR R4 types
- **Deterministic** — Same input always produces same output
- **Memory efficient** — Streaming bundle loading, lazy evaluation
- **Production tested** — 4,181 tests, 100% pass rate

### What's In Scope

✅ FHIR R4 JSON parsing and serialization  
✅ StructureDefinition registry and loading  
✅ Snapshot generation (HAPI-equivalent)  
✅ Structural validation (9 rules + FHIRPath invariants)  
✅ FHIRPath expression evaluation (60+ functions)  
✅ Terminology binding validation  
✅ IG package loading and management  
✅ SearchParameter parsing and value extraction  
✅ Reference extraction and validation  
✅ CapabilityStatement generation  

### What's Out of Scope

❌ REST FHIR server implementation  
❌ Database/persistence layer  
❌ External terminology service integration  
❌ XML/RDF serialization  
❌ FHIR R5/R6 support  

---

## Installation

### NPM Installation

```bash
npm install fhir-runtime
```

### Yarn Installation

```bash
yarn add fhir-runtime
```

### PNPM Installation

```bash
pnpm add fhir-runtime
```

### Version Compatibility

| fhir-runtime | Node.js | TypeScript | fhir-definition |
|--------------|---------|------------|-----------------|
| 0.9.0        | ≥18.0.0 | ≥5.0       | 0.6.0           |
| 0.8.0        | ≥18.0.0 | ≥5.0       | 0.6.0           |
| 0.7.0        | ≥18.0.0 | ≥5.0       | file:../        |
| 0.6.0        | ≥18.0.0 | ≥5.0       | N/A             |

### Verify Installation

```typescript
import { parseFhirJson } from 'fhir-runtime';

const result = parseFhirJson('{"resourceType": "Patient", "id": "test"}');
console.log(result.success); // true
```

---

## Quick Start

### Pattern 1: Simple Parsing

```typescript
import { parseFhirJson } from 'fhir-runtime';

const json = `{
  "resourceType": "Patient",
  "id": "example",
  "name": [{ "family": "Doe", "given": ["John"] }]
}`;

const result = parseFhirJson(json);

if (result.success) {
  console.log(result.data.resourceType); // "Patient"
  console.log(result.data.name[0].family); // "Doe"
} else {
  result.issues.forEach(issue => {
    console.error(`${issue.severity}: ${issue.message}`);
  });
}
```

### Pattern 2: Validation with Context

```typescript
import {
  FhirContextImpl,
  StructureValidator,
  buildCanonicalProfile,
  parseStructureDefinition,
} from 'fhir-runtime';

// Initialize context
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();

// Load a profile
const sdResult = parseStructureDefinition(profileJson);
const profile = buildCanonicalProfile(sdResult.data);

// Validate
const validator = new StructureValidator();
const result = validator.validate(patientResource, profile);

if (!result.valid) {
  result.issues.forEach(issue => {
    console.error(`${issue.severity}: ${issue.message} at ${issue.path}`);
  });
}
```

### Pattern 3: One-Step Runtime (Recommended)

```typescript
import { createRuntime } from 'fhir-runtime';

// Auto-loads R4 core definitions
const runtime = await createRuntime();

// Validate against a profile
const result = await runtime.validate(
  patient,
  'http://hl7.org/fhir/StructureDefinition/Patient'
);

// Get search parameters
const searchParams = runtime.getSearchParameters('Patient');

// Extract search values
const values = runtime.extractSearchValues(patient, searchParams[0]);
```

---

## Integration Patterns

### Pattern A: FHIR Server Integration

```typescript
import { createRuntime, ValidationPipeline } from 'fhir-runtime';
import { InMemoryDefinitionRegistry, loadFromDirectory } from 'fhir-definition';

// Load definitions
const registry = new InMemoryDefinitionRegistry();
await loadFromDirectory('./fhir-packages', registry);

// Create runtime
const runtime = await createRuntime({ definitions: registry });

// Express.js route handler
app.post('/fhir/:resourceType', async (req, res) => {
  const { resourceType } = req.params;
  const resource = req.body;

  // Validate
  const result = await runtime.validate(
    resource,
    `http://hl7.org/fhir/StructureDefinition/${resourceType}`
  );

  if (!result.valid) {
    return res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: result.issues.map(i => ({
        severity: i.severity,
        code: 'invalid',
        diagnostics: i.message,
      })),
    });
  }

  // Extract search parameters for indexing
  const searchParams = runtime.getSearchParameters(resourceType);
  const searchIndex = {};
  for (const sp of searchParams) {
    const values = runtime.extractSearchValues(resource, sp);
    searchIndex[sp.code] = values;
  }

  // Store resource + search index
  await db.save(resource, searchIndex);

  res.status(201).json(resource);
});
```

### Pattern B: CLI Tool Integration

```typescript
import { createRuntime } from 'fhir-runtime';
import { readFileSync } from 'fs';

async function validateFile(filePath: string, profileUrl: string) {
  const runtime = await createRuntime();
  const json = readFileSync(filePath, 'utf-8');
  const resource = JSON.parse(json);

  const result = await runtime.validate(resource, profileUrl);

  if (result.valid) {
    console.log('✅ Validation passed');
  } else {
    console.error('❌ Validation failed:');
    result.issues.forEach(issue => {
      console.error(`  ${issue.severity}: ${issue.message} at ${issue.path}`);
    });
    process.exit(1);
  }
}
```

### Pattern C: Web Application Integration

```typescript
import { parseFhirJson, StructureValidator } from 'fhir-runtime';

// React component
function PatientValidator({ patientJson, profile }) {
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const result = parseFhirJson(patientJson);
    if (!result.success) {
      setErrors(result.issues);
      return;
    }

    const validator = new StructureValidator();
    const validationResult = validator.validate(result.data, profile);
    
    if (!validationResult.valid) {
      setErrors(validationResult.issues);
    } else {
      setErrors([]);
    }
  }, [patientJson, profile]);

  return (
    <div>
      {errors.length === 0 ? (
        <div className="success">✅ Valid</div>
      ) : (
        <ul className="errors">
          {errors.map((err, i) => (
            <li key={i}>{err.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Pattern D: Batch Processing Pipeline

```typescript
import { createRuntime, ValidationPipeline } from 'fhir-runtime';

async function processBatch(resources: any[]) {
  const runtime = await createRuntime();

  // Batch validation
  const results = await runtime.validateMany(
    resources.map(r => ({
      resource: r,
      profileUrl: `http://hl7.org/fhir/StructureDefinition/${r.resourceType}`,
    }))
  );

  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  console.log(`✅ Valid: ${valid.length}`);
  console.log(`❌ Invalid: ${invalid.length}`);

  return { valid, invalid };
}
```

---

## Module-by-Module Guide

### 1. Parser Module

**Purpose:** Parse and serialize FHIR R4 JSON

```typescript
import {
  parseFhirJson,
  parseFhirObject,
  serializeToFhirJson,
  serializeToFhirObject,
  parseStructureDefinition,
} from 'fhir-runtime';

// Parse JSON string
const result1 = parseFhirJson('{"resourceType": "Patient"}');

// Parse JavaScript object
const result2 = parseFhirObject({ resourceType: 'Patient' });

// Parse StructureDefinition
const sdResult = parseStructureDefinition(sdJson);

// Serialize back to JSON
const json = serializeToFhirJson(resource);
```

**Key Features:**
- Branded primitive types (FhirString, FhirInteger, etc.)
- Choice type handling (`value[x]`)
- Extension parsing
- Detailed error messages with paths

### 2. Context Module

**Purpose:** Manage StructureDefinition registry and loading

```typescript
import {
  FhirContextImpl,
  MemoryLoader,
  FileSystemLoader,
  CompositeLoader,
  loadBundleFromFile,
} from 'fhir-runtime';

// Create context with loaders
const memLoader = new MemoryLoader(new Map([
  ['http://example.org/SD/custom', customSD],
]));

const fsLoader = new FileSystemLoader('./profiles');
const composite = new CompositeLoader([memLoader, fsLoader]);

const ctx = new FhirContextImpl({ loaders: [composite] });
await ctx.preloadCoreDefinitions();

// Load bundles
const bundle = await loadBundleFromFile('./us-core-bundle.json');
await ctx.loadBundle(bundle);

// Resolve definitions
const patientSD = await ctx.resolveStructureDefinition(
  'http://hl7.org/fhir/StructureDefinition/Patient'
);
```

**Key Features:**
- Multiple loader strategies
- Inheritance resolution
- Bundle loading
- Core definition preloading

### 3. Profile Module

**Purpose:** Generate snapshots and build canonical profiles

```typescript
import {
  SnapshotGenerator,
  buildCanonicalProfile,
} from 'fhir-runtime';

// Generate snapshot
const generator = new SnapshotGenerator(ctx, {
  generateCanonical: true,
  validateConstraints: true,
});

const result = await generator.generate(myProfile);

if (result.success) {
  const sd = result.structureDefinition;
  const canonical = result.canonicalProfile;
  
  console.log(`Generated ${sd.snapshot.element.length} elements`);
}

// Build canonical from existing snapshot
const profile = buildCanonicalProfile(structureDefinition);
```

**Key Features:**
- HAPI-equivalent snapshot generation
- Differential expansion
- Constraint merging
- Slicing support

### 4. Validator Module

**Purpose:** Validate resources against profiles

```typescript
import {
  StructureValidator,
  ValidationOptions,
} from 'fhir-runtime';

const validator = new StructureValidator();

const options: ValidationOptions = {
  checkRequired: true,
  checkCardinality: true,
  checkTypes: true,
  checkInvariants: true,
  terminologyProvider: myTermProvider,
};

const result = validator.validate(resource, profile, options);

result.issues.forEach(issue => {
  console.log(`${issue.code}: ${issue.message} at ${issue.path}`);
});
```

**Key Features:**
- 9 structural validation rules
- FHIRPath invariant execution
- Terminology binding validation
- Detailed issue reporting

### 5. FHIRPath Module

**Purpose:** Evaluate FHIRPath expressions

```typescript
import {
  evalFhirPath,
  evalFhirPathBoolean,
  evalFhirPathString,
} from 'fhir-runtime';

const patient = {
  resourceType: 'Patient',
  name: [{ given: ['John'], family: 'Doe' }],
};

// Evaluate to array
const names = evalFhirPath('Patient.name.given', patient);
// → ['John']

// Evaluate to boolean
const hasOfficial = evalFhirPathBoolean(
  "name.where(use='official').exists()",
  patient
);
// → false

// Evaluate to string
const familyName = evalFhirPathString('name.first().family', patient);
// → 'Doe'
```

**Key Features:**
- 60+ built-in functions
- AST caching (LRU, 128 entries)
- Type-safe evaluation
- Pratt parser

### 6. Provider Module

**Purpose:** Abstraction layer for terminology and references

```typescript
import {
  TerminologyProvider,
  NoOpTerminologyProvider,
  buildOperationOutcome,
} from 'fhir-runtime';

// Use NoOp provider for development
const provider = new NoOpTerminologyProvider();

// Convert validation results to OperationOutcome
const outcome = buildOperationOutcome(validationResult.issues);
```

### 7. Terminology Module

**Purpose:** In-memory terminology validation

```typescript
import {
  InMemoryTerminologyProvider,
  validateBinding,
} from 'fhir-runtime';

const terminology = new InMemoryTerminologyProvider();

// Load from bundle
await terminology.loadFromBundle(terminologyBundle);

// Validate code
const result = await terminology.validateCode({
  system: 'http://hl7.org/fhir/administrative-gender',
  code: 'male',
  display: 'Male',
});

// Validate binding
const bindingResult = validateBinding(
  codedValue,
  bindingConstraint,
  terminology
);
```

### 8. Package Module

**Purpose:** Load and manage FHIR IG packages

```typescript
import {
  NpmPackageLoader,
  PackageManager,
} from 'fhir-runtime';

// Load package
const loader = new NpmPackageLoader('./fhir-packages/hl7.fhir.us.core');
const manifest = await loader.loadManifest();
const index = await loader.loadIndex();

// Package manager
const manager = new PackageManager(ctx);
await manager.registerPackage(loader);

// Resolve canonical across packages
const resolved = manager.resolveCanonical(
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient|6.1.0'
);
```

### 9. Integration Module

**Purpose:** Server/persistence integration utilities

```typescript
import {
  parseSearchParameter,
  extractSearchValues,
  extractReferences,
  buildCapabilityFragment,
  ResourceTypeRegistry,
} from 'fhir-runtime';

// Parse SearchParameter
const sp = parseSearchParameter(searchParamResource);

// Extract search values
const values = extractSearchValues(patient, sp, ctx);

// Extract references
const refs = extractReferences(patient);

// Build CapabilityStatement
const capability = buildCapabilityFragment({
  resourceType: 'Patient',
  profiles: [useCorePatientUrl],
  searchParams: patientSearchParams,
});
```

### 10. Pipeline Module

**Purpose:** Composable validation pipeline

```typescript
import {
  ValidationPipeline,
  StructuralValidationStep,
  TerminologyValidationStep,
  InvariantValidationStep,
  generateReport,
} from 'fhir-runtime';

const pipeline = new ValidationPipeline({
  terminologyProvider: terminology,
  failFast: false,
  minSeverity: 'warning',
});

pipeline.addStep(new StructuralValidationStep());
pipeline.addStep(new TerminologyValidationStep());
pipeline.addStep(new InvariantValidationStep());

// Add hooks
pipeline.on('step:start', (data) => {
  console.log(`Starting step: ${data.stepName}`);
});

const result = await pipeline.validate(resource, profile);
const report = generateReport(result);
```

### 11. Definition Module

**Purpose:** Integration with fhir-definition

```typescript
import { createRuntime, DefinitionBridge } from 'fhir-runtime';
import { InMemoryDefinitionRegistry } from 'fhir-definition';

// Pattern 1: With fhir-definition (recommended)
const registry = new InMemoryDefinitionRegistry();
const runtime = await createRuntime({ definitions: registry });

// Pattern 2: Bridge from FhirContext
const bridge = new DefinitionBridge(ctx, {
  valueSets: new Map(),
  codeSystems: new Map(),
  searchParameters: new Map(),
});

// Pattern 3: Bare minimum
const runtime3 = await createRuntime();
```

---

## Advanced Usage

### Custom Loaders

```typescript
import { StructureDefinitionLoader } from 'fhir-runtime';

class DatabaseLoader implements StructureDefinitionLoader {
  constructor(private db: Database) {}

  async load(url: string): Promise<StructureDefinition | null> {
    return await this.db.query(
      'SELECT * FROM structure_definitions WHERE url = ?',
      [url]
    );
  }

  async loadAll(): Promise<StructureDefinition[]> {
    return await this.db.query('SELECT * FROM structure_definitions');
  }
}

const ctx = new FhirContextImpl({
  loaders: [new DatabaseLoader(db)],
});
```

### Custom Validation Steps

```typescript
import { ValidationStep, PipelineContext } from 'fhir-runtime';

class CustomBusinessRuleStep implements ValidationStep {
  name = 'custom-business-rules';
  priority = 100;

  async validate(
    resource: any,
    profile: CanonicalProfile,
    context: PipelineContext
  ) {
    const issues = [];

    if (resource.resourceType === 'Patient') {
      if (!resource.identifier || resource.identifier.length === 0) {
        issues.push({
          severity: 'error',
          code: 'business-rule',
          message: 'Patient must have at least one identifier',
          path: 'Patient.identifier',
        });
      }
    }

    return { issues };
  }
}

pipeline.addStep(new CustomBusinessRuleStep());
```

### Snapshot Caching

```typescript
import { SnapshotCache } from 'fhir-runtime';

const cache = new SnapshotCache(ctx, {
  maxSize: 100,
  ttl: 3600000, // 1 hour
});

// Lazy load with caching
const profile = await cache.getOrGenerate(profileUrl);

// Warmup cache
await cache.warmupSnapshots([
  'http://hl7.org/fhir/StructureDefinition/Patient',
  'http://hl7.org/fhir/StructureDefinition/Observation',
]);
```

### Batch Validation with Remote Terminology

```typescript
import { RemoteTerminologyProvider } from 'fhir-runtime';

class HttpTerminologyProvider implements RemoteTerminologyProvider {
  constructor(private baseUrl: string) {}

  async validateCode(params) {
    const response = await fetch(`${this.baseUrl}/ValueSet/$validate-code`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  }

  async expand(params) {
    const response = await fetch(`${this.baseUrl}/ValueSet/$expand`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  }

  async lookup(params) {
    const response = await fetch(`${this.baseUrl}/CodeSystem/$lookup`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return response.json();
  }
}

const runtime = await createRuntime({
  terminologyProvider: new HttpTerminologyProvider('https://tx.fhir.org'),
});
```

---

## Performance Optimization

### 1. Preload Core Definitions

```typescript
// ✅ Good: Preload once at startup
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();

// ❌ Bad: Load on every request
app.post('/validate', async (req, res) => {
  const ctx = new FhirContextImpl({ loaders: [] });
  await ctx.preloadCoreDefinitions(); // Slow!
});
```

### 2. Reuse Runtime Instance

```typescript
// ✅ Good: Create once, reuse
const runtime = await createRuntime();

app.post('/validate', async (req, res) => {
  const result = await runtime.validate(req.body, profileUrl);
});

// ❌ Bad: Create on every request
app.post('/validate', async (req, res) => {
  const runtime = await createRuntime(); // Slow!
});
```

### 3. Use Snapshot Cache

```typescript
// ✅ Good: Cache generated snapshots
const cache = new SnapshotCache(ctx, { maxSize: 100 });
const profile = await cache.getOrGenerate(profileUrl);

// ❌ Bad: Generate every time
const generator = new SnapshotGenerator(ctx);
const result = await generator.generate(profileSD); // Slow!
```

### 4. Batch Operations

```typescript
// ✅ Good: Validate in batch
const results = await runtime.validateMany(resources);

// ❌ Bad: Validate one by one
for (const resource of resources) {
  await runtime.validate(resource, profileUrl); // Slow!
}
```

### 5. Limit FHIRPath Complexity

```typescript
// ✅ Good: Simple expressions
evalFhirPath('Patient.name.family', patient);

// ⚠️ Caution: Complex expressions
evalFhirPath(
  'Patient.name.where(use="official").select(given.join(" ") + " " + family)',
  patient
);
```

---

## Migration Guide

### From v0.8.0 to v0.9.0

**Breaking Changes:**
- `fhir-definition` is now a direct dependency (not peer dependency)
- `RemoteTerminologyProvider` interface added
- `validateMany()` batch API added
- `SnapshotCache` with lazy loading

**Migration Steps:**

```typescript
// Before (v0.8.0)
import { createRuntime } from 'fhir-runtime';
const runtime = await createRuntime();

// After (v0.9.0) - Same API, but with new features
import { createRuntime } from 'fhir-runtime';
const runtime = await createRuntime();

// New: Batch validation
const results = await runtime.validateMany([
  { resource: patient1, profileUrl: patientProfileUrl },
  { resource: patient2, profileUrl: patientProfileUrl },
]);

// New: Remote terminology
import { RemoteTerminologyProvider } from 'fhir-runtime';
class MyRemoteProvider implements RemoteTerminologyProvider {
  // Implement interface
}
```

### From v0.7.0 to v0.8.0

**Breaking Changes:**
- `fhir-definition` integration added
- `createRuntime()` factory function added
- `DefinitionProvider` interface introduced

**Migration Steps:**

```typescript
// Before (v0.7.0)
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();

// After (v0.8.0) - Recommended
import { createRuntime } from 'fhir-runtime';
const runtime = await createRuntime();

// Or continue using FhirContext
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();
```

### From v0.6.0 to v0.7.0

**Breaking Changes:**
- Integration module added
- SearchParameter, reference extraction APIs added

**Migration Steps:**

```typescript
// New features in v0.7.0
import {
  parseSearchParameter,
  extractSearchValues,
  extractReferences,
} from 'fhir-runtime';

const sp = parseSearchParameter(searchParamResource);
const values = extractSearchValues(patient, sp, ctx);
const refs = extractReferences(patient);
```

---

## Next Steps

- **[API Reference](./API-REFERENCE.md)** — Complete API documentation
- **[Architecture Overview](./ARCHITECTURE-OVERVIEW.md)** — System design and internals
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues and solutions
- **[Blocking Issues](./BLOCKING-ISSUES.md)** — Report blocking issues

---

**Questions or Issues?**

- GitHub Issues: https://github.com/medxaidev/fhir-runtime/issues
- Documentation: https://github.com/medxaidev/fhir-runtime#readme
