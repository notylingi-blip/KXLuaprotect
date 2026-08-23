const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const DB_FILE = path.join(DATA_DIR, "scripts.json");

for (const dir of [DATA_DIR, SCRIPTS_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

app.use(express.json({ limit: "10mb" }));

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        return [];
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
    return crypto.randomBytes(16).toString("hex");
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/*
==================================================
 API
==================================================
*/

// List scripts
app.get("/api/scripts", (req, res) => {
    const db = readDB();

    res.json(
        db.map(script => ({
            id: script.id,
            name: script.name,
            enabled: script.enabled,
            createdAt: script.createdAt
        }))
    );
});

// Upload script
app.post("/api/scripts", (req, res) => {
    const { name, source } = req.body;

    if (!name || typeof name !== "string") {
        return res.status(400).json({
            error: "Script name is required"
        });
    }

    if (!source || typeof source !== "string") {
        return res.status(400).json({
            error: "Lua source is required"
        });
    }

    const id = generateId();

    const filename = `${id}.lua`;
    const filepath = path.join(SCRIPTS_DIR, filename);

    fs.writeFileSync(filepath, source, "utf8");

    const script = {
        id,
        name: name.trim().slice(0, 100),
        filename,
        enabled: true,
        createdAt: new Date().toISOString()
    };

    const db = readDB();
    db.push(script);
    writeDB(db);

    res.json({
        success: true,
        script: {
            id: script.id,
            name: script.name,
            enabled: script.enabled,
            createdAt: script.createdAt
        },
        loader: `${getBaseUrl(req)}/files/loaders/${id}.lua`
    });
});

// Enable / Disable
app.post("/api/scripts/:id/toggle", (req, res) => {
    const db = readDB();

    const script = db.find(x => x.id === req.params.id);

    if (!script) {
        return res.status(404).json({
            error: "Script not found"
        });
    }

    script.enabled = !script.enabled;

    writeDB(db);

    res.json({
        success: true,
        enabled: script.enabled
    });
});

// Delete
app.delete("/api/scripts/:id", (req, res) => {
    const db = readDB();

    const index = db.findIndex(x => x.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({
            error: "Script not found"
        });
    }

    const script = db[index];

    const filepath = path.join(SCRIPTS_DIR, script.filename);

    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }

    db.splice(index, 1);
    writeDB(db);

    res.json({
        success: true
    });
});

/*
==================================================
 PROTECTED PAYLOAD
==================================================
*/

app.get("/api/payload/:id", (req, res) => {
    const db = readDB();

    const script = db.find(x => x.id === req.params.id);

    if (!script) {
        return res.status(404).send("-- Script not found");
    }

    if (!script.enabled) {
        return res.status(403).send("-- Script disabled");
    }

    const filepath = path.join(SCRIPTS_DIR, script.filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send("-- Source missing");
    }

    const source = fs.readFileSync(filepath, "utf8");

    res.type("text/plain");
    res.send(source);
});

/*
==================================================
 LUA LOADER
==================================================
*/

app.get("/files/loaders/:id.lua", (req, res) => {
    const db = readDB();

    const script = db.find(x => x.id === req.params.id);

    if (!script) {
        return res.status(404).type("text/plain").send(
            'warn("SpideyProtect: Script not found")'
        );
    }

    if (!script.enabled) {
        return res.status(403).type("text/plain").send(
            'warn("SpideyProtect: Script disabled")'
        );
    }

    const base = getBaseUrl(req);
    const payloadURL = `${base}/api/payload/${script.id}`;

    const loader = `
--[[
    SpideyProtect
    Protected Loader
    Script: ${script.name.replace(/]/g, "")}
]]

local URL = ${JSON.stringify(payloadURL)}

local success, source = pcall(function()
    return game:HttpGet(URL)
end)

if not success then
    warn("SpideyProtect: Failed to download payload")
    return
end

if not source or source == "" then
    warn("SpideyProtect: Empty payload")
    return
end

local execute, err = loadstring(source)

if not execute then
    warn("SpideyProtect: Lua error:", err)
    return
end

local ok, runtimeError = pcall(execute)

if not ok then
    warn("SpideyProtect: Runtime error:", runtimeError)
end
`;

    res
        .status(200)
        .type("text/plain")
        .set("Cache-Control", "no-store")
        .send(loader.trim());
});

/*
==================================================
 FRONTEND
==================================================
*/

app.get("/", (req, res) => {
    const db = readDB();

    const cards = db.map(script => {
        const loader = `${getBaseUrl(req)}/files/loaders/${script.id}.lua`;

        return `
        <div class="script-card">
            <div class="script-info">
                <div class="script-icon">🕷️</div>

                <div>
                    <div class="script-name">
                        ${escapeHtml(script.name)}
                    </div>

                    <div class="script-status ${script.enabled ? "on" : "off"}">
                        ${script.enabled ? "● Enabled" : "● Disabled"}
                    </div>
                </div>
            </div>

            <div class="script-menu">
                <button class="dots" onclick="toggleMenu('${script.id}')">
                    ⋮
                </button>

                <div class="menu" id="menu-${script.id}">
                    <button onclick="copyLoader('${loader}')">
                        📋 Copy Loader
                    </button>

                    <button onclick="toggleScript('${script.id}')">
                        ${script.enabled ? "⏸ Disable" : "▶ Enable"}
                    </button>

                    <button class="delete" onclick="deleteScript('${script.id}')">
                        🗑 Delete
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join("");

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>SpideyProtect</title>

<style>

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family:
        Inter,
        Arial,
        sans-serif;

    min-height: 100vh;

    color: #fff;

    background:
        radial-gradient(
            circle at top left,
            rgba(255, 0, 0, .25),
            transparent 35%
        ),
        radial-gradient(
            circle at bottom right,
            rgba(255, 255, 255, .08),
            transparent 30%
        ),
        #070707;
}

.header {
    width: 100%;
    border-bottom: 1px solid rgba(255,255,255,.1);

    background:
        linear-gradient(
            90deg,
            #8b0000,
            #e00000,
            #090909
        );

    padding: 22px 30px;

    display: flex;
    justify-content: space-between;
    align-items: center;
}

.brand {
    display: flex;
    align-items: center;
    gap: 12px;
}

.logo {
    width: 45px;
    height: 45px;

    border-radius: 13px;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 25px;

    background: #fff;
    color: #c00000;

    box-shadow:
        0 0 25px rgba(255,0,0,.35);
}

.brand h1 {
    font-size: 23px;
    font-weight: 800;
}

.brand span {
    display: block;

    font-size: 11px;
    color: rgba(255,255,255,.65);

    margin-top: 2px;
}

.container {
    width: min(1100px, calc(100% - 30px));

    margin: 35px auto;
}

.hero {
    background:
        linear-gradient(
            135deg,
            rgba(255,0,0,.18),
            rgba(255,255,255,.03)
        );

    border:
        1px solid rgba(255,255,255,.1);

    border-radius: 20px;

    padding: 28px;

    margin-bottom: 25px;

    box-shadow:
        0 15px 50px rgba(0,0,0,.3);
}

.hero h2 {
    font-size: 27px;
    margin-bottom: 8px;
}

.hero p {
    color: #aaa;
    font-size: 14px;
}

.upload {
    margin-top: 22px;

    display: grid;
    grid-template-columns: 1fr 2fr auto;

    gap: 10px;
}

input,
textarea {
    width: 100%;

    border:
        1px solid rgba(255,255,255,.12);

    outline: none;

    color: white;

    background: #111;

    border-radius: 11px;

    padding: 13px;

    font-family: inherit;
}

textarea {
    min-height: 100px;
    resize: vertical;
}

button {
    border: none;
    cursor: pointer;
    font-family: inherit;
}

.upload button {
    border-radius: 11px;

    padding: 0 22px;

    font-weight: 800;

    background: #fff;
    color: #a00000;

    transition: .2s;
}

.upload button:hover {
    transform: translateY(-2px);

    box-shadow:
        0 8px 25px rgba(255,255,255,.15);
}

.source-box {
    grid-column: 1 / -1;
}

.section-title {
    margin: 25px 0 12px;

    font-size: 15px;

    color: #aaa;
}

.scripts {
    display: grid;

    grid-template-columns:
        repeat(auto-fit, minmax(300px, 1fr));

    gap: 15px;
}

.script-card {
    position: relative;

    display: flex;

    justify-content: space-between;
    align-items: center;

    padding: 18px;

    border-radius: 17px;

    background:
        linear-gradient(
            145deg,
            #151515,
            #0d0d0d
        );

    border:
        1px solid rgba(255,255,255,.08);

    transition: .2s;
}

.script-card:hover {
    border-color:
        rgba(255,0,0,.35);

    transform: translateY(-2px);
}

.script-info {
    display: flex;

    align-items: center;

    gap: 13px;
}

.script-icon {
    width: 45px;
    height: 45px;

    border-radius: 12px;

    display: flex;

    justify-content: center;
    align-items: center;

    background:
        linear-gradient(
            135deg,
            #e00000,
            #690000
        );

    font-size: 22px;
}

.script-name {
    font-size: 15px;
    font-weight: 700;

    max-width: 200px;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.script-status {
    margin-top: 4px;

    font-size: 11px;
}

.script-status.on {
    color: #54ff88;
}

.script-status.off {
    color: #ff4d4d;
}

.script-menu {
    position: relative;
}

.dots {
    width: 38px;
    height: 38px;

    border-radius: 10px;

    background: #1c1c1c;
    color: white;

    font-size: 23px;
}

.menu {
    display: none;

    position: absolute;

    right: 0;
    top: 45px;

    width: 170px;

    z-index: 100;

    background: #161616;

    border:
        1px solid rgba(255,255,255,.1);

    border-radius: 12px;

    padding: 6px;

    box-shadow:
        0 15px 40px rgba(0,0,0,.6);
}

.menu.show {
    display: block;
}

.menu button {
    width: 100%;

    padding: 10px;

    border-radius: 8px;

    background: transparent;
    color: #eee;

    text-align: left;
}

.menu button:hover {
    background: #252525;
}

.menu .delete {
    color: #ff4d4d;
}

.empty {
    text-align: center;

    padding: 50px;

    border-radius: 18px;

    border:
        1px dashed rgba(255,255,255,.12);

    color: #666;
}

.toast {
    position: fixed;

    bottom: 25px;
    left: 50%;

    transform:
        translateX(-50%)
        translateY(80px);

    padding: 13px 20px;

    border-radius: 12px;

    background: #fff;
    color: #111;

    font-size: 13px;
    font-weight: 700;

    opacity: 0;

    transition: .25s;

    z-index: 999;
}

.toast.show {
    opacity: 1;

    transform:
        translateX(-50%)
        translateY(0);
}

@media(max-width:700px) {

    .header {
        padding: 18px;
    }

    .container {
        width: calc(100% - 20px);
        margin-top: 20px;
    }

    .upload {
        grid-template-columns: 1fr;
    }

    .upload button {
        padding: 13px;
    }

    .hero {
        padding: 20px;
    }

}

</style>

</head>

<body>

<header class="header">

    <div class="brand">

        <div class="logo">
            🕷️
        </div>

        <div>
            <h1>SpideyProtect</h1>
            <span>Lua Protection System</span>
        </div>

    </div>

</header>

<main class="container">

    <section class="hero">

        <h2>Protect Your Scripts 🕷️</h2>

        <p>
            Upload your Lua script and generate a protected loader.
        </p>

        <div class="upload">

            <input
                id="scriptName"
                placeholder="Script name..."
            >

            <button onclick="uploadScript()">
                + Add Script
            </button>

            <div></div>

            <div class="source-box">

                <textarea
                    id="scriptSource"
                    placeholder="Paste your Lua source here..."
                ></textarea>

            </div>

        </div>

    </section>

    <div class="section-title">
        Your Scripts
    </div>

    <section class="scripts">

        ${
            cards ||
            `<div class="empty">
                🕷️ No scripts yet.<br>
                Upload your first Lua script above.
            </div>`
        }

    </section>

</main>

<div id="toast" class="toast"></div>

<script>

function toast(message) {

    const el =
        document.getElementById("toast");

    el.textContent = message;

    el.classList.add("show");

    setTimeout(() => {
        el.classList.remove("show");
    }, 2200);
}

function toggleMenu(id) {

    document
        .querySelectorAll(".menu")
        .forEach(x => x.classList.remove("show"));

    const menu =
        document.getElementById("menu-" + id);

    if (menu) {
        menu.classList.toggle("show");
    }
}

document.addEventListener("click", e => {

    if (
        !e.target.closest(".script-menu")
    ) {
        document
            .querySelectorAll(".menu")
            .forEach(x =>
                x.classList.remove("show")
            );
    }

});

async function uploadScript() {

    const name =
        document
            .getElementById("scriptName")
            .value
            .trim();

    const source =
        document
            .getElementById("scriptSource")
            .value;

    if (!name) {
        toast("Enter script name!");
        return;
    }

    if (!source.trim()) {
        toast("Enter Lua source!");
        return;
    }

    try {

        const response =
            await fetch("/api/scripts", {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    name,
                    source
                })
            });

        const data =
            await response.json();

        if (!response.ok) {
            toast(data.error || "Upload failed");
            return;
        }

        toast("Script uploaded!");

        setTimeout(() => {
            location.reload();
        }, 500);

    } catch (err) {

        toast("Server error");

    }
}

async function toggleScript(id) {

    try {

        const response =
            await fetch(
                "/api/scripts/" +
                id +
                "/toggle",
                {
                    method: "POST"
                }
            );

        if (!response.ok) {
            toast("Failed");
            return;
        }

        location.reload();

    } catch {

        toast("Server error");

    }
}

async function deleteScript(id) {

    if (
        !confirm(
            "Delete this script?"
        )
    ) {
        return;
    }

    try {

        const response =
            await fetch(
                "/api/scripts/" + id,
                {
                    method: "DELETE"
                }
            );

        if (!response.ok) {
            toast("Delete failed");
            return;
        }

        toast("Script deleted!");

        setTimeout(() => {
            location.reload();
        }, 500);

    } catch {

        toast("Server error");

    }
}

async function copyLoader(url) {

    try {

        await navigator.clipboard.writeText(
            'loadstring(game:HttpGet("' +
            url +
            '"))()'
        );

        toast("Loader copied!");

    } catch {

        toast("Failed to copy");

    }
}

</script>

</body>
</html>
`);
});

/*
==================================================
 HELPERS
==================================================
*/

function getBaseUrl(req) {

    const forwarded =
        req.headers["x-forwarded-proto"];

    const protocol =
        forwarded ||
        req.protocol ||
        "https";

    return (
        protocol +
        "://" +
        req.get("host")
    );
}

/*
==================================================
 START
==================================================
*/

app.listen(PORT, () => {

    console.log(`
╔══════════════════════════════════╗
║          SpideyProtect           ║
║       Lua Protection Server      ║
╠══════════════════════════════════╣
║ Port: ${PORT}
║ Status: Online
╚══════════════════════════════════╝
`);

});
