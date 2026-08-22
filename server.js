const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/*
==================================================
 KXLuaprotect
==================================================

 Features:
 - Protect Luau
 - Custom script name
 - Script manager
 - Enable / Disable
 - Delete script
 - Browser protection page
 - Runtime loader
==================================================
*/

const loaders = new Map();

/* =================================================
   ID GENERATOR
================================================= */

function generateId() {
    return crypto.randomBytes(18).toString("hex");
}

/* =================================================
   BASIC LUALU TRANSFORMER
================================================= */

function protectLuau(source) {

    let code = String(source);

    /*
       Remove block comments
    */
    code = code.replace(
        /--\[\[[\s\S]*?\]\]/g,
        ""
    );

    /*
       Remove single-line comments
       without touching strings.
    */

    let output = "";
    let i = 0;

    while (i < code.length) {

        const char = code[i];

        /*
           Double quote
        */
        if (char === '"') {

            let j = i + 1;

            while (j < code.length) {

                if (code[j] === "\\") {
                    j += 2;
                    continue;
                }

                if (code[j] === '"') {
                    j++;
                    break;
                }

                j++;
            }

            output += code.slice(i, j);
            i = j;

            continue;
        }

        /*
           Single quote
        */
        if (char === "'") {

            let j = i + 1;

            while (j < code.length) {

                if (code[j] === "\\") {
                    j += 2;
                    continue;
                }

                if (code[j] === "'") {
                    j++;
                    break;
                }

                j++;
            }

            output += code.slice(i, j);
            i = j;

            continue;
        }

        /*
           Comment
        */
        if (
            char === "-" &&
            code[i + 1] === "-"
        ) {

            while (
                i < code.length &&
                code[i] !== "\n"
            ) {
                i++;
            }

            output += "\n";

            continue;
        }

        output += char;
        i++;
    }

    code = output;

    /*
       Normalize line endings
    */
    code = code.replace(
        /\r\n/g,
        "\n"
    );

    /*
       Remove trailing spaces
    */
    code = code
        .split("\n")
        .map(line => line.trimEnd())
        .join("\n");

    /*
       Remove excessive blank lines
    */
    code = code.replace(
        /\n{3,}/g,
        "\n\n"
    );

    /*
       Marker
    */
    return (
        "-- KXLuaprotect Protected\n\n" +
        code.trim() +
        "\n"
    );
}

/* =================================================
   HTML ESCAPER
================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =================================================
   HOME PAGE
================================================= */

