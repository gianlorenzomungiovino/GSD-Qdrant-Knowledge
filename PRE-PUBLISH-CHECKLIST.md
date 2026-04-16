# Pre-publish checklist

Ciclo consigliato prima di pubblicare `gsd-qdrant-knowledge` su npm.

## 1. Allinea la versione

Aggiorna `package.json` e `CHANGELOG.md` alla versione che vuoi pubblicare.

## 2. Verifica sintassi locale

```bash
node --check src/cli.js
node --check src/auto-retrieve-mcp.js
node --check src/gsd-qdrant-mcp/index.js
node --check src/gsd-qdrant-template.js
```

## 3. Crea il tarball reale

```bash
npm pack
```

Non testare solo il repo locale: testa sempre il tarball generato.

## 4. Crea un sandbox pulito

```bash
mkdir sandbox-test
cd sandbox-test
npm init -y
```

## 5. Installa il tarball nel sandbox

```bash
npm install /percorso/assoluto/gsd-qdrant-knowledge-X.Y.Z.tgz
```

## 6. Test minimo del CLI

```bash
node ./node_modules/gsd-qdrant-knowledge/src/cli.js --version
```

## 7. Test bootstrap

Con o senza `.gsd/`, esegui:

```bash
node ./node_modules/gsd-qdrant-knowledge/src/cli.js
```

Verifica che vengano creati:
- `gsd-qdrant-knowledge/`
- `gsd-qdrant-knowledge/.qdrant-sync-state.json`
- `gsd-qdrant-knowledge/index.js`
- `gsd-qdrant-knowledge/auto-retrieve-mcp.js`
- `gsd-qdrant-knowledge/mcp.json`
- `.mcp.json`

Verifica anche che:
- senza `.gsd/` il tool indicizzi comunque il codice
- con `.gsd/` il tool indicizzi docs + code

## 8. Test retrieving

Verifica che il server MCP parta e che il tool `auto_retrieve` risponda.

Esempio:

```bash
node ./node_modules/gsd-qdrant-knowledge/src/gsd-qdrant-mcp/index.js
```

Oppure testa tramite client MCP/GSD nel progetto sandbox.

Controlla che:
- la config in `.mcp.json` punti al server giusto
- il retrieval favorisca contenuti cross-project senza escludere il progetto corrente

## 9. Test uninstall

```bash
node ./node_modules/gsd-qdrant-knowledge/src/cli.js uninstall
```

Verifica che rimuova:
- `gsd-qdrant-knowledge/`
- entry `gsd-qdrant` da `.mcp.json`
- entry `gsd-qdrant-knowledge/` da `.gitignore`

## 10. Dry run npm

```bash
npm publish --dry-run
```

Controlla che nel payload siano presenti almeno:
- `src/cli.js`
- `src/auto-retrieve-mcp.js`
- `src/gsd-qdrant-mcp/index.js`
- `src/install-gsd-extension.js`
- `src/setup-from-templates.js`
- `README.md`
- `GSD-QDRANT-SETUP.md`
- `CHANGELOG.md`

## 11. Solo a questo punto: publish

```bash
npm publish
```

Se durante i test trovi un problema, correggilo e riparti da `npm pack`.
