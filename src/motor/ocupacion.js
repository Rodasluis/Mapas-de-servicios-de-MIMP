/**
 * Mapa de ocupación de la hoja: qué partes están pintadas y cuáles quedan libres.
 *
 * El layout de un mapa como el de referencia no coloca los bloques en los márgenes:
 * los mete DENTRO del marco, encima del océano o de los países vecinos, porque ahí no
 * tapan nada que el lector necesite. Para poder hacerlo automáticamente en cualquier
 * hoja y orientación hace falta saber, para un rectángulo dado, cuánto territorio
 * peruano cubriría y si pisa algo ya colocado.
 *
 * Se resuelve con una rejilla de celdas de pocos milímetros. Es aproximada por
 * definición, pero el error es de media celda y las decisiones que toma —«¿cabe la
 * leyenda en esta esquina?»— se juegan en centímetros.
 *
 * La misma rejilla la reutilizará el motor de rótulos de la Fase 4.
 */

/** Lado de la celda. 2 mm son ~0,1 % de una hoja A0 y bastan para decidir un bloque. */
export const CELDA_MM = 2;

export function crearOcupacion(anchoMm, altoMm, celdaMm = CELDA_MM) {
  const cols = Math.ceil(anchoMm / celdaMm);
  const filas = Math.ceil(altoMm / celdaMm);
  /* Capas separadas: el territorio no se puede tapar pero tampoco «se ocupa», y los
     bloques ya colocados son excluyentes entre sí. Mezclarlas impediría, por ejemplo,
     poner la rosa de los vientos sobre el mar al lado de la escala. */
  const territorio = new Uint8Array(cols * filas);
  const bloques = new Uint8Array(cols * filas);
  /* Toda la tierra, incluidos los países vecinos. Los rótulos de agua («OCÉANO
     PACÍFICO», el nombre del lago) tienen que caer en agua, y para eso no basta con
     esquivar el Perú. En cambio los bloques del layout SÍ pueden ir sobre un vecino,
     así que las dos cosas no pueden compartir capa. */
  const tierra = new Uint8Array(cols * filas);

  const indice = (c, f) => f * cols + c;
  const aCol = (x) => Math.floor(x / celdaMm);
  const aFila = (y) => Math.floor(y / celdaMm);

  /** Relleno por barrido con regla par-impar, la correcta para anillos GeoJSON. */
  function rellenar(anillos, capa) {
    const bordes = [];
    for (const anillo of anillos) {
      for (let i = 0; i + 1 < anillo.length; i++) {
        const [x1, y1] = anillo[i];
        const [x2, y2] = anillo[i + 1];
        if (y1 !== y2) bordes.push([x1, y1, x2, y2]);
      }
    }
    if (!bordes.length) return;
    for (let f = 0; f < filas; f++) {
      const y = (f + 0.5) * celdaMm;
      const cortes = [];
      for (const [x1, y1, x2, y2] of bordes) {
        if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
          cortes.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      if (cortes.length < 2) continue;
      cortes.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cortes.length; k += 2) {
        const c0 = Math.max(0, aCol(cortes[k]));
        const c1 = Math.min(cols - 1, aCol(cortes[k + 1]));
        for (let c = c0; c <= c1; c++) capa[indice(c, f)] = 1;
      }
    }
  }

  const recorrer = (rect, fn) => {
    const c0 = Math.max(0, aCol(rect.x));
    const c1 = Math.min(cols - 1, aCol(rect.x + rect.ancho));
    const f0 = Math.max(0, aFila(rect.y));
    const f1 = Math.min(filas - 1, aFila(rect.y + rect.alto));
    for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) fn(indice(c, f));
  };

  return {
    cols,
    filas,
    celdaMm,

    /** Marca un rectángulo como ocupado por un bloque del layout. */
    marcarBloque(rect) { recorrer(rect, (i) => { bloques[i] = 1; }); },

    /**
     * Marca polígonos (ya proyectados a milímetros) como territorio.
     * Relleno por barrido con regla par-impar, que es la correcta para anillos
     * GeoJSON: los agujeros van dentro del anillo exterior.
     */
    marcarTerritorio(anillos) { rellenar(anillos, territorio); },

    /** Marca tierra (Perú y vecinos) para decidir dónde caben los rótulos de agua. */
    marcarTierra(anillos) { rellenar(anillos, tierra); },

    /** Fracción del rectángulo que cae sobre tierra de cualquier país (0 a 1). */
    sobreTierra(rect) {
      let total = 0; let dentro = 0;
      recorrer(rect, (i) => { total++; if (tierra[i]) dentro++; });
      return total ? dentro / total : 0;
    },

    /** Fracción del rectángulo que cae sobre territorio (0 a 1). */
    sobreTerritorio(rect) {
      let total = 0; let dentro = 0;
      recorrer(rect, (i) => { total++; if (territorio[i]) dentro++; });
      return total ? dentro / total : 0;
    },

    /** ¿Choca con algún bloque ya colocado? */
    chocaConBloque(rect) {
      let choca = false;
      recorrer(rect, (i) => { if (bloques[i]) choca = true; });
      return choca;
    },

    /** Copia del estado, para probar una disposición sin ensuciar la buena. */
    clonar() {
      const otra = crearOcupacion(anchoMm, altoMm, celdaMm);
      otra.__cargar(territorio, bloques, tierra);
      return otra;
    },
    __cargar(t, b, l) { territorio.set(t); bloques.set(b); tierra.set(l); },
  };
}

