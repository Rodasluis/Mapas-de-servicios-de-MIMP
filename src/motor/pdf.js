/**
 * Exportación del SVG compuesto a PDF vectorial.
 *
 * svg2pdf traduce el SVG trazo por trazo a operadores de dibujo del PDF: no hay
 * rasterización por medio, así que el resultado se puede ampliar sin límite. Por eso
 * el SVG que llega aquí no puede contener ni <image> ni filtros —nada que obligue a
 * un mapa de bits—, y por eso el motor compone un único SVG que sirve a la vez de
 * vista previa y de original de imprenta.
 *
 * Esta parte necesita un navegador: svg2pdf mide el texto con el propio motor de
 * tipografía del navegador. Las muestras de línea de órdenes usan el mismo código
 * dentro de un Chromium sin ventana, de modo que el PDF que descarga un usuario y el
 * que genera `npm run muestras` salen del mismo camino.
 */
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { fuentes } from '../estilo/tokens.js';

/**
 * Estilo y peso CSS de cada variante tipográfica.
 *
 * jsPDF guarda cada fuente bajo una clave que calcula él mismo combinando estilo y
 * peso: 400 queda en 'normal', 700 en 'bold' y el resto en «<peso><estilo>», por
 * ejemplo '600normal'. svg2pdf pide la fuente con esa misma regla, así que basta con
 * entregar el estilo y el peso SIN combinar y dejar que jsPDF forme la clave.
 *
 * Pasarle la clave ya combinada la vuelve a combinar ('600' + '600normal') y la
 * fuente queda registrada con un nombre que nadie pide. El fallo es de los peores:
 * el PDF se genera sin error, pero jsPDF conserva la tipografía anterior y el texto
 * sale en Times en lugar de la institucional.
 */
const VARIANTES = {
  Regular: { estilo: 'normal', peso: 400 },
  Medium: { estilo: 'normal', peso: 500 },
  SemiBold: { estilo: 'normal', peso: 600 },
  Semibold: { estilo: 'normal', peso: 600 },
  Bold: { estilo: 'normal', peso: 700 },
  It: { estilo: 'italic', peso: 400 },
};

/**
 * Registra en el documento las tipografías que el SVG vaya a usar.
 * @param {object} doc         instancia de jsPDF
 * @param {Function} leerTtf   (archivo) => Promise<string base64 sin cabecera>
 */
export async function registrarFuentes(doc, leerTtf) {
  const registradas = [];
  for (const [clave, archivo] of Object.entries(fuentes)) {
    const [familia, variante] = clave.split(':');
    const v = VARIANTES[variante];
    if (!v) throw new Error(`Variante tipográfica sin equivalencia en jsPDF: ${clave}`);
    const base64 = await leerTtf(archivo);
    doc.addFileToVFS(archivo, base64);
    doc.addFont(archivo, familia, v.estilo, v.peso);
    registradas.push(`${familia} ${v.peso}${v.estilo === 'italic' ? ' cursiva' : ''}`);
  }

  /* Comprobación en el sitio: si una variante no quedó bajo la clave con la que
     svg2pdf la va a pedir, se detecta aquí y no tres pasos más tarde, en un PDF ya
     compuesto con otra tipografía. */
  const disponibles = doc.getFontList();
  for (const clave of Object.keys(fuentes)) {
    const [familia, variante] = clave.split(':');
    const { estilo, peso } = VARIANTES[variante];
    const buscada = claveDeEstilo(estilo, peso);
    const estilos = disponibles[familia] || [];
    if (!estilos.includes(buscada)) {
      throw new Error(
        `La tipografía ${familia} ${variante} no quedó registrada como «${buscada}». `
        + `Registradas para ${familia}: ${estilos.join(', ') || 'ninguna'}.`,
      );
    }
  }
  return registradas;
}

/**
 * Reproduce la regla con la que jsPDF y svg2pdf componen la clave de estilo, para
 * poder comprobar el registro sin hurgar en sus interioridades.
 */