const HOME_PAGE = `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>KXLuaprotect</title>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    min-height: 100vh;

    background:
        radial-gradient(
            circle at top,
            #26133e 0%,
            #0b0910 45%,
            #050507 100%
        );

    color: white;

    font-family:
        Arial,
        sans-serif;
}

.container {

    width:
        min(1100px,94%);

    margin:
        auto;

    padding:
        40px 0;
}

.header {

    text-align:
        center;

    margin-bottom:
        30px;
}

.logo {

    font-size:
        43px;

    font-weight:
        900;

    letter-spacing:
        -1px;
}

.logo span {
    color: #9565ff;
}

.subtitle {

    color:
        #77727f;

    margin-top:
        8px;

    font-size:
        14px;
}

.card {

    background:
        rgba(14,13,19,.96);

    border:
        1px solid #2b2535;

    border-radius:
        18px;

    padding:
        18px;

    box-shadow:
        0 25px 70px
        rgba(0,0,0,.4);
}

.label {

    color:
        #aaa4b1;

    font-size:
        12px;

    font-weight:
        700;

    margin-bottom:
        10px;
}

input {

    width: 100%;

    background:
        #08080c;

    color:
        #e8e4ed;

    border:
        1px solid #302a39;

    border-radius:
        12px;

    padding:
        14px;

    outline:
        none;

    margin-bottom:
        15px;

    font-size:
        14px;
}

input:focus {
    border-color:
        #895cff;
}

textarea {

    width:
        100%;

    height:
        390px;

    resize:
        vertical;

    background:
        #08080c;

    color:
        #e8e4ed;

    border:
        1px solid #302a39;

    border-radius:
        12px;

    padding:
        15px;

    outline:
        none;

    font-family:
        Consolas,
        monospace;

    font-size:
        13px;

    line-height:
        1.55;
}

textarea:focus {
    border-color:
        #895cff;
}

.buttons {

    display:
        flex;

    gap:
        10px;

    margin-top:
        15px;
}

button {

    border:
        0;

    border-radius:
        10px;

    padding:
        13px 18px;

    color:
        white;

    font-weight:
        700;

    cursor:
        pointer;
}

.protect {

    flex:
        1;

    background:
        #8051f5;
}

.secondary {

    background:
        #25202b;
}

button:hover {
    filter:
        brightness(1.12);
}

.result {

    display:
        none;

    margin-top:
        22px;
}

.resultBox {

    background:
        #08080c;

    border:
        1px solid #302a39;

    border-radius:
        12px;

    padding:
        14px;

    color:
        #b897ff;

    font-family:
        Consolas,
        monospace;

    font-size:
        13px;

    word-break:
        break-all;
}

.status {

    text-align:
        center;

    color:
        #746e7c;

    font-size:
        12px;

    margin-top:
        15px;
}

.footer {

    text-align:
        center;

    color:
        #514c58;

    font-size:
        12px;

    margin-top:
        22px;
}

@media(max-width:650px) {

    .logo {
        font-size:
            34px;
    }

    textarea {
        height:
            300px;
    }

    .buttons {
        flex-direction:
            column;
    }
}

</style>

</head>

<body>

<div class="container">

<div class="header">

<div class="logo">
KX<span>Luaprotect</span>
</div>

<div class="subtitle">
Luau Source Protection
</div>

</div>

<div class="card">

<div class="label">
SCRIPT NAME
</div>

<input
    id="scriptName"
    maxlength="80"
    placeholder="Example: KXL Duel"
/>

<div class="label">
SOURCE
</div>

<textarea
    id="source"
    spellcheck="false"
    placeholder="Paste your Luau source here..."
></textarea>

<div class="buttons">

<button
    class="protect"
    onclick="protectCode()"
>
🛡 Protect
</button>

<button
    class="secondary"
    onclick="clearCode()"
>
Clear
</button>

</div>

<div
    class="result"
    id="result"
>

<div class="label">
LOADSTRING
</div>

<div
    class="resultBox"
    id="loadstring"
></div>

<div class="buttons">

<button
    class="secondary"
    onclick="copyLoadstring()"
>
📋 Copy Loadstring
</button>

<button
    class="secondary"
    onclick="copyUrl()"
>
🔗 Copy URL
</button>

</div>

</div>

<div
    class="status"
    id="status"
>
Ready.
</div>

</div>

<div class="footer">
KXLuaprotect
</div>

</div>

<script>

let currentUrl = "";
let currentLoadstring = "";

async function protectCode() {

    const source =
        document.getElementById(
            "source"
        ).value;

    const scriptName =
        document.getElementById(
            "scriptName"
        ).value.trim();

    const status =
        document.getElementById(
            "status"
        );

    if (!scriptName) {

        status.textContent =
            "Enter a script name.";

        return;
    }

    if (!source.trim()) {

        status.textContent =
            "Paste your Luau source first.";

        return;
    }

    status.textContent =
        "Protecting...";

    try {

        const response =
            await fetch(
                "/api/protect",
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            name:
                                scriptName,

                            source:
                                source
                        })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Protection failed."
            );
        }

        currentUrl =
            data.url;

        currentLoadstring =
            data.loadstring;

        document.getElementById(
            "loadstring"
        ).textContent =
            currentLoadstring;

        document.getElementById(
            "result"
        ).style.display =
            "block";

        status.textContent =
            "Protected successfully.";

    } catch (error) {

        status.textContent =
            error.message;
    }
}

async function copyLoadstring() {

    if (!currentLoadstring)
        return;

    await navigator.clipboard
        .writeText(
            currentLoadstring
        );

    document.getElementById(
        "status"
    ).textContent =
        "Loadstring copied.";
}

async function copyUrl() {

    if (!currentUrl)
        return;

    await navigator.clipboard
        .writeText(
            currentUrl
        );

    document.getElementById(
        "status"
    ).textContent =
        "URL copied.";
}

function clearCode() {

    document.getElementById(
        "source"
    ).value = "";

    document.getElementById(
        "scriptName"
    ).value = "";

    document.getElementById(
        "result"
    ).style.display =
        "none";

    document.getElementById(
        "status"
    ).textContent =
        "Ready.";

    currentUrl = "";
    currentLoadstring = "";
}

</script>

</body>

</html>
`;

