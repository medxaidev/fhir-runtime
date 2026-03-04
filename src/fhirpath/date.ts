/**
 * FHIRPath date/time parsing utilities.
 *
 * @module fhirpath
 */

/**
 * Parse a FHIRPath date/time string into a normalized string.
 *
 * - Time-only strings (`T10:30:00`) are padded to full length.
 * - Local dates (`2021-01-01`) are returned as-is.
 * - DateTime strings are normalized to UTC via `Date.toISOString()`.
 *
 * @param str - The date/time string from a DateTime token.
 * @returns The normalized date/time string.
 */
export function parseDateString(str: string): string {
  if (str.startsWith('T')) {
    // Time string — normalize to full length
    return str + 'T00:00:00.000Z'.substring(str.length);
  }

  if (str.length <= 10) {
    // Local date (e.g. "2021-01-01") — return as-is
    return str;
  }

  try {
    // Normalize to UTC
    return new Date(str).toISOString();
  } catch (_err) {
    // Fallback for unsupported formats (e.g. "2021-01-01T12")
    return str;
  }
}
