# CLAUDE.md — LeRobotDatasetCleaner

## Package manager

Always use **npm** (`npm install`, `npm run dev`, `npm run build`, `npm test`).

## Post-process — run after every code change

After making any code changes, always run these commands in order and fix any errors before finishing:

```
npm run format        # auto-fix formatting (prettier)
npm run type-check    # TypeScript: app + test files
npm run lint          # ESLint (next lint)
npm test              # unit tests
```

Or run them all at once (format first, then the full validate suite):

```
npm run format && npm run validate
```

`npm run validate` runs: type-check → lint → format:check → test

## Key scripts

```
npm run dev          # Next.js dev server
npm test             # Run all unit tests (Vitest)
npm run type-check   # tsc --noEmit (app) + tsc -p tsconfig.test.json --noEmit (tests)
npm run lint         # next lint
npm run validate     # type-check + lint + format:check
```

## Architecture

### Dataset version support

Three versions are supported. Version is detected from `meta/info.json` → `codebase_version`.

| Version  | Path pattern                                                      | Episode metadata                           | Video                                          |
| -------- | ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| **v2.0** | `data/{episode_chunk:03d}/episode_{episode_index:06d}.parquet`    | None (computed from `chunks_size`)         | Full file per episode                          |
| **v2.1** | Same as v2.0                                                      | None                                       | Full file per episode                          |
| **v3.0** | `data/chunk-{N:03d}/file-{N:03d}.parquet` (via `buildV3DataPath`) | `meta/episodes/chunk-{N}/file-{N}.parquet` | Segmented (timestamps per episode, per camera) |

### Routing to parsers

`src/app/[org]/[dataset]/[episode]/fetch-data.ts` → `getEpisodeData()` dispatches to:

- `getEpisodeDataV2()` for v2.0 and v2.1
- `getEpisodeDataV3()` for v3.0

### v3.0 specifics

- Episode metadata row has named keys (`episode_index`, `data/chunk_index`, `data/file_index`, `dataset_from_index`, `dataset_to_index`, `videos/{key}/chunk_index`, etc.)
- Integer columns from parquet come out as **BigInt** — always use `bigIntToNumber()` from `src/utils/typeGuards.ts`
- Row-range selection: `dataset_from_index` / `dataset_to_index` allow reading only the episode's rows from a shared parquet file
- Fallback format uses numeric keys `"0"`.."9"` when column names are unavailable

### v2.x path construction

```ts
formatStringWithVars(info.data_path, {
  episode_chunk: Math.floor(episodeId / chunkSize)
    .toString()
    .padStart(3, "0"),
  episode_index: episodeId.toString().padStart(6, "0"),
});
// → "data/000/episode_000042.parquet"
```

`formatStringWithVars` strips `:03d` format specifiers — padding must be done by the caller.

## Key files

| File                                              | Purpose                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[org]/[dataset]/[episode]/fetch-data.ts` | Main data-loading entry point; v2/v3 parsers; `computeColumnMinMax`                                                                      |
| `src/utils/versionUtils.ts`                       | `getDatasetInfo`, `getDatasetVersionAndInfo`, `buildVersionedUrl`                                                                        |
| `src/utils/stringFormatting.ts`                   | `buildV3DataPath`, `buildV3VideoPath`, `buildV3EpisodesMetadataPath`, padding helpers                                                    |
| `src/utils/parquetUtils.ts`                       | `fetchParquetFile`, `readParquetAsObjects`, `formatStringWithVars`                                                                       |
| `src/utils/dataProcessing.ts`                     | Chart grouping pipeline: `buildSuffixGroupsMap` → `computeGroupStats` → `groupByScale` → `flattenScaleGroups` → `processChartDataGroups` |
| `src/utils/typeGuards.ts`                         | `bigIntToNumber`, `isNumeric`, `isValidTaskIndex`, etc.                                                                                  |
| `src/utils/constants.ts`                          | `PADDING`, `EXCLUDED_COLUMNS`, `CHART_CONFIG`, `THRESHOLDS`                                                                              |
| `src/types/`                                      | TypeScript types: `DatasetVersion`, `EpisodeMetadataV3`, `VideoInfo`, `ChartDataGroup`, etc.                                             |

## Chart data pipeline

Series keys use `" | "` as delimiter (e.g. `observation.state | 0`).
`groupRowBySuffix` groups by **suffix**: if two different prefixes share suffix `"0"` (e.g. `observation.state | 0` and `action | 0`), they are merged under `result["0"] = { "observation.state": ..., "action": ... }`. A series with a unique suffix stays flat with its full original key.

## Testing

- Test files live in `**/__tests__/` directories alongside source
- Uses `vitest`
- BigInt literals (`42n`) require `tsconfig.test.json` (target ES2020) — test files are excluded from `tsconfig.json`
- Mocking fetch: `globalThis.fetch = mock(() => Promise.resolve(new Response(...))) as unknown as typeof fetch`
- CI should run `npm test` on push/PR to main

## URL structure

All dataset URLs:

```
https://huggingface.co/datasets/{org}/{dataset}/resolve/main/{path}
```

Built by `buildVersionedUrl(repoId, version, path)`. The `version` param is accepted but currently unused in the URL (always `main` revision).

## Excluded columns (not shown in charts)

- v2.x: `timestamp`, `frame_index`, `episode_index`, `index`, `task_index`
- v3.0: `index`, `task_index`, `episode_index`, `frame_index`, `next.done`
