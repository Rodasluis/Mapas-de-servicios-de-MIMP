/**
 * Capa temática: qué servicios hay y cómo se reparten.
 *
 * Aquí no se clasifica nada. El criterio de publicación se aplica al preparar los datos
 * (scripts/lib/criterios.mjs) y este
 * módulo se limita a CONTAR lo que centros.json trae: cuántos centros de cada tipo
 * caen en cada provincia y cuántos tipos distintos tiene cada una. Si un tipo no está
 * en los datos, no existe para el mapa; si aparece uno nuevo, el conteo lo refleja y
 * la comprobación de cobertura de íconos avisa.
 */
import { ptAmm, trazoMm } from '../estilo/tokens.js';
import { fraccionFuera } from './etiquetas.js';

/**
 * Clases del coropletas por número de TIPOS distintos, como el mapa de 2020.
 * Son el valor por defecto: la interfaz podrá cambiarlas (Fase 5).
 */
export const CLASES_POR_DEFECTO = [
  { desde: 1, hasta: 1, etiqueta: '1 servicio' },
  { desde: 2, hasta: 3, etiqueta: 'Entre 2 y 3 servicios' },
  { desde: 4, hasta: 6, etiqueta: 'Entre 4 y 6 servicios' },
  { desde: 7, hasta: 9, etiqueta: 'Entre 7 y 9 servicios' },
  { desde: 10, hasta: Infinity, etiqueta: '10 servicios o más' },
];

/**
 * Agrupa los centros por la unidad territorial que toque.
 *
 * La unidad depende del ámbito: el mapa del país cuenta por provincia y el de un
 * departamento, por distrito. Lo que no cambia es el criterio —contar lo que
 * centros.json trae, sin reclasificar—, así que la función es una sola y lo que varía
 * es la clave con la que se agrupa.
 *
 * `pertenece` recorta al ámbito: en un mapa de Cusco, los centros de Puno no entran en
 * los totales ni en la leyenda. Sin ese filtro, el pie diría 704 centros en un mapa que
 * dibuja treinta.
 *
 * @param {object} centrosJson  el centros.json publicado
 * @param {object} opciones
 * @param {(centro) => string} opciones.clave  de qué unidad es cada centro
 * @param {Set<string>|null} [opciones.tiposActivos]  filtro de tipos; null es «todos»
 * @param {(centro) => boolean} [opciones.pertenece]  si el centro entra en el ámbito
 * @returns {{porUnidad: Map, porTipo: Map, total: number, tipos: string[], centros: object[]}}
 */
export function agregarCentros(centrosJson, {
  clave = (c) => c.ccpp, tiposActivos = null, pertenece = () => true,
} = {}) {
  const porUnidad = new Map();
  const porTipo = new Map();
  /* Se guardan los centros que entran porque el ámbito provincial los dibuja uno a
     uno en su coordenada real, no agregados. */
  const centros = [];
  let total = 0;

  for (const c of centrosJson.centros) {
    if (tiposActivos && !tiposActivos.has(c.tipo)) continue;
    if (!pertenece(c)) continue;
    total++;
    centros.push(c);
    porTipo.set(c.tipo, (porTipo.get(c.tipo) || 0) + 1);

    const id = clave(c);
    let unidad = porUnidad.get(id);
    if (!unidad) {
      unidad = { id, tipos: new Map(), total: 0 };
      porUnidad.set(id, unidad);
    }
    unidad.tipos.set(c.tipo, (unidad.tipos.get(c.tipo) || 0) + 1);
    unidad.total++;
  }

  for (const unidad of porUnidad.values()) unidad.tiposDistintos = unidad.tipos.size;

  return {
    porUnidad,
    porTipo,
    total,
    centros,
    // Orden estable: por frecuencia y, a igualdad, alfabético. La leyenda lo hereda.
    tipos: [...porTipo.keys()].sort(
      (a, b) => porTipo.get(b) - porTipo.get(a) || a.localeCompare(b, 'es'),
    ),
  };
}

/**
 * Índice de clase de un valor, o -1 si no tiene ninguna.
 * Las provincias sin ningún servicio quedan fuera de las clases y se dibujan en blanco,
 * como en el mapa de referencia: «sin dato» y «una unidad» no son lo mismo.
 */