/**
 * Contexto de dibujo para d3-geo que, en vez de pintar, recoge los anillos ya
 * proyectados. Es la forma de obtener la geometría en milímetros sin volver a
 * interpretar la cadena `d` del SVG.
 */
export function recolectorDeAnillos() {
  const anillos = [];
  let actual = null;
  return {
    anillos,
    beginPath() { },
    moveTo(x, y) { actual = [[x, y]]; anillos.push(actual); },
    lineTo(x, y) { if (actual) actual.push([x, y]); },
    closePath() { if (actual && actual.length) actual.push([actual[0][0], actual[0][1]]); },
    arc() { },
  };
}

/** Rectángulos: utilidades que también usará el motor de rótulos. */
export const rectangulo = {
  seSolapan(a, b, holgura = 0) {
    return !(a.x + a.ancho + holgura <= b.x
      || b.x + b.ancho + holgura <= a.x
      || a.y + a.alto + holgura <= b.y
      || b.y + b.alto + holgura <= a.y);
  },
  contiene(contenedor, r) {
    return r.x >= contenedor.x && r.y >= contenedor.y
      && r.x + r.ancho <= contenedor.x + contenedor.ancho
      && r.y + r.alto <= contenedor.y + contenedor.alto;
  },
  expandir(r, m) {
    return { x: r.x - m, y: r.y - m, ancho: r.ancho + m * 2, alto: r.alto + m * 2 };
  },
};

/**
 * Polo de inaccesibilidad: el punto interior más alejado del borde del polígono.
 *
 * Es dónde hay que poner el rótulo de un territorio. El centroide no sirve: en una
 * forma cóncava —Loreto, la provincia de Lima, casi cualquier país recortado por el
 * marco— cae fuera del propio polígono, y el rótulo acabaría flotando sobre el vecino.
 *
 * Se resuelve sobre una rejilla, con una transformada de distancia de dos pasadas: se
 * marca el interior, se propaga la distancia al exterior de arriba abajo y de abajo
 * arriba, y se elige el máximo. El resultado tiene la precisión de la celda, que para
 * colocar un rótulo sobra.
 *
 * @param {Array} anillos  anillos ya proyectados a milímetros
 * @param {object} caja    región donde buscar, en milímetros
 * @returns {{x, y, radioMm}|null}
 */
export function poloDeInaccesibilidad(anillos, caja, celdaMm = 1.5) {
  const cols = Math.max(1, Math.ceil(caja.ancho / celdaMm));
  const filas = Math.max(1, Math.ceil(caja.alto / celdaMm));
  const dentro = new Uint8Array(cols * filas);

  const bordes = [];
  for (const anillo of anillos) {
    for (let i = 0; i + 1 < anillo.length; i++) {
      const [x1, y1] = anillo[i];
      const [x2, y2] = anillo[i + 1];
      if (y1 !== y2) bordes.push([x1, y1, x2, y2]);
    }
  }
  if (!bordes.length) return null;

  for (let f = 0; f < filas; f++) {
    const y = caja.y + (f + 0.5) * celdaMm;
    const cortes = [];
    for (const [x1, y1, x2, y2] of bordes) {
      if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
        cortes.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (cortes.length < 2) continue;
    cortes.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((cortes[k] - caja.x) / celdaMm - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((cortes[k + 1] - caja.x) / celdaMm - 0.5));
      for (let c = c0; c <= c1; c++) dentro[f * cols + c] = 1;
    }
  }

  const GRANDE = 1e6;
  const dist = new Float32Array(cols * filas);
  for (let i = 0; i < dist.length; i++) dist[i] = dentro[i] ? GRANDE : 0;

  const paso = (c, f, dc, df, coste) => {
    const cc = c + dc; const ff = f + df;
    if (cc < 0 || ff < 0 || cc >= cols || ff >= filas) return 0;
    return dist[ff * cols + cc] + coste;
  };
  const D = 1; const DIAG = Math.SQRT2;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      const i = f * cols + c;
      if (!dentro[i]) continue;
      dist[i] = Math.min(dist[i], paso(c, f, -1, 0, D), paso(c, f, 0, -1, D),
        paso(c, f, -1, -1, DIAG), paso(c, f, 1, -1, DIAG));
    }
  }
  let mejor = null;
  for (let f = filas - 1; f >= 0; f--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = f * cols + c;
      if (!dentro[i]) continue;
      dist[i] = Math.min(dist[i], paso(c, f, 1, 0, D), paso(c, f, 0, 1, D),
        paso(c, f, 1, 1, DIAG), paso(c, f, -1, 1, DIAG));
      if (!mejor || dist[i] > mejor.d) mejor = { c, f, d: dist[i] };
    }
  }
  if (!mejor || mejor.d <= 0) return null;
  return {
    x: caja.x + (mejor.c + 0.5) * celdaMm,
    y: caja.y + (mejor.f + 0.5) * celdaMm,
    radioMm: mejor.d * celdaMm,
  };
}
