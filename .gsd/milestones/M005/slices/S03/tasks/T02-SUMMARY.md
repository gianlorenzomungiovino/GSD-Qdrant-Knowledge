---
id: T02
parent: S03
milestone: M005
key_files:
  - src/re-ranking.js — new file: applyRecencyBoost function with recency boost (+0.05) and path matching (+0.15)
  - src/cli.js — added import of re-ranking module, call site in context command after threshold filtering before sorting
key_decisions:
  - Used _query field on result objects for path matching instead of changing function signature — keeps API clean while allowing callers to attach query during mapping
  - Converted printf-style format string from task plan (%.3f) to template literal since Node.js console.log doesn't support %.3f formatting
duration: 
verification_result: passed
completed_at: 2026-04-27T16:27:41.134Z
blocker_discovered: false
---

# T02: Implement re-ranking with recency boost (+0.05 for files <30 days old) and path matching (+0.15 when query words appear in source paths)

**Implement re-ranking with recency boost (+0.05 for files <30 days old) and path matching (+0.15 when query words appear in source paths)**

## What Happened

Created src/re-ranking.js exporting applyRecencyBoost(results, options={days: 30, pathMatch: true}) function that mutates result scores in place.

Implementation details:
1. Recency boost (+0.05): For each result with lastModified (unix timestamp) within the configured days window (default 30), adds +0.05 to score. Compares lastMod * 1000 against Date.now() - days * 86400000 for correct ms-level comparison.
2. Score cap: All boosted scores are capped at max 1.0 via Math.min(1.0, result.score + boost).
3. Path matching (+0.15): Splits query into words (min 3 chars each), checks if any word appears in the source path (case-insensitive). Adds +0.15 once per result even if multiple query words match. Disabled via pathMatch: false option or when query < 3 characters.
4. Query resolution: Reads raw query from _query field on first result object, enabling callers to attach it during mapping without changing the function signature.
5. Logging: console.log with template literal format showing count and average boost per result.

Integration into cli.js context command:
- Added import at top of file: const { applyRecencyBoost } = require('./re-ranking')
- After threshold filtering, mapped hits to result objects with _query attached for path matching
- Called applyRecencyBoost(rankedResults) before sorting by updated score
- Results sorted descending and limited to LIMIT after re-ranking

Verification evidence:
- Unit tests (15 test cases): recency boost, old results unchanged, score cap at 1.0, path matching with query words, mixed recent/old results, custom days parameter (number and object forms), pathMatch disabled, missing lastModified handled gracefully, empty/null inputs safe, short queries skip path matching
- Integration mock: Simulated Qdrant results showed intent-detector.js jumping from score 0.72 → 0.92 (+recency +pathMatch) and landing in top 3
- Live CLI test with real Qdrant data confirmed re-ranking function executes correctly (logs [rerank] N results scored), though no local files have lastModified yet since project hasn't been synced after T01 changes

## Verification

Syntax check passed for both src/re-ranking.js and src/cli.js. Unit tests: 15 test cases covering recency boost, score capping at 1.0, path matching (+0.15 when query words in source), mixed recent/old results, custom days parameter (number and object forms), pathMatch disabled flag, missing lastModified handling, empty/null input safety, short queries skipping path match — all assertions passed. Integration mock test confirmed intent-detector.js jumps from score 0.72 to 0.92 (+0.05 recency + +0.15 pathMatch) and ranks in top 3 after re-ranking. Live CLI execution with real Qdrant data showed [rerank] log output confirming function executes correctly on actual search results (avg boost ~0 since indexed docs lack lastModified from pre-T01 sync).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -c src/re-ranking.js && node -c src/cli.js` | 0 | ✅ pass | 85ms |
| 2 | `Unit tests: recency boost, score cap, path matching, mixed results, custom days, pathMatch disabled, edge cases (15 assertions)` | 0 | ✅ pass | 420ms |
| 3 | `Integration mock: intent-detector.js 0.72→0.92 after re-ranking with query 'intent detector'` | 0 | ✅ pass | 150ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/re-ranking.js — new file: applyRecencyBoost function with recency boost (+0.05) and path matching (+0.15)`
- `src/cli.js — added import of re-ranking module, call site in context command after threshold filtering before sorting`
