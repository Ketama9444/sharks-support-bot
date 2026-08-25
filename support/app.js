require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder, WebhookClient
} = require('discord.js');
const config = require('./config');
const storage = require('./storage');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

const env = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  staffRoleId: process.env.STAFF_ROLE_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID
};

const C = config.branding.color;
const logo = config.branding.logo;

function brandEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(C)
    .setAuthor({ name: config.branding.name, iconURL: logo })
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(logo)
    .setFooter({ text: config.branding.footer })
    .setTimestamp();
}

function getCategory(id) {
  return config.ticketCategories.find(x => x.id === id) || config.ticketCategories[0];
}

function supportMenu(customId = 'dm_category') {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Choisis la catégorie de ta demande')
      .addOptions(config.ticketCategories.map(c => ({
        label: c.label,
        description: c.description.slice(0, 100),
        value: c.id,
        emoji: c.emoji
      })))
  );
}

function ticketControls() {
  const main = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  const advanced = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_manage')
      .setPlaceholder('⚙️ Gestion avancée du ticket')
      .addOptions(
        { label: 'Priorité basse', value: 'priority:low', emoji: '🟢', description: 'Définir la priorité sur basse' },
        { label: 'Priorité normale', value: 'priority:normal', emoji: '🟡', description: 'Définir la priorité sur normale' },
        { label: 'Priorité haute', value: 'priority:high', emoji: '🟠', description: 'Définir la priorité sur haute' },
        { label: 'Priorité urgente', value: 'priority:urgent', emoji: '🔴', description: 'Définir la priorité sur urgente' },
        { label: 'Ajouter un staff', value: 'addstaff', emoji: '➕', description: 'Donner accès à un autre staff au ticket' },
        { label: 'Retirer un staff', value: 'removestaff', emoji: '➖', description: 'Retirer un staff ajouté manuellement' },
        { label: 'Libérer le ticket', value: 'unclaim', emoji: '👋', description: 'Rendre le ticket visible à tous les staffs' },
        { label: 'Renommer le ticket', value: 'rename', emoji: '✏️', description: 'Modifier le nom du salon' },
        { label: 'Ajouter une note interne', value: 'note', emoji: '📝', description: 'Ajouter une note visible uniquement ici' }
      )
  );

  return [main, advanced];
}

function priorityLabel(priority = 'normal') {
  return ({ low: '🟢 Basse', normal: '🟡 Normale', high: '🟠 Haute', urgent: '🔴 Urgente' })[priority] || '🟡 Normale';
}

function ticketAgeStatus(ticket) {
  const minutes = Math.max(0, Math.floor((Date.now() - ticket.createdAt) / 60000));
  if (minutes < 5) return { emoji: '🟢', label: 'Récent', minutes };
  if (minutes <= 15) return { emoji: '🟠', label: 'En attente', minutes };
  return { emoji: '🔴', label: 'Attente longue', minutes };
}

function ticketBaseName(ticket) {
  const fallback = `ticket-${String(ticket.id).padStart(4, '0')}-${sanitizeName((ticket.userTag || 'joueur').split('#')[0])}`;
  return sanitizeName(ticket.customName || fallback).replace(/^(?:ticket-)?/, 'ticket-');
}

function ticketChannelName(ticket) {
  const age = ticketAgeStatus(ticket);
  return `${age.emoji}・${ticketBaseName(ticket)}`.slice(0, 100);
}

function ticketPanelEmbed(ticket) {
  const cat = getCategory(ticket.categoryId);
  return brandEmbed(`${cat.emoji} Ticket #${ticket.id} — ${cat.label}`, `**Utilisateur :** <@${ticket.userId}> (${ticket.userTag})
**Sujet :** ${ticket.subject}

**Description :**
${ticket.details}

> 💬 Ce salon sert uniquement à la conversation avec le joueur. Les outils de gestion ci-dessous ne polluent pas le ticket.`)
    .addFields(
      { name: 'Priorité', value: priorityLabel(ticket.priority), inline: true },
      { name: 'Statut', value: ticket.status === 'open' ? '🟢 Ouvert' : '🔒 Fermé', inline: true },
      { name: 'Pris en charge', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Personne', inline: true },
      { name: 'Temps d’attente', value: (() => { const a = ticketAgeStatus(ticket); return `${a.emoji} ${a.label} • <t:${Math.floor(ticket.createdAt / 1000)}:R>`; })(), inline: true }
    );
}

async function refreshTicketPanel(channel, ticketId) {
  const db = storage.load();
  const ticket = db.tickets[ticketId];
  if (!ticket?.controlMessageId) return;
  const msg = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    content: env.staffRoleId ? `<@&${env.staffRoleId}>` : undefined,
    embeds: [ticketPanelEmbed(ticket)],
    components: ticketControls()
  }).catch(() => {});
}

// Recrée manuellement le panneau de gestion tout en bas du ticket.
// Cette fonction n'est appelée que via /help afin d'éviter toute pollution automatique.
async function moveTicketPanelToBottom(channel, ticketId) {
  const db = storage.load();
  const ticket = db.tickets[ticketId];
  if (!ticket || ticket.status !== 'open') return;

  if (ticket.controlMessageId) {
    const oldPanel = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
    if (oldPanel) await oldPanel.delete().catch(() => {});
  }

  const freshDb = storage.load();
  const freshTicket = freshDb.tickets[ticketId];
  if (!freshTicket || freshTicket.status !== 'open') return;

  const panel = await channel.send({
    embeds: [ticketPanelEmbed(freshTicket)],
    components: ticketControls()
  }).catch(() => null);
  if (!panel) return;

  const finalDb = storage.load();
  if (finalDb.tickets[ticketId]) {
    finalDb.tickets[ticketId].controlMessageId = panel.id;
    storage.save(finalDb);
  }
}

