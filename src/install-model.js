#!/usr/bin/env node

/**
 * Post-install model downloader
 *
 * Scarica il modello embedding durante npm install (postinstall hook),
 * così che il comando "setup" sia immediato.
 *
 * Il download è bloccante: se fallisce, l'installazione del pacchetto
 * continua comunque — il comando setup scaricherà il modello on-demand.
 */

const { join } = require('path');

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/bge-m3';
const TASK = 'feature-extraction';

(async () => {
  try {
    const mod = require('@xenova/transformers');
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    // Set cache BEFORE pipeline() — env.cacheDir defaults to node_modules/.cache/
    mod.env.cacheDir = join(home, '.cache', 'huggingface', 'hub');
    const pipe = await mod.pipeline(TASK, MODEL_ID);
    await pipe('Hello, world.');
  } catch (_) {
    // setup command will retry on-demand
  }
})();
