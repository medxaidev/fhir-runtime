# Blocking Issues Report Template

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17

---

## Purpose

Use this template to report **blocking issues** that prevent your integration with fhir-runtime. A blocking issue is one that:

- ✅ Prevents core functionality from working
- ✅ Causes incorrect validation or parsing results
- ✅ Results in crashes or unrecoverable errors
- ✅ Has no documented workaround
- ✅ Blocks production deployment

**Before reporting**, please:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for known issues and solutions
2. Verify you're using the latest version (`npm list fhir-runtime`)
3. Create a minimal reproducible example
4. Test with a clean `node_modules` installation

---

## Issue Report Template

Copy the template below and fill in all sections. Submit to: https://github.com/medxaidev/fhir-runtime/issues

```markdown
## Issue Title
[Brief description of the blocking issue]

## Environment

**fhir-runtime version:** [e.g., 0.9.0]
**fhir-definition version:** [e.g., 0.6.0]
**Node.js version:** [e.g., 18.20.0]
**npm version:** [e.g., 9.8.1]
**TypeScript version:** [e.g., 5.9.3]
**Operating System:** [e.g., macOS 14.0, Windows 11, Ubuntu 22.04]
**Module format:** [ESM / CJS]

## Description

[Clear description of what's happening vs. what you expected]

**What I'm trying to do:**
[Describe your use case and what you're trying to accomplish]

**What's happening:**
[Describe the actual behavior, including error messages]

**What I expected:**
[Describe the expected behavior]

## Impact

**Severity:** [Critical / High / Medium / Low]

**Impact on integration:**
- [ ] Blocks production deployment
- [ ] Blocks development work
- [ ] Causes incorrect results
- [ ] Performance degradation
- [ ] Other: [describe]

**Workaround available:** [Yes / No]
[If yes, describe the workaround]

## Minimal Reproducible Example

### Code

```typescript
// Paste your minimal reproducible code here
// Include all necessary imports and setup

import { parseFhirJson, createRuntime } from 'fhir-runtime';

// Example:
const json = `{
  "resourceType": "Patient",
  "id": "example"
}`;

const result = parseFhirJson(json);
console.log(result);
// Expected: { success: true, data: {...} }
// Actual: { success: false, issues: [...] }
```

### Input Data

```json
{
  "resourceType": "Patient",
  "id": "example",
  "name": [
    {
      "family": "Doe",
      "given": ["John"]
    }
  ]
}
```

### Expected Output

```json
{
  "success": true,
  "data": {
    "resourceType": "Patient",
    "id": "example",
    "name": [...]
  }
}
```

### Actual Output

```json
{
  "success": false,
  "issues": [
    {
      "severity": "error",
      "code": "invalid-primitive",
      "message": "Invalid value for FhirId",
      "path": "Patient.id"
    }
  ]
}
```

## Error Messages

```
[Paste full error messages, stack traces, or console output]

Error: ValidationFailedError: Validation failed
    at StructureValidator.validate (fhir-runtime/dist/validator/structure-validator.js:123:45)
    at async main (index.ts:10:20)
```

## Steps to Reproduce

1. Install fhir-runtime@0.9.0
2. Create a new file `test.ts` with the code above
3. Run `tsx test.ts`
4. Observe the error

## Additional Context

**Related issues:** [Link to related GitHub issues if any]

**FHIR specification reference:** [Link to relevant FHIR spec section if applicable]

**Profile/IG being used:** [e.g., US Core v6.1.0, custom profile]

**Additional notes:**
[Any other relevant information, screenshots, logs, etc.]

## Checklist

- [ ] I've checked [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [ ] I've verified I'm using the latest version
- [ ] I've tested with a clean `node_modules` installation
- [ ] I've provided a minimal reproducible example
- [ ] I've included all relevant error messages
- [ ] I've described the impact on my integration
- [ ] I've checked for duplicate issues

```

---

## Issue Categories

### Category 1: Parsing Issues

**When to use:** JSON parsing fails or produces incorrect results

**Required information:**
- Input JSON (sanitized if needed)
- Expected parse result
- Actual parse result
- ParseIssue details (code, message, path)

**Example:**
```markdown
## Issue Title
parseFhirJson fails on valid FHIR R4 Patient resource

## Description
Parsing a valid Patient resource from the FHIR spec examples fails with "invalid-primitive" error.

## Minimal Reproducible Example
[See template above]
```

---

### Category 2: Validation Issues

**When to use:** Validation produces incorrect results (false positives/negatives)