async function claimTicket(channel, ticket, member) {
  const guild = channel.guild;
  const db = storage.load();
  const current = db.tickets[ticket.id];
  if (!current) return;

  // On retire les accès individuels ajoutés avant le claim.
  for (const userId of current.extraStaffIds || []) {
    if (userId !== member.id) await channel.permissionOverwrites.delete(userId).catch(() => {});
  }

  // Le rôle staff général ne voit plus le ticket une fois qu'il est pris en charge.
  if (env.staffRoleId) {
    await channel.permissionOverwrites.edit(env.staffRoleId, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false
    }).catch(() => {});
  }

  // Les admins gardent toujours leur accès.
  if (env.adminRoleId) {
    await channel.permissionOverwrites.edit(env.adminRoleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      ManageChannels: true
    }).catch(() => {});
  }

  // Le staff qui claim garde l'accès personnellement.
  await channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true
  }).catch(() => {});

  current.claimedBy = member.id;
  current.extraStaffIds = [];
  storage.save(db);
}

async function unclaimTicket(channel, ticket) {
  const db = storage.load();
  const current = db.tickets[ticket.id];
  if (!current) return;

  if (current.claimedBy) {
    await channel.permissionOverwrites.delete(current.claimedBy).catch(() => {});
  }
  for (const userId of current.extraStaffIds || []) {
    await channel.permissionOverwrites.delete(userId).catch(() => {});
  }

  if (env.staffRoleId) {
    await channel.permissionOverwrites.edit(env.staffRoleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    }).catch(() => {});
  }

  current.claimedBy = null;
  current.extraStaffIds = [];
  storage.save(db);
}

function sanitizeName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 70);
}

function findOpenTicketByUser(userId) {
  const db = storage.load();
  return Object.values(db.tickets).find(t => t.userId === userId && t.status === 'open');
}

function getTicketByChannel(channelId) {
  const db = storage.load();
  return Object.values(db.tickets).find(t => t.channelId === channelId);
}


async function ensureTicketWebhook(channel, ticketId) {
  let db = storage.load();
  let ticket = db.tickets[ticketId];
  if (!ticket) return null;

  if (ticket.webhookId && ticket.webhookToken) {
    return new WebhookClient({ id: ticket.webhookId, token: ticket.webhookToken });
  }

const webhook = await channel.createWebhook({
  name: `Sharks FA • Ticket #${ticket.id}`,
  reason: `Relais MP temporaire du ticket #${ticket.id}`
});

  db = storage.load();
  if (!db.tickets[ticketId]) {
    await webhook.delete('Ticket introuvable après création du webhook').catch(() => {});
    return null;
  }
  db.tickets[ticketId].webhookId = webhook.id;
  db.tickets[ticketId].webhookToken = webhook.token;
  storage.save(db);

  return new WebhookClient({ id: webhook.id, token: webhook.token });
}

async function deleteTicketWebhook(ticket, reason = 'Fermeture du ticket') {
  if (!ticket?.webhookId || !ticket?.webhookToken) return;
  const webhook = new WebhookClient({ id: ticket.webhookId, token: ticket.webhookToken });
  await webhook.delete(reason).catch(() => {});
  webhook.destroy();

  const db = storage.load();
  if (db.tickets[ticket.id]) {
    db.tickets[ticket.id].webhookId = null;
    db.tickets[ticket.id].webhookToken = null;
    storage.save(db);
  }
}

function attachmentPayloads(message) {
  return [...message.attachments.values()].map(a => ({
    attachment: a.url,
    name: a.name || 'piece-jointe'
  }));
}

async function relayPlayerMessage(channel, ticket, message) {
  let webhook = await ensureTicketWebhook(channel, ticket.id);
  if (!webhook) throw new Error(`Impossible de créer le webhook du ticket #${ticket.id}`);

  const payload = {
    username: message.author.globalName || message.author.username,
    avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
    allowedMentions: { parse: [] }
  };
  if (message.content) payload.content = message.content;
  const files = attachmentPayloads(message);
  if (files.length) payload.files = files;

  try {
    await webhook.send(payload);
  } catch (err) {
    // Si le webhook a été supprimé manuellement, on en recrée un automatiquement.
    webhook.destroy();
    const db = storage.load();
    if (db.tickets[ticket.id]) {
      db.tickets[ticket.id].webhookId = null;
      db.tickets[ticket.id].webhookToken = null;
      storage.save(db);
    }
    webhook = await ensureTicketWebhook(channel, ticket.id);
    if (!webhook) throw err;
    await webhook.send(payload);
  } finally {
    webhook?.destroy();
  }
}

function isBlacklisted(userId) {
  const db = storage.load();
  return Boolean(db.users[userId]?.blacklisted);
}

async function log(embed) {
  if (!config.channels.logsChannelId) return;
  const ch = await client.channels.fetch(config.channels.logsChannelId).catch(() => null);
  if (ch?.isTextBased()) ch.send({ embeds: [embed] }).catch(() => {});
}

