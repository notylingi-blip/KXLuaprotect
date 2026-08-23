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
const CONFIG_FILE  = path.join(DATA_DIR, "config.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function getConfig() { return loadJson(CONFIG_FILE); }
function saveConfig(data) { saveJson(CONFIG_FILE, data); }

/** Get the buyer role ID set by admin, or fall back to MEMBER_ROLE env */
function getBuyerRoleId() {
    const cfg = getConfig();
    return cfg.buyerRoleId || MEMBER_ROLE || null;
}

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
        .addStringOption(o => o.setName("script_id").setDescription("Script ID from your account (leave empty = all scripts)").setRequired(false))
        .addIntegerOption(o => o.setName("duration_days").setDescription("Duration in days (0 = lifetime)").setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("listscripts")
        .setDescription("[ADMIN] List all scripts registered in the system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("removewhitelist")
        .setDescription("[ADMIN] Remove a user's whitelist")
        .addUserOption(o => o.setName("user").setDescription("User to remove").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("setrollbuyer")
        .setDescription("[ADMIN] Set the role given to users who have an active key or whitelist")
        .addRoleOption(o => o.setName("role").setDescription("Role to assign to buyers/whitelisted users").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName("viewrollbuyer")
        .setDescription("[ADMIN] View the currently configured buyer role")
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

/**
 * Check if a user has an active key or whitelist access.
 * Returns the key string if found, null otherwise.
 */
function getActiveAccess(userId) {
    const keys = getKeys();

    // Check whitelist (direct admin-assigned access)
    const wlEntry = keys[`WL_${userId}`];
    if (wlEntry && wlEntry.usedBy === userId) {
        if (!wlEntry.expireAt || wlEntry.expireAt > Date.now()) {
            return `WL_${userId}`;
        }
    }

    // Check normal key
    const activeKey = Object.entries(keys).find(([k, v]) =>
        !k.startsWith("WL_") &&
        v.usedBy === userId &&
        (!v.expireAt || v.expireAt > Date.now())
    );
    return activeKey ? activeKey[0] : null;
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
            `> 👤 **Get Role** — Claim your member role\n` +
            `> ⚙️ **Reset HWID** — Reset your hardware ID (7-day cooldown)\n` +
            `> 📊 **Stats** — View system statistics`
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
            .setLabel("Stats")
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
        .setLabel("Enter your key")
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

    // Must have active access
    const accessKey = getActiveAccess(userId);
    if (!accessKey) {
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });
    }

    // Get scripts bound to this user's whitelist or all if key-based
    const keys   = getKeys();
    const keyData = keys[accessKey];
    const allowedScriptId = keyData?.scriptId || null; // null = all scripts

    const list = [];
    for (const [id, sc] of Object.entries(scripts)) {
        const owned   = sc.ownerId === userId;
        const allowed = !allowedScriptId || allowedScriptId === id;
        if ((owned || allowed) && sc.enabled !== false) {
            list.push({ id, ...sc });
        }
    }

    if (list.length === 0) {
        return interaction.editReply({
            content: `❌ No scripts found for your account. Please visit ${BASE_URL} to set up your script.`
        });
    }

    // Show up to 3 scripts
    const embeds = list.slice(0, 3).map(sc => {
        const loaderText = sc.key
            ? `script_key = "${sc.key}"\nloadstring(game:HttpGet("${sc.url}"))()`
            : `loadstring(game:HttpGet("${sc.url}"))()`;

        return new EmbedBuilder()
            .setTitle("📄 " + sc.name)
            .setColor(0x9565ff)
            .addFields(
                { name: "📡 Status",   value: sc.enabled ? "✅ Active" : "⛔ Disabled", inline: true },
                { name: "📅 Created",  value: formatDate(sc.createdAt),                 inline: true },
                { name: "🔑 Key",      value: `\`${sc.key || "N/A"}\``,                 inline: false },
                { name: "📋 Loader",   value: `\`\`\`lua\n${loaderText}\`\`\``,         inline: false },
            )
            .setFooter({ text: `Script ID: ${sc.id}` })
            .setTimestamp();
    });

    interaction.editReply({ embeds });
}

async function handleGetRoleButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const buyerRoleId = getBuyerRoleId();
    if (!buyerRoleId)
        return interaction.editReply({
            content: "❌ Buyer role has not been configured yet.\nAsk an admin to run `/setrollbuyer`."
        });

    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);

    if (!accessKey)
        return interaction.editReply({
            content: "❌ You don't have an active key or whitelist. Click **Redeem Key** first."
        });

    if (interaction.member.roles.cache.has(buyerRoleId))
        return interaction.editReply({ content: "✅ You already have the buyer role!" });

    try {
        await interaction.member.roles.add(buyerRoleId);
        const role = interaction.guild.roles.cache.get(buyerRoleId);
        interaction.editReply({ content: `✅ You have been given the **${role?.name || "Buyer"}** role!` });
    } catch (e) {
        interaction.editReply({ content: "❌ Failed to assign role: " + e.message });
    }
}

async function handleResetHwidButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId  = interaction.user.id;

    // Must have active access
    const accessKey = getActiveAccess(userId);
    if (!accessKey)
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });

    const hwidMap = getHwid();
    const entry   = hwidMap[userId];
    const COOLDOWN = 7 * 24 * 60 * 60 * 1000;

    if (entry?.lastReset && (Date.now() - entry.lastReset) < COOLDOWN) {
        const nextReset = new Date(entry.lastReset + COOLDOWN);
        return interaction.editReply({
            content: `❌ HWID reset is on cooldown.\n⏳ Next reset available: **${nextReset.toLocaleDateString("en-US")}**`
        });
    }

    hwidMap[userId] = { hwid: null, lastReset: Date.now() };
    saveJson(HWID_FILE, hwidMap);
    interaction.editReply({ content: "✅ HWID has been reset! Run your script to register a new HWID." });
}

