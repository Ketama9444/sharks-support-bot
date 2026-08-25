const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const { success, error, info, CYAN } = require('./theme');
const {
  fetchUserFromClients,
  ensureTargetChannel,
  setupGuild,
  grantOwnerAccess,
  allOwnerIds,
  envOwnerIds
} = require('./spyManager');

const commandBuilders = [
  new SlashCommandBuilder()
    .setName('spy')
    .setDescription('Ajoute un utilisateur à la surveillance SPY6')
    .addStringOption(o => o.setName('id').setDescription('ID Discord à surveiller').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unspy')
    .setDescription('Retire un utilisateur de la surveillance SPY6')
    .addStringOption(o => o.setName('id').setDescription('ID Discord à retirer').setRequired(true)),
  new SlashCommandBuilder()
    .setName('spylist')
    .setDescription('Affiche toutes les personnes surveillées'),
  new SlashCommandBuilder()
    .setName('spysetup')
    .setDescription('Déploie ou déplace le BLACKSITE SPY6 sur ce serveur'),
  new SlashCommandBuilder()
    .setName('spybot')
    .setDescription('Affiche l’état de tous les bots SPY6'),
  new SlashCommandBuilder()
    .setName('spyowner')
    .setDescription('Gère les owners SPY6')
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('Ajoute un owner SPY6')
      .addStringOption(o => o.setName('id').setDescription('ID Discord du nouvel owner').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('Retire un owner SPY6')
      .addStringOption(o => o.setName('id').setDescription('ID Discord de l’owner à retirer').setRequired(true)))
    .addSubcommand(sc => sc
      .setName('list')
      .setDescription('Affiche tous les owners SPY6'))
];

const commandData = commandBuilders.map(c => c.toJSON());

function isAuthorized(interaction, state) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || allOwnerIds(state).includes(interaction.user.id);
}

async function registerCommandsForGuild(client, guild) {
  if (!client.isReady()) return;
  try {
    await guild.commands.set(commandData);
    console.log(`⚡ Commandes synchronisées : ${guild.name}`);
  } catch (err) {
    console.error(`❌ Commandes ${guild.name}:`, err.message);
  }
}