async function createTranscript(channel, ticket) {
  let messages = [];
  let before;
  while (messages.length < config.limits.transcriptMessageLimit) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    const arr = [...batch.values()];
    messages.push(...arr);
    before = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }
  messages = messages.sort((a,b) => a.createdTimestamp - b.createdTimestamp);
  const esc = s => String(s || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rows = messages.map(m => {
    const attachments = [...m.attachments.values()].map(a => `<div><a href="${esc(a.url)}">📎 ${esc(a.name || a.url)}</a></div>`).join('');
    return `<div class="msg"><div class="meta"><b>${esc(m.author?.tag || 'Inconnu')}</b> <span>${new Date(m.createdTimestamp).toLocaleString('fr-FR')}</span></div><div class="content">${esc(m.content).replace(/\n/g,'<br>')}${attachments}</div></div>`;
  }).join('\n');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Sharks FA Ticket #${ticket.id}</title><style>body{font-family:Arial;background:#07101e;color:#eef4ff;padding:30px;max-width:1000px;margin:auto}.head{background:#0b1e38;padding:22px;border-radius:14px}.msg{padding:14px 0;border-bottom:1px solid #1c2f48}.meta span{color:#8ba1bd;font-size:12px}.content{margin-top:6px;white-space:normal}a{color:#63a7ff}</style></head><body><div class="head"><h1>🦈 Sharks FA — Ticket #${ticket.id}</h1><p>Utilisateur: ${esc(ticket.userTag)} (${ticket.userId})<br>Catégorie: ${esc(ticket.categoryLabel)}<br>Sujet: ${esc(ticket.subject)}<br>Statut: ${esc(ticket.status)}</p></div>${rows}</body></html>`;
  const outDir = process.env.SUPPORT_TRANSCRIPTS_DIR ? path.resolve(process.env.SUPPORT_TRANSCRIPTS_DIR) : path.join(__dirname, 'transcripts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `ticket-${ticket.id}.html`);
  fs.writeFileSync(out, html);
  return out;
}

async function postTranscriptArchive(channel, ticket, reason = 'Archive de fermeture') {
  const out = await createTranscript(channel, ticket);
  const tCh = config.channels.transcriptsChannelId ? await client.channels.fetch(config.channels.transcriptsChannelId).catch(() => null) : null;
  if (!tCh?.isTextBased()) return out;
  const archived = brandEmbed(`📄 Transcript • Ticket #${ticket.id}`, `**Utilisateur :** ${ticket.userTag} (${ticket.userId})\n**Catégorie :** ${ticket.categoryLabel}\n**Sujet :** ${ticket.subject}\n**Raison :** ${reason}\n**Ouvert :** <t:${Math.floor(ticket.createdAt / 1000)}:F>\n**Fermé :** <t:${Math.floor(Date.now() / 1000)}:F>`);
  await tCh.send({ embeds: [archived], files: [new AttachmentBuilder(out)] });
  return out;
}

async function createTicket(user, categoryId, subject, details) {
  if (isBlacklisted(user.id)) {
    await user.send({ embeds: [brandEmbed('Accès au support refusé', 'Tu ne peux actuellement pas ouvrir de ticket auprès du support Sharks FA.')] }).catch(() => {});
    return null;
  }

  const existing = findOpenTicketByUser(user.id);
  if (existing) {
    await user.send({ embeds: [brandEmbed('Ticket déjà ouvert', `Tu as déjà un ticket actif **#${existing.id}**. Continue simplement à m’écrire ici : tes messages seront transmis au staff.`)] }).catch(() => {});
    return existing;
  }

  const guild = await client.guilds.fetch(env.guildId);
  const id = storage.nextTicketId();
  const cat = getCategory(categoryId);
  const name = `🟢・ticket-${String(id).padStart(4,'0')}-${sanitizeName(user.username)}`;
  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ];
  if (env.staffRoleId) permissionOverwrites.push({ id: env.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] });
  if (env.adminRoleId && env.adminRoleId !== env.staffRoleId) permissionOverwrites.push({ id: env.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: config.channels.ticketCategoryIds?.[cat.id] || null,
    topic: `Sharks FA Support • Ticket #${id} • User ${user.id} • ${cat.label}`,
    permissionOverwrites
  });

  const ticket = {
    id, channelId: channel.id, userId: user.id, userTag: user.tag,
    categoryId: cat.id, categoryLabel: cat.label, subject, details,
    status: 'open', claimedBy: null, priority: 'normal', customName: null,
    webhookId: null, webhookToken: null, extraStaffIds: [],
    createdAt: Date.now(), closedAt: null
  };
  const db = storage.load();
  db.tickets[id] = ticket;
  storage.save(db);

  // Un webhook unique et temporaire permet d'afficher les MP du joueur
  // avec son pseudo et son avatar directement dans le salon du ticket.
  await ensureTicketWebhook(channel, id);

  const panelMessage = await channel.send({
    content: env.staffRoleId ? `<@&${env.staffRoleId}>` : undefined,
    embeds: [ticketPanelEmbed(ticket)],
    components: ticketControls()
  });
  const db2 = storage.load();
  db2.tickets[id].controlMessageId = panelMessage.id;
  storage.save(db2);
  await user.send({
    content: `<@${user.id}>`,
    embeds: [brandEmbed('✅ Ticket créé', `Ton ticket **#${id}** a été créé dans la catégorie **${cat.label}**.\n\nTu peux maintenant **m’écrire directement ici** : chaque message sera envoyé au staff Sharks FA.\n\n🔒 **Pour fermer ton ticket, merci de faire \`!close\` dans cette conversation.**`)],
    allowedMentions: { users: [user.id] }
  }).catch(() => {});
  await log(brandEmbed('🎫 Nouveau ticket', `Ticket **#${id}** créé par **${user.tag}** (${user.id})\nCatégorie : **${cat.label}**\nSalon : <#${channel.id}>`));
  return ticket;
}

