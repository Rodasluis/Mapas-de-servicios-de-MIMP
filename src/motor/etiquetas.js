/**
 * Motor de rótulos del mapa.
 *
 * El problema no es escribir nombres: es decidir cuáles caben. En un mapa nacional hay
 * 25 departamentos y 196 provincias, y en A4 no entran ni la mitad sin pisarse entre
 * sí ni tapar los símbolos. Un mapa con rótulos superpuestos es ilegible, y uno que
 * los omita en silencio es engañoso, así que este módulo coloca lo que cabe POR
 * PRIORIDAD y deja constancia de lo que no.
 *
 * Cómo decide:
 *
 *  1. Las solicitudes se ordenan por nivel (departamento antes que provincia) y, a
 *     igualdad, por un criterio estable —superficie y ubigeo— para que dos ejecuciones
 *     den el mismo mapa. No hay azar: la Fase 8 compara PDF contra PDF.
 *  2. Cada rótulo prueba posiciones candidatas: primero centrado sobre su punto, luego
 *     las ocho de alrededor, y por último otros puntos interiores del propio polígono.
 *  3. Se mide con las métricas reales de la tipografía incrustada y se comprueba el
 *     choque con RECTÁNGULOS EXACTOS: los de los rótulos ya puestos, los de los grupos
 *     de íconos y los de los bloques del layout.
 *  4. Si el nombre es largo, se prueba partido en dos líneas, que suele resolver los
 *     conflictos de un topónimo ancho sobre una provincia estrecha.
 *  5. Lo que no cabe se omite y se anota por nivel.
 */
import { color, trazoMm, ptAmm } from '../estilo/tokens.js';
import { grupo, textoConHalo, num } from './svg.js';

/** Separación mínima entre dos rótulos, para que no se lean como uno solo. */
export const HOLGURA_MM = 0.35;

/**
 * Ocho posiciones alrededor del punto, más la centrada.
 * El orden importa y es deliberado: centrado primero, luego arriba y abajo —que es
 * donde un rótulo estorba menos a un símbolo— y sólo después los laterales y las
 * diagonales.
 */
/**
 * Los grupos de íconos NO bloquean a los rótulos del mapa.
 *
 * El grupo de íconos de una provincia se ancla en su polo de inaccesibilidad, que es
 * justamente el mejor sitio para su nombre, así que tratarlo como obstáculo empujaba
 * cada rótulo hacia el borde de su provincia o lo dejaba fuera del todo: Huancavelica
 * desaparecía y LA LIBERTAD acababa arrinconada en un extremo del departamento en vez
 * de en su centro. Un nombre montado sobre unos íconos se lee —lleva halo y va encima—,
 * mientras que un nombre ausente o descolocado no dice a qué se refiere.
 *
 * Esto vale sólo para los rótulos entre sí y con los símbolos. La leyenda, los
 * recuadros de zoom y la cabecera siguen siendo intocables, y por eso los símbolos no
 * se sacan del índice: se ignoran al preguntar.
 */
const ES_SIMBOLO = (caja) => caja.nivel === 'simbolos';

