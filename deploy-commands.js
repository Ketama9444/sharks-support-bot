require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-support')
    .setDescription('Crée automatiquement la structure support Sharks FA')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('support-panel')
    .setDescription('Envoie le panel de support dans le salon actuel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Replace le panneau de gestion tout en bas du ticket'),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestion du ticket actuel')
    .addSubcommand(s => s.setName('close').setDescription('Fermer et archiver le ticket'))
    .addSubcommand(s => s.setName('claim').setDescription('Prendre en charge le ticket'))
    .addSubcommand(s => s.setName('unclaim').setDescription('Libérer la prise en charge'))
    .addSubcommand(s => s.setName('transcript').setDescription('Générer un transcript HTML'))
    .addSubcommand(s => s.setName('delete').setDescription('Supprimer définitivement le ticket'))
    .addSubcommand(s => s.setName('priority').setDescription('Changer la priorité').addStringOption(o => o.setName('niveau').setDescription('Priorité').setRequired(true).addChoices(
      { name: '🟢 Basse', value: 'low' },
      { name: '🟡 Normale', value: 'normal' },
      { name: '🟠 Haute', value: 'high' },
      { name: '🔴 Urgente', value: 'urgent' }
    )))
    .addSubcommand(s => s.setName('rename').setDescription('Renommer le salon du ticket').addStringOption(o => o.setName('nom').setDescription('Nouveau nom').setRequired(true)))
    .addSubcommand(s => s.setName('note').setDescription('Ajouter une note staff interne').addStringOption(o => o.setName('texte').setDescription('Note').setRequired(true)))
    .addSubcommand(s => s.setName('add').setDescription('Ajouter un membre au ticket').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Retirer un membre du ticket').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))),
  new SlashCommandBuilder()
    .setName('support-user')
    .setDescription('Gestion support d’un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => s.setName('blacklist').setDescription('Bloquer un utilisateur du support').addUserOption(o => o.setName('membre').setDescription('Utilisateur').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(false)))
    .addSubcommand(s => s.setName('unblacklist').setDescription('Débloquer un utilisateur').addUserOption(o => o.setName('membre').setDescription('Utilisateur').setRequired(true)))
].map(c => c.toJSON());

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('DISCORD_TOKEN, CLIENT_ID et GUILD_ID sont requis dans .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
  .then(() => console.log('✅ Commandes Sharks FA déployées.'))
  .catch(console.error);
