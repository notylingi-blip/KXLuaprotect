const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

/* =================================================
   CONFIG
================================================= */

const TOKEN        = process.env.BOT_TOKEN;
const CLIENT_ID    = process.env.DISCORD_CLIENT_ID    || "1540862780545179698";
const GUILD_ID     = process.env.GUILD_ID             || "1530091511851520180";
const ADMIN_ROLE   = process.env.ADMIN_ROLE_ID        || "1530094098856546445";
const MEMBER_ROLE  = process.env.MEMBER_ROLE_ID       || "";   // Role yg dikasih saat redeem key
const BASE_URL     = process.env.BASE_URL             || "https://kxluaprotect-production-a8eb.up.railway.app";

/* =================================================
   DATA (shared dengan server.js via /data folder)
================================================= */

const DATA_DIR   = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const KEYS_FILE  = path.join(DATA_DIR, "keys.json");
const HWID_FILE  = path.join(DATA_DIR, "hwid.json");
const SCRIPTS_FILE = path.join(DATA_DIR, "scripts.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback = {}) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) { console.error("Load error:", e.message); }
    return fallback;
}

function saveJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); }
    catch (e) { console.error("Save error:", e.message); }
}

function getUsers()   { return loadJson(USERS_FILE); }
function getKeys()    { return loadJson(KEYS_FILE); }
function getHwid()    { return loadJson(HWID_FILE); }
function getScripts() {
    try {
        if (fs.existsSync(SCRIPTS_FILE)) {
            return JSON.parse(fs.readFileSync(SCRIPTS_FILE, "utf8"));
        }
    } catch (e) {}
    return {};
}

function generateKey() {
    const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase();
    return `KXL-${seg()}-${seg()}-${seg()}`;
}

/* =================================================
   SLASH COMMANDS
================================================= */

