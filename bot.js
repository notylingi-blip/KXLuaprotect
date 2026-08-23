const {
    Client, GatewayIntentBits, REST, Routes,
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

/* =================================================
   CONFIG
================================================= */

const TOKEN       = process.env.BOT_TOKEN;
const CLIENT_ID   = process.env.DISCORD_CLIENT_ID || "1540862780545179698";
const GUILD_ID    = process.env.GUILD_ID          || "1530091511851520180";
const ADMIN_ROLE  = process.env.ADMIN_ROLE_ID     || "1530094098856546445";
const MEMBER_ROLE = process.env.MEMBER_ROLE_ID    || "";
const BASE_URL    = process.env.BASE_URL           || "https://kxluaprotect-production-a8eb.up.railway.app";

/* =================================================
   DATA
================================================= */

const DATA_DIR     = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const USERS_FILE   = path.join(DATA_DIR, "users.json");
const KEYS_FILE    = path.join(DATA_DIR, "keys.json");
const HWID_FILE    = path.join(DATA_DIR, "hwid.json");
const SCRIPTS_FILE = path.join(DATA_DIR, "scripts.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback = {}) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) {}
    return fallback;
}
function saveJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); } catch (e) {}
}
function getUsers()   { return loadJson(USERS_FILE); }
function getKeys()    { return loadJson(KEYS_FILE); }
function getHwid()    { return loadJson(HWID_FILE); }
function getScripts() { return loadJson(SCRIPTS_FILE); }

function generateKey() {
    const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase();
    return `KXL-${seg()}-${seg()}-${seg()}`;
}

/* =================================================
   SLASH COMMANDS
================================================= */

const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Kirim panel kontrol KXLuaprotect"),

    new SlashCommandBuilder()
        .setName("generatekey")
        .setDescription("[ADMIN] Generate key baru")
        .addIntegerOption(o => o.setName("jumlah").setDescription("Berapa key").setRequired(false))
        .addIntegerOption(o => o.setName("durasi_hari").setDescription("Durasi hari (0 = lifetime)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("revokekey")
        .setDescription("[ADMIN] Revoke key")
        .addStringOption(o => o.setName("key").setDescription("Key yang mau direvoke").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("listkeys")
        .setDescription("[ADMIN] Lihat semua key")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("[ADMIN] Ban user")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("[ADMIN] Unban user")
        .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map(c => c.toJSON());

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✅ Slash commands registered.");
    } catch (e) { console.error("❌ Register error:", e.message); }
}

/* =================================================
   HELPERS
================================================= */

function isAdmin(member) {
    return member.roles.cache.has(ADMIN_ROLE) || member.permissions.has(PermissionFlagsBits.Administrator);
}
function timeLeft(expireAt) {
    if (!expireAt) return "♾️ Lifetime";
    const diff = expireAt - Date.now();
    if (diff <= 0) return "⛔ Expired";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return `${d}d ${h}h`;
}
function formatDate(ts) {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/* =================================================
   PANEL EMBED + BUTTONS
================================================= */

function buildPanel(guildName) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ KXLuaprotect Panel")
        .setDescription(
            `**Welcome to KXLuaprotect!**\n` +
            `Ini adalah panel kontrol untuk script loader kamu.\n` +
            `Klik tombol di bawah untuk memulai.`
        )
        .setColor(0x9565ff)
        .setFooter({ text: `KXLuaprotect • ${guildName}` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("btn_redeem")
            .setLabel("Redeem Key")
            .setEmoji("🔑")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("btn_viewscript")
            .setLabel("Get Script")
            .setEmoji("📄")
            .setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("btn_getrole")
            .setLabel("Get Role")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("btn_resethwid")
            .setLabel("Reset HWID")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("btn_stats")
            .setLabel("Get Stats")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row1, row2, row3] };
}

/* =================================================
   BUTTON HANDLERS
================================================= */

async function handleRedeemButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("modal_redeem")
        .setTitle("Redeem Key");

    const input = new TextInputBuilder()
        .setCustomId("redeem_key_input")
        .setLabel("Masukkan key kamu")
        .setPlaceholder("KXL-XXXXXX-XXXXXX-XXXXXX")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
}