**Required information:**
- Resource being validated
- Profile URL and version
- Validation options used
- Expected validation result
- Actual validation result
- ValidationIssue details

**Example:**
```markdown
## Issue Title
Validator incorrectly reports cardinality violation for Patient.name

## Description
Validating a Patient with one name against the base Patient profile incorrectly reports a cardinality violation.

## Minimal Reproducible Example
[See template above]
```

---

### Category 3: Snapshot Generation Issues

**When to use:** Snapshot generation fails or produces incorrect snapshots

**Required information:**
- Profile StructureDefinition (differential)
- Base StructureDefinition
- Expected snapshot elements
- Actual snapshot elements
- SnapshotIssue details
- HAPI comparison (if available)

**Example:**
```markdown
## Issue Title
SnapshotGenerator produces incorrect element order for sliced elements

## Description
Generating a snapshot for a profile with slicing produces elements in wrong order compared to HAPI FHIR.

## Minimal Reproducible Example
[See template above]
```

---

### Category 4: FHIRPath Issues

**When to use:** FHIRPath evaluation produces incorrect results

**Required information:**
- FHIRPath expression
- Input resource/element
- Expected result
- Actual result
- FHIR spec reference for function behavior

**Example:**
```markdown
## Issue Title
evalFhirPath returns incorrect result for where() function

## Description
Using where() function with equality check returns empty array when it should return matching elements.

## Minimal Reproducible Example
[See template above]
```

---

### Category 5: Performance Issues

**When to use:** Performance is significantly degraded

**Required information:**
- Operation being performed
- Input size (resource size, bundle size, etc.)
- Measured performance (time, memory)
- Expected performance
- Profiling data (if available)

**Example:**
```markdown
## Issue Title
Validation of large Bundle takes >10 seconds

## Description
Validating a Bundle with 100 Patient resources takes over 10 seconds, blocking production use.

## Minimal Reproducible Example
[See template above]

## Performance Data
- Bundle size: 100 resources
- Validation time: 12.5 seconds
- Memory usage: 2GB peak
- Expected: <1 second based on documentation
```

---

### Category 6: Integration Issues

**When to use:** Issues integrating with external systems or libraries

**Required information:**
- Integration scenario (FHIR server, CLI, web app, etc.)
- External dependencies and versions
- Integration code
- Error messages
- Expected behavior

**Example:**
```markdown
## Issue Title
createRuntime() fails when using fhir-definition@0.6.0

## Description
Calling createRuntime() with InMemoryDefinitionRegistry throws "Cannot find module" error.

## Minimal Reproducible Example
[See template above]
```

---

### Category 7: Type System Issues

**When to use:** TypeScript type errors or branded type issues

**Required information:**
- TypeScript version
- tsconfig.json settings
- Code causing type error
- Full TypeScript error message
- Expected type behavior

**Example:**
```markdown
## Issue Title
Branded primitive types cause type errors with valid FHIR resources

## Description
Creating a Patient object with string id causes TypeScript error "Type 'string' is not assignable to type 'FhirId'".

## Minimal Reproducible Example
[See template above]
```

---

## Priority Levels

### Critical (P0)
- Production system down or unusable
- Data corruption or loss
- Security vulnerability
- No workaround available

**Response time:** 24 hours

---

### High (P1)
- Major functionality broken
- Incorrect validation/parsing results
- Significant performance degradation
- Workaround is complex or unreliable

**Response time:** 3-5 business days

---

### Medium (P2)
- Minor functionality broken
- Edge case issues
- Performance issues with workaround
- Documentation gaps

**Response time:** 1-2 weeks

---

### Low (P3)
- Feature requests
- Nice-to-have improvements
- Minor documentation issues
- Questions

**Response time:** Best effort

---

## What Happens Next

After submitting your issue:

1. **Triage (1-2 business days)**
   - Issue is reviewed and categorized
   - Priority level assigned
   - Additional information requested if needed

2. **Investigation (varies by priority)**
   - Root cause analysis
   - Reproducibility verification
   - Impact assessment

3. **Resolution**
   - Bug fix in next patch/minor release
   - Workaround documented if immediate fix not possible
   - Breaking changes scheduled for next major release

4. **Communication**
   - Status updates on GitHub issue
   - Fix included in release notes
   - Documentation updated

---

## Support Channels

### GitHub Issues (Primary)
**URL:** https://github.com/medxaidev/fhir-runtime/issues

**Use for:**
- Bug reports
- Feature requests
- Documentation issues
- Integration problems