export function claseDe(valor, clases = CLASES_POR_DEFECTO) {
  if (!(valor > 0)) return -1;
  for (let i = 0; i < clases.length; i++) {
    if (valor >= clases[i].desde && valor <= clases[i].hasta) return i;
  }
  return clases.length - 1;
}

/**
 * Clases realmente usadas, para que la leyenda no anuncie categorías vacías.
 * Se recalcula con el filtro de tipos activo: al dejar un solo tipo, ninguna provincia
 * llega a «10 o más» y esa entrada tiene que desaparecer de la leyenda.
 */
export function clasesUsadas(agregado, clases = CLASES_POR_DEFECTO) {
  const usadas = new Set();
  for (const prov of agregado.porUnidad.values()) {
    const i = claseDe(prov.tiposDistintos, clases);
    if (i >= 0) usadas.add(i);
  }
  return [...usadas].sort((a, b) => a - b);
}

/**
 * Reparte los íconos de una provincia en una cuadrícula compacta centrada en un punto.
 *
 * Se agrupan alrededor de un punto INTERIOR del polígono —el polo de inaccesibilidad,
 * que calcula el motor— y no del centroide: en una provincia cóncava o partida en
 * islas el centroide cae fuera y el grupo de íconos acabaría sobre la vecina.
 *
 * @param {number} n          cuántos íconos
 * @param {object} centro     {x, y} en milímetros
 * @param {number} tamanoMm   lado de cada ícono
 * @param {number} altoCifraMm altura del número bajo el ícono
 * @param {number} [columnas] por omisión, la cuadrícula más cuadrada
 * @returns {{posiciones: Array<{x, y}>, celdas, caja}} posición (centro horizontal,
 *          base) de cada ícono, y lo que ocupa (ver conCeldas)
 */
export function repartirIconos(n, centro, tamanoMm, altoCifraMm, columnas = Math.ceil(Math.sqrt(n))) {
  const filas = Math.ceil(n / columnas);
  const anchoCelda = tamanoMm * ANCHO_CELDA;
  const altoCelda = tamanoMm + altoCifraMm;
  const anchoTotal = columnas * anchoCelda;
  const altoTotal = filas * altoCelda;

  const salida = [];
  for (let i = 0; i < n; i++) {
    const fila = Math.floor(i / columnas);
    const col = i % columnas;
    /* La última fila se centra: con 5 íconos en 3 columnas, dejar los dos últimos
       alineados a la izquierda desequilibra el grupo sobre el punto que representa. */
    const enEstaFila = Math.min(columnas, n - fila * columnas);
    const sangria = ((columnas - enEstaFila) * anchoCelda) / 2;
    salida.push({
      x: centro.x - anchoTotal / 2 + sangria + anchoCelda * (col + 0.5),
      y: centro.y - altoTotal / 2 + altoCelda * (fila + 1) - altoCifraMm,
    });
  }
  return conCeldas(salida, tamanoMm, altoCifraMm);
}

/**
 * La cifra bajo cada ícono: cuántas sedes de ese tipo hay en la unidad.
 *
 * Iba en 5,2 pt y reservaba la altura de una línea entera de texto —con su sitio para
 * acentos y descendentes—, aunque una cifra no tiene ni lo uno ni lo otro: cada ícono
 * con su número ocupaba casi una vez y media su propio alto, y era ese hueco lo que
 * hacía que los grupos se pisaran. Ahora va en 3,8 pt, pegada al borde inferior del
 * círculo, y sólo se reserva el alto real de un dígito más un hilo de aire.
 *
 * @returns {{estilo, alto: number, base: number, halo: number}} el estilo del texto; lo
 *          que la cifra suma al alto de la celda del ícono; la distancia de la base del
 *          ícono a la línea base de la cifra; y el grosor de su halo, todo en milímetros
 */
export function cifraDeGrupo(factor) {
  const estilo = { familia: 'SourceSans3', variante: 'Semibold', pt: 3.8 * Math.sqrt(factor) };
  const digito = ptAmm(estilo.pt) * ALTO_DIGITO;
  const aire = digito * 0.15;
  return {
    estilo,
    alto: digito + aire * 2,
    base: aire + digito,
    halo: trazoMm.haloRotulo * factor * 0.5,
  };
}

