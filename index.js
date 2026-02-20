require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const { createCanvas, registerFont } = require("canvas");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

registerFont("./fonts/Inter-Regular.ttf", { family: "Inter" });

const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} = require("discord.js");

/* ================= DATABASE ================= */

const db = new sqlite3.Database("./trades.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      result TEXT,
      rr REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

/* ================= CLIENT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", async () => {
  console.log("Bot is online!");

  const commands = [
    new SlashCommandBuilder().setName("stats").setDescription("View trading dashboard"),
    new SlashCommandBuilder().setName("equitycurve").setDescription("View RR equity curve"),
    new SlashCommandBuilder()
      .setName("remove")
      .setDescription("Remove last trade(s)")
      .addIntegerOption(option =>
        option.setName("count")
          .setDescription("Number of trades to remove")
          .setRequired(false)
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= IMAGE DROPDOWN ================= */

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (!attachment.contentType?.startsWith("image/")) return;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`trade_${message.author.id}`)
      .setPlaceholder("Select trade result")
      .addOptions(
        { label: "Win-RR", value: "win" },
        { label: "SL (-1RR)", value: "loss" },
        { label: "BE (0RR)", value: "be" }
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.reply({
      content: `📊 ${message.author}, select your trade result:`,
      components: [row]
    });
  }
});

/* ================= DASHBOARD ================= */

function drawCard(ctx, x, y, w, h, borderColor) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x, y, w, h);

  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;
}

function generateDashboard(rows) {

  const total = rows.length;
  const wins = rows.filter(t => t.result === "win").length;
  const losses = rows.filter(t => t.result === "loss").length;
  const be = rows.filter(t => t.result === "be").length;

  const totalRR = rows.reduce((s, t) => s + t.rr, 0);
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

  const avgWin = wins > 0
    ? (rows.filter(t => t.result === "win")
        .reduce((s, t) => s + t.rr, 0) / wins).toFixed(2)
    : "0.00";

  const avgLoss = losses > 0
    ? (rows.filter(t => t.result === "loss")
        .reduce((s, t) => s + t.rr, 0) / losses).toFixed(2)
    : "0.00";

  let highestWin = 0, highestLoss = 0;
  let tempWin = 0, tempLoss = 0;

  rows.forEach(t => {
    if (t.result === "win") { tempWin++; tempLoss = 0; }
    else if (t.result === "loss") { tempLoss++; tempWin = 0; }
    else { tempWin = 0; tempLoss = 0; }

    if (tempWin > highestWin) highestWin = tempWin;
    if (tempLoss > highestLoss) highestLoss = tempLoss;
  });

  const rrColor =
    totalRR > 0 ? "#22c55e" :
    totalRR < 0 ? "#ef4444" : "#ffffff";

  const streakColor =
    highestWin > highestLoss ? "#22c55e" :
    highestLoss > highestWin ? "#ef4444" : "#ffffff";

  const canvas = createCanvas(1200, 750);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b1120";
  ctx.fillRect(0, 0, 1200, 750);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Inter";
  ctx.fillText("TRADING PERFORMANCE DASHBOARD", 250, 70);

  drawCard(ctx, 100, 130, 300, 180, "#ffffff");
  drawCard(ctx, 450, 130, 300, 180, "#22d3ee");
  drawCard(ctx, 800, 130, 300, 180, rrColor);

  ctx.font = "bold 20px Inter";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("TOTAL TRADES", 180, 170);
  ctx.fillText("WIN RATE", 540, 170);
  ctx.fillText("TOTAL RR", 900, 170);

  ctx.font = "bold 42px Inter";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(total, 220, 240);

  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`${winRate}%`, 540, 240);

  ctx.fillStyle = rrColor;
  ctx.fillText(`${totalRR.toFixed(2)} RR`, 860, 240);

  drawCard(ctx, 100, 350, 450, 200, "#ffffff");
  drawCard(ctx, 650, 350, 450, 200, streakColor);

  ctx.font = "bold 22px Inter";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("AVERAGE PERFORMANCE", 200, 390);
  ctx.fillText("RECORD STREAKS", 780, 390);

  ctx.font = "28px Inter";
  ctx.fillStyle = "#22c55e";
  ctx.fillText(`Avg Win: ${avgWin} RR`, 200, 440);

  ctx.fillStyle = "#ef4444";
  ctx.fillText(`Avg Loss: ${avgLoss} RR`, 200, 490);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(`Highest Win: ${highestWin}`, 780, 440);
  ctx.fillText(`Highest Loss: ${highestLoss}`, 780, 490);

  drawCard(ctx, 300, 600, 600, 120, streakColor);

  ctx.font = "bold 30px Inter";
  ctx.fillStyle = streakColor;

  ctx.fillText(
    highestWin > highestLoss
      ? "Winning Momentum Dominant"
      : highestLoss > highestWin
        ? "Drawdown Phase Dominant"
        : "Balanced Performance",
    420,
    670
  );

  return canvas.toBuffer();
}

