const express      = require("express");
const crypto       = require("crypto");
const fs           = require("fs");
const nodePath     = require("path");
const session      = require("express-session");
const fetch        = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

/* =================================================
   CONFIG
================================================= */

const CONFIG = {
    DISCORD_CLIENT_ID:     process.env.DISCORD_CLIENT_ID     || "1540862780545179698",
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "uXbmfOyb-uABovU_rPesCqSafIEnwL6Q",
    REDIRECT_URI:          process.env.REDIRECT_URI           || "https://kxluaprotect-production-a8eb.up.railway.app/auth/callback",
    ADMIN_ROLE_ID:         process.env.ADMIN_ROLE_ID          || "1530094098856546445",
    GUILD_ID:              process.env.GUILD_ID               || "1530091511851520180",
    SESSION_SECRET:        process.env.SESSION_SECRET         || "ead80b0426fd022d56215c83271d23e70e44e4ab8d4c95be3d5f9976354fe462",
};

/* =================================================
   MIDDLEWARE
================================================= */

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret:            CONFIG.SESSION_SECRET,
    resave:            false,
    saveUninitialized: false,
    cookie: {
        maxAge:   7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure:   false,
    }
}));

/* =================================================
   PERSISTENCE
================================================= */

const DATA_DIR    = fs.existsSync("/data") ? "/data" : nodePath.join(__dirname, "data");
const DATA_FILE   = nodePath.join(DATA_DIR, "scripts.json");
const USERS_FILE  = nodePath.join(DATA_DIR, "users.json");
const LOGS_FILE   = nodePath.join(DATA_DIR, "logs.json");
const CONFIG_FILE = nodePath.join(DATA_DIR, "config.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        }
    } catch (e) {
        console.error("Failed to load " + file + ":", e.message);
    }
    return {};
}

function saveJson(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to save " + file + ":", e.message);
    }
}

function loadFromDisk() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const obj = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
            const map = new Map();
            for (const [k, v] of Object.entries(obj)) map.set(k, v);
            return map;
        }
    } catch (e) {
        console.error("Failed to load scripts:", e.message);
    }
    return new Map();
}

function saveToDisk(map) {
    try {
        const obj = {};
        for (const [k, v] of map.entries()) obj[k] = v;
        fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to save scripts:", e.message);
    }
}

const loaders = loadFromDisk();
let   users   = loadJson(USERS_FILE);
let   logs    = loadJson(LOGS_FILE);
if (!logs.entries) logs.entries = [];

/* =================================================
   ACCESS ROLE HELPER (mirror dari bot.js)
================================================= */

function getAccessConfig() {
    return loadJson(CONFIG_FILE);
}

function getAccessRoles() {
    return getAccessConfig().accessRoles || {};
}

/**
 * Cek apakah user session punya akses ke fitur.
 * user = req.session.user { id, isAdmin, roleIds: [] }
 * roleIds diisi saat OAuth callback dari guilds.members.read.
 */
function sessionHasAccess(user, feature) {
    if (user.isAdmin) return true;
    const ar         = getAccessRoles();
    const allRoles   = ar["all"] || [];
    const featRoles  = ar[feature] || [];
    const allowed    = [...new Set([...allRoles, ...featRoles])];
    if (allowed.length === 0) return true; // belum di-set = semua boleh
    const userRoles  = user.roleIds || [];
    return allowed.some(rid => userRoles.includes(rid));
}

/* =================================================
   LOGGING
================================================= */

function addLog(action, userId, username, detail = "") {
    logs.entries.unshift({ action, userId, username, detail, timestamp: Date.now() });
    if (logs.entries.length > 500) logs.entries = logs.entries.slice(0, 500);
    saveJson(LOGS_FILE, logs);
}

/* =================================================
   HELPERS
================================================= */

function generateId() {
    return crypto.randomBytes(18).toString("hex");
}

function generateKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    const bytes = crypto.randomBytes(32);
    for (let i = 0; i < 32; i++) key += chars[bytes[i] % chars.length];
    return key;
}

function protectLuau(source) {
    let code = String(source);
    code = code.replace(/--\[[\s\S]*?\]/g, "");
    let output = "";
    let i = 0;
    while (i < code.length) {
        const char = code[i];
        if (char === '"') {
            let j = i + 1;
            while (j < code.length) {
                if (code[j] === "\\") { j += 2; continue; }
                if (code[j] === '"') { j++; break; }
                j++;
            }
            output += code.slice(i, j);
            i = j;
            continue;
        }
        if (char === "'") {
            let j = i + 1;
            while (j < code.length) {
                if (code[j] === "\\") { j += 2; continue; }
                if (code[j] === "'") { j++; break; }
                j++;
            }
            output += code.slice(i, j);
            i = j;
            continue;
        }
        if (char === "-" && code[i + 1] === "-") {
            while (i < code.length && code[i] !== "\n") { i++; }
            output += "\n";
            continue;
        }
        output += char;
        i++;
    }
    code = output;
    code = code.replace(/\r\n/g, "\n");
    code = code.split("\n").map(line => line.trimEnd()).join("\n");
    code = code.replace(/\n{3,}/g, "\n\n");
    return "-- KXLuaprotect Protected\n\n" + code.trim() + "\n";
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60)  return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60)  return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24)  return h + "h ago";
    return Math.floor(h / 24) + "d ago";
}

/* =================================================
   AUTH MIDDLEWARE
================================================= */

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user)         return res.status(401).json({ error: "Unauthorized." });
    if (!req.session.user.isAdmin) return res.status(403).json({ error: "Forbidden." });
    next();
}

function requireFeature(feature) {
    return (req, res, next) => {
        if (!req.session.user)                              return res.status(401).json({ error: "Unauthorized." });
        if (!sessionHasAccess(req.session.user, feature))  return res.status(403).json({ error: "Akses ditolak untuk fitur ini." });
        next();
    };
}

/* =================================================
   DISCORD OAUTH2
================================================= */