async function closeTicket(channel, actor) {
  const ticket = getTicketByChannel(channel.id);
  if (!ticket || ticket.status === 'closed') return false;

  const db = storage.load();
  db.tickets[ticket.id].status = 'closed';
  db.tickets[ticket.id].closedAt = Date.now();
  db.tickets[ticket.id].closedBy = actor.id || actor.user?.id || null;
  storage.save(db);

  const closedTicket = storage.load().tickets[ticket.id];
  await postTranscriptArchive(channel, closedTicket, `Fermé par ${actor.tag || actor.user?.tag || 'Staff'}`).catch(err => console.error('Transcript fermeture:', err));
  await deleteTicketWebhook(closedTicket, `Ticket #${ticket.id} fermé`).catch(() => {});

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  await user?.send(`🔒 Ton ticket **#${ticket.id}** a été fermé et archivé. Si tu as besoin d’aide à nouveau, envoie-moi simplement un nouveau message.`).catch(() => {});
  await log(brandEmbed('🔒 Ticket fermé', `Ticket **#${ticket.id}** fermé par **${actor.tag || actor.user?.tag || 'Staff'}**. Le transcript a été archivé dans <#${config.channels.transcriptsChannelId}>.`));

  setTimeout(() => channel.delete(`Ticket #${ticket.id} fermé et archivé en transcript`).catch(() => {}), 1800);
  return true;
}

async function ensureSupportStructure(guild) {
  await guild.channels.fetch().catch(() => {});

  const result = { ticketCategories: {} };

  // Une catégorie Discord par motif de ticket.
  for (const cat of config.ticketCategories) {
    const categoryName = `${cat.emoji}・${cat.label.toUpperCase()}`;
    let discordCategory = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === categoryName
    );

    if (!discordCategory) {
      discordCategory = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        reason: `Sharks FA Support • catégorie ${cat.label}`
      });
      console.log(`📁 Catégorie créée : ${categoryName}`);
    }

    config.channels.ticketCategoryIds[cat.id] = discordCategory.id;
    result.ticketCategories[cat.id] = discordCategory;
  }

  // Les archives sont uniquement des transcripts dans un salon unique.
  // Aucune catégorie d'archives et aucun salon de ticket fermé n'est créé.
  let transcripts = guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.name === 'transcripts' || c.name === 'support-transcripts'));
  if (!transcripts) {
    transcripts = await guild.channels.create({
      name: 'transcripts',
      type: ChannelType.GuildText,
      reason: 'Sharks FA Support • transcripts uniques'
    });
    console.log('📄 Salon créé : transcripts');
  } else if (transcripts.parentId) {
    await transcripts.setParent(null, { lockPermissions: false }).catch(() => {});
    if (transcripts.name !== 'transcripts') await transcripts.setName('transcripts').catch(() => {});
  }

  let logs = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === 'support-logs');
  if (!logs) {
    logs = await guild.channels.create({
      name: 'support-logs',
      type: ChannelType.GuildText,
      reason: 'Sharks FA Support • logs'
    });
  } else if (logs.parentId) {
    await logs.setParent(null, { lockPermissions: false }).catch(() => {});
  }

  config.channels.logsChannelId = logs.id;
  config.channels.transcriptsChannelId = transcripts.id;

  result.logs = logs;
  result.transcripts = transcripts;

  return result;
}