/* =================================================
   BROWSER SECURITY PAGE
================================================= */

function browserPage(id, baseUrl) {

    const loader =
        `loadstring(game:HttpGet("${baseUrl}/files/loaders/${id}.lua"))()`;

    return `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>KXLuaprotect</title>

<style>

* {
    box-sizing:
        border-box;
}

body {

    margin:
        0;

    min-height:
        100vh;

    background:
        radial-gradient(
            circle at top,
            #082b4b 0%,
            #031525 55%,
            #020e19 100%
        );

    color:
        white;

    font-family:
        Arial,
        sans-serif;

    display:
        flex;

    align-items:
        center;

    justify-content:
        center;

    padding:
        20px;
}

/* ===============================
   TOP LEFT MENU
================================ */

.menu-wrap {

    position:
        fixed;

    top:
        18px;

    left:
        18px;

    z-index:
        9999;
}

.menu-btn {

    width:
        42px;

    height:
        42px;

    padding:
        0;

    border-radius:
        12px;

    background:
        rgba(8,20,31,.9);

    border:
        1px solid #183247;

    color:
        #c8d9e5;

    font-size:
        25px;

    line-height:
        35px;
}

.menu-btn:hover {
    background:
        #102b40;
}

.menu {

    display:
        none;

    position:
        absolute;

    top:
        50px;

    left:
        0;

    width:
        220px;

    background:
        #06131f;

    border:
        1px solid #183247;

    border-radius:
        13px;

    padding:
        7px;

    box-shadow:
        0 20px 50px
        rgba(0,0,0,.5);
}

.menu-item {

    width:
        100%;

    text-align:
        left;

    background:
        transparent;

    border:
        0;

    padding:
        12px;

    border-radius:
        9px;

    color:
        #dce8ef;

    cursor:
        pointer;

    font-size:
        13px;

    margin:
        0;
}

.menu-item:hover {
    background:
        #10283a;
}

/* ===============================
   MAIN CARD
================================ */

.card {

    width:
        min(680px,100%);

    padding:
        45px 28px;

    border-radius:
        18px;

    background:
        rgba(5,28,47,.78);

    border:
        1px solid
        rgba(70,170,255,.18);

    text-align:
        center;

    box-shadow:
        0 25px 80px
        rgba(0,0,0,.45);
}

.icon {

    font-size:
        42px;

    margin-bottom:
        15px;
}

h1 {

    margin:
        0;

    color:
        #159cff;

    font-size:
        28px;

    line-height:
        1.2;
}

p {

    color:
        #9aaebb;

    line-height:
        1.6;

    margin:
        12px auto 25px;

    max-width:
        560px;
}

.loader {

    text-align:
        left;

    background:
        #020b13;

    border:
        1px solid #183247;

    border-radius:
        12px;

    padding:
        15px;

    overflow:
        hidden;
}

.loader-title {

    color:
        #7f96a8;

    font-size:
        12px;

    font-weight:
        bold;

    margin-bottom:
        8px;
}

.loader-code {

    color:
        #d8e6f0;

    font-family:
        Consolas,
        monospace;

    font-size:
        13px;

    white-space:
        nowrap;

    overflow:
        hidden;

    text-overflow:
        ellipsis;
}

.copy-btn {

    width:
        100%;

    margin-top:
        14px;

    border:
        0;

    border-radius:
        10px;

    padding:
        13px;

    background:
        #079bf3;

    color:
        white;

    font-weight:
        bold;

    cursor:
        pointer;
}

.copy-btn:hover {
    filter:
        brightness(1.1);
}

.note {

    margin-top:
        18px;

    color:
        #6f8291;

    font-size:
        12px;

    line-height:
        1.5;
}

.brand {

    margin-top:
        20px;

    color:
        #36556b;

    font-size:
        11px;
}

/* ===============================
   SCRIPT MANAGER
================================ */

.manager {

    display:
        none;

    position:
        fixed;

    inset:
        0;

    background:
        rgba(0,0,0,.72);

    z-index:
        9998;

    align-items:
        center;

    justify-content:
        center;

    padding:
        20px;
}

.manager-card {

    width:
        min(600px,100%);

    max-height:
        80vh;

    overflow:
        auto;

    background:
        #06131f;

    border:
        1px solid #183247;

    border-radius:
        18px;

    padding:
        20px;

    box-shadow:
        0 30px 90px
        rgba(0,0,0,.6);
}

.manager-head {

    display:
        flex;

    justify-content:
        space-between;

    align-items:
        center;

    margin-bottom:
        15px;
}

.manager-title {

    font-size:
        20px;

    font-weight:
        800;

    color:
        #e8f5ff;
}

.close-btn {

    width:
        38px;

    height:
        38px;

    padding:
        0;

    background:
        #10283a;

    border:
        1px solid #1b3a50;

    border-radius:
        10px;

    font-size:
        20px;
}

.script-item {

    background:
        #081c2b;

    border:
        1px solid #17364b;

    border-radius:
        13px;

    padding:
        14px;

    margin-bottom:
        10px;
}

.script-name {

    color:
        #e5f4ff;

    font-weight:
        800;

    font-size:
        14px;

    word-break:
        break-word;
}

.script-id {

    color:
        #587486;

    font-size:
        10px;

    margin-top:
        5px;
}

.script-status {

    font-size:
        11px;

    margin-top:
        7px;
}

.enabled {
    color:
        #54df91;
}

.disabled {
    color:
        #ff6575;
}

.script-actions {

    display:
        flex;

    gap:
        7px;

    margin-top:
        12px;
}

.action {

    flex:
        1;

    padding:
        9px 6px;

    font-size:
        11px;

    background:
        #10283a;

    border:
        1px solid #1a3b52;
}

.action.delete {
    background:
        #38151c;

    border-color:
        #64222d;
}

.empty {

    text-align:
        center;

    color:
        #60798a;

    padding:
        35px 10px;
}

</style>

</head>

<body>

<!-- MENU -->

<div class="menu-wrap">

    <button
        class="menu-btn"
        onclick="toggleMenu()"
    >
        ⋮
    </button>

    <div
        class="menu"
        id="menu"
    >

        <button
            class="menu-item"
            onclick="openScripts()"
        >
            📜 Script
        </button>

    </div>

</div>

<!-- MAIN -->

<div class="card">

    <div class="icon">
        🔒
    </div>

    <h1>
        This script can't be viewed in a browser
    </h1>

    <p>
        For security, the source is only delivered
        to the runtime. Use the loader below.
    </p>

    <div class="loader">

        <div class="loader-title">
            LOADER
        </div>

        <div class="loader-code">
            ${escapeHtml(loader)}
        </div>

    </div>

    <button
        class="copy-btn"
        onclick="copyLoader()"
    >
        Copy loader
    </button>

    <div class="note">
        Paste this into your runtime to execute
        the protected script.
    </div>

    <div class="brand">
        KXLuaprotect
    </div>

</div>

<!-- SCRIPT MANAGER -->

<div
    class="manager"
    id="manager"
>

    <div class="manager-card">

        <div class="manager-head">

            <div class="manager-title">
                Scripts
            </div>

            <button
                class="close-btn"
                onclick="closeScripts()"
            >
                ×
            </button>

        </div>

        <div id="scriptList"></div>

    </div>

</div>

<script>

function toggleMenu() {

    const menu =
        document.getElementById("menu");

    menu.style.display =
        menu.style.display === "block"
            ? "none"
            : "block";
}

/* ==========================================
   SCRIPT MANAGER
========================================== */

async function openScripts() {

    document.getElementById(
        "menu"
    ).style.display = "none";

    document.getElementById(
        "manager"
    ).style.display = "flex";

    await loadScripts();
}

function closeScripts() {

    document.getElementById(
        "manager"
    ).style.display = "none";
}

async function loadScripts() {

    const list =
        document.getElementById(
            "scriptList"
        );

    list.innerHTML =
        '<div class="empty">Loading...</div>';

    try {

        const response =
            await fetch(
                "/api/scripts"
            );

        const scripts =
            await response.json();

        if (!scripts.length) {

            list.innerHTML =
                '<div class="empty">No scripts found.</div>';

            return;
        }

        list.innerHTML = "";

        scripts.forEach(script => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "script-item";

            const statusClass =
                script.enabled
                    ? "enabled"
                    : "disabled";

            const statusText =
                script.enabled
                    ? "● Enabled"
                    : "● Disabled";

            item.innerHTML = `

                <div class="script-name">
                    ${escapeHtmlClient(script.name)}
                </div>

                <div class="script-id">
                    ID: ${escapeHtmlClient(script.id)}
                </div>

                <div class="script-status ${statusClass}">
                    ${statusText}
                </div>

                <div class="script-actions">

                    <button
                        class="action"
                        onclick="toggleScript('${script.id}')"
                    >
                        ${script.enabled ? "Disable" : "Enable"}
                    </button>

                    <button
                        class="action delete"
                        onclick="deleteScript('${script.id}')"
                    >
                        Delete
                    </button>

                </div>
            `;

            list.appendChild(item);
        });

    } catch (error) {

        list.innerHTML =
            '<div class="empty">Failed to load scripts.</div>';
    }
}

/* ==========================================
   ENABLE / DISABLE
========================================== */

async function toggleScript(id) {

    try {

        const response =
            await fetch(
                "/api/scripts/" +
                encodeURIComponent(id) +
                "/toggle",
                {
                    method:
                        "POST"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed."
            );
        }

        await loadScripts();

    } catch (error) {

        alert(error.message);
    }
}

/* ==========================================
   DELETE
========================================== */

async function deleteScript(id) {

    const confirmed =
        confirm(
            "Delete this script?\\n\\nThe loader will no longer work."
        );

    if (!confirmed)
        return;

    try {

        const response =
            await fetch(
                "/api/scripts/" +
                encodeURIComponent(id),
                {
                    method:
                        "DELETE"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Delete failed."
            );
        }

        await loadScripts();

    } catch (error) {

        alert(error.message);
    }
}

/* ==========================================
   CLIENT HTML ESCAPER
========================================== */

function escapeHtmlClient(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ==========================================
   COPY LOADER
========================================== */

function copyLoader() {

    const loader =
        ${JSON.stringify(loader)};

    navigator.clipboard
        .writeText(loader)
        .then(() => {

            document.querySelector(
                ".copy-btn"
            ).textContent =
                "Copied!";

            setTimeout(() => {

                document.querySelector(
                    ".copy-btn"
                ).textContent =
                    "Copy loader";

            }, 1500);

        });
}

</script>

</body>

</html>
`;
}

