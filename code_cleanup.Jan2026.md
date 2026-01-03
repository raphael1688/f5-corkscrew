# Code Cleanup - January 2026

> **Project:** f5-corkscrew - TypeScript tool for parsing F5 BIG-IP TMOS configurations
> **Context:** See [CLAUDE.md](CLAUDE.md) for full project details, [PARSER_ANALYSIS.md](PARSER_ANALYSIS.md) for parser architecture
> **Current state:** 107 tests passing, v1.6.1 with dependency cleanup

This document tracks dependency cleanup and code consolidation completed during the v1.6.x releases.

---

## Summary

| Item                                                       | Status      | Action                    |
| ---------------------------------------------------------- | ----------- | ------------------------- |
| [Package version bump](#package-version-bump)              | ✅ Done     | 1.6.0 → 1.6.1             |
| [`@types/deepmerge`](#dependency-updates)                  | ✅ Done     | Removed (unused)          |
| [`glob` update](#dependency-updates)                       | ✅ Done     | Updated to v13            |
| [`npm audit`](#security)                                   | ✅ Done     | 0 vulnerabilities         |
| [`balanced-match`](#balanced-match--typesbalanced-match)   | ✅ Done     | Removed (unused)          |
| [`decompress`](#decompress--typesdecompress)               | ✅ Done     | Removed (unused)          |
| [`xregexp`](#xregexp)                                      | ✅ Done     | Removed (dead code)       |
| [`object-path`](#object-path--typesobject-path)            | ✅ Done     | Replaced with inline func |
| [`f5-conx-core`](#f5-conx-core)                            | ✅ Done     | Replaced with local logger|
| [Dead code cleanup](#dead-code-cleanup)                    | ✅ Done     | Removed ~750 lines        |

---

## Completed in v1.6.0

### Package Version Bump

- [x] Updated `package.json` version from 1.5.0 to 1.6.0

### Dependency Updates

- [x] Removed `@types/deepmerge` (unused - using `deepmerge-ts` which has built-in types)
- [x] Updated `glob` from 11.1.0 to 13.0.0 (no breaking changes, all tests pass)

### Security

- [x] `npm audit` - 0 vulnerabilities found

---

## Completed in v1.6.1

### `balanced-match` + `@types/balanced-match`

**Status:** ✅ REMOVED

Was an early dependency for bracket matching. Replaced by custom `balancedRx1` and `balancedRxAll` functions in `src/tmos2json.ts` (April 2023). No imports remained in the codebase.

---

### `decompress` + `@types/decompress`

**Status:** ✅ REMOVED

Early approach to archive extraction. The codebase now uses `tar-stream` for streaming archive unpacking (see `src/unPackerStream.ts`). No imports remained.

---

### `xregexp`

**Status:** ✅ REMOVED (with dead code)

Was only used by `digBrackets()` in `src/deepParse.ts`, which was only used by `parseDeep()` - both dead code. Removed along with dead code cleanup.

---

### `object-path` + `@types/object-path`

**Status:** ✅ REPLACED

Single use in `src/digDoClassesAuto.ts` replaced with inline helper:

```typescript
function deepGet(obj: any, path: string[]): any {
    return path.reduce((acc, key) => acc?.[key], obj);
}
```

---

### Dead Code Cleanup

**Status:** ✅ COMPLETED

Removed ~750 lines of dead code from `src/deepParse.ts`:

- `parseDeep()` - massive parsing function, never called
- `digBrackets()` - bracket matching using XRegExp, only used by parseDeep
- `partitionFolder()` - helper only used by parseDeep
- Various imports (XRegExp, RegExTree, deepmergeInto, logger)

**Consolidated:**

- `keyValuePairs()` moved to `src/tmos2json.ts`
- `src/deepParse.ts` deleted entirely
- `src/tmos2json.ts` now contains all TMOS parsing utilities: `balancedRx1()`, `balancedRxAll()`, `keyValuePairs()`

---

### `f5-conx-core`

**Status:** ✅ REPLACED

Was only used for `Logger` in `src/cli.ts`. The existing local `src/logger.ts` was enhanced to support CLI needs (console toggle, journal access) and CLI was updated to use it.

Also replaced `isArray` usage in test file with native `Array.isArray()`.

---

## Final State

**Dependencies removed:** 8 packages

- `balanced-match`, `@types/balanced-match`
- `decompress`, `@types/decompress`
- `xregexp`
- `object-path`, `@types/object-path`
- `f5-conx-core`

**Code removed:** ~750 lines of dead parsing code

**Tests:** 107 passing

**Vulnerabilities:** 0
