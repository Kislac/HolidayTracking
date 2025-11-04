GitHub Copilot

Rövid, lépésről-lépésre útmutató GitHub Pages-re való feltöltéshez. Két gyakori esetet mutatok: Create React App (CRA) és Vite. Válaszd a projektednek megfelelőt.

1) Hozz létre GitHub repo-t (például USERNAME/REPO)
- Windows (PowerShell) a projekt gyökérben:
  - git init
  - git add .
  - git commit -m "Initial"
  - git remote add origin https://github.com/USERNAME/REPO.git
  - git push -u origin main

2) Telepítsd a gh-pages csomagot:
- npm install --save-dev gh-pages

3A) Ha Create React App (package.json használ "react-scripts"):
- package.json módosítás (add homepage és script-ek):

````json
// ...existing code...
{
  "homepage": "https://USERNAME.github.io/REPO",
  "scripts": {
    // ...existing scripts...
    "predeploy": "npm run build",
    "deploy": "gh-pages -d build"
  }
}
// ...existing code...
````
- Parancsok:
  - npm run deploy
  - (első deploy létrehozza a gh-pages branch-et és feltölti a build-et)

3B) Ha Vite (vite.config.js használata): állítsd be a base útvonalat és deploy script-et.

- vite.config.js módosítás:

````js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/REPO/", // <-- cseréld REPO-ra a repo nevét, pl. "/holiday-tracker/"
  plugins: [react()],
});
````

- package.json script-ek:

````json
// ...existing code...
{
  "scripts": {
    // ...existing scripts...
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
// ...existing code...
````

- Parancsok (Windows):
  - npm run build
  - npm run deploy

4) Ellenőrzés és tippek
- A deploy parancs feltölti a buildet a gh-pages branch-re. Github Pages automatikusan kiszolgálja a https://USERNAME.github.io/REPO címen.
- Ha a repo root-ot használod (homepage üres), Vite-nél a base="/" legyen — de GitHub Pages alatt ha a repo neve az URL része, használd a base "/REPO/"-t.
- Ha a Leaflet assetek (ikonok) rosszul jelennek meg a build után, győződj meg róla, hogy az ikonokat importod (ahogy most), és nem absolute path-okat használsz. (Vite esetén base megadása megoldja az útvonalakat.)
- Ha privát repo: GitHub Pages-hez publikussá kell tenni, vagy Actions-nél token kell.

5) Alternatíva: GitHub Actions (automatikus deploy minden push-ra)
- Ha szeretnéd, küldök egy kész GitHub Actions workflow fájlt (/.github/workflows/deploy.yml) Vite/CRA-hoz.

Ha megírod: 1) melyik build rendszered van (CRA vagy Vite) és 2) mi a GitHub felhasználóneved és a repo neve, készítek pontos package.json / vite.config.js és a pontos parancsokat.