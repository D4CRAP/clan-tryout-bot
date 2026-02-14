
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// ===== CONFIG =====
const TRYOUT_PANEL = "1470507511709700270";
const TRYOUT_ROLE = "1470506234967752885";
const ANTI_EXPLOIT = "1470504784162197625";
const RESULTS_CHANNEL = "1470511898775654454";
// ==================

const db = new sqlite3.Database("./clan.db");

db.run(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  roblox TEXT,
  host_id TEXT,
  status TEXT
)
`);

let tryoutsEnabled = true;

// Express keep-alive (Railway compatible)
const app = express();
app.get("/", (req,res)=>res.send("Bot running"));
app.listen(process.env.PORT || 3000);

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(TRYOUT_PANEL);

  const embed = new EmbedBuilder()
    .setTitle("Clan Tryouts")
    .setDescription("Click below to start your tryout.")
    .setColor(0x2f3136);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_tryout")
      .setLabel("Start Tryout")
      .setStyle(ButtonStyle.Primary)
  );

  channel.send({ embeds: [embed], components: [row] });
});

client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isButton() && interaction.customId === "start_tryout") {

    if (!tryoutsEnabled) {
      return interaction.reply({ content: "Tryouts are disabled.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId("roblox_modal")
      .setTitle("Tryout Application");

    const usernameInput = new TextInputBuilder()
      .setCustomId("roblox_username")
      .setLabel("Roblox Username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "roblox_modal") {
    const username = interaction.fields.getTextInputValue("roblox_username");

    db.run(
      `INSERT INTO tickets (user_id, roblox, status) VALUES (?, ?, ?)`,
      [interaction.user.id, username, "waiting_screenshot"]
    );

    return interaction.reply({
      content: "Upload your stats screenshot in this channel.",
      ephemeral: true
    });
  }

  if (interaction.isButton() && interaction.customId.startsWith("claim_")) {

    const ticketId = interaction.customId.split("_")[1];

    db.run(
      `UPDATE tickets SET host_id=?, status=? WHERE id=?`,
      [interaction.user.id, "claimed", ticketId]
    );

    return interaction.reply({ content: `Claimed by ${interaction.user}`, ephemeral: false });
  }

  if (interaction.isButton() && interaction.customId.startsWith("result_")) {

    const [_, ticketId, type] = interaction.customId.split("_");

    if (type === "pc") {
      await interaction.channel.send(`<@&${ANTI_EXPLOIT}> PC CHECK REQUIRED`);
    }

    const embed = new EmbedBuilder()
      .setTitle("Tryout Result")
      .setDescription(`Result: **${type.toUpperCase()}**`)
      .setColor(type === "pass" ? 0x00ff00 : 0xff0000);

    const channel = await client.channels.fetch(RESULTS_CHANNEL);
    channel.send({ embeds: [embed] });

    db.run(`UPDATE tickets SET status=? WHERE id=?`, [type, ticketId]);

    return interaction.reply({ content: "Result submitted.", ephemeral: true });
  }

});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.channel.id !== TRYOUT_PANEL) return;
  if (!message.attachments.size) return;

  db.get(
    `SELECT * FROM tickets WHERE user_id=? AND status=?`,
    [message.author.id, "waiting_screenshot"],
    async (err, row) => {
      if (!row) return;

      await message.channel.permissionOverwrites.edit(message.author.id, {
        SendMessages: false
      });

      const embed = new EmbedBuilder()
        .setTitle("Tryout Ready")
        .setDescription(`${message.author} ready for claim.`)
        .setColor(0xffaa00);

      const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_${row.id}`)
          .setLabel("Claim")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`result_${row.id}_pass`)
          .setLabel("Pass")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`result_${row.id}_fail`)
          .setLabel("Fail")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`result_${row.id}_pc`)
          .setLabel("PC Check")
          .setStyle(ButtonStyle.Secondary)
      );

      message.channel.send({
        content: `<@&${TRYOUT_ROLE}>`,
        embeds: [embed],
        components: [rowButtons]
      });

      db.run(`UPDATE tickets SET status=? WHERE id=?`, ["awaiting_claim", row.id]);
    }
  );
});

client.login(process.env.TOKEN);