async function handleStatsButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Must have active access
    const userId    = interaction.user.id;
    const accessKey = getActiveAccess(userId);
    if (!accessKey && !isAdmin(interaction.member))
        return interaction.editReply({ content: "❌ You don't have an active key. Click **Redeem Key** first." });

    const scripts = getScripts();
    const users   = getUsers();
    const keys    = getKeys();

    const totalScripts  = Object.keys(scripts).length;
    const activeScripts = Object.values(scripts).filter(s => s.enabled).length;
    const totalUsers    = Object.keys(users).length;
    // Don't count WL_ entries as normal keys
    const normalKeys    = Object.entries(keys).filter(([k]) => !k.startsWith("WL_"));
    const totalKeys     = normalKeys.length;
    const usedKeys      = normalKeys.filter(([, v]) => v.usedBy).length;
    const wlCount       = Object.keys(keys).filter(k => k.startsWith("WL_")).length;

    const embed = new EmbedBuilder()
        .setTitle("📊 KXLuaprotect Stats")
        .setColor(0x9565ff)
        .addFields(
            { name: "📄 Total Scripts",    value: `\`${totalScripts}\``,  inline: true },
            { name: "✅ Active Scripts",   value: `\`${activeScripts}\``, inline: true },
            { name: "👥 Total Users",      value: `\`${totalUsers}\``,    inline: true },
            { name: "🔑 Total Keys",       value: `\`${totalKeys}\``,     inline: true },
            { name: "✅ Keys Used",        value: `\`${usedKeys}\``,      inline: true },
            { name: "⭐ Whitelisted Users", value: `\`${wlCount}\``,      inline: true },
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

    // Check if user already has active access (key or whitelist)
    const existingAccess = getActiveAccess(userId);
    if (existingAccess) {
        const existingData = keys[existingAccess];
        return interaction.editReply({
            content:
                `✅ You already have an active key: \`${existingAccess}\`\n` +
                `Expires: **${timeLeft(existingData?.expireAt)}**\n\n` +
                `No need to redeem again!`
        });
    }

    if (!keys[key])
        return interaction.editReply({ content: "❌ Invalid key." });

    const keyData = keys[key];

    // Key already claimed by someone else
    if (keyData.usedBy && keyData.usedBy !== userId) {
        return interaction.editReply({ content: "❌ This key has already been claimed by another user." });
    }

    if (keyData.expireAt && keyData.expireAt < Date.now())
        return interaction.editReply({ content: "❌ This key has expired." });

    // Bind this key to the user permanently (1 key = 1 user)
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
        .setTitle("🎉 Key Redeemed Successfully!")
        .setColor(0x57f287)
        .addFields(
            { name: "🔑 Key",      value: `\`${key}\``,              inline: true },
            { name: "⏳ Expires",  value: timeLeft(keyData.expireAt), inline: true },
        )
        .setDescription("You can now click **Get Script** to view your loader code.")
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

    const jumlah = interaction.options.getInteger("amount") || 1;
    const durasi = interaction.options.getInteger("duration_days") ?? 30;
    if (jumlah > 20) return interaction.editReply({ content: "❌ Maximum 20 keys at once." });

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
        .setTitle(`🔑 ${jumlah} Key(s) Generated`)
        .setColor(0x57f287)
        .setDescription("```\n" + generated.join("\n") + "\n```")
        .addFields({ name: "⏳ Duration", value: durasi > 0 ? `${durasi} days` : "Lifetime", inline: true })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
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
            if (MEMBER_ROLE) {
                try {
                    const member = await interaction.guild.members.fetch(wasUsedBy);
                    await member.roles.remove(MEMBER_ROLE);
                } catch (e) {}
            }
        }
    }
    interaction.editReply({ content: `✅ Key \`${key}\` has been revoked.` });
}