**Response time:** Based on priority level

---

### Documentation
**URL:** https://github.com/medxaidev/fhir-runtime#readme

**Resources:**
- [Integration Guide](./INTEGRATION-GUIDE.md)
- [API Reference](./API-REFERENCE.md)
- [Architecture Overview](./ARCHITECTURE-OVERVIEW.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

---

### Community
**Discussions:** https://github.com/medxaidev/fhir-runtime/discussions

**Use for:**
- General questions
- Best practices
- Use case discussions
- Community support

---

## Tips for Effective Issue Reports

### ✅ Do

- **Be specific:** "parseFhirJson fails on Patient with multiple names" is better than "parsing doesn't work"
- **Provide context:** Include what you're trying to accomplish
- **Minimize examples:** Remove unrelated code and data
- **Include versions:** Always specify exact versions
- **Show actual output:** Copy-paste actual error messages
- **Test thoroughly:** Verify issue with clean install

### ❌ Don't

- **Don't assume:** Provide all information even if it seems obvious
- **Don't paste large files:** Use minimal examples
- **Don't mix issues:** One issue per report
- **Don't skip steps:** Fill out all template sections
- **Don't use screenshots for code:** Use code blocks instead
- **Don't report security issues publicly:** Email maintainers directly

---

## Example: Complete Issue Report

```markdown
## Issue Title
StructureValidator incorrectly validates US Core Patient.identifier cardinality

## Environment

**fhir-runtime version:** 0.9.0
**fhir-definition version:** 0.6.0
**Node.js version:** 18.20.0
**npm version:** 9.8.1
**TypeScript version:** 5.9.3
**Operating System:** macOS 14.0
**Module format:** ESM

## Description

**What I'm trying to do:**
Validate a US Core Patient resource with one identifier against the US Core Patient profile.

**What's happening:**
Validation fails with "cardinality-violation" error claiming identifier min is 2, but US Core Patient profile specifies min is 1.

**What I expected:**
Validation should pass since the resource has 1 identifier and the profile requires min 1.

## Impact

**Severity:** High

**Impact on integration:**
- [x] Blocks production deployment
- [ ] Blocks development work
- [x] Causes incorrect results
- [ ] Performance degradation

**Workaround available:** No

## Minimal Reproducible Example

### Code

```typescript
import { createRuntime } from 'fhir-runtime';

const runtime = await createRuntime();

const patient = {
  resourceType: 'Patient',
  id: 'example',
  identifier: [
    {
      system: 'http://example.org/mrn',
      value: '12345'
    }
  ],
  name: [{ family: 'Doe', given: ['John'] }],
  gender: 'male'
};

const result = await runtime.validate(
  patient,
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'
);

console.log('Valid:', result.valid);
console.log('Issues:', result.issues);
```

### Input Data

```json
{
  "resourceType": "Patient",
  "id": "example",
  "identifier": [
    {
      "system": "http://example.org/mrn",
      "value": "12345"
    }
  ],
  "name": [{ "family": "Doe", "given": ["John"] }],
  "gender": "male"
}
```

### Expected Output

```json
{
  "valid": true,
  "issues": []
}
```

### Actual Output

```json
{
  "valid": false,
  "issues": [
    {
      "severity": "error",
      "code": "cardinality-violation",
      "message": "Element Patient.identifier has cardinality 1 but profile requires min 2",
      "path": "Patient.identifier"
    }
  ]
}
```

## Error Messages

No error thrown, but validation result is incorrect.

## Steps to Reproduce

1. Install fhir-runtime@0.9.0
2. Create test.ts with code above
3. Run `tsx test.ts`
4. Observe incorrect validation result

## Additional Context

**Related issues:** None found

**FHIR specification reference:** 
- US Core Patient: http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient
- US Core Patient.identifier cardinality: 1..*

**Profile/IG being used:** US Core v6.1.0

**Additional notes:**
Checked the US Core Patient profile snapshot and confirmed identifier.min = 1. The validator appears to be reading the wrong cardinality value.

## Checklist

- [x] I've checked TROUBLESHOOTING.md
- [x] I've verified I'm using the latest version
- [x] I've tested with a clean node_modules installation
- [x] I've provided a minimal reproducible example
- [x] I've included all relevant error messages
- [x] I've described the impact on my integration
- [x] I've checked for duplicate issues
```

---

**Version:** v0.9.0 | **Last Updated:** 2026-03-17

**Submit issues to:** https://github.com/medxaidev/fhir-runtime/issues
