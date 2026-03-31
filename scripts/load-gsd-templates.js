const { QdrantClient } = require('@qdrant/js-client-rest');
const { readFile, readdir } = require('fs/promises');
const { join, basename } = require('path');
const { pipeline } = require('@xenova/transformers');
const crypto = require('crypto');

const TEMPLATE_DIR = join(__dirname, '..');
const COLLECTION_NAME = 'gsd-setup-templates';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 384);

async function load() {
  const client = new QdrantClient({ url: QDRANT_URL });

  try {
    const collection = await client.getCollection(COLLECTION_NAME);
    const existingVectors = collection?.config?.params?.vectors;
    const namedVectorExists = existingVectors && !Array.isArray(existingVectors) && existingVectors[VECTOR_NAME];
    const unnamedVectorExists = existingVectors && !Array.isArray(existingVectors) && existingVectors.size === EMBEDDING_DIMENSIONS;

    if (unnamedVectorExists && !namedVectorExists) {
      throw new Error(`Collection ${COLLECTION_NAME} exists with unnamed vectors. Recreate it with named vector ${VECTOR_NAME}.`);
    }

    console.log(`Collection ${COLLECTION_NAME} exists`);
  } catch (e) {
    if (e.status === 404) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          [VECTOR_NAME]: { size: EMBEDDING_DIMENSIONS, distance: 'Cosine' },
        },
      });
      console.log(`Created collection ${COLLECTION_NAME}`);
    } else {
      throw e;
    }
  }

  console.log('Loading embedding model...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const files = await walkDir(TEMPLATE_DIR);
  console.log(`Found ${files.length} files to index`);

  const points = [];
  for (const filePath of files) {
    const relPath = filePath.replace(TEMPLATE_DIR, '').replace(/^[/\\]/, '');
    const content = await readFile(filePath, 'utf-8');
    const output = await embedder(content, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);

    points.push({
      id: crypto.createHash('md5').update(relPath).digest('hex'),
      vector: {
        [VECTOR_NAME]: vector,
      },
      payload: {
        type: 'gsd-template',
        scope: 'template',
        filename: basename(filePath),
        path: relPath.replace(/\\/g, '/'),
        content,
        document: content,
        vectorName: VECTOR_NAME,
      },
    });

    if (points.length % 10 === 0) process.stdout.write('.');
  }
  console.log(`\nIndexed ${points.length} documents`);

  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    await client.upsert(COLLECTION_NAME, { points: points.slice(i, i + batchSize) });
  }

  console.log('✅ Templates loaded into Qdrant collection: ' + COLLECTION_NAME);
}

async function walkDir(dir, list = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walkDir(full, list);
    } else if (entry.isFile()) {
      list.push(full);
    }
  }
  return list;
}

load().catch(err => {
  console.error('❌ Failed to load templates:', err);
  process.exit(1);
});