/** Alto de un dígito de Source Sans 3, en fracción del cuerpo (las cifras no bajan). */
const ALTO_DIGITO = 0.66;

/** Ancho de la celda de un ícono, en fracción de su lado: el ícono y un hilo de aire. */
const ANCHO_CELDA = 1.12;

/**
 * Cómo se disponen los íconos de un grupo. La primera es la de por omisión.
 *
 * En la Fase 20 el anillo fue la de por omisión y el área usuaria prefirió la rejilla,
 * que se lee como una tabla: la rejilla volvió a serlo, pero ya no es la cuadrícula
 * fija de antes, sino que se adapta a la forma de la unidad (repartirEnRejilla).
 */
export const DISPOSICIONES = ['rejilla', 'anillo'];

/**
 * Reparte los íconos de un grupo en REJILLA, adaptada a la forma de su unidad.
 *
 * Es el punto medio entre la cuadrícula fija y el anillo de QGIS: se ve como una tabla
 * siempre que la unidad lo permite y, cuando no, sigue su forma.
 *
 *  0. Si se le pasa el nombre de la unidad, prueba antes a ponerse JUNTO A ÉL, como un
 *     solo bloque —el nombre encima de la rejilla o debajo, a un hilo—, corrido lo
 *     justo para que el bloque entero quepa dentro. El motor de rótulos encuentra luego
 *     ese hueco libre pegado a los íconos, que es su posición preferida. Sin esto la
 *     rejilla se plantaba en el centro de la unidad y el nombre, que va después, ya no
 *     cabía dentro por ningún lado.
 *  1. Si no, la cuadrícula compacta —la más cuadrada— si cabe entera dentro de la
 *     unidad. Es el caso de casi todas las provincias en una hoja grande.
 *  2. Si no, las demás cuadrículas, de la más cuadrada a la más alargada (dos filas,
 *     una fila, una columna…), cada una centrada en el punto y algo corrida, por si la
 *     unidad es angosta pero recta.
 *  3. Si ninguna cabe, se rellena la FORMA: las celdas de una cuadrícula sin bordes se
 *     toman de una en una a partir del punto, siempre la libre más cercana que toque a
 *     las ya puestas y que caiga dentro. En una provincia angosta y torcida el grupo se
 *     estira a lo largo de ella en vez de salirse por los lados.
 *
 * Gana la disposición que deja más íconos dentro de la unidad; a igualdad, la que va
 * antes en esa lista, que es la más parecida a una cuadrícula. En una unidad donde no
 * cabe ni un ícono —un distrito de Lima en el mapa del país— queda la compacta.
 *
 * Los íconos se ordenan siempre como se lee, de izquierda a derecha y de arriba abajo:
 * el tipo más frecuente va arriba a la izquierda, como en la cuadrícula de siempre.
 *
 * @param {object} [unidad]
 * @param {(x: number, y: number) => boolean} [unidad.dentro] si un punto cae en la
 *        unidad; sin ella, la cuadrícula compacta
 * @param {object} [unidad.rotulo] su nombre, medido con medirRotulo (etiquetas.js)
 * @param {Array<{x, y}>} [unidad.puntos] puntos interiores donde probar el bloque, el
 *        primero el preferido; por omisión, sólo el centro
 */
