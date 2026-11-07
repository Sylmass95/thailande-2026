// Serveur du carnet de route : fichiers statiques + proxy vers l'API Claude pour l'assistant.
// Node 20+ sans dépendance. Variables : ANTHROPIC_API_KEY, ANTHROPIC_MODEL, APP_TOKEN, WEB_SEARCH, PORT.
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = parseInt(process.env.PORT || "8080", 10);
const ROOT = path.resolve(process.env.WEB_ROOT || path.join(__dirname, "public"));
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const TOKEN = process.env.APP_TOKEN || "";
const WEB = (process.env.WEB_SEARCH || "true") !== "false";
const BRIDGE = (process.env.TRICOUNT_BRIDGE || "").replace(/\/+$/, "");
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".webmanifest":"application/manifest+json", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

function cors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function json(res, code, obj){ cors(res); res.writeHead(code, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"}); res.end(JSON.stringify(obj)); }
function authorized(req){ return !TOKEN || req.headers["x-app-token"] === TOKEN; }

function serveStatic(req, res){
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    const target = (!err && st.isFile()) ? file : path.join(ROOT, "index.html");
    const ext = path.extname(target);
    const base = path.basename(target);
    const noStore = base === "version.json" || base === "app-bundle.json";
    const noCache = noStore || ["index.html", "apk.html", "sw.js", "manifest.webmanifest"].includes(base) || ext === ".html";
    if (err && !fs.existsSync(target)) { res.writeHead(503, {"Content-Type":"text/plain; charset=utf-8"}); return res.end("Application en cours de construction, réessayez dans un instant."); }
    cors(res);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": noStore ? "no-store" : noCache ? "no-cache" : "public, max-age=2592000",
      ...(path.basename(target) === "sw.js" ? {"Service-Worker-Allowed":"/"} : {}) });
    fs.createReadStream(target).pipe(res);
  });
}

function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("Requête trop volumineuse")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function chat(req, res){
  if (!KEY) return json(res, 503, {error:"Aucune clé API configurée sur le serveur."});
  if (!authorized(req)) return json(res, 401, {error:"Code d’accès invalide."});
  let body;
  try { body = JSON.parse(await readBody(req, 15 * 1024 * 1024)); } catch (e) { return json(res, 400, {error:e.message || "JSON invalide"}); }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-14).map(m => ({role:m.role, content:m.content.slice(0, 20000)}));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json(res, 400, {error:"Le dernier message doit venir de l’utilisateur."});
  // fusionner les messages consécutifs du même rôle
  const merged = [];
  for (const m of msgs) { const last = merged[merged.length - 1]; if (last && last.role === m.role) last.content += "\n\n" + m.content; else merged.push({...m}); }
  const last = merged[merged.length - 1];
  if (body.image && body.image.data && /^image\/(jpeg|png|webp|gif)$/.test(body.image.media_type || "")) {
    last.content = [{type:"image", source:{type:"base64", media_type:body.image.media_type, data:body.image.data}}, {type:"text", text:last.content}];
  }
  // Recherche web localisée sur la ville du jour. Pas de code pays : l’API refuse « TH » (Country code TH is not supported).
  let tools = (WEB && body.web) ? [{type:"web_search_20250305", name:"web_search", max_uses:4,
    user_location:{type:"approximate", timezone:"Asia/Bangkok", ...(body.city ? {city:String(body.city).slice(0, 60)} : {})}}] : undefined;
  let retries = 0;
  let conversation = merged, text = "", stop = "";
  const ask = (msgs, withTools, extra) => fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"x-api-key":KEY, "anthropic-version":"2023-06-01", "content-type":"application/json"},
    body:JSON.stringify({model:MODEL, max_tokens:4096, system:String(body.system || "").slice(0, 120000) + (extra || ""), messages:msgs, ...(withTools && tools ? {tools} : {})})
  });
  try {
    for (let round = 0; round < 6; round++) {
      const r = await ask(conversation, true);
      const j = await r.json();
      if (!r.ok) {
        const msg = (j && j.error && j.error.message) || ("API " + r.status);
        // Repli si la recherche web est refusée : d’abord sans localisation, puis sans recherche web.
        if (r.status === 400 && tools && retries < 2 && /web_search|user_location|country|tools\./i.test(msg)) {
          retries++;
          if (tools[0].user_location) { const t = {...tools[0]}; delete t.user_location; tools = [t]; } else tools = undefined;
          console.log("Recherche web refusée (" + msg + ") : nouvel essai " + (tools ? "sans localisation" : "sans recherche web"));
          round--; continue;
        }
        return json(res, 502, {error:msg});
      }
      text += (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      stop = j.stop_reason || "";
      if (stop === "pause_turn") { conversation = conversation.concat([{role:"assistant", content:j.content}]); continue; }
      break;
    }
    // Réponse vide (recherche web interrompue, limite atteinte…) : nouvel essai sans recherche web.
    if (!text.trim()) {
      console.log("Réponse vide (stop_reason : " + stop + ") : nouvel essai sans recherche web");
      const r = await ask(merged, false, "\n\nRéponds directement, sans recherche web, avec ce que tu sais.");
      const j = await r.json();
      if (r.ok) text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      stop = (j && j.stop_reason) || stop;
    }
  } catch (e) { return json(res, 502, {error:"Connexion à l’API impossible : " + e.message}); }
  if (!text.trim()) return json(res, 502, {error:"Réponse vide de l’API (" + (stop || "raison inconnue") + "). Réessayez ou reformulez."});
  json(res, 200, {text});
}

async function tricount(req, res, url){
  if (!BRIDGE) return json(res, 503, {error:"Pont Tricount non configuré sur le serveur."});
  if (!authorized(req)) return json(res, 401, {error:"Code d’accès invalide."});
  const link = url.searchParams.get("link") || "";
  try {
    const r = await fetch(BRIDGE + "/expenses?link=" + encodeURIComponent(link) + (url.searchParams.get("fresh") === "1" ? "&fresh=1" : ""), {signal: AbortSignal.timeout(30000)});
    const j = await r.json();
    json(res, r.status, j);
  } catch (e) { json(res, 502, {error:"Pont Tricount injoignable : " + e.message}); }
}

// État du serveur : code d’accès accepté ? relais Tricount configuré et vivant ?
async function health(req, res){
  const auth = authorized(req);
  let up = null;
  if (BRIDGE && auth) {
    try { up = (await fetch(BRIDGE + "/health", {signal: AbortSignal.timeout(2500)})).ok; } catch (e) { up = false; }
  }
  json(res, 200, {ok:true, auth, needsToken:!!TOKEN, ai:!!KEY && auth, web:WEB,
    tricount:!!BRIDGE && auth && up !== false, tricountConfigured:!!BRIDGE, tricountUp:up});
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }
  if (url.pathname === "/api/health") return health(req, res);
  if (url.pathname === "/api/tricount" && req.method === "GET") return tricount(req, res, url);
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, () => console.log("Carnet de route sur le port " + PORT + (KEY ? " · assistant IA actif (" + MODEL + ")" : " · assistant IA désactivé (pas de clé)")));