const DIRECCIONES = [
  [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Coloca un conjunto de rótulos.
 *
 * @param {object} opciones
 * @param {Array}  opciones.solicitudes  ver `crearSolicitud`
 * @param {object} opciones.indice       índice de colisiones, ya sembrado
 * @param {object} opciones.medidor      de crearMedidor()
 * @param {object} opciones.marco        rectángulo del mapa, en milímetros
 * @param {number} opciones.factor       factor de formato, para el halo
 * @returns {{svg: string, colocados: Array, omitidos: Array, porNivel: object}}
 */
export function colocarEtiquetas({ solicitudes, indice, medidor, marco, factor = 1 }) {
  const ordenadas = [...solicitudes].sort(comparar);
  const piezas = [];
  const colocados = [];
  const omitidos = [];

  for (const s of ordenadas) {
    const resultado = colocarUna(s, { indice, medidor, marco, factor });
    if (!resultado) {
      omitidos.push({ id: s.id, texto: s.texto, nivel: s.nivel, motivo: 'sin sitio' });
      continue;
    }
    piezas.push(resultado.svg);
    indice.agregar({ ...resultado.caja, etiqueta: s.texto, nivel: s.nivel, id: s.id });
    colocados.push({
      id: s.id, texto: s.texto, nivel: s.nivel, lineas: resultado.lineas.length,
      x: Number(resultado.caja.x.toFixed(2)), y: Number(resultado.caja.y.toFixed(2)),
    });
  }

  const porNivel = {};
  for (const s of ordenadas) {
    porNivel[s.nivel] = porNivel[s.nivel] || { total: 0, colocados: 0 };
    porNivel[s.nivel].total++;
  }
  for (const c of colocados) porNivel[c.nivel].colocados++;

  return {
    svg: piezas.length ? grupo({ id: 'capa-rotulos' }, piezas) : '',
    colocados,
    omitidos,
    porNivel,
  };
}

/**
 * Orden determinista.
 *
 * Primero la prioridad declarada; después, a igualdad, la superficie de mayor a menor
 * —un departamento grande merece su nombre antes que uno diminuto— y por último el
 * ubigeo, que desempata siempre igual aunque dos superficies coincidan.
 */
function comparar(a, b) {
  if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
  if ((b.peso || 0) !== (a.peso || 0)) return (b.peso || 0) - (a.peso || 0);
  return String(a.id).localeCompare(String(b.id));
}

function colocarUna(s, { indice, medidor, marco, factor }) {
  const paso = medidor.alto(s.estilo) * 0.85;

  /* Se prueba primero en una línea y, si no hay sitio, partido en dos. Partir de
     entrada encogería innecesariamente los nombres cortos. */
  const variantes = [[s.texto]];
  if (s.permitirDosLineas !== false && s.texto.includes(' ')) {
    variantes.push(partirEnDos(s.texto, medidor, s.estilo));
  }

  for (const lineas of variantes) {
    const ancho = Math.max(...lineas.map((l) => medidor.ancho(l, s.estilo)));
    const alto = medidor.alto(s.estilo) * (lineas.length === 1 ? 1 : 1.82);

    for (const punto of s.puntos) {
      for (const [dx, dy] of DIRECCIONES) {
        const cx = punto.x + dx * (ancho / 2 + paso * 0.55);
        const cy = punto.y + dy * (alto / 2 + paso * 0.55);
        const caja = { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto };

        if (!dentroDe(marco, caja)) continue;
        if (indice.choca(caja, HOLGURA_MM, ES_SIMBOLO)) continue;

        /* Un rótulo tiene que señalar lo que nombra. Lo ideal es que su centro caiga
           dentro del polígono, pero en una provincia diminuta el nombre no cabe
           dentro por mucho que se busque, y omitirlo sería peor que dejarlo asomar:
           se admite que sobresalga mientras siga pegado a su punto de anclaje, que
           sí es interior. */
        if (s.dentro && !s.dentro(cx, cy)) {
          const margen = Math.max((punto.radioMm || 0) * 1.4, alto * 1.6);
          if (Math.hypot(cx - punto.x, cy - punto.y) > margen) continue;
        }

        return { caja, lineas, svg: dibujar(lineas, cx, cy, s, medidor, factor) };
      }
    }
  }
  return null;
}

/** Parte el nombre por el hueco que deje las dos mitades más parecidas. */
function partirEnDos(texto, medidor, estilo) {
  const palabras = texto.split(/\s+/);
  if (palabras.length < 2) return [texto];
  let mejor = null;
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(' ');
    const b = palabras.slice(i).join(' ');
    const desequilibrio = Math.abs(medidor.ancho(a, estilo) - medidor.ancho(b, estilo));
    if (!mejor || desequilibrio < mejor.desequilibrio) mejor = { a, b, desequilibrio };
  }
  return [mejor.a, mejor.b];
}

const dentroDe = (contenedor, r) => r.x >= contenedor.x && r.y >= contenedor.y
  && r.x + r.ancho <= contenedor.x + contenedor.ancho
  && r.y + r.alto <= contenedor.y + contenedor.alto;

function dibujar(lineas, cx, cy, s, medidor, factor) {
  const alturaLinea = medidor.alto(s.estilo) * 0.92;
  const primera = cy - ((lineas.length - 1) * alturaLinea) / 2 + medidor.alto(s.estilo) * 0.32;
  const halo = {
    colorHalo: color.halo,
    grosorMm: (s.haloMm ?? trazoMm.haloRotulo) * Math.sqrt(factor),
  };
  return grupo({}, lineas.map((linea, i) => textoConHalo(linea, {
    x: num(cx),
    y: num(primera + i * alturaLinea),
    'text-anchor': 'middle',
    fill: s.color || color.tinta,
    'font-family': s.estilo.familia,
    'font-size': ptAmm(s.estilo.pt),
    'font-weight': s.peso_ || (s.estilo.variante === 'Bold' ? 700 : 400),
  }, halo)));
}

/**
 * Prepara una solicitud de rótulo.
 *
 * @param {object} o
 * @param {string} o.id        clave estable (el ubigeo)
 * @param {string} o.texto
 * @param {string} o.nivel     'departamento' | 'provincia' | …
 * @param {number} o.prioridad menor es antes
 * @param {Array}  o.puntos    candidatos {x, y}, el primero es el preferido
 * @param {object} o.estilo    {familia, variante, pt}
 */
export function crearSolicitud(o) {
  return { permitirDosLineas: true, ...o };
}
