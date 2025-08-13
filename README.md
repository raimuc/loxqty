# loxqty (GitHub Pages)

Statinis įrankis PDF brėžinių anotavimui ir sąmatų skaičiavimui.

## Privalumai
- Katalogo redagavimas (hierarchija Group → Family → Color, SKU, kaina, ikona), saugoma `localStorage`, yra import/export JSON.
- Žymų dėjimas, linijų braižymas (Shift), Snap 45°/90°.
- Suvestinė + CSV eksportas (įtraukia SKU).
- PNG eksportas (vienas PNG per puslapį).
- PDF eksportas (per naršyklės spausdinimo dialogą).
- Projekto išsaugojimas su **įterptu PDF** (base64) ir katalogo momentine kopija — atidarius `.json`, PDF nebereikia rinkti.

## PDF.js
Puslapis bando:
1. Vietinį `./vendor/pdf.mjs` + `./vendor/pdf.worker.mjs`, jei jie yra.
2. Jei jų nėra — `cdn.jsdelivr.net` → `unpkg.com` (CDN).

Jei organizacijos politikoje CDN draudžiami, įkelk `vendor/pdf.mjs` ir `vendor/pdf.worker.mjs` į repo.

