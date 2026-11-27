# Amazon Radar

Bot Telegram che controlla i prezzi su Amazon.it ogni 30 minuti e ti avvisa quando:

- 🎯 un prodotto scende sotto il **tuo prezzo obiettivo**
- 📉 cala di almeno il **25%** rispetto alla media degli ultimi 90 giorni
- ⚠️ cala di almeno il **50%** → **possibile errore di prezzo**
- 🏆 tocca il **minimo storico**

Non compra niente da solo (un bot che compra viola le condizioni d'uso di Amazon
e rischi l'account): ti manda il link, decidi tu con un tap.

Gira gratis su **GitHub Actions**, senza server. Tutto configurabile da iPhone.

---

## Cosa serve

| Cosa | Costo | Dove |
|---|---|---|
| Account GitHub | gratis | github.com |
| Bot Telegram | gratis | @BotFather |
| Chiave API Keepa | abbonamento Keepa Pro (~19–29 €/mese, verifica sul sito) | keepa.com |

L'abbonamento Keepa Pro include **1 token al minuto** di API: basta per seguire
circa **30 prodotti** controllati ogni mezz'ora. Con più prodotti il bot li controlla
a rotazione. Il piano API vero (20 token/min) parte da circa 49 €/mese: non serve.

---

## Installazione da iPhone (15 minuti)

### 1. Crea il bot Telegram
1. Apri Telegram, cerca **@BotFather**, scrivi `/newbot`.
2. Scegli un nome (es. *Amazon Radar*) e uno username che finisce in `bot`.
3. Copia il **token** che ti dà (tipo `123456:ABC-...`).
4. Apri il tuo nuovo bot e scrivigli `/start`.

### 2. Prendi la chiave Keepa
1. Su keepa.com crea un account e attiva l'abbonamento.
2. Vai su **keepa.com/#!api** e copia la **chiave di accesso**.

### 3. Crea il repository
1. Su github.com → **+** → **New repository** → nome `amazon-radar`, **Private** → Create.
2. **Add file → Upload files** e carica: `bot.py`, `watchlist.json`, `state.json`, `README.md`.
3. Il workflow va creato a mano (Safari non carica le cartelle):
   **Add file → Create new file**, nel nome scrivi esattamente
   `.github/workflows/radar.yml` e incolla il contenuto del file `radar.yml`. Commit.

### 4. Inserisci i segreti
**Settings → Secrets and variables → Actions → New repository secret**, crea:

| Nome | Valore |
|---|---|
| `TELEGRAM_TOKEN` | il token di BotFather |
| `KEEPA_KEY` | la chiave Keepa |
| `TELEGRAM_CHAT_ID` | il tuo ID chat (vedi sotto) |

**Trovare il TELEGRAM_CHAT_ID:** se hai già quello del bot Kronos, è lo stesso
(è il tuo ID utente). Altrimenti: crea solo i primi due segreti, vai in
**Actions → Amazon Radar → Run workflow**, apri il log del passaggio
*Controlla prezzi e comandi*: troverai `usa questo numero come TELEGRAM_CHAT_ID`.

### 5. Prova
**Actions → Amazon Radar → Run workflow**. Poi su Telegram scrivi `/help`:
la risposta arriva al giro successivo (premi di nuovo *Run workflow* per non aspettare).

---

## Uso quotidiano

Dall'app Amazon: **Condividi → Telegram → Amazon Radar**. Il bot riconosce il link
(anche `amzn.eu`) e inizia a seguirlo.

```
/add https://amzn.eu/d/xxxx 24,90    segui con prezzo obiettivo
/target B0ABC12345 19,90             cambia obiettivo
/del B0ABC12345                      smetti di seguire
/list                                elenco con prezzi attuali
/soglie 20 45                        avviso a -20%, errore a -45%
/stato                               token Keepa rimasti
```

## Note oneste

- **Gli errori di prezzo spesso vengono annullati** da Amazon anche dopo la conferma.
  L'avviso ⚠️ ti dà la possibilità di provarci, non la garanzia.
- Il bot risponde ai comandi con un ritardo fino a 30 minuti (gira a intervalli).
- GitHub a volte ritarda i workflow programmati di qualche minuto.
- Tieni il repo **privato**: watchlist e stato sono affari tuoi, e il bot
  ignora i messaggi di chiunque non sia la tua chat.
- Rivendere in modo sistematico ciò che compri è attività commerciale (partita IVA).

## Dashboard

La dashboard è `index.html` nella cartella principale, pubblicata con GitHub Pages
(Settings → Pages → Branch `main`, cartella `/ (root)`).
I dati che inserisci restano nel tuo browser.
