/**
 * Índice de rectángulos para detectar choques entre rótulos.
 *
 * ¿Por qué no basta la rejilla de ocupación? Porque su celda mide 2 mm y eso sirve
 * para decidir si un bloque grande cabe en una esquina, pero no para garantizar que
 * dos rótulos NO se tocan: dos cajas separadas por medio milímetro caen en la misma
 * celda y la rejilla las da por superpuestas, y dos que se solapan 1 mm pueden caer en
 * celdas distintas y darse por libres. La Fase 4 exige cero superposiciones
 * comprobadas geométricamente, así que aquí se guardan los rectángulos EXACTOS.
 *
 * El índice reparte los rectángulos en cubos para no comparar cada candidato con todos
 * los colocados: en un ámbito distrital habrá cientos de rótulos y la comparación
 * ingenua crece con el cuadrado.
 */

/** Lado del cubo. Un poco mayor que un rótulo típico, para que cada uno toque pocos. */
const CUBO_MM = 12;

export function crearIndice() {
  const cubos = new Map();
  const todos = [];

  const clave = (cx, cy) => `${cx},${cy}`;
  const cubosDe = (r) => {
    const c0 = Math.floor(r.x / CUBO_MM);
    const c1 = Math.floor((r.x + r.ancho) / CUBO_MM);
    const f0 = Math.floor(r.y / CUBO_MM);
    const f1 = Math.floor((r.y + r.alto) / CUBO_MM);
    const salida = [];
    for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) salida.push(clave(c, f));
    return salida;
  };

  return {
    /** @param {object} rect {x, y, ancho, alto} y lo que se quiera arrastrar */
    agregar(rect) {
      todos.push(rect);
      for (const k of cubosDe(rect)) {
        if (!cubos.has(k)) cubos.set(k, []);
        cubos.get(k).push(rect);
      }
      return rect;
    },

    /**
     * ¿Choca con algo ya guardado? `holguraMm` separa además los rótulos entre sí:
     * dos cajas que se tocan justo en el borde son legales pero ilegibles.
     */
    choca(rect, holguraMm = 0) {
      const h = holguraMm;
      for (const k of cubosDe({
        x: rect.x - h, y: rect.y - h, ancho: rect.ancho + h * 2, alto: rect.alto + h * 2,
      })) {
        for (const otro of cubos.get(k) || []) {
          if (!(rect.x + rect.ancho + h <= otro.x || otro.x + otro.ancho + h <= rect.x
            || rect.y + rect.alto + h <= otro.y || otro.y + otro.alto + h <= rect.y)) {
            return otro;
          }
        }
      }
      return null;
    },

    /** Todos los rectángulos guardados, para el informe y las comprobaciones. */
    lista: () => todos,
    tamano: () => todos.length,
  };
}

/**
 * Comprueba a posteriori que ningún par de rectángulos se solapa.
 * Es la comprobación geométrica que pide el criterio de aceptación: no se fía del
 * índice, recorre todos los pares.
 */
export function buscarSolapes(rectangulos, holguraMm = 0) {
  const solapes = [];
  for (let i = 0; i < rectangulos.length; i++) {
    for (let j = i + 1; j < rectangulos.length; j++) {
      const a = rectangulos[i];
      const b = rectangulos[j];
      const dx = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
      if (dx > holguraMm && dy > holguraMm) {
        solapes.push({
          a: a.etiqueta || a.id || 'sin nombre',
          b: b.etiqueta || b.id || 'sin nombre',
          areaMm2: Number((dx * dy).toFixed(2)),
        });
      }
    }
  }
  return solapes;
}