const commands = [
    // /viewscript
    new SlashCommandBuilder()
        .setName("viewscript")
        .setDescription("Lihat info script kamu")
        .addStringOption(o => o.setName("id").setDescription("Script ID (opsional)").setRequired(false)),

    // /redeem
    new SlashCommandBuilder()
        .setName("redeem")
        .setDescription("Redeem key untuk akses")
        .addStringOption(o => o.setName("key").setDescription("Key kamu").setRequired(true)),

    // /stats
    new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Lihat statistik bot & loader"),

    // /getrole
    new SlashCommandBuilder()
        .setName("getrole")
        .setDescription("Ambil role member jika sudah punya key aktif"),

    // /resethwid
    new SlashCommandBuilder()
        .setName("resethwid")
        .setDescription("Reset HWID kamu (1x per 7 hari)"),

    // /generatekey (admin)
    new SlashCommandBuilder()
        .setName("generatekey")
        .setDescription("[ADMIN] Generate key baru")
        .addIntegerOption(o => o.setName("jumlah").setDescription("Berapa key").setRequired(false))
        .addIntegerOption(o => o.setName("durasi_hari").setDescription("Durasi hari (0 = lifetime)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // /revokekey (admin)
    new SlashCommandBuilder()
        .setName("revokekey")
        .setDescription("[ADMIN] Hapus / revoke key")
        .addStringOption(o => o.setName("key").setDescription("Key yang mau direvoke").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // /listkeys (admin)
    new SlashCommandBuilder()
        .setName("listkeys")
        .setDescription("[ADMIN] Lihat semua key")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // /ban (admin)
    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("[ADMIN] Ban user dari sistem")
        .addUserOption(o => o.setName("user").setDescription("User yang mau dibn").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // /unban (admin)
    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("[ADMIN] Unban user")
        .addUserOption(o => o.setName("user").setDescription("User yang mau diunban").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map(c => c.toJSON());

/* =================================================
   REGISTER COMMANDS
================================================= */

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        console.log("Registering slash commands...");
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✅ Slash commands registered.");
    } catch (e) {
        console.error("❌ Failed to register commands:", e.message);
    }
}

/* =================================================
   HELPERS
================================================= */

function isAdmin(member) {
    return member.roles.cache.has(ADMIN_ROLE) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatDate(ts) {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function timeLeft(expireAt) {
    if (!expireAt) return "♾️ Lifetime";
    const diff = expireAt - Date.now();
    if (diff <= 0) return "⛔ Expired";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return `${d}d ${h}h`;
}

/* =================================================
   COMMAND HANDLERS
================================================= */

async function handleViewScript(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId    = interaction.user.id;
    const scriptId  = interaction.options.getString("id");
    const scripts   = getScripts();

    let list = [];
    for (const [id, sc] of Object.entries(scripts)) {
        if (sc.ownerId === userId || isAdmin(interaction.member)) {
            list.push({ id, ...sc });
        }
    }

    if (scriptId) {
        const sc = scripts[scriptId];
        if (!sc) return interaction.editReply({ content: "❌ Script tidak ditemukan." });
        if (sc.ownerId !== userId && !isAdmin(interaction.member))
            return interaction.editReply({ content: "❌ Bukan script kamu." });

        const loaderText = sc.key
            ? `script_key = "${sc.key}"\nloadstring(game:HttpGet("${sc.url}"))()`
            : `loadstring(game:HttpGet("${sc.url}"))()`;

        const embed = new EmbedBuilder()
            .setTitle("📄 " + sc.name)
            .setColor(0x9565ff)
            .addFields(
                { name: "🆔 ID",      value: `\`${scriptId}\``,                       inline: true },
                { name: "📡 Status",  value: sc.enabled ? "✅ Aktif" : "⛔ Disabled",  inline: true },
                { name: "📅 Dibuat", value: formatDate(sc.createdAt),                 inline: true },
                { name: "🔑 Key",    value: `\`${sc.key || "N/A"}\``,                 inline: false },
                { name: "📋 Loader", value: `\`\`\`lua\n${loaderText}\`\`\``,         inline: false },
            )
            .setFooter({ text: "KXLuaprotect" })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    if (list.length === 0)
        return interaction.editReply({ content: "❌ Kamu belum punya script. Buka " + BASE_URL });

    const embed = new EmbedBuilder()
        .setTitle("📦 Script Kamu")
        .setColor(0x9565ff)
        .setDescription(
            list.slice(0, 10).map((sc, i) =>
                `**${i+1}.** \`${sc.id.slice(0,10)}...\` — **${sc.name}** ${sc.enabled ? "✅" : "⛔"}`
            ).join("\n")
        )
        .setFooter({ text: `Total: ${list.length} script${list.length > 10 ? " (tampil 10 pertama)" : ""}` })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleRedeem(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const key    = interaction.options.getString("key").trim().toUpperCase();
    const keys   = getKeys();
    const users  = getUsers();

    // Cek key ada
    if (!keys[key]) return interaction.editReply({ content: "❌ Key tidak valid." });

    const keyData = keys[key];

    // Cek sudah dipakai user lain
    if (keyData.usedBy && keyData.usedBy !== userId)
        return interaction.editReply({ content: "❌ Key ini sudah dipakai orang lain." });

    // Cek expired
    if (keyData.expireAt && keyData.expireAt < Date.now())
        return interaction.editReply({ content: "❌ Key sudah expired." });

    // Sudah pernah pakai key yang sama
    if (keyData.usedBy === userId)
        return interaction.editReply({ content: `✅ Key ini sudah aktif di akunmu.\nExpire: **${timeLeft(keyData.expireAt)}**` });

    // Redeem
    keyData.usedBy    = userId;
    keyData.usedAt    = Date.now();
    keyData.username  = interaction.user.username;
    keys[key] = keyData;
    saveJson(KEYS_FILE, keys);

    // Update user
    if (!users[userId]) users[userId] = { id: userId, username: interaction.user.username };
    users[userId].activeKey   = key;
    users[userId].keyExpireAt = keyData.expireAt || null;
    saveJson(USERS_FILE, users);

    // Beri role jika MEMBER_ROLE diset
    if (MEMBER_ROLE) {
        try {
            await interaction.member.roles.add(MEMBER_ROLE);
        } catch (e) { console.error("Add role error:", e.message); }
    }

    const embed = new EmbedBuilder()
        .setTitle("🎉 Key Berhasil Diredeeem!")
        .setColor(0x57f287)
        .addFields(
            { name: "🔑 Key",     value: `\`${key}\``,               inline: true },
            { name: "⏳ Expire", value: timeLeft(keyData.expireAt),   inline: true },
        )
        .setDescription("Sekarang kamu bisa login ke " + BASE_URL)
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const scripts = getScripts();
    const users   = getUsers();
    const keys    = getKeys();

    const totalScripts  = Object.keys(scripts).length;
    const activeScripts = Object.values(scripts).filter(s => s.enabled).length;
    const totalUsers    = Object.keys(users).length;
    const totalKeys     = Object.keys(keys).length;
    const usedKeys      = Object.values(keys).filter(k => k.usedBy).length;
    const bannedUsers   = Object.values(users).filter(u => u.banned).length;

    const embed = new EmbedBuilder()
        .setTitle("📊 KXLuaprotect Stats")
        .setColor(0x9565ff)
        .addFields(
            { name: "📄 Total Script",  value: `\`${totalScripts}\``,               inline: true },
            { name: "✅ Script Aktif",  value: `\`${activeScripts}\``,              inline: true },
            { name: "👥 Total User",    value: `\`${totalUsers}\``,                 inline: true },
            { name: "🔑 Total Key",     value: `\`${totalKeys}\``,                  inline: true },
            { name: "✅ Key Terpakai",  value: `\`${usedKeys}\``,                   inline: true },
            { name: "🚫 User Banned",   value: `\`${bannedUsers}\``,                inline: true },
        )
        .setFooter({ text: "KXLuaprotect • " + BASE_URL })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleGetRole(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!MEMBER_ROLE)
        return interaction.editReply({ content: "❌ MEMBER_ROLE belum diset oleh admin." });

    const userId = interaction.user.id;
    const users  = getUsers();
    const keys   = getKeys();
    const user   = users[userId];

    if (!user?.activeKey)
        return interaction.editReply({ content: "❌ Kamu belum redeem key. Pakai `/redeem`." });

    const keyData = keys[user.activeKey];
    if (!keyData || (keyData.expireAt && keyData.expireAt < Date.now()))
        return interaction.editReply({ content: "❌ Key kamu expired. Hubungi admin." });

    try {
        await interaction.member.roles.add(MEMBER_ROLE);
        interaction.editReply({ content: "✅ Role berhasil diberikan!" });
    } catch (e) {
        interaction.editReply({ content: "❌ Gagal beri role: " + e.message });
    }
}

async function handleResetHwid(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;
    const hwidMap = getHwid();
    const entry   = hwidMap[userId];

    const COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 hari

    if (entry?.lastReset && (Date.now() - entry.lastReset) < COOLDOWN) {
        const nextReset = new Date(entry.lastReset + COOLDOWN);
        return interaction.editReply({
            content: `❌ Reset HWID cooldown belum habis.\n⏳ Bisa reset lagi: **${nextReset.toLocaleDateString("id-ID")}**`
        });
    }

    hwidMap[userId] = { hwid: null, lastReset: Date.now() };
    saveJson(HWID_FILE, hwidMap);

    interaction.editReply({ content: "✅ HWID kamu berhasil direset! Jalankan script kamu untuk register HWID baru." });
}

async function handleGenerateKey(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAdmin(interaction.member))
        return interaction.editReply({ content: "❌ Admin only." });

    const jumlah = interaction.options.getInteger("jumlah") || 1;
    const durasi = interaction.options.getInteger("durasi_hari") ?? 30;

    if (jumlah > 20) return interaction.editReply({ content: "❌ Maksimal 20 key sekaligus." });

    const keys      = getKeys();
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
        .setFooter({ text: "KXLuaprotect Admin" })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

async function handleRevokeKey(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAdmin(interaction.member))
        return interaction.editReply({ content: "❌ Admin only." });

    const key  = interaction.options.getString("key").trim().toUpperCase();
    const keys = getKeys();

    if (!keys[key]) return interaction.editReply({ content: "❌ Key tidak ditemukan." });

    const wasUsedBy = keys[key].usedBy;
    delete keys[key];
    saveJson(KEYS_FILE, keys);

    // Hapus dari user juga
    if (wasUsedBy) {
        const users = getUsers();
        if (users[wasUsedBy]?.activeKey === key) {
            users[wasUsedBy].activeKey   = null;
            users[wasUsedBy].keyExpireAt = null;
            saveJson(USERS_FILE, users);

            // Cabut role
            if (MEMBER_ROLE) {
                try {
                    const guild  = interaction.guild;
                    const member = await guild.members.fetch(wasUsedBy);
                    await member.roles.remove(MEMBER_ROLE);
                } catch (e) {}
            }
        }
    }

    interaction.editReply({ content: `✅ Key \`${key}\` berhasil direvoke.` });
}

async function handleListKeys(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!isAdmin(interaction.member))
        return interaction.editReply({ content: "❌ Admin only." });

    const keys = getKeys();
    const list = Object.entries(keys);

    if (list.length === 0) return interaction.editReply({ content: "Belum ada key." });

    const lines = list.slice(0, 20).map(([k, v]) => {
        const status = !v.usedBy ? "⬜ Free"
            : (v.expireAt && v.expireAt < Date.now()) ? "⛔ Expired"
            : "✅ Used";
        const user = v.usedBy ? `<@${v.usedBy}>` : "-";
        return `\`${k}\` ${status} ${user} ${timeLeft(v.expireAt)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`🔑 Daftar Key (${list.length} total)`)
        .setColor(0x9565ff)
        .setDescription(lines.join("\n"))
        .setFooter({ text: list.length > 20 ? "Menampilkan 20 pertama" : "" })
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

    interaction.editReply({ content: `✅ **${target.username}** berhasil dibanned.` });
}

async function handleUnban(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const target = interaction.options.getUser("user");
    const users  = getUsers();

    if (!users[target.id]) return interaction.editReply({ content: "❌ User tidak ditemukan di database." });
    users[target.id].banned = false;
    saveJson(USERS_FILE, users);

    interaction.editReply({ content: `✅ **${target.username}** berhasil diunban.` });
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
    if (!interaction.isChatInputCommand()) return;

    try {
        switch (interaction.commandName) {
            case "viewscript":   return await handleViewScript(interaction);
            case "redeem":       return await handleRedeem(interaction);
            case "stats":        return await handleStats(interaction);
            case "getrole":      return await handleGetRole(interaction);
            case "resethwid":    return await handleResetHwid(interaction);
            case "generatekey":  return await handleGenerateKey(interaction);
            case "revokekey":    return await handleRevokeKey(interaction);
            case "listkeys":     return await handleListKeys(interaction);
            case "ban":          return await handleBan(interaction);
            case "unban":        return await handleUnban(interaction);
        }
    } catch (e) {
        console.error("Command error:", e);
        try { await interaction.editReply({ content: "❌ Terjadi error, coba lagi." }); } catch (_) {}
    }
});

if (!TOKEN) {
    console.error("❌ BOT_TOKEN tidak diset di environment variables!");
    process.exit(1);
}

client.login(TOKEN);
