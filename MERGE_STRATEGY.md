# Merge Strategy: tmos-converter into f5-corkscrew

**Date:** 2025-12-31  
**Status:** Phase 1 Complete ✅ | Phase 2 Pending

---

## Progress Summary

### ✅ Phase 1: Universal Parser (COMPLETE)

| Task | Status |
|------|--------|
| Port recursive parser from tmos-converter | ✅ Done |
| Add `loadParseString()` method | ✅ Done |
| Add `listPartitions()` method | ✅ Done |
| Add `listApps()` method | ✅ Done |
| Add `listAppsSummary()` method | ✅ Done |
| Enhance `apps()` with filter options | ✅ Done |
| Add comprehensive tests | ✅ Done (~41 tests) |
| Update documentation | ✅ Done |

### ⏳ Phase 2: Converters (PENDING)

| Task | Status |
|------|--------|
| Port AS3 converter | ⏳ Pending |
| Port DO converter | ⏳ Pending |
| Port schema validators | ⏳ Pending |
| Add `toAS3()` method | ⏳ Pending |
| Add `toDO()` method | ⏳ Pending |
| Add `validateAS3()` method | ⏳ Pending |

---

## Current Architecture

```
f5-corkscrew/
├── src/
│   ├── index.ts                 # Main exports
│   ├── ltm.ts                   # BigipConfig class (enhanced ✅)
│   ├── universalParse.ts        # NEW: Recursive parser ✅
│   ├── models.ts                # Types (enhanced ✅)
│   │
│   ├── digConfigs.ts            # App extraction
│   ├── digGslb.ts               # GTM extraction
│   ├── unPackerStream.ts        # Archive streaming
│   ├── regex.ts                 # Regex patterns
│   └── ...
│
└── tests/
    ├── 070_universalParser.tests.ts  # NEW: Parser tests ✅
    └── ...
```

---

## Current API (Implemented)

```typescript
import BigipConfig from 'f5-corkscrew';

const bigip = new BigipConfig();

// Load from file (existing)
await bigip.loadParseAsync('/path/to/config.ucs');

// Load from string (NEW ✅)
await bigip.loadParseString(configText);

// Discovery (NEW ✅)
const partitions = bigip.listPartitions();
const apps = bigip.listApps('Tenant1');
const summaries = bigip.listAppsSummary();

// Filtered extraction (ENHANCED ✅)
const allApps = await bigip.apps();
const tenant1Apps = await bigip.apps({ partition: 'Tenant1' });
const multiTenant = await bigip.apps({ partitions: ['T1', 'T2'] });
const specific = await bigip.apps({ apps: ['/Common/vs1'] });

// Full explosion (existing)
const explosion = await bigip.explode();
```

---

## Phase 2: Converter Integration Plan

### Target Architecture

```
f5-corkscrew/
├── src/
│   ├── converters/              # NEW: From tmos-converter
│   │   ├── as3/
│   │   │   ├── index.ts
│   │   │   ├── engine/
│   │   │   └── maps/
│   │   └── do/
│   │       ├── index.ts
│   │       └── maps/
│   │
│   ├── validators/              # NEW: Schema validation
│   │   ├── as3.ts
│   │   └── do.ts
│   │
│   └── ...existing files...
│
├── deps/                        # NEW: Bundled schemas
│   ├── f5-appsvcs-classic-schema-X.X.X.tgz
│   └── f5-declarative-onboarding-X.X.X.tgz
│
└── tests/
    ├── converters/              # NEW: Converter tests
    └── ...
```

### Target API

```typescript
// Future methods (not yet implemented)
const as3 = await bigip.toAS3({ 
    tenant: 'Tenant1',
    controls: true 
});

const doDecl = bigip.toDO();

const validation = await bigip.validateAS3(modifiedDeclaration);
```

### Implementation Steps

1. **Copy converter directories**
   ```bash
   cp -r ~/tmos-converter/src/converters src/
   ```

2. **Copy validator files**
   ```bash
   cp -r ~/tmos-converter/src/validators src/
   ```

3. **Copy schema dependencies**
   ```bash
   mkdir -p deps
   cp ~/tmos-converter/deps/*.tgz deps/
   ```

4. **Update package.json**
   ```json
   {
     "dependencies": {
       "@automation-toolchain/f5-appsvcs-classic-schema": "file:deps/f5-appsvcs-classic-schema-1.4.0.tgz",
       "@automation-toolchain/f5-do": "file:deps/f5-declarative-onboarding-X.X.X.tgz",
       "ajv": "^8.17.1",
       "lodash": "^4.17.21"
     }
   }
   ```

5. **Add BigipConfig methods**
   ```typescript
   async toAS3(options?: AS3Options): Promise<AS3Result> {
       const parsed = this.getFullConfig();
       return as3Converter(parsed, options);
   }
   ```

6. **Port tests**
   - AS3 converter tests (304 tests)
   - DO converter tests (63 tests)
   - Validator tests

---

## Decision: When to Add Converters

**Current recommendation:** Hold off on converters until:

1. The MCP server confirms the parser enhancements meet workflow needs
2. There's a concrete need for built-in AS3/DO conversion
3. The current tmos-converter can be used separately if needed

**Reasons to wait:**
- Converters add significant complexity (~30+ files)
- Bundled schema dependencies increase package size
- MCP server can call tmos-converter directly for now
- Focus on stabilizing parser changes first

**Triggers to proceed:**
- User feedback requesting built-in conversion
- Performance issues with separate tmos-converter calls
- Need for tighter integration between parsing and conversion

---

## Test Coverage Summary

### Phase 1 Tests (Complete)

| Area | Tests |
|------|-------|
| Universal parser | 12 |
| loadParseString | 14 |
| listPartitions | 2 |
| listApps | 4 |
| listAppsSummary | 1 |
| apps() filters | 7 |
| MCP workflow | 1 |
| **Total** | **~41** |

### Phase 2 Tests (Pending)

| Area | Tests (estimated) |
|------|-------------------|
| AS3 converter | 304 |
| DO converter | 63 |
| Validators | 10 |
| Integration | 20 |
| **Total** | **~400** |

---

## Deprecation Plan for tmos-converter

After Phase 2 is complete and stable:

1. **Update tmos-converter README**
   ```markdown
   > ⚠️ **Deprecated**: This package has been merged into 
   > [f5-corkscrew](https://github.com/f5devcentral/f5-corkscrew).
   > Please migrate to f5-corkscrew for new projects.
   ```

2. **Publish final tmos-converter version** with deprecation notice

3. **Archive tmos-converter repo** (after 6 months)

---

## Related Documentation

- **[PARSER_ANALYSIS.md](PARSER_ANALYSIS.md)** - Technical comparison (updated)
- **[CLAUDE.md](CLAUDE.md)** - Development guide with new APIs
- **[README.md](README.md)** - User documentation with examples
