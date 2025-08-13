# loxqty — GitHub Pages build

**Kaip paleisti**

1. Į šio repo *šaknį* įkelk šiuos failus: `index.html`, `app.js`, `style.css`, `.nojekyll`, ir aplanką `vendor/`.
2. Į `vendor/` įkelk **PDF.js ESM** failus: `pdf.mjs` ir `pdf.worker.mjs`.
3. Repo **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`, Folder: `/ (root)`.
4. Tavo puslapis bus pasiekiamas per `https://<vartotojas>.github.io/<repo>/`.

**Funkcionalumas**

- PDF įkėlimas (failas įterpiamas į projektą kaip base64).
- Žymų (elementų) dėjimas, linijų braižymas (laikant Shift), undo, clear.
- Kiekiai + CSV eksportas.
- Eksportas į PNG (po puslapį) ir į PDF (per spausdinimo dialogą).
- Projekto išsaugojimas į `.json`, kuriame yra **įterptas PDF** + anotacijos.
- Projekto įkėlimas: atkuriamas ir PDF, ir žymos.
- **Katalogo redagavimas** (inline modalas) su išsaugojimu `localStorage` + import/export JSON.
- Pasirinktinai: įtraukti katalogą į konkretų projektą (checkbox „Įtraukti katalogą į projektą“).

> Pastaba: GitHub Pages nenaudos CDN. Būtinai pridėk `vendor/pdf.mjs` ir `vendor/pdf.worker.mjs` į repo.
