# FHIR Runtime Documentation

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17

---

## Documentation Index

This directory contains comprehensive documentation for integrating with and using `fhir-runtime` in your applications.

### 📘 Integration Documentation

#### [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)
**Complete integration guide for external teams**

- Installation and setup
- Quick start examples
- Integration patterns (FHIR server, CLI, web app, data pipeline)
- Module-by-module usage guide
- Advanced usage patterns
- Performance optimization
- Migration guides between versions

**Target Audience:** Developers integrating fhir-runtime into their applications

**Version Requirements:** Node.js ≥18.0.0, TypeScript ≥5.0

---

#### [API-REFERENCE.md](./API-REFERENCE.md)
**Complete API documentation for all modules**

- Parser Module — JSON parsing and serialization
- Model Module — FHIR R4 type definitions
- Context Module — StructureDefinition registry
- Profile Module — Snapshot generation
- Validator Module — Structural validation
- FHIRPath Module — Expression evaluation
- Provider Module — Abstraction layer
- Terminology Module — In-memory terminology
- Package Module — IG package loading
- Integration Module — Server/persistence utilities
- Pipeline Module — Composable validation
- Definition Module — fhir-definition integration

**Target Audience:** Developers needing detailed API reference

**Includes:** Function signatures, type definitions, examples, version compatibility

---

#### [ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md)
**System architecture and design principles**

- System overview and layer architecture
- Design principles (zero dependencies, deterministic, type-safe)
- Module architecture and dependency graph
- Data flow diagrams
- Key components (FhirContext, SnapshotGenerator, Validator, FHIRPath)
- Extension points (custom loaders, providers, validation steps)
- Performance characteristics
- Deployment patterns

**Target Audience:** System architects, senior developers

**Includes:** Architecture diagrams, complexity analysis, deployment patterns

---

#### [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
**Common issues and solutions**

- Installation issues
- Parsing errors
- Validation issues
- Snapshot generation problems
- FHIRPath evaluation errors
- Context and loading issues
- Package loading problems
- Performance issues
- Type system issues
- Integration problems

**Target Audience:** Developers encountering issues

**Includes:** Symptoms, causes, solutions, debug steps

---

#### [BLOCKING-ISSUES.md](./BLOCKING-ISSUES.md)
**Issue reporting template for blocking problems**

- Issue report template
- Issue categories (parsing, validation, snapshot, FHIRPath, performance, integration, types)
- Priority levels (Critical, High, Medium, Low)
- Support channels
- Tips for effective issue reports
- Complete example issue report

**Target Audience:** Developers encountering blocking issues

**Use when:** Issue blocks production deployment or has no workaround

---

## Additional Documentation

### Technical Documentation

Located in subdirectories:

#### `api/` — API Reference Documents
- Historical API references for each version
- Detailed module exports and signatures
- Breaking changes between versions

#### `overview/` — Technical Overviews
- System design documents
- Architecture deep-dives
- Implementation details

#### `releases/` — Release Notes
- Version-specific release notes
- Feature announcements
- Breaking changes
- Migration guides

#### `specs/` — Specifications
- Capability contracts
- Behavioral guarantees
- Compliance documentation

---

## Quick Navigation

### For New Users

1. Start with **[INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)** — Installation and quick start
2. Review **[API-REFERENCE.md](./API-REFERENCE.md)** — Find the functions you need
3. Check **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — If you encounter issues

### For Integration Teams

1. **[INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)** — Integration patterns for your use case
2. **[ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md)** — Understand system design
3. **[API-REFERENCE.md](./API-REFERENCE.md)** — Detailed API documentation

### For Troubleshooting

1. **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — Common issues and solutions
2. **[BLOCKING-ISSUES.md](./BLOCKING-ISSUES.md)** — Report blocking issues

### For System Architects

1. **[ARCHITECTURE-OVERVIEW.md](./ARCHITECTURE-OVERVIEW.md)** — System design and principles
2. **[API-REFERENCE.md](./API-REFERENCE.md)** — Module structure and APIs
3. **[INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)** — Deployment patterns