async function runSetup(guild) {
  return ensureSupportStructure(guild);
}

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} connecté — Sharks FA Support`);
  client.user.setActivity('MP MOI');

  try {
    const guild = await client.guilds.fetch(env.guildId);
    const structure = await ensureSupportStructure(guild);
    console.log(`✅ Structure support vérifiée : ${Object.keys(structure.ticketCategories).length} catégories tickets + salon transcripts`);
    await updateTicketAgeIndicators();
  } catch (err) {
    console.error('❌ Impossible de créer/vérifier la structure support au démarrage :', err);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Utilisateur -> bot en MP
  if (message.channel.type === ChannelType.DM) {
    const open = findOpenTicketByUser(message.author.id);
    if (!open) {
      if (message.content.trim().toLowerCase() === '!close') {
        return message.reply('❌ Tu n’as actuellement aucun ticket ouvert.').catch(() => {});
      }
      if (isBlacklisted(message.author.id)) {
        return message.reply({ embeds: [brandEmbed('Support indisponible', 'Tu ne peux actuellement pas ouvrir de ticket.')] }).catch(() => {});
      }
      return message.reply({
        embeds: [brandEmbed('🦈 Support Sharks FA', 'Bienvenue sur le support officiel de **Sharks FA**.\n\nSélectionne la catégorie correspondant à ta demande. Un formulaire te permettra ensuite d’expliquer ton problème.')],
        components: [supportMenu()]
      }).catch(() => {});
    }
    // Fermeture demandée par le joueur depuis les MP du bot.
    // !close n'est jamais relayé dans le salon staff.
    if (message.content.trim().toLowerCase() === '!close') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dm_close_confirm:${open.id}`)
          .setLabel('Oui, fermer le ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`dm_close_cancel:${open.id}`)
          .setLabel('Annuler')
          .setEmoji('↩️')
          .setStyle(ButtonStyle.Secondary)
      );
      return message.reply({
        embeds: [brandEmbed('🔒 Fermer le ticket ?', `Tu es sur le point de fermer le ticket **#${open.id}**.

Une fois confirmé, la conversation sera **archivée automatiquement en transcript** côté staff et le salon du ticket sera supprimé.`)],
        components: [row]
      }).catch(() => {});
    }

    const ch = await client.channels.fetch(open.channelId).catch(() => null);
    if (!ch?.isTextBased()) return;
    await relayPlayerMessage(ch, open, message).catch(err => {
      console.error(`Relais webhook ticket #${open.id}:`, err);
    });
    return;
  }

  // Staff -> utilisateur depuis un salon ticket
  const ticket = getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;
  if (message.content.startsWith('!')) return;

  // Une réponse à un autre staff ou à un message système/bot reste interne au salon.
  // Exception : les messages MP du joueur sont relayés par CE bot ; on les reconnaît
  // grâce au footer "MP utilisateur" et une réponse à ceux-ci peut bien être envoyée au joueur.
  if (message.reference?.messageId) {
    const referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (referenced) {
      const isRelayedPlayerMessage =
        (referenced.webhookId && referenced.webhookId === ticket.webhookId) ||
        (referenced.author?.id === client.user.id && referenced.embeds?.some(e => e.footer?.text?.startsWith('MP utilisateur •')));
      // Dans un salon ticket, tout message humain provient du staff/serveur : le joueur parle
      // uniquement en MP et ses messages apparaissent ici via le bot.
      const isInternalReply = referenced.author?.bot ? !isRelayedPlayerMessage : true;

      if (isInternalReply) {
        await message.react('🔒').catch(() => {});
        return;
      }
    }
  }

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (!user) return;

  // Réponse staff -> joueur : DM normal, mais clairement identifié comme support Sharks RP.
  const dmPayload = { allowedMentions: { parse: [] } };
  const supportHeader = '__**Support de Sharks RP :**__';
  dmPayload.content = message.content ? `${supportHeader}\n${message.content}` : supportHeader;
  const files = attachmentPayloads(message);
  if (files.length) dmPayload.files = files;
  if (!message.content && !files.length) return;

  let delivered = true;
  await user.send(dmPayload).catch(async () => {
    delivered = false;
    await message.react('❌').catch(() => {});
  });
  if (delivered) await message.react('📨').catch(() => {});

});

async function updateTicketAgeIndicators() {
  const db = storage.load();
  for (const ticket of Object.values(db.tickets)) {
    if (ticket.status !== 'open') continue;
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;

    const desiredName = ticketChannelName(ticket);
    if (channel.name !== desiredName) {
      await channel.setName(desiredName, 'Mise à jour automatique de la pastille d’attente').catch(() => {});
      await refreshTicketPanel(channel, ticket.id);
    }
  }
}

