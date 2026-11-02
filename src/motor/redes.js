/**
 * Ríos y vías (Fase 23): qué se dibuja a cada escala.
 *
 * Las dos redes son oficiales y finas —la de la ANA viene de la cartografía 1:100 000 y
 * la del MTC del levantamiento de cada tramo—, así que el problema no es la precisión
 * sino la densidad: 1 224 ríos y 11 000 tramos de vía en un A3 del Perú son una maraña
 * que tapa el color del mapa. Como en cualquier mapa de referencia, cada escala muestra
 * sólo lo que a esa escala se lee, y lo decide el denominador, no el ámbito: un Perú en
 * A0 (1:2 millones) admite lo mismo que un departamento en A4.
 *
 * Este módulo lo usan el build (scripts/build-capas.mjs), para no publicar en cada nivel
 * de detalle lo que a sus escalas nunca se dibuja, y el motor, para elegir qué dibuja.
 */

/**
 * Importancia de un río, de 1 a 4. La ANA no la publica: se deduce de la longitud del
 * río entero —sus tramos del mismo nombre unidos por sus extremos— en el build.
 *  1 · 300 km o más (Marañón, Ucayali, Apurímac, Mantaro…)
 *  2 · de 100 a 300 km (Ene, Perené, Pachitea…)
 *  3 · los demás ríos
 *  4 · las quebradas
 */
export const LONGITUD_RANGO_KM = [300, 100];

/** Denominador por debajo del cual se dibuja cada rango de río y cada red vial. */
export const UMBRALES = {
  rio: { 1: Infinity, 2: 6_000_000, 3: 2_500_000, 4: 900_000 },
  via: { nacional: Infinity, departamental: 3_000_000 },
};

/** ¿Se dibuja este río o esta vía a la escala 1:denominador? */
export function visibleA(propiedades, denominador) {
  if (propiedades.capa === 'rio') return denominador < (UMBRALES.rio[propiedades.rango] ?? 0);
  if (propiedades.capa === 'via') return denominador < (UMBRALES.via[propiedades.red] ?? 0);
  return false;
}
