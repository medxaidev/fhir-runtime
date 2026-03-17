# FHIR Runtime Troubleshooting Guide

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Parsing Errors](#parsing-errors)
3. [Validation Issues](#validation-issues)
4. [Snapshot Generation Problems](#snapshot-generation-problems)
5. [FHIRPath Evaluation Errors](#fhirpath-evaluation-errors)
6. [Context and Loading Issues](#context-and-loading-issues)
7. [Package Loading Problems](#package-loading-problems)
8. [Performance Issues](#performance-issues)
9. [Type System Issues](#type-system-issues)
10. [Integration Problems](#integration-problems)

---

## Installation Issues

### Issue: `npm install` fails with dependency errors

**Symptoms:**
```
npm ERR! Could not resolve dependency:
npm ERR! peer fhir-definition@"^0.6.0" from fhir-runtime@0.9.0
```

**Cause:** Incompatible Node.js or npm version

**Solution:**
```bash
# Check versions
node --version  # Should be ≥18.0.0
npm --version   # Should be ≥9.0.0

# Update Node.js if needed
nvm install 18
nvm use 18

# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Version Requirements:**
- Node.js ≥18.0.0
- npm ≥9.0.0
- TypeScript ≥5.0 (for TypeScript projects)

---

### Issue: Module not found errors in ESM projects

**Symptoms:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'fhir-runtime'
```

**Cause:** Missing `.js` extension in import or incorrect module resolution

**Solution:**
```typescript
// ✅ Correct (ESM)
import { parseFhirJson } from 'fhir-runtime';

// ❌ Wrong
import { parseFhirJson } from 'fhir-runtime/index';
```

**package.json:**
```json
{
  "type": "module",
  "dependencies": {
    "fhir-runtime": "^0.9.0"
  }
}
```

---

### Issue: TypeScript type errors after installation

**Symptoms:**
```
Cannot find module 'fhir-runtime' or its corresponding type declarations.
```

**Cause:** TypeScript not finding type definitions

**Solution:**
```bash
# Ensure TypeScript is installed
npm install --save-dev typescript

# Check tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": false
  }
}

# Restart TypeScript server in IDE
# VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

---

## Parsing Errors

### Issue: `invalid-json` error on valid JSON

**Symptoms:**
```typescript
const result = parseFhirJson(jsonString);
// { success: false, issues: [{ code: 'invalid-json', ... }] }
```

**Cause:** JSON contains syntax errors or is not a string

**Solution:**
```typescript
// ✅ Correct
const result = parseFhirJson('{"resourceType": "Patient"}');

// ❌ Wrong - passing object instead of string
const result = parseFhirJson({ resourceType: 'Patient' });

// Use parseFhirObject for objects
const result = parseFhirObject({ resourceType: 'Patient' });
```

**Debug:**
```typescript
try {
  JSON.parse(jsonString);
} catch (e) {
  console.error('Invalid JSON:', e.message);
}
```

---

### Issue: `missing-resource-type` error

**Symptoms:**
```typescript
const result = parseFhirJson('{"id": "123"}');
// { success: false, issues: [{ code: 'missing-resource-type', ... }] }
```

**Cause:** JSON object missing `resourceType` field

**Solution:**
```typescript
// ✅ Correct
const result = parseFhirJson('{"resourceType": "Patient", "id": "123"}');

// ❌ Wrong - no resourceType
const result = parseFhirJson('{"id": "123"}');
```

---

### Issue: `invalid-primitive` error on dates/times

**Symptoms:**
```typescript
const result = parseFhirJson('{"resourceType": "Patient", "birthDate": "01/15/1990"}');
// { success: false, issues: [{ code: 'invalid-primitive', path: 'Patient.birthDate', ... }] }
```

**Cause:** Date format doesn't match FHIR spec (YYYY-MM-DD)

**Solution:**
```typescript
// ✅ Correct - FHIR date format
const result = parseFhirJson('{"resourceType": "Patient", "birthDate": "1990-01-15"}');

// ❌ Wrong - US date format
const result = parseFhirJson('{"resourceType": "Patient", "birthDate": "01/15/1990"}');
```

**FHIR Date/Time Formats:**
- `date`: `YYYY-MM-DD`
- `dateTime`: `YYYY-MM-DDThh:mm:ss+zz:zz`
- `instant`: `YYYY-MM-DDThh:mm:ss.sss+zz:zz`
- `time`: `hh:mm:ss`

---

### Issue: Choice type parsing errors

**Symptoms:**
```typescript
const result = parseFhirJson('{"resourceType": "Observation", "value": "123"}');
// { success: false, issues: [{ code: 'invalid-choice-type', ... }] }
```

**Cause:** Choice type field (`value[x]`) not using correct suffix

**Solution:**
```typescript
// ✅ Correct - use valueQuantity, valueString, etc.
const result = parseFhirJson(`{
  "resourceType": "Observation",
  "valueQuantity": {
    "value": 123,
    "unit": "mg"
  }
}`);

// ❌ Wrong - using 'value' instead of 'value[x]'
const result = parseFhirJson('{"resourceType": "Observation", "value": "123"}');
```

---

## Validation Issues

### Issue: `required-missing` error on optional fields

**Symptoms:**
```typescript
const result = validator.validate(patient, profile);
// { valid: false, issues: [{ code: 'required-missing', path: 'Patient.identifier', ... }] }
```

**Cause:** Profile constrains field to `min: 1` (required)

**Solution:**
```typescript
// Check profile constraints
console.log(profile.elements.find(e => e.path === 'Patient.identifier')?.min);

// Add required field
const patient = {
  resourceType: 'Patient',
  identifier: [{ system: 'http://example.org', value: '123' }],
  // ... other fields
};
```

**Debug:**
```typescript
// Find all required fields in profile
const requiredFields = profile.elements
  .filter(e => e.min && e.min >= 1)
  .map(e => e.path);
console.log('Required fields:', requiredFields);
```

---

### Issue: `cardinality-violation` error

**Symptoms:**
```typescript
const result = validator.validate(patient, profile);
// { valid: false, issues: [{ code: 'cardinality-violation', path: 'Patient.name', ... }] }
```

**Cause:** Too many or too few elements for field

**Solution:**
```typescript
// Check cardinality constraint
const element = profile.elements.find(e => e.path === 'Patient.name');
console.log(`Cardinality: ${element.min}..${element.max}`);

// ✅ Correct - within cardinality
const patient = {
  resourceType: 'Patient',
  name: [{ family: 'Doe', given: ['John'] }], // 1 name (within 0..*)
};

// ❌ Wrong - exceeds max cardinality (if max: 1)
const patient = {
  resourceType: 'Patient',
  name: [
    { family: 'Doe', given: ['John'] },
    { family: 'Smith', given: ['Jane'] },
  ],
};
```

---

### Issue: `type-mismatch` error

**Symptoms:**
```typescript
const result = validator.validate(patient, profile);
// { valid: false, issues: [{ code: 'type-mismatch', path: 'Patient.active', ... }] }
```

**Cause:** Value type doesn't match profile constraint

**Solution:**
```typescript
// ✅ Correct - boolean type
const patient = {
  resourceType: 'Patient',
  active: true,
};

// ❌ Wrong - string instead of boolean
const patient = {
  resourceType: 'Patient',
  active: 'true',
};
```

**Common Type Mismatches:**
- `boolean` vs `string` ("true" vs true)
- `integer` vs `decimal` (123 vs 123.0)
- `string` vs `code` (different validation rules)

---

### Issue: `invariant-failed` error

**Symptoms:**
```typescript
const result = validator.validate(observation, profile);
// { valid: false, issues: [{ code: 'invariant-failed', message: 'obs-6: dataAbsentReason SHALL only be present if Observation.value[x] is not present', ... }] }
```

**Cause:** FHIRPath invariant constraint violated

**Solution:**
```typescript
// Read invariant message carefully
// obs-6: dataAbsentReason SHALL only be present if Observation.value[x] is not present

// ✅ Correct - either value OR dataAbsentReason
const observation = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
  valueQuantity: { value: 123, unit: 'mg' },
  // No dataAbsentReason
};

// ❌ Wrong - both value AND dataAbsentReason
const observation = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
  valueQuantity: { value: 123, unit: 'mg' },
  dataAbsentReason: { coding: [{ code: 'unknown' }] }, // Conflict!
};
```

**Debug:**
```typescript
// Test FHIRPath expression manually
import { evalFhirPathBoolean } from 'fhir-runtime';

const expression = 'dataAbsentReason.empty() or value.empty()';
const result = evalFhirPathBoolean(expression, observation);
console.log('Invariant passes:', result);
```

---

### Issue: `binding-failed` error

**Symptoms:**
```typescript
const result = validator.validate(patient, profile);
// { valid: false, issues: [{ code: 'binding-failed', path: 'Patient.gender', ... }] }
```

**Cause:** Code not in required ValueSet

**Solution:**
```typescript
// Check binding strength and ValueSet
const element = profile.elements.find(e => e.path === 'Patient.gender');
console.log('Binding:', element.binding);

// ✅ Correct - code from ValueSet
const patient = {
  resourceType: 'Patient',
  gender: 'male', // Valid code from administrative-gender ValueSet
};

// ❌ Wrong - invalid code
const patient = {
  resourceType: 'Patient',
  gender: 'M', // Not in ValueSet
};
```

**Binding Strengths:**
- `required` — Must use code from ValueSet (error if not)
- `extensible` — Should use code from ValueSet (warning if not)
- `preferred` — Recommended to use (information if not)
- `example` — Example codes only (no validation)

---

### Issue: Validation passes but resource is invalid

**Symptoms:**
```typescript
const result = validator.validate(patient, profile);
// { valid: true, issues: [] }
// But resource is actually invalid
```

**Cause:** Validation options disabled or wrong profile used

**Solution:**
```typescript
// ✅ Enable all validation checks
const result = validator.validate(patient, profile, {
  checkRequired: true,
  checkCardinality: true,
  checkTypes: true,
  checkInvariants: true,
  checkBindings: true,
  terminologyProvider: myTermProvider,
});

// Verify correct profile
console.log('Profile URL:', profile.url);
console.log('Profile name:', profile.name);
```

---

## Snapshot Generation Problems

### Issue: `BaseNotFoundError` when generating snapshot

**Symptoms:**
```typescript
const result = await generator.generate(profile);
// Error: BaseNotFoundError: Base definition not found: http://example.org/SD/base
```

**Cause:** Base StructureDefinition not loaded in context

**Solution:**
```typescript
// Load base definition first
const baseSD = await ctx.resolveStructureDefinition(profile.baseDefinition);
if (!baseSD) {
  console.error('Base not found:', profile.baseDefinition);
  // Load base definition
  await ctx.loadBundle(baseBundle);
}

// Then generate snapshot
const result = await generator.generate(profile);
```

---

### Issue: `SnapshotCircularDependencyError`

**Symptoms:**
```typescript
const result = await generator.generate(profile);
// Error: SnapshotCircularDependencyError: Circular dependency detected: A → B → A
```

**Cause:** Profile inherits from itself (directly or indirectly)

**Solution:**
```typescript
// Check inheritance chain
let current = profile;
const chain = [current.url];

while (current.baseDefinition) {
  if (chain.includes(current.baseDefinition)) {
    console.error('Circular dependency:', [...chain, current.baseDefinition]);
    break;
  }
  chain.push(current.baseDefinition);
  current = await ctx.resolveStructureDefinition(current.baseDefinition);
}

// Fix profile definition
// Ensure baseDefinition points to valid parent, not self
```

---

### Issue: Snapshot generation is slow

**Symptoms:**
```typescript
const start = Date.now();
const result = await generator.generate(profile);
console.log('Time:', Date.now() - start); // > 1000ms
```

**Cause:** Recursive snapshot generation without caching

**Solution:**
```typescript
// Use SnapshotCache for lazy loading
import { SnapshotCache } from 'fhir-runtime';

const cache = new SnapshotCache(ctx, {
  maxSize: 100,
  ttl: 3600000, // 1 hour
});

// First call: generates and caches
const profile1 = await cache.getOrGenerate(profileUrl);

// Second call: returns cached
const profile2 = await cache.getOrGenerate(profileUrl); // Fast!

// Warmup cache at startup
await cache.warmupSnapshots([
  'http://hl7.org/fhir/StructureDefinition/Patient',
  'http://hl7.org/fhir/StructureDefinition/Observation',
]);
```

---

### Issue: Generated snapshot doesn't match HAPI

**Symptoms:**
```typescript
const result = await generator.generate(profile);
// Snapshot differs from HAPI FHIR output
```

**Cause:** Different snapshot generation algorithm or version

**Solution:**
```typescript
// Enable HAPI-equivalent mode
const generator = new SnapshotGenerator(ctx, {
  generateCanonical: true,
  validateConstraints: true,
});

// Check version compatibility
// fhir-runtime v0.9.0 is HAPI-equivalent for FHIR R4
// Verified with 35/35 HAPI fixtures

// Report issue if mismatch found
// See BLOCKING-ISSUES.md for template
```

---

## FHIRPath Evaluation Errors

### Issue: `undefined` result from FHIRPath evaluation

**Symptoms:**
```typescript
const result = evalFhirPath('Patient.name.family', patient);
console.log(result); // []
```

**Cause:** Path doesn't exist in resource or syntax error

**Solution:**
```typescript
// Check resource structure
console.log(JSON.stringify(patient, null, 2));

// ✅ Correct path
const result = evalFhirPath('Patient.name.family', {
  resourceType: 'Patient',
  name: [{ family: 'Doe' }],
});
// → ['Doe']

// ❌ Wrong - typo in path
const result = evalFhirPath('Patient.names.family', patient);
// → []
```

**Debug:**
```typescript
// Test step by step
const step1 = evalFhirPath('Patient', patient);
console.log('Step 1:', step1); // [patient]

const step2 = evalFhirPath('Patient.name', patient);
console.log('Step 2:', step2); // [{ family: 'Doe' }]

const step3 = evalFhirPath('Patient.name.family', patient);
console.log('Step 3:', step3); // ['Doe']
```

---

### Issue: FHIRPath function not found

**Symptoms:**
```typescript
const result = evalFhirPath('Patient.name.customFunction()', patient);
// Error: Unknown function: customFunction
```

**Cause:** Function not in FHIRPath spec or not implemented

**Solution:**
```typescript
// Check supported functions (60+ built-in)
// Collection: empty(), exists(), all(), count(), distinct(), first(), last(), etc.
// String: indexOf(), substring(), startsWith(), endsWith(), contains(), etc.
// Math: abs(), ceiling(), floor(), round(), sqrt(), etc.
// Type: is(), as(), ofType(), toBoolean(), toInteger(), toString(), etc.

// Use built-in functions
const result = evalFhirPath('Patient.name.first().family', patient);

// For custom logic, use JavaScript
const names = evalFhirPath('Patient.name', patient);
const customResult = names.map(n => /* custom logic */);
```

---

### Issue: FHIRPath performance degradation

**Symptoms:**
```typescript
// First call: fast
const result1 = evalFhirPath(expression, patient); // 1ms

// After many calls: slow
const result2 = evalFhirPath(expression, patient); // 100ms
```

**Cause:** AST cache eviction (LRU, 128 entries)

**Solution:**
```typescript
// Reuse common expressions
const commonExpressions = [
  'Patient.name.family',
  'Patient.name.given',
  'Patient.birthDate',
];

// Pre-warm cache
commonExpressions.forEach(expr => {
  evalFhirPath(expr, { resourceType: 'Patient' });
});

// Or increase cache size (requires source modification)
// Default: 128 entries
```

---

## Context and Loading Issues

### Issue: `ResourceNotFoundError` when resolving StructureDefinition

**Symptoms:**
```typescript
const sd = await ctx.resolveStructureDefinition(url);
// Error: ResourceNotFoundError: StructureDefinition not found: http://example.org/SD/custom
```

**Cause:** StructureDefinition not loaded in context

**Solution:**
```typescript
// Option 1: Load from bundle
await ctx.loadBundle(bundle);

// Option 2: Add loader
const loader = new MemoryLoader(new Map([
  [url, customSD],
]));
const ctx = new FhirContextImpl({ loaders: [loader] });

// Option 3: Load from file system
const fsLoader = new FileSystemLoader('./profiles');
const ctx = new FhirContextImpl({ loaders: [fsLoader] });

// Verify loaded
const stats = ctx.getStatistics();
console.log('Total definitions:', stats.totalDefinitions);
```

---

### Issue: Core definitions not loaded

**Symptoms:**
```typescript
const sd = await ctx.resolveStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient');
console.log(sd); // null
```

**Cause:** `preloadCoreDefinitions()` not called

**Solution:**
```typescript
// ✅ Correct - preload core definitions
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();

const sd = await ctx.resolveStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient');
console.log(sd); // StructureDefinition object

// Or use createRuntime() which auto-loads
const runtime = await createRuntime();
```

---

### Issue: `FhirContextImpl({ loaders: [] })` throws error

**Symptoms:**
```typescript
const ctx = new FhirContextImpl({ loaders: [] });
// Error: CompositeLoader requires at least one loader
```

**Cause:** Empty loaders array not allowed in some versions

**Solution:**
```typescript
// Use MemoryLoader with empty map as stub
import { MemoryLoader } from 'fhir-runtime';

const ctx = new FhirContextImpl({
  loaders: [new MemoryLoader(new Map())],
});

// Or use createRuntime()
const runtime = await createRuntime();
```

---

## Package Loading Problems

### Issue: Package manifest not found

**Symptoms:**
```typescript
const loader = new NpmPackageLoader('./fhir-packages/hl7.fhir.us.core');
const manifest = await loader.loadManifest();
// Error: ENOENT: no such file or directory, open './fhir-packages/hl7.fhir.us.core/package.json'
```

**Cause:** Package directory doesn't exist or path is wrong

**Solution:**
```typescript
// Check directory exists
import { existsSync } from 'fs';
const packagePath = './fhir-packages/hl7.fhir.us.core';
console.log('Exists:', existsSync(packagePath));

// Check package structure
// Expected:
// fhir-packages/
//   hl7.fhir.us.core/
//     package.json
//     .index.json
//     package/
//       StructureDefinition-*.json
//       ValueSet-*.json

// Use absolute path
import { resolve } from 'path';
const absolutePath = resolve(packagePath);
const loader = new NpmPackageLoader(absolutePath);
```

---

### Issue: Package index parsing fails

**Symptoms:**
```typescript
const index = await loader.loadIndex();
// Error: Invalid package index format
```

**Cause:** `.index.json` file missing or malformed

**Solution:**
```typescript
// Check .index.json exists
import { readFileSync } from 'fs';
const indexPath = './fhir-packages/hl7.fhir.us.core/.index.json';
const indexJson = readFileSync(indexPath, 'utf-8');
console.log('Index:', indexJson);

// Validate format
const index = JSON.parse(indexJson);
console.log('Files:', index.files?.length);

// Expected format:
// {
//   "index-version": 1,
//   "files": [
//     {
//       "filename": "package/StructureDefinition-us-core-patient.json",
//       "resourceType": "StructureDefinition",
//       "id": "us-core-patient",
//       "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
//     }
//   ]
// }
```

---

### Issue: Circular package dependency detected

**Symptoms:**
```typescript
const graph = buildDependencyGraph(packages);
const sorted = topologicalSort(graph);
// Error: CircularPackageDependencyError: Circular dependency: A → B → C → A
```

**Cause:** Package dependency cycle

**Solution:**
```typescript
// Identify cycle
const graph = buildDependencyGraph(packages);
console.log('Nodes:', Object.keys(graph.nodes));
console.log('Edges:', graph.edges);

// Fix package dependencies
// Remove circular dependency in package.json
// Or use specific versions to break cycle

// Workaround: Load packages individually
for (const pkg of packages) {
  await manager.registerPackage(pkg.loader);
}
```

---

## Performance Issues

### Issue: High memory usage

**Symptoms:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Cause:** Too many cached definitions or large bundles

**Solution:**
```typescript
// 1. Limit snapshot cache size
const cache = new SnapshotCache(ctx, {
  maxSize: 50, // Reduce from default 100
  ttl: 1800000, // 30 minutes
});

// 2. Clear context periodically
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();
// ... use context
// Create new context for next batch

// 3. Stream large bundles
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

await pipeline(
  createReadStream('large-bundle.ndjson'),
  split(),
  async function* (source) {
    for await (const line of source) {
      const resource = JSON.parse(line);
      yield await processResource(resource);
    }
  }
);

// 4. Increase Node.js heap size
// node --max-old-space-size=4096 app.js
```

---

### Issue: Slow validation on large resources

**Symptoms:**
```typescript
const start = Date.now();
const result = await validator.validate(largeBundle, profile);
console.log('Time:', Date.now() - start); // > 5000ms
```

**Cause:** Complex profile or many invariants

**Solution:**
```typescript
// 1. Disable expensive checks
const result = validator.validate(resource, profile, {
  checkRequired: true,
  checkCardinality: true,
  checkTypes: true,
  checkInvariants: false, // Disable FHIRPath invariants
  checkBindings: false, // Disable terminology validation
});

// 2. Use batch validation
const results = await runtime.validateMany(resources);

// 3. Validate in parallel (for independent resources)
const results = await Promise.all(
  resources.map(r => runtime.validate(r, profileUrl))
);

// 4. Profile optimization
// Simplify FHIRPath invariants
// Reduce number of constraints
```

---

### Issue: Slow package loading

**Symptoms:**
```typescript
const start = Date.now();
await manager.registerPackage(loader);
console.log('Time:', Date.now() - start); // > 10000ms
```

**Cause:** Large package with many resources

**Solution:**
```typescript
// 1. Filter resources during load
const loader = new NpmPackageLoader(packagePath, {
  resourceTypes: ['StructureDefinition', 'ValueSet'], // Only load these types
});

// 2. Lazy load resources
const index = await loader.loadIndex();
const profileEntries = index.files.filter(f => f.resourceType === 'StructureDefinition');

for (const entry of profileEntries) {
  const resource = await loader.loadResource(entry.filename);
  // Process resource
}

// 3. Preload at startup, not per-request
// app.ts
const manager = new PackageManager(ctx);
await manager.registerPackage(usCoreLoader); // Once at startup

app.listen(3000);
```

---

## Type System Issues

### Issue: TypeScript errors with branded types

**Symptoms:**
```typescript
const patient: Patient = {
  resourceType: 'Patient',
  id: '123', // Error: Type 'string' is not assignable to type 'FhirId'
};
```

**Cause:** Branded types require explicit casting

**Solution:**
```typescript
// Option 1: Use parseFhirObject (recommended)
const result = parseFhirObject({
  resourceType: 'Patient',
  id: '123',
});
const patient = result.data; // Properly typed

// Option 2: Type assertion
const patient = {
  resourceType: 'Patient',
  id: '123' as FhirId,
};

// Option 3: Disable strict type checking (not recommended)
// tsconfig.json
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

---

### Issue: Choice type TypeScript errors

**Symptoms:**
```typescript
const observation: Observation = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [] },
  value: 123, // Error: Property 'value' does not exist
};
```

**Cause:** Choice types use specific suffixes (`value[x]` → `valueQuantity`, `valueString`, etc.)

**Solution:**
```typescript
// ✅ Correct - use specific choice type
const observation: Observation = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [] },
  valueQuantity: {
    value: 123,
    unit: 'mg',
  },
};

// Or use type union
type ObservationValue = 
  | { valueQuantity: Quantity }
  | { valueString: FhirString }
  | { valueBoolean: FhirBoolean };
```

---

## Integration Problems

### Issue: createRuntime() fails with fhir-definition

**Symptoms:**
```typescript
import { createRuntime } from 'fhir-runtime';
const runtime = await createRuntime();
// Error: Cannot find module 'fhir-definition'
```

**Cause:** fhir-definition not installed

**Solution:**
```bash
# Check fhir-definition version
npm list fhir-definition

# Install if missing
npm install fhir-definition@^0.6.0

# Verify import
import { InMemoryDefinitionRegistry } from 'fhir-definition';
```

---

### Issue: Remote terminology provider timeout

**Symptoms:**
```typescript
class HttpTerminologyProvider implements RemoteTerminologyProvider {
  async validateCode(params) {
    const response = await fetch(url);
    // Error: Request timeout
  }
}
```

**Cause:** External terminology server slow or unavailable

**Solution:**
```typescript
// Add timeout and retry
class HttpTerminologyProvider implements RemoteTerminologyProvider {
  async validateCode(params) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/fhir+json' },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Terminology validation failed:', error);
      // Fallback to lenient validation
      return { result: true, message: 'Validation skipped (timeout)' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

---

### Issue: Search value extraction returns empty array

**Symptoms:**
```typescript
const values = extractSearchValues(patient, searchParam, ctx);
console.log(values); // []
```

**Cause:** FHIRPath expression doesn't match resource structure

**Solution:**
```typescript
// Debug FHIRPath expression
console.log('SearchParameter:', searchParam.code);
console.log('Expression:', searchParam.expression);

// Test expression manually
import { evalFhirPath } from 'fhir-runtime';
const result = evalFhirPath(searchParam.expression, patient);
console.log('FHIRPath result:', result);

// Check resource structure
console.log('Patient:', JSON.stringify(patient, null, 2));

// Verify SearchParameter is correct for resource type
if (searchParam.base.includes(patient.resourceType)) {
  console.log('SearchParameter applies to', patient.resourceType);
} else {
  console.error('SearchParameter does not apply to', patient.resourceType);
}
```

---

## Getting Help

### When to Report an Issue

Report an issue if:
- ✅ You've tried troubleshooting steps above
- ✅ Issue is reproducible with minimal example
- ✅ Issue blocks your integration work
- ✅ Issue appears to be a bug in fhir-runtime

### How to Report

See **[BLOCKING-ISSUES.md](./BLOCKING-ISSUES.md)** for issue reporting template.

### Resources

- **GitHub Issues:** https://github.com/medxaidev/fhir-runtime/issues
- **Documentation:** https://github.com/medxaidev/fhir-runtime#readme
- **Integration Guide:** [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)
- **API Reference:** [API-REFERENCE.md](./API-REFERENCE.md)
- **Architecture:** [ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md)

---

**Version:** v0.9.0 | **Last Updated:** 2026-03-17
