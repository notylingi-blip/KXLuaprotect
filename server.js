const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

function protectLuau(code) {
    // Transformasi sederhana untuk demo.
    // Untuk protector Luau sungguhan, bagian ini bisa diganti
    // dengan engine transformasi/obfuscation milikmu sendiri.
    const encoded = Buffer.from(code, "utf8").toString("base64");

    return `-- KXLuaprotect
-- Protected Luau

local encoded = "${encoded}"

local chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function decodeBase64(data)
    data = data:gsub("[^" .. chars .. "=]", "")

    return (data:gsub(".", function(x)
        if x == "=" then
            return ""
        end

        local r, f = "", chars:find(x) - 1

        for i = 6, 1, -1 do
            r = r .. (f % 2^i - f % 2^(i-1) > 0 and "1" or "0")
        end

        return r
    end):gsub("%d%d%d?%d?%d?%d?%d?%d?", function(x)
        if #x ~= 8 then
            return ""
        end

        local c = 0

        for i = 1, 8 do
            c = c + (x:sub(i,i) == "1" and 2^(8-i) or 0)
        end

        return string.char(c)
    end))
end

local protectedSource = decodeBase64(encoded)

return protectedSource
`;
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>KXLuaprotect</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    background:
        radial-gradient(circle at top, #21133d 0%, #0b0b10 45%, #050507 100%);
    color: #ffffff;
    font-family: Arial, sans-serif;
}

.container {
    width: min(1100px, 92%);
    margin: auto;
    padding: 45px 0;
}

.header {
    text-align: center;
    margin-bottom: 30px;
}

.logo {
    font-size: 38px;
    font-weight: 800;
    letter-spacing: 1px;
}

.logo span {
    color: #9b6cff;
}

.subtitle {
    color: #888;
    margin-top: 8px;
}

.panel {
    background: rgba(18,18,24,.92);
    border: 1px solid #292333;
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 15px 50px rgba(0,0,0,.35);
}

.label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    color: #bbb;
    font-size: 14px;
}

textarea {
    width: 100%;
    min-height: 300px;
    resize: vertical;
    background: #09090d;
    color: #e8e8e8;
    border: 1px solid #30283d;
    border-radius: 12px;
    padding: 15px;
    outline: none;
    font-family: Consolas, monospace;
    font-size: 14px;
}

textarea:focus {
    border-color: #8d5cff;
}

.buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 15px 0 25px;
}

button {
    border: 0;
    border-radius: 10px;
    padding: 12px 20px;
    cursor: pointer;
    font-weight: 700;
    color: white;
}

.protect {
    background: #7d4cff;
}

.copy {
    background: #292431;
}

.download {
    background: #292431;
}

.clear {
    background: #351f27;
}

button:hover {
    opacity: .85;
}

.status {
    color: #777;
    font-size: 13px;
    margin-top: 10px;
}

.footer {
    text-align: center;
    color: #555;
    margin-top: 25px;
    font-size: 13px;
}

@media(max-width:600px) {

    .container {
        padding: 25px 0;
    }

    .logo {
        font-size: 30px;
    }

    textarea {
        min-height: 240px;
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
            Luau Code Protection Tool
        </div>
    </div>

    <div class="panel">

        <div class="label">
            <span>INPUT LUAU</span>
            <span id="inputCount">0 characters</span>
        </div>

        <textarea
            id="input"
            placeholder="Paste your Luau code here..."
        ></textarea>

        <div class="buttons">

            <button class="protect" onclick="protectCode()">
                🛡️ Protect
            </button>

            <button class="copy" onclick="copyOutput()">
                📋 Copy
            </button>

            <button class="download" onclick="downloadOutput()">
                💾 Download
            </button>

            <button class="clear" onclick="clearAll()">
                🗑️ Clear
            </button>

        </div>

        <div class="label">
            <span>PROTECTED OUTPUT</span>
            <span id="outputCount">0 characters</span>
        </div>

        <textarea
            id="output"
            readonly
            placeholder="Protected code will appear here..."
        ></textarea>

        <div class="status" id="status">
            Ready.
        </div>

    </div>

    <div class="footer">
        KXLuaprotect • Powered by Railway
    </div>

</div>

<script>

const input = document.getElementById("input");
const output = document.getElementById("output");
const inputCount = document.getElementById("inputCount");
const outputCount = document.getElementById("outputCount");
const statusText = document.getElementById("status");

input.addEventListener("input", function() {
    inputCount.textContent =
        input.value.length + " characters";
});

output.addEventListener("input", function() {
    outputCount.textContent =
        output.value.length + " characters";
});

async function protectCode() {

    const code = input.value;

    if (!code.trim()) {
        statusText.textContent =
            "Please enter Luau code first.";
        return;
    }

    statusText.textContent =
        "Protecting...";

    try {

        const response = await fetch("/protect", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                code: code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Protection failed."
            );
        }

        output.value = data.protected;

        outputCount.textContent =
            output.value.length + " characters";

        statusText.textContent =
            "Protection completed.";

    } catch (error) {

        statusText.textContent =
            "Error: " + error.message;

    }
}

async function copyOutput() {

    if (!output.value) {
        statusText.textContent =
            "Nothing to copy.";
        return;
    }

    await navigator.clipboard.writeText(
        output.value
    );

    statusText.textContent =
        "Output copied.";
}

function downloadOutput() {

    if (!output.value) {
        statusText.textContent =
            "Nothing to download.";
        return;
    }

    const blob = new Blob(
        [output.value],
        { type: "text/plain" }
    );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;
    a.download = "KXLuaprotect.lua";

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

    statusText.textContent =
        "Download started.";
}

function clearAll() {

    input.value = "";
    output.value = "";

    inputCount.textContent =
        "0 characters";

    outputCount.textContent =
        "0 characters";

    statusText.textContent =
        "Ready.";
}

</script>

</body>
</html>
`;

app.get("/", (req, res) => {
    res.send(html);
});

app.post("/protect", (req, res) => {

    const code = req.body?.code;

    if (typeof code !== "string") {
        return res.status(400).json({
            error: "Invalid code."
        });
    }

    if (!code.trim()) {
        return res.status(400).json({
            error: "Code is empty."
        });
    }

    try {

        const protectedCode =
            protectLuau(code);

        res.json({
            success: true,
            protected: protectedCode
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Protection failed."
        });

    }
});

app.listen(PORT, () => {
    console.log(
        "KXLuaprotect running on port " + PORT
    );
});