async function handleListKeys(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const keys = getKeys();
    // Only list normal keys (not WL_ entries)
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

    interaction.editReply({ embeds: [embed] });
}

async function handleBan(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    users[target.id] = { ...(users[target.id] || {}), id: target.id, username: target.username, banned: true };
    saveJson(USERS_FILE, users);
    interaction.editReply({ content: `✅ **${target.username}** has been banned.` });
}

async function handleUnban(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });
    const target = interaction.options.getUser("user");
    const users  = getUsers();
    if (!users[target.id]) return interaction.editReply({ content: "❌ User not found." });
    users[target.id].banned = false;
    saveJson(USERS_FILE, users);
    interaction.editReply({ content: `✅ **${target.username}** has been unbanned.` });
}

/* =================================================
   WHITELIST COMMAND
================================================= */

async function handleWhitelist(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const target      = interaction.options.getUser("user");
    const scriptId    = interaction.options.getString("script_id") || null;
    const durationDay = interaction.options.getInteger("duration_days") ?? 30;
    const scripts     = getScripts();
    const keys        = getKeys();
    const users       = getUsers();

    // Validate script if provided
    if (scriptId && !scripts[scriptId]) {
        const scriptList = Object.entries(scripts)
            .map(([id, sc]) => `\`${id}\` — ${sc.name}`)
            .join("\n") || "No scripts found.";
        return interaction.editReply({
            content: `❌ Script ID \`${scriptId}\` not found.\n\n**Available scripts:**\n${scriptList}`
        });
    }

    // Check if already whitelisted
    const wlKey = `WL_${target.id}`;
    const existing = keys[wlKey];
    if (existing && (!existing.expireAt || existing.expireAt > Date.now())) {
        // Update existing whitelist
        keys[wlKey] = {
            ...existing,
            expireAt:  durationDay > 0 ? Date.now() + durationDay * 86400000 : null,
            scriptId:  scriptId,
            updatedAt: Date.now(),
            updatedBy: interaction.user.id,
        };
        saveJson(KEYS_FILE, keys);
        return interaction.editReply({
            content:
                `✅ Updated whitelist for **${target.username}**\n` +
                `📄 Script: \`${scriptId ? scripts[scriptId].name : "All Scripts"}\`\n` +
                `⏳ Expires: **${timeLeft(keys[wlKey].expireAt)}**`
        });
    }

    // Create new whitelist entry
    const expireAt = durationDay > 0 ? Date.now() + durationDay * 86400000 : null;

    keys[wlKey] = {
        type:       "whitelist",
        usedBy:     target.id,
        username:   target.username,
        scriptId:   scriptId,
        createdAt:  Date.now(),
        createdBy:  interaction.user.id,
        expireAt:   expireAt,
    };
    saveJson(KEYS_FILE, keys);

    // Register user
    if (!users[target.id]) users[target.id] = { id: target.id, username: target.username };
    users[target.id].whitelisted  = true;
    users[target.id].wlExpireAt   = expireAt;
    saveJson(USERS_FILE, users);

    // Give member role if configured
    if (MEMBER_ROLE) {
        try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.roles.add(MEMBER_ROLE);
        } catch (e) {}
    }

    const scriptName = scriptId ? scripts[scriptId].name : "All Scripts";

    const embed = new EmbedBuilder()
        .setTitle("⭐ User Whitelisted")
        .setColor(0x57f287)
        .addFields(
            { name: "👤 User",     value: `${target} (\`${target.id}\`)`,          inline: false },
            { name: "📄 Script",   value: `\`${scriptName}\``,                      inline: true  },
            { name: "⏳ Expires",  value: timeLeft(expireAt),                        inline: true  },
            { name: "👮 By",       value: `${interaction.user}`,                     inline: true  },
        )
        .setDescription(
            `**${target.username}** can now access the script without redeeming a key.\n` +
            `They can click **Get Script** on the panel to get the loader.`
        )
        .setFooter({ text: "KXLuaprotect" })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

