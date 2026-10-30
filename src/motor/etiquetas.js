/**
 * Motor de rótulos del mapa.
 *
 * El problema no es escribir nombres: es decidir cuáles caben. En un mapa nacional hay
 * 25 departamentos y 196 provincias, y en A4 no entran ni la mitad sin pisarse entre
 * sí ni tapar los símbolos. Un mapa con rótulos superpuestos es ilegible, y uno que
 * los omita en silencio es engañoso, así que este módulo coloca lo que cabe POR
 * PRIORIDAD y deja constancia de lo que no.
 *
 * Desde la Fase 20 sigue el método del motor de etiquetado de QGIS (PAL), reescrito
 * aquí sin copiar su código:
 *
 *  1. CANDIDATOS CON COSTE. Cada rótulo genera sus posiciones posibles —pegado a la
 *     rejilla de íconos de su unidad, si la tiene, y centrado sobre cada punto interior
 *     y en las ocho direcciones de alrededor, a tres distancias, en una o en dos
 *     líneas— y cada una lleva un coste: la parte que sale de su unidad, lejos de sus
 *     íconos, partida en dos líneas, sobre el hueco reservado a otro nombre o encima de
 *     íconos cuesta más. Las que pisan la leyenda, un recuadro u otro bloque no son
 *     candidatas.
 *  2. SOLUCIÓN INICIAL. Se colocan primero los de más prioridad (departamento antes que
 *     provincia, provincia antes que distrito) y, dentro de cada nivel, los que tienen
 *     MENOS posiciones posibles: son los que se pierden si otro les quita el hueco. Cada
 *     uno toma su candidato más barato que esté libre.
 *  3. MEJORA POR CADENAS. Un rótulo que se quedó fuera prueba sus candidatos uno a uno;
 *     si choca con otros ya puestos, intenta moverlos a otra de sus posiciones. Nunca
 *     desplaza a uno más importante, y a uno menos importante puede dejarlo fuera: un
 *     nombre de provincia vale más que uno de distrito.
 *  4. PULIDO. Cada rótulo colocado baja al candidato más barato que le quede libre.
 *
 * Todo es determinista: las posiciones se generan y se ordenan siempre igual, y los
 * empates se deshacen por el orden de generación y el ubigeo. La Fase 8 compara PDF
 * contra PDF.
 *
 * Se mide con las métricas reales de la tipografía incrustada y los choques se
 * comprueban con RECTÁNGULOS EXACTOS: los de los rótulos, los de los grupos de íconos y
 * los de los bloques del layout. Lo que no cabe se omite y se anota por nivel.
 */
import { color, trazoMm, ptAmm } from '../estilo/tokens.js';
import { grupo, textoConHalo, num } from './svg.js';
import { crearIndice } from './colisiones.js';

/** Separación mínima entre dos rótulos, para que no se lean como uno solo. */
export const HOLGURA_MM = 0.35;

/**
 * Los grupos de íconos NO son obstáculos duros para los rótulos del mapa.
 *
 * El grupo de íconos de una provincia se ancla en su polo de inaccesibilidad, que es
 * justamente el mejor sitio para su nombre, así que tratarlo como obstáculo empujaba
 * cada rótulo hacia el borde de su provincia o lo dejaba fuera del todo. Un nombre
 * montado sobre unos íconos se lee —lleva halo—, mientras que un nombre ausente no dice
 * a qué se refiere. Por eso montarse sobre íconos no está prohibido: cuesta mucho, de
 * modo que sólo se hace cuando no queda ninguna posición libre.
 *
 * Esto vale sólo para los rótulos con los símbolos. La leyenda, los recuadros de zoom
 * y la cabecera siguen siendo intocables, y por eso los símbolos no se sacan del
 * índice: se ignoran al preguntar por obstáculos duros.
 */
const ES_SIMBOLO = (caja) => caja.nivel === 'simbolos';

