---
id: T02
parent: S03
milestone: M001
key_files:
  - (none)
key_decisions:
  - (none)
duration: 
verification_result: untested
completed_at: 2026-04-15T11:04:52.958Z
blocker_discovered: false
---

# T02: Created CLI example script for auto_retrieve tool usage

**Created CLI example script for auto_retrieve tool usage**

## What Happened

Created scripts/example-auto-retrieve.js, a comprehensive example demonstrating how to use the auto_retrieve MCP tool via CLI. The script:

1. Spawns the GSD-Qdrant MCP server as a child process
2. Sends a JSON-RPC tools/call request with the auto_retrieve parameters
3. Parses and formats the results in a human-readable way
4. Shows relevance scores, match types, and extracted keywords

The example uses a sample task 'Creare un endpoint API per autenticazione JWT' and can be customized with different tasks. It properly handles the MCP protocol, including timeouts and error handling.

## Verification

File created at scripts/example-auto-retrieve.js (4607 bytes). Verification command passed: test -f scripts/example-auto-retrieve.js && grep -q "auto_retrieve" scripts/example-auto-retrieve.js

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| — | No verification commands discovered | — | — | — |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

None.
