// Assemble l'application à partir de src/.
//   dist/index.html       page du Minix (webapp installable)
//   dist/apk.html         page de l'APK (chargeur qui accepte les mises à jour reçues du Minix)
//   dist/version.json     version publiée (lue par l'app toutes les 15 s)
//   dist/app-bundle.json  CSS + JS pour la mise à jour rapide de l'APK
//   dist-artifact/        page pour claude.ai
// Usage : npm run build   (aucune dépendance : node seul suffit)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const r = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const DATA = ["src/data/programme.js", "src/data/trajets.js", "src/data/audioguide.js", "src/data/pratique.js"];

const code = DATA.map(r).join("\n") + "\n" + r("src/app.js");
const head = r("src/head.html");
const hash = crypto.createHash("sha256").update(code + head).digest("hex").slice(0, 10);
let t = Date.now();
try { t = parseInt(execSync("git log -1 --format=%ct", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(), 10) * 1000 || t; } catch (e) {}
const js = "var BUILD={v:" + JSON.stringify(hash) + ",t:" + t + "};\n" + code;

try { new Function(js); } catch (e) { console.error("Erreur de syntaxe JavaScript :", e.message); process.exit(1); }
if (/<\/script/i.test(js)) { console.error("Le code contient « </script » : interdit."); process.exit(1); }

const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(head);
if (!m) { console.error("Bloc <style> introuvable dans src/head.html"); process.exit(1); }
const css = m[1];
const headApk = head.replace(/<style[^>]*>/, '<style id="app-css">');
const plain = (h) => h + "<script>\n" + js + "\n</script>\n</body></html>\n";
const loader = headApk
  + '<script id="app-js" type="text/plain">\n' + js + "\n</script>\n"
  + "<script>(function(){var B={t:" + t + "},src=document.getElementById(\"app-js\").textContent,c=null;"
  + "try{c=JSON.parse(localStorage.getItem(\"thai26-live\")||\"null\");}catch(e){}"
  + "if(c&&c.t>B.t&&c.js){src=c.js;var st=document.getElementById(\"app-css\");if(st&&c.css)st.textContent=c.css;}"
  + "var s=document.createElement(\"script\");s.textContent=src;document.body.appendChild(s);})();</script>\n</body></html>\n";

const tmp = path.join(ROOT, "dist.tmp");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, "icons"), { recursive: true });
fs.writeFileSync(path.join(tmp, "index.html"), plain(head));
fs.writeFileSync(path.join(tmp, "apk.html"), loader);
fs.writeFileSync(path.join(tmp, "app-bundle.json"), JSON.stringify({ v: hash, t, css, js }));
fs.writeFileSync(path.join(tmp, "sw.js"), r("public/sw.js").replace("__BUILD__", hash));
fs.copyFileSync(path.join(ROOT, "public/manifest.webmanifest"), path.join(tmp, "manifest.webmanifest"));
for (const f of fs.readdirSync(path.join(ROOT, "public/icons"))) fs.copyFileSync(path.join(ROOT, "public/icons", f), path.join(tmp, "icons", f));
fs.writeFileSync(path.join(tmp, "version.json"), JSON.stringify({ v: hash, t }));

// remplacement quasi instantané de dist/ (le serveur lit dist/ à chaque requête)
const dist = path.join(ROOT, "dist"), old = path.join(ROOT, "dist.old");
fs.rmSync(old, { recursive: true, force: true });
if (fs.existsSync(dist)) fs.renameSync(dist, old);
fs.renameSync(tmp, dist);
fs.rmSync(old, { recursive: true, force: true });

fs.mkdirSync(path.join(ROOT, "dist-artifact"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist-artifact/thailande-2026-carnet-de-route.html"), plain(r("src/head-artifact.html")));
console.log("Build " + hash + " (" + new Date(t).toISOString() + ") : " + Math.round(fs.statSync(path.join(dist, "index.html")).size / 1024) + " Ko");
