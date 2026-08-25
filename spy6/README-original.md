# SPY6 // INTELLIGENCE NETWORK v4

Thème **blacksite / cyber-intelligence / cyan fluo** pour SPY6, basé sur des bots Discord officiels.

## Installation Windows

1. Lance `install.bat`.
2. Ouvre `.env` et renseigne `BOT_TOKENS` et `OWNER_IDS`.
3. Active **Server Members Intent** et **Message Content Intent** pour chaque bot dans le Discord Developer Portal.
4. Ajoute les bots sur les serveurs qu'ils doivent surveiller, avec les permissions nécessaires.
5. Lance `start.bat`.

## Commandes

- `/spy id:<ID>` : ajoute une cible et crée son canal `target-*` si le BLACKSITE est déjà déployé.
- `/unspy id:<ID>` : retire la cible et supprime son canal.
- `/spylist` : affiche la base des cibles.
- `/spysetup` : crée/déplace `⌬ SPY6・BLACKSITE` et tous les canaux de cibles.
- `/spybot` : affiche l'état des nœuds/bots connectés et du nœud actif.
- `/spyowner add id:<ID>` : donne la clearance owner.
- `/spyowner remove id:<ID>` : retire une clearance dynamique.
- `/spyowner list` : affiche les owners ROOT et dynamiques.

## Interceptions

Lorsqu'une cible est citée ou mentionnée, l'interception est envoyée dans son canal via webhook. Le webhook utilise le **pseudo affiché** et la **photo de profil** de l'auteur du message source, puis affiche un embed `INTERCEPTED TRANSMISSION` avec la cible, le serveur, le canal, les IDs et le lien du message original.

Discord conserve l'indication webhook/BOT : il ne s'agit donc pas d'une connexion au compte de l'auteur.

Les cibles présentes sur le serveur BLACKSITE n'ont qu'un accès **lecture seule à leur propre canal**.

## Persistance

`data/state.json` conserve les cibles, owners dynamiques, salons, webhooks et serveur de setup après redémarrage.
