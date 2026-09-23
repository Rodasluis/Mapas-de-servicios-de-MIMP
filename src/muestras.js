/**
 * Banco de pruebas: expone el motor en `window` para generar mapas sin interfaz.
 *
 * Lo usa scripts/muestras.mjs a través de Playwright. Es código de producción, no de
 * prueba: llama a las mismas funciones que llamará el botón «Generar PDF» de la
 * Fase 5, que es lo que garantiza que la muestra y la descarga coincidan.
 */
import { crearHoja } from './motor/hoja.js';
import { crearCargador, lectorNavegador } from './motor/cargador.js';
import { componerNacional } from './motor/render.js';
import { aPdf, lectorTtfNavegador } from './motor/pdf.js';

const BASE = import.meta.env.BASE_URL;
const cargador = crearCargador(lectorNavegador(BASE));
const leerTtf = lectorTtfNavegador(BASE);

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/**
 * Compone un mapa y lo devuelve como PDF en base64.
 * @param {object} config {hoja, textos, fecha, propiedades, conSvg}
 */
window.generarMapa = async function generarMapa(config = {}) {
  const hoja = crearHoja(config.hoja);

  const t0 = performance.now();
  const { svg, meta } = await componerNacional({ hoja, cargador, textos: config.textos });
  const msComposicion = performance.now() - t0;

  const t1 = performance.now();
  const { bytes, fuentes } = await aPdf({
    svg,
    hoja,
    leerTtf,
    fecha: config.fecha ? new Date(config.fecha) : undefined,
    propiedades: config.propiedades,
  });
  const msPdf = performance.now() - t1;

  return {
    pdf: aBase64(bytes),
    svg: config.conSvg ? svg : undefined,
    bytesSvg: svg.length,
    fuentes,
    meta: {
      ...meta,
      msComposicion: Math.round(msComposicion),
      msPdf: Math.round(msPdf),
      msTotal: Math.round(msComposicion + msPdf),
    },
  };
};

document.getElementById('estado').textContent = 'Motor cargado; window.generarMapa disponible.';