export function repartirEnRejilla(n, centro, tamanoMm, altoCifraMm, { dentro = null, rotulo = null, puntos = null } = {}) {
  const compacta = repartirIconos(n, centro, tamanoMm, altoCifraMm);
  /* Cuál salió, cuántos íconos dejó dentro y si se apartó para su nombre: lo que el
     informe necesita para revisar las unidades una por una. */
  const con = (reparto, forma, iconosDentro, conNombre = false) => ({
    ...reparto, forma, iconosDentro, conNombre,
  });
  if (!dentro) return con(compacta, 'compacta', null);

  const anchoCelda = tamanoMm * ANCHO_CELDA;
  const altoCelda = tamanoMm + altoCifraMm;
  /* Un ícono cabe si caen dentro el centro de su círculo, cuatro puntos de su borde y
     el centro de su cifra. Se mira el dibujo, no la celda: el aire entre celdas puede
     pisar la vecina sin que se note. */
  const cabe = ({ x, y }) => {
    const r = tamanoMm * 0.45;
    const cy = y - tamanoMm / 2;
    return dentro(x, cy) && dentro(x - r, cy) && dentro(x + r, cy)
      && dentro(x, cy - r) && dentro(x, y + altoCifraMm / 2);
  };
  const cuantosDentro = (posiciones) => posiciones.reduce((s, p) => s + (cabe(p) ? 1 : 0), 0);

  /* Las cuadrículas posibles, de la más cuadrada a la más alargada. Sólo las que no
     sobran: con 5 íconos, 4 columnas dan las mismas 2 filas que 3. */
  const columnasCompacta = Math.ceil(Math.sqrt(n));
  const formas = [];
  for (let columnas = 1; columnas <= n; columnas++) {
    const filas = Math.ceil(n / columnas);
    if (columnas > 1 && Math.ceil(n / (columnas - 1)) === filas) continue;
    if (columnas === columnasCompacta) continue;
    formas.push({ columnas, desproporcion: Math.abs(Math.log((columnas * anchoCelda) / (filas * altoCelda))) });
  }
  formas.sort((a, b) => a.desproporcion - b.desproporcion || a.columnas - b.columnas);

  /* 0. La rejilla con su nombre, como un bloque. El nombre va encima, debajo, a la
        derecha o a la izquierda, centrado: las mismas posiciones que el motor de
        rótulos prueba primero (PEGADAS, en etiquetas.js). Antes en una línea que en
        dos, y antes la cuadrícula más cuadrada que el sitio exacto. */
  if (rotulo) {
    const lugares = (puntos && puntos.length ? puntos : [centro]).slice(0, PUNTOS_DEL_BLOQUE);
    const { aire } = rotulo;
    /* Si el bloque no cabe entero, el que deje el nombre MENOS fuera, con todos los
       íconos dentro: en una provincia chica de un A4 el nombre no entra completo, pero
       correr la rejilla hacia un lado lo deja asomando un poco en vez de casi entero. */
    let mejorBloque = null;
    let menosFuera = FUERA_MAXIMA_DEL_BLOQUE;
    for (const columnas of [columnasCompacta, ...formas.map((f) => f.columnas)]) {
      const altoRejilla = Math.ceil(n / columnas) * altoCelda;
      const anchoRejilla = Math.min(n, columnas) * anchoCelda;
      for (const v of rotulo.variantes) {
        for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
          for (const p of lugares) {
            // El bloque se centra en el punto: la rejilla a un lado y el nombre al otro.
            const rejilla = { x: p.x - (dx * (v.ancho + aire)) / 2, y: p.y - (dy * (v.alto + aire)) / 2 };
            const cx = rejilla.x + dx * (anchoRejilla / 2 + aire + v.ancho / 2);
            const cy = rejilla.y + dy * (altoRejilla / 2 + aire + v.alto / 2);
            const nombre = { x: cx - v.ancho / 2, y: cy - v.alto / 2, ancho: v.ancho, alto: v.alto };
            const fuera = fraccionFuera(nombre, dentro);
            if (fuera > 0 && fuera >= menosFuera) continue;
            const reparto = repartirIconos(n, rejilla, tamanoMm, altoCifraMm, columnas);
            if (!reparto.posiciones.every(cabe)) continue;
            const bloque = {
              ...con(reparto, columnas === columnasCompacta ? 'compacta' : 'alargada', n, true),
              nombre: { caja: nombre, lineas: v.lineas, fuera },
            };
            if (fuera === 0) return bloque;
            mejorBloque = bloque;
            menosFuera = fuera;
          }
        }
      }
    }
    if (mejorBloque) return mejorBloque;
  }

  /* 1. La compacta, en el punto. */
  let mejor = con(compacta, 'compacta', cuantosDentro(compacta.posiciones));
  let mejorDentro = mejor.iconosDentro;
  if (mejorDentro === n) return mejor;

  /* 2. Las demás cuadrículas. */
  const corrimientos = [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]];
  for (const { columnas } of formas) {
    for (const [fx, fy] of corrimientos) {
      const punto = { x: centro.x + fx * anchoCelda, y: centro.y + fy * altoCelda };
      const reparto = repartirIconos(n, punto, tamanoMm, altoCifraMm, columnas);
      const d = cuantosDentro(reparto.posiciones);
      if (d > mejorDentro) { mejor = con(reparto, 'alargada', d); mejorDentro = d; }
      if (d === n) return mejor;
    }
  }

  /* 3. Rellenar la forma. La base de un ícono está `altoCelda / 2 - altoCifra` por
        debajo del centro de su celda. */
  const baseDe = (i, j) => ({
    x: centro.x + i * anchoCelda,
    y: centro.y + j * altoCelda + altoCelda / 2 - altoCifraMm,
  });
  const vistas = new Map();
  const frontera = [];
  const mirar = (i, j) => {
    const clave = `${i},${j}`;
    if (vistas.has(clave)) return;
    const p = baseDe(i, j);
    const celda = { i, j, p, dentro: cabe(p), distancia: Math.hypot(i * anchoCelda, j * altoCelda), orden: vistas.size };
    vistas.set(clave, celda);
    frontera.push(celda);
  };
  /* La más cercana de las que caen dentro y, si no queda ninguna, la más cercana de las
     de fuera: el grupo tiene que estar entero aunque la unidad no lo contenga. */
  const antes = (a, b) => {
    if (a.dentro !== b.dentro) return a.dentro;
    return (a.distancia - b.distancia || a.orden - b.orden) < 0;
  };
  mirar(0, 0);
  const elegidas = [];
  while (elegidas.length < n && frontera.length) {
    let k = 0;
    for (let t = 1; t < frontera.length; t++) if (antes(frontera[t], frontera[k])) k = t;
    const [c] = frontera.splice(k, 1);
    elegidas.push(c);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (di || dj) mirar(c.i + di, c.j + dj);
  }
  const forma = elegidas.filter((c) => c.dentro).length;
  if (forma <= mejorDentro) return mejor;

  elegidas.sort((a, b) => a.j - b.j || a.i - b.i);
  return con(conCeldas(elegidas.map((c) => c.p), tamanoMm, altoCifraMm), 'forma', forma);
}

