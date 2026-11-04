---
name: vuxo-release
description: Prepare a Vuxo release/version change by bumping the canonical version, synchronizing package metadata, updating patch notes, validating CI and preserving deployment compatibility.
---

# Vuxo release skill

Use this skill whenever a change creates a new released version.

## Source of truth

`/VERSION` is the canonical Vuxo version. During early development use `0.0.x` patch increments unless the task explicitly calls for another versioning step.

## Required release change set

A release/version bump is incomplete unless the same change set contains:

1. updated `/VERSION`;
2. synchronized frontend/package/application version metadata where it is committed rather than generated;
3. `docs/patch-notes/<new-version>.md` describing what changed;
4. version/build metadata still exposing version, commit SHA and build timestamp;
5. passing backend and frontend tests relevant to the release;
6. migrations/config/deployment notes for any operationally incompatible change.

Never overwrite historical patch notes for a different released version to describe a new one.

## Patch-note structure

Use concise sections when applicable:

- Player-visible changes
- Gameplay
- UI / accessibility / i18n
- Backend / realtime
- Infrastructure / deployment
- Tests / quality
- Known limitations

Write patch notes for someone trying to understand what changed between versions, not as a raw commit log.

## Before bumping

- Check the current `VERSION` and existing patch-note filenames.
- Search for other committed version literals that must remain synchronized.
- Check pending database migrations and runtime configuration changes.
- Confirm secrets are referenced by name only, never copied into docs.

## Validation

Run the full release validation:

```bash
dotnet restore Vuxo.sln
dotnet build Vuxo.sln -c Release --no-restore -p:VersionPrefix=$(cat VERSION)
dotnet test Vuxo.sln -c Release --no-build
cd src/frontend
npm install
npm run build
npm run test:e2e
```

After the change reaches GitHub, inspect Actions and do not call a release healthy while required CI jobs are failing.

## Deployment notes

- Frontend production URL: `https://vuxo.app`.
- API production URL: `https://api.vuxoapi.xyz`.
- PostgreSQL schema migrations and PostgreSQL server major upgrades are separate operations.
- LLM runtime/model changes must not make core API readiness depend on the model unless explicitly designed that way.
