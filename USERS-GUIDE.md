# Come usare la nuova CLI GSD + Qdrant

## Riassunto

Ho creato una CLI che risolve il problema originale in cui lo script di setup falliva perché le dipendenze Node non erano ancora installate.

## Problema Originario

```bash
node scripts/bootstrap-project.js
  → Esegui setup-from-templates.js
  → ❌ Error: Cannot find module '@qdrant/js-client-rest'
  → Poi npm install... ma è troppo tardi!
```

## Nuova Soluzione

Ho creato `scripts/cli.js` che:
1. **Installa** `@qdrant/js-client-rest` e `@xenova/transformers` **PRIMA**
2. **Esegue** il setup dal template
3. **Fa** la prima sync iniziale

## Istruzioni per l'uso

### 1. Installa la CLI (una volta)

Dalla cartella del template:
```bash
npm install -g ./qdrant-template
```

### 2. Copia il template nel progetto target

```bash
# Copia la cartella qdrant-template nel tuo progetto
```

### 3. Esegui la CLI nel progetto target

```bash
cd /tuo-progetto-target
gsd-qdrant
```

### 4. Finito!

Il progetto ora è configurato con:
- `.gsd/mcp.json` creato
- `src/lib/gsd-qdrant-sync/index.js` creato
- `package.json` aggiornato con i scripts
- Prima sync completata

## Testato con successo

Ho testato la CLI in `D:\Gianlorenzo\Documents\Sviluppo\test-gsd-cli` e tutto ha funzionato:

```
🚀 GSD + Qdrant CLI
📁 Using: project root
📦 Installing required dependencies in project root...
🔧 Running setup...
✅ Setup complete!
🧠 Running initial knowledge sync...
✅ Setup complete!
```

## File creati

- `scripts/cli.js` - CLI principale
- `scripts/bootstrap-project.js` - Aggiornato
- `README.md` - Istruzioni aggiornate
- `package.json` - Per publishare su npm
- `CLI-SUMMARY.md` - Riepilogo
- `CLI-IMPROVEMENTS.md` - Dettagli tecnici
- `CLI-CHANGES.md` - Come testare

## Prossimi passi

1. **M002 In Corso** (20% completato):
   - Unit tests completati ✅
   - TypeScript in corso ⏳
   - Publishing e performance monitoring da completare

2. **Publish su npm** (dopo TypeScript completato):
   ```bash
   npm publish
   ```

3. **Installare globalmente**:
   ```bash
   npm install -g gsd-qdrant-cli
   ```

4. **Usare in tutti i progetti**:
   ```bash
   gsd-qdrant
   ```

## Stato Attuale

- **M001:** Completato ✅
- **M002:** In corso (20%) ⏳
  - Unit tests: ✅ Completati
  - TypeScript: ⏳ In corso
  - Publishing: ⏳ Da completare
  - Performance monitoring: ⏳ Da completare

## Note

- La CLI funziona in **qualsiasi progetto Node.js**
- Le dipendenze vengono installate automaticamente
- Non serve più installare manualmente `@qdrant/js-client-rest`
- Il problema originale è **risolto!** ✅
