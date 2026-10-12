/**
 * Dibujo de los íconos de servicio, en cualquiera de los estilos de estilos.js.
 *
 * El tamaño se pide en milímetros REALES de impresión, no en proporción a la hoja: un
 * ícono de 4 mm mide 4 mm en A4 y en A0. Lo que cambia con la hoja es cuántos caben.
 *
 * Todas las funciones de dibujo reciben la CAJA del ícono —centro horizontal y base—,
 * sea cual sea el estilo; así los grupos de íconos, la leyenda y la hoja de íconos no
 * tienen que saber qué estilo se usa. Lo único que cambia con el estilo es dónde cae
 * esa caja cuando el ícono marca un punto del mapa: la casa señala el punto con su
 * base, como un alfiler, y el círculo se centra en él. Para eso está cajaEnPunto().
 */
import { el, grupo, num } from '../motor/svg.js';
import { ICONOS } from './catalogo.js';
import { ESTILOS, ESTILO_POR_DEFECTO } from './estilos.js';

/** Lado de la caja de dibujo de estilos.js. */
const CAJA = 100;

/** Por debajo de esto el pictograma deja de leerse y la insignia se vuelve un punto. */
export const TAMANO_MINIMO_MM = 3;

/**
 * Grosor mínimo de un trazo impreso. Los grosores del diseño son proporcionales al
 * ícono y a 3 mm el contorno de la casa bajaría a 0,06 mm, que una imprenta offset no
 * garantiza.
 */
const TRAZO_MINIMO_MM = 0.1;

export { ICONOS, ESTILOS, ESTILO_POR_DEFECTO };

/** El estilo pedido, o el de por defecto si no existe. */
export const estiloDe = (nombre) => ESTILOS[nombre] || ESTILOS[ESTILO_POR_DEFECTO];

/** Nombres de los estilos disponibles, en el orden en que se ofrecen. */
export const NOMBRES_ESTILO = Object.keys(ESTILOS);

/** ¿Hay ícono para este tipo en todos los estilos? */
export const tieneIcono = (tipo) => Boolean(ICONOS[tipo])
  && NOMBRES_ESTILO.every((e) => ESTILOS[e].iconos[tipo]);

/** Tipos del catálogo que no aparecen en los datos, y al revés. */
export function comprobarCobertura(tiposEnDatos) {
  const delCatalogo = new Set(Object.keys(ICONOS));
  return {
    sinIcono: tiposEnDatos.filter((t) => !tieneIcono(t)),
    sinUso: [...delCatalogo].filter((t) => !tiposEnDatos.includes(t)),
  };
}

/**
 * Base de la caja de un ícono que marca el punto (x, y): el punto mismo para la casa,
 * medio ícono por debajo para el círculo.
 */
export function cajaEnPunto(estilo, y, tamanoMm) {
  return estiloDe(estilo).anclaje === 'centro' ? y + tamanoMm / 2 : y;
}

/**
 * Dibuja un ícono en la caja centrada horizontalmente en `x` y con su base en `y`.
 *
 * @param {object} opciones
 * @param {string} opciones.tipo       valor de `tipo` de centros.json
 * @param {number} opciones.x          milímetros, centro horizontal de la caja
 * @param {number} opciones.y          milímetros, base de la caja
 * @param {number} opciones.tamanoMm   lado de la caja
 * @param {string} [opciones.estilo]   'casa' o 'circulo'
 */
export function dibujarIcono({
  tipo, x, y, tamanoMm, estilo = ESTILO_POR_DEFECTO, id,
}) {
  const icono = estiloDe(estilo).iconos[tipo];
  if (!icono) throw new Error(`Sin ícono para el tipo «${tipo}» en el estilo «${estilo}». Añádelo a src/iconos/estilos.js.`);

  const k = tamanoMm / CAJA;
  const pinta = (valor) => (valor === 'color' ? icono.color : valor);
  const piezas = icono.trazos.map((t) => el('path', {
    d: t.d,
    fill: t.relleno ? pinta(t.relleno) : 'none',
    ...(t.trazo ? {
      stroke: pinta(t.trazo),
      'stroke-width': num(Math.max(t.grosor, TRAZO_MINIMO_MM / k), 3),
      ...(t.remate ? { 'stroke-linecap': t.remate } : {}),
      ...(t.union ? { 'stroke-linejoin': t.union } : {}),
    } : {}),
    ...(t.parImpar ? { 'fill-rule': 'evenodd' } : {}),
  }));

  return grupo({
    ...(id ? { id } : {}),
    transform: `translate(${num(x - tamanoMm / 2)} ${num(y - tamanoMm)}) scale(${num(k, 6)})`,
  }, piezas);
}
