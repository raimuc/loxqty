# loxqty (GitHub Pages)

- PDF brėžinių anotavimas ir sąmatų skaičiavimas.
- Katalogas su **hierarchija** (Grupė → Šeima → Spalva) ir **gamintojo kodu (SKU)**.
- Katalogo redagavimas rankiniu būdu (LocalStorage) + import/export JSON.
- Projektų išsaugojimas su **įterptu PDF** (base64) — atidarius `.json`, PDF nereikia rinkti.
- PNG eksportas (po puslapį) ir PDF eksportas (per spausdinimo dialogą).

## GitHub Pages
- Failai veikia iš karto; PDF.js kraunamas iš `./vendor/pdf.mjs`, o jei jo nėra — automatiškai iš CDN.
- Jei reikia „offline“, įkelk į `vendor/`:
  - `pdf.mjs`
  - `pdf.worker.mjs`

## Katalogo hierarchija
Elementai turi laukus: `cat` (Grupė), `family` (Šeima), `color` (Spalva), ir `sku` (Gamintojo kodas).
Filtravimas vyksta pagal pasirinktą kelią.

