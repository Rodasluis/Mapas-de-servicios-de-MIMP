/**
 * Proyección, encaje del ámbito y escala real del impreso.
 *
 * Se usa Mercator transversa con meridiano central en 75° O, que es el eje del huso
 * UTM 18S (EPSG:32718), el de referencia para el Perú. Es conforme —conserva los
 * ángulos y, localmente, las formas—, que es lo que se espera de un mapa de servicios;
 * a cambio la escala crece al alejarse del meridiano central, así que la escala que se
 * imprime se mide en el CENTRO del marco y se informa de cuánto varía en los bordes.
 */
import { geoTransverseMercator, geoDistance, geoPath } from 'd3-geo';

/** Radio medio terrestre en metros (esfera de referencia de d3). */
export const RADIO_TERRESTRE_M = 6371008.8;

/** Meridiano central del huso 18S, en el que se apoya el dibujo. */
export const MERIDIANO_CENTRAL = -75;

/**
 * Crea la proyección encajada en el marco del mapa.
 *
 * `fitExtent` respeta la proporción del ámbito: lo amplía hasta que toca el lado más
 * estrecho del marco y lo centra en el otro, de modo que nunca se deforma.
 *
 * @param {object} ambito     objeto GeoJSON que debe caber entero
 * @param {object} marco      {x, y, ancho, alto} en milímetros
 * @param {number} [holguraMm] margen interior entre el ámbito y el borde del marco
 */
export function crearProyeccion(ambito, marco, holguraMm = 0) {
  const proyeccion = geoTransverseMercator().rotate([-MERIDIANO_CENTRAL, 0]);
  proyeccion.fitExtent(
    [
      [marco.x + holguraMm, marco.y + holguraMm],
      [marco.x + marco.ancho - holguraMm, marco.y + marco.alto - holguraMm],
    ],
    ambito,
  );
  return proyeccion;
}

/**
 * Mide la escala del impreso comparando una distancia sobre el terreno con la que
 * ocupa en el papel. Se mide, en vez de deducirse de `projection.scale()`, porque así
 * el número que se imprime sale del mismo dibujo que se imprime.
 *
 * @returns {{denominador: number, texto: string, variacionPct: number}}
 */
export function medirEscala(proyeccion, marco) {
  const centro = proyeccion.invert([marco.x + marco.ancho / 2, marco.y + marco.alto / 2]);
  const denominador = denominadorEn(proyeccion, centro);

  /* La Mercator transversa estira el dibujo al alejarse del meridiano central. Se
     comprueba en las cuatro esquinas para poder advertir si la variación es grande. */
  const esquinas = [
    [marco.x, marco.y], [marco.x + marco.ancho, marco.y],
    [marco.x, marco.y + marco.alto], [marco.x + marco.ancho, marco.y + marco.alto],
  ].map((p) => proyeccion.invert(p)).filter(Boolean);
  const denominadores = esquinas.map((p) => denominadorEn(proyeccion, p));
  const min = Math.min(denominador, ...denominadores);
  const max = Math.max(denominador, ...denominadores);

  return {
    denominador,
    texto: `1:${Math.round(denominador).toLocaleString('es-PE')}`,
    centro,
    variacionPct: ((max - min) / denominador) * 100,
  };
}

/** Denominador de escala en un punto: metros de terreno por milímetro de papel × 1000. */
function denominadorEn(proyeccion, [lon, lat]) {
  const paso = 0.005; // grados; pequeño frente al mapa y grande frente al redondeo
  const a = [lon, lat];
  const b = [lon, lat + paso];
  const pa = proyeccion(a);
  const pb = proyeccion(b);
  if (!pa || !pb) return NaN;
  const papelMm = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const terrenoM = geoDistance(a, b) * RADIO_TERRESTRE_M;
  return (terrenoM * 1000) / papelMm;
}

/**
 * Elige el nivel de detalle geométrico más barato que aún es indistinguible a esta
 * escala. `denominadorMinimo` de cada nivel viene calculado en el build a partir de
 * su tolerancia sobre el terreno y del trazo mínimo visible en papel.
 */
export function nivelPara(denominador, niveles) {
  const candidatos = Object.entries(niveles)
    .filter(([, n]) => denominador >= n.denominadorMinimo)
    .sort((a, b) => b[1].toleranciaM - a[1].toleranciaM);
  if (candidatos.length) return candidatos[0][0];
  // Mapa más detallado de lo que cubre cualquier nivel: se da el más fino que haya.
  return Object.entries(niveles).sort((a, b) => a[1].toleranciaM - b[1].toleranciaM)[0][0];
}

/** Generador de rutas SVG en milímetros, con la precisión justa para no inflar el archivo. */
export function crearRuta(proyeccion, decimales = 3) {
  return geoPath(proyeccion).digits(decimales);
}

/** Caja envolvente del ámbito ya proyectada, en milímetros. */
export function cajaProyectada(proyeccion, ambito) {
  return geoPath(proyeccion).bounds(ambito);
}
