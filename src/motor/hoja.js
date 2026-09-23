/**
 * Modelo de hoja: tamaño, orientación y márgenes.
 *
 * Todo se mide en MILÍMETROS, que es la unidad en la que se piensa un impreso. El
 * SVG que compone el motor usa esas mismas unidades (viewBox de la hoja completa),
 * así que un grosor de 0,3 en el SVG son 0,3 mm en papel, sin conversiones por medio.
 * A puntos sólo se pasa al escribir el PDF.
 */

/** Series ISO 216, lado corto × lado largo en milímetros. */
export const TAMANOS = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

export const ORIENTACIONES = ['vertical', 'horizontal'];

/** Margen por defecto: suficiente para que ninguna imprenta se coma contenido. */
export const MARGEN_POR_DEFECTO_MM = 10;

/**
 * Construye una hoja.
 *
 * @param {object} opciones
 * @param {string} opciones.tamano        'A4'…'A0' o 'personalizado'
 * @param {string} opciones.orientacion   'vertical' | 'horizontal'
 * @param {number} [opciones.anchoMm]     sólo para 'personalizado'
 * @param {number} [opciones.altoMm]      sólo para 'personalizado'
 * @param {number|object} [opciones.margenMm]  número o {arriba, derecha, abajo, izquierda}
 */
export function crearHoja({
  tamano = 'A4',
  orientacion = 'vertical',
  anchoMm,
  altoMm,
  margenMm = MARGEN_POR_DEFECTO_MM,
} = {}) {
  if (!ORIENTACIONES.includes(orientacion)) {
    throw new Error(`Orientación desconocida: «${orientacion}». Usa ${ORIENTACIONES.join(' o ')}.`);
  }

  let corto;
  let largo;
  if (tamano === 'personalizado') {
    if (!(anchoMm > 0) || !(altoMm > 0)) {
      throw new Error('Un tamaño personalizado necesita anchoMm y altoMm mayores que cero.');
    }
    // En personalizado manda lo que pide el usuario; la orientación ya está implícita.
    [corto, largo] = anchoMm <= altoMm ? [anchoMm, altoMm] : [altoMm, anchoMm];
  } else {
    const medida = TAMANOS[tamano];
    if (!medida) {
      throw new Error(`Tamaño desconocido: «${tamano}». Disponibles: ${Object.keys(TAMANOS).join(', ')}, personalizado.`);
    }
    [corto, largo] = medida;
  }

  const vertical = tamano === 'personalizado'
    ? altoMm >= anchoMm
    : orientacion === 'vertical';
  const ancho = vertical ? corto : largo;
  const alto = vertical ? largo : corto;

  const margen = normalizarMargen(margenMm);
  const util = {
    x: margen.izquierda,
    y: margen.arriba,
    ancho: ancho - margen.izquierda - margen.derecha,
    alto: alto - margen.arriba - margen.abajo,
  };
  if (util.ancho <= 0 || util.alto <= 0) {
    throw new Error('Los márgenes no dejan superficie útil en la hoja.');
  }

  return {
    tamano,
    orientacion: vertical ? 'vertical' : 'horizontal',
    anchoMm: ancho,
    altoMm: alto,
    margen,
    /** Zona imprimible, dentro de los márgenes. */
    util,
    /** Diagonal, útil para decidir cuerpos de texto relativos si hiciera falta. */
    diagonalMm: Math.hypot(ancho, alto),
    nombre: tamano === 'personalizado'
      ? `${redondear(ancho)}×${redondear(alto)} mm`
      : `${tamano} ${vertical ? 'vertical' : 'horizontal'}`,
  };
}

function normalizarMargen(m) {
  if (typeof m === 'number') return { arriba: m, derecha: m, abajo: m, izquierda: m };
  const { arriba = MARGEN_POR_DEFECTO_MM, derecha = MARGEN_POR_DEFECTO_MM,
    abajo = MARGEN_POR_DEFECTO_MM, izquierda = MARGEN_POR_DEFECTO_MM } = m || {};
  return { arriba, derecha, abajo, izquierda };
}

const redondear = (v) => Math.round(v * 10) / 10;

/**
 * Reparte la zona útil entre el mapa y los bloques del layout.
 *
 * En la Fase 1 el mapa ocupa todo lo imprimible; la Fase 2 recortará de aquí el
 * espacio del bloque institucional, la leyenda y el pie. Se define ya como función
 * aparte para que ese cambio no toque el motor de dibujo.
 */
export function marcoDelMapa(hoja, reservas = {}) {
  const { arriba = 0, derecha = 0, abajo = 0, izquierda = 0 } = reservas;
  const marco = {
    x: hoja.util.x + izquierda,
    y: hoja.util.y + arriba,
    ancho: hoja.util.ancho - izquierda - derecha,
    alto: hoja.util.alto - arriba - abajo,
  };
  if (marco.ancho <= 0 || marco.alto <= 0) {
    throw new Error('Las reservas del layout no dejan sitio para el mapa.');
  }
  return marco;
}