/* =================================================
   HOME
================================================= */

app.get("/", (req, res) => {

    res
        .status(200)
        .type("html")
        .send(HOME_PAGE);
});

/* =================================================
   PROTECT API
================================================= */

app.post(
    "/api/protect",
    (req, res) => {

        const source =
            req.body?.source;

        const name =
            req.body?.name;

        if (
            typeof source !==
            "string"
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Invalid source."
                });
        }

        if (!source.trim()) {

            return res
                .status(400)
                .json({
                    error:
                        "Source is empty."
                });
        }

        if (
            typeof name !==
            "string" ||
            !name.trim()
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Script name is required."
                });
        }

        try {

            const protectedSource =
                protectLuau(source);

            const id =
                generateId();

            loaders.set(
                id,
                {
                    id:
                        id,

                    name:
                        name.trim(),

                    source:
                        protectedSource,

                    enabled:
                        true,

                    createdAt:
                        Date.now()
                }
            );

            const baseUrl =
                `${req.protocol}://${req.get("host")}`;

            const url =
                `${baseUrl}/files/loaders/${id}.lua`;

            const loadstring =
                `loadstring(game:HttpGet("${url}"))()`;

            res.json({

                success:
                    true,

                id:
                    id,

                name:
                    name.trim(),

                enabled:
                    true,

                url:
                    url,

                loadstring:
                    loadstring
            });

        } catch (error) {

            console.error(
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Protection failed."
                });
        }
    }
);

