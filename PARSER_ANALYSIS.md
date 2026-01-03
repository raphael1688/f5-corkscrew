# Parser Analysis: f5-corkscrew vs tmos-converter

**Date:** 2025-12-31  
**Status:** ✅ Implemented  
**Purpose:** Deep analysis of parsing approaches that informed the enhancement

---

## Executive Summary

Both parsers solve the same problem—converting TMOS text config to JSON—but with fundamentally different philosophies. After analysis, we enhanced corkscrew with tmos-converter's full-depth recursive parsing while maintaining corkscrew's streaming architecture and hierarchical output structure.

| Aspect | f5-corkscrew (before) | tmos-converter | f5-corkscrew (after) |
|--------|----------------------|----------------|----------------------|
| **Philosophy** | Extract what's needed | Parse everything | Parse everything |
| **Output** | Hierarchical nested | Flat key-value | Hierarchical nested |
| **Depth** | Selective (~15 types) | Universal recursive | Universal recursive |
| **Memory** | Streaming | Full in memory | Streaming + string input |
| **String input** | No | Yes | Yes |

---

## 1. What Was Implemented

### 1.1 New Universal Parser (`src/universalParse.ts`)

Ported from tmos-converter with enhancements:

```typescript
// Core functions
parseConfig(configText: string): Record<string, any>
parseConfigs(files: Record<string, string>): Record<string, any>
```

**Key features:**
- Recursive bracket matching (handles any nesting depth)
- iRule-aware parsing (TCL bracket handling)
- Edge case handlers: multiline strings, pseudo-arrays, empty objects, monitor min X of
- GTM topology preprocessing
- Outputs hierarchical structure (not flat keys)
- Preserves original config in `line` property

### 1.2 New BigipConfig Methods

```typescript
// Parse from string (no file needed)
await bigip.loadParseString(configText: string, fileName?: string): Promise<number>

// Discovery APIs
bigip.listPartitions(): string[]
bigip.listApps(partition?: string): string[]
bigip.listAppsSummary(partition?: string): AppSummary[]

// Enhanced extraction with filters
await bigip.apps(): TmosApp[]
await bigip.apps({ partition: 'Tenant1' }): TmosApp[]
await bigip.apps({ partitions: ['T1', 'T2'] }): TmosApp[]
await bigip.apps({ apps: ['/Common/vs1', '/T1/vs2'] }): TmosApp[]
```

### 1.3 New Types (`src/models.ts`)

```typescript
interface AppsFilterOptions {
    partition?: string;
    partitions?: string[];
    apps?: string[];
}

interface AppSummary {
    name: string;
    fullPath: string;
    partition: string;
    folder?: string;
    destination?: string;
    pool?: string;
}
```

---

## 2. Parser Architecture Comparison

### 2.1 Original f5-corkscrew Approach

```
Input (.conf/.ucs/.qkview)
    │
    ▼
┌─────────────────────────────────────┐
│  UnPackerStream (streaming)         │
│  - Emits 'conf' events              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  parentTmosObjects() - Regex        │
│  - Extracts root-level objects      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  parseDeep() - SELECTIVE            │
│  - Only ~15 object types            │
│  - Manual regex per type            │
└─────────────────────────────────────┘
```

### 2.2 tmos-converter Approach (Reference)

```
Input (config text)
    │
    ▼
┌─────────────────────────────────────┐
│  groupObjects() - Line-by-line      │
│  - Bracket counting                 │
│  - iRule special handling           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  orchestrate() - RECURSIVE          │
│  - Handles ALL nested objects       │
│  - Universal edge case handling     │
└─────────────────────────────────────┘
```

### 2.3 Enhanced f5-corkscrew (Implemented)

```
Input (.conf/.ucs/.qkview OR string)
    │
    ├─── loadParseAsync(file) ───┐
    │                            │
    ├─── loadParseString(text) ──┤
    │                            ▼
    │              ┌─────────────────────────────────────┐
    │              │  parseConfig() - Universal Parser   │
    │              │  - Recursive bracket matching       │
    │              │  - iRule-aware                      │
    │              │  - All edge cases handled           │
    │              └─────────────────────────────────────┘
    │                            │
    ▼                            ▼
┌─────────────────────────────────────┐
│  Hierarchical Output                │
│  ltm.virtual["/Common/vs"]          │
│  - Includes 'line' for original     │
│  - Includes partition/name metadata │
└─────────────────────────────────────┘
```

---

## 3. Edge Cases Handled

