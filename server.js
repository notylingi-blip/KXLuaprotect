const express      = require("express");
const crypto       = require("crypto");
const fs           = require("fs");
const nodePath     = require("path");
const session      = require("express-session");
const fetch        = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

/* =================================================
   CONFIG — isi sesuai milikmu
================================================= */

const CONFIG = {
    /* Discord OAuth2 */
    DISCORD_CLIENT_ID:     process.env.DISCORD_CLIENT_ID     || "1540862780545179698",
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "uXbmfOyb-uABovU_rPesCqSafIEnwL6Q",
    REDIRECT_URI:          process.env.REDIRECT_URI           || "https://kxluaprotect-production-a8eb.up.railway.app/auth/callback",

    /* Role ID yang dianggap admin */
    ADMIN_ROLE_ID:         process.env.ADMIN_ROLE_ID          || "1530094098856546445",

    /* Guild ID untuk cek role */
    GUILD_ID:              process.env.GUILD_ID               || "1530091511851520180",

    /* Secret untuk session cookie */
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
        maxAge:   7 * 24 * 60 * 60 * 1000, /* 7 hari */
        httpOnly: true,
        secure:   false, /* ganti true kalau pakai HTTPS */
    }
}));

/* =================================================
   PERSISTENCE
================================================= */

const DATA_DIR  = fs.existsSync("/data") ? "/data" : nodePath.join(__dirname, "data");
const DATA_FILE = nodePath.join(DATA_DIR, "scripts.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, "utf8");
            const obj = JSON.parse(raw);
            const map = new Map();
            for (const [k, v] of Object.entries(obj)) {
                map.set(k, v);
            }
            console.log("Loaded " + map.size + " scripts from disk.");
            return map;
        }
    } catch (e) {
        console.error("Failed to load scripts from disk:", e.message);
    }
    return new Map();
}

function saveToDisk(map) {
    try {
        const obj = {};
        for (const [k, v] of map.entries()) {
            obj[k] = v;
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to save scripts to disk:", e.message);
    }
}

const loaders = loadFromDisk();

/* =================================================
   HELPERS
================================================= */

function generateId() {
    return crypto.randomBytes(18).toString("hex");
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

/* =================================================
   AUTH MIDDLEWARE
================================================= */

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized." });
    }
    if (!req.session.user.isAdmin) {
        return res.status(403).json({ error: "Forbidden. Admin only." });
    }
    next();
}

/* =================================================
   DISCORD OAUTH2
================================================= */