/**
 * Ocho posiciones alrededor del punto, más la centrada, de la preferida a la menos.
 * Centrado primero, luego arriba y abajo —que es donde un rótulo estorba menos a un
 * símbolo— y sólo después los laterales y las diagonales.
 */
const DIRECCIONES = [
  [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/** Múltiplos del desplazamiento base que se prueban alrededor de cada punto. */
const DISTANCIAS = [1, 1.6, 2.4];

/**
 * Posiciones PEGADAS al grupo de íconos de la unidad, de la preferida a la menos.
 *
 * Cada una es [lado, alineación]: encima, debajo, a la izquierda o a la derecha del
 * grupo, centrado en él o alineado con uno de sus bordes, y por último las cuatro
 * esquinas. El nombre se pone a un hilo del grupo, el mismo que separa un rótulo de su
 * punto: en la Fase 20 los nombres buscaban sitio alrededor del centro del grupo, a la
 * distancia de su propio alto, así que un grupo más alto que el nombre los empujaba
 * lejos de sus íconos o fuera de su unidad.
 */
const PEGADAS = [
  ['arriba', 0], ['abajo', 0], ['arriba', -1], ['arriba', 1], ['abajo', -1], ['abajo', 1],
  ['derecha', 0], ['izquierda', 0], ['derecha', -1], ['derecha', 1], ['izquierda', -1], ['izquierda', 1],
  ['esquina', [1, -1]], ['esquina', [-1, -1]], ['esquina', [1, 1]], ['esquina', [-1, 1]],
];

/**
 * Cuánto se separa el rótulo de su punto, en múltiplos del interlineado.
 *
 * Cuanto más aire, más fácil es que el nombre se salga de su unidad. Con 0,55 los
 * nombres de distrito de un mapa provincial se iban fuera de su área con sitio dentro;
 * lo justo para que no se toquen basta, porque el halo ya los separa de lo que hay
 * debajo.
 */
const SEPARACION = 0.3;

/**
 * Aire mínimo entre dos rótulos en la misma línea, en fracción de la altura de la
 * letra. Con sólo la holgura (0,35 mm), «Santiago» y «San Sebastián» se leían como un
 * solo nombre; con media letra, el mapa nacional en A4 perdía una docena de
 * provincias. Un tercio es algo más que el espacio entre dos palabras.
 */
const SEPARACION_HORIZONTAL = 0.3;

/**
 * Cuánto de su caja puede tener un rótulo debajo de íconos, como mucho.
 *
 * Los rótulos se dibujan debajo de los símbolos, así que un nombre con media caja
 * bajo una rejilla no se lee: en el Perú A4 eran una treintena de provincias con sólo
 * unas letras sueltas a la vista. Por encima de esta fracción se omite, y queda
 * anotado. No vale para el nivel superior del mapa —los departamentos del país—, que
 * va en negrita y más grande, se lee igual y no puede faltar.
 */
const TAPADO_MAXIMO = 0.1;

/** Candidatos que se conservan por rótulo: los más baratos. Más no mejora el mapa y
    alarga la búsqueda; con 1.893 distritos en el mapa del país, se nota. */
const MAXIMO_CANDIDATOS = 36;

/**
 * Coste de cada aspecto de una posición. Lo que cuenta es el orden que establecen:
 *
 *  - una posición libre siempre gana a una sobre íconos (SOBRE_SIMBOLOS es mayor que la
 *    suma de todo lo demás), que era la primera pasada del motor anterior;
 *  - dentro de su unidad gana a asomando, y en dos líneas dentro gana a en una
 *    asomando: FUERA, por la fracción del nombre que sale, pesa más que DOS_LINEAS en
 *    cuanto sale algo más que una letra;
 *  - pegado a su grupo de íconos gana a suelto (LEJOS, que crece con la distancia);
 *  - en una unidad sin íconos, cerca del mejor punto interior gana a lejos.
 */
const COSTE = {
  PUNTO: 0.3, // del mejor punto interior (0) al peor (0,3)
  DISTANCIA: 0.1, // por cada escalón de alejamiento del punto
  DIRECCION: 0.02, // por puesto en DIRECCIONES
  PEGADA: 0.01, // por puesto en PEGADAS
  DOS_LINEAS: 0.05,
  FUERA: 1.2, // por la fracción del rótulo fuera de su unidad
  ASOMA: 0.4, // el centro del rótulo fuera de su unidad
  LEJOS: 0.3, // del grupo de íconos, a partir de cuatro alturas de letra
  RESERVA_AJENA: 0.5, // encima del hueco que la rejilla de otra unidad dejó a su nombre
  /* Más la fracción de la caja que tapa. Tiene que superar la suma de todo lo demás
     (3,1): los rótulos se dibujan debajo de los íconos, así que uno montado sobre
     ellos no sólo los tapa, también queda medio escondido. */
  SOBRE_SIMBOLOS: 3.5,
};

/**
 * Peso de un rótulo según su prioridad, para decidir qué vale más al desplazar. Cada
 * nivel vale más que todos los del siguiente juntos en cualquier mapa real: un
 * departamento no se cambia por mil provincias.
 */
const pesoDePrioridad = (prioridad) => 1000 ** Math.max(0, 4 - prioridad);

/**
 * Coloca un conjunto de rótulos.
 *
 * @param {object} opciones
 * @param {Array}  opciones.solicitudes  ver `crearSolicitud`
 * @param {object} opciones.indice       índice de colisiones, ya sembrado
 * @param {object} opciones.medidor      de crearMedidor()
 * @param {object} opciones.marco        rectángulo del mapa, en milímetros
 * @param {number} opciones.factor       factor de formato, para el halo
 * @param {Array}  [opciones.reservas]   huecos {x, y, ancho, alto, id} que la rejilla de
 *                                       íconos de la unidad `id` dejó a su nombre
 * @returns {{svg: string, colocados: Array, omitidos: Array, porNivel: object}}
 */
export function colocarEtiquetas({ solicitudes, indice, medidor, marco, factor = 1, reservas = [] }) {
  const ordenadas = [...solicitudes].sort(comparar);
  const indiceReservas = crearIndice();
  for (const r of reservas) indiceReservas.agregar(r);
  const rotulos = ordenadas.map((s) => ({
    s,
    candidatos: candidatosDe(s, { indice, medidor, marco, reservas: indiceReservas }),
    altoLinea: medidor.alto(s.estilo),
  }));
  const eleccion = resolver(rotulos);

  const piezas = [];
  const colocados = [];
  const omitidos = [];
  rotulos.forEach(({ s, candidatos }, i) => {
    if (eleccion[i] < 0) {
      omitidos.push({ id: s.id, texto: s.texto, nivel: s.nivel, motivo: 'sin sitio' });
      return;
    }
    const c = candidatos[eleccion[i]];
    piezas.push(dibujar(c.lineas, c.cx, c.cy, s, medidor, factor));
    indice.agregar({ ...c.caja, etiqueta: s.texto, nivel: s.nivel, id: s.id });
    /* Lo que hace falta para revisar cada nombre uno por uno: cuánto sale de su unidad,
       a qué distancia queda de sus íconos y cuánto los tapa. */
    colocados.push({
      id: s.id, texto: s.texto, nivel: s.nivel, lineas: c.lineas.length,
      x: Number(c.caja.x.toFixed(2)), y: Number(c.caja.y.toFixed(2)),
      ancho: Number(c.caja.ancho.toFixed(2)), alto: Number(c.caja.alto.toFixed(2)),
      fueraPct: Math.round(c.fuera * 100),
      aGrupoMm: s.grupo ? Number(c.separacion.toFixed(2)) : null,
      sobreSimbolosPct: Math.round(c.sobreSimbolos * 100),
    });
  });

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

/**
 * Las posiciones posibles de un rótulo, de la más barata a la más cara.
 *
 * Quedan fuera las que se salen del marco, las que pisan un obstáculo duro (todo lo del
 * índice que no sea un grupo de íconos) y, para un rótulo que asoma, las que se alejan
 * de su punto. Un rótulo ESTRICTO sólo admite posiciones enteras dentro de su unidad y
 * sin íconos debajo.
 *
 * Si la unidad tiene grupo de íconos (`s.grupo`), se prueban primero las posiciones
 * pegadas a él y todas las demás pagan por la distancia que las separa de él.
 */
function candidatosDe(s, { indice, medidor, marco, reservas }) {
  const esAjena = (r) => r.id !== s.id;
  const { altoLetra, aire, variantes } = medirRotulo(s.texto, s.estilo, medidor, s.permitirDosLineas !== false);
  const ultimoPunto = Math.max(1, s.puntos.length - 1);
  const ancla = s.puntos[0];

  const lista = [];
  /** Prueba una posición y, si es admisible, la apunta con su coste. */
  const probar = (cx, cy, ancho, alto, lineas, costeBase, punto) => {
    const caja = { x: cx - ancho / 2, y: cy - alto / 2, ancho, alto };
    if (!dentroDe(marco, caja)) return;
    if (indice.choca(caja, HOLGURA_MM, ES_SIMBOLO)) return;

    const centroDentro = !s.dentro || s.dentro(cx, cy);
    if (s.estricto && !centroDentro) return;
    const fuera = s.dentro ? fraccionFuera(caja, s.dentro) : 0;
    if (s.estricto && fuera > 0) return;
    /* La distancia al grupo se cuenta desde el hilo de aire: pegado es cero. */
    const separacion = s.grupo ? Math.max(0, distanciaEntre(caja, s.grupo.caja) - aire * 1.01) : 0;
    /* Un rótulo tiene que señalar lo que nombra. En un distrito diminuto el nombre no
       cabe dentro por mucho que se busque, y omitirlo sería peor que dejarlo asomar,
       así que se admite que sobresalga mientras siga pegado a su punto de anclaje, que
       sí es interior, o a sus íconos, que dicen igual de bien de quién es. */
    if (!centroDentro && !(s.grupo && separacion === 0)) {
      const margen = Math.max((punto.radioMm || 0) * 1.4, alto * 1.6);
      if (Math.hypot(cx - punto.x, cy - punto.y) > margen) return;
    }
    const sobreSimbolos = indice.areaSolapada(caja, ES_SIMBOLO) / (ancho * alto);
    if (s.estricto && sobreSimbolos > 0) return;
    if (s.prioridad > 1 && sobreSimbolos > TAPADO_MAXIMO) return;

    const coste = costeBase
      + (lineas.length > 1 ? COSTE.DOS_LINEAS : 0)
      + COSTE.FUERA * fuera
      + (centroDentro ? 0 : COSTE.ASOMA)
      + (s.grupo ? COSTE.LEJOS * Math.min(1, separacion / (altoLetra * 4)) : 0)
      + (reservas.areaSolapada(caja, esAjena) > 0 ? COSTE.RESERVA_AJENA : 0)
      + (sobreSimbolos > 0 ? COSTE.SOBRE_SIMBOLOS + sobreSimbolos : 0);
    lista.push({
      caja, cx, cy, lineas, coste, orden: lista.length, fuera, separacion, sobreSimbolos,
    });
  };

  variantes.forEach(({ lineas, ancho, alto }) => {
    /* 1. Pegado a sus íconos. */
    if (s.grupo) {
      const g = s.grupo.caja;
      const enX = (a) => g.x + g.ancho / 2 + a * (g.ancho - ancho) / 2;
      const enY = (a) => g.y + g.alto / 2 + a * (g.alto - alto) / 2;
      const arriba = g.y - aire - alto / 2;
      const abajo = g.y + g.alto + aire + alto / 2;
      const izquierda = g.x - aire - ancho / 2;
      const derecha = g.x + g.ancho + aire + ancho / 2;
      PEGADAS.forEach(([lado, a], r) => {
        const [cx, cy] = lado === 'arriba' ? [enX(a), arriba]
          : lado === 'abajo' ? [enX(a), abajo]
            : lado === 'izquierda' ? [izquierda, enY(a)]
              : lado === 'derecha' ? [derecha, enY(a)]
                : [a[0] > 0 ? derecha : izquierda, a[1] > 0 ? abajo : arriba];
        probar(cx, cy, ancho, alto, lineas, COSTE.PEGADA * r, ancla);
      });
    }

    /* 2. Alrededor de los puntos interiores de la unidad. */
    s.puntos.forEach((punto, p) => {
      DISTANCIAS.forEach((distancia, d) => {
        DIRECCIONES.forEach(([dx, dy], r) => {
          if (d > 0 && dx === 0 && dy === 0) return; // el centro no se repite
          const cx = punto.x + dx * (ancho / 2 + aire) * distancia;
          const cy = punto.y + dy * (alto / 2 + aire) * distancia;
          probar(cx, cy, ancho, alto, lineas,
            COSTE.PUNTO * (p / ultimoPunto) + COSTE.DISTANCIA * d + COSTE.DIRECCION * r, punto);
        });
      });
    });
  });

  /* Orden estable: a igual coste, el de generación, que ya va de lo preferido a lo
     menos preferido. */
  lista.sort((a, b) => a.coste - b.coste || a.orden - b.orden);
  return lista.slice(0, MAXIMO_CANDIDATOS);
}

/**
 * Elige un candidato por rótulo (o ninguno) maximizando primero lo colocado, pesado por
 * prioridad, y después lo barato de las posiciones. Devuelve, por rótulo, el índice del
 * candidato elegido o -1.
 */
function resolver(rotulos) {
  const eleccion = rotulos.map(() => -1);
  const ocupacion = crearRejilla();
  const prioridad = (i) => rotulos[i].s.prioridad;

  /* Separación horizontal de cada rótulo: SEPARACION_HORIZONTAL de la altura de su
     letra, y nunca menos que la holgura vertical. */
  const hxDe = (i) => Math.max(HOLGURA_MM, rotulos[i].altoLinea * SEPARACION_HORIZONTAL);
  const poner = (i, k) => {
    eleccion[i] = k;
    ocupacion.agregar(i, rotulos[i].candidatos[k].caja, hxDe(i));
  };
  const quitar = (i) => { ocupacion.quitar(i, rotulos[i].candidatos[eleccion[i]].caja); eleccion[i] = -1; };
  /** Rótulos colocados con los que chocaría el rótulo `i` en esta caja (sin contarse). */
  const choques = (caja, i) => ocupacion.chocan(caja, HOLGURA_MM, hxDe(i)).filter((j) => j !== i);
  /** El candidato libre más barato de un rótulo, o -1. */
  const mejorLibre = (i) => rotulos[i].candidatos.findIndex((c) => choques(c.caja, i).length === 0);

  /* 1. Solución inicial: por prioridad y, dentro de cada nivel, los más difíciles —los
        de menos candidatos— primero. A igualdad, el orden de `comparar`. */
  const orden = rotulos.map((_, i) => i).sort((a, b) => prioridad(a) - prioridad(b)
    || rotulos[a].candidatos.length - rotulos[b].candidatos.length
    || a - b);
  for (const i of orden) {
    const k = mejorLibre(i);
    if (k >= 0) poner(i, k);
  }

  /* 2. Cadenas: un rótulo fuera intenta entrar moviendo a los que le estorban. */
  for (let pasada = 0; pasada < 3; pasada++) {
    let mejoro = false;
    for (const i of orden) {
      if (eleccion[i] >= 0) continue;
      const { candidatos } = rotulos[i];
      for (let k = 0; k < candidatos.length; k++) {
        const estorban = choques(candidatos[k].caja, i);
        if (!estorban.length) { poner(i, k); mejoro = true; break; }
        // Nunca se desplaza a uno más importante.
        if (estorban.some((j) => prioridad(j) < prioridad(i))) continue;

        const antes = estorban.map((j) => [j, eleccion[j]]);
        for (const j of estorban) quitar(j);
        poner(i, k);
        let vale = true;
        for (const j of estorban) {
          const alternativa = mejorLibre(j);
          if (alternativa >= 0) poner(j, alternativa);
          /* Uno del mismo nivel que no encuentra otro sitio no se cambia por éste: sería
             uno por uno. Uno menos importante sí se queda fuera. */
          else if (prioridad(j) <= prioridad(i)) { vale = false; break; }
        }
        if (vale) { mejoro = true; break; }

        // Deshacer: se vuelve exactamente a como estaba.
        for (const [j] of antes) if (eleccion[j] >= 0) quitar(j);
        quitar(i);
        for (const [j, kj] of antes) poner(j, kj);
      }
    }
    if (!mejoro) break;
  }

  /* 3. Pulido: cada rótulo colocado baja a su candidato libre más barato. */
  for (const i of orden) {
    if (eleccion[i] <= 0) continue;
    const actual = eleccion[i];
    quitar(i);
    const k = mejorLibre(i);
    poner(i, k >= 0 && k < actual ? k : actual);
  }

  return eleccion;
}

/**
 * Rejilla de los rótulos colocados por el solucionador, para preguntar con quién choca
 * una caja sin recorrerlos todos. Guarda el número de rótulo, no la caja, porque lo que
 * se quiere saber es a quién habría que mover.
 */
function crearRejilla(celdaMm = 12) {
  const celdas = new Map();
  const cajas = new Map();
  const separacion = new Map();
  let mayorHx = 0;
  const claves = (r) => {
    const salida = [];
    for (let f = Math.floor(r.y / celdaMm); f <= Math.floor((r.y + r.alto) / celdaMm); f++) {
      for (let c = Math.floor(r.x / celdaMm); c <= Math.floor((r.x + r.ancho) / celdaMm); c++) {
        salida.push(`${c},${f}`);
      }
    }
    return salida;
  };
  return {
    agregar(id, caja, hx = 0) {
      cajas.set(id, caja);
      separacion.set(id, hx);
      if (hx > mayorHx) mayorHx = hx;
      for (const k of claves(caja)) {
        if (!celdas.has(k)) celdas.set(k, new Set());
        celdas.get(k).add(id);
      }
    },
    quitar(id, caja) {
      cajas.delete(id);
      separacion.delete(id);
      for (const k of claves(caja)) celdas.get(k)?.delete(id);
    },
    /**
     * `h` separa en vertical y `hx` en horizontal. En horizontal hace falta más aire:
     * dos nombres en la misma línea a un tercio de milímetro —«Santiago» y «San
     * Sebastián»— se leían como uno solo. Se usa el mayor de los dos rótulos.
     */
    chocan(r, h, hx = h) {
      const encontrados = new Set();
      const ex = Math.max(hx, mayorHx);
      for (const k of claves({ x: r.x - ex, y: r.y - h, ancho: r.ancho + ex * 2, alto: r.alto + h * 2 })) {
        for (const id of celdas.get(k) || []) {
          if (encontrados.has(id)) continue;
          const o = cajas.get(id);
          const sx = Math.max(hx, separacion.get(id) || 0);
          if (!(r.x + r.ancho + sx <= o.x || o.x + o.ancho + sx <= r.x
            || r.y + r.alto + h <= o.y || o.y + o.alto + h <= r.y)) encontrados.add(id);
        }
      }
      return [...encontrados].sort((a, b) => a - b);
    },
  };
}

/**
 * Lo que mide un rótulo: su caja en una línea y, si tiene más de una palabra, partido
 * en dos; y el hilo de aire que lo separa de lo que nombra.
 *
 * Es la misma medida para el motor de rótulos y para la rejilla de íconos, que reserva
 * el sitio del nombre junto a sí (servicios.js): si cada uno midiera a su manera, el
 * hueco que deja la rejilla no sería el que el nombre necesita.
 *
 * @returns {{altoLetra: number, aire: number, variantes: Array<{lineas, ancho, alto}>}}
 */
export function medirRotulo(texto, estilo, medidor, permitirDosLineas = true) {
  const altoLetra = medidor.alto(estilo);
  const partidos = [[texto]];
  if (permitirDosLineas && texto.includes(' ')) partidos.push(partirEnDos(texto, medidor, estilo));
  return {
    altoLetra,
    aire: altoLetra * 0.85 * SEPARACION,
    variantes: partidos.map((lineas) => ({
      lineas,
      ancho: Math.max(...lineas.map((l) => medidor.ancho(l, estilo))),
      alto: altoLetra * (lineas.length === 1 ? 1 : 1.82),
    })),
  };
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

/**
 * Fracción del rótulo que cae fuera de su unidad, medida en su contorno.
 *
 * Hasta la Fase 20 se contaban sólo las cuatro esquinas, y un nombre largo podía
 * cruzar el límite por el medio con las cuatro dentro, o tener una fuera por un
 * milímetro y pagar lo mismo que medio nombre fuera. Ahora se miran puntos repartidos
 * por los bordes de arriba y de abajo, uno por cada alto de letra, más los dos de los
 * lados. Un poco hacia dentro, porque la caja incluye el aire de acentos y
 * descendentes que el dibujo casi nunca ocupa.
 */
export function fraccionFuera(r, dentro) {
  const mx = r.ancho * 0.02;
  const my = r.alto * 0.12;
  const x0 = r.x + mx; const x1 = r.x + r.ancho - mx;
  const y0 = r.y + my; const y1 = r.y + r.alto - my;
  const columnas = Math.max(2, Math.min(8, Math.ceil(r.ancho / r.alto) + 1));
  let fuera = 0; let total = 0;
  const mirar = (x, y) => { total++; if (!dentro(x, y)) fuera++; };
  for (let c = 0; c < columnas; c++) {
    const x = x0 + ((x1 - x0) * c) / (columnas - 1);
    mirar(x, y0);
    mirar(x, y1);
  }
  mirar(x0, (y0 + y1) / 2);
  mirar(x1, (y0 + y1) / 2);
  return fuera / total;
}

/** Distancia entre dos rectángulos; cero si se tocan o se solapan. */
const distanciaEntre = (a, b) => Math.hypot(
  Math.max(0, b.x - (a.x + a.ancho), a.x - (b.x + b.ancho)),
  Math.max(0, b.y - (a.y + a.alto), a.y - (b.y + b.alto)),
);

const dentroDe = (contenedor, r) => r.x >= contenedor.x && r.y >= contenedor.y
  && r.x + r.ancho <= contenedor.x + contenedor.ancho
  && r.y + r.alto <= contenedor.y + contenedor.alto;

function dibujar(lineas, cx, cy, s, medidor, factor) {
  const alturaLinea = medidor.alto(s.estilo) * 0.92;
  const primera = cy - ((lineas.length - 1) * alturaLinea) / 2 + medidor.alto(s.estilo) * 0.32;
  const halo = {
    colorHalo: color.halo,
    grosorMm: (s.haloMm ?? trazoMm.haloRotulo) * Math.sqrt(factor),
    medidor,
    estilo: s.estilo,
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
 * @param {boolean} [o.estricto] sólo si cabe entero dentro de su unidad, sin asomar
 *                               ni montarse sobre íconos; si no, se omite
 * @param {object} [o.grupo]     {caja} del grupo de íconos de la unidad, si lo tiene:
 *                               el nombre se busca primero pegado a él
 */
export function crearSolicitud(o) {
  return { permitirDosLineas: true, ...o };
}