/** Cuántos puntos interiores de la unidad se prueban para el bloque de rejilla y nombre:
    todos los que calcula el motor (PUNTOS_POR_ROTULO, en render.js). */
const PUNTOS_DEL_BLOQUE = 10;

/** Por encima de esta fracción del nombre fuera de su unidad, el bloque no compensa: la
    rejilla se queda en el centro y el nombre busca sitio por su cuenta. */
const FUERA_MAXIMA_DEL_BLOQUE = 0.5;

/**
 * Las celdas de un reparto y la caja que las envuelve.
 *
 * La celda de cada ícono es él más su cifra, con el aire de la rejilla a los lados.
 * Un grupo que sigue la forma de su unidad no es un rectángulo, así que se guardan las
 * celdas una a una: con la caja envolvente, un grupo en «L» estorbaría a los rótulos y
 * a los grupos vecinos en el hueco de la L, donde no hay nada.
 */
function conCeldas(posiciones, tamanoMm, altoCifraMm) {
  const ancho = tamanoMm * ANCHO_CELDA;
  const celdas = posiciones.map((p) => ({
    x: p.x - ancho / 2, y: p.y - tamanoMm, ancho, alto: tamanoMm + altoCifraMm,
  }));
  const x0 = Math.min(...celdas.map((c) => c.x));
  const y0 = Math.min(...celdas.map((c) => c.y));
  const x1 = Math.max(...celdas.map((c) => c.x + c.ancho));
  const y1 = Math.max(...celdas.map((c) => c.y + c.alto));
  return {
    posiciones, celdas, caja: { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 },
  };
}

/**
 * Reparte los íconos de un grupo en ANILLO alrededor del punto, como el
 * «desplazamiento de puntos» de QGIS.
 *
 * Cada ícono ocupa una celda —él y su cifra debajo— y la regla es que dos celdas
 * vecinas no se toquen. Con hasta seis íconos basta un anillo, del radio justo para eso
 * (la cuerda entre dos vecinos mide una celda). Con siete o más, uno va en el centro y
 * los demás en anillos concéntricos de una celda de separación, que es el empaquetado
 * del panal: caben 6 en el primero, 12 en el segundo, 18 en el tercero. Con 19 tipos,
 * los de Lima, sale 1 + 6 + 12 exactos. El último anillo, si queda a medias, se reparte
 * entero alrededor y no amontonado en un lado.
 *
 * El primero —el tipo más frecuente, por el orden que recibe— va en el centro o, sin
 * centro, arriba; los demás siguen en el sentido de las agujas del reloj.
 *
 * @returns {{posiciones: Array<{x, y}>, celdas, caja}} como repartirIconos
 */
