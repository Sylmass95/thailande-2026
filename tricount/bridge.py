"""API perso Tricount (lecture seule) pour le carnet de route.

Utilise le client communautaire non officiel « tricount-api », basé sur l'API privée
de l'appli Android Tricount (bunq). Non affilié à Tricount ni à bunq : peut cesser de
fonctionner sans préavis. Lecture uniquement : le serveur ne rejoint pas le tricount
et n'y écrit rien.

GET /expenses?link=https://tricount.com/tXXXX   (ou ?token=tXXXX, ou variable TRICOUNT_LINK)
GET /health
"""
import json, os, re, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from tricount import Tricount, load_client
from tricount.client import BASE_URL

CREDS = Path(os.environ.get("TRICOUNT_CREDENTIALS", "/data/tricount_credentials.json"))
DEFAULT_LINK = os.environ.get("TRICOUNT_LINK", "")
CACHE_SECONDS = int(os.environ.get("TRICOUNT_CACHE_SECONDS", "60"))
_lock = threading.Lock()
_client = None
_cache = {}


def token_from(value):
    value = (value or "").strip()
    m = re.search(r"tricount\.com/(?:[a-z]{2}/)?(t[A-Za-z0-9]+)", value)
    if m:
        return m.group(1)
    if re.fullmatch(r"t[A-Za-z0-9]{4,}", value):
        return value
    return None


def client(force=False):
    global _client
    if _client is None or force:
        CREDS.parent.mkdir(parents=True, exist_ok=True)
        _client = load_client(CREDS)
    return _client


def fetch_raw(token):
    """Lit le tricount brut (pour garder le montant en devise d'origine, amount_local)."""
    for attempt in range(2):
        c = client(force=attempt == 1)
        resp = c.session.get(f"{BASE_URL}/v1/user/{c.user_id}/registry", params={"public_identifier_token": token}, timeout=20)
        if resp.status_code in (401, 403) and attempt == 0:
            continue  # session expirée : on se réauthentifie
        resp.raise_for_status()
        for item in resp.json().get("Response", []):
            if "Registry" in item:
                return item["Registry"]
        raise RuntimeError("Tricount introuvable")
    raise RuntimeError("Authentification Tricount impossible")


def normalize(raw):
    tc = Tricount.from_dict(raw)
    names = {m.uuid: m.display_name for m in tc.members}
    local = {}
    for entry in raw.get("all_registry_entry", []):
        e = entry.get("RegistryEntry")
        if e and e.get("amount_local"):
            local[e.get("uuid")] = e["amount_local"]
    out = []
    for tx in tc.transactions:
        if tx.transaction_type.value != "NORMAL" or tx.status.value == "INACTIVE":
            continue  # remboursements, revenus et dépenses supprimées ignorés
        amt, cur = tx.amount.as_abs, tx.amount.currency
        loc = local.get(tx.uuid)
        if loc and loc.get("value") and loc.get("currency"):
            amt, cur = abs(float(loc["value"])), loc["currency"]
        out.append({
            "tid": tx.uuid,
            "date": (tx.date or "")[:10],
            "title": tx.description or "Dépense",
            "amt": round(amt, 2),
            "cur": cur,
            "amt_tricount": round(tx.amount.as_abs, 2),
            "cur_tricount": tx.amount.currency,
            "category": tx.category,
            "category_custom": tx.category_custom,
            "payer": names.get(tx.membership_uuid_owner, ""),
        })
    return {"title": tc.title, "currency": tc.currency, "members": [m.display_name for m in tc.members], "expenses": out, "fetched_at": int(time.time())}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._send(200, {"ok": True})
        if url.path != "/expenses":
            return self._send(404, {"error": "inconnu"})
        q = parse_qs(url.query)
        token = token_from((q.get("link") or q.get("token") or [DEFAULT_LINK])[0])
        if not token:
            return self._send(400, {"error": "Lien Tricount invalide : il doit ressembler à https://tricount.com/tXXXX"})
        with _lock:
            hit = _cache.get(token)
            if hit and time.time() - hit[0] < CACHE_SECONDS:
                return self._send(200, hit[1])
            try:
                data = normalize(fetch_raw(token))
            except Exception as exc:  # erreur réseau, API modifiée, tricount introuvable…
                return self._send(502, {"error": f"Lecture Tricount impossible : {exc}"})
            _cache[token] = (time.time(), data)
        return self._send(200, data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8090"))
    print(f"Pont Tricount (lecture seule) sur le port {port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
