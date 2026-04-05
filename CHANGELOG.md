# Changelog

Tutti i cambiamenti significativi in questo progetto.

## [1.0.0] - 2026-04-05

### 🎉 Release Iniziale

- **CLI per setup automatico GSD + Qdrant**
  - Installazione globale tramite npm
  - Setup automatico di knowledge base GSD in qualsiasi progetto Node.js
  - Integrazione con Qdrant per vector search
  - Supporto per template personalizzati

- **Funzionalità Principali**
  - Installazione automatica di dipendenze (`@qdrant/js-client-rest`, `@xenova/transformers`)
  - Download template da Qdrant cloud
  - Creazione file progetto target
  - Prima sync automatica della knowledge base

- **Comandi CLI**
  - `gsd-qdrant` - Avvia il setup
  - `gsd-qdrant snippet search <query>` - Cerca snippet di codice
  - `gsd-qdrant snippet search <query> --type=<type>` - Filtra per tipo
  - `gsd-qdrant snippet search <query> --export=<file>` - Esporta risultati

- **Integrazioni**
  - Qdrant cloud per storage e vector search
  - MCP (Model Context Protocol) per integrazione con LLM
  - Supporto Docker per Qdrant server locale

- **Requisiti**
  - Node.js >= 18
  - Docker (opzionale, per Qdrant locale)
  - Python 3.10+ con `mcp`, `qdrant-client`, `fastembed`

### 📦 Pacchetti

- **Nome:** `gsd-qdrant-cli`
- **Versione:** 1.0.0
- **Licenza:** MIT
- **Repository:** [GitHub](https://github.com/yourusername/gsd-qdrant-cli.git)

---

## [Unreleased]

### Planned Features

- [ ] Supporto per più provider vector (Pinecone, Weaviate)
- [ ] Plugin system per estendere funzionalità
- [ ] Dashboard web per gestione knowledge base
- [ ] Sync incrementale con webhook
