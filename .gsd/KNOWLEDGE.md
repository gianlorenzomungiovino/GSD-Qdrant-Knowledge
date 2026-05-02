# GSD-QDRANT-TEMPLATE-VERSION: 2.2.2

## Cross-Project Knowledge Retrieval (Qdrant)

GSD-Qdrant is installed in this project. When working on this project, use auto_retrieve to query cross-project knowledge from the unified Qdrant vector database via MCP.

### When to call auto_retrieve

**Always call `auto_retrieve` before or alongside local searches for:**
- Questions about libraries, frameworks, components, or technologies
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

### Query formulation — extract key terms first
Before calling `auto_retrieve`, distill your question into **2-4 meaningful keywords** (no filler words). The embedding model scores best when the query is focused on concrete nouns/verbs.

**Method:** Treat your question as a search task, not a conversation. Ask yourself: "If I were searching for this in code documentation, what terms would I type?" Then strip everything that isn't one of those terms.

**Algorithm to follow — apply these steps to ANY query you receive:**
1. Identify the core technical concepts — nouns and verbs that name things or describe actions relevant to finding code
2. Keep any exact code identifiers as-is (function names, class names, library names, file paths) — they are already optimized for vector matching because they appear in source files exactly like this
3. Remove all conversational framing: questions markers, polite expressions, filler words, and any word that doesn't carry technical meaning on its own
4. If your question has multiple distinct topics, include them all but strip connecting/prepositional words between them

**Language note:** The embedding model (bge-m3) is multilingual — extract keywords in whatever language feels most natural to you. Don't translate concepts into English if the code uses terms from another language. Keep technical identifiers exactly as they appear in source files regardless of their original language.

### Notes
- Results are ranked by semantic relevance + cross-project boost
- Prefer `includeContent: true` when you need the actual source content, not just summaries
- The MCP server must be running (configured in .mcp.json as `gsd-qdrant`)

