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
export function posicionEnAnclaje(anclaje, marco, ancho, alto, margen = SEPARACION_MM) {
  return posicion(anclaje, marco, ancho, alto, margen);
}

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

  for (const {
    pieza, anclajes, obligatoria = true, soloPreferidos = false, margen = SEPARACION_MM,
  } of solicitudes) {
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
        const base = posicion(anclaje, marco, pieza.ancho, pieza.alto, margen);
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
 * El logotipo y el título tienen sitio FIJO —arriba a la izquierda y arriba a la
 * derecha— en todas las hojas: son la cabecera del documento y moverlos de sitio
 * según el formato desorienta a quien compara dos mapas. Cuando el título no cabe sin
 * tapar el país no se muda: encoge (ver la reducción de cuerpo en render.js).
 *
 * El resto sí son preferencias. En vertical el Perú ocupa una banda diagonal y deja
 * libres las esquinas; en horizontal se estrecha y sobra sitio a los flancos.
 */
export const PLANTILLAS = {
  vertical: {
    institucional: ['arriba-izquierda'],
    titulo: ['arriba-derecha'],
    norte: ['centro-derecha', 'arriba-derecha', 'centro-izquierda'],
    escala: ['abajo-derecha', 'abajo-izquierda', 'abajo-centro'],
    leyenda: ['abajo-izquierda'],
    ubicacion: ['abajo-derecha', 'arriba-izquierda', 'centro-derecha'],
  },
  horizontal: {
    institucional: ['arriba-izquierda'],
    titulo: ['arriba-derecha'],
    /* La rosa va al flanco derecho también en horizontal: puesta arriba al centro
       quedaba sobre el país y, sobre todo, cambiaba de sitio entre una hoja vertical
       y una horizontal del mismo mapa. */
    norte: ['centro-derecha', 'arriba-derecha', 'abajo-derecha'],
    /* La barra de escala tira al centro del ANCHO a propósito: en una Mercator
       transversa la escala crece al alejarse del meridiano central, y en una hoja
       horizontal los extremos quedan a 13° de él. Colocada en un flanco, la barra medía
       un 2 % menos de lo que decía; sobre el meridiano central coincide con la escala
       numérica, que se mide en el centro del marco. */
    escala: ['abajo-centro', 'abajo-derecha', 'abajo-izquierda'],
    leyenda: ['abajo-izquierda'],
    ubicacion: ['abajo-derecha', 'arriba-izquierda', 'centro-derecha'],
  },
};

/** Orden de prioridad: quien va antes elige sitio antes. */
export const PRIORIDAD = ['titulo', 'institucional', 'leyenda', 'ubicacion', 'escala', 'norte'];

/** Piezas de cabecera: sitio fijo y margen propio. */
export const CABECERA = ['titulo', 'institucional'];

/**
 * Piezas de sitio FIJO: no se mudan de esquina aunque les toque apretarse.
 *
 * Además de la cabecera está la leyenda, siempre abajo a la izquierda. Que cambiara de
 * esquina según el formato —abajo a la izquierda en vertical, a media altura a la
 * derecha en horizontal— obligaba a buscarla de nuevo en cada mapa. Cuando no cabe,
 * encoge; no se muda.
 */
export const SITIO_FIJO = [...CABECERA, 'leyenda'];

/**
 * Piezas que reservan sitio ANTES que los rótulos del mapa.
 *
 * Además de la cabecera entra la leyenda: es el bloque más grande y el único sin el
 * que un mapa temático no se puede leer. Si pidiera sitio después de los rótulos, el
 * nombre de un país o del océano podría dejarla sin el único hueco donde cabía.
 */
/* El localizador entra con la leyenda, antes que los rótulos del mapa: necesita una
   superficie concreta, mientras que un topónimo se acomoda en cualquier hueco. */
export const ANTES_DE_ROTULOS = [...CABECERA, 'leyenda', 'ubicacion'];
