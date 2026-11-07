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
  const tools = (WEB && body.web) ? [{type:"web_search_20250305", name:"web_search", max_uses:4,
    user_location:{type:"approximate", country:"TH", timezone:"Asia/Bangkok", ...(body.city ? {city:String(body.city).slice(0, 60)} : {})}}] : undefined;
  let conversation = merged, text = "";
  try {
    for (let round = 0; round < 3; round++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"x-api-key":KEY, "anthropic-version":"2023-06-01", "content-type":"application/json"},
        body:JSON.stringify({model:MODEL, max_tokens:2000, system:String(body.system || "").slice(0, 120000), messages:conversation, ...(tools ? {tools} : {})})
      });
      const j = await r.json();
      if (!r.ok) return json(res, 502, {error:(j && j.error && j.error.message) || ("API " + r.status)});
      text += (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (j.stop_reason === "pause_turn") { conversation = conversation.concat([{role:"assistant", content:j.content}]); continue; }
      break;
    }
  } catch (e) { return json(res, 502, {error:"Connexion à l’API impossible : " + e.message}); }
  json(res, 200, {text:text || "(réponse vide)"});
}

async function tricount(req, res, url){
  if (!BRIDGE) return json(res, 503, {error:"Pont Tricount non configuré sur le serveur."});
  if (!authorized(req)) return json(res, 401, {error:"Code d’accès invalide."});
  const link = url.searchParams.get("link") || "";
  try {
    const r = await fetch(BRIDGE + "/expenses?link=" + encodeURIComponent(link), {signal: AbortSignal.timeout(30000)});
    const j = await r.json();
    json(res, r.status, j);
  } catch (e) { json(res, 502, {error:"Pont Tricount injoignable : " + e.message}); }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }
  if (url.pathname === "/api/health") return json(res, 200, {ok:true, ai:!!KEY && authorized(req), web:WEB, tricount:!!BRIDGE && authorized(req), needsToken:!!TOKEN});
  if (url.pathname === "/api/tricount" && req.method === "GET") return tricount(req, res, url);
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, () => console.log("Carnet de route sur le port " + PORT + (KEY ? " · assistant IA actif (" + MODEL + ")" : " · assistant IA désactivé (pas de clé)")));