/* =================================================
   SCRIPT LIST
================================================= */

app.get(
    "/api/scripts",
    (req, res) => {

        const scripts =
            Array.from(
                loaders.values()
            )
            .map(item => ({
                id:
                    item.id,

                name:
                    item.name,

                enabled:
                    item.enabled,

                createdAt:
                    item.createdAt
            }));

        res.json(
            scripts
        );
    }
);

/* =================================================
   ENABLE / DISABLE SCRIPT
================================================= */

app.post(
    "/api/scripts/:id/toggle",
    (req, res) => {

        const id =
            req.params.id;

        const item =
            loaders.get(id);

        if (!item) {

            return res
                .status(404)
                .json({
                    error:
                        "Script not found."
                });
        }

        item.enabled =
            !item.enabled;

        loaders.set(
            id,
            item
        );

        res.json({

            success:
                true,

            id:
                id,

            enabled:
                item.enabled
        });
    }
);

/* =================================================
   DELETE SCRIPT
================================================= */

app.delete(
    "/api/scripts/:id",
    (req, res) => {

        const id =
            req.params.id;

        if (!loaders.has(id)) {

            return res
                .status(404)
                .json({
                    error:
                        "Script not found."
                });
        }

        loaders.delete(id);

        res.json({

            success:
                true,

            message:
                "Script deleted."
        });
    }
);

