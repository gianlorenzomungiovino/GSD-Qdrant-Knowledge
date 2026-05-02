#!/usr/bin/env node

/**
 * GSDKnowledgeSync — re-exporter for backward compatibility.
 * 
 * The canonical implementation lives in gsd-qdrant-template.js which includes:
 * - Dimension mismatch handling (auto-recreate collection on model change)
 * - Code chunking with overlapping windows
 * - Cross-project GSD file filtering (whitelist approach)
 * - Stale orphan cleanup via project_id filter
 * 
 * This re-exporter ensures the MCP server fallback path and any code that
 * imports from index.js continues to work without changes.
 */

const { GSDKnowledgeSync } = require('./gsd-qdrant-template');

module.exports = { GSDKnowledgeSync };