async function handleInteraction({ interaction, state, saveState, botRecords, getActiveClient }) {
  if (!interaction.isChatInputCommand()) return;
  if (!['spy', 'unspy', 'spylist', 'spysetup', 'spybot', 'spyowner'].includes(interaction.commandName)) return;

  if (!isAuthorized(interaction, state)) {
    return interaction.reply({ embeds: [error('ACCÈS REFUSÉ', 'Tu dois être **owner SPY6** ou **Administrateur** du serveur.')], ephemeral: true });
  }

  const activeClient = getActiveClient();
  if (!activeClient?.isReady()) {
    return interaction.reply({ embeds: [error('CORE OFFLINE', 'Aucun bot SPY6 n’est actuellement opérationnel.')], ephemeral: true });
  }

  if (interaction.commandName === 'spyowner') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const envOwners = envOwnerIds();
      const dynamicOwners = state.owners || [];
      const all = allOwnerIds(state);
      const description = all.length
        ? all.map((id, i) => {
            const source = envOwners.includes(id) ? 'ROOT (.env)' : 'DYNAMIQUE';
            return `**${i + 1}.** <@${id}> • \`${id}\` • **${source}**`;
          }).join('\n')
        : 'Aucun owner configuré.';

      const embed = new EmbedBuilder()
        .setColor(CYAN)
        .setTitle('⌬ SPY6 // CLEARANCE DATABASE')
        .setDescription(description)
        .setFooter({ text: `${all.length} owner(s) • ROOT owners protégés` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const id = interaction.options.getString('id', true).trim();
    if (!/^\d{15,22}$/.test(id)) {
      return interaction.reply({ embeds: [error('ID INVALIDE', 'Entre un ID Discord numérique valide.')], ephemeral: true });
    }

    if (sub === 'add') {
      if (allOwnerIds(state).includes(id)) {
        return interaction.reply({ embeds: [info('DÉJÀ OWNER', `<@${id}> est déjà owner SPY6.`)], ephemeral: true });
      }

      state.owners.push(id);
      saveState(state);

      if (state.setupGuildId && state.categoryId) {
        const guild = activeClient.guilds.cache.get(state.setupGuildId)
          || await activeClient.guilds.fetch(state.setupGuildId).catch(() => null);
        if (guild) await grantOwnerAccess(guild, state, id, true).catch(() => null);
      }

      return interaction.reply({ embeds: [success('OWNER AJOUTÉ', `<@${id}> peut maintenant utiliser **toutes les commandes SPY6** et accéder aux logs.`)], ephemeral: true });
    }

    if (sub === 'remove') {
      if (envOwnerIds().includes(id)) {
        return interaction.reply({ embeds: [error('OWNER ROOT', 'Cet owner est défini dans `OWNER_IDS` du `.env`. Retire-le du `.env` pour le supprimer.')], ephemeral: true });
      }

      if (!(state.owners || []).includes(id)) {
        return interaction.reply({ embeds: [error('INTROUVABLE', `<@${id}> n’est pas un owner dynamique SPY6.`)], ephemeral: true });
      }

      state.owners = state.owners.filter(ownerId => ownerId !== id);
      saveState(state);

      if (state.setupGuildId && state.categoryId) {
        const guild = activeClient.guilds.cache.get(state.setupGuildId)
          || await activeClient.guilds.fetch(state.setupGuildId).catch(() => null);
        if (guild) await grantOwnerAccess(guild, state, id, false).catch(() => null);
      }

      return interaction.reply({ embeds: [success('OWNER RETIRÉ', `<@${id}> n’a plus les permissions owner SPY6.`)], ephemeral: true });
    }
  }

  if (interaction.commandName === 'spysetup') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const category = await setupGuild({
        guild: interaction.guild,
        state,
        clients: botRecords,
        saveState,
        activeClient
      });
      return interaction.editReply({ embeds: [success('SETUP TERMINÉ', `Catégorie ${category} créée.\n**${state.targets.length}** salon(s) de surveillance synchronisé(s).\nLes cibles présentes sur ce serveur ont automatiquement un accès **lecture seule** à leur salon.`)] });
    } catch (err) {
      return interaction.editReply({ embeds: [error('SETUP IMPOSSIBLE', `\`${err.message}\`\n\nVérifie **Gérer les salons** et **Gérer les webhooks**.`)] });
    }
  }

  if (interaction.commandName === 'spy') {
    const id = interaction.options.getString('id', true).trim();
    if (!/^\d{15,22}$/.test(id)) {
      return interaction.reply({ embeds: [error('ID INVALIDE', 'Entre un ID Discord numérique valide.')], ephemeral: true });
    }
    if (state.targets.some(t => t.userId === id)) {
      return interaction.reply({ embeds: [info('DÉJÀ SURVEILLÉ', `<@${id}> est déjà dans la watchlist.`)], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const user = await fetchUserFromClients(botRecords, id);
    const target = {
      userId: id,
      username: user?.username || null,
      globalName: user?.globalName || null,
      channelId: null,
      webhookId: null,
      webhookToken: null,
      addedBy: interaction.user.id,
      addedAt: new Date().toISOString()
    };
    state.targets.push(target);

    try {
      if (state.setupGuildId && state.categoryId) {
        const logGuild = activeClient.guilds.cache.get(state.setupGuildId)
          || await activeClient.guilds.fetch(state.setupGuildId).catch(() => null);
        if (logGuild) {
          await ensureTargetChannel(logGuild, state.categoryId, target, activeClient.user.id);
        }
      }
      saveState(state);
      const name = user ? `${user.globalName || user.username} (${user.username})` : `Utilisateur ${id}`;
      return interaction.editReply({ embeds: [success('CIBLE AJOUTÉE', `**${name}**\nID : \`${id}\`\n${target.channelId ? `Salon : <#${target.channelId}>\nS’il est déjà sur le serveur de logs, son accès lecture seule est activé.` : 'Lance `/spysetup` pour créer son salon de logs.'}`)] });
    } catch (err) {
      state.targets = state.targets.filter(t => t.userId !== id);
      saveState(state);
      return interaction.editReply({ embeds: [error('AJOUT IMPOSSIBLE', `\`${err.message}\``)] });
    }
  }

  if (interaction.commandName === 'unspy') {
    const id = interaction.options.getString('id', true).trim();
    const index = state.targets.findIndex(t => t.userId === id);
    if (index === -1) {
      return interaction.reply({ embeds: [error('INTROUVABLE', `\`${id}\` n’est pas dans la watchlist.`)], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const target = state.targets[index];
    try {
      if (target.channelId && state.setupGuildId) {
        const logGuild = activeClient.guilds.cache.get(state.setupGuildId)
          || await activeClient.guilds.fetch(state.setupGuildId).catch(() => null);
        const channel = logGuild
          ? (logGuild.channels.cache.get(target.channelId) || await logGuild.channels.fetch(target.channelId).catch(() => null))
          : null;
        if (channel) await channel.delete(`SPY6 /unspy ${id}`);
      }
    } catch (err) {
      console.error('⚠️ /unspy suppression salon :', err.message);
    }
    state.targets.splice(index, 1);
    saveState(state);
    return interaction.editReply({ embeds: [success('CIBLE RETIRÉE', `<@${id}> a été retiré de SPY6 et son salon de logs a été supprimé.`)] });
  }

  if (interaction.commandName === 'spylist') {
    if (!state.targets.length) {
      return interaction.reply({ embeds: [info('WATCHLIST VIDE', 'Aucune personne n’est actuellement surveillée.')], ephemeral: true });
    }

    const lines = state.targets.map((t, i) => {
      const label = t.globalName || t.username || t.userId;
      return `**${i + 1}. ${label}** • <@${t.userId}> • \`${t.userId}\`${t.channelId ? ` • <#${t.channelId}>` : ''}`;
    });

    const chunks = [];
    let current = '';
    for (const line of lines) {
      if ((current + '\n' + line).length > 3800) {
        chunks.push(current);
        current = line;
      } else current += `${current ? '\n' : ''}${line}`;
    }
    if (current) chunks.push(current);

    const embeds = chunks.slice(0, 10).map((chunk, i) => new EmbedBuilder()
      .setColor(CYAN)
      .setTitle(`⌬ SPY6 // TARGET DATABASE${chunks.length > 1 ? ` • ${i + 1}/${chunks.length}` : ''}`)
      .setDescription(chunk)
      .setFooter({ text: `${state.targets.length} cible(s) • SPY6 // CLASSIFIED` })
      .setTimestamp());

    return interaction.reply({ embeds, ephemeral: true });
  }

  if (interaction.commandName === 'spybot') {
    const active = getActiveClient();
    const rows = botRecords.map((r, i) => {
      const online = r.client?.isReady();
      const tag = online ? r.client.user.tag : (r.lastTag || `BOT SLOT ${i + 1}`);
      const activeMark = active && r.client === active ? ' **[ACTIF]**' : '';
      const stateLabel = online ? '🟢 CONNECTÉ' : (r.status === 'invalid' ? '🔴 TOKEN INVALIDE' : r.status === 'error' ? '🔴 ERREUR' : '🟠 HORS LIGNE');
      const extra = r.lastError ? `\n└ \`${String(r.lastError).slice(0, 120)}\`` : '';
      return `**#${i + 1} • ${tag}**${activeMark}\n${stateLabel}${extra}`;
    });

    const embed = new EmbedBuilder()
      .setColor(CYAN)
      .setTitle('◢ SPY6 BOT MATRIX')
      .setDescription(rows.join('\n\n') || 'Aucun token configuré.')
      .addFields({ name: 'Failover', value: 'Si le bot actif tombe, le prochain bot connecté prend automatiquement le relais.' })
      .setFooter({ text: 'Les tokens ne sont jamais affichés.' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { commandData, registerCommandsForGuild, handleInteraction };