/* Step 1 — Redirect ke Discord */
app.get("/auth/login", (req, res) => {

    const params = new URLSearchParams({
        client_id:     CONFIG.DISCORD_CLIENT_ID,
        redirect_uri:  CONFIG.REDIRECT_URI,
        response_type: "code",
        scope:         "identify guilds.members.read",
    });

    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

/* Step 2 — Discord redirect balik ke sini */
app.get("/auth/callback", async (req, res) => {

    const code = req.query.code;

    if (!code) {
        return res.redirect("/login?error=no_code");
    }

    try {

        /* Tukar code → access token */
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

        if (!tokenData.access_token) {
            return res.redirect("/login?error=token_failed");
        }

        /* Ambil info user */
        const userRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userData = await userRes.json();

        /* Cek apakah user punya admin role di guild */
        let isAdmin = false;

        try {
            const memberRes = await fetch(
                `https://discord.com/api/users/@me/guilds/${CONFIG.GUILD_ID}/member`,
                { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
            );

            const memberData = await memberRes.json();

            if (memberData.roles && memberData.roles.includes(CONFIG.ADMIN_ROLE_ID)) {
                isAdmin = true;
            }
        } catch (e) {
            /* Kalau gagal cek role, anggap bukan admin */
        }

        /* Simpan ke session */
        req.session.user = {
            id:            userData.id,
            username:      userData.username,
            discriminator: userData.discriminator || "0",
            avatar:        userData.avatar,
            isAdmin:       isAdmin,
        };

        res.redirect("/");

    } catch (e) {
        console.error("OAuth error:", e.message);
        res.redirect("/login?error=oauth_failed");
    }
});

/* Logout */
app.get("/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
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

.logo {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
}

.logo span { color: #9565ff; }

.sub {
    color: #6e6679;
    font-size: 13px;
    margin-bottom: 32px;
}

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

.btn-discord svg {
    width: 22px;
    height: 22px;
    fill: white;
}

.error {
    margin-top: 16px;
    color: #f07080;
    font-size: 13px;
    background: #2a0f18;
    border: 1px solid #5a2030;
    border-radius: 10px;
    padding: 10px 14px;
}

.footer {
    margin-top: 24px;
    color: #2e2a33;
    font-size: 11px;
}
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
   HOME PAGE (protected)
================================================= */

app.get("/", requireLogin, (req, res) => {

    const user = req.session.user;

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

body {
    min-height: 100vh;
    background: radial-gradient(circle at top, #26133e 0%, #0b0910 45%, #050507 100%);
    color: white;
    font-family: Arial, sans-serif;
}

.topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 20px;
    border-bottom: 1px solid #1e1827;
    background: rgba(10,9,14,.85);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: 100;
}

.menu-wrap { position: relative; }

.menu-btn {
    background: none;
    border: none;
    color: #9d94a8;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 7px;
    line-height: 1;
    transition: background .15s, color .15s;
    letter-spacing: 1px;
}

.menu-btn:hover { background: #1e1829; color: #c8bfd4; }

.dropdown {
    display: none;
    position: absolute;
    left: 0;
    top: calc(100% + 6px);
    background: #100e18;
    border: 1px solid #2b2337;
    border-radius: 11px;
    overflow: hidden;
    min-width: 170px;
    box-shadow: 0 12px 40px rgba(0,0,0,.55);
    z-index: 200;
}

.dropdown.open { display: block; }

.dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    color: #c0b8cc;
    font-size: 14px;
    cursor: pointer;
    transition: background .12s;
}

.dropdown-item:hover { background: #1c1729; color: #e2daed; }
.dropdown-item .di-icon { font-size: 16px; width: 20px; text-align: center; }

.logo { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; flex: 1; }
.logo span { color: #9565ff; }

.user-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid #3a2f50;
}

.user-name {
    font-size: 13px;
    font-weight: 700;
    color: #c0b8cc;
    max-width: 120px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.admin-badge {
    background: #8051f5;
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 99px;
    letter-spacing: .3px;
}

.logout-btn {
    background: #1e0f1a;
    border: 1px solid #3d1f2f;
    color: #c06070;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 700;
    text-decoration: none;
    transition: background .12s;
}

.logout-btn:hover { background: #3d1020; color: #f07080; }

.container { width: min(1100px, 94%); margin: auto; padding: 36px 0 60px; }

.card {
    background: rgba(14,13,19,.96);
    border: 1px solid #2b2535;
    border-radius: 18px;
    padding: 22px;
    box-shadow: 0 25px 70px rgba(0,0,0,.4);
}

.label {
    color: #aaa4b1;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: .5px;
}

.page { display: none; }
.page.active { display: block; }

.page-header { margin-bottom: 22px; }
.page-title { font-size: 20px; font-weight: 800; color: #e8e0f2; }
.page-sub { color: #6e6679; font-size: 13px; margin-top: 4px; }

input[type="text"] {
    width: 100%;
    background: #08080c;
    color: #e8e4ed;
    border: 1px solid #302a39;
    border-radius: 12px;
    padding: 12px 15px;
    outline: none;
    font-family: Arial, sans-serif;
    font-size: 14px;
    transition: border-color .15s;
}

input[type="text"]:focus { border-color: #895cff; }
input[type="text"]::placeholder { color: #4a4452; }

textarea {
    width: 100%;
    height: 340px;
    resize: vertical;
    background: #08080c;
    color: #e8e4ed;
    border: 1px solid #302a39;
    border-radius: 12px;
    padding: 15px;
    outline: none;
    font-family: Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
    transition: border-color .15s;
}

textarea:focus { border-color: #895cff; }

.input-group { margin-bottom: 14px; }

.source-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}

.source-label-row span {
    color: #aaa4b1;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
}

.btn-upload {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #1e1829;
    border: 1px solid #302a39;
    color: #a090b8;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 11px;
    border-radius: 8px;
    cursor: pointer;
    transition: background .12s, color .12s;
    user-select: none;
}

.btn-upload:hover { background: #2b2238; color: #c9a8ff; border-color: #5a3f80; }

.buttons { display: flex; gap: 10px; margin-top: 15px; }

button {
    border: 0;
    border-radius: 10px;
    padding: 12px 18px;
    color: white;
    font-weight: 700;
    cursor: pointer;
    font-size: 14px;
    transition: filter .12s;
}

.btn-protect { flex: 1; background: #8051f5; }
.btn-secondary { background: #25202b; }
button:hover { filter: brightness(1.12); }

.result { display: none; margin-top: 22px; }

.resultBox {
    background: #08080c;
    border: 1px solid #302a39;
    border-radius: 12px;
    padding: 14px;
    color: #b897ff;
    font-family: Consolas, monospace;
    font-size: 13px;
    word-break: break-all;
}

.status { text-align: center; color: #746e7c; font-size: 12px; margin-top: 15px; }

.script-list { display: flex; flex-direction: column; gap: 10px; }
.script-empty { text-align: center; color: #4a4452; font-size: 14px; padding: 40px 0; }

.script-item {
    background: #0d0c14;
    border: 1px solid #26203080;
    border-radius: 13px;
    padding: 15px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
}

.script-info { flex: 1; min-width: 0; }

.script-name {
    font-size: 15px;
    font-weight: 700;
    color: #ddd6e8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.script-meta {
    font-size: 12px;
    color: #58525f;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.script-owner {
    font-size: 11px;
    color: #4a3566;
    margin-top: 2px;
}

.script-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.toggle-wrap { display: flex; align-items: center; gap: 7px; }
.toggle-label { font-size: 12px; font-weight: 700; min-width: 52px; }
.toggle-label.enabled { color: #7cdc9a; }
.toggle-label.disabled { color: #7a6f85; }

.toggle { position: relative; width: 38px; height: 21px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; position: absolute; }

.toggle-track {
    position: absolute;
    inset: 0;
    background: #2b2338;
    border-radius: 99px;
    transition: background .2s;
}

.toggle input:checked + .toggle-track { background: #6c3fc4; }

.toggle-thumb {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 15px;
    height: 15px;
    background: #6e6278;
    border-radius: 50%;
    transition: transform .2s, background .2s;
}

.toggle input:checked ~ .toggle-thumb { transform: translateX(17px); background: #c49dff; }

.btn-delete {
    background: #1e0f1a;
    border: 1px solid #3d1f2f;
    color: #c06070;
    font-size: 13px;
    padding: 7px 13px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 700;
    transition: background .12s, color .12s;
}

.btn-delete:hover { background: #3d1020; color: #f07080; filter: none; }

.footer { text-align: center; color: #2e2a33; font-size: 12px; margin-top: 22px; }

@media(max-width:650px) {
    .logo { font-size: 18px; }
    .user-name { display: none; }
    textarea { height: 260px; }
    .buttons { flex-direction: column; }
    .script-item { flex-direction: column; align-items: flex-start; }
    .script-actions { width: 100%; justify-content: flex-end; }
}
</style>
</head>
<body>

<div class="topbar">

    <div class="menu-wrap">
        <button class="menu-btn" id="menuBtn" title="Menu">⋮</button>
        <div class="dropdown" id="dropdown">
            <div class="dropdown-item" onclick="showPage('protector')">
                <span class="di-icon">🛡</span> Protector
            </div>
            <div class="dropdown-item" onclick="showPage('scripts')">
                <span class="di-icon">📜</span> Script
            </div>
        </div>
    </div>

    <div class="logo">KX<span>Luaprotect</span></div>

    <div class="user-info">
        ${user.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ""}
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
            <div class="page-sub">Paste your Luau source, give it a name, then protect.</div>
        </div>

        <div class="input-group">
            <div class="label">Script Name</div>
            <input type="text" id="scriptName" placeholder="e.g. MyHub, BloomixV2, KXL_Lagger...">
        </div>

        <div class="input-group">
            <div class="label source-label-row">
                <span>Source</span>
                <label class="btn-upload" title="Upload .lua or .txt file">
                    📁 Upload File
                    <input type="file" id="fileUpload" accept=".lua,.txt" onchange="handleFileUpload(this)" style="display:none">
                </label>
            </div>
            <textarea id="source" spellcheck="false" placeholder="Paste your Luau source here, or upload a .lua / .txt file..."></textarea>
        </div>

        <div class="buttons">
            <button class="btn-protect" onclick="protectCode()">🛡 Protect</button>
            <button class="btn-secondary" onclick="clearCode()">Clear</button>
        </div>

        <div class="result" id="result">
            <div class="label">Loadstring</div>
            <div class="resultBox" id="loadstring"></div>
            <div class="buttons">
                <button class="btn-secondary" onclick="copyLoadstring()">📋 Copy Loadstring</button>
                <button class="btn-secondary" onclick="copyUrl()">🔗 Copy URL</button>
            </div>
        </div>

        <div class="status" id="status">Ready.</div>

    </div>

    <!-- SCRIPTS PAGE -->
    <div class="page" id="page-scripts">

        <div class="page-header">
            <div class="page-title">Script</div>
            <div class="page-sub">
                ${user.isAdmin
                    ? "Admin view — menampilkan semua script dari semua user."
                    : "Menampilkan script milikmu saja."}
            </div>
        </div>

        <div class="script-list" id="scriptList">
            <div class="script-empty">Loading...</div>
        </div>

    </div>

</div>
<div class="footer">KXLuaprotect</div>
</div>

<script>

const IS_ADMIN = ${user.isAdmin ? "true" : "false"};

let currentUrl = "";
let currentLoadstring = "";

function showPage(name) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + name).classList.add("active");
    closeMenu();
    if (name === "scripts") { renderScripts(); }
}

const menuBtn  = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdown");

menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
});

document.addEventListener("click", () => { closeMenu(); });
function closeMenu() { dropdown.classList.remove("open"); }

function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById("source").value = e.target.result;
        document.getElementById("status").textContent = "File loaded: " + file.name;
    };
    reader.onerror = function() {
        document.getElementById("status").textContent = "Gagal membaca file.";
    };
    reader.readAsText(file, "UTF-8");
    input.value = "";
}

async function protectCode() {
    const source  = document.getElementById("source").value;
    const nameVal = document.getElementById("scriptName").value.trim();
    const status  = document.getElementById("status");

    if (!source.trim()) {
        status.textContent = "Paste your Luau source first.";
        return;
    }

    status.textContent = "Protecting...";

    try {
        const response = await fetch("/api/protect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: source, name: nameVal || "Untitled Script" })
        });

        const data = await response.json();

        if (!response.ok) { throw new Error(data.error || "Protection failed."); }

        currentUrl        = data.url;
        currentLoadstring = data.loadstring;

        document.getElementById("loadstring").textContent = currentLoadstring;
        document.getElementById("result").style.display   = "block";
        status.textContent = "Protected successfully.";

    } catch (error) {
        status.textContent = error.message;
    }
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
    document.getElementById("source").value         = "";
    document.getElementById("scriptName").value     = "";
    document.getElementById("result").style.display = "none";
    document.getElementById("status").textContent   = "Ready.";
    currentUrl = "";
    currentLoadstring = "";
}

function renderScripts() {
    const list = document.getElementById("scriptList");

    fetch("/api/scripts")
        .then(r => r.json())
        .then(data => {

            const scripts = data.scripts || [];

            if (scripts.length === 0) {
                list.innerHTML = '<div class="script-empty">No scripts yet. Go to Protector to add one.</div>';
                return;
            }

            list.innerHTML = scripts.map(s => \`
                <div class="script-item" id="item-\${s.id}">
                    <div class="script-info">
                        <div class="script-name">\${escHtml(s.name)}</div>
                        <div class="script-meta">\${escHtml(s.url)}</div>
                        \${IS_ADMIN && s.ownerUsername
                            ? \`<div class="script-owner">👤 \${escHtml(s.ownerUsername)}</div>\`
                            : ""}
                    </div>
                    <div class="script-actions">
                        <div class="toggle-wrap">
                            <span class="toggle-label \${s.enabled ? 'enabled' : 'disabled'}" id="lbl-\${s.id}">
                                \${s.enabled ? 'Enable' : 'Disable'}
                            </span>
                            <label class="toggle">
                                <input type="checkbox" \${s.enabled ? 'checked' : ''} onchange="toggleScript('\${s.id}', this.checked)">
                                <div class="toggle-track"></div>
                                <div class="toggle-thumb"></div>
                            </label>
                        </div>
                        <button class="btn-delete" onclick="deleteScript('\${s.id}')">Delete</button>
                    </div>
                </div>
            \`).join("");
        })
        .catch(() => {
            list.innerHTML = '<div class="script-empty">Failed to load scripts.</div>';
        });
}

function toggleScript(id, enabled) {
    fetch(\`/api/scripts/\${id}/toggle\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) return;
        const lbl = document.getElementById("lbl-" + id);
        if (lbl) {
            lbl.textContent = enabled ? "Enable" : "Disable";
            lbl.className   = "toggle-label " + (enabled ? "enabled" : "disabled");
        }
    });
}

function deleteScript(id) {
    fetch(\`/api/scripts/\${id}\`, { method: "DELETE" })
        .then(r => r.json())
        .then(data => { if (data.success) { renderScripts(); } });
}

function escHtml(v) {
    return String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

</script>
</body>
</html>
    `);
});

/* =================================================
   PROTECT API
================================================= */

app.post("/api/protect", requireLogin, (req, res) => {

    const source = req.body?.source;
    const name   = typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : "Untitled Script";

    if (typeof source !== "string") {
        return res.status(400).json({ error: "Invalid source." });
    }

    if (!source.trim()) {
        return res.status(400).json({ error: "Source is empty." });
    }

    try {

        const protectedSource = protectLuau(source);
        const id              = generateId();
        const baseUrl         = `${req.protocol}://${req.get("host")}`;
        const url             = `${baseUrl}/files/loaders/${id}.lua`;

        loaders.set(id, {
            name:          name,
            source:        protectedSource,
            createdAt:     Date.now(),
            enabled:       true,
            url:           url,
            ownerId:       req.session.user.id,
            ownerUsername: req.session.user.username,
        });

        saveToDisk(loaders);

        const loadstring = `loadstring(game:HttpGet("${url}"))()`;

        res.json({ success: true, id, url, loadstring });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Protection failed." });
    }
});

/* =================================================
   LIST SCRIPTS API
   Admin: semua script
   User: milik sendiri saja
================================================= */

app.get("/api/scripts", requireLogin, (req, res) => {

    const user    = req.session.user;
    const scripts = [];

    for (const [id, item] of loaders.entries()) {

        /* User biasa hanya lihat miliknya sendiri */
        if (!user.isAdmin && item.ownerId !== user.id) continue;

        scripts.push({
            id,
            name:          item.name,
            url:           item.url,
            enabled:       item.enabled,
            createdAt:     item.createdAt,
            ownerUsername: item.ownerUsername || null,
        });
    }

    scripts.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, scripts });
});

/* =================================================
   TOGGLE SCRIPT API
================================================= */

app.post("/api/scripts/:id/toggle", requireLogin, (req, res) => {

    const id   = req.params.id;
    const item = loaders.get(id);
    const user = req.session.user;

    if (!item) {
        return res.status(404).json({ error: "Script not found." });
    }

    /* Hanya owner atau admin yang boleh */
    if (!user.isAdmin && item.ownerId !== user.id) {
        return res.status(403).json({ error: "Forbidden." });
    }

    const enabled = typeof req.body?.enabled === "boolean"
        ? req.body.enabled
        : !item.enabled;

    item.enabled = enabled;
    loaders.set(id, item);
    saveToDisk(loaders);

    res.json({ success: true, id, enabled });
});

/* =================================================
   DELETE SCRIPT API
================================================= */

app.delete("/api/scripts/:id", requireLogin, (req, res) => {

    const id   = req.params.id;
    const item = loaders.get(id);
    const user = req.session.user;

    if (!item) {
        return res.status(404).json({ error: "Script not found." });
    }

    /* Hanya owner atau admin yang boleh */
    if (!user.isAdmin && item.ownerId !== user.id) {
        return res.status(403).json({ error: "Forbidden." });
    }

    loaders.delete(id);
    saveToDisk(loaders);

    res.json({ success: true, id });
});

/* =================================================
   LOADER — tidak butuh login (akses dari executor)
================================================= */

app.get("/files/loaders/:id.lua", (req, res) => {

    const id   = req.params.id;
    const item = loaders.get(id);

    if (!item) {
        return res.status(404).type("text").send("Loader not found.");
    }

    const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
    const accept    = String(req.headers["accept"]     || "").toLowerCase();

    const isBrowser =
        (
            userAgent.includes("mozilla") ||
            userAgent.includes("chrome")  ||
            userAgent.includes("safari")  ||
            userAgent.includes("firefox") ||
            userAgent.includes("edg/")    ||
            userAgent.includes("opera")
        ) &&
        (
            accept.includes("text/html") ||
            accept.includes("application/xhtml+xml")
        );

    if (isBrowser) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        return res.status(403).type("html").send(browserPage(id, baseUrl));
    }

    if (!item.enabled) {
        return res.status(403).type("text").send(
            "-- KXLuaprotect: This script is currently disabled.\n" +
            "error('Script disabled by owner.')"
        );
    }

    res
        .status(200)
        .type("text/plain")
        .set("Cache-Control", "no-store, no-cache, must-revalidate")
        .set("Pragma", "no-cache")
        .send(item.source);
});

/* =================================================
   BROWSER SECURITY PAGE
================================================= */

function browserPage(id, baseUrl) {

    const loader = `loadstring(game:HttpGet("${baseUrl}/files/loaders/${id}.lua"))()`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KXLuaprotect</title>
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
    width: min(680px, 100%);
    padding: 40px 28px;
    border-radius: 18px;
    background: rgba(14,13,19,.96);
    border: 1px solid #2b2535;
    text-align: center;
    box-shadow: 0 25px 80px rgba(0,0,0,.5);
}
.icon { font-size: 40px; margin-bottom: 14px; }
h1 { color: #c9a8ff; font-size: 24px; font-weight: 900; line-height: 1.25; }
p { color: #7a7085; line-height: 1.6; margin: 12px auto 22px; max-width: 520px; font-size: 14px; }
.loader { text-align: left; background: #08080c; border: 1px solid #302a39; border-radius: 12px; padding: 14px 15px; }
.loader-title { color: #6b6076; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 9px; }
.loader-scroll { overflow-x: auto; cursor: grab; scrollbar-width: thin; scrollbar-color: #3a2f47 #08080c; }
.loader-code { color: #b897ff; font-family: Consolas, monospace; font-size: 13px; white-space: nowrap; display: inline-block; min-width: 100%; }
button { width: 100%; margin-top: 14px; border: 0; border-radius: 10px; padding: 13px; background: #8051f5; color: white; font-weight: 700; font-size: 14px; cursor: pointer; transition: filter .12s; }
button:hover { filter: brightness(1.12); }
.note { margin-top: 16px; color: #4e4558; font-size: 12px; }
.brand { margin-top: 18px; color: #2e2a33; font-size: 11px; font-weight: 700; }
.brand span { color: #4a3566; }
</style>
</head>
<body>
<div class="card">
    <div class="icon">🔒</div>
    <h1>This script can't be viewed in a browser</h1>
    <p>For security, the source is only delivered to Roblox at runtime.</p>
    <div class="loader">
        <div class="loader-title">LOADER</div>
        <div class="loader-scroll">
            <div class="loader-code">${escapeHtml(loader)}</div>
        </div>
    </div>
    <button onclick="navigator.clipboard.writeText(${JSON.stringify(loader)}).then(()=>this.textContent='✅ Copied!').catch(()=>{})">📋 Copy Loader</button>
    <div class="note">Paste ini ke executor kamu.</div>
    <div class="brand">KX<span>Luaprotect</span></div>
</div>
</body>
</html>
    `;
}

/* =================================================
   404
================================================= */

app.use((req, res) => {
    res.status(404).type("html").send(`
<!DOCTYPE html>
<html>
<head><title>404</title>
<style>body{margin:0;min-height:100vh;background:#07070a;color:white;display:flex;align-items:center;justify-content:center;font-family:Arial;}div{text-align:center;}h1{color:#9565ff;}p{color:#77727f;}</style>
</head>
<body><div><h1>404</h1><p>KXLuaprotect — Page not found.</p></div></body>
</html>
    `);
});

/* =================================================
   START
================================================= */

app.listen(PORT, () => {
    console.log(`KXLuaprotect running on port ${PORT}`);
});