// Mise à jour automatique des pastilles toutes les 60 secondes.
setInterval(() => {
  if (client.isReady()) updateTicketAgeIndicators().catch(() => {});
}, 60_000);

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_manage') {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ce salon n’est pas reconnu comme ticket.', ephemeral: true });
      const action = interaction.values[0];

      if (action.startsWith('priority:')) {
        const level = action.split(':')[1];
        const db = storage.load();
        db.tickets[ticket.id].priority = level;
        storage.save(db);
        await refreshTicketPanel(interaction.channel, ticket.id);
        return interaction.reply({ content: `✅ Priorité définie sur **${priorityLabel(level)}**.`, ephemeral: true });
      }

      if (action === 'addstaff' || action === 'removestaff') {
        if (!ticket.claimedBy) {
          return interaction.reply({ content: '❌ Le ticket doit d’abord être pris en charge avant de gérer les accès staff.', ephemeral: true });
        }
        const row = new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`ticket_staff_${action === 'addstaff' ? 'add' : 'remove'}:${ticket.id}`)
            .setPlaceholder(action === 'addstaff' ? 'Choisis le staff à ajouter' : 'Choisis le staff à retirer')
            .setMinValues(1)
            .setMaxValues(1)
        );
        return interaction.reply({
          content: action === 'addstaff' ? '➕ Sélectionne le staff à ajouter au ticket :' : '➖ Sélectionne le staff à retirer du ticket :',
          components: [row],
          ephemeral: true
        });
      }

      if (action === 'unclaim') {
        await unclaimTicket(interaction.channel, ticket);
        await refreshTicketPanel(interaction.channel, ticket.id);
        return interaction.reply({ content: '✅ Le ticket est maintenant libre et de nouveau visible par tous les staffs.', ephemeral: true });
      }

      if (action === 'rename') {
        const modal = new ModalBuilder().setCustomId(`staff_rename:${ticket.id}`).setTitle(`Renommer le ticket #${ticket.id}`);
        const input = new TextInputBuilder().setCustomId('name').setLabel('Nouveau nom du ticket').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(70).setPlaceholder('Ex: remboursement-vehicule');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (action === 'note') {
        const modal = new ModalBuilder().setCustomId(`staff_note:${ticket.id}`).setTitle(`Note interne • Ticket #${ticket.id}`);
        const input = new TextInputBuilder().setCustomId('note').setLabel('Note interne').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Cette note reste uniquement dans le ticket staff.');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('ticket_staff_')) {
      const [actionPart, ticketIdRaw] = interaction.customId.split(':');
      const ticket = storage.load().tickets[String(ticketIdRaw)];
      if (!ticket || ticket.channelId !== interaction.channelId || ticket.status !== 'open') {
        return interaction.reply({ content: '❌ Ticket introuvable ou déjà fermé.', ephemeral: true });
      }
      if (!ticket.claimedBy) {
        return interaction.reply({ content: '❌ Ce ticket n’est plus pris en charge.', ephemeral: true });
      }

      const selectedId = interaction.values[0];
      const member = await interaction.guild.members.fetch(selectedId).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });

      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || (env.adminRoleId && member.roles.cache.has(env.adminRoleId));
      const isStaff = isAdmin || (env.staffRoleId && member.roles.cache.has(env.staffRoleId));
      if (!isStaff) return interaction.reply({ content: '❌ Ce membre n’a pas le rôle staff/admin configuré.', ephemeral: true });

      const db = storage.load();
      const current = db.tickets[ticket.id];
      current.extraStaffIds ||= [];

      if (actionPart === 'ticket_staff_add') {
        if (isAdmin) return interaction.reply({ content: 'ℹ️ Cet administrateur a déjà accès automatiquement au ticket.', ephemeral: true });
        if (selectedId === current.claimedBy) return interaction.reply({ content: 'ℹ️ Ce staff prend déjà en charge le ticket.', ephemeral: true });

        await interaction.channel.permissionOverwrites.edit(selectedId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
        if (!current.extraStaffIds.includes(selectedId)) current.extraStaffIds.push(selectedId);
        storage.save(db);
        return interaction.update({ content: `✅ <@${selectedId}> a été ajouté au ticket.`, components: [] });
      }

      if (actionPart === 'ticket_staff_remove') {
        if (isAdmin) return interaction.reply({ content: '❌ Les administrateurs gardent toujours accès au ticket.', ephemeral: true });
        if (selectedId === current.claimedBy) return interaction.reply({ content: '❌ Tu ne peux pas retirer le staff qui prend actuellement le ticket en charge. Libère d’abord le ticket.', ephemeral: true });
        if (!current.extraStaffIds.includes(selectedId)) return interaction.reply({ content: 'ℹ️ Ce staff n’a pas été ajouté manuellement à ce ticket.', ephemeral: true });

        await interaction.channel.permissionOverwrites.delete(selectedId).catch(() => {});
        current.extraStaffIds = current.extraStaffIds.filter(id => id !== selectedId);
        storage.save(db);
        return interaction.update({ content: `✅ <@${selectedId}> a été retiré du ticket.`, components: [] });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'dm_category') {
      const categoryId = interaction.values[0];
      const cat = getCategory(categoryId);
      const modal = new ModalBuilder().setCustomId(`dm_modal:${categoryId}`).setTitle(`Sharks FA • ${cat.label}`);
      const subject = new TextInputBuilder().setCustomId('subject').setLabel('Sujet de ta demande').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex: Problème de whitelist');
      const details = new TextInputBuilder().setCustomId('details').setLabel('Explique ta demande').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500).setPlaceholder('Donne un maximum de détails...');
      modal.addComponents(new ActionRowBuilder().addComponents(subject), new ActionRowBuilder().addComponents(details));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_rename:')) {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
      const name = sanitizeName(interaction.fields.getTextInputValue('name'));
      const db = storage.load();
      db.tickets[ticket.id].customName = name || null;
      storage.save(db);
      const updated = storage.load().tickets[ticket.id];
      await interaction.channel.setName(ticketChannelName(updated));
      return interaction.reply({ content: `✅ Ticket renommé en **${name}**. La pastille d’attente reste automatique.`, ephemeral: true });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_note:')) {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
      const note = interaction.fields.getTextInputValue('note');
      await interaction.reply({ content: '✅ Note interne ajoutée.', ephemeral: true });
      return interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setAuthor({ name: 'Note interne staff', iconURL: logo }).setDescription(note).setFooter({ text: `Ajoutée par ${interaction.user.tag} • Ticket #${ticket.id}` }).setTimestamp()] });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('dm_modal:')) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const categoryId = interaction.customId.split(':')[1];
      const subject = interaction.fields.getTextInputValue('subject');
      const details = interaction.fields.getTextInputValue('details');
      const ticket = await createTicket(interaction.user, categoryId, subject, details);
      return interaction.editReply(ticket ? `✅ Ticket #${ticket.id} créé.` : '❌ Impossible de créer le ticket.').catch(() => {});
    }

    if (interaction.isButton() && interaction.customId.startsWith('dm_close_')) {
      const [action, ticketIdRaw] = interaction.customId.split(':');
      const ticket = storage.load().tickets[String(ticketIdRaw)];

      if (!ticket || ticket.userId !== interaction.user.id || ticket.status !== 'open') {
        return interaction.reply({ content: '❌ Ce ticket est déjà fermé ou n’existe plus.' }).catch(() => {});
      }

      if (action === 'dm_close_cancel') {
        return interaction.update({
          embeds: [brandEmbed('↩️ Fermeture annulée', `Ton ticket **#${ticket.id}** reste ouvert. Tu peux continuer à m’écrire ici.`)],
          components: []
        }).catch(() => {});
      }

      if (action === 'dm_close_confirm') {
        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (!channel?.isTextBased()) {
          return interaction.update({ content: '❌ Impossible de retrouver le salon du ticket.', embeds: [], components: [] }).catch(() => {});
        }

        await interaction.update({
          embeds: [brandEmbed('⏳ Fermeture en cours', `Ton ticket **#${ticket.id}** est en cours d’archivage…`)],
          components: []
        }).catch(() => {});

        const closed = await closeTicket(channel, interaction.user);
        if (closed) {
          return interaction.followUp({ content: `✅ Ton ticket **#${ticket.id}** a bien été fermé. Le transcript a été archivé côté staff.` }).catch(() => {});
        }
        return interaction.followUp({ content: '❌ Le ticket n’a pas pu être fermé.' }).catch(() => {});
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: 'Ce salon n’est pas reconnu comme ticket.', ephemeral: true });
      const action = interaction.customId.replace('ticket_', '');
      if (action === 'close') { await interaction.deferReply({ ephemeral: true }); await closeTicket(interaction.channel, interaction.user); return interaction.editReply('✅ Ticket fermé.'); }
      if (action === 'claim') {
        await claimTicket(interaction.channel, ticket, interaction.member);
        await refreshTicketPanel(interaction.channel, ticket.id);
        await interaction.reply({ content: '✅ Ticket pris en charge. Les autres staffs n’y ont plus accès ; seuls toi, les admins et les staffs ajoutés manuellement peuvent le voir.', ephemeral: true });
        return;
      }
      if (action === 'transcript') {
        await interaction.deferReply({ ephemeral: true });
        const out = await postTranscriptArchive(interaction.channel, ticket, `Généré manuellement par ${interaction.user.tag}`);
        return interaction.editReply({ content: `✅ Transcript envoyé dans <#${config.channels.transcriptsChannelId}>.`, files: [new AttachmentBuilder(out)] });
      }
      if (action === 'delete') {
        await interaction.reply({ content: '🗑️ Suppression du ticket dans 3 secondes…', ephemeral: true });
        await postTranscriptArchive(interaction.channel, ticket, `Suppression manuelle par ${interaction.user.tag}`).catch(() => null);
        await deleteTicketWebhook(ticket, `Ticket #${ticket.id} supprimé`).catch(() => {});
        setTimeout(() => interaction.channel.delete('Ticket supprimé').catch(() => {}), 3000);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup-support') {
      await interaction.deferReply({ ephemeral: true });
      const r = await runSetup(interaction.guild);
      const cats = Object.values(r.ticketCategories).map(c => `• ${c.name}`).join('\n');
      return interaction.editReply(`✅ Structure support vérifiée/créée :\n${cats}\n\n📄 Transcripts : <#${r.transcripts.id}>\n🧾 Logs : <#${r.logs.id}>`);
    }

    if (interaction.commandName === 'support-panel') {
      const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ouvrir le support en MP').setStyle(ButtonStyle.Link).setURL(`https://discord.com/users/${client.user.id}`).setEmoji('🦈'));
      await interaction.channel.send({ embeds: [brandEmbed('Centre de support Sharks FA', 'Besoin d’aide ? Clique sur le bouton ci-dessous puis envoie un **message privé au bot**.\n\nTu pourras choisir une catégorie et remplir un formulaire détaillé.')], components: [button] });
      return interaction.reply({ content: '✅ Panel envoyé.', ephemeral: true });
    }

    if (interaction.commandName === 'help') {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket || ticket.status !== 'open') {
        return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un ticket ouvert.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await moveTicketPanelToBottom(interaction.channel, ticket.id);
      return interaction.editReply('✅ Le panneau de gestion a été replacé tout en bas du ticket.');
    }

    if (interaction.commandName === 'support-user') {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('membre');
      const db = storage.load();
      db.users[user.id] ||= {};
      if (sub === 'blacklist') {
        db.users[user.id].blacklisted = true;
        db.users[user.id].reason = interaction.options.getString('raison') || 'Aucune raison';
        db.users[user.id].by = interaction.user.id;
        storage.save(db);
        return interaction.reply({ content: `⛔ ${user.tag} a été blacklisté du support.`, ephemeral: true });
      }
      db.users[user.id].blacklisted = false;
      storage.save(db);
      return interaction.reply({ content: `✅ ${user.tag} peut de nouveau utiliser le support.`, ephemeral: true });
    }

    if (interaction.commandName === 'ticket') {
      const ticket = getTicketByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: 'Cette commande doit être utilisée dans un ticket.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'close') { await interaction.deferReply({ ephemeral: true }); await closeTicket(interaction.channel, interaction.user); return interaction.editReply('✅ Fermé.'); }
      if (sub === 'claim') {
        await claimTicket(interaction.channel, ticket, interaction.member);
        await refreshTicketPanel(interaction.channel, ticket.id);
        return interaction.reply({ content: '✅ Ticket pris en charge.', ephemeral: true });
      }
      if (sub === 'unclaim') {
        await unclaimTicket(interaction.channel, ticket);
        await refreshTicketPanel(interaction.channel, ticket.id);
        return interaction.reply({ content: '✅ Ticket libéré et visible par tous les staffs.', ephemeral: true });
      }
      if (sub === 'priority') {
        const p = interaction.options.getString('niveau');
        const labels = { low:'🟢 Basse', normal:'🟡 Normale', high:'🟠 Haute', urgent:'🔴 Urgente' };
        const db = storage.load(); db.tickets[ticket.id].priority = p; storage.save(db);
        await refreshTicketPanel(interaction.channel, ticket.id);
        return interaction.reply({ content: `✅ Priorité : **${labels[p]}**`, ephemeral: true });
      }
      if (sub === 'rename') {
        const n = sanitizeName(interaction.options.getString('nom'));
        await interaction.channel.setName(n);
        return interaction.reply({ content: `✅ Salon renommé en **${n}**.`, ephemeral: true });
      }
      if (sub === 'note') {
        const txt = interaction.options.getString('texte');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('📝 Note staff interne').setDescription(txt).setFooter({ text: `Ajoutée par ${interaction.user.tag}` }).setTimestamp()] });
      }
      if (sub === 'add' || sub === 'remove') {
        const member = interaction.options.getUser('membre');
        if (sub === 'add') await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        else await interaction.channel.permissionOverwrites.delete(member.id).catch(() => {});
        return interaction.reply({ content: `${sub === 'add' ? '✅ Ajouté' : '✅ Retiré'} : ${member.tag}`, ephemeral: true });
      }
      if (sub === 'transcript') {
        await interaction.deferReply({ ephemeral: true });
        const out = await postTranscriptArchive(interaction.channel, ticket, `Généré manuellement par ${interaction.user.tag}`);
        return interaction.editReply({ content: `✅ Transcript envoyé dans <#${config.channels.transcriptsChannelId}>.`, files: [new AttachmentBuilder(out)] });
      }
      if (sub === 'delete') {
        await interaction.deferReply({ ephemeral: true });
        await postTranscriptArchive(interaction.channel, ticket, `Suppression manuelle par ${interaction.user.tag}`).catch(() => null);
        await deleteTicketWebhook(ticket, `Ticket #${ticket.id} supprimé`).catch(() => {});
        await interaction.editReply('🗑️ Transcript archivé. Suppression du ticket…');
        setTimeout(() => interaction.channel.delete('Suppression via /ticket delete').catch(() => {}), 1800);
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      const payload = { content: '❌ Une erreur est survenue. Consulte la console du bot.', ephemeral: true };
      if (interaction.deferred || interaction.replied) interaction.followUp(payload).catch(() => {});
      else interaction.reply(payload).catch(() => {});
    }
  }
});

