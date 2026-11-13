# Autenticazione Vuxo

## Identità interna

Vuxo usa un proprio identificatore giocatore indipendente dal provider social. Una stessa identità interna potrà essere collegata a Microsoft e/o Google.

## Provider

La milestone 0.0.1 prevede Microsoft e Google. Il frontend usa Authorization Code + PKCE / SDK ufficiali; il backend verifica il token/risultato del provider, collega l'identità esterna e rilascia la sessione Vuxo usata da REST e SignalR.

Non vanno memorizzati access token Google/Microsoft come identità permanente del giocatore.

## Mock login

In Development/Test è presente un login mock con ruoli:

- `User`
- `GameMaster`
- `Administrator`

In Production `Auth:EnableMockLogin` deve restare `false`.

## Conservazione del token di sessione (decisione aperta)

Oggi il JWT Vuxo è in `localStorage` (`vuxo.accessToken`) e viaggia come `Authorization: Bearer` e come `access_token` per SignalR. Un XSS lo renderebbe leggibile e riutilizzabile fino alla scadenza (default 480 minuti). Il rischio è mitigato da: nessun `dangerouslySetInnerHTML`, nessun redirect controllato dall'utente, link esterni solo da dati server validati e scadenza breve.

**Perché non è stato migrato a cookie `HttpOnly`.** Frontend (`vuxo.quest`) e API (`api.vuxoapi.xyz`) sono su *registrable domain* diversi: il cookie sarebbe di terze parti (`SameSite=None; Secure`), bloccato o partizionato da Safari e Firefox e in progressivo irrigidimento su Chrome. Non è verificabile con i test E2E (che usano mock) né con un login reale in CI.

**Prerequisiti per procedere** (richiedono approvazione esplicita, perché `AGENTS.md` fissa gli endpoint canonici):
1. API sotto lo stesso sito del frontend (es. `api.vuxo.quest`), così il cookie è first-party con `SameSite=Lax`;
2. cookie `HttpOnly; Secure` emesso da `/api/auth/social`, protezione CSRF (token o header personalizzato + controllo `Origin`) sulle mutazioni, `AllowCredentials` già presente nel CORS;
3. SignalR autenticato dal cookie (niente `access_token` in query), logout che lo invalida lato server;
4. aggiornamento di tutti i test che oggi iniettano `vuxo.accessToken`.

**Content-Security-Policy.** GitHub Pages non permette header; una `<meta http-equiv>` non supporta `report-only` e rischia di rompere Google Identity Services e MSAL in modo non rilevabile dai mock. Va introdotta solo insieme a un test con provider reali o a un host che consenta header (es. Cloudflare davanti a Pages).

## Configurazione ancora da fornire

- Microsoft tenant/client ID e redirect URI;
- Google client ID e redirect URI/origin;
- URL pubblico API;
- URL pubblico GitHub Pages.

Nessun secret reale viene versionato.
