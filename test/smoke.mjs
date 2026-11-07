// Test de fumée : charge l'app dans un navigateur simulé et parcourt tous les onglets.
// Usage : npm test  (après npm run build)
import fs from "node:fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8").replace(/<link[^>]*googleapis[^>]*>/g, "");
const errors = [];
const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://test.local/", pretendToBeVisual: true, beforeParse(w) {
  w.addEventListener("error", (e) => errors.push(e.message));
  w.scrollTo = () => {}; w.confirm = () => true;
  w.SpeechSynthesisUtterance = function () {};
  w.speechSynthesis = { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 0); } };
  w.fetch = () => Promise.reject(new Error("pas de réseau en test"));
} });
const w = dom.window, d = w.document;
const click = (sel) => { const el = d.querySelector(sel); if (!el) { errors.push("élément manquant : " + sel); return; } el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
await new Promise((r) => setTimeout(r, 300));
const tabs = [...d.querySelectorAll(".tab")].map((t) => t.getAttribute("data-v"));
if (tabs.length !== 10) errors.push("10 onglets attendus, " + tabs.length + " trouvés");
for (const t of tabs) {
  click(`[data-a=tab][data-v=${t}]`);
  if (!d.querySelector("#view").textContent.trim()) errors.push("onglet vide : " + t);
}
click("[data-a=tab][data-v=trip]");
for (let n = 1; n <= 15; n++) { click(`[data-a=day][data-n="${n}"]`); }
click("[data-a=tab][data-v=guide]");
const sites = [...d.querySelectorAll("[data-a=site]")].map((b) => b.getAttribute("data-id"));
for (const id of sites) { click(`[data-a=site][data-id="${id}"]`); click("[data-a=closesheet]"); }
// archivage : manuel puis automatique en fin d’écoute
const count = () => d.querySelectorAll("#view [data-a=site]").length;
click("[data-a=tab][data-v=guide]"); click("[data-a=filter][data-v=all]");
const before = count();
click(`[data-a=site][data-id="${sites[0]}"]`); click(`#sheet [data-a=heardset][data-id="${sites[0]}"]`); click("[data-a=closesheet]");
if (count() !== before - 1) errors.push("l’archivage manuel ne retire pas le guide de la liste");
click(`[data-a=site][data-id="${sites[1]}"]`); click(`#sheet [data-a=playsite][data-id="${sites[1]}"][data-c="0"]`);
await new Promise((r) => setTimeout(r, 400));
click("[data-a=closesheet]");
if (count() !== before - 2) errors.push("le guide écouté jusqu’au bout n’est pas archivé");
click("[data-a=filter][data-v=heard]");
if (count() !== 2) errors.push("la liste « Écoutés » devrait contenir 2 guides");
click(`[data-a=heardset][data-id="${sites[0]}"]`);
if (count() !== 1) errors.push("« Remettre dans la liste » ne fonctionne pas");
// version de l’app : en bas d’Aujourd’hui, en haut de Pratique, bouton de vérification
click("[data-a=tab][data-v=today]");
if (!/^Version .+ · publiée le .+ heure de Thaïlande$/.test((d.querySelector("#app-version") || {}).textContent || "")) errors.push("version absente en bas de l’onglet Aujourd’hui");
click("[data-a=tab][data-v=tools]");
if (!/^Version /.test((d.querySelector("#tools-version") || {}).textContent || "")) errors.push("version absente en haut de l’onglet Pratique");
click("[data-a=updcheck]");
await new Promise((r) => setTimeout(r, 50));
if (!/Réessayez|impossible|dernière version/.test(d.querySelector("#toast").textContent)) errors.push("le bouton « Vérifier les mises à jour » n’affiche pas de résultat");
click("[data-a=minixtest]");
await new Promise((r) => setTimeout(r, 50));
if (!d.querySelector("#minix-test").textContent.trim()) errors.push("le bouton « Tester la connexion au Minix » n’affiche rien");
// traduction : bouton Google en tête
click("[data-a=tab][data-v=translate]");
const first = d.querySelector("#view .card a");
if (!first || !/translate\.google\.com/.test(first.href)) errors.push("le bouton Google Traduction n’est pas en tête de la page Traduire");
await new Promise((r) => setTimeout(r, 100));
if (errors.length) { console.error("ÉCHEC :\n- " + errors.join("\n- ")); process.exit(1); }
console.log("OK : " + tabs.length + " onglets, 15 jours, " + sites.length + " fiches de site, aucune erreur.");
process.exit(0);
