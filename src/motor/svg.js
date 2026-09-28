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

/**
 * Resuelve `text-anchor` con las métricas del TTF, en vez de dejárselo al navegador.
 *
 * svg2pdf centra y alinea a la derecha midiendo el texto con `measureText` del
 * navegador, al cuerpo que lleve el SVG. Y este SVG va en milímetros: 10 pt son 3,53
 * unidades, así que el navegador mide a 3,53 px. A ese tamaño Chromium sobre Linux
 * devuelve los avances de cada glifo cuadriculados al píxel entero —las seis medidas
 * salen números redondos— y el ancho se desvía hasta un 24 %. El texto centrado sale
 * corrido, y cuánto depende de la configuración de renderizado del anfitrión.
 *
 * Así que el ancla no se delega: se calcula aquí la `x` ya desplazada y se emite el
 * texto con el ancla por omisión, `start`, que es el único caso en el que svg2pdf no
 * mide nada (getTextOffset devuelve 0 y se va). Con eso el PDF deja de depender del
 * anfitrión, y de paso el centrado pasa a ser exacto: jsPDF DIBUJA el texto con las
 * métricas del TTF incrustado, luego medir el ancla con esas mismas métricas es lo
 * que centra de verdad. Midiéndolo con el navegador quedaba un descentrado pequeño
 * —un 0,22 % del ancho en Windows— por el interletraje que el navegador aplica al
 * medir y jsPDF no aplica al componer.
 *
 * La `x` de un texto girado se desplaza igual, porque el `transform` ya se compuso con
 * la `x` original y sigue girando alrededor del mismo punto.
 *
 * @param {string} contenido
 * @param {object} atributos  con `x` y, si procede, `text-anchor`
 * @param {object} medida     {medidor, estilo} — estilo es {familia, variante, pt}
 */
export function anclar(contenido, atributos, { medidor, estilo }) {
  const ancla = atributos['text-anchor'];
  if (!ancla || ancla === 'start') return atributos;
  const ancho = medidor.ancho(contenido, estilo);
  const { 'text-anchor': _, ...resto } = atributos;
  /* Sin `x` el ancla era el origen, que es lo que vale 0: así un texto sin x sigue
     saliendo donde salía. */
  const x = Number(atributos.x) || 0;
  return { ...resto, x: x - (ancla === 'middle' ? ancho / 2 : ancho) };
}

/**
 * Elemento `<text>`.
 *
 * Con `medida` —{medidor, estilo}— el ancla se resuelve aquí con las métricas del TTF;
 * es obligatorio pasarla siempre que los atributos lleven `text-anchor`, porque si no
 * el ancla la resolvería el navegador. Ver anclar().
 */
export const texto = (contenido, atributos, medida) => el(
  'text',
  medida ? anclar(contenido, atributos, medida) : atributos,
  escapar(contenido),
);

/**
 * Texto con halo, dibujado en DOS pasadas: primero el contorno grueso del color del
 * halo y encima el texto relleno.
 *
 * No se usa `paint-order: stroke`, que es la forma corta de pedir lo mismo, porque
 * svg2pdf no lo interpreta: pinta el relleno y luego el trazo encima, de modo que un
 * halo blanco BORRA la letra en el PDF aunque en pantalla se vea bien. Con dos
 * elementos el orden es explícito y sale igual en los dos medios.
 */
export function textoConHalo(contenido, atributos, opciones = {}) {
  const { colorHalo = '#ffffff', grosorMm = 0, medidor, estilo } = opciones;
  /* El ancla se resuelve UNA vez, para que el contorno y el relleno caigan en la misma
     x: si cada pasada la midiera por su cuenta, un redondeo distinto abriría un borde
     de halo grueso a un lado y ninguno al otro. */
  const anclados = medidor ? anclar(contenido, atributos, { medidor, estilo }) : atributos;
  if (!(grosorMm > 0)) return texto(contenido, anclados);
  const contorno = { ...anclados };
  delete contorno.fill;
  return grupo({}, [
    texto(contenido, {
      ...contorno,
      fill: 'none',
      stroke: colorHalo,
      'stroke-width': grosorMm,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
    texto(contenido, anclados),
  ]);
}

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