if (!env.token || !env.guildId) {
  console.error('❌ Configure DISCORD_TOKEN et GUILD_ID dans .env');
  process.exit(1);
}

client.on('channelDelete', async (channel) => {
  try {
    // Charger la base actuelle
    const db = storage.load();

    // Chercher un ticket OUVERT correspondant au salon supprimé
    const ticket = Object.values(db.tickets || {}).find(
      t => t.channelId === channel.id && t.status === 'open'
    );

    // Ce salon n'était pas un ticket ouvert
    if (!ticket) return;

    console.log(
      `🗑️ Salon supprimé → fermeture automatique du ticket #${ticket.id}`
    );

    // Fermer réellement le ticket dans la base
    db.tickets[ticket.id].status = 'closed';
    db.tickets[ticket.id].closedAt = Date.now();
    db.tickets[ticket.id].closedReason = 'channel_deleted';

    // Le salon n'existe plus
    db.tickets[ticket.id].channelId = null;

    // Le webhook du salon n'est plus utilisable
    db.tickets[ticket.id].webhookId = null;
    db.tickets[ticket.id].webhookToken = null;

    // Sauvegarder dans le JSON
    storage.save(db);

    console.log(
      `✅ Ticket #${ticket.id} marqué comme fermé dans la base.`
    );

    // Prévenir le joueur en MP
    try {
      const user = await client.users.fetch(ticket.userId);

      await user.send({
        content:
          `🔒 **Ton ticket #${ticket.id} a été fermé.**\n\n` +
          `Le salon de ton ticket a été supprimé par le staff.\n\n` +
          `✅ Tu peux maintenant ouvrir un nouveau ticket en m'envoyant un nouveau message.`
      });

    } catch (dmError) {
      console.error(
        `⚠️ Impossible de prévenir le joueur du ticket #${ticket.id}:`,
        dmError.message
      );
    }

    // Log Discord
    await log(
      brandEmbed(
        '🗑️ Ticket fermé automatiquement',
        `Le salon du ticket **#${ticket.id}** a été supprimé.\n\n` +
        `Le ticket a donc été automatiquement marqué comme **fermé**.\n` +
        `Utilisateur : <@${ticket.userId}>`
      )
    ).catch(() => {});

  } catch (error) {
    console.error(
      '❌ Erreur lors de la fermeture automatique après suppression du salon :',
      error
    );
  }
});

client.login(env.token);
