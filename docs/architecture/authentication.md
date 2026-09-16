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

## Configurazione ancora da fornire

- Microsoft tenant/client ID e redirect URI;
- Google client ID e redirect URI/origin;
- URL pubblico API;
- URL pubblico GitHub Pages.

Nessun secret reale viene versionato.