async function handleViewScriptButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;
    const scripts = getScripts();
    const users   = getUsers();
    const user    = users[userId];

    // Cek punya key aktif
    if (!user?.activeKey) {
        return interaction.editReply({ content: "❌ Kamu belum redeem key. Klik **Redeem Key** dulu." });
    }

    const list = [];
    for (const [id, sc] of Object.entries(scripts)) {
        if (sc.ownerId === userId || isAdmin(interaction.member)) {
            list.push({ id, ...sc });
        }
    }

    if (list.length === 0) {
        return interaction.editReply({ content: "❌ Belum ada script. Login ke " + BASE_URL });
    }

    const sc = list[0]; // tampil script pertama
    const loaderText = sc.key
        ? `script_key = "${sc.key}"\nloadstring(game:HttpGet("${sc.url}"))()`
        : `loadstring(game:HttpGet("${sc.url}"))()`;

    const embed = new EmbedBuilder()
        .setTitle("📄 " + sc.name)
        .setColor(0x9565ff)
        .addFields(
            { name: "📡 Status",  value: sc.enabled ? "✅ Aktif" : "⛔ Disabled", inline: true },
            { name: "📅 Dibuat", value: formatDate(sc.createdAt),                inline: true },
            { name: "🔑 Key",    value: `\`${sc.key || "N/A"}\``,                inline: false },
            { name: "📋 Loader", value: `\`\`\`lua\n${loaderText}\`\`\``,        inline: false },
        )
        .setFooter({ text: `Total script: ${list.length}` })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleGetRoleButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!MEMBER_ROLE)
        return interaction.editReply({ content: "❌ MEMBER_ROLE belum diset oleh admin." });

    const userId = interaction.user.id;
    const users  = getUsers();
    const keys   = getKeys();
    const user   = users[userId];

    if (!user?.activeKey)
        return interaction.editReply({ content: "❌ Kamu belum redeem key. Klik **Redeem Key** dulu." });

    const keyData = keys[user.activeKey];
    if (!keyData || (keyData.expireAt && keyData.expireAt < Date.now()))
        return interaction.editReply({ content: "❌ Key kamu expired. Hubungi admin." });

    if (interaction.member.roles.cache.has(MEMBER_ROLE))
        return interaction.editReply({ content: "✅ Kamu sudah punya role!" });

    try {
        await interaction.member.roles.add(MEMBER_ROLE);
        interaction.editReply({ content: "✅ Role berhasil diberikan!" });
    } catch (e) {
        interaction.editReply({ content: "❌ Gagal beri role: " + e.message });
    }
}

async function handleResetHwidButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;
    const hwidMap = getHwid();
    const entry   = hwidMap[userId];
    const COOLDOWN = 7 * 24 * 60 * 60 * 1000;

    if (entry?.lastReset && (Date.now() - entry.lastReset) < COOLDOWN) {
        const nextReset = new Date(entry.lastReset + COOLDOWN);
        return interaction.editReply({
            content: `❌ Cooldown belum habis.\n⏳ Bisa reset lagi: **${nextReset.toLocaleDateString("id-ID")}**`
        });
    }

    hwidMap[userId] = { hwid: null, lastReset: Date.now() };
    saveJson(HWID_FILE, hwidMap);
    interaction.editReply({ content: "✅ HWID berhasil direset! Jalankan script untuk register HWID baru." });
}

async function handleStatsButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const scripts = getScripts();
    const users   = getUsers();
    const keys    = getKeys();

    const totalScripts  = Object.keys(scripts).length;
    const activeScripts = Object.values(scripts).filter(s => s.enabled).length;
    const totalUsers    = Object.keys(users).length;
    const totalKeys     = Object.keys(keys).length;
    const usedKeys      = Object.values(keys).filter(k => k.usedBy).length;

    const embed = new EmbedBuilder()
        .setTitle("📊 KXLuaprotect Stats")
        .setColor(0x9565ff)
        .addFields(
            { name: "📄 Total Script",  value: `\`${totalScripts}\``,  inline: true },
            { name: "✅ Script Aktif",  value: `\`${activeScripts}\``, inline: true },
            { name: "👥 Total User",    value: `\`${totalUsers}\``,    inline: true },
            { name: "🔑 Total Key",     value: `\`${totalKeys}\``,     inline: true },
            { name: "✅ Key Terpakai",  value: `\`${usedKeys}\``,      inline: true },
        )
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

/* =================================================
   MODAL HANDLER — REDEEM
================================================= */

async function handleRedeemModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;
    const key     = interaction.fields.getTextInputValue("redeem_key_input").trim().toUpperCase();
    const keys    = getKeys();
    const users   = getUsers();

    if (!keys[key])
        return interaction.editReply({ content: "❌ Key tidak valid." });

    const keyData = keys[key];

    if (keyData.usedBy && keyData.usedBy !== userId)
        return interaction.editReply({ content: "❌ Key sudah dipakai orang lain." });

    if (keyData.expireAt && keyData.expireAt < Date.now())
        return interaction.editReply({ content: "❌ Key sudah expired." });

    if (keyData.usedBy === userId)
        return interaction.editReply({ content: `✅ Key ini sudah aktif di akunmu.\nExpire: **${timeLeft(keyData.expireAt)}**` });

    keyData.usedBy   = userId;
    keyData.usedAt   = Date.now();
    keyData.username = interaction.user.username;
    keys[key] = keyData;
    saveJson(KEYS_FILE, keys);

    if (!users[userId]) users[userId] = { id: userId, username: interaction.user.username };
    users[userId].activeKey   = key;
    users[userId].keyExpireAt = keyData.expireAt || null;
    saveJson(USERS_FILE, users);

    if (MEMBER_ROLE) {
        try { await interaction.member.roles.add(MEMBER_ROLE); } catch (e) {}
    }

    const embed = new EmbedBuilder()
        .setTitle("🎉 Key Berhasil Diredeem!")
        .setColor(0x57f287)
        .addFields(
            { name: "🔑 Key",     value: `\`${key}\``,             inline: true },
            { name: "⏳ Expire", value: timeLeft(keyData.expireAt), inline: true },
        )
        .setDescription("Sekarang kamu bisa klik **Get Script** untuk lihat loader kamu.")
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