export function repartirEnAnillo(n, centro, tamanoMm, altoCifraMm) {
  const altoCelda = tamanoMm + altoCifraMm;
  const celda = Math.max(tamanoMm * ANCHO_CELDA, altoCelda);
  /* El punto de cada ícono es el centro de su celda; la base del ícono, que es lo que
     se devuelve, queda medio alto de celda por debajo menos la cifra. */
  const base = (cx, cy) => ({ x: cx, y: cy - altoCelda / 2 + tamanoMm });

  if (n <= 1) return conCeldas([base(centro.x, centro.y)], tamanoMm, altoCifraMm);

  const centros = [];
  const enAnillo = (cuantos, radio) => {
    for (let i = 0; i < cuantos; i++) {
      const angulo = -Math.PI / 2 + (2 * Math.PI * i) / cuantos;
      centros.push([centro.x + radio * Math.cos(angulo), centro.y + radio * Math.sin(angulo)]);
    }
  };

  let radioExterior;
  if (n <= 6) {
    radioExterior = celda / (2 * Math.sin(Math.PI / n));
    enAnillo(n, radioExterior);
  } else {
    centros.push([centro.x, centro.y]);
    let quedan = n - 1;
    for (let k = 1; quedan > 0; k++) {
      const cabe = Math.floor(Math.PI / Math.asin(1 / (2 * k)));
      const aqui = Math.min(cabe, quedan);
      radioExterior = k * celda;
      enAnillo(aqui, radioExterior);
      quedan -= aqui;
    }
  }

  /* La caja es la de lo que ocupan las celdas, no el diámetro del anillo: medirla por
     el diámetro exageraba cuánto se estorban los grupos. */
  return conCeldas(centros.map(([cx, cy]) => base(cx, cy)), tamanoMm, altoCifraMm);
}

/**
 * Reparte un grupo según su disposición: 'rejilla' (por omisión) o 'anillo'.
 *
 * @param {object} [unidad] {dentro, rotulo, puntos}: para que la rejilla siga la forma
 *        de la unidad y deje sitio a su nombre (ver repartirEnRejilla)
 * @returns {{posiciones: Array<{x, y}>, celdas: Array, caja: object}} la base de cada
 *          ícono, la celda de cada uno (ícono y cifra) y la caja que las envuelve
 */
export function repartirGrupo(n, centro, tamanoMm, altoCifraMm, disposicion = DISPOSICIONES[0], unidad = {}) {
  if (disposicion === 'anillo') return repartirEnAnillo(n, centro, tamanoMm, altoCifraMm);
  return repartirEnRejilla(n, centro, tamanoMm, altoCifraMm, unidad);
}

/**
 * Mide cuánto se estorban los grupos de íconos entre sí.
 *
 * Es el criterio que decide si hace falta un recuadro de zoom: no se fijan a mano
 * Lima o Cusco, se detecta dónde los símbolos no caben. Devuelve, para cada grupo, la
 * fracción de su área que pisa la de otro.
 *
 * Se mide celda contra celda cuando el grupo las trae: uno que sigue la forma de su
 * unidad no es un rectángulo, y su caja envolvente pisaría a vecinos que no toca.
 */
export function medirApinamiento(grupos) {
  const solape = (a, b) => {
    const dx = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
    const dy = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  };
  const celdasDe = (g) => g.celdas || [g];
  return grupos.map((g, i) => {
    const propias = celdasDe(g);
    const area = propias.reduce((s, c) => s + c.ancho * c.alto, 0);
    let pisado = 0;
    for (let j = 0; j < grupos.length; j++) {
      // Primero las cajas: si no se tocan, sus celdas tampoco.
      if (j === i || !solape(g, grupos[j])) continue;
      for (const a of propias) for (const b of celdasDe(grupos[j])) pisado += solape(a, b);
    }
    return { ...g, apinamiento: area > 0 ? Math.min(1, pisado / area) : 0 };
  });
}
