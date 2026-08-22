const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/*
    KXLuaprotect
    -------------------------
    - Source asli tidak disediakan
      melalui endpoint publik.
    - Setiap protect menghasilkan ID acak.
    - Loader hanya berisi hasil transformasi.
    - Loader dapat dicabut dengan endpoint
      admin lokal menggunakan ADMIN_KEY.
*/

const loaders = new Map();

const ADMIN_KEY =
    process.env.ADMIN_KEY || "change-this-key";

/* =========================
   ID GENERATOR
========================= */

function createId() {
    return crypto
        .randomBytes(24)
        .toString("hex");
}

/* =========================
   STRING-SAFE TRANSFORMER
========================= */

function transformLuau(source) {
    let code = String(source);

    /*
       Remove block comments.
    */
    code = code.replace(
        /--\[\[[\s\S]*?\]\]/g,
        ""
    );

    /*
       Remove -- comments without
       touching quoted strings.
    */
    let output = "";
    let i = 0;

    while (i < code.length) {

        const c = code[i];

        /*
           Double quoted string
        */
        if (c === '"') {

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
           Single quoted string
        */
        if (c === "'") {

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
           Single-line comment
        */
        if (c === "-" && code[i + 1] === "-") {

            while (
                i < code.length &&
                code[i] !== "\n"
            ) {
                i++;
            }

            output += "\n";
            continue;
        }

        output += c;
        i++;
    }

    code = output;

    /*
       Normalize line endings.
    */
    code = code.replace(/\r\n/g, "\n");

    /*
       Remove trailing spaces.
    */
    code = code
        .split("\n")
        .map(line => line.trimEnd())
        .join("\n");

    /*
       Collapse excessive blank lines.
    */
    code = code.replace(
        /\n{3,}/g,
        "\n\n"
    );

    /*
       Add KXLuaprotect marker.
    */
    return (
        "-- KXLuaprotect\n" +
        "-- Protected loader\n\n" +
        code.trim() +
        "\n"
    );
}

/* =========================
   HTML
========================= */

const HTML = `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1"
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
            #27153f 0%,
            #0c0a10 45%,
            #050507 100%
        );

    color: white;

    font-family:
        Arial,
        sans-serif;
}

.container {
    width: min(1100px, 94%);
    margin: auto;
    padding: 40px 0;
}

.header {
    text-align: center;
    margin-bottom: 30px;
}

.logo {
    font-size: 43px;
    font-weight: 900;
    letter-spacing: -1px;
}

.logo span {
    color: #9564ff;
}

.subtitle {
    color: #77727f;
    margin-top: 8px;
    font-size: 14px;
}

.card {
    background: rgba(14, 13, 19, .96);

    border:
        1px solid #2b2534;

    border-radius: 18px;

    padding: 18px;

    box-shadow:
        0 20px 70px
        rgba(0,0,0,.4);
}

.label {
    color: #aaa4b1;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 10px;
}

textarea {
    width: 100%;
    height: 390px;

    resize: vertical;

    background: #08080c;
    color: #e9e5ed;

    border:
        1px solid #302a39;

    border-radius: 12px;

    padding: 15px;

    outline: none;

    font-family:
        Consolas,
        monospace;

    font-size: 13px;
    line-height: 1.55;
}

textarea:focus {
    border-color: #8757ff;
}

.buttons {
    display: flex;
    gap: 10px;

    margin-top: 15px;
}

button {
    border: 0;
    border-radius: 10px;

    padding: 12px 18px;

    color: white;

    font-weight: 700;

    cursor: pointer;
}

.protect {
    flex: 1;
    background: #8051f5;
}

.secondary {
    background: #25202c;
}

button:hover {
    filter: brightness(1.12);
}

.result {
    display: none;
    margin-top: 22px;
}

.result-box {
    background: #08080c;

    border:
        1px solid #302a39;

    border-radius: 12px;

    padding: 14px;

    color: #b795ff;

    font-family:
        Consolas,
        monospace;

    font-size: 13px;

    word-break: break-all;
}

.status {
    text-align: center;

    color: #706a78;

    font-size: 12px;

    margin-top: 15px;
}

.footer {
    text-align: center;

    color: #514c58;

    font-size: 12px;

    margin-top: 22px;
}

@media(max-width:650px) {

    .logo {
        font-size: 34px;
    }

    textarea {
        height: 300px;
    }

    .buttons {
        flex-direction: column;
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
Luau Protection Service
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
class="result-box"
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

let loaderUrl = "";
let loaderString = "";

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
            "Paste Luau source first.";

        return;
    }

    status.textContent =
        "Protecting...";

    try {

        const response =
            await fetch(
                "/api/protect",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            source: source
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

        loaderUrl = data.url;
        loaderString = data.loadstring;

        document.getElementById(
            "loadstring"
        ).textContent =
            loaderString;

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

    if (!loaderString)
        return;

    await navigator.clipboard
        .writeText(loaderString);

    document.getElementById(
        "status"
    ).textContent =
        "Loadstring copied.";
}

async function copyUrl() {

    if (!loaderUrl)
        return;

    await navigator.clipboard
        .writeText(loaderUrl);

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

    loaderUrl = "";
    loaderString = "";
}

</script>

</body>

</html>
`;

/* =========================
   WEB PAGE
========================= */

app.get("/", (req, res) => {

    res
        .type("html")
        .send(HTML);

});

/* =========================
   PROTECT
========================= */

app.post(
    "/api/protect",
    (req, res) => {

        const source =
            req.body?.source;

        if (
            typeof source !==
            "string"
        ) {

            return res.status(400)
                .json({
                    error:
                        "Invalid source."
                });
        }

        if (!source.trim()) {

            return res.status(400)
                .json({
                    error:
                        "Source is empty."
                });
        }

        try {

            /*
               Original source is transformed
               immediately and never exposed
               through a public endpoint.
            */

            const protectedSource =
                transformLuau(source);

            const id =
                createId();

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
                success: true,
                url: url,
                loadstring: loadstring
            });

        } catch (error) {

            console.error(error);

            res.status(500)
                .json({
                    error:
                        "Protection failed."
                });
        }
    }
);

/* =========================
   LOADER
========================= */

app.get(
    "/files/loaders/:id.lua",
    (req, res) => {

        const item =
            loaders.get(
                req.params.id
            );

        if (!item) {

            return res
                .status(404)
                .send(
                    "Loader not found."
                );
        }

        /*
           Only transformed source is returned.
           The original source is not stored
           separately in this application.
        */

        res
            .type("text/plain")
            .set(
                "Cache-Control",
                "no-store"
            )
            .send(item.source);
    }
);

/* =========================
   REVOKE LOADER
========================= */

app.delete(
    "/api/loaders/:id",
    (req, res) => {

        const key =
            req.headers[
                "x-admin-key"
            ];

        if (
            key !== ADMIN_KEY
        ) {

            return res
                .status(403)
                .json({
                    error:
                        "Unauthorized."
                });
        }

        const deleted =
            loaders.delete(
                req.params.id
            );

        res.json({
            success: deleted
        });
    }
);

/* =========================
   START
========================= */

app.listen(
    PORT,
    () => {

        console.log(
            "KXLuaprotect running on port " +
            PORT
        );

    }
);
