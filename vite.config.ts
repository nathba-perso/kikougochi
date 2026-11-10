import { defineConfig } from 'vite';
// base relative : le jeu fonctionne dans n'importe quel sous-dossier (GitHub Pages, etc.)
// __BUILD_TIME__ : heure de construction (= mise en ligne), voir resumeAfterOutage dans src/engine/kikou.ts
export default defineConfig({
  base: './', build: { target: 'es2020', assetsInlineLimit: 0 },
  define: { __BUILD_TIME__: JSON.stringify(Date.now()) },
});
