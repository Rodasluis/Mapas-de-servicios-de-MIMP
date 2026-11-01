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
    /**
     * ¿Choca con algo ya guardado?
     *
     * `ignorar` permite excluir una clase de rectángulos sin sacarlos del índice: los
     * rótulos del mapa pueden montarse sobre los grupos de íconos, pero ésos siguen
     * teniendo que bloquear a la leyenda y a los recuadros de zoom, así que no se
     * pueden quitar de aquí.
     */
    choca(rect, holguraMm = 0, ignorar = null) {
      const h = holguraMm;
      for (const k of cubosDe({
        x: rect.x - h, y: rect.y - h, ancho: rect.ancho + h * 2, alto: rect.alto + h * 2,
      })) {
        for (const otro of cubos.get(k) || []) {
          if (ignorar && ignorar(otro)) continue;
          if (!(rect.x + rect.ancho + h <= otro.x || otro.x + otro.ancho + h <= rect.x
            || rect.y + rect.alto + h <= otro.y || otro.y + otro.alto + h <= rect.y)) {
            return otro;
          }
        }
      }
      return null;
    },

    /**
     * Área total que un rectángulo comparte con los ya guardados que cumplan `filtro`.
     *
     * Sirve para elegir el MENOS malo cuando ninguna posición está libre: un rótulo que
     * pisa cuatro milímetros cuadrados de un ícono se lee, y uno que pisa cuarenta, no.
     */
    areaSolapada(rect, filtro = null) {
      let area = 0;
      const vistos = new Set();
      for (const k of cubosDe(rect)) {
        for (const otro of cubos.get(k) || []) {
          if (vistos.has(otro)) continue;
          vistos.add(otro);
          if (filtro && !filtro(otro)) continue;
          const dx = Math.min(rect.x + rect.ancho, otro.x + otro.ancho) - Math.max(rect.x, otro.x);
          const dy = Math.min(rect.y + rect.alto, otro.y + otro.alto) - Math.max(rect.y, otro.y);
          if (dx > 0 && dy > 0) area += dx * dy;
        }
      }
      return area;
    },

    /**
     * ¿Atraviesa el segmento alguno de los rectángulos guardados? Para las líneas que
     * unen un nombre con su unidad (etiquetas.js): una línea que cruza otro nombre o
     * un grupo de íconos no dice de quién es.
     */
    cruza(segmento, ignorar = null) {
      const r = {
        x: Math.min(segmento.x1, segmento.x2), y: Math.min(segmento.y1, segmento.y2),
        ancho: Math.abs(segmento.x2 - segmento.x1), alto: Math.abs(segmento.y2 - segmento.y1),
      };
      const vistos = new Set();
      for (const k of cubosDe(r)) {
        for (const otro of cubos.get(k) || []) {
          if (vistos.has(otro)) continue;
          vistos.add(otro);
          if (ignorar && ignorar(otro)) continue;
          if (segmentoCruzaRectangulo(segmento, otro)) return otro;
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
 * ¿Pasa el segmento por el INTERIOR del rectángulo? Recorte de Liang-Barsky contra el
 * rectángulo encogido un hilo (0,05 mm), para que tocar un borde —una línea que
 * termina justo en la caja de sus íconos— no cuente.
 */
export function segmentoCruzaRectangulo({ x1, y1, x2, y2 }, r) {
  const e = Math.min(0.05, r.ancho / 2, r.alto / 2);
  const xmin = r.x + e; const xmax = r.x + r.ancho - e;
  const ymin = r.y + e; const ymax = r.y + r.alto - e;
  const dx = x2 - x1; const dy = y2 - y1;
  let t0 = 0; let t1 = 1;
  for (const [p, q] of [[-dx, x1 - xmin], [dx, xmax - x1], [-dy, y1 - ymin], [dy, ymax - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}

/** ¿Se cruzan los dos segmentos? Sólo el cruce franco: tocarse por un extremo no cuenta. */
export function segmentosSeCruzan(a, b) {
  const lado = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = lado(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = lado(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = lado(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = lado(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
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
          // El nivel viaja con el solape para que quien comprueba pueda decidir si
          // ese par concreto está permitido, sin volver a buscar las cajas.
          nivelA: a.nivel || 'bloque',
          nivelB: b.nivel || 'bloque',
          areaMm2: Number((dx * dy).toFixed(2)),
        });
      }
    }
  }
  return solapes;
}
