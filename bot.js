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

const DATA_DIR      = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const USERS_FILE    = path.join(DATA_DIR, "users.json");
const KEYS_FILE     = path.join(DATA_DIR, "keys.json");
const HWID_FILE     = path.join(DATA_DIR, "hwid.json");
const SCRIPTS_FILE  = path.join(DATA_DIR, "scripts.json");
const CONFIG_FILE   = path.join(DATA_DIR, "config.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback = {}) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) { console.error("loadJson error:", file, e.message); }
    return fallback;
}
function saveJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); }
    catch (e) { console.error("saveJson error:", file, e.message); }
}

function getUsers()   { return loadJson(USERS_FILE); }
function getKeys()    { return loadJson(KEYS_FILE); }
function getHwid()    { return loadJson(HWID_FILE); }
function getScripts() { return loadJson(SCRIPTS_FILE); }
function getConfig()  { return loadJson(CONFIG_FILE); }
function saveConfig(d) { saveJson(CONFIG_FILE, d); }

function getBuyerRoleId() {
    return getConfig().buyerRoleId || MEMBER_ROLE || null;
}

/* =================================================
   ACCESS ROLE HELPERS
   Config structure:
   {
     accessRoles: {
       panel:        ["roleId", ...],   // bisa lihat & klik panel
       protect:      ["roleId", ...],   // bisa protect script via web
       createScript: ["roleId", ...],   // bisa addscript
       all:          ["roleId", ...],   // shortcut: semua fitur
     }
   }
================================================= */

const ACCESS_FEATURES = ["panel", "protect", "createScript", "all"];

function getAccessRoles() {
    return getConfig().accessRoles || {};
}

function saveAccessRoles(accessRoles) {
    const config = getConfig();
    config.accessRoles = accessRoles;
    saveConfig(config);
}

/**
 * Cek apakah member boleh akses fitur tertentu.
 * Admin selalu boleh.
 * Kalau fitur "all" punya role member → boleh semua.
 */
