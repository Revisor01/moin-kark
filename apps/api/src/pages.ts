// Server-gerenderte Mini-Seiten der API: öffentlicher Status-Monitor (/status)
// und die Admin-Oberfläche für Orts-Korrekturen (/admin). Bewusst ohne Build-Step
// und ohne externe Assets — beides sind Betriebs-Werkzeuge, keine Produkt-UI.

export interface FallbackGroup {
  name: string;
  count: number;
  titles: string[];
}

export interface StatusData {
  status: "ok" | "degraded" | "stale" | "starting";
  generatedAt?: string;
  ageSeconds?: number;
  events?: number;
  orgsOk?: number;
  orgsFailed?: number;
  withEventCoords?: number;
  fallback: FallbackGroup[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BASE_CSS = `
  :root{--primary:#0E6E6E;--accent:#E4572E;--bg:#FBF2E3;--surface:#fff;--fg:#1C2B2B;
    --muted:#5C6B6B;--border:#E6DCCB;--ok:#2E7D5B;--warn:#C97B2C;--bad:#B8431F}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 4px}
  h2{font-size:1.05rem;margin:28px 0 10px}
  .sub{color:var(--muted);margin:0 0 22px;font-size:14px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--muted);font-weight:600}
  .pill{display:inline-block;padding:3px 12px;border-radius:999px;color:#fff;font-weight:700;font-size:14px}
  .ok{background:var(--ok)}.degraded{background:var(--warn)}.stale{background:var(--bad)}.starting{background:var(--muted)}
  .kpis{display:flex;flex-wrap:wrap;gap:10px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 18px;min-width:120px}
  .kpi b{display:block;font-size:1.4rem}
  .kpi span{color:var(--muted);font-size:13px}
  .muted{color:var(--muted)}
  button{background:var(--primary);color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:14px}
  button.ghost{background:transparent;color:var(--primary);border:1px solid var(--border)}
  button.danger{background:transparent;color:var(--bad);border:0;padding:4px 8px}
  input,select{border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:14px;background:#fff;color:var(--fg)}
  input:invalid{border-color:var(--bad)}
`;

/** Öffentliche Monitor-Seite — lädt sich alle 60 s selbst neu. */
export function statusPage(d: StatusData): string {
  const age =
    d.ageSeconds == null
      ? "–"
      : d.ageSeconds < 120
        ? `${Math.round(d.ageSeconds)} s`
        : `${Math.round(d.ageSeconds / 60)} min`;
  const fallbackRows = d.fallback
    .map(
      (g) => `<tr><td>${esc(g.name)}</td><td>${g.count}</td>
        <td class="muted">${esc(g.titles.slice(0, 3).join(" · "))}${g.titles.length > 3 ? " …" : ""}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>Moin Kark — API-Status</title><style>${BASE_CSS}</style></head><body><div class="wrap">
<h1>Moin Kark — API-Status <span class="pill ${d.status}">${d.status}</span></h1>
<p class="sub">Aktualisiert sich jede Minute selbst. Datenstand: ${d.generatedAt ? esc(d.generatedAt) : "noch keiner"} (vor ${age})</p>
<div class="kpis">
  <div class="kpi"><b>${d.events ?? "–"}</b><span>Events im Feed</span></div>
  <div class="kpi"><b>${d.orgsOk ?? "–"} / ${(d.orgsOk ?? 0) + (d.orgsFailed ?? 0)}</b><span>Gemeinden erreichbar</span></div>
  <div class="kpi"><b>${d.withEventCoords ?? "–"}</b><span>mit ChurchDesk-Koordinate</span></div>
  <div class="kpi"><b>${d.fallback.reduce((n, g) => n + g.count, 0)}</b><span>auf Fallback-Pin</span></div>
</div>
<h2>Events auf Fallback-Koordinate</h2>
<p class="sub">Diese Termine haben in ChurchDesk weder Koordinate noch bekannte Korrektur — sie liegen auf dem Gemeinde-Pin. Kandidaten für die <a href="/admin">Orts-Verwaltung</a>.</p>
<div class="card"><table><tr><th>Ort / Gemeinde</th><th>Events</th><th>Beispiele</th></tr>
${fallbackRows || `<tr><td colspan="3" class="muted">Keine — alle Events haben eine echte Koordinate. 🎉</td></tr>`}
</table></div>
</div></body></html>`;
}

/** Admin-Oberfläche: Orts-Korrekturen ansehen und pflegen (Token-Login). */
export function adminPage(): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Moin Kark — Orte verwalten</title><style>${BASE_CSS}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #app{display:none}
  td input{width:100%;min-width:70px}
  details{margin-top:10px}
  summary{cursor:pointer;color:var(--primary);font-weight:600}
  .hint{font-size:13px;color:var(--muted)}
  #msg{margin-left:10px;font-size:14px}
</style></head><body><div class="wrap">
<h1>Moin Kark — Orte verwalten</h1>
<p class="sub">Laufzeit-Korrekturen für Orts-Koordinaten. Sie überstimmen die im Code gepflegten Tabellen und greifen beim nächsten Daten-Refresh (sofort nach dem Speichern angestoßen).</p>

<div class="card" id="login">
  <div class="row">
    <input id="token" type="password" placeholder="Admin-Token" size="30">
    <button onclick="login()">Anmelden</button><span id="loginMsg" class="hint"></span>
  </div>
</div>

<div id="app">
<h2>Orts-Korrekturen (Ortsname → Koordinate)</h2>
<p class="hint">Schlüssel ist der ChurchDesk-Ortsname (Groß/Klein egal). Koordinaten aus OpenStreetMap kopieren.</p>
<div class="card"><table id="locTable"><tr><th>Ortsname</th><th>Lat</th><th>Lng</th><th></th></tr></table>
<div class="row" style="margin-top:10px"><button class="ghost" onclick="addLoc('','','')">+ Ort hinzufügen</button></div></div>

<h2>Titel-Korrekturen (Titel-Präfix → Koordinate)</h2>
<p class="hint">Für Termine ganz ohne Ortsangabe. „Überstimmt ChurchDesk" nur setzen, wenn die gepflegte Adresse bewusst falsch ist (Familienlagune-Fall).</p>
<div class="card"><table id="titleTable"><tr><th>Titel beginnt mit</th><th>Lat</th><th>Lng</th><th>Überstimmt ChurchDesk</th><th></th></tr></table>
<div class="row" style="margin-top:10px"><button class="ghost" onclick="addTitle('','','',false)">+ Titel hinzufügen</button></div></div>

<h2>Ausgeschlossene Kategorien</h2>
<p class="hint">Termine dieser Kategorien erscheinen NICHT auf der Karte. Im Code fest ausgeschlossen: <span id="staticCats"></span>. Hier lassen sich weitere ergänzen — Klick auf einen Vorschlag übernimmt ihn.</p>
<div class="card">
  <table id="catTable"><tr><th>Kategorie</th><th></th></tr></table>
  <div class="row" style="margin-top:10px"><button class="ghost" onclick="addCat('')">+ Kategorie hinzufügen</button></div>
  <p class="hint" style="margin-bottom:0">Aktuelle Kategorien im Feed: <span id="catSuggest"></span></p>
</div>

<div class="row" style="margin:18px 0">
  <button onclick="save()">Speichern &amp; Refresh anstoßen</button><span id="msg"></span>
</div>

<h2>Zur Orientierung</h2>
<div class="card">
  <p class="hint" style="margin-top:0">Events, die aktuell auf einem Fallback-Pin liegen (vom <a href="/status">Status-Monitor</a>): Klick übernimmt den Namen als neue Orts-Korrektur.</p>
  <table id="fbTable"><tr><th>Ort / Gemeinde</th><th>Events</th><th>Beispiele</th></tr></table>
  <details><summary>Im Code gepflegte (statische) Korrekturen anzeigen</summary><div id="staticList"></div></details>
</div>
</div>

<script>
let TOKEN = localStorage.getItem("mkAdminToken") || "";
const $ = (id) => document.getElementById(id);
const headers = () => ({ "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" });

async function login() {
  TOKEN = $("token").value.trim();
  const res = await fetch("/admin/api/locations", { headers: headers() });
  if (!res.ok) { $("loginMsg").textContent = "Token falsch (" + res.status + ")"; return; }
  localStorage.setItem("mkAdminToken", TOKEN);
  $("login").style.display = "none"; $("app").style.display = "block";
  render(await res.json());
  loadFallback();
}

function coordCell(v) { return '<td><input value="' + v + '" size="10" required pattern="-?\\\\d+([.,]\\\\d+)?"></td>'; }
function nameCell(v) { return '<td><input value="' + v.replace(/"/g, "&quot;") + '"></td>'; }
function delCell() { return '<td><button class="danger" onclick="this.closest(\\'tr\\').remove()">✕</button></td>'; }

function addLoc(name, lat, lng) {
  const tr = document.createElement("tr");
  tr.innerHTML = nameCell(name) + coordCell(lat) + coordCell(lng) + delCell();
  $("locTable").appendChild(tr);
}
function addTitle(prefix, lat, lng, force) {
  const tr = document.createElement("tr");
  tr.innerHTML = nameCell(prefix) + coordCell(lat) + coordCell(lng) +
    '<td style="text-align:center"><input type="checkbox"' + (force ? " checked" : "") + '></td>' + delCell();
  $("titleTable").appendChild(tr);
}
function addCat(name) {
  const tr = document.createElement("tr");
  tr.innerHTML = nameCell(name) + delCell();
  $("catTable").appendChild(tr);
}

function render(data) {
  for (const [name, c] of Object.entries(data.overrides.locations)) addLoc(name, c.lat, c.lng);
  for (const t of data.overrides.titles) addTitle(t.prefix, t.coords.lat, t.coords.lng, !!t.force);
  for (const cat of data.overrides.categories || []) addCat(cat);
  $("staticCats").textContent = (data.static.excludedCategories || []).join(", ");
  const sug = $("catSuggest");
  sug.textContent = "";
  for (const cat of data.feedCategories || []) {
    const a = document.createElement("a");
    a.href = "#"; a.textContent = cat; a.style.color = "var(--primary)"; a.style.marginRight = "10px";
    a.onclick = (ev) => { ev.preventDefault(); addCat(cat); };
    sug.appendChild(a);
  }
  const stat = [];
  for (const [name, c] of Object.entries(data.static.locations))
    stat.push(name + " → " + c.lat + ", " + c.lng);
  for (const t of data.static.titles)
    stat.push("Titel „" + t.prefix + "\\u201C → " + t.coords.lat + ", " + t.coords.lng);
  $("staticList").innerHTML = "<p class='hint'>" + stat.map(s => s.replace(/</g, "&lt;")).join("<br>") + "</p>";
}

function num(input) { return Number(String(input.value).replace(",", ".")); }

function collect() {
  const locations = {};
  for (const tr of [...$("locTable").rows].slice(1)) {
    const [name, lat, lng] = [...tr.querySelectorAll("input")];
    if (!name.value.trim()) continue;
    locations[name.value.trim()] = { lat: num(lat), lng: num(lng) };
  }
  const titles = [];
  for (const tr of [...$("titleTable").rows].slice(1)) {
    const [prefix, lat, lng, force] = [...tr.querySelectorAll("input")];
    if (!prefix.value.trim()) continue;
    titles.push({ prefix: prefix.value.trim(), coords: { lat: num(lat), lng: num(lng) }, force: force.checked });
  }
  const categories = [];
  for (const tr of [...$("catTable").rows].slice(1)) {
    const [name] = [...tr.querySelectorAll("input")];
    if (name.value.trim()) categories.push(name.value.trim());
  }
  return { locations, titles, categories };
}

async function save() {
  $("msg").textContent = "Speichere …";
  const res = await fetch("/admin/api/locations", { method: "PUT", headers: headers(), body: JSON.stringify(collect()) });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    $("msg").textContent = "Fehler: " + (e.error || res.status);
    return;
  }
  $("msg").textContent = "Gespeichert — Daten-Refresh läuft.";
  setTimeout(loadFallback, 8000);
}

async function loadFallback() {
  const res = await fetch("/status.json");
  if (!res.ok) return;
  const d = await res.json();
  const t = $("fbTable");
  while (t.rows.length > 1) t.deleteRow(1);
  for (const g of d.fallback) {
    const tr = t.insertRow();
    const a = tr.insertCell(); a.innerHTML = '<a href="#" style="color:var(--primary)">' + g.name.replace(/</g, "&lt;") + "</a>";
    a.firstChild.onclick = (ev) => { ev.preventDefault(); addLoc(g.name, "", ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
    tr.insertCell().textContent = g.count;
    tr.insertCell().textContent = g.titles.slice(0, 3).join(" · ");
  }
  if (t.rows.length === 1) { const tr = t.insertRow(); const td = tr.insertCell(); td.colSpan = 3; td.className = "muted"; td.textContent = "Keine — alles hat echte Koordinaten."; }
}

if (TOKEN) { $("token").value = TOKEN; login(); }
</script>
</body></html>`;
}
