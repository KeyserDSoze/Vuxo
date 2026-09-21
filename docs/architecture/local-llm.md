# Local LLM runtime

Vuxo tratta il modello linguistico come un servizio infrastrutturale opzionale. Il dominio non dipende da Ollama né da un modello specifico.

## Runtime iniziale

Il runtime iniziale è Ollama in Docker. In produzione la porta `11434` non viene pubblicata: soltanto i container sulla network `vuxo` possono raggiungerlo. L'API usa `http://ollama:11434/v1`, mantenendo l'adapter compatibile con una API in stile OpenAI.

Il modello è configurato tramite `VUXO_LLM_MODEL`. Il default iniziale è `qwen3:1.7b`; `qwen3:0.6b` è il profilo di emergenza per hardware molto limitato. Entrambi sono soltanto punti di partenza: la scelta definitiva deve essere validata sulla macchina reale misurando latenza, RAM/VRAM e soprattutto affidabilità delle tool call.

Il profilo base deve funzionare CPU-only. Se la GPU del server è supportata e porta un vantaggio reale si può aggiungere l'override:

```bash
docker compose --env-file docker/.env -f docker/compose.prod.yml -f docker/compose.gpu.yml up -d
```

## Profilo low-resource

I default Vuxo sono volutamente conservativi:

- un solo modello caricato (`OLLAMA_MAX_LOADED_MODELS=1`);
- una richiesta parallela per modello (`OLLAMA_NUM_PARALLEL=1`);
- context iniziale 4096 token (`OLLAMA_CONTEXT_LENGTH=4096`);
- coda limitata (`OLLAMA_MAX_QUEUE=16`);
- unload dopo un breve periodo di inattività (`OLLAMA_KEEP_ALIVE=2m`);
- funzioni cloud Ollama disabilitate (`OLLAMA_NO_CLOUD=1`).

Questi valori sono configurabili tramite `docker/.env.example`. Vanno aumentati soltanto dopo un benchmark sulla macchina reale, perché parallelismo e context più elevati aumentano il consumo di memoria.

## Adapter applicativo

`Vuxo.Application` espone `ILanguageModelGateway`; l'implementazione Ollama vive in `Vuxo.Infrastructure`. Il dominio quindi non conosce endpoint, modello o vendor. L'endpoint amministrativo `/api/admin/llm/tool-smoke` serve esclusivamente a verificare il percorso API -> modello -> tool call strutturata.

## Regola fondamentale sui tool

L'LLM non esegue tool direttamente. Produce esclusivamente una richiesta strutturata. Il backend Vuxo mantiene un registry allow-list, valida JSON Schema, autorizzazione e limiti, esegue il tool e restituisce l'esito al modello. Database, filesystem, rete interna e secret non vengono mai consegnati direttamente al modello.

Ogni ciclo LLM/tool viene tracciato tramite correlation ID e audit funzionale con context hash, modello, tool richiesto, argomenti validati, result reference/errore, durata, round e relazione causale. Il prompt raw non viene scritto nell'audit.

## Orchestrazione tool

`LanguageModelToolRegistry` contiene esclusivamente handler registrati server-side. La 0.0.1 abilita il solo `get_world_context`: accetta esattamente `worldId`, richiede contesto Administrator e rifiuta world ID diversi da quello configurato.

Il flusso è bounded da `VUXO_LLM_MAX_TOOL_ROUNDS` (default 2, clamp 1..4). Ogni proposta viene validata e autorizzata prima dell'esecuzione; tool sconosciuti, argomenti invalidi e autorizzazioni insufficienti producono error code stabili e audit di rifiuto.

## Affidabilità

L'LLM non appartiene alla readiness critica della first playable: se è offline il login, il mondo, il movimento e il gameplay autoritativo continuano a funzionare. `/health` resta indipendente; `/health/llm` segnala disabled/healthy/unavailable separatamente.

L'adapter applica timeout/cancellation, retry transitorio limitato e circuit breaker configurabile. I default production sono un retry, soglia circuit 3 fallimenti e apertura per 30 secondi. I test normali usano fake deterministici; il modello reale resta uno smoke operativo separato.

## Avvio locale

```bash
cp docker/.env.example docker/.env
# impostare almeno le password richieste
docker compose --env-file docker/.env -f docker/compose.dev.yml up -d
```

Il servizio `ollama-model-init` scarica il modello configurato nel volume persistente al primo avvio.


## Configurazione orchestrazione/resilienza

- `VUXO_LLM_MAX_TOOL_ROUNDS` — default `2`, massimo `4`;
- `VUXO_LLM_MAX_RETRIES` — default `1`, massimo `2`;
- `VUXO_LLM_RETRY_DELAY_MILLISECONDS` — default `100`;
- `VUXO_LLM_CIRCUIT_FAILURE_THRESHOLD` — default `3`;
- `VUXO_LLM_CIRCUIT_BREAK_SECONDS` — default `30`.

In produzione Ollama non pubblica porte host. Il runtime smoke CI valida sia l'assenza di porte production sia l'assenza di riferimenti diretti a Ollama nel frontend.
