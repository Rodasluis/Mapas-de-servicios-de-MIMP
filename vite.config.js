import { defineConfig } from 'vite';

/**
 * En GitHub Pages el sitio cuelga de /<repositorio>/, no de la raíz, así que las
 * rutas absolutas necesitan ese prefijo. Se deduce de GITHUB_REPOSITORY durante el
 * despliegue para no tener que escribir aquí el nombre del repositorio y que deje
 * de valer el día que se renombre o se bifurque.
 */
const repositorio = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  base: repositorio ? `/${repositorio}/` : '/',
  build: {
    outDir: 'dist',
    // La cartografía ya viene cuantizada y minificada; no se toca.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        // La aplicación y el banco de pruebas sin interfaz que usa «npm run muestras».
        index: 'index.html',
        muestras: 'muestras.html',
      },
    },
  },
  server: { open: true },
});
