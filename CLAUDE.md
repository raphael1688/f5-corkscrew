# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

f5-corkscrew is a TypeScript-based tool for extracting and parsing F5 BIG-IP TMOS configurations from various archive formats (.conf, .ucs, .qkview, .tar.gz) or raw config strings. The tool converts TMOS configuration into structured JSON for analysis, application extraction, and migration workflows (e.g., to AS3).

## Related Documents

- **[PARSER_ANALYSIS.md](PARSER_ANALYSIS.md)** - Technical analysis of the universal parser implementation
- **[MERGE_STRATEGY.md](MERGE_STRATEGY.md)** - Status of tmos-converter merge (Phase 1 complete)
- **[CHANGELOG.md](CHANGELOG.md)** - Version history
- **[README.md](README.md)** - Usage documentation

---

## Recent Enhancements (December 2025)

### Universal Recursive Parser

Replaced selective parsing with a full-depth recursive parser ported from tmos-converter:

- **Full depth parsing** - Handles any nesting level, not just specific object types
- **iRule-aware** - Proper TCL bracket handling
- **Edge cases** - Multiline strings, pseudo-arrays, empty objects, `monitor min X of`
- **Preserves original** - `line` property contains original config for reconstruction

### New String Input Method

```typescript
// Parse config directly from string (no file needed)
const bigip = new BigipConfig();
await bigip.loadParseString(tmosConfigText);
await bigip.loadParseString(tmosConfigText, 'optional-filename.conf');
```

### Discovery APIs (MCP-Friendly)

```typescript
// List all partitions found in config
bigip.listPartitions(): string[]
// → ['Common', 'Tenant1', 'Tenant2']

// List virtual servers (optionally filter by partition)
bigip.listApps(): string[]
bigip.listApps('Tenant1'): string[]
// → ['/Tenant1/app1_vs', '/Tenant1/app2_vs']

// Get lightweight summaries for display
bigip.listAppsSummary(partition?: string): AppSummary[]
// → [{ name, fullPath, partition, destination, pool }]
```

### Enhanced App Extraction with Filters

```typescript
// All apps (existing behavior)
await bigip.apps(): TmosApp[]

// Filter by single partition
await bigip.apps({ partition: 'Tenant1' }): TmosApp[]

// Filter by multiple partitions
await bigip.apps({ partitions: ['Tenant1', 'Tenant2'] }): TmosApp[]

// Filter by specific app names
await bigip.apps({ apps: ['/Common/vs1', '/Tenant1/vs2'] }): TmosApp[]

// Legacy single app (backward compatible)
await bigip.apps('/Common/app_vs'): TmosApp[]
```

### MCP Server Workflow Example

```typescript
// 1. Parse config from string (fetched via SSH/API)
const bigip = new BigipConfig();
await bigip.loadParseString(tmosConfigText);

// 2. Discovery - agent presents options to user
const partitions = bigip.listPartitions();
const apps = bigip.listApps('Tenant1');

// 3. Extract only what's needed (efficient for large configs)
const tenant1Apps = await bigip.apps({ partition: 'Tenant1' });

// 4. Or extract user-selected apps
const selectedApps = await bigip.apps({ 
    apps: ['/Common/shared_vs', '/Tenant1/app1_vs'] 
});

// 5. Convert to AS3 (via tmos-converter, for now)
const as3 = convertAppsToAS3(tenant1Apps, { tenant: 'Tenant1' });
```

---

## Development Commands

### Build and Compile

```bash
npm run compile           # Compile TypeScript to dist/
npm run watch            # Watch mode compilation
npm run build-package    # Compile and create npm package
```

### Testing

```bash
npm test                 # Run all Mocha tests with coverage (nyc)
```

Individual test files can be run with:

```bash
npx mocha -r ts-node/register tests/<test-file>.tests.ts
```

Test timeout is configured to 120 seconds in package.json.

### Linting

```bash
npm run lint            # TypeScript check + ESLint
```

### CLI Usage

```bash
corkscrew --file <path-to-conf|ucs|qkview>
```

Options: `--no_sources`, `--no_file_store`, `--no_command_logs`, `--no_process_logs`, `--includeXmlStats`

---

## Architecture Overview

### Key Source Files

| File | Purpose |
|------|---------|
| `src/ltm.ts` | **BigipConfig class** - Main orchestration, all public APIs |
| `src/universalParse.ts` | **Universal parser** - Recursive TMOS→JSON conversion |
| `src/models.ts` | TypeScript types and interfaces |
| `src/unPackerStream.ts` | Streaming archive extraction |
| `src/digConfigs.ts` | App extraction (VS + dependencies) |
| `src/digGslb.ts` | GTM/DNS extraction |
| `src/regex.ts` | Version-aware regex patterns |
| `src/deepParse.ts` | Legacy parsing utilities (still used for some extraction) |

