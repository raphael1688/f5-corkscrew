# Code Cleanup - January 2026

> **Project:** f5-corkscrew - TypeScript tool for parsing F5 BIG-IP TMOS configurations
> **Context:** See [CLAUDE.md](CLAUDE.md) for full project details, [PARSER_ANALYSIS.md](PARSER_ANALYSIS.md) for parser architecture
> **Current state:** 107 tests passing, v1.6.0 with new universal parser

This document tracks dependency cleanup and code consolidation opportunities identified during the v1.6.0 release.

---

## Index

| Item                                                       | Status      | Action              |
| ---------------------------------------------------------- | ----------- | ------------------- |
| [Package version bump](#package-version-bump)              | ✅ Done     | Updated to 1.6.0    |
| [`@types/deepmerge`](#dependency-updates)                  | ✅ Done     | Removed (unused)    |
| [`glob` update](#dependency-updates)                       | ✅ Done     | Updated to v13      |
| [`npm audit`](#security)                                   | ✅ Done     | 0 vulnerabilities   |
| [`balanced-match`](#balanced-match--typesbalanced-match)   | ❌ Pending  | Remove (unused)     |
| [`decompress`](#decompress--typesdecompress)               | ❌ Pending  | Remove (unused)     |
| [`xregexp`](#xregexp)                                      | ⏳ Review   | Single use - decide |
| [`object-path`](#object-path--typesobject-path)            | ⏳ Review   | Single use - decide |
| [`f5-conx-core`](#f5-conx-core)                            | ⏳ Review   | Single use - decide |
| [Dead code cleanup](#dead-code-cleanup)                    | ⏳ Review   | Remove legacy code  |

---

## Completed

### Package Version Bump

- [x] Updated `package.json` version from 1.5.0 to 1.6.0

### Dependency Updates

- [x] Removed `@types/deepmerge` (unused - using `deepmerge-ts` which has built-in types)
- [x] Updated `glob` from 11.1.0 to 13.0.0 (no breaking changes, all tests pass)

### Security

- [x] `npm audit` - 0 vulnerabilities found

---

## Pending Removal - Unused Dependencies

### `balanced-match` + `@types/balanced-match`

**Status:** UNUSED - safe to remove

**History:** Was an early dependency for bracket matching. Replaced by custom `balancedRx1` and `balancedRxAll` functions in `src/tmos2json.ts` (April 2023). The new universal parser in `src/universalParse.ts` uses a completely different character-by-character approach.

**Evidence:**

- No imports in `src/` directory
- Only reference is a commented-out import in `tests/010_json_objects.test.ts`

**Action:**

```bash
npm uninstall balanced-match @types/balanced-match
```

---

### `decompress` + `@types/decompress`

**Status:** UNUSED - safe to remove

**History:** Likely an early approach to archive extraction. The codebase now uses `tar-stream` for streaming archive unpacking (see `src/unPackerStream.ts`).

**Evidence:**

- No imports anywhere in `src/` or `tests/`

**Action:**

```bash
npm uninstall decompress @types/decompress
```

---

## Pending Review - Minimal Use Dependencies

### `xregexp`

**Status:** Single use - consider replacing

**Usage:** One call in `src/deepParse.ts:833`

```typescript
const x1 = XRegExp.matchRecursive(cFlat, '{', '}', 'g', {
    valueNames: ['kkk', null, 'vvv', null],
})
```

**Context:** Used in `parseTrafficGroups()` function for recursive bracket matching. This is legacy parsing code - the new universal parser doesn't use it.

**Options:**

1. Keep for now (legacy code path still used)
2. Replace with custom bracket matching similar to `balancedRxAll`
3. Remove if traffic group parsing moves to universal parser

**Decision:** [ ] Keep / [ ] Replace / [ ] Defer

---

### `object-path` + `@types/object-path`

**Status:** Single use - consider replacing

**Usage:** One call in `src/digDoClassesAuto.ts:27`

```typescript
const val = objectPath.get(configTree, path)
```

**Replacement:** Simple recursive function or bracket notation:

```typescript
function deepGet(obj: any, path: string[]): any {
    return path.reduce((acc, key) => acc?.[key], obj);
}
```

**Decision:** [ ] Keep / [ ] Replace

---

### `f5-conx-core`

**Status:** Single import - consider replacing

**Usage:** Only imports `Logger` in `src/cli.ts:22`

```typescript
import Logger from 'f5-conx-core/dist/logger';
```

**Context:** This is an F5 package, so there may be organizational reasons to keep it. However, if independence is preferred, a simple logger could be created.

**Options:**

1. Keep (organizational alignment with F5 ecosystem)
2. Replace with simple console wrapper
3. Replace with lightweight logging package

**Decision:** [ ] Keep / [ ] Replace

---

## Commands to Execute

After decisions are made, run these commands:

```bash
# Remove unused dependencies
npm uninstall balanced-match @types/balanced-match decompress @types/decompress

# Run tests to verify
npm test

# If replacing object-path:
npm uninstall object-path @types/object-path

# If replacing xregexp:
npm uninstall xregexp
```

---

## Dead Code Cleanup

**Status:** Review needed - potential large cleanup

With the new universal parser (`src/universalParse.ts`) now handling config parsing, significant portions of the legacy parsing code appear to be dead code.

### `parseDeep()` function in `src/deepParse.ts`

**Status:** DEAD CODE - never called

**Evidence:**

- `parseDeep` is exported but never imported anywhere
- Only `keyValuePairs` from `deepParse.ts` is imported (by `digConfigs.ts`)
- `digBrackets` is only used internally by `parseDeep`

**What it uses:**

- `balancedRx1` and `balancedRxAll` from `src/tmos2json.ts`
- `XRegExp.matchRecursive` (the only `xregexp` usage)

### `src/tmos2json.ts`

**Status:** Likely removable if `parseDeep` is removed

**Functions:**

- `balancedRx1()` - only used by `deepParse.ts`
- `balancedRxAll()` - only used by `deepParse.ts`

### Cleanup Actions

If confirmed dead code:

1. Remove `parseDeep()` function from `src/deepParse.ts`
2. Remove `digBrackets()` function from `src/deepParse.ts`
3. Remove `src/tmos2json.ts` entirely
4. Remove `xregexp` dependency (only used by `parseDeep`)
5. Keep `keyValuePairs()` - still used by `digConfigs.ts`

**Decision:** [ ] Confirm dead / [ ] Keep for fallback / [ ] Defer

---

## Notes

- `@types/node` kept at v22 (LTS) - v25 available but would require Node 25
- All 107 tests passing after glob update
- No security vulnerabilities in current dependencies
