# Piano: Pubblicazione CLI su npm

## Obiettivo
Rendere la CLI `gsd-qdrant` pubblicabile su npm e installabile globalmente da qualsiasi utente.

---

## Passi Necessari

### 1. Preparare il Repository

**1.1 Aggiornare il repository URL**
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/gianlorenzomungiovino/gsd-qdrant-cli"
  }
}
```

**1.2 Aggiungere author e license**
```json
{
  "author": "Gianlorenzo Mungiovino",
  "license": "MIT"
}
```

**1.3 Aggiornare package.json**
- Aggiungere `files` con tutti i file necessari
- Verificare che `bin` punti al percorso corretto

### 2. Testare il Publish in Modo Sicuro

**2.1 Creare un token di publish su npm**
```bash
npm login
# Registrarsi su npm se non si ha un account
```

**2.2 Testare con --dry-run**
```bash
npm publish --dry-run
# Verifica che tutto sia corretto senza pubblicare realmente
```

**2.3 Publish su npm-alpha (opzionale)**
```bash
npm publish --tag alpha
# Publish come versione alpha per testare l'installazione
```

### 3. Verificare l'Installazione Globale

**3.1 Installare localmente**
```bash
npm install -g ./qdrant-template
# Oppure dopo publish:
npm install -g gsd-qdrant-cli
```

**3.2 Testare la CLI**
```bash
gsd-qdrant
# Dovrebbe mostrare il menu di aiuto
```

### 4. Publish Finale

**4.1 Publish su npm**
```bash
npm publish
# Publish la versione finale su npm public registry
```

**4.2 Verificare su npm**
```bash
npm view gsd-qdrant-cli
# Verificare che il package sia visibile
```

### 5. Aggiornare la Documentazione

**5.1 Aggiornare README.md**
```bash
# Aggiungere istruzioni per installare da npm:
npm install -g gsd-qdrant-cli
```

**5.2 Aggiungere CHANGELOG.md**
```markdown
## v1.0.0
- Initial release
- CLI for GSD + Qdrant setup
- Cross-project code snippet search
```

---

## Checklist di Prerequisiti

- [ ] Repository GitHub pubblico o privato
- [ ] Account npm con token valido
- [ ] Package.json corretto con tutti i metadati
- [ ] README.md aggiornato
- [ ] Test passati (`npm test`)
- [ ] Versione incrementata (es. 1.0.0)

---

## Comandi npm Utili

```bash
# Testare il publish senza pubblicare
npm publish --dry-run

# Publish come versione alpha/beta
npm publish --tag alpha

# Publish come versione finale
npm publish

# Verificare il package
npm view gsd-qdrant-cli

# Installare localmente per testare
npm install -g ./qdrant-template

# Disinstallare
npm uninstall -g gsd-qdrant-cli
```

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| `npm publish` richiede token | `npm login` per autenticarsi |
| Package name già preso | Cambiare nome del package o usare scope (`@username/gsd-qdrant-cli`) |
| Test falliscono | Risolvere i test prima di publish |
| File mancanti | Aggiungere a `files` in package.json |

---

## Prossimi Passi Dopo il Publish

1. **Aggiungere TypeScript** per migliore type safety
2. **Aggiungere integration tests** per verificare il setup completo
3. **Aggiungere performance monitoring** per tracciare l'uso
4. **Creare un plugin system** per estensioni
5. **Sviluppare una UI web** per gestire i snippet

---

**Status:** Pronto per il publish  
**Versione:** 1.0.0  
**Data:** Aprile 2026
