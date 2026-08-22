const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

// Temporary server-side storage.
// Do not expose this directly through an API.
const loaders = new Map();

function makeId() {
    return crypto.randomBytes(18).toString("hex");
}

function transformLuau(source) {
    let code = String(source);

    // Remove block comments.
    code = code.replace(
        /--\[\[[\s\S]*?\]\]/g,
        ""
    );

    // Remove single-line comments while preserving strings.
    code = code.replace(
        /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(--[^\r\n]*)/g,
        (match, stringValue) => stringValue || ""
    );

    // Normalize whitespace.
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/[ \t]+/g, " ");
    code = code.replace(
        /[ \t]*\n[ \t]*/g,
        "\n"
    );

    // Remove unnecessary blank lines.
    code = code
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n");

    return `-- KXLuaprotect
-- Protected source

${code}
`;
}

const HTML = `
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
            #24153d,
            #0b0a0f 45%,
            #050507
        );
    color: white;
    font-family: Arial, sans-serif;
}

.container {
    width: min(1050px, 94%);
    margin: auto;
    padding: 40px 0;
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
    color: #9665ff;
}

.subtitle {
    color: #77727e;
    margin-top: 8px;
}

.card {
    background: rgba(15,14,20,.96);
    border: 1px solid #292431;
    border-radius: 18px;
    padding: 18px;
}

textarea {
    width: 100%;
    height: 400px;
    resize: vertical;
    background: #08080c;
    color: #e7e3eb;
    border: 1px solid #302a38;
    border-radius: 12px;
    padding: 15px;
    outline: none;
    font-family: Consolas, monospace;
    font-size: 13px;
}

textarea:focus {
    border-color: #895cff;
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
    font-weight: bold;
    cursor: pointer;
}

.protect {
    background: #8051f5;
    flex: 1;
}

.clear {
    background: #25202b;
}

.result {
    display: none;
    margin-top: 20px;
}

.resultBox {
    background: #08080c;
    border: 1px solid #302a38;
    border-radius: 12px;
    padding: 14px;
    font-family: Consolas, monospace;
    font-size: 13px;
    color: #b89dff;
    word-break: break-all;
}

.copy {
    margin-top: 10px;
    background: #25202b;
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
    margin-top: 20px;
}

@media(max-width:600px) {

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
class="clear"
onclick="clearAll()"
>
Clear
</button>

</div>

<div
class="result"
id="result"
>

<div style="color:#888;margin-bottom:8px">
LOADSTRING
</div>

<div
class="resultBox"
id="loadstring"
></div>

<button
class="copy"
onclick="copyLoadstring()"
>
📋 Copy Loadstring
</button>

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

                    body: JSON.stringify({
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
    ).style.display =
        "none";

    document.getElementById(
        "status"
    ).textContent =
        "Ready.";

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
            error: "Invalid Luau source."
        });
    }

    if (!source.trim()) {

        return res.status(400).json({
            error: "Source is empty."
        });
    }

    try {

        const protectedSource =
            transformLuau(source);

        const id = makeId();

        loaders.set(
            id,
            protectedSource
        );

        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const url =
            `${baseUrl}/files/loaders/${id}.lua`;

        const loadstring =
            `loadstring(game:HttpGet("${url}"))()`;

        res.json({
            success: true,
            loadstring
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error:
                "Unable to protect source."
        });
    }
});

// Loader endpoint.
// It returns only the transformed source.
// It does NOT return the original source.
app.get(
    "/files/loaders/:id.lua",
    (req, res) => {

        const source =
            loaders.get(req.params.id);

        if (!source) {

            return res.status(404).send(
                "Loader not found."
            );
        }

        res
            .type("text/plain")
            .send(source);
    }
);

// No endpoint exists for retrieving
// the original source.

app.listen(PORT, () => {

    console.log(
        "KXLuaprotect running on port " +
        PORT
    );

});
