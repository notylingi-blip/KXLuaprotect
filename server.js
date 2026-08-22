const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/*
==================================================
 KXLuaprotect
==================================================

 Browser:
   /files/loaders/ID.lua
          ↓
   Security page
   "This script can't be viewed in a browser"

 Runtime request:
   /files/loaders/ID.lua
          ↓
   Protected Luau

==================================================
*/

const loaders = new Map();

/* =================================================
   ID GENERATOR
================================================= */

function generateId() {
    return crypto
        .randomBytes(18)
        .toString("hex");
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
       Add KXLuaprotect marker
    */
    return (
        "-- KXLuaprotect Protected\n\n" +
        code.trim() +
        "\n"
    );
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

    color:
        #9565ff;
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

    const status =
        document.getElementById(
            "status"
        );

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
    box-sizing: border-box;
}

body {

    margin: 0;

    min-height: 100vh;

    background:
        radial-gradient(
            circle at top,
            #082b4b 0%,
            #031525 55%,
            #020e19 100%
        );

    color: white;

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

button {

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

button:hover {

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

</style>

</head>

<body>

<div class="card">

<div class="icon">
🔒
</div>

<h1>
This script can't be viewed in a browser
</h1>

<p>
For security, the source is only delivered
to Roblox at runtime. Use the loader below
in your executor or script.
</p>

<div class="loader">

<div class="loader-title">
LOADER
</div>

<div class="loader-code">
${escapeHtml(loader)}
</div>

</div>

<button onclick="copyLoader()">
Copy loader
</button>

<div class="note">
Paste this into your executor — it will
fetch and run the script in-game.
</div>

<div class="brand">
KXLuaprotect
</div>

</div>

<script>

function copyLoader() {

    const loader =
        ${JSON.stringify(loader)};

    navigator.clipboard
        .writeText(loader)
        .then(() => {

            document.querySelector(
                "button"
            ).textContent =
                "Copied!";

            setTimeout(() => {

                document.querySelector(
                    "button"
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

        try {

            /*
             * Source langsung diproses.
             * Yang disimpan hanya hasil protect.
             */

            const protectedSource =
                protectLuau(source);

            const id =
                generateId();

            loaders.set(
                id,
                {
                    source:
                        protectedSource,

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
         * Detect normal browsers.
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
         * NEVER send source.
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
         * Runtime/non-browser:
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
<title>KXLuaprotect - 404</title>
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
<h1>404</h1>
<p>KXLuaprotect — Page not found.</p>
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
