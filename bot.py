#!/usr/bin/env python3
"""
Amazon Radar — bot Telegram che ti avvisa quando un prodotto Amazon.it
scende di prezzo. Dati prezzi: API Keepa (legale, a pagamento).
Il bot NON compra nulla: ti manda il link, decidi tu.

Gira su GitHub Actions ogni 30 minuti. Nessuna libreria esterna.

Comandi Telegram (scrivili al bot):
  /add <link o ASIN> [prezzo]   aggiunge un prodotto (prezzo obiettivo opzionale)
  /target <ASIN> <prezzo>       cambia il prezzo obiettivo
  /del <ASIN>                   rimuove un prodotto
  /list                         elenco prodotti seguiti
  /soglie <calo%> <errore%>     cambia le soglie di allerta
  /stato                        token Keepa rimasti
  /help                         questo elenco
"""
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

KEEPA_KEY = os.environ.get("KEEPA_KEY", "").strip()
TG_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

DOMAIN_IT = 8  # amazon.it su Keepa
WATCHLIST_FILE = "watchlist.json"
STATE_FILE = "state.json"

DEFAULT_SETTINGS = {
    "calo_vs_media90": 25,   # % sotto la media 90 giorni per avvisare
    "sospetto_errore": 50,   # % sotto la media oltre cui è probabile errore di prezzo
    "ripeti_dopo_ore": 24,   # non ripetere lo stesso avviso prima di N ore
}

# Indici dei prezzi nei dati Keepa
PRICE_AMAZON = 0   # venduto da Amazon
PRICE_NEW = 1      # nuovo più basso (anche terzi)

ASIN_RE = re.compile(r"\b(B0[A-Z0-9]{8}|\d{9}[\dX])\b")
LINK_ASIN_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d|product)/([A-Z0-9]{10})", re.I)
SHORT_LINK_RE = re.compile(r"https?://(?:www\.)?(?:amzn\.(?:eu|to)|a\.co)/\S+", re.I)


# ---------------------------------------------------------------- utilità

