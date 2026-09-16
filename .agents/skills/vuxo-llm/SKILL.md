---
name: vuxo-llm
description: Integrate or change Vuxo's local LLM and tool-calling flows while keeping the model replaceable, non-authoritative, private to the backend and safe for low-resource hosts.
---

# Vuxo LLM skill

Use this skill for prompts, model gateways, Ollama/container changes, tool calling, narrative generation and LLM-assisted world/quest systems.

## Core boundary

The LLM is a creative/planning component, never an authority. It cannot directly decide or mutate authoritative player/game state.

Application code depends on `ILanguageModelGateway` (or its evolved equivalent), not Ollama-specific APIs. Ollama is an infrastructure adapter and may be replaced later.

## Tool calling

The safe execution sequence is:

1. Backend builds a minimal context without secrets.
2. Model returns prose and/or proposed structured tool call.
3. Backend resolves tool name against a server-side allow-list.
4. Backend validates JSON/schema and domain constraints.
5. Backend authorizes the operation for the current identity/context.
6. Backend executes the tool itself.
7. Game-affecting result is persisted/audited.
8. Optional tool result is returned to the model for another bounded round.

Never give the model direct database, filesystem, Docker socket, secret-store or unrestricted network access.

Bound tool loops with configurable maximum rounds and timeouts.

## Auditability

For player-affecting generated content capture, as applicable:

- player/party/world IDs;
- canonical rule/template/generator version;
- model name/version if available;
- prompt/context hash rather than secrets or unnecessary raw private data;
- tool name and validated arguments;
- execution result/reference;
- seed for deterministic components;
- correlation and causation IDs;
- locale of rendered narrative.

The model's wording is presentation. Rewards, eligibility, IDs, probabilities and state transitions come from backend rules/tools.

## Reliability

- Core game flow must continue if the LLM is offline.
- Use timeout + cancellation; retries only when safe and bounded.
- Provide deterministic fake gateways in unit tests.
- Treat malformed JSON, missing tool calls and model refusal as normal failure modes.
- Prefer asynchronous/non-critical generation where gameplay does not need immediate output, but never hide authoritative state transitions behind an untracked background call.

## Low-resource runtime

Production currently targets Ollama in Docker with a small configurable model. Defaults should remain conservative:

- one loaded model;
- parallelism 1 unless measured otherwise;
- bounded context and queue;
- short keep-alive/unload strategy;
- CPU-only must remain viable;
- GPU is an optional Compose override, not a production requirement.

Do not increase model size/context/parallelism without documenting expected RAM/VRAM impact and measuring the actual host.

## Testing

Cover at least:

- successful structured tool proposal;
- tool not allow-listed;
- invalid/missing arguments;
- authorization rejection;
- timeout/cancellation;
- LLM offline graceful degradation;
- fake gateway deterministic behavior;
- no public route from frontend to Ollama.
