# Sharks Support + SPY6 — Northflank Combined

Un seul service Northflank lance deux processus Node indépendants :

- `SHARKS-SUPPORT` avec `DISCORD_TOKEN`
- `SPY6` avec `BOT_TOKENS`

Ils utilisent des bots Discord différents et ne partagent pas leurs tokens.

## Stockage persistant

Monter **un seul volume Northflank** sur :

`/app/data`

Le bot support écrit dans :

`/app/data/support/database.json`
`/app/data/support/transcripts/`

SPY6 écrit dans :

`/app/data/spy6/state.json`

Le premier lancement du bot support initialise sa base persistante depuis `support/seed/database.json` si le volume est vide.

## Variables Northflank

Configurer au minimum :

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `STAFF_ROLE_ID`
- `ADMIN_ROLE_ID`
- `BOT_TOKENS`
- `OWNER_IDS`
- `LOG_CATEGORY_NAME=SPY6 LOGS`
- `DATA_ROOT=/app/data`

Ne jamais mettre les tokens dans GitHub.

## Démarrage

`npm start`

Le launcher démarre les deux processus et redémarre uniquement celui qui tombe.