/* =================================================
   LIST SCRIPTS COMMAND
================================================= */

async function handleListScripts(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const scripts = getScripts();
    const list    = Object.entries(scripts);

    if (list.length === 0) {
        return interaction.editReply({
            content: `❌ No scripts found in the system.\nPlease create scripts at ${BASE_URL}`
        });
    }

    const lines = list.map(([id, sc]) => {
        const status = sc.enabled ? "✅" : "⛔";
        return `${status} \`${id}\` — **${sc.name}** | Created: ${formatDate(sc.createdAt)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`📄 Scripts (${list.length} total)`)
        .setColor(0x9565ff)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Use the script ID with /whitelist script_id option` })
        .setTimestamp();

    interaction.editReply({ embeds: [embed] });
}

/* =================================================
   REMOVE WHITELIST COMMAND
================================================= */

async function handleRemoveWhitelist(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: "❌ Admin only." });

    const target = interaction.options.getUser("user");
    const keys   = getKeys();
    const wlKey  = `WL_${target.id}`;

    if (!keys[wlKey]) {
        return interaction.editReply({ content: `❌ **${target.username}** is not whitelisted.` });
    }

    delete keys[wlKey];
    saveJson(KEYS_FILE, keys);

    const users = getUsers();
    if (users[target.id]) {
        users[target.id].whitelisted = false;
        saveJson(USERS_FILE, users);
    }

    // Remove member role if configured
    if (MEMBER_ROLE) {
        try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.roles.remove(MEMBER_ROLE);
        } catch (e) {}
    }

    interaction.editReply({ content: `✅ Whitelist removed for **${target.username}**.` });
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
                case "panel":
                    if (!isAdmin(interaction.member)) {
                        return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
                    }
                    return await interaction.reply(buildPanel(interaction.guild?.name || "KXL"));

                case "generatekey":    return await handleGenerateKey(interaction);
                case "revokekey":      return await handleRevokeKey(interaction);
                case "listkeys":       return await handleListKeys(interaction);
                case "ban":            return await handleBan(interaction);
                case "unban":          return await handleUnban(interaction);
                case "whitelist":      return await handleWhitelist(interaction);
                case "listscripts":    return await handleListScripts(interaction);
                case "removewhitelist": return await handleRemoveWhitelist(interaction);
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
        try { await interaction.editReply({ content: "❌ An error occurred." }); } catch (_) {}
    }
});

if (!TOKEN) {
    console.error("❌ BOT_TOKEN is not set!");
    process.exit(1);
}

client.login(TOKEN);
