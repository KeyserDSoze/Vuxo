# Personaggio giocatore

La versione 0.0.1 parte dal livello **0**.

Il giocatore distribuisce esattamente **10 punti** tra:

- Forza
- Destrezza
- Intelligenza
- Costituzione
- Fortuna
- Fede

Per la prima versione solo due statistiche hanno effetti di gameplay:

- HP massimi di base = Costituzione × 10.
- HP correnti persistiti da #75: partono dal massimo a creazione/migrazione e sono letti in modo owner-only nel Rifugio; non esistono ancora cure o danni che li modificano.
- `Moltiplicatore velocità = 1 + (Destrezza × 0,10)`.

Le altre statistiche sono persistite e versionate ma non hanno ancora effetti.

L'editor iniziale prevede nome, capelli/colore capelli, viso, corporatura, pelle, maglia, pantaloncini o gonna, scarpe e relativi colori.