def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={
        "Accept-Encoding": "gzip",
        "User-Agent": "amazon-radar/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def euro(cents):
    if cents is None or cents < 0:
        return "n/d"
    s = f"{cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def parse_price(text):
    """'24,90' / '24.90' / '24' / '24€' -> centesimi"""
    t = text.replace("€", "").strip().replace(",", ".")
    try:
        v = float(t)
    except ValueError:
        return None
    return int(round(v * 100)) if v > 0 else None


def resolve_short_link(url):
    """amzn.eu/xxx -> URL completo (legge solo il redirect, non apre Amazon)."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        opener.open(urllib.request.Request(url, method="HEAD",
                                           headers={"User-Agent": "Mozilla/5.0"}), timeout=15)
    except urllib.error.HTTPError as e:
        return e.headers.get("Location", "") or ""
    except Exception:
        return ""
    return ""


def extract_asin(text):
    m = LINK_ASIN_RE.search(text)
    if m:
        return m.group(1).upper()
    short = SHORT_LINK_RE.search(text)
    if short:
        full = resolve_short_link(short.group(0))
        m = LINK_ASIN_RE.search(full)
        if m:
            return m.group(1).upper()
    m = ASIN_RE.search(text.upper())
    return m.group(1) if m else None


# ---------------------------------------------------------------- Telegram

def tg(method, **params):
    if not TG_TOKEN:
        return {}
    url = f"https://api.telegram.org/bot{TG_TOKEN}/{method}"
    data = urllib.parse.urlencode(params).encode()
    try:
        with urllib.request.urlopen(url, data=data, timeout=30) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        print(f"[telegram] errore {method}: {e}")
        return {}


def send(text):
    print("[msg]", text.replace("\n", " | ")[:200])
    tg("sendMessage", chat_id=TG_CHAT, text=text, parse_mode="HTML",
       disable_web_page_preview="false")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------- Keepa

def keepa_products(asins):
    """Restituisce {asin: prodotto} usando 1 token per prodotto."""
    out = {}
    for i in range(0, len(asins), 100):
        chunk = asins[i:i + 100]
        url = ("https://api.keepa.com/product?" + urllib.parse.urlencode({
            "key": KEEPA_KEY, "domain": DOMAIN_IT,
            "asin": ",".join(chunk), "stats": 90, "history": 0,
        }))
        data = http_get(url)
        if data.get("error"):
            raise RuntimeError(f"Keepa: {data['error']}")
        for p in data.get("products") or []:
            out[p.get("asin")] = p
        print(f"[keepa] token rimasti: {data.get('tokensLeft')}")
    return out


def keepa_tokens():
    data = http_get("https://api.keepa.com/token?" + urllib.parse.urlencode({"key": KEEPA_KEY}))
    return data.get("tokensLeft"), data.get("refillRate")


def _at(arr, idx):
    if not isinstance(arr, list) or idx >= len(arr):
        return None
    v = arr[idx]
    if isinstance(v, list):          # min/max sono [tempo, prezzo]
        v = v[1] if len(v) > 1 else None
    return v if isinstance(v, (int, float)) and v > 0 else None


def read_prices(product):
    """Prezzo attuale più basso tra Amazon e nuovo, con media 90gg e minimo storico."""
    st = product.get("stats") or {}
    best = None
    for idx, seller in ((PRICE_AMAZON, "Amazon"), (PRICE_NEW, "terzi")):
        cur = _at(st.get("current"), idx)
        if cur is None:
            continue
        if best is None or cur < best["now"]:
            best = {
                "now": int(cur),
                "seller": seller,
                "avg90": _at(st.get("avg90"), idx) or _at(st.get("avg"), idx),
                "min_ever": _at(st.get("min"), idx),
            }
    if best and best["seller"] == "terzi" and _at(st.get("current"), PRICE_AMAZON) == best["now"]:
        best["seller"] = "Amazon"
    return best


# ---------------------------------------------------------------- logica avvisi

def evaluate(item, prices, settings):
    """Restituisce (motivi, livello) oppure ([], None)."""
    if not prices:
        return [], None
    now, avg, mn = prices["now"], prices["avg90"], prices["min_ever"]
    reasons, level = [], None
    drop = round((1 - now / avg) * 100) if avg else 0

    if avg and drop >= settings["sospetto_errore"]:
        reasons.append(f"⚠️ <b>Possibile errore di prezzo</b>: -{drop}% sulla media 90gg. "
                       "Amazon può annullare l'ordine.")
        level = "errore"
    elif avg and drop >= settings["calo_vs_media90"]:
        reasons.append(f"📉 Calo del {drop}% sulla media 90gg ({euro(avg)})")
        level = level or "calo"

    target = item.get("target")
    if target and now <= target:
        reasons.append(f"🎯 Sotto il tuo obiettivo di {euro(target)}")
        level = level or "obiettivo"

    if mn and now <= mn:
        reasons.append("🏆 Minimo storico")
        level = level or "minimo"

    return reasons, level


def should_notify(asin, price, state, settings):
    last = state.get(asin)
    if not last:
        return True
    if price < last["price"] * 0.98:          # sceso ancora di almeno il 2%
        return True
    return time.time() - last["ts"] > settings["ripeti_dopo_ore"] * 3600


def check_prices(watch, state):
    items = watch["items"]
    if not items:
        return
    settings = {**DEFAULT_SETTINGS, **watch.get("settings", {})}
    # Con Keepa Pro hai ~1 token/min: controllo solo quanti prodotti i token permettono,
    # a rotazione, così in pochi giri passano tutti.
    asins = list(items.keys())
    left, _ = keepa_tokens()
    budget = max(0, min(len(asins), int(left or 0), 100))
    if budget == 0:
        print("[keepa] nessun token disponibile in questo giro")
        return
    start = state.get("cursor", 0) % len(asins)
    batch = (asins[start:] + asins[:start])[:budget]
    state["cursor"] = (start + budget) % len(asins)
    products = keepa_products(batch)
    alerts = state.setdefault("alerts", {})

    for asin, item in items.items():
        p = products.get(asin)
        if not p:
            continue
        prices = read_prices(p)
        if p.get("title") and not item.get("title"):
            item["title"] = p["title"][:120]
        if prices:
            item["last_price"] = prices["now"]
        reasons, level = evaluate(item, prices, settings)
        if not reasons:
            alerts.pop(asin, None)            # condizione rientrata: si riarma
            continue
        if not should_notify(asin, prices["now"], alerts, settings):
            continue
        title = esc(item.get("title") or asin)
        msg = (f"<b>{title}</b>\n"
               f"Prezzo: <b>{euro(prices['now'])}</b> (venduto da {prices['seller']})\n"
               + "\n".join(reasons) +
               f"\n\nhttps://www.amazon.it/dp/{asin}")
        if level == "errore":
            msg += "\n\nSe compri, fallo subito: questi prezzi durano minuti."
        send(msg)
        alerts[asin] = {"price": prices["now"], "ts": int(time.time()), "level": level}


# ---------------------------------------------------------------- comandi

HELP = ("<b>Amazon Radar</b>\n"
        "/add &lt;link o ASIN&gt; [prezzo] — segui un prodotto\n"
        "/target &lt;ASIN&gt; &lt;prezzo&gt; — prezzo obiettivo\n"
        "/del &lt;ASIN&gt; — smetti di seguirlo\n"
        "/list — prodotti seguiti\n"
        "/soglie &lt;calo%&gt; &lt;errore%&gt; — es. /soglie 25 50\n"
        "/stato — token Keepa\n\n"
        "Rispondo ogni 30 minuti circa (giro su GitHub Actions). "
        "Puoi anche condividere un link Amazon dall'app con il prezzo dopo.")


def handle_command(text, watch):
    items = watch["items"]
    parts = text.strip().split()
    cmd = parts[0].lower().split("@")[0] if parts else ""

    if cmd in ("/start", "/help"):
        return HELP

    if cmd == "/list":
        if not items:
            return "Nessun prodotto seguito. Usa /add."
        rows = []
        for asin, it in items.items():
            t = esc((it.get("title") or asin)[:50])
            tgt = f" · obiettivo {euro(it['target'])}" if it.get("target") else ""
            rows.append(f"• {t}\n  {asin} · ora {euro(it.get('last_price'))}{tgt}")
        return f"<b>Segui {len(items)} prodotti</b>\n" + "\n".join(rows)

    if cmd == "/del" and len(parts) > 1:
        asin = extract_asin(parts[1]) or parts[1].upper()
        return "Rimosso." if items.pop(asin, None) else "Non lo trovo in lista."

    if cmd == "/target" and len(parts) > 2:
        asin = extract_asin(parts[1]) or parts[1].upper()
        price = parse_price(parts[2])
        if asin not in items or not price:
            return "Uso: /target ASIN 24,90"
        items[asin]["target"] = price
        return f"Obiettivo impostato a {euro(price)}."

    if cmd == "/soglie" and len(parts) > 2:
        try:
            calo, err = int(parts[1].rstrip("%")), int(parts[2].rstrip("%"))
        except ValueError:
            return "Uso: /soglie 25 50"
        if not (5 <= calo < err <= 95):
            return "Il calo deve essere tra 5 e l'errore; l'errore al massimo 95."
        watch.setdefault("settings", {}).update(calo_vs_media90=calo, sospetto_errore=err)
        return f"Soglie: avviso a -{calo}%, possibile errore a -{err}%."

    if cmd == "/stato":
        left, rate = keepa_tokens()
        return f"Token Keepa rimasti: {left} (ricarica {rate}/min). Prodotti seguiti: {len(items)}."

    # /add, oppure un link condiviso senza comando
    if cmd == "/add" or "amazon." in text or SHORT_LINK_RE.search(text):
        asin = extract_asin(text)
        if not asin:
            return "Non trovo l'ASIN. Mandami il link del prodotto o il codice (es. B0ABC12345)."
        # prezzo obiettivo solo se è l'ultima parola di un /add (evita numeri nel titolo)
        last = parts[-1] if len(parts) > 2 and cmd == "/add" else ""
        target = parse_price(last) if last and not last.startswith("http") else None
        it = items.setdefault(asin, {"added": int(time.time())})
        if target:
            it["target"] = target
        return (f"Seguo {asin}" + (f" con obiettivo {euro(target)}" if target else "")
                + ". Il primo controllo arriva al prossimo giro.")

    return None


def process_updates(watch, state):
    offset = state.get("tg_offset", 0)
    res = tg("getUpdates", offset=offset, timeout=0)
    for upd in res.get("result", []):
        state["tg_offset"] = upd["update_id"] + 1
        msg = upd.get("message") or upd.get("edited_message") or {}
        chat_id = str((msg.get("chat") or {}).get("id", ""))
        text = msg.get("text") or ""
        if not TG_CHAT:
            print(f"[setup] messaggio dalla chat {chat_id}: usa questo numero come TELEGRAM_CHAT_ID")
            continue
        if chat_id != TG_CHAT or not text:
            continue                      # ignora chiunque non sia tu
        try:
            reply = handle_command(text, watch)
        except Exception as e:
            reply = f"Errore: {esc(e)}"
        if reply:
            send(reply)


# ---------------------------------------------------------------- main

def main():
    if not TG_TOKEN:
        sys.exit("Manca il secret TELEGRAM_TOKEN")
    watch = load_json(WATCHLIST_FILE, {"items": {}, "settings": {}})
    watch.setdefault("items", {})
    state = load_json(STATE_FILE, {})

    process_updates(watch, state)

    if TG_CHAT and KEEPA_KEY:
        try:
            check_prices(watch, state)
        except Exception as e:
            print(f"[keepa] errore: {e}")
            if "error" not in state.get("last_error", ""):
                send(f"Problema con Keepa: {esc(e)}")
            state["last_error"] = f"error {int(time.time())}"
        else:
            state.pop("last_error", None)
    elif not KEEPA_KEY:
        print("[setup] manca KEEPA_KEY: rispondo ai comandi ma non controllo i prezzi")

    save_json(WATCHLIST_FILE, watch)
    save_json(STATE_FILE, state)


if __name__ == "__main__":
    main()
