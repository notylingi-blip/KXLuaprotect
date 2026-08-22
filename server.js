const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

// Hanya hasil transformasi yang disimpan.
const loaders = new Map();

function randomName() {
    return "__KXL_" + crypto.randomBytes(5).toString("hex");
}

function obfuscateLuau(source) {
    let code = String(source);

    // Remove block comments.
    code = code.replace(/--\[\[[\s\S]*?\]\]/g, "");

    // Remove -- comments while preserving strings.
    let result = "";
    let i = 0;

    while (i < code.length) {
        const c = code[i];

        if (c === '"' || c === "'") {
            const quote = c;
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

            result += code.slice(i, j);
            i = j;
            continue;
        }

        if (c === "-" && code[i + 1] === "-") {
            while (
                i < code.length &&
                code[i] !== "\n"
            ) {
                i++;
            }

            result += "\n";
            continue;
        }

        result += c;
        i++;
    }

    code = result;

    // Normalize whitespace.
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/[ \t]+/g, " ");
    code = code.replace(/\n[ \t]*/g, "\n");

    /*
     * Rename simple local variables.
     *
     * We deliberately avoid globals,
     * properties and reserved words.
     */
    const reserved = new Set([
        "and","break","do","else","elseif","end",
        "false","for","function","if","in","local",
        "nil","not","or","repeat","return","then",
        "true","until","while","continue","type",
        "export","typeof","self"
    ]);

    const names = [];
    const seen = new Set();

    const localRegex =
        /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g;

    let match;

    while ((match = localRegex.exec(code))) {
        const name = match[1];

        if (
            !reserved.has(name) &&
            !seen.has(name) &&
            name.length >= 3
        ) {
            seen.add(name);
            names.push(name);
        }
    }

    /*
     * Generate replacement names.
     */
    const replacements = new Map();

    for (const name of names) {
        let newName;

        do {
            newName = randomName();
        } while (
            code.includes(newName) ||
            [...replacements.values()].includes(newName)
        );

        replacements.set(name, newName);
    }

    /*
     * Replace identifiers while keeping
     * quoted strings untouched.
     */
    for (const [oldName, newName] of replacements) {
        let output = "";
        let p = 0;

        while (p < code.length) {
            const c = code[p];

            if (c === '"' || c === "'") {
                const quote = c;
                let q = p + 1;

                while (q < code.length) {
                    if (code[q] === "\\") {
                        q += 2;
                        continue;
                    }

                    if (code[q] === quote) {
                        q++;
                        break;
                    }

                    q++;
                }

                output += code.slice(p, q);
                p = q;
                continue;
            }

            const identifier =
                code.slice(p).match(
                    /^[A-Za-z_][A-Za-z0-9_]*/
                );

            if (identifier) {
                const word = identifier[0];

                output +=
                    replacements.get(word) || word;

                p += word.length;
                continue;
            }

            output += c;
            p++;
        }

        code = output;
    }

    // Remove unnecessary blank lines.
    code = code
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean)
        .join("\n");

    return (
        "-- KXLuaprotect Protected\n" +
        code +
        "\n"
    );
}

const HTML = `
<!DOCTYPE html>
<html>
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
            #28143f,
            #0c0a10 45%,
            #050507
        );
    color: white;
    font-family: Arial, sans-serif;
}

.container {
    width: min(1100px,94%);
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
    color: #9565ff;
}

.subtitle {
    color: #77727f;
    margin-top: 8px;
}

.card {
    background: rgba(15,14,20,.96);
    border: 1px solid #2b2535;
    border-radius: 18px;
    padding: 18px;
}

.label {
    color: #aaa4b1;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 10px;
}

textarea {
    width: 100%;
    height: 380px;
    resize: vertical;
    background: #08080c;
    color: #e8e4ed;
    border: 1px solid #302a39;
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
    font-weight: 700;
    cursor: pointer;
}

.protect {
    flex: 1;
    background: #8051f5;
}

.secondary {
    background: #25202b;
}

.result {
    display: none;
    margin-top: 20px;
}

.loadstring {
    background: #08080c;
    border: 1px solid #302a39;
    border-radius: 12px;
    padding: 14px;
    color: #b897ff;
    font-family: Consolas, monospace;
    font-size: 13px;
    word-break: break-all;
}

.status {
    text-align: center;
    color: #746e7c;
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
    onclick="clearAll()"
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
    class="loadstring"
    id="loadstring"
></div>

<div class="buttons">

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

let currentLoadstring = "";

async function protectCode() {

    const source =
        document.getElementById("source").value;

    const status =
        document.getElementById("status");

    if (!source.trim()) {
        status.textContent =
            "Paste your Luau source first.";
        return;
    }

    status.textContent =
        "Obfuscating...";

    try {

        const response =
            await fetch("/api/protect", {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    source
                })
            });

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
            "Obfuscation completed.";

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
    ).style.display = "none";

    document.getElementById(
        "status"
    ).textContent = "Ready.";

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

        // Source langsung ditransformasi.
        // Yang disimpan hanya hasil transformasi.
        const protectedSource =
            obfuscateLuau(source);

        const id =
            crypto.randomBytes(18).toString("hex");

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
            url,
            loadstring
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Obfuscation failed."
        });
    }
});

// Loader hanya mengembalikan hasil transformasi.
app.get(
    "/files/loaders/:id.lua",
    (req, res) => {

        const protectedSource =
            loaders.get(req.params.id);

        if (!protectedSource) {
            return res
                .status(404)
                .send("Loader not found.");
        }

        res
            .type("text/plain")
            .set("Cache-Control", "no-store")
            .send(protectedSource);
    }
);

app.listen(PORT, () => {
    console.log(
        "KXLuaprotect running on port " + PORT
    );
});
