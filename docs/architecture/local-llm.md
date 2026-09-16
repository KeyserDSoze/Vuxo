# Local LLM runtime

Vuxo tratta il modello linguistico come un servizio infrastrutturale opzionale. Il dominio non dipende da Ollama né da un modello specifico.

## Runtime iniziale

Il runtime iniziale è Ollama in Docker. In produzione non viene pubblicata la porta `11434`: soltanto i container sulla network `vuxo` possono raggiungerlo. L'API usa `http://ollama:11434/v1`, mantenendo l'adapter compatibile con una API in stile OpenAI.

Il modello è configurato tramite `VUXO_LLM_MODEL`. Il default iniziale è `qwen3:1.7b`; `qwen3:0.6b` è il profilo di emergenza per hardware molto limitato. Il modello deve supportare tool calling. La scelta definitiva va validata sulla macchina reale con un piccolo benchmark di latenza, RAM/VRAM e accuratezza dei tool.

Il profilo base funziona CPU-only. Se la GPU del server è supportata e porta un vantaggio reale si può aggiungere l'override:

```bash
docker compose -f docker/compose.prod.yml -f docker/compose.gpu.yml up -d
```

## Regola fondamentale sui tool

L'LLM non esegue tool direttamente. Produce esclusivamente una richiesta strutturata. Il backend Vuxo mantiene un registry allow-list, valida JSON Schema, autorizzazione e limiti, esegue il tool e restituisce l'esito al modello. Database, filesystem, rete interna e secret non vengono mai consegnati direttamente al modello.

Ogni ciclo LLM/tool dovrà essere tracciato tramite correlation ID e audit funzionale con almeno: modello, versione/configurazione, hash del contesto, tool richiesto, argomenti validati, risultato/errore, durata e relazione causale con l'evento di gioco.

## Affidabilità

L'LLM non appartiene alla readiness critica della first playable: se è offline il login, il mondo, il movimento e il gameplay autoritativo devono continuare a funzionare. Il backend applicherà timeout e cancellation e userà un fake deterministico negli unit test.

## Avvio locale

```bash
cp docker/.env.example docker/.env
# impostare almeno le password richieste
docker compose --env-file docker/.env -f docker/compose.dev.yml up -d
```

Il servizio `ollama-model-init` scarica il modello configurato nel volume persistente al primo avvio.
