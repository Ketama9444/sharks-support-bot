# 🦈 Sharks FA — Bot Support MP / Tickets

Bot Discord moderne pour faire le pont entre les **MP du bot** et un **serveur Discord de support**.

## Fonctions incluses

- Support entièrement depuis les MP du bot
- Menu moderne avec catégories GTA RP
- Formulaire modal : sujet + description
- Création automatique d'un salon ticket privé
- Bridge bidirectionnel : utilisateur MP ↔ staff dans le salon
- Pièces jointes transférées
- Boutons : claim, fermeture, réouverture, transcript, suppression
- Archives automatiques
- Transcripts HTML
- Logs staff
- Priorités basse / normale / haute / urgente
- Notes internes staff
- Ajouter / retirer un membre d'un ticket
- Renommer un ticket
- Blacklist / unblacklist support
- Panel public avec bouton vers les MP du bot
- Présence personnalisée Sharks FA
- Logo Sharks FA intégré
- Stockage JSON persistant dans `data/database.json`

## Catégories de tickets déjà configurées

1. 🦈 Support général
3. 🛠️ Bug en jeu
4. 🚨 Report joueur
5. 🏢 Légal / Entreprise
6. 🔫 Illégal / Faction
7. 💳 Boutique / Paiement
8. 💰 Remboursement
9. 👮 Staff / Recrutement
10. 🤝 Partenariat

## Installation

### 1. Installer Node.js 18+

```bash
npm install
```

### 2. Créer `.env`

Copie `.env.example` en `.env`, puis remplis :

```env
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
STAFF_ROLE_ID=...
ADMIN_ROLE_ID=...
```

### 3. Developer Portal

Dans le portail développeur Discord, active les intents nécessaires au bot selon la configuration de ton application. Le code utilise : Guilds, GuildMessages, DirectMessages et MessageContent.

Permissions conseillées lors de l'invitation :

- View Channels
- Send Messages
- Manage Channels
- Manage Messages
- Read Message History
- Attach Files
- Embed Links

Le plus simple pour le premier setup est de donner Administrateur au bot, exécuter `/setup-support`, puis réduire ses permissions si tu le souhaites.

### 4. Déployer les commandes

```bash
node deploy-commands.js
```

### 5. Lancer

```bash
npm start
```

### 6. Dans le serveur support

Exécute :

```text
/setup-support
```

Le bot crée automatiquement :

```text
📨 SUPPORT — OUVERTS
🗃️ SUPPORT — ARCHIVES
   #support-logs
   #support-transcripts
```

Les IDs créés sont automatiquement enregistrés dans `config.js`.

Ensuite, dans le salon où tu veux présenter le support :

```text
/support-panel
```

## Fonctionnement

Un joueur envoie un MP au bot → le bot affiche les catégories → le joueur sélectionne une catégorie → un formulaire s'ouvre → un salon privé est créé dans `📨 SUPPORT — OUVERTS`.

Les messages envoyés par le joueur en MP apparaissent dans le ticket. Les réponses normales du staff dans le ticket sont renvoyées au joueur en MP.

À la fermeture, le salon passe dans les archives. Un transcript HTML peut être généré à tout moment.

## Commandes staff

```text
/ticket close
/ticket reopen
/ticket claim
/ticket unclaim
/ticket transcript
/ticket delete
/ticket priority
/ticket rename
/ticket note
/ticket add
/ticket remove
/support-user blacklist
/support-user unblacklist
```

## Personnalisation

Tout le thème est dans `config.js` : nom, logo, couleur, catégories de tickets et IDs des catégories Discord.

Logo déjà configuré :
`https://i.ibb.co/DgHDx91G/aaaimage.png`

Couleur par défaut : `#021F49`.


## Version v3 — Archives et interface moderne

- Une catégorie Discord est créée automatiquement pour chaque type de ticket.
- Aucun salon de ticket fermé n'est conservé dans une catégorie d'archives.
- À la fermeture, un transcript HTML est généré automatiquement et envoyé dans l'unique salon `#transcripts`, puis le salon du ticket est supprimé.
- Le ticket possède un panneau de contrôle unique avec boutons et menu de gestion avancée.
- Claim, priorité, libération, renommage et confirmations sont gérés sans polluer la conversation.
- Le menu de gestion avancée permet de changer la priorité, libérer le ticket, renommer le salon et ajouter une note interne.

Après remplacement des fichiers, relancer aussi `node deploy-commands.js` car la commande `/ticket reopen` a été retirée.

## v4 — Réponses internes & pastille d'attente

- Si un staff utilise la fonction **Répondre** de Discord sur le message d'un autre staff ou sur un message système/bot, cette réponse reste interne au salon et n'est pas envoyée au joueur. Le bot ajoute une réaction 🔒 pour indiquer qu'elle est interne.
- Exception : un staff peut répondre au message MP d'un joueur relayé par le bot ; celui-ci est reconnu par son footer `MP utilisateur` et la réponse est bien transmise au joueur.
- Chaque ticket ouvert reçoit une pastille automatique dans son nom :
  - 🟢 moins de 5 minutes ;
  - 🟠 de 5 à 15 minutes incluses ;
  - 🔴 au-delà de 15 minutes.
- Les pastilles sont vérifiées automatiquement toutes les 60 secondes et restaurées après un redémarrage du bot.
- Le panneau du ticket indique également le temps d'attente avec un timestamp Discord relatif.

## v5 — Relais webhook joueur & DM staff naturels

- Chaque ticket crée son propre **webhook temporaire**.
- Les messages reçus en MP du joueur sont publiés dans le ticket par ce webhook avec :
  - le pseudo Discord du joueur ;
  - sa photo de profil ;
  - son texte comme message Discord normal ;
  - ses pièces jointes comme pièces jointes normales.
- Le webhook est supprimé automatiquement quand le ticket est fermé ou supprimé.
- Si le webhook est supprimé manuellement pendant que le ticket est ouvert, le bot tente de le recréer automatiquement au prochain MP du joueur.
- Les réponses du staff envoyées au joueur sont désormais de simples **DM Discord normaux**, sans embed.
- La logique de réponses internes est conservée : répondre à un autre staff/bot reste interne, tandis que répondre au message webhook du joueur est transmis au joueur.

### Permission supplémentaire

Le bot doit posséder **Manage Webhooks / Gérer les webhooks** dans les salons de tickets. Si le bot conserve la permission Administrateur, aucune modification n'est nécessaire.

### Sécurité

Le token du webhook temporaire est conservé dans `data/database.json` pour permettre au relais de continuer après un redémarrage. Ne publie donc pas ce fichier sur GitHub et ne le partage pas.


## Panneau de gestion du ticket
Le panneau n'est plus déplacé automatiquement après chaque message. Utilisez `/help` dans un ticket pour supprimer l'ancien panneau et le recréer tout en bas du salon. Après ajout de cette commande, exécutez une fois `node deploy-commands.js`.
