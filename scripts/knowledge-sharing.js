#!/usr/bin/env node

/**
 * Knowledge Sharing Module - Native integration for GSD
 * 
 * Questo modulo fornisce l'integrazione nativa per il knowledge sharing
 * con Qdrant. Può essere chiamato come:
 * - Hook event-based (prima di ogni risposta GSD)
 * - Comandi CLI standalone
 * - Tool esterno
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const { join, relative, basename } = require('path');
const crypto = require('crypto');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
const MAX_RESULTS = parseInt(process.env.QDRANT_MAX_RESULTS || '5', 10);

/**
 * Knowledge Sharing Manager
 * Fornisce integrazione nativa per il knowledge sharing con Qdrant
 */
class KnowledgeSharingManager {
  constructor() {
    this.client = new QdrantClient({ url: QDRANT_URL });
    this.collectionName = COLLECTION_NAME;
    this.vectorName = VECTOR_NAME;
    this.embeddingModel = EMBEDDING_MODEL;
    this.maxResults = MAX_RESULTS;
    this.pipeline = null;
  }

  /**
   * Inizializza il client Qdrant e carica il modello di embedding
   */
  async init() {
    try {
      const { pipeline: createPipeline } = require('@xenova/transformers');
      this.pipeline = await createPipeline('feature-extraction', this.embeddingModel);
      console.log('[KnowledgeSharing] Embedding model loaded');
    } catch (err) {
      console.warn('[KnowledgeSharing] Transformers not available, using placeholder');
    }
  }

  /**
   * Genera embedding per un testo
   */
  async embedText(text) {
    if (this.pipeline) {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    }
    return this.generatePlaceholderEmbedding(text);
  }

  /**
   * Genera embedding placeholder (fallback)
   */
  generatePlaceholderEmbedding(content) {
    const hash = crypto.createHash('md5').update(content).digest('hex');
    const vector = new Array(1024).fill(0);
    for (let i = 0; i < 1024; i++) {
      const startIdx = (i * 4) % hash.length;
      const hashPart = hash.substring(startIdx, startIdx + 4) || hash.substring(0, 4);
      vector[i] = parseInt(hashPart, 16) / 0xffff;
    }
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0 && !Number.isNaN(norm)) {
      for (let i = 0; i < 1024; i++) vector[i] /= norm;
    }
    return vector;
  }

  /**
   * Cerca contesto rilevante da Qdrant
   * @param {string} query - Query dell'utente
   * @param {object} options - Opzioni di ricerca
   * @returns {Promise<Array>} Risultati della ricerca
   */
  async searchContext(query, options = {}) {
    const vector = await this.embedText(query);
    const limit = options.limit || this.maxResults;

    // Query a Qdrant
    const hits = await this.client.search(this.collectionName, {
      vector: { name: this.vectorName, vector },
      limit,
      with_payload: true,
      with_vector: false
    });

    // Filtra per project_id se specificato
    let filtered = hits;
    if (options.project_id) {
      filtered = hits.filter(h => h.payload.project_id === options.project_id);
    }

    return filtered.map(hit => ({
      id: hit.id,
      score: hit.score,
      payload: hit.payload,
      vector: hit.vector
    }));
  }

  /**
   * Formatta il contesto per il prompt GSD
   * @param {Array} results - Risultati della ricerca
   * @returns {string} Contesto formattato
   */
  formatContext(results) {
    if (results.length === 0) return '';

    const lines = ['\n\n=== CONTESTO DA MEMORIA CROSS-PROJECT ==='];

    for (const hit of results) {
      const payload = hit.payload;
      const type = payload.type || 'unknown';
      const summary = payload.summary || payload.source || 'No summary';
      const contentPreview = payload.content ? payload.content.substring(0, 500) : 'No content';
      
      lines.push('');
      lines.push(`• [${type}] ${summary}`);
      lines.push(`  Score: ${hit.score.toFixed(3)} | Source: ${payload.source}`);
      lines.push(`  Content: ${contentPreview}${payload.content?.length > 500 ? '...' : ''}`);
    }

    return lines.join('\n');
  }

  /**
   * Controlla se ci sono risultati rilevanti (score >= 0.3)
   */
  hasRelevantContext(results) {
    const minScore = 0.3;
    return results.some(r => r.score >= minScore);
  }

  /**
   * Callback per hook beforeMessage di GSD
   * Viene chiamato prima di ogni risposta GSD
   * @param {object} event - Evento GSD
   * @param {object} ctx - Contesto GSD
   */
  async onBeforeMessage(event, ctx) {
    // Estrai query dall'ultima richiesta utente
    const lastUserMessage = event.messages[event.messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') return;

    const query = lastUserMessage.content;
    if (!query || typeof query !== 'string') return;

    try {
      // Cerca contesto in Qdrant
      const results = await this.searchContext(query, {
        limit: this.maxResults,
        project_id: ctx.session?.projectId
      });

      // Aggiunge contesto al prompt se rilevante
      if (this.hasRelevantContext(results)) {
        const contextText = this.formatContext(results);
        ctx.systemPrompt += contextText;
        console.log(`[KnowledgeSharing] Added ${results.length} context items to prompt`);
      }
    } catch (err) {
      console.warn('[KnowledgeSharing] Failed to retrieve context:', err.message);
      // Graceful degradation - non interrompe la conversazione
    }
  }

  /**
   * Genera un prompt completo con contesto (per uso CLI standalone)
   * @param {string} query - Query dell'utente
   * @param {object} options - Opzioni
   * @returns {Promise<string>} Prompt completo
   */
  async buildPrompt(query, options = {}) {
    const results = await this.searchContext(query, options);
    
    let prompt = '=== GSD Knowledge Sharing Context ===\n\n';
    
    if (results.length > 0) {
      prompt += '## SEARCH RESULTS\n';
      prompt += `Query: "${query}"\n`;
      prompt += `Found ${results.length} results:\n\n`;
      
      results.forEach((result, i) => {
        const p = result.payload;
        prompt += `${i + 1}. [${p.type}] ${p.summary || p.source}\n`;
        prompt += `   Score: ${result.score.toFixed(3)}\n`;
        prompt += `   Source: ${p.source}\n`;
        const preview = p.content ? p.content.substring(0, 200) : 'No content';
        prompt += `   Content: ${preview}...\n\n`;
      });
    } else {
      prompt += 'No relevant context found.\n';
    }
    
    prompt += '---\n\n';
    prompt += `## USER QUERY\n${query}\n\n`;
    prompt += 'Please provide a detailed response based on the context above.';
    
    return prompt;
  }
}

// Export singleton instance
module.exports = { KnowledgeSharingManager };
