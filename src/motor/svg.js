/**
 * Constructor de SVG como cadena de texto.
 *
 * Se compone texto en vez de manipular el DOM para que el MISMO código sirva en el
 * navegador y en Node: así la vista previa de la interfaz y las muestras de línea de
 * órdenes salen del mismo sitio y no pueden divergir. El navegador sólo tiene que
 * convertir la cadena en un elemento cuando llega el momento de exportar.
 *
 * Los números se redondean a una precisión fija; sin ello, el mismo mapa generado dos
 * veces podría diferir en el último decimal y romper la comparación de regresión.
 */

/** Decimales de las coordenadas: 3 → micra de papel, muy por debajo de la imprenta. */
export const DECIMALES = 3;

export function num(v, decimales = DECIMALES) {
  if (!Number.isFinite(v)) return '0';
  const r = Number(v.toFixed(decimales));
  return Object.is(r, -0) ? '0' : String(r);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/**
 * Crea un elemento SVG.
 * @param {string} nombre
 * @param {object} atributos  los valores null/undefined/false se omiten
 * @param {string|string[]} [hijos]  ya serializados
 */
export function el(nombre, atributos = {}, hijos) {
  const attrs = Object.entries(atributos)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => `${k}="${escapar(typeof v === 'number' ? num(v) : v)}"`)
    .join(' ');
  const cabeza = attrs ? `<${nombre} ${attrs}` : `<${nombre}`;
  const cuerpo = Array.isArray(hijos) ? hijos.filter(Boolean).join('') : hijos;
  return cuerpo ? `${cabeza}>${cuerpo}</${nombre}>` : `${cabeza}/>`;
}

export const grupo = (atributos, hijos) => el('g', atributos, hijos);

export const texto = (contenido, atributos) => el('text', atributos, escapar(contenido));

/**
 * Documento SVG de una hoja completa.
 *
 * El viewBox va en milímetros y el ancho y alto se declaran con la unidad «mm», de
 * modo que una unidad de usuario es un milímetro: un `stroke-width` de 0,3 son 0,3 mm
 * impresos, sin factores de conversión que se puedan colar mal.
 */
export function documento(hoja, contenido, { defs = '' } = {}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
    + ` width="${num(hoja.anchoMm)}mm" height="${num(hoja.altoMm)}mm"`
    + ` viewBox="0 0 ${num(hoja.anchoMm)} ${num(hoja.altoMm)}">`,
    defs ? `<defs>${defs}</defs>` : '',
    contenido,
    '</svg>',
  ].filter(Boolean).join('\n');
}

/** Rectángulo a partir de {x, y, ancho, alto}. */
export const rect = (r, atributos = {}) => el('rect', {
  x: r.x, y: r.y, width: r.ancho, height: r.alto, ...atributos,
});
