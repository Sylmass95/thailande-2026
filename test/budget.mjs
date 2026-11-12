// Test du module Budget : doublon roadbook / Tricount, synchronisation validée ligne par ligne,
// contrôle « total de l’app = total Tricount », modification, suppression, sauvegardes,
// blocs DEPENSES_MODIF / DEPENSES_SUPPR de l’assistant et budget prévisionnel.
// Usage : npm test (après npm run build)
import fs from "node:fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8").replace(/<link[^>]*googleapis[^>]*>/g, "");
const errors = [];
const ok = (c, m) => { if (!c) errors.push(m); };

// Tricount fictif reprenant les catégories réelles : vols 1 696, hôtels 1 248 (dont Phuket 110),
// excursions 421, nourriture 156, transport 160, shopping 25. Valeurs en euros calculées par Tricount.
const T = (tid, date, title, amt, cur, eur, category) => ({ tid, date, when: date + " 12:00", title, amt, cur, amt_tricount: eur, cur_tricount: "EUR", category, category_custom: null, payer: "Sylvain" });
const TRICOUNT = [
  T("v1", "2026-07-02", "Vols Qatar Airways", 1326.12, "EUR", 1326.12, "TRAVEL"),
  T("v2", "2026-09-10", "Vol AirAsia DMK CNX", 126.66, "EUR", 126.66, "TRAVEL"),
  T("v3", "2026-09-10", "Vol AirAsia CNX URT", 243.22, "EUR", 243.22, "TRAVEL"),
  T("h1", "2026-09-01", "Hôtel Rambuttri", 88.70, "EUR", 88.70, "TRAVEL"),
  T("h2", "2026-09-01", "Hôtel Pingnakorn", 213.08, "EUR", 213.08, "TRAVEL"),
  T("h3", "2026-09-01", "Las Orquideas", 144.00, "EUR", 144.00, "TRAVEL"),
  T("h4", "2026-09-05", "Forfait lac Cheow Lan", 6480, "THB", 154.37, "TRAVEL"),
  T("h5", "2026-09-05", "Aonang Fiore", 537.85, "EUR", 537.85, "TRAVEL"),
  T("h6", "2026-11-12", "Hôtel Phuket", 110.00, "EUR", 110.00, "TRAVEL"),
  T("x1", "2026-09-20", "Doi Inthanon", 85.08, "EUR", 85.08, "ENTERTAINMENT"),
  T("x2", "2026-09-20", "Phi Phi", 93.94, "EUR", 93.94, "ENTERTAINMENT"),
  T("x3", "2026-09-20", "Hong Islands", 74.46, "EUR", 74.46, "ENTERTAINMENT"),
  T("x4", "2026-11-07", "Entrées Wat Arun et Wat Pho", 1000, "THB", 26.52, "ENTERTAINMENT"),
  T("x5", "2026-11-10", "Canoë et ATV", 4320, "THB", 141.00, "ENTERTAINMENT"),
  T("n1", "2026-11-06", "Restaurants Bangkok", 2200, "THB", 58.40, "FOOD_AND_DRINK"),
  T("n2", "2026-11-09", "Restaurants Chiang Mai", 3680, "THB", 97.60, "FOOD_AND_DRINK"),
  T("t1", "2026-11-08", "Chauffeur Ayutthaya", 3500, "THB", 92.80, "TRANSPORT"),
  T("t2", "2026-11-11", "Taxis et bateaux", 2535, "THB", 67.20, "TRANSPORT"),
  T("s1", "2026-11-09", "Souvenirs", 943, "THB", 25.00, "SHOPPING"),
];
const tcTotal = TRICOUNT.reduce((s, x) => s + x.amt_tricount, 0);
let chatReply = "";

