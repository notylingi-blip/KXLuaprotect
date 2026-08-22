const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const scripts = new Map();

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KXLuaprotect</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #08090d;
  color: #fff;
  font-family: Arial, sans-serif;
}

.topbar {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  background: #0d0f14;
  border-bottom: 1px solid #20242c;
}

.menu-button {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: #171a21;
  color: white;
  font-size: 25px;
  cursor: pointer;
}

.menu-button:hover {
  background: #20242d;
}

.logo {
  margin-left: 14px;
  font-size: 18px;
  font-weight: bold;
}

.sidebar {
  position: fixed;
  z-index: 20;
  top: 64px;
  left: 0;
  bottom: 0;
  width: 260px;
  padding: 18px 14px;
  background: #0c0e13;
  border-right: 1px solid #20242c;
  transform: translateX(-100%);
  transition: .2s ease;
}

.sidebar.open {
  transform: translateX(0);
}

.menu-title {
  color: #707784;
  font-size: 11px;
  font-weight: bold;
  margin: 4px 10px 10px;
}

.menu-item {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #ddd;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover,
.menu-item.active {
  background: #191d25;
  color: white;
}

.submenu {
  display: none;
  padding-left: 12px;
}

.submenu.open {
  display: block;
}

main {
  max-width: 1000px;
  margin: auto;
  padding: 35px 20px;
}

.page {
  display: none;
}

.page.active {
  display: block;
}

h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.desc {
  margin: 0 0 25px;
  color: #777f8d;
}

.card {
  padding: 20px;
  margin-bottom: 14px;
  background: #101218;
  border: 1px solid #222630;
  border-radius: 13px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #b5bac5;
  font-size: 13px;
}

input,
textarea {
  width: 100%;
  padding: 12px;
  border-radius: 9px;
  border: 1px solid #292e38;
  outline: none;
  background: #080a0f;
  color: white;
}

input:focus,
textarea:focus {
  border-color: #5865f2;
}

textarea {
  min-height: 250px;
  resize: vertical;
  font-family: monospace;
}

.protect-button {
  margin-top: 14px;
  padding: 11px 18px;
  border: 0;
  border-radius: 9px;
  background: #5865f2;
  color: white;
  cursor: pointer;
}

.protect-button:hover {
  background: #4752c4;
}

.script {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 16px;
  margin-bottom: 10px;
  background: #101218;
  border: 1px solid #222630;
  border-radius: 12px;
}

.script-name {
  font-weight: bold;
}

.status {
  margin-top: 5px;
  font-size: 12px;
}

.enabled {
  color: #55d68a;
}

.disabled {
  color: #ff5d69;
}

.actions {
  display: flex;
  gap: 7px;
}

.action {
  padding: 8px 11px;
  border-radius: 8px;
  border: 1px solid #292e38;
  background: #171a21;
  color: white;
  cursor: pointer;
}

.action:hover {
  background: #20242d;
}

.delete {
  color: #ff5d69;
}

.empty {
  padding: 40px 20px;
  text-align: center;
  color: #707784;
  border: 1px dashed #292e38;
  border-radius: 12px;
}

.message {
  margin-top: 12px;
  font-size: 13px;
}
</style>
</head>

<body>

<header class="topbar">

  <button
    id="menuButton"
    class="menu-button"
  >⋮</button>

  <div class="logo">
    KXLuaprotect
  </div>

</header>

<aside id="sidebar" class="sidebar">

  <div class="menu-title">
    PROTECTOR
  </div>

  <button
    id="protectorButton"
    class="menu-item"
  >
    Protector
  </button>

  <div
    id="submenu"
    class="submenu"
  >

    <button
      id="scriptButton"
      class="menu-item"
    >
      Script
    </button>

  </div>

</aside>

<main>

  <section
    id="scriptPage"
    class="page active"
  >

    <h1>Script</h1>

    <p class="desc">
      Manage your scripts.
    </p>

    <div id="scriptList">
      <div class="empty">
        Loading...
      </div>
    </div>

  </section>


  <section
    id="protectPage"
    class="page"
  >

    <h1>Protect Source</h1>

    <p class="desc">
      Create a script entry.
    </p>

    <div class="card">

      <label>
        Script Name
      </label>

      <input
        id="scriptName"
        type="text"
        placeholder="Nama script..."
      >

      <br><br>

      <label>
        Source
      </label>

      <textarea
        id="source"
        placeholder="Masukkan source..."
      ></textarea>

      <button
        class="protect-button"
        id="protectButton"
      >
        Protect
      </button>

      <div
        id="message"
        class="message"
      ></div>

    </div>

  </section>

</main>

<script>

const menuButton =
  document.getElementById("menuButton");

const sidebar =
  document.getElementById("sidebar");

const protectorButton =
  document.getElementById("protectorButton");

const submenu =
  document.getElementById("submenu");

const scriptButton =
  document.getElementById("scriptButton");

const scriptPage =
  document.getElementById("scriptPage");

const protectPage =
  document.getElementById("protectPage");

menuButton.onclick = () => {
  sidebar.classList.toggle("open");
};

protectorButton.onclick = () => {
  submenu.classList.toggle("open");
};

scriptButton.onclick = () => {

  scriptPage.classList.add("active");
  protectPage.classList.remove("active");

  sidebar.classList.remove("open");

  loadScripts();
};

document
  .getElementById("protectButton")
  .onclick = async () => {

    const name =
      document
        .getElementById("scriptName")
        .value
        .trim();

    const source =
      document
        .getElementById("source")
        .value;

    const message =
      document.getElementById("message");

    if (!name) {
      message.innerHTML =
        '<span style="color:#ff5d69">Nama script wajib diisi.</span>';
      return;
    }

    if (!source.trim()) {
      message.innerHTML =
        '<span style="color:#ff5d69">Source wajib diisi.</span>';
      return;
    }

    try {

      const response =
        await fetch("/api/scripts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            source
          })
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Gagal."
        );
      }

      message.innerHTML =
        '<span style="color:#55d68a">Script berhasil ditambahkan.</span>';

      document
        .getElementById("scriptName")
        .value = "";

      document
        .getElementById("source")
        .value = "";

      loadScripts();

    } catch (error) {

      message.innerHTML =
        '<span style="color:#ff5d69">' +
        escapeHTML(error.message) +
        '</span>';

    }

  };


