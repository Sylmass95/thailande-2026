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

import tricount.client as TC
from tricount import Tricount, load_client
from tricount.client import BASE_URL

CREDS = Path(os.environ.get("TRICOUNT_CREDENTIALS", "/data/tricount_credentials.json"))
DEFAULT_LINK = os.environ.get("TRICOUNT_LINK", "")
CACHE_SECONDS = int(os.environ.get("TRICOUNT_CACHE_SECONDS", "60"))
# Version de l’appli Android annoncée à Tricount : modifiable sans toucher au code (deploy/.env)
if os.environ.get("TRICOUNT_USER_AGENT"):
    TC.USER_AGENT = os.environ["TRICOUNT_USER_AGENT"]
EXTRA_HEADERS = {"X-Bunq-Language": "fr_FR", "X-Bunq-Region": "fr_FR", "X-Bunq-Geolocation": "0 0 0 0 000", "Cache-Control": "no-cache"}
_lock = threading.Lock()
_client = None
_cache = {}
_fail = {"until": 0.0, "last_try": 0.0, "renewed": 0.0}  # pause après un échec, pour ne pas insister auprès de Tricount


class TricountError(Exception):
    """Refus de Tricount, avec son code et son message."""
    def __init__(self, status, desc):
        super().__init__(f"{status} {desc}")
        self.status, self.desc = status, desc


def token_from(value):
    value = (value or "").strip()
    m = re.search(r"tricount\.com/(?:[a-z]{2}/)?(t[A-Za-z0-9]+)", value)
    if m:
        return m.group(1)
    if re.fullmatch(r"t[A-Za-z0-9]{4,}", value):
        return value
    return None


def client(force=False, new_device=False):
    global _client
    if _client is None or force or new_device:
        CREDS.parent.mkdir(parents=True, exist_ok=True)
        if new_device and CREDS.exists():
            CREDS.replace(CREDS.with_name(CREDS.stem + ".ancien.json"))  # nouvel appareil : nouvelle clé
        _client = load_client(CREDS)
        _client.session.headers.update(EXTRA_HEADERS)
    return _client


def tricount_error(resp):
    """Message exact renvoyé par Tricount (format bunq : {"Error": [{"error_description_translated": …}]})."""
    desc = ""
    try:
        err = (resp.json().get("Error") or [{}])[0]
        desc = err.get("error_description_translated") or err.get("error_description") or ""
    except ValueError:
        desc = resp.text[:200]
    print(f"Tricount a répondu {resp.status_code} : {resp.text[:500]}", flush=True)
    return TricountError(resp.status_code, desc.strip() or "sans détail")


def fetch_raw(token):
    """Lit le tricount brut (pour garder le montant en devise d'origine, amount_local).
    En cas de refus : nouvelle session, puis (au plus une fois toutes les 6 h) nouvel appareil."""
    for attempt in range(3):
        if attempt == 2:
            if time.time() - _fail["renewed"] < 6 * 3600:
                break
            _fail["renewed"] = time.time()
        c = client(force=attempt == 1, new_device=attempt == 2)
        resp = c.session.get(f"{BASE_URL}/v1/user/{c.user_id}/registry", params={"public_identifier_token": token}, timeout=20)
        if resp.ok:
            for item in resp.json().get("Response", []):
                if "Registry" in item:
                    return item["Registry"]
            raise RuntimeError("Tricount introuvable")
        if resp.status_code == 404 or (attempt == 1 and resp.status_code not in (401, 403, 466, 491)):
            raise tricount_error(resp)
        last = resp
    raise tricount_error(last)


def explain(exc):
    """Message clair, en français, pour une erreur de lecture de Tricount."""
    if isinstance(exc, TricountError):
        if exc.status == 491:
            return f"Tricount refuse la lecture faite par le relais du Minix (code 491 : « {exc.desc} »). Si l’appli Tricount fonctionne, c’est le relais non officiel qui est refusé, pas une vraie panne."
        if exc.status == 404:
            return "Tricount introuvable (code 404) : vérifiez le lien de partage."
        return f"Tricount refuse la lecture (code {exc.status} : « {exc.desc} »)."
    code = getattr(getattr(exc, "response", None), "status_code", None)
    if code is None:
        m = re.match(r"(\d{3}) ", str(exc))
        code = int(m.group(1)) if m else None
    if code == 491:
        return "Tricount refuse la connexion du relais du Minix (code 491). Si l’appli Tricount fonctionne, c’est le relais non officiel qui est refusé, pas une vraie panne."
    if code == 429:
        return "Trop de lectures de Tricount d’affilée (code 429) : réessayez dans quelques minutes."
    if code in (401, 403, 466):
        return f"Tricount refuse la connexion (code {code}) : réessayez plus tard."
    if code == 404:
        return "Tricount introuvable (code 404) : vérifiez le lien de partage."
    if code and code >= 500:
        return f"Les serveurs de Tricount ont un problème (code {code}) : réessayez plus tard."
    return f"Lecture Tricount impossible : {exc}"


def _last_path(token):
    return CREDS.parent / f"last_{token}.json"


def save_last(token, data):
    try:
        CREDS.parent.mkdir(parents=True, exist_ok=True)
        _last_path(token).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def load_last(token):
    try:
        return json.loads(_last_path(token).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


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
            "when": (tx.date or "")[:16],
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
        fresh = (q.get("fresh") or ["0"])[0] == "1"  # synchronisation demandée à la main : relire Tricount
        with _lock:
            hit = _cache.get(token)
            if hit and time.time() - hit[0] < (5 if fresh else CACHE_SECONDS):
                return self._send(200, hit[1])
            now = time.time()
            if now < _fail["until"] and not (fresh and now - _fail["last_try"] > 60):
                last = hit[1] if hit else load_last(token)
                if last:
                    return self._send(200, {**last, "stale": True, "stale_reason": _fail.get("reason", "")})
                return self._send(502, {"error": _fail.get("reason", "Tricount indisponible.")})
            _fail["last_try"] = now
            try:
                data = normalize(fetch_raw(token))
            except Exception as exc:  # maintenance, réseau, API modifiée, tricount introuvable…
                reason = explain(exc)
                _fail["until"], _fail["reason"] = time.time() + 300, reason
                print(f"Lecture Tricount impossible : {exc}", flush=True)
                # Tricount indisponible : on renvoie la dernière lecture réussie, signalée comme ancienne.
                last = hit[1] if hit else load_last(token)
                if last:
                    return self._send(200, {**last, "stale": True, "stale_reason": reason})
                return self._send(502, {"error": reason})
            _cache[token] = (time.time(), data)
            _fail["until"] = 0.0
            save_last(token, data)
        return self._send(200, data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8090"))
    print(f"Pont Tricount (lecture seule) sur le port {port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