| Edge Case | Example | Implementation |
|-----------|---------|----------------|
| iRules | `ltm rule /Common/x { when HTTP_REQUEST {...} }` | `isRule()` detection, bracket counting ignores TCL |
| Monitor min X | `monitor min 2 of { /Common/http /Common/tcp }` | Parsed as array |
| Empty objects | `metadata { }` | Returns `{}` |
| Pseudo-arrays | `vlans { /Common/v1 /Common/v2 }` | `objToArr()` conversion |
| Multiline strings | `description "line1\nline2"` | Quote counting, `arrToMultilineStr()` |
| GTM topology | `gtm topology ldns: ... server: ...` | `preprocessTopology()` restructures |
| Comments in iRules | `# comment with { bracket` | Ignored in bracket counting |
| Escaped brackets | `set var "string with \{ escaped"` | Previous char tracking |
| Windows CRLF | `\r\n` line endings | Normalized to `\n` |

---

## 4. Output Format

### Input
```tcl
ltm pool /Common/web_pool {
    load-balancing-mode round-robin
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
            session monitor-enabled
        }
    }
    monitor /Common/http
}
```

### Output (Hierarchical)
```json
{
  "ltm": {
    "pool": {
      "/Common/web_pool": {
        "line": "    load-balancing-mode round-robin\n    members {...}",
        "name": "web_pool",
        "partition": "Common",
        "load-balancing-mode": "round-robin",
        "members": {
          "/Common/10.0.1.10:80": {
            "address": "10.0.1.10",
            "session": "monitor-enabled"
          }
        },
        "monitor": "/Common/http"
      }
    }
  }
}
```

---

## 5. MCP Server Workflow

The new APIs enable efficient drift detection workflows:

```typescript
// 1. Parse config from string (fetched via SSH/API)
const bigip = new BigipConfig();
await bigip.loadParseString(tmosConfigText);

// 2. Discovery - agent presents options to user
const partitions = bigip.listPartitions();
// → ['Common', 'Tenant1', 'Tenant2']

const apps = bigip.listApps('Tenant1');
// → ['/Tenant1/app1_vs', '/Tenant1/app2_vs']

// 3. Extract only what's needed (efficient!)
const tenant1Apps = await bigip.apps({ partition: 'Tenant1' });

// 4. Or extract specific apps selected by user
const selectedApps = await bigip.apps({ 
    apps: ['/Common/shared_vs', '/Tenant1/app1_vs'] 
});

// 5. Lightweight summaries for display
const summaries = bigip.listAppsSummary('Tenant1');
// → [{ name: 'app1_vs', fullPath: '/Tenant1/app1_vs', destination: '...', pool: '...' }]
```

---

## 6. Test Coverage

New test file: `tests/070_universalParser.tests.ts`

| Test Suite | Tests | Coverage |
|------------|-------|----------|
| parseConfig - Basic Parsing | 3 | Pools, virtuals, multiple partitions |
| parseConfig - Edge Cases | 7 | Empty objects, arrays, multiline, iRules, escaping |
| parseConfig - GTM Objects | 2 | Wideips, GTM pools |
| loadParseString | 14 | All aspects of string input |
| listPartitions | 2 | Discovery, sorting |
| listApps | 4 | Filtering, sorting |
| listAppsSummary | 1 | Metadata extraction |
| apps() with filters | 7 | All filter options |
| MCP Workflow Integration | 1 | End-to-end workflow |

**Total: ~41 new tests**

---

## 7. Files Changed

| File | Change |
|------|--------|
| `src/universalParse.ts` | **NEW** - Universal recursive parser |
| `src/ltm.ts` | Added `loadParseString()`, `listPartitions()`, `listApps()`, `listAppsSummary()`, enhanced `apps()` |
| `src/models.ts` | Added `AppsFilterOptions`, `AppSummary` types |
| `src/index.ts` | Export `parseConfig`, `parseConfigs` |
| `tests/070_universalParser.tests.ts` | **NEW** - Comprehensive test suite |
| `README.md` | Added string input documentation |
| `CLAUDE.md` | Updated with new API documentation |

---

## 8. Breaking Changes

**None.** All changes are additive:

- Existing `loadParseAsync()` still works
- Existing `apps()` signature unchanged (string argument still works)
- Existing `explode()` still works
- Output structure compatible with existing consumers

---

## 9. Future: Converter Integration

The converters from tmos-converter can be added as a future phase:

```typescript
// Future API (not yet implemented)
await bigip.toAS3({ tenant: 'Tenant1' }): AS3Result
bigip.toDO(): DOResult
await bigip.validateAS3(declaration): ValidationResult
```

See MERGE_STRATEGY.md for the converter integration plan.