### Data Flow

```
Input Sources
    │
    ├── loadParseAsync(file)     → UnPackerStream → parseConf()
    │                                                    │
    └── loadParseString(text)    ─────────────────→ parseConf()
                                                         │
                                                         ▼
                                              ┌──────────────────┐
                                              │  parseConfig()   │
                                              │  (universalParse)│
                                              └──────────────────┘
                                                         │
                                                         ▼
                                              ┌──────────────────┐
                                              │   configObject   │
                                              │  (hierarchical)  │
                                              └──────────────────┘
                                                         │
                    ┌────────────────┬───────────────────┼───────────────────┐
                    ▼                ▼                   ▼                   ▼
            listPartitions()   listApps()           apps()            explode()
```

### Config Object Structure

```typescript
{
  ltm: {
    virtual: { 
      "/Common/app_vs": { 
        line: "original config...",
        name: "app_vs",
        partition: "Common",
        destination: "...",
        pool: "...",
        profiles: {...},
        ... 
      } 
    },
    pool: { "/Common/app_pool": {...} },
    node: { "/Common/10.0.1.10": {...} },
    monitor: { http: { "/Common/http": {...} } },
    profile: { http: {...}, tcp: {...} },
    rule: { "/Common/redirect": "when HTTP_REQUEST {...}" },
    ...
  },
  gtm: {
    wideip: { a: {...}, aaaa: {...} },
    pool: { a: {...} },
    server: {...}
  },
  apm: {...},
  asm: {...},
  sys: {...},
  net: {...}
}
```

### Key Types (src/models.ts)

```typescript
// Filter options for apps() method
interface AppsFilterOptions {
    partition?: string;
    partitions?: string[];
    apps?: string[];
}

// Lightweight app summary for listing
interface AppSummary {
    name: string;
    fullPath: string;
    partition: string;
    folder?: string;
    destination?: string;
    pool?: string;
}

// Full app extraction result
interface TmosApp {
    name: string;
    partition: string;
    destination: string;
    lines: string[];      // Original config lines
    pool?: {...};
    profiles?: string[];
    rules?: string[];
    ...
}
```

---

## Testing

### Test Files

| File | Coverage |
|------|----------|
| `070_universalParser.tests.ts` | Universal parser, string input, discovery APIs, filters |
| `050_conf_file.tests.ts` | File-based parsing, events |
| `052_ucs.tests.ts` | UCS archive parsing |
| `054_qkview.tests.ts` | Qkview parsing with XML stats |
| `030_dnsDetails.tests.ts` | GTM/DNS parsing |
| `037_ltmDetails.tests.ts` | LTM object parsing |

### Running Specific Tests

```bash
# Run just the new parser tests
npx mocha -r ts-node/register tests/070_universalParser.tests.ts

# Run with grep filter
npx mocha -r ts-node/register tests/*.tests.ts --grep "loadParseString"
```

---

## Common Tasks

### Adding Support for New TMOS Objects

The universal parser handles most objects automatically. For special extraction logic:

1. Update type definitions in `src/models.ts`
2. Add extraction logic in `src/digConfigs.ts` if needed
3. Update `src/objCounter.ts` to count new object type
4. Add tests

### Debugging Parsing Issues

```typescript
const bigip = new BigipConfig();

// Add event listeners for progress
bigip.on('parseFile', (fileName) => console.log('Parsing:', fileName));
bigip.on('parseObject', (info) => console.log('Objects:', info));

await bigip.loadParseString(config);

// Check logs
const logs = await bigip.logs();
console.log(logs);

// Inspect parsed structure
console.log(JSON.stringify(bigip.configObject, null, 2));
```

### Testing String Input

```typescript
const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
    pool /Common/test_pool
}`;

const bigip = new BigipConfig();
await bigip.loadParseString(config);

console.log(bigip.listPartitions());  // ['Common']
console.log(bigip.listApps());        // ['/Common/test_vs']
```

---

## Future: Converter Integration

Phase 2 of the tmos-converter merge will add:

```typescript
// Not yet implemented
await bigip.toAS3({ tenant: 'Tenant1' }): AS3Result
bigip.toDO(): DOResult
await bigip.validateAS3(declaration): ValidationResult
```

See [MERGE_STRATEGY.md](MERGE_STRATEGY.md) for details.