function claveDeEstilo(estilo, peso) {
  if (peso === 400) return estilo === 'italic' ? 'italic' : 'normal';
  if (peso === 700 && estilo === 'normal') return 'bold';
  return `${peso === 700 ? 'bold' : peso}${estilo}`;
}

/**
 * Convierte el SVG en PDF.
 *
 * @param {object} opciones
 * @param {string} opciones.svg        documento SVG completo
 * @param {object} opciones.hoja       de crearHoja()
 * @param {Function} opciones.leerTtf  lector de tipografías
 * @param {object} [opciones.propiedades] título, autor, asunto
 * @param {Date}  [opciones.fecha]     fija la fecha de creación (regresión visual)
 * @returns {Promise<{bytes: Uint8Array, fuentes: string[]}>}
 */
export async function aPdf({ svg, hoja, leerTtf, propiedades = {}, fecha }) {
  const doc = new jsPDF({
    unit: 'mm',
    format: [hoja.anchoMm, hoja.altoMm],
    orientation: hoja.orientacion === 'vertical' ? 'portrait' : 'landscape',
    compress: true,
    putOnlyUsedFonts: true,
  });

  const registradas = await registrarFuentes(doc, leerTtf);

  doc.setProperties({
    title: propiedades.titulo || 'Servicios del MIMP',
    subject: propiedades.asunto || 'Mapa de los servicios del MIMP',
    author: propiedades.autor || 'Ministerio de la Mujer y Poblaciones Vulnerables',
    creator: 'Mapas imprimibles del MIMP',
  });
  /* Con fecha fija el PDF queda reproducible byte a byte, que es lo que necesita la
     comparación de regresión. Además de la fecha hay que fijar el identificador de
     archivo: jsPDF lo sortea al azar en cada ejecución y, aun siendo sólo 32 caracteres
     del tráiler que no afectan a lo impreso, bastan para que dos salidas idénticas no
     se parezcan al compararlas. Se deriva del propio contenido, así que dos mapas
     distintos siguen teniendo identificadores distintos. */
  if (fecha) {
    doc.setCreationDate(fecha);
    doc.setFileId(await huellaHex(`${svg}|${hoja.nombre}|${fecha.toISOString()}`));
  }

  const elemento = aElementoSvg(svg);
  try {
    await svg2pdf(elemento, doc, { x: 0, y: 0, width: hoja.anchoMm, height: hoja.altoMm });
  } finally {
    elemento.remove();
  }

  return { bytes: doc.output('arraybuffer'), fuentes: registradas };
}

/** Identificador de archivo de 32 hexadecimales derivado del contenido. */
async function huellaHex(texto) {
  const datos = new TextEncoder().encode(texto);
  const resumen = new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
  return [...resumen.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Convierte la cadena SVG en un elemento del documento.
 *
 * Tiene que estar DENTRO del documento —no basta con crearlo suelto— porque svg2pdf
 * consulta getBBox() y getComputedTextLength(), que sólo devuelven medidas reales si
 * el navegador ha maquetado el elemento. Se coloca fuera de la vista, pero visible
 * para el motor de maquetado: con display:none las medidas saldrían todas a cero.
 */
function aElementoSvg(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`El SVG compuesto no es válido: ${error.textContent.trim()}`);

  const elemento = document.importNode(doc.documentElement, true);
  const escondite = document.createElement('div');
  escondite.style.cssText = 'position:absolute;left:-20000px;top:0;width:0;height:0;overflow:hidden';
  escondite.appendChild(elemento);
  document.body.appendChild(escondite);
  elemento.remove = () => escondite.remove();
  return elemento;
}

/** Lector de tipografías para el navegador: devuelve el TTF en base64. */
export function lectorTtfNavegador(base = '/') {
  const cache = new Map();
  return async (archivo) => {
    if (cache.has(archivo)) return cache.get(archivo);
    const res = await fetch(`${base}fonts/${archivo}`);
    if (!res.ok) throw new Error(`No se pudo leer la tipografía ${archivo}: HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let binario = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      binario += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    const base64 = btoa(binario);
    cache.set(archivo, base64);
    return base64;
  };
}