/* =================================================
   ADMIN COMMAND HANDLERS
================================================= */

async function handleGenerateKey(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const jumlah = interaction.options.getInteger("jumlah") || 1;
    const durasi = interaction.options.getInteger("durasi_hari") ?? 30;
    if (jumlah > 20) return interaction.editReply({ content: "❌ Maks 20 key sekaligus." });

    const keys = getKeys();
    const generated = [];
    for (let i = 0; i < jumlah; i++) {
        const key = generateKey();
        keys[key] = {
            createdAt: Date.now(),
            expireAt:  durasi > 0 ? Date.now() + durasi * 86400000 : null,
            usedBy:    null,
            createdBy: interaction.user.id,
        };
        generated.push(key);
    }
    saveJson(KEYS_FILE, keys);

    const embed = new EmbedBuilder()
        .setTitle(`🔑 ${jumlah} Key Generated`)
        .setColor(0x57f287)
        .setDescription("```\n" + generated.join("\n") + "\n```")
        .addFields({ name: "⏳ Durasi", value: durasi > 0 ? `${durasi} hari` : "Lifetime", inline: true })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleRevokeKey(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const key  = interaction.options.getString("key").trim().toUpperCase();
    const keys = getKeys();
    if (!keys[key]) return interaction.editReply({ content: "❌ Key tidak ditemukan." });

    const wasUsedBy = keys[key].usedBy;
    delete keys[key];
    saveJson(KEYS_FILE, keys);

    if (wasUsedBy) {
        const users = getUsers();
        if (users[wasUsedBy]?.activeKey === key) {
            users[wasUsedBy].activeKey = null;
            saveJson(USERS_FILE, users);
            if (MEMBER_ROLE) {
                try {
                    const member = await interaction.guild.members.fetch(wasUsedBy);
                    await member.roles.remove(MEMBER_ROLE);
                } catch (e) {}
            }
        }
    }
    interaction.editReply({ content: `✅ Key \`${key}\` direvoke.` });
}

async function handleListKeys(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const keys = getKeys();
    const list = Object.entries(keys);
    if (list.length === 0) return interaction.editReply({ content: "Belum ada key." });

    const lines = list.slice(0, 20).map(([k, v]) => {
        const status = !v.usedBy ? "⬜ Free"
            : (v.expireAt && v.expireAt < Date.now()) ? "⛔ Expired" : "✅ Used";
        return `\`${k}\` ${status} ${timeLeft(v.expireAt)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`🔑 Daftar Key (${list.length} total)`)
        .setColor(0x9565ff)
        .setDescription(lines.join("\n"))
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleBan(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    users[target.id] = { ...(users[target.id] || {}), id: target.id, username: target.username, banned: true };
    saveJson(USERS_FILE, users);
    interaction.editReply({ content: `✅ **${target.username}** dibanned.` });
}

async function handleUnban(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    if (!users[target.id]) return interaction.editReply({ content: "❌ User tidak ditemukan." });
    users[target.id].banned = false;
    saveJson(USERS_FILE, users);
    interaction.editReply({ content: `✅ **${target.username}** diunban.` });
}

/* =================================================
   BOT CLIENT
================================================= */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
    console.log(`✅ Bot ready: ${client.user.tag}`);
    await registerCommands();
});

client.on("interactionCreate", async interaction => {
    try {
        // Slash commands
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case "panel":        return await interaction.reply(buildPanel(interaction.guild?.name || "KXL"));
                case "generatekey":  return await handleGenerateKey(interaction);
                case "revokekey":    return await handleRevokeKey(interaction);
                case "listkeys":     return await handleListKeys(interaction);
                case "ban":          return await handleBan(interaction);
                case "unban":        return await handleUnban(interaction);
            }
        }

        // Button clicks
        if (interaction.isButton()) {
            switch (interaction.customId) {
                case "btn_redeem":     return await handleRedeemButton(interaction);
                case "btn_viewscript": return await handleViewScriptButton(interaction);
                case "btn_getrole":    return await handleGetRoleButton(interaction);
                case "btn_resethwid":  return await handleResetHwidButton(interaction);
                case "btn_stats":      return await handleStatsButton(interaction);
            }
        }

        // Modal submit
        if (interaction.isModalSubmit()) {
            switch (interaction.customId) {
                case "modal_redeem": return await handleRedeemModal(interaction);
            }
        }

    } catch (e) {
        console.error("Interaction error:", e);
        try { await interaction.editReply({ content: "❌ Terjadi error." }); } catch (_) {}
    }
});

if (!TOKEN) {
    console.error("❌ BOT_TOKEN tidak diset!");
    process.exit(1);
}

client.login(TOKEN);
