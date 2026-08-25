const { EmbedBuilder } = require('discord.js');

// SPY6 // INTELLIGENCE NETWORK
// Noir côté identité visuelle Discord + accents cyan fluo dans les embeds.
const CYAN = 0x00f5ff;
const DARK = 0x05070a;
const RED = 0xff315c;

function baseEmbed(title, description = null) {
  const embed = new EmbedBuilder()
    .setColor(CYAN)
    .setTitle(`⌬ SPY6 // ${title}`)
    .setFooter({ text: 'SPY6 // INTELLIGENCE NETWORK • CLASSIFIED' })
    .setTimestamp();

  if (description) embed.setDescription(description);
  return embed;
}

function success(title, description) {
  return baseEmbed(`CLEARANCE GRANTED // ${title}`, description);
}

function error(title, description) {
  return new EmbedBuilder()
    .setColor(RED)
    .setTitle(`⚠ SPY6 // ${title}`)
    .setDescription(description)
    .setFooter({ text: 'SPY6 // SECURITY PROTOCOL • DENIED' })
    .setTimestamp();
}

function info(title, description) {
  return baseEmbed(`INTEL // ${title}`, description);
}

module.exports = { CYAN, DARK, RED, baseEmbed, success, error, info };
