---
id: T04
parent: S03
milestone: M005
key_files:
  - src/re-ranking.js - added estimateTokens() and trimResultsByTokenBudget() functions
  - src/cli.js - imported new utilities, integrated token estimation + trimming into context command after ranking step
  - src/gsd-qdrant-mcp/index.js - imported re-ranking utilities, integrated token estimation + trimming in auto_retrieve tool before MCP response formatting
key_decisions:
  - Used 4 chars/token ratio as conservative approximation for code/text mix (per task plan)
  - Truncation keeps all top-K results but truncates text fields to 500 chars each, rather than dropping entire results
  - _truncated internal flag cleaned up before JSON output to prevent MCP response pollution
duration: 
verification_result: passed
completed_at: 2026-04-27T16:44:24.184Z
blocker_discovered: false
---

# T04: Add token estimation (~4 chars/token) and truncation to cap output at 4000 tokens in CLI context command and MCP auto_retrieve tool

**Add token estimation (~4 chars/token) and truncation to cap output at 4000 tokens in CLI context command and MCP auto_retrieve tool**

## What Happened

Implemented two new functions in src/re-ranking.js: estimateTokens(text) returns Math.ceil(text.length / 4), a conservative approximation for code/text mix. trimResultsByTokenBudget(results, options) calculates total estimated tokens across content/summary/text fields of all results; if over budget (default 4000), truncates each result's text to maxCharsPerResult chars (default 500). Integrated into both src/cli.js context command and src/gsd-qdrant-mcp/index.js auto_retrieve tool as the final step before JSON output. Internal _truncated flag is cleaned up before response serialization.\n\nVerification: Unit tests confirm small results (<4000 tokens) pass through untrimmed, large results (~4500 tokens) get truncated to ~375 total tokens with all content ≤500 chars per result. Edge cases (empty arrays, null input) handled gracefully. Both files pass node -c syntax check.\n\nFiles modified: src/re-ranking.js (added estimateTokens + trimResultsByTokenBudget), src/cli.js (imported and integrated token estimation in context command), src/gsd-qdrant-mcp/index.js (imported and integrated token estimation in auto_retrieve tool).

## Verification

Unit tests: 1) estimateTokens('hello world') = ceil(11/4)=3 ✅, 2) estimateTokens('') = 0 ✅, 3) estimateTokens(null) = 0 ✅, 4) Small results (114 tokens) → no trimming ✅, 5) Large results (~4500 tokens) → trimmed to ~375 tokens with all content ≤500 chars ✅, 6) Empty array input handled gracefully ✅, 7) Null input handled gracefully ✅. Syntax check: node -c src/re-ranking.js OK, node -c src/gsd-qdrant-mcp/index.js OK. Integration simulation: CLI context flow produces correct JSON output with token estimation log line and no _truncated flag leakage.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e "...unit tests for estimateTokens + trimResultsByTokenBudget" (small results, large results, edge cases)` | 0 | ✅ pass | 45ms |
| 2 | `node src/re-ranking.js && node src/gsd-qdrant-mcp/index.js syntax check via node -c` | 0 | ✅ pass | 12ms |
| 3 | `Integration simulation: mock Qdrant results through full CLI context flow with token estimation and trimming` | 0 | ✅ pass | 38ms |

## Deviations

None. Implementation matches task plan exactly — estimateTokens at ~4 chars/token, truncation to 500 chars per result when >4000 tokens, logging in both CLI and MCP paths.

## Known Issues

None.

## Files Created/Modified

- `src/re-ranking.js - added estimateTokens() and trimResultsByTokenBudget() functions`
- `src/cli.js - imported new utilities, integrated token estimation + trimming into context command after ranking step`
- `src/gsd-qdrant-mcp/index.js - imported re-ranking utilities, integrated token estimation + trimming in auto_retrieve tool before MCP response formatting`
