# Design system Amazon Radar

Stessa famiglia di PinscherTrade. Unica fonte dei valori: `tokens.css`; negli stili dei componenti niente px, colori o durate sciolti.

| Famiglia | Token | Uso |
|---|---|---|
| Base | `--bg`, `--surface`, `--surface-2`, `--surface-hover`, `--border`, `--field` | sfondo, schede, riga attiva, bordi, campi |
| Testo | `--text`, `--text-secondary`, `--text-muted`, `--text-soft` | |
| Stato | `--accent` (risparmio), `--danger` (scadenze), `--warning`, `--ui` (arancio: selezione, navigazione) | |
| Tipografia | `--fs-xs` 10 … `--fs-hero` 34 | scala unica; numeri in `--mono` |
| Spazi e raggi | `--sp-1`…`--sp-7`, `--r-xs`…`--r-xl`, `--r-pill` | |
| Tocco | `--touch-min` 44px | ogni controllo |

Temi: `data-theme="dark|light"` (Auto segue iOS). Vetro: classi `glass` e `glass-anim` su `<html>`, ridefiniscono solo le superfici.

Componenti: `.card` + `.card-h`, `.tile`, `.row` (elenchi), `.badge` (`.ui`, `.ok`, `.bad`), `.btn` (`.primary`, `.danger`, `.block`), `.seg` (scelte a pillola), `.field`, `.check`, `.sheet` (finestra dal basso), `.nav` (barra a capsula), `.toast`.

Testi: italiano, frasi brevi, seconda persona. Importi `1.234,56 €`, date `gg/mm/aa`.
