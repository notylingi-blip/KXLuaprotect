const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

function protectLuau(source) {
    let code = String(source);

    // Remove block comments
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");

    // Remove single-line comments while preserving strings
    code = code.replace(
        /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(--[^\r\n]*)/g,
        (match, stringPart) => stringPart || ""
    );

    // Normalize line endings
    code = code.replace(/\r\n/g, "\n");

    // Remove unnecessary whitespace around common punctuation
    code = code.replace(/[ \t]+/g, " ");
    code = code.replace(/[ \t]*\n[ \t]*/g, "\n");

    code = code.replace(/\s*([(),{}[\]])\s*/g, "$1");
    code = code.replace(/\s*([=+\-*\/%^<>])\s*/g, "$1");

    // Keep strings intact while transforming simple local names.
    const reserved = new Set([
        "and","break","do","else","elseif","end","false","for",
        "function","if","in","local","nil","not","or","repeat",
        "return","then","true","until","while","continue",
        "type","export","typeof","self"
    ]);

    const names = [];
    const seen = new Set();

    const localPattern =
        /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;

    let match;

    while ((match = localPattern.exec(code)) !== null) {
        const name = match[1];

        if (
            !reserved.has(name) &&
            !seen.has(name) &&
            name.length > 2
        ) {
            seen.add(name);
            names.push(name);
        }
    }

    // Generate short names.
    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    const replacements = new Map();

    names.forEach((name, index) => {
        let n = index;
        let result = "";

        do {
            result =
                alphabet[n % alphabet.length] + result;
            n = Math.floor(n / alphabet.length) - 1;
        } while (n >= 0);

        if (result !== name) {
            replacements.set(name, "__kx_" + result);
        }
    });

    // Replace identifiers outside strings.
    for (const [oldName, newName] of replacements) {
        const parts = [];
        let i = 0;

        while (i < code.length) {
            const char = code[i];

            if (char === '"' || char === "'") {
                const quote = char;
                let j = i + 1;

                while (j < code.length) {
                    if (code[j] === "\\") {
                        j += 2;
                        continue;
                    }

                    if (code[j] === quote) {
                        j++;
                        break;
                    }

                    j++;
                }

                parts.push(code.slice(i, j));
                i = j;
                continue;
            }

            const identifier =
                code.slice(i).match(
                    /^[A-Za-z_][A-Za-z0-9_]*/
                );

            if (identifier) {
                const word = identifier[0];

                parts.push(
                    word === oldName ? newName : word
                );

                i += word.length;
            } else {
                parts.push(char);
                i++;
            }
        }

        code = parts.join("");
    }

    // Clean empty lines.
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
    content="width=device-width, initial-scale=1.0"
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
            circle at 50% 0%,
            #26163d 0%,
            #0d0b12 42%,
            #050507 100%
        );
    color: #fff;
    font-family:
        Inter,
        Arial,
        sans-serif;
}

.container {
    width: min(1150px, 94%);
    margin: auto;
    padding: 35px 0 45px;
}

.header {
    text-align: center;
    margin-bottom: 28px;
}

.logo {
    font-size: 42px;
    font-weight: 900;
    letter-spacing: -1px;
}

.logo span {
    color: #9a6cff;
}

.subtitle {
    margin-top: 8px;
    color: #85818d;
    font-size: 14px;
}

.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.card {
    background: rgba(14, 13, 19, .94);
    border: 1px solid #29232f;
    border-radius: 18px;
    padding: 16px;
    box-shadow:
        0 20px 60px rgba(0,0,0,.35);
}

.card-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    color: #c8c3d0;
    font-size: 13px;
    font-weight: 700;
}

textarea {
    width: 100%;
    height: 430px;
    resize: vertical;
    outline: none;
    border: 1px solid #302a38;
    border-radius: 12px;
    background: #08080c;
    color: #e8e3ee;
    padding: 15px;
    font-family: Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
}

textarea:focus {
    border-color: #8757ff;
    box-shadow:
        0 0 0 2px rgba(135,87,255,.08);
}

.actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
}

button {
    border: 0;
    border-radius: 10px;
    padding: 12px 17px;
    color: white;
    cursor: pointer;
    font-weight: 800;
}