async function loadScripts() {

  const list =
    document.getElementById("scriptList");

  list.innerHTML =
    '<div class="empty">Loading...</div>';

  try {

    const response =
      await fetch("/api/scripts");

    const data =
      await response.json();

    if (!data.scripts.length) {

      list.innerHTML =
        '<div class="empty">Belum ada script.</div>';

      return;
    }

    list.innerHTML =
      data.scripts.map(script => {

        const enabled =
          script.enabled === true;

        return \`
          <div class="script">

            <div>

              <div class="script-name">
                \${escapeHTML(script.name)}
              </div>

              <div class="status ${
                enabled
                  ? "enabled"
                  : "disabled"
              }">

                ● ${
                  enabled
                    ? "Enabled"
                    : "Disabled"
                }

              </div>

            </div>

            <div class="actions">

              <button
                class="action"
                onclick="toggleScript('\${script.id}')"
              >
                ${
                  enabled
                    ? "Disable"
                    : "Enable"
                }
              </button>

              <button
                class="action delete"
                onclick="deleteScript('\${script.id}')"
              >
                Delete
              </button>

            </div>

          </div>
        \`;

      }).join("");

  } catch (error) {

    list.innerHTML =
      '<div class="empty">Gagal memuat script.</div>';

    console.error(error);
  }
}


async function toggleScript(id) {

  try {

    const response =
      await fetch(
        "/api/scripts/" +
        encodeURIComponent(id) +
        "/toggle",
        {
          method: "POST"
        }
      );

    if (!response.ok) {
      throw new Error();
    }

    loadScripts();

  } catch {

    alert("Gagal mengubah status script.");

  }
}


async function deleteScript(id) {

  if (!confirm("Hapus script ini?")) {
    return;
  }

  try {

    const response =
      await fetch(
        "/api/scripts/" +
        encodeURIComponent(id),
        {
          method: "DELETE"
        }
      );

    if (!response.ok) {
      throw new Error();
    }

    loadScripts();

  } catch {

    alert("Gagal menghapus script.");

  }
}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


loadScripts();

</script>

</body>
</html>`);
});


/*
 * API
 */

app.get("/api/scripts", (req, res) => {

  const result = [];

  for (const script of scripts.values()) {

    result.push({
      id: script.id,
      name: script.name,
      enabled: script.enabled
    });

  }

  res.json({
    scripts: result
  });

});


app.post("/api/scripts", (req, res) => {

  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

  const source =
    typeof req.body.source === "string"
      ? req.body.source
      : "";

  if (!name) {

    return res.status(400).json({
      error: "Nama script wajib diisi."
    });

  }

  if (!source.trim()) {

    return res.status(400).json({
      error: "Source wajib diisi."
    });

  }

  const scriptId = id();

  scripts.set(scriptId, {
    id: scriptId,
    name,
    source,
    enabled: true,
    createdAt: Date.now()
  });

  res.json({
    success: true,
    id: scriptId
  });

});


app.post(
  "/api/scripts/:id/toggle",
  (req, res) => {

    const script =
      scripts.get(req.params.id);

    if (!script) {

      return res.status(404).json({
        error: "Script tidak ditemukan."
      });

    }

    script.enabled =
      !script.enabled;

    res.json({
      success: true,
      enabled: script.enabled
    });

  }
);


app.delete(
  "/api/scripts/:id",
  (req, res) => {

    const exists =
      scripts.has(req.params.id);

    if (!exists) {

      return res.status(404).json({
        error: "Script tidak ditemukan."
      });

    }

    scripts.delete(req.params.id);

    res.json({
      success: true
    });

  }
);


app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "KXLuaprotect dashboard running on port " +
      PORT
    );
  }
);