function hasAccess(member, feature) {
    if (isAdmin(member)) return true;
    const ar = getAccessRoles();
    const allRoles = ar["all"] || [];
    const featRoles = ar[feature] || [];
    const allowed = [...new Set([...allRoles, ...featRoles])];
    if (allowed.length === 0) return true; // belum di-set = semua boleh
    return allowed.some(roleId => member.roles.cache.has(roleId));
}

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
        .setDescription("[ADMIN] Send KXLuaprotect control panel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("generatekey")
        .setDescription("[ADMIN] Generate new key(s)")
        .addIntegerOption(o => o.setName("amount").setDescription("How many keys to generate").setRequired(false))
        .addIntegerOption(o => o.setName("duration_days").setDescription("Duration in days (0 = lifetime)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("revokekey")
        .setDescription("[ADMIN] Revoke a key")
        .addStringOption(o => o.setName("key").setDescription("Key to revoke").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("listkeys")
        .setDescription("[ADMIN] View all keys")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("[ADMIN] Ban a user")
        .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("[ADMIN] Unban a user")
        .addUserOption(o => o.setName("user").setDescription("User to unban").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("whitelist")
        .setDescription("[ADMIN] Whitelist a user directly (no key redeem needed)")
        .addUserOption(o => o.setName("user").setDescription("User to whitelist").setRequired(true))
        .addStringOption(o => o.setName("script_id").setDescription("Script ID (leave empty = all scripts)").setRequired(false))
        .addIntegerOption(o => o.setName("duration_days").setDescription("Duration in days (0 = lifetime)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("removewhitelist")
        .setDescription("[ADMIN] Remove a user's whitelist")
        .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("listscripts")
        .setDescription("[ADMIN] List all scripts registered in the system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("addscript")
        .setDescription("[ADMIN] Add a new script to the system")
        .addStringOption(o => o.setName("name").setDescription("Script display name").setRequired(true))
        .addStringOption(o => o.setName("url").setDescription("Loader URL (e.g. https://yourserver.com/files/loaders/xxx.lua)").setRequired(true))
        .addStringOption(o => o.setName("key").setDescription("Script key (optional, leave empty if no key required)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("setrollbuyer")
        .setDescription("[ADMIN] Set the role given to users with an active key or whitelist")
        .addRoleOption(o => o.setName("role").setDescription("Role to assign to buyers/whitelisted users").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("viewrollbuyer")
        .setDescription("[ADMIN] View the currently configured buyer role")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // ── NEW: /accessrole ──
    new SlashCommandBuilder()
        .setName("accessrole")
        .setDescription("[ADMIN] Manage which roles can access panel, protect, or create scripts")
        .addSubcommand(sub =>
            sub.setName("set")
                .setDescription("Add a role that can access a feature")
                .addStringOption(o =>
                    o.setName("feature")
                        .setDescription("Feature to grant access to")
                        .setRequired(true)
                        .addChoices(
                            { name: "panel — lihat & klik panel bot",         value: "panel"        },
                            { name: "protect — protect script via web",        value: "protect"      },
                            { name: "createscript — tambah script (/addscript)", value: "createScript" },
                            { name: "all — semua fitur di atas",               value: "all"          },
                        )
                )
                .addRoleOption(o => o.setName("role").setDescription("Role yang diberi akses").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Hapus role dari akses suatu fitur")
                .addStringOption(o =>
                    o.setName("feature")
                        .setDescription("Feature yang mau di-revoke")
                        .setRequired(true)
                        .addChoices(
                            { name: "panel",        value: "panel"        },
                            { name: "protect",      value: "protect"      },
                            { name: "createscript", value: "createScript" },
                            { name: "all",          value: "all"          },
                        )
                )
                .addRoleOption(o => o.setName("role").setDescription("Role yang mau dihapus aksesnya").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("view")
                .setDescription("Lihat semua role yang punya akses ke tiap fitur")
        )
        .addSubcommand(sub =>
            sub.setName("reset")
                .setDescription("Reset semua access role (semua orang bisa akses lagi)")
        )
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
    return new Date(ts).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function getActiveAccess(userId) {
    const keys = getKeys();
    const wlEntry = keys[`WL_${userId}`];
    if (wlEntry && wlEntry.usedBy === userId && (!wlEntry.expireAt || wlEntry.expireAt > Date.now())) {
        return `WL_${userId}`;
    }
    const found = Object.entries(keys).find(([k, v]) =>
        !k.startsWith("WL_") &&
        v.usedBy === userId &&
        (!v.expireAt || v.expireAt > Date.now())
    );
    return found ? found[0] : null;
}

/* =================================================
   PANEL EMBED + BUTTONS
================================================= */

function buildPanel(guildName) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ KXLuaprotect Panel")
        .setDescription(
            `**Welcome to KXLuaprotect!**\n` +
            `This is the control panel for your script loader.\n\n` +
            `> 🔑 **Redeem Key** — Activate your license key\n` +
            `> 📄 **Get Script** — View your script loader code\n` +
            `> 👤 **Get Role** — Claim your buyer role (requires active key)\n` +
            `> ⚙️ **Reset HWID** — Reset your hardware ID (7-day cooldown)\n` +
            `> 📊 **Stats** — View system statistics`
        )
        .setColor(0x9565ff)
        .setFooter({ text: `KXLuaprotect • ${guildName}` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("btn_redeem").setLabel("Redeem Key").setEmoji("🔑").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("btn_viewscript").setLabel("Get Script").setEmoji("📄").setStyle(ButtonStyle.Primary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("btn_getrole").setLabel("Get Role").setEmoji("👤").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("btn_resethwid").setLabel("Reset HWID").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("btn_stats").setLabel("Stats").setEmoji("📊").setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row1, row2, row3] };
}

/* =================================================
   BUTTON HANDLERS
================================================= */

async function handleRedeemButton(interaction) {
    // Cek access role untuk "panel"
    if (!hasAccess(interaction.member, "panel")) {
        return interaction.reply({ content: "❌ Kamu tidak punya akses untuk menggunakan panel ini.", ephemeral: true });
    }
    const modal = new ModalBuilder()
        .setCustomId("modal_redeem")
        .setTitle("Redeem Key");
    const input = new TextInputBuilder()
        .setCustomId("redeem_key_input")
        .setLabel("Enter your key")
        .setPlaceholder("KXL-XXXXXX-XXXXXX-XXXXXX")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
}

async function handleViewScriptButton(interaction) {
    if (!hasAccess(interaction.member, "panel")) {
        return interaction.reply({ content: "❌ Kamu tidak punya akses untuk menggunakan panel ini.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);
    if (!accessKey) {
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });
    }

    const scripts = getScripts();
    const keys    = getKeys();
    const keyData = keys[accessKey];
    const allowedScriptId = keyData?.scriptId || null;

    const list = [];
    for (const [id, sc] of Object.entries(scripts)) {
        const allowed = !allowedScriptId || allowedScriptId === id;
        if (allowed && sc.enabled !== false) list.push({ id, ...sc });
    }

    if (list.length === 0) {
        return interaction.editReply({ content: `❌ No scripts found. Visit ${BASE_URL} to set one up.` });
    }

    const embeds = list.slice(0, 3).map(sc => {
        const loaderText = sc.key
            ? `script_key = "${sc.key}"\nloadstring(game:HttpGet("${sc.url}"))()`
            : `loadstring(game:HttpGet("${sc.url}"))()`;
        const keyBadge = sc.key ? "🔑 Pakai Key" : "🔓 Tanpa Key";
        const keyValue = sc.key ? `\`${sc.key}\`` : "`—`";
        return new EmbedBuilder()
            .setTitle("📄 " + sc.name)
            .setColor(0x9565ff)
            .addFields(
                { name: "📡 Status",   value: sc.enabled ? "✅ Active" : "⛔ Disabled", inline: true },
                { name: "📅 Created",  value: formatDate(sc.createdAt),                  inline: true },
                { name: "🔑 Key Type", value: keyBadge,                                  inline: true },
                { name: "🗝️ Key Value", value: keyValue,                                 inline: false },
                { name: "📋 Loader",   value: `\`\`\`lua\n${loaderText}\`\`\``,         inline: false },
            )
            .setFooter({ text: `Script ID: ${sc.id}` })
            .setTimestamp();
    });

    await interaction.editReply({ embeds });
}

async function handleGetRoleButton(interaction) {
    if (!hasAccess(interaction.member, "panel")) {
        return interaction.reply({ content: "❌ Kamu tidak punya akses untuk menggunakan panel ini.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const buyerRoleId = getBuyerRoleId();
    if (!buyerRoleId) {
        return interaction.editReply({
            content: "❌ No buyer role has been configured yet.\nAsk an admin to run `/setrollbuyer`."
        });
    }

    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);
    if (!accessKey) {
        return interaction.editReply({
            content: "❌ You don't have an active key or whitelist. Click **Redeem Key** first."
        });
    }

    if (interaction.member.roles.cache.has(buyerRoleId)) {
        return interaction.editReply({ content: "✅ You already have the buyer role!" });
    }

    try {
        await interaction.member.roles.add(buyerRoleId);
        const role = interaction.guild.roles.cache.get(buyerRoleId);
        await interaction.editReply({ content: `✅ You have been given the **${role?.name ?? "Buyer"}** role!` });
    } catch (e) {
        await interaction.editReply({ content: "❌ Failed to assign role: " + e.message });
    }
}

async function handleResetHwidButton(interaction) {
    if (!hasAccess(interaction.member, "panel")) {
        return interaction.reply({ content: "❌ Kamu tidak punya akses untuk menggunakan panel ini.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);
    if (!accessKey) {
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });
    }

    const hwidMap  = getHwid();
    const entry    = hwidMap[userId];
    const COOLDOWN = 7 * 24 * 60 * 60 * 1000;

    if (entry?.lastReset && (Date.now() - entry.lastReset) < COOLDOWN) {
        const nextReset = new Date(entry.lastReset + COOLDOWN);
        return interaction.editReply({
            content: `❌ HWID reset is on cooldown.\n⏳ Next reset available: **${nextReset.toLocaleDateString("en-US")}**`
        });
    }

    hwidMap[userId] = { hwid: null, lastReset: Date.now() };
    saveJson(HWID_FILE, hwidMap);
    await interaction.editReply({ content: "✅ HWID has been reset! Run your script to register a new HWID." });
}

async function handleStatsButton(interaction) {
    if (!hasAccess(interaction.member, "panel")) {
        return interaction.reply({ content: "❌ Kamu tidak punya akses untuk menggunakan panel ini.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);
    if (!accessKey && !isAdmin(interaction.member)) {
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });
    }

    const scripts    = getScripts();
    const users      = getUsers();
    const keys       = getKeys();
    const allKeys    = Object.entries(keys);
    const normalKeys = allKeys.filter(([k]) => !k.startsWith("WL_"));
    const wlCount    = allKeys.length - normalKeys.length;

    const embed = new EmbedBuilder()
        .setTitle("📊 KXLuaprotect Stats")
        .setColor(0x9565ff)
        .addFields(
            { name: "📄 Total Scripts",     value: `\`${Object.keys(scripts).length}\``,                              inline: true },
            { name: "✅ Active Scripts",    value: `\`${Object.values(scripts).filter(s => s.enabled).length}\``,    inline: true },
            { name: "👥 Total Users",       value: `\`${Object.keys(users).length}\``,                               inline: true },
            { name: "🔑 Total Keys",        value: `\`${normalKeys.length}\``,                                        inline: true },
            { name: "✅ Keys Used",         value: `\`${normalKeys.filter(([, v]) => v.usedBy).length}\``,            inline: true },
            { name: "⭐ Whitelisted Users", value: `\`${wlCount}\``,                                                  inline: true },
        )
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* =================================================
   MODAL — REDEEM
================================================= */

async function handleRedeemModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;
    const key     = interaction.fields.getTextInputValue("redeem_key_input").trim().toUpperCase();
    const keys    = getKeys();
    const users   = getUsers();

    const existing = getActiveAccess(userId);
    if (existing) {
        const expireAt = keys[existing]?.expireAt;
        return interaction.editReply({
            content:
                `✅ You already have an active key: \`${existing}\`\n` +
                `Expires: **${timeLeft(expireAt)}**\n\nNo need to redeem again!`
        });
    }

    if (!keys[key])
        return interaction.editReply({ content: "❌ Invalid key." });

    const keyData = keys[key];

    if (keyData.usedBy && keyData.usedBy !== userId)
        return interaction.editReply({ content: "❌ This key has already been claimed by another user." });

    if (keyData.expireAt && keyData.expireAt < Date.now())
        return interaction.editReply({ content: "❌ This key has expired." });

    keyData.usedBy   = userId;
    keyData.usedAt   = Date.now();
    keyData.username = interaction.user.username;
    keys[key] = keyData;
    saveJson(KEYS_FILE, keys);

    if (!users[userId]) users[userId] = { id: userId, username: interaction.user.username };
    users[userId].activeKey   = key;
    users[userId].keyExpireAt = keyData.expireAt || null;
    saveJson(USERS_FILE, users);

    const buyerRoleId = getBuyerRoleId();
    if (buyerRoleId) {
        try { await interaction.member.roles.add(buyerRoleId); } catch (e) {}
    }

    const embed = new EmbedBuilder()
        .setTitle("🎉 Key Redeemed Successfully!")
        .setColor(0x57f287)
        .addFields(
            { name: "🔑 Key",     value: `\`${key}\``,              inline: true },
            { name: "⏳ Expires", value: timeLeft(keyData.expireAt), inline: true },
        )
        .setDescription("You can now click **Get Script** to view your loader code.")
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* =================================================
   ADMIN COMMANDS
================================================= */

async function handleGenerateKey(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const amount = interaction.options.getInteger("amount") || 1;
    const days   = interaction.options.getInteger("duration_days") ?? 30;
    if (amount > 20) return interaction.editReply({ content: "❌ Maximum 20 keys at once." });

    const keys      = getKeys();
    const generated = [];
    for (let i = 0; i < amount; i++) {
        const key = generateKey();
        keys[key] = {
            createdAt: Date.now(),
            expireAt:  days > 0 ? Date.now() + days * 86400000 : null,
            usedBy:    null,
            createdBy: interaction.user.id,
        };
        generated.push(key);
    }
    saveJson(KEYS_FILE, keys);

    const embed = new EmbedBuilder()
        .setTitle(`🔑 ${amount} Key(s) Generated`)
        .setColor(0x57f287)
        .setDescription("```\n" + generated.join("\n") + "\n```")
        .addFields({ name: "⏳ Duration", value: days > 0 ? `${days} days` : "Lifetime", inline: true })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleRevokeKey(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const key  = interaction.options.getString("key").trim().toUpperCase();
    const keys = getKeys();
    if (!keys[key]) return interaction.editReply({ content: "❌ Key not found." });

    const wasUsedBy = keys[key].usedBy;
    delete keys[key];
    saveJson(KEYS_FILE, keys);

    if (wasUsedBy) {
        const users = getUsers();
        if (users[wasUsedBy]?.activeKey === key) {
            users[wasUsedBy].activeKey = null;
            saveJson(USERS_FILE, users);
            const buyerRoleId = getBuyerRoleId();
            if (buyerRoleId) {
                try {
                    const member = await interaction.guild.members.fetch(wasUsedBy);
                    await member.roles.remove(buyerRoleId);
                } catch (e) {}
            }
        }
    }
    await interaction.editReply({ content: `✅ Key \`${key}\` has been revoked.` });
}

async function handleListKeys(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const keys = getKeys();
    const list = Object.entries(keys).filter(([k]) => !k.startsWith("WL_"));
    if (list.length === 0) return interaction.editReply({ content: "No keys found." });

    const lines = list.slice(0, 20).map(([k, v]) => {
        const status = !v.usedBy ? "⬜ Free"
            : (v.expireAt && v.expireAt < Date.now()) ? "⛔ Expired" : "✅ Used";
        return `\`${k}\` ${status} — ${timeLeft(v.expireAt)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`🔑 Key List (${list.length} total)`)
        .setColor(0x9565ff)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Showing ${Math.min(list.length, 20)} of ${list.length}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleBan(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    users[target.id] = { ...(users[target.id] || {}), id: target.id, username: target.username, banned: true };
    saveJson(USERS_FILE, users);
    await interaction.editReply({ content: `✅ **${target.username}** has been banned.` });
}

async function handleUnban(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    if (!users[target.id]) return interaction.editReply({ content: "❌ User not found." });
    users[target.id].banned = false;
    saveJson(USERS_FILE, users);
    await interaction.editReply({ content: `✅ **${target.username}** has been unbanned.` });
}

async function handleWhitelist(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const target      = interaction.options.getUser("user");
    const scriptId    = interaction.options.getString("script_id") || null;
    const durationDay = interaction.options.getInteger("duration_days") ?? 30;
    const scripts     = getScripts();
    const keys        = getKeys();
    const users       = getUsers();

    if (scriptId && !scripts[scriptId]) {
        const scriptList = Object.entries(scripts).map(([id, sc]) => `\`${id}\` — ${sc.name}`).join("\n") || "No scripts found.";
        return interaction.editReply({ content: `❌ Script ID \`${scriptId}\` not found.\n\n**Available scripts:**\n${scriptList}` });
    }

    const wlKey    = `WL_${target.id}`;
    const expireAt = durationDay > 0 ? Date.now() + durationDay * 86400000 : null;
    const existing = keys[wlKey];

    if (existing && (!existing.expireAt || existing.expireAt > Date.now())) {
        keys[wlKey] = { ...existing, expireAt, scriptId, updatedAt: Date.now(), updatedBy: interaction.user.id };
        saveJson(KEYS_FILE, keys);
        return interaction.editReply({
            content:
                `✅ Updated whitelist for **${target.username}**\n` +
                `📄 Script: \`${scriptId ? scripts[scriptId].name : "All Scripts"}\`\n` +
                `⏳ Expires: **${timeLeft(expireAt)}**`
        });
    }

    keys[wlKey] = {
        type: "whitelist", usedBy: target.id, username: target.username,
        scriptId, createdAt: Date.now(), createdBy: interaction.user.id, expireAt,
    };
    saveJson(KEYS_FILE, keys);

    if (!users[target.id]) users[target.id] = { id: target.id, username: target.username };
    users[target.id].whitelisted = true;
    users[target.id].wlExpireAt  = expireAt;
    saveJson(USERS_FILE, users);

    const buyerRoleId = getBuyerRoleId();
    if (buyerRoleId) {
        try { const m = await interaction.guild.members.fetch(target.id); await m.roles.add(buyerRoleId); } catch (e) {}
    }

    const scriptName = scriptId ? scripts[scriptId].name : "All Scripts";
    const embed = new EmbedBuilder()
        .setTitle("⭐ User Whitelisted")
        .setColor(0x57f287)
        .addFields(
            { name: "👤 User",    value: `${target} (\`${target.id}\`)`, inline: false },
            { name: "📄 Script",  value: `\`${scriptName}\``,             inline: true  },
            { name: "⏳ Expires", value: timeLeft(expireAt),              inline: true  },
            { name: "👮 By",      value: `${interaction.user}`,            inline: true  },
        )
        .setDescription(`**${target.username}** can now click **Get Script** on the panel without redeeming a key.`)
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleRemoveWhitelist(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const target = interaction.options.getUser("user");
    const keys   = getKeys();
    const wlKey  = `WL_${target.id}`;
    if (!keys[wlKey]) return interaction.editReply({ content: `❌ **${target.username}** is not whitelisted.` });

    delete keys[wlKey];
    saveJson(KEYS_FILE, keys);

    const users = getUsers();
    if (users[target.id]) { users[target.id].whitelisted = false; saveJson(USERS_FILE, users); }

    const buyerRoleId = getBuyerRoleId();
    if (buyerRoleId) {
        try { const m = await interaction.guild.members.fetch(target.id); await m.roles.remove(buyerRoleId); } catch (e) {}
    }

    await interaction.editReply({ content: `✅ Whitelist removed for **${target.username}**.` });
}

async function handleAddScript(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member) && !hasAccess(interaction.member, "createScript")) {
        return interaction.editReply({ content: "❌ Kamu tidak punya akses untuk menambah script." });
    }

    const name    = interaction.options.getString("name").trim();
    const url     = interaction.options.getString("url").trim();
    const key     = interaction.options.getString("key")?.trim() || null;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return interaction.editReply({ content: "❌ URL harus dimulai dengan `http://` atau `https://`" });
    }

    const scripts   = getScripts();
    const scriptId  = crypto.randomBytes(18).toString("hex");

    scripts[scriptId] = {
        id:        scriptId,
        name:      name,
        url:       url,
        key:       key,
        enabled:   true,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
    };
    saveJson(SCRIPTS_FILE, scripts);

    const loaderText = key
        ? `script_key = "${key}"\nloadstring(game:HttpGet("${url}"))()`
        : `loadstring(game:HttpGet("${url}"))()`;

    const embed = new EmbedBuilder()
        .setTitle("✅ Script Added")
        .setColor(0x57f287)
        .addFields(
            { name: "📄 Name",    value: `\`${name}\``,                         inline: true  },
            { name: "🔑 Key",     value: key ? `\`${key}\`` : "`Tidak ada key`", inline: true  },
            { name: "📡 Status",  value: "✅ Active",                            inline: true  },
            { name: "🆔 Script ID", value: `\`${scriptId}\``,                   inline: false },
            { name: "📋 Loader",  value: `\`\`\`lua\n${loaderText}\`\`\``,      inline: false },
        )
        .setDescription("Script berhasil ditambahkan. Pengguna dengan key aktif bisa melihatnya via **Get Script**.")
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleListScripts(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const scripts = getScripts();
    const list    = Object.entries(scripts);
    if (list.length === 0) return interaction.editReply({ content: `❌ No scripts found. Visit ${BASE_URL}` });

    const lines = list.map(([id, sc]) => {
        const keyInfo = sc.key ? `🔑 \`${sc.key}\`` : "🔓 No Key";
        return `${sc.enabled ? "✅" : "⛔"} \`${id}\` — **${sc.name}** | ${keyInfo} | Created: ${formatDate(sc.createdAt)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`📄 Scripts (${list.length} total)`)
        .setColor(0x9565ff)
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Use the script ID with /whitelist script_id" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* =================================================
   SETROLLBUYER / VIEWROLLBUYER
================================================= */

async function handleSetRollBuyer(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const role     = interaction.options.getRole("role");
    const config   = getConfig();
    const prevId   = config.buyerRoleId || null;
    config.buyerRoleId = role.id;
    saveConfig(config);

    const embed = new EmbedBuilder()
        .setTitle("✅ Buyer Role Updated")
        .setColor(0x57f287)
        .setDescription(
            `Users with an **active key** or **whitelist** will receive <@&${role.id}> when they click **Get Role**.\n\n` +
            `Role is also auto-assigned on key redeem and \`/whitelist\`.`
        )
        .addFields(
            { name: "👤 New Role",      value: `${role} (\`${role.id}\`)`,                                    inline: false },
            { name: "🔄 Previous Role", value: prevId ? `<@&${prevId}> (\`${prevId}\`)` : "None",             inline: false },
        )
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleViewRollBuyer(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const buyerRoleId = getBuyerRoleId();
    if (!buyerRoleId) {
        return interaction.editReply({
            content: "❌ No buyer role configured yet.\nUse `/setrollbuyer role:@YourRole` to set one."
        });
    }

    const role        = interaction.guild.roles.cache.get(buyerRoleId);
    const memberCount = role?.members?.size ?? "?";
    const source      = getConfig().buyerRoleId ? "Set via `/setrollbuyer`" : "MEMBER_ROLE env var";

    const embed = new EmbedBuilder()
        .setTitle("👤 Current Buyer Role")
        .setColor(0x9565ff)
        .addFields(
            { name: "Role",    value: role ? `${role} (\`${role.id}\`)` : `\`${buyerRoleId}\` *(not found)*`, inline: false },
            { name: "Members", value: `\`${memberCount}\``,                                                     inline: true  },
            { name: "Source",  value: source,                                                                   inline: true  },
        )
        .setFooter({ text: "Use /setrollbuyer to change" })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/* =================================================
   /accessrole HANDLER
================================================= */

const FEATURE_LABELS = {
    panel:        "Panel (Redeem, Get Script, dll)",
    protect:      "Protect Script (web)",
    createScript: "Create Script (/addscript)",
    all:          "Semua Fitur",
};

async function handleAccessRole(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
        const feature = interaction.options.getString("feature");
        const role    = interaction.options.getRole("role");
        const ar      = getAccessRoles();
        if (!ar[feature]) ar[feature] = [];
        if (!ar[feature].includes(role.id)) ar[feature].push(role.id);
        saveAccessRoles(ar);

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Access Role Set")
                    .setColor(0x57f287)
                    .addFields(
                        { name: "🎯 Fitur",   value: FEATURE_LABELS[feature] || feature, inline: false },
                        { name: "👤 Role",    value: `${role} (\`${role.id}\`)`,         inline: false },
                        { name: "📌 Status",  value: "Role ini sekarang bisa akses fitur tersebut.", inline: false },
                    )
                    .setFooter({ text: "KXLuaprotect • /accessrole view untuk lihat semua" })
                    .setTimestamp()
            ]
        });
    }

    if (sub === "remove") {
        const feature = interaction.options.getString("feature");
        const role    = interaction.options.getRole("role");
        const ar      = getAccessRoles();
        if (!ar[feature] || !ar[feature].includes(role.id)) {
            return interaction.editReply({ content: `❌ Role ${role} tidak ada di akses fitur **${FEATURE_LABELS[feature] || feature}**.` });
        }
        ar[feature] = ar[feature].filter(id => id !== role.id);
        if (ar[feature].length === 0) delete ar[feature];
        saveAccessRoles(ar);
        return interaction.editReply({ content: `✅ Role ${role} dihapus dari akses fitur **${FEATURE_LABELS[feature] || feature}**.` });
    }

    if (sub === "view") {
        const ar = getAccessRoles();

        const lines = ACCESS_FEATURES.map(feat => {
            const roles = ar[feat] || [];
            const roleStr = roles.length > 0
                ? roles.map(id => `<@&${id}>`).join(", ")
                : "`Semua orang (belum di-set)`";
            return `**${FEATURE_LABELS[feat]}**\n└ ${roleStr}`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🔐 Access Role Configuration")
            .setColor(0x9565ff)
            .setDescription(lines.join("\n\n"))
            .setFooter({ text: "KXLuaprotect • /accessrole set untuk tambah role" })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "reset") {
        saveAccessRoles({});
        return interaction.editReply({ content: "✅ Semua access role di-reset. Sekarang semua orang bisa akses semua fitur." });
    }
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
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case "panel":
                    if (!isAdmin(interaction.member))
                        return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
                    return await interaction.reply(buildPanel(interaction.guild?.name || "KXL"));
                case "generatekey":     return await handleGenerateKey(interaction);
                case "revokekey":       return await handleRevokeKey(interaction);
                case "listkeys":        return await handleListKeys(interaction);
                case "ban":             return await handleBan(interaction);
                case "unban":           return await handleUnban(interaction);
                case "whitelist":       return await handleWhitelist(interaction);
                case "removewhitelist": return await handleRemoveWhitelist(interaction);
                case "listscripts":     return await handleListScripts(interaction);
                case "addscript":       return await handleAddScript(interaction);
                case "setrollbuyer":    return await handleSetRollBuyer(interaction);
                case "viewrollbuyer":   return await handleViewRollBuyer(interaction);
                case "accessrole":      return await handleAccessRole(interaction);
            }
        }

        if (interaction.isButton()) {
            switch (interaction.customId) {
                case "btn_redeem":     return await handleRedeemButton(interaction);
                case "btn_viewscript": return await handleViewScriptButton(interaction);
                case "btn_getrole":    return await handleGetRoleButton(interaction);
                case "btn_resethwid":  return await handleResetHwidButton(interaction);
                case "btn_stats":      return await handleStatsButton(interaction);
            }
        }

        if (interaction.isModalSubmit()) {
            switch (interaction.customId) {
                case "modal_redeem": return await handleRedeemModal(interaction);
            }
        }

    } catch (e) {
        console.error("Interaction error:", e);
        try { await interaction.editReply({ content: "❌ An error occurred." }); } catch (_) {}
    }
});

if (!TOKEN) {
    console.error("❌ BOT_TOKEN is not set!");
    process.exit(1);
}

client.login(TOKEN);
