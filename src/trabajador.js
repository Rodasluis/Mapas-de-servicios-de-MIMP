/**
 * Compositor en segundo plano (Web Worker).
 *
 * Compone el mapa FUERA del hilo de la página. Componer un A0 por distritos son veinte
 * segundos de cálculo, y en el hilo de la página eso eran veinte segundos en los que no
 * se podía desplazar el panel, ni pulsar nada, ni siquiera ver que la aplicación seguía
 * viva (revisión de uso de la Fase 22). Aquí el cálculo es el mismo —las mismas
 * funciones que usan las muestras y el mismo SVG—, sólo que corre aparte.
 *
 * El motor no toca el DOM: mide el texto con las métricas de las tipografías
 * (metricas.json) y devuelve una cadena SVG, por eso corre igual en Node, en la página
 * y aquí. Lo único que necesita el navegador es pasar ese SVG a PDF (motor/pdf.js), y
 * eso sigue en la página.
 */
import { crearCargador, lectorNavegador } from './motor/cargador.js';
import { crearHoja } from './motor/hoja.js';
import { componer } from './motor/render.js';

const cargador = crearCargador(lectorNavegador(import.meta.env.BASE_URL));

self.addEventListener('message', async ({ data }) => {
  try {
    const { svg, meta } = await componer({ hoja: crearHoja(data.hoja), cargador, ...data.composicion });
    self.postMessage({ svg, meta });
  } catch (err) {
    self.postMessage({ error: (err && err.message) || String(err) });
  }
});