/* ================= INTERACTIONS ================= */

client.on(Events.InteractionCreate, async (interaction) => {

  if (interaction.isStringSelectMenu()) {

    const ownerId = interaction.customId.split("_")[1];
    if (interaction.user.id !== ownerId)
      return interaction.reply({ content: "Not your trade.", ephemeral: true });

    const selected = interaction.values[0];

    if (selected === "win") {
      const modal = new ModalBuilder()
        .setCustomId(`rr_${interaction.user.id}_${interaction.message.id}`)
        .setTitle("Enter RR");

      const input = new TextInputBuilder()
        .setCustomId("rr_input")
        .setLabel("Enter RR value")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (selected === "loss")
      db.run(`INSERT INTO trades (userId,result,rr) VALUES (?,?,?)`,
        [interaction.user.id,"loss",-1]);

    if (selected === "be")
      db.run(`INSERT INTO trades (userId,result,rr) VALUES (?,?,?)`,
        [interaction.user.id,"be",0]);

    return interaction.update({ content:"Trade saved.", components:[] });
  }

  if (interaction.isModalSubmit()) {

    const parts = interaction.customId.split("_");
    const ownerId = parts[1];
    const messageId = parts[2];

    if (interaction.user.id !== ownerId) return;

    const rr = parseFloat(interaction.fields.getTextInputValue("rr_input"));
    if (isNaN(rr))
      return interaction.reply({ content:"Invalid number.", ephemeral:true });

    db.run(`INSERT INTO trades (userId,result,rr) VALUES (?,?,?)`,
      [interaction.user.id,"win",rr]);

    const msg = await interaction.channel.messages.fetch(messageId);
    await msg.edit({ content:`WIN recorded (${rr} RR)`, components:[] });

    return interaction.reply({ content:"Recorded.", ephemeral:true });
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "remove") {

    const count = interaction.options.getInteger("count") || 1;

    db.run(`
      DELETE FROM trades WHERE id IN (
        SELECT id FROM trades WHERE userId=?
        ORDER BY id DESC LIMIT ?
      )
    `,[interaction.user.id,count],
    function() {
      if (this.changes === 0)
        return interaction.reply("No trades to remove.");
      interaction.reply(`Removed ${count} trade(s).`);
    });
  }

  if (interaction.commandName === "stats") {

    db.all(`SELECT * FROM trades WHERE userId=? ORDER BY id ASC`,
      [interaction.user.id],
      async (err, rows) => {

        if (rows.length === 0)
          return interaction.reply("No trades recorded.");

        const image = generateDashboard(rows);
        const attachment = new AttachmentBuilder(image,{name:"dashboard.png"});
        interaction.reply({files:[attachment]});
      });
  }

  if (interaction.commandName === "equitycurve") {

    db.all(`SELECT rr FROM trades WHERE userId=? ORDER BY id ASC`,
      [interaction.user.id],
      async (err, rows) => {

        if(rows.length===0)
          return interaction.reply("No trades recorded.");

        let cumulative=0;
        const equity=rows.map(t=>cumulative+=t.rr);

        const chart=new ChartJSNodeCanvas({
          width:1000,height:500,backgroundColour:"#0b1120"
        });

        const config={
          type:"line",
          data:{
            labels:equity.map((_,i)=>i+1),
            datasets:[{
              data:equity,
              borderColor:"#22d3ee",
              borderWidth:3,
              tension:0.4
            }]
          },
          options:{
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:"#ffffff"}},
              y:{ticks:{color:"#ffffff"}}
            }
          }
        };

        const image=await chart.renderToBuffer(config);
        const attachment=new AttachmentBuilder(image,{name:"equity.png"});
        interaction.reply({files:[attachment]});
      });
  }

});

client.login(process.env.TOKEN);
