#!/usr/bin/env node

/**
 * GSD Knowledge Sharing Module
 * 
 * Modulo wrapper per l'integrazione nativa con GSD.
 * Fornisce le funzioni che GSD può chiamare per il knowledge sharing.
 */

const { KnowledgeSharingManager } = require('./knowledge-sharing.js');

/**
 * GSD Knowledge Sharing Provider
 * 
 * Questo modulo espone le API che GSD può chiamare.
 */
class GSDKnowledgeSharingProvider {
  constructor() {
    this.manager = new KnowledgeSharingManager();
    this.initialized = false;
  }

  /**
   * Inizializza il provider
   */
  async init() {
    if (this.initialized) return;
    await this.manager.init();
    this.initialized = true;
  }

  /**
   * Callback per hook beforeMessage
   * Viene chiamato prima di ogni risposta GSD
   */
  async onBeforeMessage(event, ctx) {
    if (!this.initialized) {
      await this.init();
    }
    return this.manager.onBeforeMessage(event, ctx);
  }

  /**
   * Genera un prompt con contesto
   * Usato per comandi CLI standalone
   */
  async buildPrompt(query, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    return this.manager.buildPrompt(query, options);
  }

  /**
   * Cerca contesto direttamente
   */
  async searchContext(query, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    return this.manager.searchContext(query, options);
  }
}

// Export singleton instance
module.exports = new GSDKnowledgeSharingProvider();
