const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

// Penyimpanan sementara.
// Catatan: data dapat hilang ketika service Railway direstart/redeploy.
// Untuk penyimpanan permanen, gunakan database/object storage.
const loaders = new Map();

function generateId() {
    return crypto.randomBytes(16).toString("hex");
}

function protectLuau(source) {
    let code = String(source);

    // Hapus block comments.
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");

    // Hapus komentar satu baris di luar string.
    code = code.replace(
        /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(--[^\r\n]*)/g,
        (match, stringPart) => stringPart || ""
    );

    // Rapikan whitespace.
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/[ \t]+/g, " ");
    code = code.replace(/[ \t]*\n[ \t]*/g, "\n");

    // Hapus baris kosong.
    code = code
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n");

    return `-- Protected by KXLuaprotect

${code}
`;
}

const HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1.0">

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
            #24143b,
            #0b0a0f 45%,
            #050507
        );
    color: white;
    font-family: Arial, sans-serif;
}

.container {
    width: min(1100px, 94%);
    margin: auto;
    padding: 35px 0;
}

.header {
    text-align: center;
    margin-bottom: 28px;
}

.logo {
    font-size: 42px;
    font-weight: 900;
}

.logo span {
    color: #9565ff;
}

.subtitle {
    margin-top: 8px;
    color: #77727f;
}

.card {
    background: rgba(15,14,20,.95);
    border: 1px solid #2b2535;
    border-radius: 18px;
    padding: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
}

.title {
    color: #c8c2d0;
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 10px;
}

textarea {
    width: 100%;
    height: 380px;
    resize: vertical;
    background: #08080c;
    color: #e8e4ed;
    border: 1px solid #30293a;
    border-radius: 12px;
    padding: 15px;
    outline: none;
    font-family: Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
}

textarea:focus {
    border-color: #8658ff;
}

.buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 15px;
}

button {
    border: 0;
    border-radius: 10px;
    padding: 12px 18px;
    color: white;
    font-weight: bold;
    cursor: pointer;
}

.protect {
    background: #8051f4;
    flex: 1;
}

.secondary {
    background: #211d27;
}

button:hover {
    filter: brightness(1.15);
}

.result {
    display: none;
    margin-top: 18px;
}

.resultBox {
    background: #08080c;
    border: 1px solid #30293a;
    border-radius: 12px;
    padding: 14px;
    word-break: break-all;
}

.resultLabel {
    color: #88818f;
    font-size: 12px;
    margin-bottom: 8px;
}

#loaderUrl {
    color: #b293ff;
    font-family: Consolas, monospace;
    font-size: 13px;
}

#loadstring {
    width: 100%;
    margin-top: 10px;
    background: #0c0b10;
    color: #ddd;
    border: 1px solid #30293a;
    padding: 12px;
    border-radius: 10px;
    font-family: Consolas, monospace;
    word-break: break-all;
}

.status {
    text-align: center;
    color: #77717e;
    font-size: 12px;
    margin-top: 15px;
}

.footer {
    text-align: center;
    color: #514c58;
    font-size: 12px;
    margin-top: 22px;
}

@media(max-width:600px) {

    .logo {
        font-size: 34px;
    }

    textarea {
        height: 300px;
    }

    button {
        width: 100%;
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
            Luau Protection & Loader Hosting
        </div>

    </div>

    <div class="card">

        <div class="title">
            LUAU SOURCE
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
                🛡 Protect & Generate Loader
            </button>

            <button
                class="secondary"
                onclick="clearAll()"
            >
                Clear
            </button>

        </div>

        <div
            class="result"
            id="result"
        >

            <div class="resultLabel">
                LOADER URL
            </div>

            <div
                class="resultBox"
                id="loaderUrl"
            ></div>

            <div class="resultLabel"
                style="margin-top:16px">
                LOADSTRING
            </div>

            <textarea
                id="loadstring"
                readonly
            ></textarea>

            <div class="buttons">

                <button
                    class="secondary"
                    onclick="copyUrl()"
                >
                    📋 Copy URL
                </button>

                <button
                    class="secondary"
                    onclick="copyLoadstring()"
                >
                    📋 Copy Loadstring
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
        document.getElementById("source").value;

    const status =
        document.getElementById("status");

    if (!source.trim()) {
        status.textContent =
            "Paste Luau source first.";
        return;
    }

    status.textContent =
        "Protecting and generating loader...";

    try {

        const response =
            await fetch("/api/protect", {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    source: source
                })

            });

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed."
            );
        }

        currentUrl = data.url;
        currentLoadstring = data.loadstring;

        document.getElementById(
            "loaderUrl"
        ).textContent = currentUrl;

        document.getElementById(
            "loadstring"
        ).value = currentLoadstring;

        document.getElementById(
            "result"
        ).style.display = "block";

        status.textContent =
            "Loader generated successfully.";

    } catch (error) {

        status.textContent =
            error.message;

    }
}

async function copyUrl() {

    if (!currentUrl) return;

    await navigator.clipboard
        .writeText(currentUrl);

    document.getElementById(
        "status"
    ).textContent = "URL copied.";
}

async function copyLoadstring() {

    if (!currentLoadstring) return;

    await navigator.clipboard
        .writeText(currentLoadstring);

    document.getElementById(
        "status"
    ).textContent =
        "Loadstring copied.";
}

function clearAll() {

    document.getElementById(
        "source"
    ).value = "";

    document.getElementById(
        "result"
    ).style.display = "none";

    document.getElementById(
        "status"
    ).textContent = "Ready.";

    currentUrl = "";
    currentLoadstring = "";
}

</script>

</body>
</html>
`;

app.get("/", (req, res) => {
    res.type("html").send(HTML);
});

app.post("/api/protect", (req, res) => {

    const source = req.body?.source;

    if (typeof source !== "string") {
        return res.status(400).json({
            error: "Invalid source."
        });
    }

    if (!source.trim()) {
        return res.status(400).json({
            error: "Source is empty."
        });
    }

    try {

        const protectedCode =
            protectLuau(source);

        const id = generateId();

        loaders.set(id, protectedCode);

        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const url =
            `${baseUrl}/files/loaders/${id}.lua`;

        const loadstring =
            `loadstring(game:HttpGet("${url}"))()`;

        res.json({
            success: true,
            id: id,
            url: url,
            loadstring: loadstring
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Protection failed."
        });

    }
});

app.get(
    "/files/loaders/:id.lua",
    (req, res) => {

        const id = req.params.id;
        const source = loaders.get(id);

        if (!source) {
            return res.status(404).send(
                "-- KXLuaprotect\n-- Loader not found."
            );
        }

        res.type("text/plain").send(source);
    }
);

app.get("/api/loader/:id", (req, res) => {

    const source =
        loaders.get(req.params.id);

    if (!source) {
        return res.status(404).json({
            error: "Loader not found."
        });
    }

    res.json({
        id: req.params.id,
        source: source
    });
});

app.listen(PORT, () => {

    console.log(
        `KXLuaprotect running on port ${PORT}`
    );

});
