import { defineConfig } from 'vite';
// base relative : le jeu fonctionne dans n'importe quel sous-dossier (GitHub Pages, etc.)
export default defineConfig({ base: './', build: { target: 'es2020', assetsInlineLimit: 0 } });