---

## Document Versions

All documents in this directory are versioned to match the fhir-runtime release:

| Document | Version | FHIR Version | Last Updated |
|----------|---------|--------------|--------------|
| INTEGRATION-GUIDE.md | v0.9.0 | R4 (4.0.1) | 2026-03-17 |
| API-REFERENCE.md | v0.9.0 | R4 (4.0.1) | 2026-03-17 |
| ARCHITECTURE-OVERVIEW.md | v0.9.0 | R4 (4.0.1) | 2026-03-17 |
| TROUBLESHOOTING.md | v0.9.0 | R4 (4.0.1) | 2026-03-17 |
| BLOCKING-ISSUES.md | v0.9.0 | R4 (4.0.1) | 2026-03-17 |

**Version Requirements:**
- Node.js ≥18.0.0
- npm ≥9.0.0
- TypeScript ≥5.0 (for TypeScript projects)
- fhir-definition 0.6.0 (direct dependency)

---

## Document Maintenance

### Update Schedule

- **Patch releases (0.9.x):** Update TROUBLESHOOTING.md with new issues
- **Minor releases (0.x.0):** Update all documents with new features
- **Major releases (x.0.0):** Full documentation review and rewrite

### Version History

- **v0.9.0** (2026-03-17) — Initial integration documentation suite created
  - INTEGRATION-GUIDE.md — Complete integration guide
  - API-REFERENCE.md — Full API reference for all 12 modules
  - ARCHITECTURE-OVERVIEW.md — System architecture and design
  - TROUBLESHOOTING.md — Common issues and solutions
  - BLOCKING-ISSUES.md — Issue reporting template

---

## Contributing to Documentation

### Reporting Documentation Issues

If you find errors or gaps in the documentation:

1. Check if the issue is already reported: https://github.com/medxaidev/fhir-runtime/issues
2. Create a new issue with label `documentation`
3. Describe the problem and suggest improvements

### Suggesting Documentation Improvements

- Use GitHub Discussions for suggestions: https://github.com/medxaidev/fhir-runtime/discussions
- Submit pull requests for corrections
- Share your integration patterns and examples

---

## External Resources

### Official Links

- **GitHub Repository:** https://github.com/medxaidev/fhir-runtime
- **npm Package:** https://www.npmjs.com/package/fhir-runtime
- **Issue Tracker:** https://github.com/medxaidev/fhir-runtime/issues
- **Discussions:** https://github.com/medxaidev/fhir-runtime/discussions

### FHIR Resources

- **FHIR R4 Specification:** https://hl7.org/fhir/R4/
- **US Core Implementation Guide:** https://www.hl7.org/fhir/us/core/
- **FHIR Registry:** https://registry.fhir.org/
- **HL7 FHIR Community:** https://chat.fhir.org/

### Related Projects

- **fhir-runtime-tools:** https://fhir-runtime-tools.vercel.app/ — Browser-based developer tools
- **fhir-runtime-cli:** https://github.com/medxaidev/fhir-runtime-cli — Command-line interface
- **fhir-definition:** https://github.com/medxaidev/fhir-definition — FHIR knowledge engine
- **HAPI FHIR:** https://hapifhir.io/ — Reference Java implementation

---

## Support

### Documentation Questions

- **GitHub Discussions:** https://github.com/medxaidev/fhir-runtime/discussions
- **GitHub Issues:** https://github.com/medxaidev/fhir-runtime/issues (for documentation bugs)

### Integration Support

- **Integration Guide:** [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Blocking Issues:** [BLOCKING-ISSUES.md](./BLOCKING-ISSUES.md)

### Community

- **Discussions:** Share your use cases and ask questions
- **Issues:** Report bugs and request features
- **Pull Requests:** Contribute improvements

---

## License

All documentation is licensed under MIT License, same as fhir-runtime.

Copyright (c) 2026 Fangjun

---

**Version:** v0.9.0 | **Last Updated:** 2026-03-17