/* =================================================
   LOADER
================================================= */

app.get(
    "/files/loaders/:id.lua",
    (req, res) => {

        const id =
            req.params.id;

        const item =
            loaders.get(id);

        if (!item) {

            return res
                .status(404)
                .type("text")
                .send(
                    "Loader not found."
                );
        }

        /*
         * Disabled
         */

        if (!item.enabled) {

            return res
                .status(403)
                .type("text")
                .send(
                    "-- KXLuaprotect\n" +
                    "-- This script is currently disabled."
                );
        }

        const userAgent =
            String(
                req.headers[
                    "user-agent"
                ] || ""
            ).toLowerCase();

        const accept =
            String(
                req.headers[
                    "accept"
                ] || ""
            ).toLowerCase();

        /*
         * Detect normal browsers
         */

        const isBrowser =
            (
                userAgent.includes(
                    "mozilla"
                ) ||
                userAgent.includes(
                    "chrome"
                ) ||
                userAgent.includes(
                    "safari"
                ) ||
                userAgent.includes(
                    "firefox"
                ) ||
                userAgent.includes(
                    "edg/"
                ) ||
                userAgent.includes(
                    "opera"
                )
            ) &&
            (
                accept.includes(
                    "text/html"
                ) ||
                accept.includes(
                    "application/xhtml+xml"
                )
            );

        /*
         * Browser:
         * Never send source.
         */

        if (isBrowser) {

            const baseUrl =
                `${req.protocol}://${req.get("host")}`;

            return res
                .status(403)
                .type("html")
                .send(
                    browserPage(
                        id,
                        baseUrl
                    )
                );
        }

        /*
         * Runtime:
         * Send protected source.
         */

        res
            .status(200)
            .type("text/plain")
            .set(
                "Cache-Control",
                "no-store, no-cache, must-revalidate"
            )
            .set(
                "Pragma",
                "no-cache"
            )
            .send(
                item.source
            );
    }
);

/* =================================================
   404
================================================= */

app.use(
    (req, res) => {

        res
            .status(404)
            .type("html")
            .send(`
<!DOCTYPE html>

<html>

<head>

<title>
KXLuaprotect - 404
</title>

<style>

body {

    margin:0;

    min-height:100vh;

    background:#07070a;

    color:white;

    display:flex;

    align-items:center;

    justify-content:center;

    font-family:Arial;
}

div {
    text-align:center;
}

h1 {
    color:#9565ff;
}

p {
    color:#77727f;
}

</style>

</head>

<body>

<div>

<h1>
404
</h1>

<p>
KXLuaprotect — Page not found.
</p>

</div>

</body>

</html>
        `);
    }
);

/* =================================================
   START
================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `KXLuaprotect running on port ${PORT}`
        );

    }
);
