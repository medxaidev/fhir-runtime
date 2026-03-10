import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadBundleFromFile, StructureValidator, parseFhirJson } from '../index.js';
import type { CanonicalProfile, Resource } from '../index.js';
import { resolve } from 'path';

describe('Validate all resources in resources_test directory', () => {
  let profilesByType: Map<string, CanonicalProfile>;

  beforeAll(() => {
    const SPEC_DIR = resolve(__dirname, '..', '..', 'spec', 'fhir', 'r4');
    const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');

    const result = loadBundleFromFile(PROFILES_RESOURCES, {
      filterKind: 'resource',
      excludeAbstract: true,
    });

    profilesByType = new Map<string, CanonicalProfile>();
    for (const p of result.profiles) {
      profilesByType.set(p.type, p);
    }
  }, 60_000);

  const resourcesDir = join(__dirname, 'resources_test');
  const files = readdirSync(resourcesDir).filter(f => f.endsWith('.json'));

  describe(`Testing ${files.length} resource files`, () => {
    const results: Array<{
      file: string;
      resourceType: string;
      valid: boolean;
      errorCount: number;
      warningCount: number;
      errors: string[];
    }> = [];

    files.forEach((file) => {
      it(`should validate ${file}`, () => {
        const filePath = join(resourcesDir, file);
        const content = readFileSync(filePath, 'utf-8');

        const parseResult = parseFhirJson(content);
        expect(parseResult.success).toBe(true);

        if (!parseResult.success) {
          results.push({
            file,
            resourceType: 'PARSE_ERROR',
            valid: false,
            errorCount: parseResult.issues.length,
            warningCount: 0,
            errors: parseResult.issues.map((i: any) => `${i.code}: ${i.message}`),
          });
          return;
        }

        const resource = parseResult.data as Resource;
        const resourceType = (resource as any).resourceType || 'Unknown';
        const profile = profilesByType.get(resourceType);

        if (!profile) {
          results.push({
            file,
            resourceType,
            valid: false,
            errorCount: 1,
            warningCount: 0,
            errors: [`Profile not found for resource type: ${resourceType}`],
          });
          return;
        }

        const validator = new StructureValidator({
          skipInvariants: true,
          validateSlicing: false,
        });
        const validationResult = validator.validate(resource, profile);

        const errors = validationResult.issues.filter(i => i.severity === 'error');
        const warnings = validationResult.issues.filter(i => i.severity === 'warning');

        results.push({
          file,
          resourceType,
          valid: errors.length === 0,
          errorCount: errors.length,
          warningCount: warnings.length,
          errors: errors.map(e => `${e.code}: ${e.message} (path: ${e.path})`),
        });

        if (errors.length > 0) {
          console.log(`\n❌ ${file} (${resourceType}) - ${errors.length} errors:`);
          errors.forEach(e => {
            console.log(`   - ${e.code}: ${e.message}`);
            console.log(`     Path: ${e.path}`);
          });
        }
      });
    });

    it('should print summary', () => {
      const totalFiles = results.length;
      const validFiles = results.filter(r => r.valid).length;
      const invalidFiles = results.filter(r => !r.valid).length;
      const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
      const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0);

      console.log('\n' + '='.repeat(80));
      console.log('📊 VALIDATION SUMMARY');
      console.log('='.repeat(80));
      console.log(`Total files:     ${totalFiles}`);
      console.log(`✅ Valid:        ${validFiles} (${((validFiles / totalFiles) * 100).toFixed(1)}%)`);
      console.log(`❌ Invalid:      ${invalidFiles} (${((invalidFiles / totalFiles) * 100).toFixed(1)}%)`);
      console.log(`Total errors:    ${totalErrors}`);
      console.log(`Total warnings:  ${totalWarnings}`);
      console.log('='.repeat(80));

      if (invalidFiles > 0) {
        console.log('\n❌ INVALID FILES:');
        results
          .filter(r => !r.valid)
          .forEach(r => {
            console.log(`\n  ${r.file} (${r.resourceType})`);
            console.log(`    Errors: ${r.errorCount}, Warnings: ${r.warningCount}`);
            r.errors.slice(0, 3).forEach(e => {
              console.log(`    - ${e}`);
            });
            if (r.errors.length > 3) {
              console.log(`    ... and ${r.errors.length - 3} more errors`);
            }
          });
      }

      const resourceTypeCounts = results.reduce((acc, r) => {
        acc[r.resourceType] = (acc[r.resourceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('\n📋 RESOURCE TYPE DISTRIBUTION:');
      Object.entries(resourceTypeCounts)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          const validCount = results.filter(r => r.resourceType === type && r.valid).length;
          console.log(`  ${type}: ${count} files (${validCount} valid, ${count - validCount} invalid)`);
        });
      console.log('='.repeat(80) + '\n');
    });
  });
});