app.get("/auth/login", (req, res) => {
    const params = new URLSearchParams({
        client_id:     CONFIG.DISCORD_CLIENT_ID,
        redirect_uri:  CONFIG.REDIRECT_URI,
        response_type: "code",
        scope:         "identify guilds.members.read",
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect("/login?error=no_code");

    try {
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id:     CONFIG.DISCORD_CLIENT_ID,
                client_secret: CONFIG.DISCORD_CLIENT_SECRET,
                grant_type:    "authorization_code",
                code:          code,
                redirect_uri:  CONFIG.REDIRECT_URI,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.redirect("/login?error=token_failed");

        const userRes  = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json();

        let isAdmin  = false;
        let roleIds  = [];
        try {
            const memberRes  = await fetch(
                `https://discord.com/api/users/@me/guilds/${CONFIG.GUILD_ID}/member`,
                { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
            );
            const memberData = await memberRes.json();
            if (memberData.roles) {
                roleIds = memberData.roles;
                if (memberData.roles.includes(CONFIG.ADMIN_ROLE_ID)) isAdmin = true;
            }
        } catch (e) {}

        const user = {
            id:            userData.id,
            username:      userData.username,
            discriminator: userData.discriminator || "0",
            avatar:        userData.avatar,
            isAdmin:       isAdmin,
            roleIds:       roleIds, // simpan untuk access role check
        };

        const isBanned = users[userData.id]?.banned || false;
        if (isBanned) {
            req.session.destroy(() => {});
            return res.redirect("/login?error=banned");
        }

        req.session.user = user;

        const isNew = !users[userData.id];
        users[userData.id] = {
            ...user,
            lastLogin:  Date.now(),
            firstLogin: users[userData.id]?.firstLogin || Date.now(),
            banned:     false,
        };
        saveJson(USERS_FILE, users);
        addLog("login", userData.id, userData.username, isAdmin ? "Admin login" : "User login");
        res.redirect(isAdmin ? "/admin" : "/");

    } catch (e) {
        console.error("OAuth error:", e.message);
        res.redirect("/login?error=oauth_failed");
    }
});

app.get("/auth/logout", (req, res) => {
    if (req.session.user) {
        addLog("logout", req.session.user.id, req.session.user.username, "");
    }
    req.session.destroy(() => res.redirect("/login"));
});

/* =================================================
   LOGIN PAGE
================================================= */

app.get("/login", (req, res) => {
    const error = req.query.error;
    let errorMsg = "";
    if (error === "no_code")      errorMsg = "Login gagal: no code.";
    if (error === "token_failed") errorMsg = "Login gagal: token error.";
    if (error === "oauth_failed") errorMsg = "Login gagal: OAuth error.";
    if (error === "banned")       errorMsg = "Akun kamu dibanned oleh admin.";

    res.status(200).type("html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KXLuaprotect — Login</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    min-height: 100vh;
    background: radial-gradient(circle at top, #26133e 0%, #0b0910 45%, #050507 100%);
    color: white;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
.card {
    width: min(420px, 100%);
    padding: 40px 32px;
    border-radius: 20px;
    background: rgba(14,13,19,.96);
    border: 1px solid #2b2535;
    text-align: center;
    box-shadow: 0 25px 80px rgba(0,0,0,.5);
}
.logo { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px; }
.logo span { color: #9565ff; }
.sub { color: #6e6679; font-size: 13px; margin-bottom: 32px; }
.btn-discord {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 14px 20px;
    background: #5865F2;
    color: white;
    font-size: 15px;
    font-weight: 700;
    border-radius: 12px;
    text-decoration: none;
    transition: filter .15s;
}
.btn-discord:hover { filter: brightness(1.12); }
.btn-discord svg { width: 22px; height: 22px; fill: white; }
.error {
    margin-top: 16px;
    color: #f07080;
    font-size: 13px;
    background: #2a0f18;
    border: 1px solid #5a2030;
    border-radius: 10px;
    padding: 10px 14px;
}
.footer { margin-top: 24px; color: #2e2a33; font-size: 11px; }
</style>
</head>
<body>
<div class="card">
    <div class="logo">KX<span>Luaprotect</span></div>
    <div class="sub">Login dengan Discord untuk melanjutkan</div>
    <a class="btn-discord" href="/auth/login">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
        </svg>
        Login dengan Discord
    </a>
    ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ""}
    <div class="footer">KXLuaprotect &mdash; Secure Script Hosting</div>
</div>
</body>
</html>
    `);
});

/* =================================================
   ADMIN DASHBOARD
================================================= */

app.get("/admin", requireLogin, (req, res) => {
    if (!req.session.user.isAdmin) return res.redirect("/");

    const user      = req.session.user;
    const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const totalScripts = loaders.size;
    const totalUsers   = Object.keys(users).length;
    const bannedUsers  = Object.values(users).filter(u => u.banned).length;
    const recentLogs   = logs.entries.slice(0, 8);

    res.status(200).type("html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KXLuaprotect — Admin</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; background: #07060d; color: #e0d8ed; font-family: Arial, sans-serif; display: flex; }
.sidebar { width: 220px; min-height: 100vh; background: linear-gradient(180deg, #110d1e 0%, #0a0812 100%); border-right: 1px solid #1e1830; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 100; }
.sidebar-logo { padding: 24px 20px 20px; border-bottom: 1px solid #1e1830; }
.sidebar-logo .logo-text { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
.sidebar-logo .logo-text span { color: #9565ff; }
.sidebar-logo .admin-tag { display: inline-block; margin-top: 6px; background: linear-gradient(135deg, #8051f5, #5a2db5); color: white; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 99px; letter-spacing: 1px; text-transform: uppercase; }
.sidebar-nav { flex: 1; padding: 16px 10px; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; color: #7a7088; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; border: none; background: none; width: 100%; text-align: left; }
.nav-item:hover { background: #1a1528; color: #c0b4d8; }
.nav-item.active { background: linear-gradient(135deg, #2a1a4a, #1e1235); color: #c49dff; border: 1px solid #3d2870; }
.nav-icon { font-size: 15px; width: 18px; text-align: center; }
.sidebar-user { padding: 16px; border-top: 1px solid #1e1830; display: flex; align-items: center; gap: 10px; }
.sidebar-avatar { width: 34px; height: 34px; border-radius: 50%; border: 2px solid #3a2f50; flex-shrink: 0; }
.sidebar-username { font-size: 13px; font-weight: 700; color: #b8aed0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.logout-link { color: #6a4060; font-size: 18px; text-decoration: none; transition: color .15s; }
.logout-link:hover { color: #f07080; }
.main { margin-left: 220px; flex: 1; min-height: 100vh; padding: 32px; }
.page { display: none; }
.page.active { display: block; }
.page-header { margin-bottom: 28px; }
.page-title { font-size: 24px; font-weight: 900; color: #e8e0f5; letter-spacing: -0.3px; }
.page-sub { color: #5a5268; font-size: 13px; margin-top: 5px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
.stat-card { background: linear-gradient(135deg, #110e1c, #0e0b18); border: 1px solid #2a2040; border-radius: 16px; padding: 20px; position: relative; overflow: hidden; }
.stat-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #8051f5, #5a2db5); }
.stat-icon { font-size: 24px; margin-bottom: 12px; }
.stat-value { font-size: 32px; font-weight: 900; color: #e0d8ed; line-height: 1; margin-bottom: 6px; }
.stat-label { font-size: 12px; color: #5a5268; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
.section { background: #0e0c18; border: 1px solid #1e1830; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
.section-title { font-size: 14px; font-weight: 800; color: #9070c0; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 10px 14px; color: #5a5268; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #1e1830; }
td { padding: 12px 14px; border-bottom: 1px solid #14111f; color: #c0b4d8; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #13101e; }
.td-name { font-weight: 700; color: #ddd6e8; }
.td-meta { font-size: 11px; color: #4a4258; margin-top: 2px; }
.badge { display: inline-block; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; }
.badge-on  { background: #0d2a1a; color: #7cdc9a; border: 1px solid #1a4a2a; }
.badge-off { background: #1e1428; color: #7a6f85; border: 1px solid #2a1e38; }
.badge-ban { background: #2a0f18; color: #f07080; border: 1px solid #5a2030; }
.badge-ok  { background: #0d1f2a; color: #6ab4dc; border: 1px solid #1a3a4a; }
.badge-admin { background: #1e0f3a; color: #b897ff; border: 1px solid #4a2080; }
.btn-sm { padding: 5px 12px; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; border: 0; transition: filter .12s; }
.btn-sm:hover { filter: brightness(1.15); }
.btn-danger  { background: #3d1020; color: #f07080; }
.btn-warn    { background: #2a1a0a; color: #f0a050; }
.btn-success { background: #0a2a15; color: #7cdc9a; }
.btn-purple  { background: #2a1050; color: #c49dff; }
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input { flex: 1; min-width: 200px; background: #08080f; color: #e0d8ed; border: 1px solid #2a2040; border-radius: 10px; padding: 9px 14px; outline: none; font-size: 13px; font-family: Arial, sans-serif; }
.search-input:focus { border-color: #7040c0; }
.search-input::placeholder { color: #3a3048; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #0a0814; border: 1px solid #1a1628; border-radius: 10px; }
.log-icon { font-size: 16px; width: 24px; text-align: center; }
.log-info { flex: 1; }
.log-action { font-size: 13px; font-weight: 700; color: #c0b4d8; }
.log-detail { font-size: 11px; color: #4a4258; margin-top: 2px; }
.log-time { font-size: 11px; color: #3a3048; flex-shrink: 0; }
.empty { text-align: center; color: #3a3048; font-size: 14px; padding: 40px 0; }
@media(max-width: 768px) {
    .sidebar { width: 60px; }
    .sidebar-logo .logo-text, .sidebar-logo .admin-tag, .nav-item span, .sidebar-username { display: none; }
    .nav-item { justify-content: center; padding: 12px; }
    .sidebar-user { justify-content: center; }
    .logout-link { display: none; }
    .main { margin-left: 60px; padding: 20px 16px; }
}

/* ── PROTECTOR (ADMIN) SPECIFIC ── */
.proto-form { display: flex; flex-direction: column; gap: 14px; }
.form-label { color: #5a5268; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.form-input {
    width: 100%; background: #08080f; color: #e0d8ed;
    border: 1px solid #2a2040; border-radius: 10px;
    padding: 9px 14px; outline: none; font-size: 13px;
    font-family: Arial, sans-serif; transition: border-color .15s;
}
.form-input:focus { border-color: #7040c0; }
.form-input::placeholder { color: #3a3048; }
.form-select {
    width: 100%; background: #08080f; color: #e0d8ed;
    border: 1px solid #2a2040; border-radius: 10px;
    padding: 9px 14px; outline: none; font-size: 13px;
    font-family: Arial, sans-serif; cursor: pointer; transition: border-color .15s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%237a6f85' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
}
.form-select:focus { border-color: #7040c0; }
.form-select option { background: #0e0c18; }
.key-toggle-group { display: flex; gap: 10px; }
.key-toggle-btn {
    flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #2a2040;
    background: #08080f; color: #7a6f85; font-weight: 700; font-size: 13px;
    cursor: pointer; transition: all .15s; text-align: center;
}
.key-toggle-btn.active {
    background: linear-gradient(135deg, #2a1a4a, #1e1235);
    color: #c49dff; border-color: #5a3090;
}
textarea.form-textarea {
    width: 100%; height: 280px; resize: vertical;
    background: #08080f; color: #e0d8ed;
    border: 1px solid #2a2040; border-radius: 10px;
    padding: 14px; outline: none;
    font-family: Consolas, monospace; font-size: 13px; line-height: 1.55;
    transition: border-color .15s;
}
textarea.form-textarea:focus { border-color: #7040c0; }
.proto-actions { display: flex; gap: 10px; }
.btn-protect-main {
    flex: 1; padding: 12px; border: 0; border-radius: 10px;
    background: linear-gradient(135deg, #8051f5, #5a2db5);
    color: white; font-weight: 700; font-size: 14px; cursor: pointer;
    transition: filter .12s;
}
.btn-protect-main:hover { filter: brightness(1.1); }
.btn-clear {
    padding: 12px 18px; border: 0; border-radius: 10px;
    background: #1a1430; color: #7a6a90;
    font-weight: 700; font-size: 14px; cursor: pointer;
}
.result-box {
    background: #08080f; border: 1px solid #2a2040;
    border-radius: 10px; padding: 14px;
    color: #b897ff; font-family: Consolas, monospace;
    font-size: 13px; word-break: break-all;
}
.result-actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.btn-copy {
    background: #1a1430; border: 0; border-radius: 10px;
    padding: 9px 14px; color: #c49dff;
    font-weight: 700; font-size: 13px; cursor: pointer;
    transition: filter .12s;
}
.btn-copy:hover { filter: brightness(1.15); }
.proto-status { text-align: center; color: #4a4258; font-size: 12px; margin-top: 10px; }
</style>
</head>
<body>

<div class="sidebar">
    <div class="sidebar-logo">
        <div class="logo-text">KX<span>Luaprotect</span></div>
        <div class="admin-tag">Admin Panel</div>
    </div>
    <nav class="sidebar-nav">
        <button class="nav-item active" onclick="showAdminPage('dashboard', this)">
            <span class="nav-icon">📊</span><span>Dashboard</span>
        </button>
        <button class="nav-item" onclick="showAdminPage('scripts', this)">
            <span class="nav-icon">📜</span><span>Scripts</span>
        </button>
        <button class="nav-item" onclick="showAdminPage('users', this)">
            <span class="nav-icon">👥</span><span>Users</span>
        </button>
        <button class="nav-item" onclick="showAdminPage('logs', this)">
            <span class="nav-icon">📋</span><span>Logs</span>
        </button>
        <button class="nav-item" onclick="showAdminPage('protector', this)">
            <span class="nav-icon">🛡</span><span>Protector</span>
        </button>
    </nav>
    <div class="sidebar-user">
        <img class="sidebar-avatar" src="${escapeHtml(user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png`)}" alt="avatar">
        <span class="sidebar-username">${escapeHtml(user.username)}</span>
        <a class="logout-link" href="/auth/logout" title="Logout">⏻</a>
    </div>
</div>

<div class="main">

    <!-- DASHBOARD -->
    <div class="page active" id="admin-page-dashboard">
        <div class="page-header">
            <div class="page-title">Dashboard</div>
            <div class="page-sub">Overview semua aktivitas KXLuaprotect</div>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><div class="stat-icon">📜</div><div class="stat-value">${totalScripts}</div><div class="stat-label">Total Scripts</div></div>
            <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${totalUsers}</div><div class="stat-label">Total Users</div></div>
            <div class="stat-card"><div class="stat-icon">🚫</div><div class="stat-value">${bannedUsers}</div><div class="stat-label">Banned Users</div></div>
            <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${logs.entries.length}</div><div class="stat-label">Total Logs</div></div>
        </div>
        <div class="section">
            <div class="section-title">⚡ Aktivitas Terbaru</div>
            <div class="log-list">
                ${recentLogs.length === 0
                    ? '<div class="empty">Belum ada aktivitas.</div>'
                    : recentLogs.map(l => `
                        <div class="log-item">
                            <div class="log-icon">${l.action==="login"?"🔑":l.action==="logout"?"👋":l.action==="protect"?"🛡":l.action==="delete"?"🗑":l.action==="ban"?"🚫":l.action==="unban"?"✅":"📌"}</div>
                            <div class="log-info">
                                <div class="log-action">${escapeHtml(l.username)} — ${escapeHtml(l.action)}</div>
                                <div class="log-detail">${escapeHtml(l.detail || "")}</div>
                            </div>
                            <div class="log-time">${timeAgo(l.timestamp)}</div>
                        </div>`).join("")
                }
            </div>
        </div>
    </div>

    <!-- SCRIPTS -->
    <div class="page" id="admin-page-scripts">
        <div class="page-header">
            <div class="page-title">Scripts</div>
            <div class="page-sub">Kelola semua script dari semua user</div>
        </div>
        <div class="section">
            <div class="toolbar">
                <input class="search-input" id="scriptSearch" placeholder="🔍 Cari script atau username..." oninput="filterScripts()">
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Nama Script</th><th>Owner</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
                    <tbody id="adminScriptTable"><tr><td colspan="5" style="text-align:center;color:#3a3048;padding:30px">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- USERS -->
    <div class="page" id="admin-page-users">
        <div class="page-header">
            <div class="page-title">Users</div>
            <div class="page-sub">Kelola semua user yang pernah login</div>
        </div>
        <div class="section">
            <div class="toolbar">
                <input class="search-input" id="userSearch" placeholder="🔍 Cari username atau ID..." oninput="filterUsers()">
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last Login</th><th>Aksi</th></tr></thead>
                    <tbody id="adminUserTable"><tr><td colspan="5" style="text-align:center;color:#3a3048;padding:30px">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- LOGS -->
    <div class="page" id="admin-page-logs">
        <div class="page-header">
            <div class="page-title">Logs</div>
            <div class="page-sub">Log semua aktivitas (max 500 entri)</div>
        </div>
        <div class="section">
            <div class="toolbar">
                <input class="search-input" id="logSearch" placeholder="🔍 Cari log..." oninput="filterLogs()">
            </div>
            <div class="log-list" id="adminLogList"><div class="empty">Loading...</div></div>
        </div>
    </div>

    <!-- PROTECTOR (ADMIN) — pilih dari saved scripts, key Yes/No -->
    <div class="page" id="admin-page-protector">
        <div class="page-header">
            <div class="page-title">Protector</div>
            <div class="page-sub">Protect script Luau — pilih script yang udah disave atau buat baru</div>
        </div>
        <div class="section">
            <div class="proto-form">

                <!-- Pilih script (optional) -->
                <div>
                    <div class="form-label">Script (pilih yang udah ada / biarkan kosong untuk baru)</div>
                    <select class="form-select" id="adminScriptPicker" onchange="adminPickScript()">
                        <option value="">— Buat Script Baru —</option>
                    </select>
                </div>

                <!-- Nama -->
                <div>
                    <div class="form-label">Nama Script</div>
                    <input class="form-input" id="adminScriptName" placeholder="e.g. MyHub, KXL_Duel...">
                </div>

                <!-- Source + upload -->
                <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                        <div class="form-label" style="margin:0">Source</div>
                        <label style="display:inline-flex;align-items:center;gap:5px;background:#1a1430;border:1px solid #2a2040;color:#9070c0;font-size:12px;font-weight:700;padding:5px 11px;border-radius:8px;cursor:pointer">
                            📁 Upload File
                            <input type="file" id="adminFileUpload" accept=".lua,.txt" onchange="adminHandleUpload(this)" style="display:none">
                        </label>
                    </div>
                    <textarea class="form-textarea" id="adminSource" spellcheck="false" placeholder="Paste Luau source di sini..."></textarea>
                </div>

                <!-- Key: Yes / No -->
                <div>
                    <div class="form-label">Pakai Key?</div>
                    <div class="key-toggle-group">
                        <button class="key-toggle-btn active" id="keyBtnYes" onclick="setKeyMode('yes')">🔑 Yes — Random Key</button>
                        <button class="key-toggle-btn" id="keyBtnNo"  onclick="setKeyMode('no')">🔓 No — Tanpa Key</button>
                    </div>
                </div>

                <!-- Actions -->
                <div class="proto-actions">
                    <button class="btn-protect-main" onclick="adminProtect()">🛡 Protect & Save</button>
                    <button class="btn-clear" onclick="adminClear()">Clear</button>
                </div>

            </div>

            <!-- Result -->
            <div id="adminResult" style="display:none;margin-top:20px">
                <div class="form-label" style="margin-bottom:8px">Loader</div>
                <div class="result-box" id="adminLoadstring"></div>
                <div class="result-actions">
                    <button class="btn-copy" onclick="adminCopyLoadstring()">📋 Copy Loader</button>
                    <button class="btn-copy" onclick="adminCopyUrl()">🔗 Copy URL</button>
                </div>
            </div>

            <div class="proto-status" id="adminStatus">Ready.</div>
        </div>
    </div>

</div>

<script>

/* ── PAGE SWITCHING ── */
function showAdminPage(name, btn) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.getElementById("admin-page-" + name).classList.add("active");
    if (btn) btn.classList.add("active");
    if (name === "scripts")   loadAdminScripts();
    if (name === "users")     loadAdminUsers();
    if (name === "logs")      loadAdminLogs();
    if (name === "protector") loadAdminScriptPicker();
}

/* ── SCRIPTS ── */
let allScripts = [];
async function loadAdminScripts() {
    try {
        const data = await (await fetch("/api/admin/scripts")).json();
        allScripts = data.scripts || [];
        renderScripts(allScripts);
    } catch { document.getElementById("adminScriptTable").innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f07080;padding:20px">Gagal load.</td></tr>'; }
}
function renderScripts(list) {
    const tbody = document.getElementById("adminScriptTable");
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#3a3048;padding:30px">Tidak ada script.</td></tr>'; return; }
    tbody.innerHTML = list.map(s => \`
        <tr>
            <td><div class="td-name">\${escHtml(s.name)}</div><div class="td-meta">\${escHtml(s.url)}</div></td>
            <td><span style="color:#9070c0">\${escHtml(s.ownerUsername||"Unknown")}</span></td>
            <td><span class="badge \${s.enabled?'badge-on':'badge-off'}">\${s.enabled?"Enabled":"Disabled"}</span></td>
            <td style="color:#4a4258;font-size:12px">\${new Date(s.createdAt).toLocaleDateString("id-ID")}</td>
            <td><div style="display:flex;gap:6px">
                <button class="btn-sm btn-warn" onclick="adminToggleScript('\${s.id}',\${!s.enabled})">\${s.enabled?"Disable":"Enable"}</button>
                <button class="btn-sm btn-danger" onclick="adminDeleteScript('\${s.id}')">Delete</button>
            </div></td>
        </tr>
    \`).join("");
}
function filterScripts() {
    const q = document.getElementById("scriptSearch").value.toLowerCase();
    renderScripts(allScripts.filter(s => s.name.toLowerCase().includes(q) || (s.ownerUsername||"").toLowerCase().includes(q)));
}
async function adminToggleScript(id, enabled) {
    await fetch(\`/api/scripts/\${id}/toggle\`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({enabled}) });
    loadAdminScripts();
}
async function adminDeleteScript(id) {
    if (!confirm("Hapus script ini?")) return;
    await fetch(\`/api/scripts/\${id}\`, { method:"DELETE" });
    loadAdminScripts();
}

/* ── USERS ── */
let allUsers = [];
async function loadAdminUsers() {
    try {
        const data = await (await fetch("/api/admin/users")).json();
        allUsers = data.users || [];
        renderUsers(allUsers);
    } catch { document.getElementById("adminUserTable").innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f07080">Gagal load.</td></tr>'; }
}
function renderUsers(list) {
    const tbody = document.getElementById("adminUserTable");
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#3a3048;padding:30px">Tidak ada user.</td></tr>'; return; }
    tbody.innerHTML = list.map(u => \`
        <tr>
            <td><div style="display:flex;align-items:center;gap:10px">
                <img src="\${u.avatar?'https://cdn.discordapp.com/avatars/'+u.id+'/'+u.avatar+'.png':'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:30px;height:30px;border-radius:50%;border:1px solid #3a2f50">
                <div><div class="td-name">\${escHtml(u.username)}</div><div class="td-meta">\${escHtml(u.id)}</div></div>
            </div></td>
            <td>\${u.isAdmin?'<span class="badge badge-admin">Admin</span>':'<span class="badge badge-ok">User</span>'}</td>
            <td>\${u.banned?'<span class="badge badge-ban">Banned</span>':'<span class="badge badge-on">Active</span>'}</td>
            <td style="color:#4a4258;font-size:12px">\${u.lastLogin?new Date(u.lastLogin).toLocaleDateString("id-ID"):"-"}</td>
            <td>\${u.banned
                ? \`<button class="btn-sm btn-success" onclick="adminUnban('\${u.id}')">Unban</button>\`
                : \`<button class="btn-sm btn-danger" onclick="adminBan('\${u.id}')">Ban</button>\`
            }</td>
        </tr>
    \`).join("");
}
function filterUsers() {
    const q = document.getElementById("userSearch").value.toLowerCase();
    renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)));
}
async function adminBan(id)   { if (!confirm("Ban user ini?")) return; await fetch(\`/api/admin/users/\${id}/ban\`,{ method:"POST" }); loadAdminUsers(); }
async function adminUnban(id) { await fetch(\`/api/admin/users/\${id}/unban\`,{ method:"POST" }); loadAdminUsers(); }

/* ── LOGS ── */
let allLogs = [];
async function loadAdminLogs() {
    try {
        const data = await (await fetch("/api/admin/logs")).json();
        allLogs = data.logs || [];
        renderLogs(allLogs);
    } catch { document.getElementById("adminLogList").innerHTML = '<div class="empty">Gagal load.</div>'; }
}
function renderLogs(list) {
    const el = document.getElementById("adminLogList");
    if (!list.length) { el.innerHTML = '<div class="empty">Belum ada log.</div>'; return; }
    el.innerHTML = list.map(l => \`
        <div class="log-item">
            <div class="log-icon">\${l.action==="login"?"🔑":l.action==="logout"?"👋":l.action==="protect"?"🛡":l.action==="delete"?"🗑":l.action==="ban"?"🚫":l.action==="unban"?"✅":"📌"}</div>
            <div class="log-info">
                <div class="log-action">\${escHtml(l.username)} — \${escHtml(l.action)}</div>
                <div class="log-detail">\${escHtml(l.detail||"")}</div>
            </div>
            <div class="log-time">\${new Date(l.timestamp).toLocaleString("id-ID")}</div>
        </div>
    \`).join("");
}
function filterLogs() {
    const q = document.getElementById("logSearch").value.toLowerCase();
    renderLogs(allLogs.filter(l => l.username.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || (l.detail||"").toLowerCase().includes(q)));
}

/* ── PROTECTOR ── */
let adminCurrentUrl = "", adminCurrentLoadstring = "";
let keyMode = "yes"; // "yes" | "no"

async function loadAdminScriptPicker() {
    const sel = document.getElementById("adminScriptPicker");
    try {
        const data = await (await fetch("/api/admin/scripts")).json();
        const scripts = data.scripts || [];
        sel.innerHTML = '<option value="">— Buat Script Baru —</option>'
            + scripts.map(s => \`<option value="\${s.id}" data-name="\${escHtml(s.name)}">\${escHtml(s.name)}</option>\`).join("");
    } catch { sel.innerHTML = '<option value="">— Buat Script Baru —</option>'; }
}

function adminPickScript() {
    const sel = document.getElementById("adminScriptPicker");
    const id  = sel.value;
    if (!id) return;
    const name = sel.options[sel.selectedIndex].dataset.name || "";
    document.getElementById("adminScriptName").value = name;
    document.getElementById("adminStatus").textContent = "Script dipilih: " + name + ". Paste source baru lalu klik Protect & Save.";
}

function setKeyMode(mode) {
    keyMode = mode;
    document.getElementById("keyBtnYes").classList.toggle("active", mode === "yes");
    document.getElementById("keyBtnNo").classList.toggle("active",  mode === "no");
}

function adminHandleUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById("adminSource").value = e.target.result;
        document.getElementById("adminStatus").textContent = "File loaded: " + file.name;
    };
    reader.onerror = () => { document.getElementById("adminStatus").textContent = "Gagal membaca file."; };
    reader.readAsText(file, "UTF-8");
    input.value = "";
}

async function adminProtect() {
    const source   = document.getElementById("adminSource").value;
    const nameVal  = document.getElementById("adminScriptName").value.trim();
    const scriptId = document.getElementById("adminScriptPicker").value || null;
    const status   = document.getElementById("adminStatus");
    if (!source.trim()) { status.textContent = "Paste Luau source dulu."; return; }
    status.textContent = "Protecting...";
    try {
        const response = await fetch("/api/protect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source,
                name:     nameVal || "Untitled Script",
                useKey:   keyMode === "yes",
                scriptId: scriptId || undefined,
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Protection failed.");
        adminCurrentUrl        = data.url;
        adminCurrentLoadstring = data.loadstring;
        document.getElementById("adminLoadstring").textContent = adminCurrentLoadstring;
        document.getElementById("adminResult").style.display = "block";
        status.textContent = "✅ Protected! Script disimpan.";
        // refresh picker
        loadAdminScriptPicker();
    } catch (err) { status.textContent = "❌ " + err.message; }
}

async function adminCopyLoadstring() {
    if (!adminCurrentLoadstring) return;
    await navigator.clipboard.writeText(adminCurrentLoadstring);
    document.getElementById("adminStatus").textContent = "Loadstring copied.";
}
async function adminCopyUrl() {
    if (!adminCurrentUrl) return;
    await navigator.clipboard.writeText(adminCurrentUrl);
    document.getElementById("adminStatus").textContent = "URL copied.";
}
function adminClear() {
    document.getElementById("adminSource").value = "";
    document.getElementById("adminScriptName").value = "";
    document.getElementById("adminScriptPicker").value = "";
    document.getElementById("adminResult").style.display = "none";
    document.getElementById("adminStatus").textContent = "Ready.";
    adminCurrentUrl = ""; adminCurrentLoadstring = "";
    setKeyMode("yes");
}

function escHtml(v) {
    return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
</script>
</body>
</html>
    `);
});

/* =================================================
   ADMIN API
================================================= */

app.get("/api/admin/scripts", requireAdmin, (req, res) => {
    const scripts = [];
    for (const [id, item] of loaders.entries()) {
        scripts.push({ id, name: item.name, url: item.url, enabled: item.enabled, createdAt: item.createdAt, ownerId: item.ownerId, ownerUsername: item.ownerUsername || "Unknown" });
    }
    scripts.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, scripts });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
    const list = Object.values(users).sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
    res.json({ success: true, users: list });
});

app.post("/api/admin/users/:id/ban", requireAdmin, (req, res) => {
    const id = req.params.id;
    if (!users[id]) return res.status(404).json({ error: "User not found." });
    users[id].banned = true;
    saveJson(USERS_FILE, users);
    addLog("ban", req.session.user.id, req.session.user.username, "Banned: " + (users[id].username || id));
    res.json({ success: true });
});

app.post("/api/admin/users/:id/unban", requireAdmin, (req, res) => {
    const id = req.params.id;
    if (!users[id]) return res.status(404).json({ error: "User not found." });
    users[id].banned = false;
    saveJson(USERS_FILE, users);
    addLog("unban", req.session.user.id, req.session.user.username, "Unbanned: " + (users[id].username || id));
    res.json({ success: true });
});

app.get("/api/admin/logs", requireAdmin, (req, res) => {
    res.json({ success: true, logs: logs.entries });
});

/* =================================================
   HOME PAGE (user biasa)
================================================= */

app.get("/", requireLogin, (req, res) => {
    const user = req.session.user;
    if (user.isAdmin) return res.redirect("/admin");

    // Cek akses fitur protect
    const canProtect = sessionHasAccess(user, "protect");

    const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

    res.status(200).type("html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KXLuaprotect</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; background: radial-gradient(circle at top, #26133e 0%, #0b0910 45%, #050507 100%); color: white; font-family: Arial, sans-serif; }
.topbar { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid #1e1827; background: rgba(10,9,14,.85); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 100; }
.menu-wrap { position: relative; }
.menu-btn { background: none; border: none; color: #9d94a8; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 7px; line-height: 1; transition: background .15s, color .15s; letter-spacing: 1px; }
.menu-btn:hover { background: #1e1829; color: #c8bfd4; }
.dropdown { display: none; position: absolute; left: 0; top: calc(100% + 6px); background: #100e18; border: 1px solid #2b2337; border-radius: 11px; overflow: hidden; min-width: 170px; box-shadow: 0 12px 40px rgba(0,0,0,.55); z-index: 200; }
.dropdown.open { display: block; }
.dropdown-item { display: flex; align-items: center; gap: 10px; padding: 11px 16px; color: #c0b8cc; font-size: 14px; cursor: pointer; transition: background .12s; }
.dropdown-item:hover { background: #1c1729; color: #e2daed; }
.dropdown-item.disabled { opacity: .4; cursor: not-allowed; pointer-events: none; }
.di-icon { font-size: 16px; width: 20px; text-align: center; }
.logo { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; flex: 1; }
.logo span { color: #9565ff; }
.user-info { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.user-avatar { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #3a2f50; }
.user-name { font-size: 13px; font-weight: 700; color: #c0b8cc; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.logout-btn { background: #1e0f1a; border: 1px solid #3d1f2f; color: #c06070; font-size: 12px; padding: 5px 10px; border-radius: 8px; cursor: pointer; font-weight: 700; text-decoration: none; transition: background .12s; }
.logout-btn:hover { background: #3d1020; color: #f07080; }
.container { width: min(1100px, 94%); margin: auto; padding: 36px 0 60px; }
.card { background: rgba(14,13,19,.96); border: 1px solid #2b2535; border-radius: 18px; padding: 22px; box-shadow: 0 25px 70px rgba(0,0,0,.4); }
.page { display: none; }
.page.active { display: block; }
.page-header { margin-bottom: 22px; }
.page-title { font-size: 20px; font-weight: 800; color: #e8e0f2; }
.page-sub { color: #6e6679; font-size: 13px; margin-top: 4px; }
.form-label { color: #aaa4b1; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
.form-input { width: 100%; background: #08080c; color: #e8e4ed; border: 1px solid #302a39; border-radius: 12px; padding: 12px 15px; outline: none; font-family: Arial, sans-serif; font-size: 14px; transition: border-color .15s; }
.form-input:focus { border-color: #895cff; }
.form-input::placeholder { color: #4a4452; }
.form-select {
    width: 100%; background: #08080c; color: #e8e4ed;
    border: 1px solid #302a39; border-radius: 12px;
    padding: 12px 15px; outline: none; font-size: 14px;
    cursor: pointer; transition: border-color .15s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%237a6f85' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 38px;
}
.form-select:focus { border-color: #895cff; }
.form-select option { background: #100e18; }
textarea { width: 100%; height: 300px; resize: vertical; background: #08080c; color: #e8e4ed; border: 1px solid #302a39; border-radius: 12px; padding: 15px; outline: none; font-family: Consolas, monospace; font-size: 13px; line-height: 1.55; transition: border-color .15s; }
textarea:focus { border-color: #895cff; }
.input-group { margin-bottom: 14px; }
.source-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.btn-upload { display: inline-flex; align-items: center; gap: 5px; background: #1e1829; border: 1px solid #302a39; color: #a090b8; font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 8px; cursor: pointer; transition: background .12s, color .12s; user-select: none; }
.btn-upload:hover { background: #2b2238; color: #c9a8ff; border-color: #5a3f80; }
.key-toggle-group { display: flex; gap: 10px; }
.key-toggle-btn { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #302a39; background: #08080c; color: #6e6679; font-weight: 700; font-size: 13px; cursor: pointer; transition: all .15s; }
.key-toggle-btn.active { background: linear-gradient(135deg, #2a1a4a, #1e1235); color: #c49dff; border-color: #5a3090; }
.buttons { display: flex; gap: 10px; margin-top: 15px; }
button { border: 0; border-radius: 10px; padding: 12px 18px; color: white; font-weight: 700; cursor: pointer; font-size: 14px; transition: filter .12s; }
.btn-protect { flex: 1; background: #8051f5; }
.btn-secondary { background: #25202b; }
button:hover { filter: brightness(1.12); }
.result { display: none; margin-top: 22px; }
.resultBox { background: #08080c; border: 1px solid #302a39; border-radius: 12px; padding: 14px; color: #b897ff; font-family: Consolas, monospace; font-size: 13px; word-break: break-all; }
.status { text-align: center; color: #746e7c; font-size: 12px; margin-top: 15px; }
.no-access-box { text-align: center; padding: 50px 20px; color: #5a5268; }
.no-access-box .icon { font-size: 40px; margin-bottom: 12px; }
.no-access-box .title { font-size: 16px; font-weight: 700; color: #7a6f85; margin-bottom: 6px; }
.no-access-box .sub { font-size: 13px; }
.script-list { display: flex; flex-direction: column; gap: 10px; }
.script-empty { text-align: center; color: #4a4452; font-size: 14px; padding: 40px 0; }
.script-item { background: #0d0c14; border: 1px solid #26203080; border-radius: 13px; padding: 15px 18px; display: flex; align-items: center; gap: 14px; }
.script-info { flex: 1; min-width: 0; }
.script-name { font-size: 15px; font-weight: 700; color: #ddd6e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.script-meta { font-size: 12px; color: #58525f; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.script-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.toggle-wrap { display: flex; align-items: center; gap: 7px; }
.toggle-label { font-size: 12px; font-weight: 700; min-width: 52px; }
.toggle-label.enabled { color: #7cdc9a; }
.toggle-label.disabled { color: #7a6f85; }
.toggle { position: relative; width: 38px; height: 21px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-track { position: absolute; inset: 0; background: #2b2338; border-radius: 99px; transition: background .2s; }
.toggle input:checked + .toggle-track { background: #6c3fc4; }
.toggle-thumb { position: absolute; left: 3px; top: 3px; width: 15px; height: 15px; background: #6e6278; border-radius: 50%; transition: transform .2s, background .2s; }
.toggle input:checked ~ .toggle-thumb { transform: translateX(17px); background: #c49dff; }
.btn-delete { background: #1e0f1a; border: 1px solid #3d1f2f; color: #c06070; font-size: 13px; padding: 7px 13px; border-radius: 8px; cursor: pointer; font-weight: 700; transition: background .12s, color .12s; }
.btn-delete:hover { background: #3d1020; color: #f07080; filter: none; }
.footer { text-align: center; color: #2e2a33; font-size: 12px; margin-top: 22px; }
@media(max-width:650px) {
    .logo { font-size: 18px; }
    .user-name { display: none; }
    textarea { height: 220px; }
    .buttons, .key-toggle-group { flex-direction: column; }
    .script-item { flex-direction: column; align-items: flex-start; }
    .script-actions { width: 100%; justify-content: flex-end; }
}
</style>
</head>
<body>
<div class="topbar">
    <div class="menu-wrap">
        <button class="menu-btn" id="menuBtn">⋮</button>
        <div class="dropdown" id="dropdown">
            ${canProtect
                ? `<div class="dropdown-item" onclick="showPage('protector')"><span class="di-icon">🛡</span> Protector</div>`
                : `<div class="dropdown-item disabled"><span class="di-icon">🛡</span> Protector <span style="font-size:10px;opacity:.6;margin-left:auto">No Access</span></div>`
            }
            <div class="dropdown-item" onclick="showPage('scripts')"><span class="di-icon">📜</span> Script</div>
        </div>
    </div>
    <div class="logo">KX<span>Luaprotect</span></div>
    <div class="user-info">
        <img class="user-avatar" src="${escapeHtml(avatarUrl)}" alt="avatar">
        <span class="user-name">${escapeHtml(user.username)}</span>
        <a class="logout-btn" href="/auth/logout">Logout</a>
    </div>
</div>
<div class="container">
<div class="card">

    <!-- PROTECTOR PAGE -->
    <div class="page active" id="page-protector">
        <div class="page-header">
            <div class="page-title">Protector</div>
            <div class="page-sub">Protect script Luau kamu.</div>
        </div>
        ${canProtect ? `
        <div class="input-group">
            <div class="form-label">Nama Script</div>
            <input type="text" class="form-input" id="scriptName" placeholder="e.g. MyHub, BloomixV2...">
        </div>
        <div class="input-group">
            <div class="source-label-row">
                <span class="form-label" style="margin:0">Source</span>
                <label class="btn-upload">
                    📁 Upload File
                    <input type="file" id="fileUpload" accept=".lua,.txt" onchange="handleFileUpload(this)" style="display:none">
                </label>
            </div>
            <textarea id="source" spellcheck="false" placeholder="Paste Luau source di sini..."></textarea>
        </div>
        <div class="input-group">
            <div class="form-label">Pakai Key?</div>
            <div class="key-toggle-group">
                <button class="key-toggle-btn active" id="userKeyYes" onclick="setUserKeyMode('yes')">🔑 Yes — Random Key</button>
                <button class="key-toggle-btn" id="userKeyNo" onclick="setUserKeyMode('no')">🔓 No — Tanpa Key</button>
            </div>
        </div>
        <div class="buttons">
            <button class="btn-protect" onclick="protectCode()">🛡 Protect</button>
            <button class="btn-secondary" onclick="clearCode()">Clear</button>
        </div>
        <div class="result" id="result">
            <div class="key-box" style="display:none;margin-bottom:14px;background:#1a0f00;border:1px solid #5a3a00;border-radius:10px;padding:12px 14px">
                <div class="form-label" style="color:#f0c060;margin-bottom:6px">🔑 Script Key — Jangan share!</div>
                <div id="scriptKeyDisplay" style="font-family:Consolas,monospace;font-size:13px;color:#ffd580;word-break:break-all"></div>
            </div>
            <div class="form-label">Loader</div>
            <div class="resultBox" id="loadstring"></div>
            <div class="buttons">
                <button class="btn-secondary" onclick="copyLoadstring()">📋 Copy Loader</button>
                <button class="btn-secondary" onclick="copyUrl()">🔗 Copy URL</button>
            </div>
        </div>
        <div class="status" id="status">Ready.</div>
        ` : `
        <div class="no-access-box">
            <div class="icon">🔒</div>
            <div class="title">Akses Ditolak</div>
            <div class="sub">Kamu tidak punya izin untuk menggunakan fitur Protector.<br>Hubungi admin untuk mendapatkan akses.</div>
        </div>
        `}
    </div>

    <!-- SCRIPTS PAGE -->
    <div class="page" id="page-scripts">
        <div class="page-header">
            <div class="page-title">Script</div>
            <div class="page-sub">Script milik kamu.</div>
        </div>
        <div class="script-list" id="scriptList"><div class="script-empty">Loading...</div></div>
    </div>

</div>
<div class="footer">KXLuaprotect</div>
</div>

<script>
let currentUrl = "", currentLoadstring = "", currentKey = "";
let userKeyMode = "yes";

function showPage(name) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + name).classList.add("active");
    closeMenu();
    if (name === "scripts") renderScripts();
}
const menuBtn  = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdown");
menuBtn.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("open"); });
document.addEventListener("click", () => closeMenu());
function closeMenu() { dropdown.classList.remove("open"); }

function setUserKeyMode(mode) {
    userKeyMode = mode;
    document.getElementById("userKeyYes").classList.toggle("active", mode === "yes");
    document.getElementById("userKeyNo").classList.toggle("active",  mode === "no");
}

function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById("source").value = e.target.result;
        document.getElementById("status").textContent = "File loaded: " + file.name;
    };
    reader.onerror = () => { document.getElementById("status").textContent = "Gagal membaca file."; };
    reader.readAsText(file, "UTF-8");
    input.value = "";
}

async function protectCode() {
    const source   = document.getElementById("source").value;
    const nameVal  = document.getElementById("scriptName").value.trim();
    const status   = document.getElementById("status");
    if (!source.trim()) { status.textContent = "Paste Luau source dulu."; return; }
    status.textContent = "Protecting...";
    try {
        const response = await fetch("/api/protect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, name: nameVal || "Untitled Script", useKey: userKeyMode === "yes" })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Protection failed.");
        currentUrl         = data.url;
        currentKey         = data.key || "";
        currentLoadstring  = data.loadstring;
        document.getElementById("loadstring").textContent = currentLoadstring;
        document.getElementById("result").style.display = "block";
        const keyEl = document.getElementById("scriptKeyDisplay");
        if (keyEl) {
            if (currentKey) {
                keyEl.textContent = currentKey;
                keyEl.closest(".key-box").style.display = "block";
            } else {
                keyEl.closest(".key-box").style.display = "none";
            }
        }
        status.textContent = "Protected successfully.";
    } catch (err) { status.textContent = "❌ " + err.message; }
}

async function copyLoadstring() {
    if (!currentLoadstring) return;
    await navigator.clipboard.writeText(currentLoadstring);
    document.getElementById("status").textContent = "Loadstring copied.";
}
async function copyUrl() {
    if (!currentUrl) return;
    await navigator.clipboard.writeText(currentUrl);
    document.getElementById("status").textContent = "URL copied.";
}
function clearCode() {
    document.getElementById("source").value = "";
    document.getElementById("scriptName").value = "";
    document.getElementById("result").style.display = "none";
    document.getElementById("status").textContent = "Ready.";
    currentUrl = ""; currentLoadstring = ""; currentKey = "";
    const keyEl = document.getElementById("scriptKeyDisplay");
    if (keyEl) keyEl.closest(".key-box").style.display = "none";
    setUserKeyMode("yes");
}

function renderScripts() {
    const list = document.getElementById("scriptList");
    fetch("/api/scripts").then(r => r.json()).then(data => {
        const scripts = data.scripts || [];
        if (!scripts.length) { list.innerHTML = '<div class="script-empty">No scripts yet.</div>'; return; }
        list.innerHTML = scripts.map(s => \`
            <div class="script-item" id="item-\${s.id}">
                <div class="script-info">
                    <div class="script-name">\${escHtml(s.name)}</div>
                    <div class="script-meta">\${escHtml(s.url)}</div>
                    \${s.key ? \`<div class="script-meta" style="color:#f0c060;margin-top:2px">🔑 \${escHtml(s.key)}</div>\` : '<div class="script-meta" style="color:#7cdc9a;margin-top:2px">🔓 Tanpa Key</div>'}
                </div>
                <div class="script-actions">
                    <div class="toggle-wrap">
                        <span class="toggle-label \${s.enabled?'enabled':'disabled'}" id="lbl-\${s.id}">\${s.enabled?'Enable':'Disable'}</span>
                        <label class="toggle">
                            <input type="checkbox" \${s.enabled?'checked':''} onchange="toggleScript('\${s.id}',this.checked)">
                            <div class="toggle-track"></div>
                            <div class="toggle-thumb"></div>
                        </label>
                    </div>
                    <button class="btn-delete" onclick="deleteScript('\${s.id}')">Delete</button>
                </div>
            </div>
        \`).join("");
    }).catch(() => { list.innerHTML = '<div class="script-empty">Failed to load.</div>'; });
}
function toggleScript(id, enabled) {
    fetch(\`/api/scripts/\${id}/toggle\`, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({enabled})
    }).then(r => r.json()).then(data => {
        if (!data.success) return;
        const lbl = document.getElementById("lbl-" + id);
        if (lbl) { lbl.textContent = enabled ? "Enable" : "Disable"; lbl.className = "toggle-label " + (enabled ? "enabled" : "disabled"); }
    });
}
function deleteScript(id) {
    fetch(\`/api/scripts/\${id}\`, { method:"DELETE" }).then(r => r.json()).then(data => { if (data.success) renderScripts(); });
}
function escHtml(v) {
    return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
</script>
</body>
</html>
    `);
});

/* =================================================
   PROTECT API — support useKey + scriptId (update)
================================================= */

app.post("/api/protect", requireLogin, requireFeature("protect"), (req, res) => {
    const source   = req.body?.source;
    const name     = typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim() : "Untitled Script";
    const useKey   = req.body?.useKey !== false; // default true
    const scriptId = req.body?.scriptId || null; // update existing script jika ada

    if (typeof source !== "string") return res.status(400).json({ error: "Invalid source." });
    if (!source.trim())             return res.status(400).json({ error: "Source is empty." });

    try {
        const protectedSource = protectLuau(source);
        const baseUrl         = `${req.protocol}://${req.get("host")}`;

        let id, scriptKey, url;

        if (scriptId && loaders.has(scriptId)) {
            // Update script yang sudah ada
            const existing = loaders.get(scriptId);
            id         = scriptId;
            scriptKey  = useKey ? (existing.key || generateKey()) : null;
            url        = existing.url; // URL tetap sama
            loaders.set(id, {
                ...existing,
                name,
                source:    protectedSource,
                key:       scriptKey,
                updatedAt: Date.now(),
                enabled:   true,
            });
        } else {
            // Buat script baru
            id        = generateId();
            scriptKey = useKey ? generateKey() : null;
            url       = `${baseUrl}/files/loaders/${id}.lua`;
            loaders.set(id, {
                name,
                source:        protectedSource,
                createdAt:     Date.now(),
                enabled:       true,
                url,
                key:           scriptKey,
                ownerId:       req.session.user.id,
                ownerUsername: req.session.user.username,
            });
        }

        saveToDisk(loaders);
        addLog("protect", req.session.user.id, req.session.user.username, (scriptId ? "Updated" : "Protected") + ": " + name);

        const loadstring = scriptKey
            ? `script_key = "${scriptKey}"\nloadstring(game:HttpGet("${url}"))()`
            : `loadstring(game:HttpGet("${url}"))()`;

        res.json({ success: true, id, url, key: scriptKey, loadstring });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Protection failed." });
    }
});

/* =================================================
   SCRIPTS API
================================================= */

app.get("/api/scripts", requireLogin, (req, res) => {
    const user    = req.session.user;
    const scripts = [];
    for (const [id, item] of loaders.entries()) {
        if (!user.isAdmin && item.ownerId !== user.id) continue;
        scripts.push({ id, name: item.name, url: item.url, enabled: item.enabled, createdAt: item.createdAt, ownerUsername: item.ownerUsername || null, key: item.key || null });
    }
    scripts.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, scripts });
});

app.post("/api/scripts/:id/toggle", requireLogin, (req, res) => {
    const id   = req.params.id;
    const item = loaders.get(id);
    const user = req.session.user;
    if (!item) return res.status(404).json({ error: "Script not found." });
    if (!user.isAdmin && item.ownerId !== user.id) return res.status(403).json({ error: "Forbidden." });
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : !item.enabled;
    item.enabled = enabled;
    loaders.set(id, item);
    saveToDisk(loaders);
    res.json({ success: true, id, enabled });
});

app.delete("/api/scripts/:id", requireLogin, (req, res) => {
    const id   = req.params.id;
    const item = loaders.get(id);
    const user = req.session.user;
    if (!item) return res.status(404).json({ error: "Script not found." });
    if (!user.isAdmin && item.ownerId !== user.id) return res.status(403).json({ error: "Forbidden." });
    addLog("delete", user.id, user.username, "Deleted: " + item.name);
    loaders.delete(id);
    saveToDisk(loaders);
    res.json({ success: true, id });
});

/* =================================================
   KEY VALIDATION API
================================================= */

app.get("/api/validate", (req, res) => {
    const id  = req.query.id;
    const key = req.query.key;
    if (!id || !key) return res.status(400).type("text").send("invalid_request");
    const item = loaders.get(id);
    if (!item) return res.status(404).type("text").send("script_not_found");
    if (!item.enabled) return res.status(403).type("text").send("script_disabled");
    if (!item.key || item.key !== key) return res.status(403).type("text").send("invalid_key");
    res.status(200).type("text/plain")
        .set("Cache-Control", "no-store, no-cache, must-revalidate")
        .set("Pragma", "no-cache")
        .send(item.source);
});

/* =================================================
   LOADER
================================================= */

app.get("/files/loaders/:id.lua", (req, res) => {
    const id   = req.params.id;
    const item = loaders.get(id);
    if (!item) return res.status(404).type("text").send("Loader not found.");

    const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
    const accept    = String(req.headers["accept"]     || "").toLowerCase();
    const isBrowser =
        (userAgent.includes("mozilla") || userAgent.includes("chrome") || userAgent.includes("safari") || userAgent.includes("firefox") || userAgent.includes("edg/") || userAgent.includes("opera")) &&
        (accept.includes("text/html") || accept.includes("application/xhtml+xml"));

    if (isBrowser) {
        const baseUrl    = `${req.protocol}://${req.get("host")}`;
        const loaderUrl  = `${baseUrl}/files/loaders/${id}.lua`;
        const scriptKey  = item.key || null;
        const loaderFull = scriptKey
            ? `script_key = "${scriptKey}"\nloadstring(game:HttpGet("${loaderUrl}"))()`
            : `loadstring(game:HttpGet("${loaderUrl}"))()`;
        return res.status(200).type("html").send(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KXLuaprotect</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh;background:radial-gradient(circle at top,#26133e 0%,#0b0910 45%,#050507 100%);color:white;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:20px}.card{width:min(680px,100%);padding:40px 28px;border-radius:18px;background:rgba(14,13,19,.96);border:1px solid #2b2535;text-align:center;box-shadow:0 25px 80px rgba(0,0,0,.5)}.icon{font-size:40px;margin-bottom:14px}h1{color:#c9a8ff;font-size:24px;font-weight:900}p{color:#7a7085;margin:12px auto 22px;font-size:14px}.block{text-align:left;background:#08080c;border:1px solid #302a39;border-radius:12px;padding:14px 15px;margin-bottom:10px}.block-title{color:#6b6076;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:9px}.block-code{color:#b897ff;font-family:Consolas,monospace;font-size:13px;white-space:pre;overflow-x:auto;display:block}button{width:100%;margin-top:4px;border:0;border-radius:10px;padding:13px;background:#8051f5;color:white;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:6px}.note{margin-top:12px;color:#4e4558;font-size:12px}.key-val{color:#f0c060;font-family:Consolas,monospace;font-size:13px;word-break:break-all}</style>
</head><body><div class="card"><div class="icon">🔑</div><h1>${escapeHtml(item.name)}</h1><p>Paste loader ini ke executor kamu.${scriptKey ? " Jangan share key ke orang lain!" : ""}</p>
${scriptKey ? `<div class="block"><div class="block-title">KEY</div><div class="block-code key-val">${escapeHtml(scriptKey)}</div></div>` : ""}
<div class="block"><div class="block-title">LOADER</div><div class="block-code">${escapeHtml(loaderFull)}</div></div>
<button onclick="navigator.clipboard.writeText(${JSON.stringify(loaderFull)}).then(()=>this.textContent='✅ Copied!').catch(()=>{})">📋 Copy Full Loader</button>
<div class="note">KXLuaprotect${scriptKey ? " — Jangan share key ke siapapun." : " — Script tanpa key protection."}</div></div></body></html>
        `);
    }

    if (!item.enabled) {
        return res.status(403).type("text").send("-- KXLuaprotect: Script disabled.\nerror('Script disabled by owner.')");
    }

    if (item.key) {
        const providedKey = req.query.key;
        if (!providedKey) {
            return res.status(403).type("text").send("-- KXLuaprotect: Key required.\nerror('Set script_key before loading.')");
        }
        if (providedKey !== item.key) {
            return res.status(403).type("text").send("-- KXLuaprotect: Invalid key.\nerror('Invalid key.')");
        }
    }

    res.status(200).type("text/plain")
        .set("Cache-Control", "no-store, no-cache, must-revalidate")
        .set("Pragma", "no-cache")
        .send(item.source);
});

/* =================================================
   404
================================================= */

app.use((req, res) => {
    res.status(404).type("html").send(`<!DOCTYPE html><html><head><title>404</title><style>body{margin:0;min-height:100vh;background:#07070a;color:white;display:flex;align-items:center;justify-content:center;font-family:Arial}div{text-align:center}h1{color:#9565ff}p{color:#77727f}</style></head><body><div><h1>404</h1><p>KXLuaprotect — Page not found.</p></div></body></html>`);
});

/* =================================================
   START
================================================= */

app.listen(PORT, () => {
    console.log(`KXLuaprotect running on port ${PORT}`);
});
