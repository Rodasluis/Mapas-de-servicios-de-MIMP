/**
 * Banco de pruebas: expone el motor en `window` para generar mapas sin interfaz.
 *
 * Lo usa scripts/muestras.mjs a través de Playwright. Es código de producción, no de
 * prueba: llama a las mismas funciones que llamará el botón «Generar PDF» de la
 * Fase 5, que es lo que garantiza que la muestra y la descarga coincidan.
 */
import './estilo/fuentes.css';
import { crearHoja } from './motor/hoja.js';
import { crearCargador, lectorNavegador } from './motor/cargador.js';
import { componerNacional } from './motor/render.js';
import { aPdf, lectorTtfNavegador } from './motor/pdf.js';
import { componerHojaDeIconos } from './iconos/hoja.js';
import { crearMedidor } from './motor/texto.js';

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
/**
 * Fuerza la carga de las ocho variantes antes de medir nada.
 *
 * document.fonts.ready sólo espera a las que ya se están usando; una familia
 * declarada pero no aplicada todavía no se descarga. Sin este paso, el primer mapa se
 * compondría midiendo con la tipografía de reserva.
 */
async function fuentesListas() {
  const variantes = [
    '400 10px Poppins', '500 10px Poppins', '600 10px Poppins', '700 10px Poppins',
    '400 10px SourceSans3', 'italic 400 10px SourceSans3',
    '600 10px SourceSans3', '700 10px SourceSans3',
  ];
  await Promise.all(variantes.map((v) => document.fonts.load(v)));
  await document.fonts.ready;
}

/** Compara las métricas del TTF con lo que mide el navegador, que es quien coloca. */
window.comprobarMetricas = async function comprobarMetricas() {
  await fuentesListas();
  const { crearMedidor } = await import('./motor/texto.js');
  const metricas = await cargador.metricas();
  const medidor = crearMedidor(metricas);
  const lienzo = document.createElement('canvas').getContext('2d');
  const pruebas = [
    ['Poppins', 'Regular', 400, 'normal', 'Fuente: Directorio de Servicios del MIMP'],
    ['Poppins', 'Bold', 700, 'normal', 'Ubicación de los servicios que brinda el MIMP'],
    ['Poppins', 'SemiBold', 600, 'normal', 'Escala válida al imprimir al 100 %'],
    ['SourceSans3', 'Bold', 700, 'normal', 'COLOMBIA'],
    ['SourceSans3', 'It', 400, 'italic', 'OCÉANO PACÍFICO'],
    ['SourceSans3', 'Regular', 400, 'normal', '10000000'],
  ];
  return pruebas.map(([familia, variante, peso, estilo, texto]) => {
    const pt = 10;
    const mm = medidor.ancho(texto, { familia, variante, pt });
    /* svg2pdf mide con el cuerpo en unidades de usuario tratadas como px, así que se
       compara en esas mismas unidades: lo que importa es la proporción. */
    const px = (pt * 25.4) / 72;
    lienzo.font = `${estilo} ${peso} ${px}px ${familia}`;
    const navegador = lienzo.measureText(texto).width;
    /* Control: con una familia que no existe el navegador cae en su tipografía de
       reserva. Si la medida buena se pareciera a ésta, la fuente no se habría cargado
       y el parecido con el TTF sería casualidad. */
    lienzo.font = `${estilo} ${peso} ${px}px __no_existe__`;
    const reserva = lienzo.measureText(texto).width;
    return {
      familia: `${familia} ${variante}`,
      texto: texto.length > 22 ? `${texto.slice(0, 22)}…` : texto,
      metricasMm: Number(mm.toFixed(3)),
      navegadorMm: Number(navegador.toFixed(3)),
      desvioPct: Number((((navegador - mm) / mm) * 100).toFixed(2)),
      desvioReservaPct: Number((((reserva - mm) / mm) * 100).toFixed(2)),
    };
  });
};

/** Hoja de referencia de los íconos: documenta tipo → pictograma a tamaño real. */
window.generarHojaIconos = async function generarHojaIconos(config = {}) {
  await fuentesListas();
  const [iconos, centros, metricas] = await Promise.all([
    cargador.iconos(), cargador.centros(), cargador.metricas(),
  ]);
  const { hoja, svg } = componerHojaDeIconos({
    iconos, centros, medidor: crearMedidor(metricas),
  });
  const { bytes, fuentes } = await aPdf({
    svg, hoja, leerTtf, fecha: config.fecha ? new Date(config.fecha) : undefined,
    propiedades: { titulo: 'Íconos de los servicios del MIMP' },
  });
  return { pdf: aBase64(bytes), bytesSvg: svg.length, fuentes, meta: { hoja: hoja.nombre } };
};

window.generarMapa = async function generarMapa(config = {}) {
  await fuentesListas();
  const hoja = crearHoja(config.hoja);

  const t0 = performance.now();
  const { svg, meta } = await componerNacional({
    hoja, cargador, textos: config.textos, opciones: config.opciones,
  });
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

/**
 * Genera el mapa que describe una cadena de consulta, por el camino de las MUESTRAS.
 *
 * Es la referencia contra la que se compara la descarga de la web: la misma
 * configuración, traducida con el mismo aLlamadasDelMotor() y generada con el mismo
 * window.generarMapa(), pero sin pasar por la interfaz. Si los dos archivos no salen
 * idénticos, la diferencia la introdujo la interfaz.
 *
 * @param {string} busqueda  parámetros tal como irían en la URL, sin el «?»
 */
window.generarComoLaWeb = async function generarComoLaWeb(busqueda) {
  const { desdeParametros, aLlamadasDelMotor } = await import('./ui/config.js');
  const config = desdeParametros(new URLSearchParams(busqueda));
  const llamadas = aLlamadasDelMotor(config);
  return window.generarMapa({
    hoja: config.hoja,
    ...llamadas.composicion,
    ...llamadas.pdf,
  });
};

document.getElementById('estado').textContent = 'Motor cargado; window.generarMapa disponible.';
