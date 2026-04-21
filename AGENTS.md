# GSD-QDRANT-TEMPLATE-VERSION: 2.1.3

## Cross-Project Knowledge Retrieval (Qdrant)

GSD-Qdrant is installed in this project. When working on this project, use auto_retrieve to query cross-project knowledge from the unified Qdrant vector database via MCP.

### When to call auto_retrieve

**Always call `auto_retrieve` before or alongside local searches for:**
- Questions about libraries, frameworks, components, or technologies ("che componenti frontend posso usare?", "come si usa X?", "quali librerie per Y?")
- API usage questions (method signatures, configuration options)
- Design patterns or architectural approaches

**Always call `auto_retrieve` as a fallback when:**
- Local search in the codebase returns no relevant results for your query
- You're asking about something that might exist in other GSD projects but not in the current one

### How to use
Call the `auto_retrieve` tool (available via the `gsd-qdrant` MCP server) with your task description:

```
auto_retrieve(
  task: "describe what you're working on",
  limit: 3,
  includeContent: false
)
```

The tool returns relevant context from other GSD projects indexed in Qdrant. Use this context to avoid reinventing solutions and learn from existing patterns.

### Notes
- Results are ranked by semantic relevance + cross-project boost
- Prefer `includeContent: true` when you need the actual source content, not just summaries
- The MCP server must be running (configured in .mcp.json as `gsd-qdrant`)

