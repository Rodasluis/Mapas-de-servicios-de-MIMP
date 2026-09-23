/**
 * Colocación automática de las piezas del layout dentro del marco del mapa.
 *
 * El mapa de referencia no manda los bloques a los márgenes: los mete dentro del
 * marco, sobre el océano y los países vecinos, que es espacio que no aporta nada al
 * lector. Reproducir eso a mano exigiría una plantilla por cada combinación de hoja,
 * orientación y ámbito; en vez de eso, cada pieza declara dónde PREFIERE ir y el motor
 * busca el primer sitio que cumpla tres condiciones: que quepa entero en el marco, que
 * no pise otra pieza ya colocada y que no tape territorio peruano.
 *
 * Si ninguna posición cumple las tres, gana la que menos territorio tape, y la pieza
 * queda anotada como «forzada» para que el informe lo diga en vez de disimularlo.
 */
import { rectangulo } from './ocupacion.js';

/** Fracción de territorio tapado que se considera aceptable. */
const TERRITORIO_TOLERADO = 0.02;

/** Separación mínima entre piezas, y entre una pieza y el borde del marco. */
export const SEPARACION_MM = 2.5;

const ANCLAJES = [
  'arriba-izquierda', 'arriba-centro', 'arriba-derecha',
  'centro-izquierda', 'centro-derecha',
  'abajo-izquierda', 'abajo-centro', 'abajo-derecha',
];

/** Esquina superior izquierda de una caja colocada en un anclaje. */
function posicion(anclaje, marco, ancho, alto, margen) {
  const [vertical, horizontal] = anclaje.split('-');
  const x = horizontal === 'izquierda' ? marco.x + margen
    : horizontal === 'derecha' ? marco.x + marco.ancho - ancho - margen
      : marco.x + (marco.ancho - ancho) / 2;
  const y = vertical === 'arriba' ? marco.y + margen
    : vertical === 'abajo' ? marco.y + marco.alto - alto - margen
      : marco.y + (marco.alto - alto) / 2;
  return { x, y, ancho, alto };
}

/**
 * Desplazamientos que se prueban cuando el anclaje exacto no sirve.
 *
 * Deslizar a lo largo del borde resuelve la mayoría de los choques —dos piezas que
 * quieren la misma esquina— sin tener que inventar anclajes nuevos para cada caso.
 */
function desplazamientos(marco) {
  const paso = Math.min(marco.ancho, marco.alto) * 0.08;
  const salida = [[0, 0]];
  for (let i = 1; i <= 5; i++) {
    salida.push([0, paso * i], [0, -paso * i], [paso * i, 0], [-paso * i, 0]);
  }
  return salida;
}

/**
 * Coloca las piezas.
 *
 * @param {Array} solicitudes  [{pieza, anclajes:[...], obligatoria}] en orden de prioridad
 * @param {object} marco       rectángulo del mapa, en milímetros
 * @param {object} ocupacion   rejilla con el territorio ya marcado
 * @returns {{colocadas: Array, omitidas: Array, forzadas: Array}}
 */
export function colocarPiezas(solicitudes, marco, ocupacion) {
  const colocadas = [];
  const omitidas = [];
  const forzadas = [];
  const deslizamientos = desplazamientos(marco);

  for (const { pieza, anclajes, obligatoria = true, soloPreferidos = false } of solicitudes) {
    if (!pieza || !(pieza.ancho > 0) || !(pieza.alto > 0)) continue;

    let elegida = null;
    let respaldo = null;

    /* Primero las posiciones que la pieza prefiere y, si ninguna sirve, TODAS las
       demás. Sin este barrido final una pieza se resignaba a tapar el país porque sus
       tres anclajes preferidos estaban ocupados, aunque quedara media hoja de océano
       libre: en un A4 nacional la barra de escala acabó sobre el sur del Perú
       teniendo el Pacífico al lado. Preferir un sitio no es renunciar al resto.

       La excepción es `soloPreferidos`: hay sitios que no son negociables por mucho
       que sobre océano en otra parte. El título va arriba aunque le toque tapar algo
       de territorio, y por eso su caja se compone lo más apretada posible. */
    const orden = !anclajes.length ? ANCLAJES
      : soloPreferidos ? anclajes
        : [...anclajes, ...ANCLAJES.filter((a) => !anclajes.includes(a))];

    for (const anclaje of orden) {
      for (const [dx, dy] of deslizamientos) {
        const base = posicion(anclaje, marco, pieza.ancho, pieza.alto, SEPARACION_MM);
        const r = { ...base, x: base.x + dx, y: base.y + dy };
        if (!rectangulo.contiene(marco, r)) continue;
        if (ocupacion.chocaConBloque(rectangulo.expandir(r, SEPARACION_MM / 2))) continue;

        const tapado = ocupacion.sobreTerritorio(r);
        if (tapado <= TERRITORIO_TOLERADO) { elegida = { r, anclaje, tapado }; break; }
        if (!respaldo || tapado < respaldo.tapado) respaldo = { r, anclaje, tapado };
      }
      if (elegida) break;
    }

    const sitio = elegida || respaldo;
    if (!sitio) {
      if (obligatoria) omitidas.push(pieza.nombre);
      continue;
    }
    if (!elegida) forzadas.push({ nombre: pieza.nombre, tapadoPct: Number((sitio.tapado * 100).toFixed(1)) });

    ocupacion.marcarBloque(rectangulo.expandir(sitio.r, SEPARACION_MM / 2));
    colocadas.push({ pieza, ...sitio.r, anclaje: sitio.anclaje, tapado: sitio.tapado });
  }

  return { colocadas, omitidas, forzadas };
}

/**
 * Plantillas por orientación.
 *
 * En vertical el Perú ocupa una banda diagonal y deja libres las cuatro esquinas: mar
 * arriba y abajo a la izquierda, países vecinos a la derecha. En apaisado el país se
 * estrecha y sobra sitio a los lados, así que las piezas tiran a los flancos. Son
 * preferencias, no imposiciones: el motor las recorre hasta encontrar sitio.
 */
export const PLANTILLAS = {
  vertical: {
    institucional: ['arriba-izquierda', 'arriba-derecha', 'abajo-izquierda'],
    titulo: ['arriba-derecha', 'arriba-centro', 'arriba-izquierda'],
    norte: ['centro-derecha', 'arriba-derecha', 'centro-izquierda'],
    escala: ['abajo-derecha', 'abajo-izquierda', 'abajo-centro'],
    leyenda: ['abajo-izquierda', 'abajo-derecha', 'centro-izquierda'],
  },
  horizontal: {
    institucional: ['arriba-izquierda', 'abajo-izquierda', 'arriba-derecha'],
    titulo: ['arriba-derecha', 'arriba-centro', 'arriba-izquierda'],
    norte: ['arriba-centro', 'centro-derecha', 'arriba-derecha'],
    /* La barra de escala tira al centro horizontal a propósito: en una Mercator
       transversa la escala crece al alejarse del meridiano central, y en una hoja
       apaisada los extremos quedan a 13° de él. Colocada en un flanco, la barra medía
       un 2 % menos de lo que decía; sobre el meridiano central coincide con la escala
       numérica, que se mide en el centro del marco. */
    escala: ['abajo-centro', 'abajo-derecha', 'abajo-izquierda'],
    leyenda: ['centro-derecha', 'abajo-derecha', 'abajo-izquierda'],
  },
};

/** Orden de prioridad: quien va antes elige sitio antes. */
export const PRIORIDAD = ['titulo', 'institucional', 'leyenda', 'escala', 'norte'];