const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://test.local/", pretendToBeVisual: true, beforeParse(w) {
  w.addEventListener("error", (e) => errors.push("erreur JS : " + e.message));
  w.scrollTo = () => {}; w.confirm = () => true;
  w.speechSynthesis = { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} };
  w.localStorage.setItem("thai26-v1", JSON.stringify({ set: { offset: Date.parse("2026-11-12T18:00:00+07:00") - Date.now(), aiPos: false } }));
  const res = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(o))) });
  w.fetch = (u) => {
    u = String(u);
    if (u.includes("/api/health")) return res({ ok: true, auth: true, ai: true, tricount: true, web: false });
    if (u.includes("/api/tricount")) return res({ title: "Thaïlande", currency: "EUR", expenses: TRICOUNT });
    if (u.includes("/api/chat")) return res({ text: chatReply });
    return Promise.reject(new Error("pas de réseau en test"));
  };
} });
const w = dom.window, d = w.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => { const el = d.querySelector(sel); if (!el) { errors.push("élément manquant : " + sel); return; } el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const state = () => JSON.parse(w.localStorage.getItem("thai26-v1"));
const eur = (e, rate) => (typeof e.eur === "number" ? e.eur : e.cur === "THB" ? e.amt / rate : e.amt);
const appTotal = () => { const s = state(), inc = !s.budget || s.budget.includePre !== false, r = s.set.rate || 37.71; return s.exp.filter((e) => inc || e.src !== "roadbook").reduce((t, e) => t + eur(e, r), 0); };

await wait(400);
click("[data-a=tab][data-v=tricount]");
await wait(200);

// 1. situation de départ : réservations du roadbook + Tricount à partir du 5 novembre = doublons
const before = appTotal();
ok(before - tcTotal > 100, `l’écart de départ devrait dépasser 100 € (app ${before.toFixed(2)}, Tricount ${tcTotal.toFixed(2)})`);
ok(state().exp.some((e) => e.src === "roadbook" && /Maikhao/.test(e.title)) && state().exp.some((e) => e.tid === "h6"), "le doublon Phuket (roadbook + Tricount) devrait exister au départ");

// 2. comparaison : rien n’est modifié avant validation
const snap = JSON.stringify(state().exp);
click("[data-a=rclive]");
await wait(200);
const card = d.querySelector("#rc-card");
const ct = card ? card.textContent : "";
ok(/Montants différents \(2\)/.test(ct) && /Forfait lac Cheow Lan/.test(ct), "l’écart du forfait du lac (reconverti au taux de l’app) devrait apparaître");
ok(/En trop dans l’app \(1\)Tout cocherTout décocherApp : 2026-11-18 · Maikhao/.test(ct), "la réservation Maikhao (doublon de l’hôtel de Phuket) devrait être proposée en trop");
ok(JSON.stringify(state().exp) === snap, "aucune donnée ne doit changer avant « Appliquer »");

// 3. application : sauvegarde puis total identique à Tricount
click("[data-a=rcapply]");
await wait(150);
const backups = JSON.parse(w.localStorage.getItem("thai26-backups") || "[]");
ok(backups.length >= 1 && /synchronisation/i.test(backups[0].reason) && backups[0].exp.length === JSON.parse(snap).length, "une sauvegarde complète doit être faite avant la synchronisation");
const after = appTotal();
ok(Math.abs(after - tcTotal) < 1, `après synchronisation, total app ${after.toFixed(2)} € devrait égaler Tricount ${tcTotal.toFixed(2)} €`);
ok(/✓ Total de l’app = total Tricount/.test(d.querySelector("#rc-card").textContent), "le contrôle ✓ doit s’afficher après la synchronisation");
const cats = {}; state().exp.forEach((e) => { cats[e.cat] = (cats[e.cat] || 0) + eur(e, 37.71); });
ok(Math.abs((cats.hebergement || 0) - 1248) < 1, `hébergement après synchronisation : ${(cats.hebergement || 0).toFixed(2)} € au lieu de 1 248 €`);
ok(Math.abs((cats.vols || 0) - 1696) < 1, `vols après synchronisation : ${(cats.vols || 0).toFixed(2)} € au lieu de 1 696 €`);
ok(state().budget.tcTruth === true, "Tricount doit devenir la source de vérité après une synchronisation lue en direct");

// 4. les lectures suivantes de Tricount gardent l’égalité (réservations comprises)
click("[data-a=tcsync]");
await wait(200);
ok(Math.abs(appTotal() - tcTotal) < 1, `après une nouvelle lecture de Tricount, le total devrait rester ${tcTotal.toFixed(2)} € (${appTotal().toFixed(2)})`);

// 5. modifier puis supprimer une dépense (montant négatif autorisé)
w.localStorage.setItem("thai26-v1", JSON.stringify(Object.assign(state(), {})));
click("[data-a=tab][data-v=tricount]");
const s5 = state(); s5.exp.push({ id: "m1", date: "2026-11-12", title: "Glaces", amt: 80, cur: "THB", cat: "nourriture", src: "manuel" });
w.localStorage.setItem("thai26-v1", JSON.stringify(s5));
// recharge l’état en mémoire via une nouvelle page
const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "https://test.local/", pretendToBeVisual: true, beforeParse(w2) {
  w2.addEventListener("error", (e) => errors.push("erreur JS (page 2) : " + e.message));
  w2.scrollTo = () => {}; w2.confirm = () => true;
  w2.speechSynthesis = { getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} };
  for (const k of ["thai26-v1", "thai26-backups"]) w2.localStorage.setItem(k, w.localStorage.getItem(k));
  w2.fetch = w.fetch;
} });
const w2 = dom2.window, d2 = w2.document;
const click2 = (sel) => { const el = d2.querySelector(sel); if (!el) { errors.push("élément manquant (page 2) : " + sel); return; } el.dispatchEvent(new w2.MouseEvent("click", { bubbles: true })); };
const st2 = () => JSON.parse(w2.localStorage.getItem("thai26-v1"));
await wait(300);
click2("[data-a=tab][data-v=tricount]");
click2('[data-a=expedit][data-id="m1"]');
const amt = d2.querySelector("#ee-amt");
ok(!!amt, "le formulaire de modification doit s’ouvrir");
if (amt) { amt.value = "-50"; d2.querySelector("#ee-title").value = "Correction glaces"; click2('[data-a=expsave][data-id="m1"]'); }
const m1 = st2().exp.find((e) => e.id === "m1");
ok(m1 && m1.amt === -50 && m1.title === "Correction glaces", "la modification (montant négatif) doit être enregistrée");
click2('[data-a=expdel][data-id="m1"]');
ok(!st2().exp.some((e) => e.id === "m1"), "la suppression confirmée doit retirer la dépense");
ok(JSON.parse(w2.localStorage.getItem("thai26-backups")).length >= 3, "modification et suppression doivent créer des sauvegardes");