.protect {
    background: #8152f5;
    flex: 1;
}

.secondary {
    background: #211d27;
}

.danger {
    background: #321d27;
}

button:hover {
    filter: brightness(1.12);
}

.status {
    text-align: center;
    margin-top: 15px;
    color: #77717f;
    font-size: 12px;
}

.footer {
    text-align: center;
    color: #55505c;
    font-size: 12px;
    margin-top: 22px;
}

@media (max-width: 800px) {
    .grid {
        grid-template-columns: 1fr;
    }

    textarea {
        height: 300px;
    }

    .logo {
        font-size: 34px;
    }
}

@media (max-width: 500px) {
    .container {
        padding-top: 25px;
    }

    .actions button {
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
            Modern Luau Source Protection
        </div>
    </div>

    <div class="grid">

        <div class="card">

            <div class="card-title">
                <span>INPUT</span>
                <span id="inputCount">
                    0 characters
                </span>
            </div>

            <textarea
                id="input"
                spellcheck="false"
                placeholder="Paste your Luau code here..."
            ></textarea>

        </div>

        <div class="card">

            <div class="card-title">
                <span>PROTECTED OUTPUT</span>
                <span id="outputCount">
                    0 characters
                </span>
            </div>

            <textarea
                id="output"
                spellcheck="false"
                readonly
                placeholder="Your protected code will appear here..."
            ></textarea>

        </div>

    </div>

    <div class="actions">

        <button
            class="protect"
            onclick="protectCode()"
        >
            🛡 Protect
        </button>

        <button
            class="secondary"
            onclick="copyOutput()"
        >
            📋 Copy
        </button>

        <button
            class="secondary"
            onclick="downloadOutput()"
        >
            ↓ Download
        </button>

        <button
            class="danger"
            onclick="clearAll()"
        >
            Clear
        </button>

    </div>

    <div
        class="status"
        id="status"
    >
        Ready
    </div>

    <div class="footer">
        KXLuaprotect
    </div>

</div>

<script>
const input =
    document.getElementById("input");

const output =
    document.getElementById("output");

const inputCount =
    document.getElementById("inputCount");

const outputCount =
    document.getElementById("outputCount");

const status =
    document.getElementById("status");

input.addEventListener("input", () => {
    inputCount.textContent =
        input.value.length + " characters";
});

async function protectCode() {

    const code = input.value;

    if (!code.trim()) {
        status.textContent =
            "Paste Luau code first.";
        return;
    }

    status.textContent =
        "Protecting...";

    try {

        const response =
            await fetch("/protect", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    code
                })
            });

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Protection failed."
            );
        }

        output.value =
            data.protected;

        outputCount.textContent =
            output.value.length +
            " characters";

        status.textContent =
            "Protection completed.";

    } catch (error) {

        status.textContent =
            error.message;

    }
}

async function copyOutput() {

    if (!output.value) {
        status.textContent =
            "Nothing to copy.";
        return;
    }

    await navigator.clipboard
        .writeText(output.value);

    status.textContent =
        "Copied.";
}

function downloadOutput() {

    if (!output.value) {
        status.textContent =
            "Nothing to download.";
        return;
    }

    const blob =
        new Blob(
            [output.value],
            { type: "text/plain" }
        );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;
    a.download =
        "KXLuaprotect.lua";

    a.click();

    URL.revokeObjectURL(url);

    status.textContent =
        "Downloaded.";
}

function clearAll() {

    input.value = "";
    output.value = "";

    inputCount.textContent =
        "0 characters";

    outputCount.textContent =
        "0 characters";

    status.textContent =
        "Ready";
}
</script>

</body>
</html>
`;

app.get("/", (req, res) => {
    res.type("html").send(HTML);
});

app.post("/protect", (req, res) => {

    const code = req.body?.code;

    if (typeof code !== "string") {
        return res.status(400).json({
            error: "Invalid Luau source."
        });
    }

    if (!code.trim()) {
        return res.status(400).json({
            error: "Luau source is empty."
        });
    }

    try {

        const result =
            protectLuau(code);

        res.json({
            success: true,
            protected: result
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to process Luau source."
        });
    }
});

app.listen(PORT, () => {
    console.log(
        "KXLuaprotect running on port " + PORT
    );
});
