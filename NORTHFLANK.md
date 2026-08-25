# Northflank — configuration du service existant sharks-bot

1. Remplacer le contenu du dépôt GitHub `sharks-support-bot` par ce projet.
2. Le service Northflank existant doit build depuis ce dépôt, branche `main`.
3. Build avec le `Dockerfile` à la racine.
4. Garder **1 replica**.
5. Ajouter un volume persistant et le monter sur `/app/data`.
6. Ajouter les variables runtime indiquées dans `.env.example`.
7. Déployer.

Dans les logs, vérifier les lignes :

- `[LAUNCHER] ▶ Démarrage SHARKS-SUPPORT`
- `[LAUNCHER] ▶ Démarrage SPY6`

Les deux bots doivent ensuite apparaître connectés sur Discord.