// 6. assistant : blocs DEPENSES_MODIF et DEPENSES_SUPPR avec aperçu puis « Appliquer »
const target = st2().exp.find((e) => e.tid === "s1"), victim = st2().exp.find((e) => e.tid === "t2");
chatReply = `Je corrige les souvenirs et je retire le doublon.\n<<<DEPENSES_MODIF\n[{"id":"${target.id}","champ":"montant","valeur":1000}]\nDEPENSES_MODIF>>>\n<<<DEPENSES_SUPPR\n["${victim.id}"]\nDEPENSES_SUPPR>>>`;
click2("[data-a=tab][data-v=ai]");
d2.querySelector("#ai-text").value = "Corrige";
click2("[data-a=aisend]");
await wait(300);
const view = d2.querySelector("#view").textContent;
ok(/Corrections de dépenses proposées/.test(view) && /Souvenirs · montant : 943 THB → 1\s000 THB/.test(view), "l’aperçu de la modification proposée doit s’afficher");
ok(/Suppressions proposées/.test(view) && /Taxis et bateaux/.test(view), "l’aperçu de la suppression proposée doit s’afficher");
ok(st2().exp.find((e) => e.id === target.id).amt === 943, "rien ne doit changer avant « Appliquer »");
click2("[data-a=modapply]"); click2("[data-a=delapply]");
ok(st2().exp.find((e) => e.id === target.id).amt === 1000, "la modification de l’assistant doit s’appliquer");
ok(!st2().exp.some((e) => e.id === victim.id), "la suppression de l’assistant doit s’appliquer");

// 7. budget prévisionnel Tricount du 12 novembre
click2("[data-a=tab][data-v=tricount]");
click2("[data-a=fcapply]");
const B = st2().budget;
ok(B.cats.vols === 1696 && B.cats.hebergement === 1248 && B.cats.shopping === 25, "les catégories du budget prévisionnel doivent reprendre Tricount");
ok(Math.abs(B.cats.nourriture - 331) < 0.01 && Math.abs(B.cats.transport - (160 + 6000 / 37.71)) < 0.01 && Math.abs(B.cats.excursions - (421 + 2480 / 37.71)) < 0.01, "nourriture, transport (transferts) et excursions (espèces pour les frais) doivent inclure le reste à payer");
ok(B.total === 4000 && B.max === 4400 && B.resteTHB === 8480 && B.dcat.nourriture === 25, "objectif, maximum, reste à payer (8 480 THB) et repas du jour (25 €)");
const paid = d2.querySelector('[data-a=restepaid][data-id="kao"]');
ok(!!paid, "la case « payé » du transfert Khao Sok → Ao Nang doit exister");
if (paid) { paid.checked = true; paid.dispatchEvent(new w2.Event("change", { bubbles: true })); }
ok(st2().budget.resteTHB === 5480, "cocher un transfert payé doit baisser le reste à payer à 5 480 THB");
ok(/Prévision fin de voyage/.test(d2.querySelector("#view").textContent), "la prévision de fin de voyage doit s’afficher");

await wait(50);
if (errors.length) { console.error("ÉCHEC (budget) :\n- " + errors.join("\n- ")); process.exit(1); }
console.log(`OK : budget synchronisé avec Tricount (${before.toFixed(2)} € → ${after.toFixed(2)} €, Tricount ${tcTotal.toFixed(2)} €), modification, suppression, sauvegardes, blocs de l’assistant, budget prévisionnel.`);
process.exit(0);
