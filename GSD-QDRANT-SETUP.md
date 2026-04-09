# GSD-QDRANT-SETUP

Guida rapida al setup locale della CLI e di Qdrant.

## 1. Installa la CLI

Da npm:

```bash
npm install -g gsd-qdrant-cli
```

Oppure in locale dal repository:

```bash
npm install -g .
```

Verifica:

```bash
gsd-qdrant --version
```

## 2. Avvia Qdrant

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

## 3. Esegui il bootstrap nella root del progetto

```bash
gsd-qdrant
```

Il comando:
- crea `gsd-qdrant/`
- crea/valida le collection `<project>-docs` e `<project>-snippets`
- sincronizza `.gsd/` e il codice del progetto

## 4. Verifica rapida

Collection presenti:

```bash
curl -s http://localhost:6333/collections
```

Collection popolate:

```bash
curl -s "http://localhost:6333/collections/<project>-docs/points/scroll" -H "Content-Type: application/json" -d '{"limit": 1}'
curl -s "http://localhost:6333/collections/<project>-snippets/points/scroll" -H "Content-Type: application/json" -d '{"limit": 1}'
```

## 5. Search contestuale

```bash
gsd-qdrant snippet search "component button" --context
gsd-qdrant snippet search "prendi il componente X dal progetto Y" --context
```

## Stato del flusso

- il tool è project-wide
- non distingue più frontend/backend come flusso principale
- `docs` contiene contesto `.gsd`
- `snippets` contiene codice e riferimenti al contesto GSD rilevante
- il comando base evita reinstallazioni inutili quando le dipendenze minime sono già disponibili

## Versione

Versione di lavoro allineata: `1.0.7`
