/**
 * Dibujo de los íconos de servicio.
 *
 * El ícono es una insignia con forma de casa, rellena del color que iconos.json da al
 * tipo, con un pictograma blanco dentro y un contorno oscuro fino que lo separa del
 * coropletas —sin él, una insignia oscura sobre una provincia oscura desaparece.
 *
 * El tamaño se pide en milímetros REALES de impresión, no en proporción a la hoja: un
 * ícono de 4 mm mide 4 mm en A4 y en A0. Lo que cambia con la hoja es cuántos caben.
 */
import { el, grupo, num } from '../motor/svg.js';
import { INSIGNIA, GLIFOS, ICONOS } from './catalogo.js';

/** Lado de la caja de dibujo del catálogo. */
const CAJA = 100;

/** Por debajo de esto el pictograma deja de leerse y la insignia se vuelve un punto. */
export const TAMANO_MINIMO_MM = 3;

export { ICONOS, GLIFOS, INSIGNIA };

/** ¿Hay ícono para este tipo? */
export const tieneIcono = (tipo) => Boolean(ICONOS[tipo]);

/** Tipos del catálogo que no aparecen en los datos, y al revés. */
export function comprobarCobertura(tiposEnDatos) {
  const delCatalogo = new Set(Object.keys(ICONOS));
  return {
    sinIcono: tiposEnDatos.filter((t) => !delCatalogo.has(t)),
    sinUso: [...delCatalogo].filter((t) => !tiposEnDatos.includes(t)),
  };
}

/**
 * Dibuja un ícono centrado horizontalmente en `x`, con su base en `y`.
 *
 * Se ancla por la BASE y no por el centro porque una insignia con forma de casa
 * señala un punto con su parte inferior, igual que un alfiler: anclarla por el centro
 * la deja medio ícono desplazada respecto del lugar que representa.
 *
 * @param {object} opciones
 * @param {string} opciones.tipo       valor de `tipo` de centros.json
 * @param {number} opciones.x          milímetros
 * @param {number} opciones.y          milímetros, base de la insignia
 * @param {number} opciones.tamanoMm   altura de la insignia
 * @param {string} opciones.color      color del tipo, de iconos.json
 * @param {number} [opciones.contorno] grosor del contorno oscuro, en milímetros
 */
export function dibujarIcono({
  tipo, x, y, tamanoMm, color, contorno = 0.12, colorContorno = '#2a2a2a', id,
}) {
  const icono = ICONOS[tipo];
  if (!icono) throw new Error(`Sin ícono para el tipo «${tipo}». Añádelo a src/iconos/catalogo.js.`);
  const glifo = GLIFOS[icono.glifo];
  if (!glifo) throw new Error(`El tipo «${tipo}» apunta al glifo «${icono.glifo}», que no existe.`);

  const k = tamanoMm / CAJA;
  const piezas = [
    el('path', {
      d: INSIGNIA,
      fill: color,
      stroke: colorContorno,
      'stroke-width': num(contorno / k, 3),
      'stroke-linejoin': 'round',
    }),
  ];

  if (glifo.d) piezas.push(el('path', { d: glifo.d, fill: '#ffffff' }));
  for (const [x1, y1, x2, y2, grosor] of glifo.trazos || []) {
    piezas.push(el('line', {
      x1, y1, x2, y2, stroke: '#ffffff', 'stroke-width': grosor, 'stroke-linecap': 'round',
    }));
  }
  for (const [cx, cy, r, grosor] of glifo.circulos || []) {
    piezas.push(el('circle', {
      cx, cy, r, fill: 'none', stroke: '#ffffff', 'stroke-width': grosor,
    }));
  }

  return grupo({
    ...(id ? { id } : {}),
    transform: `translate(${num(x - tamanoMm / 2)} ${num(y - tamanoMm)}) scale(${num(k, 6)})`,
  }, piezas);
}

/** Proporción alto/ancho de la insignia: es cuadrada, pero queda explícito. */
export const PROPORCION = 1;
