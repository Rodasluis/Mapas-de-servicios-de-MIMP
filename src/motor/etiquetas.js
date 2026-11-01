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
 *     líneas, acostado, de pie o a lo largo de su unidad— y cada una lleva un coste: la
 *     parte que sale de su unidad, lejos de sus íconos, partida en dos líneas, girada,
 *     sobre el hueco reservado a otro nombre o encima de íconos cuesta más. Las que
 *     pisan la leyenda, un recuadro u otro bloque no son candidatas.
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
 * Y, desde la revisión de la Fase 21, dos pasadas más para lo que se quedó fuera, que
 * respetan lo ya puesto: CON LÍNEA —acostado sobre terreno despejado y una línea hasta
 * su unidad, donde el rótulo lo admite (los recuadros de zoom)— y CON LETRA MENOR (un
 * 15 %, `reduccion`), como el «callout» y la reducción de fuente de QGIS y ArcGIS.
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
import { el, grupo, textoConHalo, num } from './svg.js';
import { crearIndice, segmentoCruzaRectangulo, segmentosSeCruzan } from './colisiones.js';

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
 * Las REJILLAS PREVISTAS (render.js, prepararSimbolos): donde caerá la rejilla de cada
 * unidad si no cabe en otro sitio. Sólo las ve el nivel previo, que se coloca antes
 * que las rejillas. Tampoco son obstáculo duro, y cuestan menos que un ícono de
 * verdad: la rejilla suele poder correrse, y es peor que el nombre del departamento se
 * salga de su departamento a que se monte sobre un hueco que quizá quede libre.
 */
const ES_PREVISTA = (caja) => caja.nivel === 'prevista';
const ES_BLANDO = (caja) => ES_SIMBOLO(caja) || ES_PREVISTA(caja);

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
 * Los mismos múltiplos para un nombre CON LÍNEA, y más lejos: tiene que llegar hasta el
 * terreno despejado —el mar, en el recuadro de Lima y Callao—, que para un distrito de
 * tierra adentro queda a varios nombres de distancia.
 */
const DISTANCIAS_ENLACE = [1, 1.6, 2.4, 3.4, 4.6, 6];

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
 * Cuánto pueden rozar el límite de su unidad las letras de un rótulo ESTRICTO —los
 * distritos del mapa del país—, en fracción de los puntos de su contorno.
 *
 * Exigir cero dejaba fuera nombres que a la vista cabían: basta con que la punta de una
 * letra toque el borde. Con un 10 % el nombre sigue claramente dentro, con el centro
 * siempre dentro (revisión de la Fase 20). Con los íconos pasaba lo mismo: hasta la
 * revisión de la Fase 21 un rótulo estricto no podía ni rozarlos, y Cañaris, con todo su
 * distrito libre, se quedaba sin nombre en A1 porque cualquier posición junto a su ícono
 * lo tocaba un 3 % de la caja; ahora admite lo mismo que los demás (TAPADO_MAXIMO).
 */
export const FUERA_TOLERADA_ESTRICTO = 0.1;

/**
 * Cuánto de su caja puede tener un rótulo debajo de íconos, como mucho.
 *
 * Los rótulos se dibujan debajo de los símbolos, así que un nombre con media caja
 * bajo una rejilla no se lee: en el Perú A4 eran una treintena de provincias con sólo
 * unas letras sueltas a la vista. Por encima de esta fracción se omite, y queda
 * anotado. No vale para el nivel superior del mapa —los departamentos del país—, que
 * va en negrita y más grande, se lee igual y no puede faltar. Vale también para los
 * rótulos estrictos (los distritos del mapa del país), que hasta la revisión de la Fase
 * 21 no admitían ni un roce: en el Perú por distritos en A1 se ganan 16 nombres, ninguno
 * con más del 9 % de su caja bajo un ícono.
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
  /* El centro del rótulo fuera de su unidad. Más que todo lo que puede costar una
     posición entera dentro —el peor punto, la mayor distancia, dos líneas y lejos de
     sus íconos suman 1—, de modo que entera dentro gana siempre a con el centro fuera,
     también a la apilada con descuento (revisión de la Fase 21). */
  ASOMA: 0.6,
  LEJOS: 0.3, // del grupo de íconos, a partir de cuatro alturas de letra
  RESERVA_AJENA: 0.5, // encima del hueco que la rejilla de otra unidad dejó a su nombre
  /* Girado: gana a acostado sólo cuando acostado deja más de un tercio del nombre
     fuera de su unidad (FUERA × 1/3). */
  VERTICAL: 0.4,
  DIAGONAL: 0.5, // a lo largo del eje de la unidad: sólo cuando ni acostado ni de pie
  /* Un nombre del nivel grueso —un departamento en el mapa del país— que cae entero
     dentro de UNA sola de sus unidades se lee como el nombre de esa unidad: «CUSCO»
     en medio de La Convención decía que La Convención era Cusco (revisión de la Fase
     21). Cruzar un límite interior vale más que el mejor punto interior y que
     cualquier dirección, pero nunca que salirse del departamento: lo paga también
     toda posición que asome, así que entero dentro y cruzando gana a entero dentro en
     una sola, y las dos ganan a asomando. */
  UNA_SUBUNIDAD: 0.6,
  // Sobre una rejilla prevista (ES_PREVISTA), por la fracción de la caja que la tapa.
  SOBRE_PREVISTA: 1,
  /* Con LÍNEA hasta su unidad, acostado sobre terreno despejado (`enlace`): gana a de
     pie fuera de su unidad (VERTICAL + FUERA + ASOMA = 2) y pierde contra cualquier
     posición dentro, de pie incluida. Más la longitud de la línea, hasta diez alturas
     de letra: la más corta es la que menos territorio cruza. */
  ENLACE: 1.1,
  ENLACE_LARGO: 0.5,
  /* Más la fracción de la caja que tapa. Tiene que superar la suma de todo lo demás
     (3,7): los rótulos se dibujan debajo de los íconos, así que uno montado sobre
     ellos no sólo los tapa, también queda medio escondido. */
  SOBRE_SIMBOLOS: 4,
};

/**
 * Lo que descuenta FUERA un nombre APILADO: centrado justo encima o debajo de su rejilla
 * de íconos. En una provincia más estrecha que su nombre, el nombre sobresale por los
 * dos lados haga lo que haga; apilado sobre sus íconos se lee de quién es, mientras que
 * al costado de ellos, metido en la provincia vecina, parece de la vecina (Carlos
 * Fermín Fitzcarrald, Asunción, Aija en el Perú A3; revisión de la Fase 21). La rejilla
 * de íconos aplica el mismo descuento al dejarle sitio al nombre (servicios.js).
 *
 * Sólo se aplica cuando el nombre no cabe entero dentro de su unidad en ninguna
 * posición (ver candidatosDe): donde cabe, dentro gana siempre.
 */
export const DESCUENTO_APILADO = 0.5;

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
 * @param {number} [opciones.reduccion]  si se da, los nombres que se quedan sin sitio
 *                                       se intentan otra vez con el cuerpo multiplicado
 *                                       por este factor (0,85: un 15 % menor)
 * @returns {{svg: string, colocados: Array, omitidos: Array, porNivel: object}}
 */
export function colocarEtiquetas({
  solicitudes, indice, medidor, marco, factor = 1, reservas = [], reduccion = null,
}) {
  const ordenadas = [...solicitudes].sort(comparar);
  const indiceReservas = crearIndice();
  for (const r of reservas) indiceReservas.agregar(r);
  /* `enlaces`: las líneas ya puestas (pasadas anteriores), que ningún nombre ni
     ninguna otra línea puede cruzar. */
  const contexto = { indice, medidor, marco, reservas: indiceReservas, enlaces: [] };

  const piezas = [];
  const colocados = [];
  const omitidos = [];

  /**
   * Una pasada del motor sobre unas solicitudes: candidatos, solución, dibujo y
   * registro. Los colocados entran en el índice, así que la pasada siguiente los
   * respeta. Devuelve las solicitudes que se quedaron sin sitio, con sus candidatos.
   */
  const pasada = (lista, { reducido = false, sinEnlace = false } = {}) => {
    const rotulos = lista.map((s) => ({
      s, candidatos: candidatosDe(s, contexto, { sinEnlace }), altoLinea: medidor.alto(s.estilo),
    }));
    const eleccion = resolver(rotulos);
    const sinSitio = [];
    rotulos.forEach(({ s, candidatos }, i) => {
      if (eleccion[i] < 0) { sinSitio.push({ s, candidatos }); return; }
      const c = candidatos[eleccion[i]];
      piezas.push(dibujar(c, s, medidor, factor));
      indice.agregar({ ...c.caja, etiqueta: s.texto, nivel: s.nivel, id: s.id });
      if (c.enlace) contexto.enlaces.push(c.enlace);
      /* Lo que hace falta para revisar cada nombre uno por uno: cuánto sale de su
         unidad, a qué distancia queda de sus íconos, cuánto los tapa, si va con letra
         reducida y si lleva línea hasta su unidad. */
      colocados.push({
        id: s.id, texto: s.texto, nivel: s.nivel, lineas: c.lineas.length,
        vertical: c.giro === -90, giro: Number(c.giro.toFixed(1)),
        x: Number(c.caja.x.toFixed(2)), y: Number(c.caja.y.toFixed(2)),
        ancho: Number(c.caja.ancho.toFixed(2)), alto: Number(c.caja.alto.toFixed(2)),
        fueraPct: Math.round(c.fuera * 100),
        aGrupoMm: s.grupo ? Number(c.separacion.toFixed(2)) : null,
        sobreSimbolosPct: Math.round(c.sobreSimbolos * 100),
        reducido, enlace: Boolean(c.enlace),
      });
    });
    return sinSitio;
  };

  /* 1. Sin líneas: cada nombre dentro de su unidad, asomando o pegado a sus íconos. Un
        nombre que admite línea no toma aquí una posición peor que la que tendría con
        ella: espera a la pasada siguiente. */
  let sinSitio = pasada(ordenadas, { sinEnlace: true });

  /* 2. Con LÍNEA, los que admiten línea y se quedaron fuera. Va después de la primera
        pasada para que un nombre de tierra adentro, que sólo cabe sobre el mar con
        una línea larga, no le quite el sitio al de la costa, que lo tiene al lado de
        sus íconos: Chorrillos se quedaba sin nombre porque La Victoria y San Luis le
        ocupaban el mar (revisión de la Fase 21). */
  const admitenLinea = sinSitio.filter(({ s }) => s.enlace && s.despejado);
  if (admitenLinea.length) {
    const otraVez = pasada(admitenLinea.map(({ s }) => s));
    sinSitio = [...sinSitio.filter(({ s }) => !(s.enlace && s.despejado)), ...otraVez];
  }

  /* 3. Con LETRA MENOR, para los que se quedaron fuera: lo que hace ArcGIS
     con la reducción de tamaño de fuente. El censo de la Fase 21 mostró que en el Perú
     por distritos en A1 casi todos los distritos sin nombre son «estrechos» —cabe el
     alto del nombre, no el ancho—, y un 15 % menos de ancho decide muchos. Los ya
     colocados no se mueven: la pasada sólo rellena huecos, y el nombre reducido queda
     anotado (`reducido`) para que el censo lo cuente aparte. */
  if (reduccion && sinSitio.length) {
    const reducibles = sinSitio.filter(({ s }) => s.reducible !== false);
    const originales = new Map(reducibles.map(({ s }) => [s.id, s]));
    const otraVez = pasada(reducibles.map(({ s }) => ({
      ...s, estilo: { ...s.estilo, pt: s.estilo.pt * reduccion },
    })), { reducido: true });
    sinSitio = [
      ...sinSitio.filter(({ s }) => s.reducible === false),
      ...otraVez.map(({ s, candidatos }) => ({ s: originales.get(s.id), candidatos })),
    ];
  }

  for (const { s, candidatos } of sinSitio) {
    /* Por qué falta: o no tenía ninguna posición admisible —no cabe en su unidad, o
       sólo cabía sobre íconos o fuera del marco—, o las tenía y otros nombres las
       ocuparon. Son problemas distintos y se arreglan distinto. */
    /* Con lo que mide el nombre —a su cuerpo normal— y el mayor círculo interior de su
       unidad, para que el informe diga si no cabe porque la unidad es más chica que el
       nombre o porque el motor no encontró el hueco (Fase 21). */
    omitidos.push({
      id: s.id, texto: s.texto, nivel: s.nivel,
      motivo: candidatos.length ? 'sin hueco libre' : 'no cabe',
      anchoMm: Number(medidor.ancho(s.texto, s.estilo).toFixed(2)),
      altoMm: Number(medidor.alto(s.estilo).toFixed(2)),
      radioMm: Number((s.puntos[0]?.radioMm || 0).toFixed(2)),
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

/**
 * Las posiciones posibles de un rótulo, de la más barata a la más cara.
 *
 * Quedan fuera las que se salen del marco, las que pisan un obstáculo duro (todo lo del
 * índice que no sea un grupo de íconos) y, para un rótulo que asoma, las que se alejan
 * de su punto. Un rótulo ESTRICTO sólo admite posiciones enteras dentro de su unidad;
 * bajo íconos, como los demás, no más de TAPADO_MAXIMO.
 *
 * Si la unidad tiene grupo de íconos (`s.grupo`), se prueban primero las posiciones
 * pegadas a él y todas las demás pagan por la distancia que las separa de él.
 *
 * Con `sinEnlace` se devuelven sólo las posiciones sin línea y, para un rótulo que las
 * admite, sólo las que cuestan menos que su mejor posición con línea: las otras
 * esperan a la pasada con líneas.
 */
function candidatosDe(s, { indice, medidor, marco, reservas, enlaces = [] }, { sinEnlace = false } = {}) {
  const esAjena = (r) => r.id !== s.id;
  const { altoLetra, aire, variantes } = medirRotulo(s.texto, s.estilo, medidor, s.permitirDosLineas !== false);
  const ultimoPunto = Math.max(1, s.puntos.length - 1);
  const ancla = s.puntos[0];

  const lista = [];
  /** Prueba una posición y, si es admisible, la apunta con su coste. */
  /* `ancho` y `alto` son los del texto sin girar; `giro`, en grados, cómo va girado
     (0 acostado, -90 vertical, otro valor en diagonal). La caja con la que choca es la
     envolvente del texto girado. */
  /* `modo.apilado`: centrado encima o debajo de su rejilla (DESCUENTO_APILADO).
     `modo.enlace`: con línea hasta su unidad, sobre terreno despejado. */
  const probar = (cx, cy, ancho, alto, lineas, costeBase, punto, giro = 0, modo = {}) => {
    const env = envolvente(ancho, alto, giro);
    const caja = { x: cx - env.ancho / 2, y: cy - env.alto / 2, ancho: env.ancho, alto: env.alto };
    if (!dentroDe(marco, caja)) return;
    if (indice.choca(caja, HOLGURA_MM, ES_BLANDO)) return;
    // Ninguna línea ya puesta por encima de las letras.
    if (enlaces.some((e) => segmentoCruzaRectangulo(e, caja))) return;

    const centroDentro = !s.dentro || s.dentro(cx, cy);
    if (s.estricto && !centroDentro) return;
    const fuera = s.dentro ? fraccionFuera(caja, s.dentro, altoLetra, giro, { ancho, alto }) : 0;
    if (s.estricto && fuera > FUERA_TOLERADA_ESTRICTO) return;
    /* La distancia al grupo se cuenta desde el hilo de aire: pegado es cero. */
    const separacion = s.grupo ? Math.max(0, distanciaEntre(caja, s.grupo.caja) - aire * 1.01) : 0;
    let enlace = null;
    if (modo.enlace) {
      /* Con línea: todas las letras sobre terreno despejado —ninguna sobre una unidad
         del mapa— y una línea que llegue a sus íconos o, sin ellos, a su interior, de
         no más de diez alturas de letra: más larga cruza medio recuadro. */
      if (fraccionFuera(caja, s.despejado, altoLetra, giro, { ancho, alto }) > 0) return;
      enlace = trazoDeEnlace(caja, s.grupo ? s.grupo.caja : null, s.puntos[0]);
      if (!enlace || enlace.largo > altoLetra * 10) return;
      /* Y la línea no atraviesa ningún otro nombre ni ninguna otra línea: dos líneas
         que se cruzan no dicen cuál va a qué distrito (revisión de la Fase 21). Sobre
         íconos sí puede pasar (`atravesable`, las cajas de los grupos): en el centro
         de Lima no hay otro camino, y una línea sobre un ícono se sigue con la vista. */
      if (indice.cruza(enlace, (o) => ES_BLANDO(o) || o.atravesable)) return;
      if (enlaces.some((e) => segmentosSeCruzan(e, enlace))) return;
    } else if (!centroDentro && !(s.grupo && separacion === 0)) {
      /* Un rótulo tiene que señalar lo que nombra. En un distrito diminuto el nombre
         no cabe dentro por mucho que se busque, y omitirlo sería peor que dejarlo
         asomar, así que se admite que sobresalga mientras siga pegado a su punto de
         anclaje, que sí es interior, o a sus íconos, que dicen igual de bien de quién
         es. «Pegado» es a una letra y media de alto o, si el nombre es más largo que
         eso en esa dirección —de pie—, a la mitad de su largo: el nombre pasa por
         encima de su punto. Medido con la caja envolvente entera, un nombre de pie se
         iba dos provincias más allá (Carlos Fermín Fitzcarrald, Perú A3). */
      const margen = Math.max((punto.radioMm || 0) * 1.4, alto * 1.6, env.alto / 2);
      if (Math.hypot(cx - punto.x, cy - punto.y) > margen) return;
    }
    const sobreSimbolos = indice.areaSolapada(caja, ES_SIMBOLO) / (caja.ancho * caja.alto);
    if (s.prioridad > 1 && sobreSimbolos > TAPADO_MAXIMO) return;
    const sobrePrevista = s.subunidades ? indice.areaSolapada(caja, ES_PREVISTA) / (caja.ancho * caja.alto) : 0;

    /* El descuento por ir apilado se apunta aparte: sólo vale si el nombre no cabe
       entero dentro de ningún modo (se descuenta al final, ver `descuento`). */
    const descuento = !enlace && modo.apilado ? COSTE.FUERA * fuera * (1 - DESCUENTO_APILADO) : 0;
    const coste = costeBase
      + (lineas.length > 1 ? COSTE.DOS_LINEAS : 0)
      + (enlace
        ? COSTE.ENLACE + COSTE.ENLACE_LARGO * Math.min(1, enlace.largo / (altoLetra * 10))
        : COSTE.FUERA * fuera
          + (centroDentro ? 0 : COSTE.ASOMA)
          + (s.grupo ? COSTE.LEJOS * Math.min(1, separacion / (altoLetra * 4)) : 0))
      + (reservas.areaSolapada(caja, esAjena) > 0 ? COSTE.RESERVA_AJENA : 0)
      + (sobreSimbolos > 0 ? COSTE.SOBRE_SIMBOLOS + sobreSimbolos : 0)
      + COSTE.SOBRE_PREVISTA * sobrePrevista
      + (s.subunidades && (fuera > 0 || unidadesBajo(caja, s.subunidades, altoLetra, giro, { ancho, alto }) < 2)
        ? COSTE.UNA_SUBUNIDAD : 0);
    lista.push({
      caja, cx, cy, lineas, giro, coste, descuento, orden: lista.length, fuera, separacion, sobreSimbolos, enlace,
    });
  };

  variantes.forEach(({ lineas, ancho, alto }) => {
    /* 1. Pegado a sus íconos. */
    if (s.grupo) pegadoAlGrupo(ancho, alto, lineas, 0, 0);

    /* 2. Alrededor de los puntos interiores de la unidad. */
    alrededorDeLosPuntos(ancho, alto, lineas, 0, 0);
  });

  /* 3. En VERTICAL, en una línea, para los rótulos que lo admiten (`vertical`: los de
        minúsculas y los estrictos): pegado a su rejilla y alrededor de sus puntos. Es
        el último recurso, por su coste: muchos distritos de la sierra son altos y
        estrechos, y su nombre no cabe acostado aunque a la vista sobre sitio. Así lo
        hace QGIS con las unidades alargadas (revisión de la Fase 20; a todos los
        niveles en minúsculas desde la Fase 21). */
  if (s.vertical) {
    const { lineas, ancho, alto } = variantes[0];
    if (s.grupo) pegadoAlGrupo(ancho, alto, lineas, COSTE.VERTICAL, -90);
    alrededorDeLosPuntos(ancho, alto, lineas, COSTE.VERTICAL, -90);
  }

  /* 4. En DIAGONAL, a lo largo del eje de la unidad, cuando la unidad es alargada y
        oblicua (`giro`, de ejeDe en ocupacion.js). Muchos distritos de los valles de la
        sierra son largos y torcidos: ni acostado ni de pie les cabe el nombre, y a lo
        largo sí. Es lo que QGIS y ArcGIS llaman colocar el nombre según el eje del
        polígono (Fase 21). Sólo para los rótulos ESTRICTOS, donde la alternativa es que
        el nombre no salga: la caja envolvente de un nombre en diagonal es ancha y
        estorba a los vecinos, y en los niveles que admiten asomar se perdían más
        nombres de los que se ganaban. */
  if (s.estricto && Number.isFinite(s.giro)) {
    const { lineas, ancho, alto } = variantes[0];
    alrededorDeLosPuntos(ancho, alto, lineas, COSTE.DIAGONAL, s.giro);
  }

  /* 5. CON LÍNEA, acostado, sobre terreno despejado (`enlace`: los recuadros de zoom,
        donde el mar queda al lado de distritos que no admiten ni su nombre de pie).
        Es lo que QGIS llama «callout»: el nombre va fuera, sobre el mar, y una línea
        dice de qué distrito es. Antes esos nombres iban de pie sobre el mar sin nada
        que los uniera a su distrito (revisión de la Fase 21). */
  if (s.enlace && s.despejado) {
    variantes.forEach(({ lineas, ancho, alto }) => {
      alrededorDeLosPuntos(ancho, alto, lineas, 0, 0, { enlace: true });
    });
  }

  function pegadoAlGrupo(ancho, alto, lineas, extra, giro) {
    const g = s.grupo.caja;
    const env = envolvente(ancho, alto, giro);
    const enX = (a) => g.x + g.ancho / 2 + a * (g.ancho - env.ancho) / 2;
    const enY = (a) => g.y + g.alto / 2 + a * (g.alto - env.alto) / 2;
    const arriba = g.y - aire - env.alto / 2;
    const abajo = g.y + g.alto + aire + env.alto / 2;
    const izquierda = g.x - aire - env.ancho / 2;
    const derecha = g.x + g.ancho + aire + env.ancho / 2;
    PEGADAS.forEach(([lado, a], r) => {
      const [cx, cy] = lado === 'arriba' ? [enX(a), arriba]
        : lado === 'abajo' ? [enX(a), abajo]
          : lado === 'izquierda' ? [izquierda, enY(a)]
            : lado === 'derecha' ? [derecha, enY(a)]
              : [a[0] > 0 ? derecha : izquierda, a[1] > 0 ? abajo : arriba];
      const apilado = (lado === 'arriba' || lado === 'abajo') && a === 0;
      probar(cx, cy, ancho, alto, lineas, extra + COSTE.PEGADA * r, ancla, giro, { apilado });
    });
  }

  function alrededorDeLosPuntos(ancho, alto, lineas, extra, giro, modo = {}) {
    const env = envolvente(ancho, alto, giro);
    const distancias = modo.enlace ? DISTANCIAS_ENLACE : DISTANCIAS;
    s.puntos.forEach((punto, p) => {
      distancias.forEach((distancia, d) => {
        DIRECCIONES.forEach(([dx, dy], r) => {
          if (d > 0 && dx === 0 && dy === 0) return; // el centro no se repite
          const cx = punto.x + dx * (env.ancho / 2 + aire) * distancia;
          const cy = punto.y + dy * (env.alto / 2 + aire) * distancia;
          probar(cx, cy, ancho, alto, lineas,
            extra + COSTE.PUNTO * (p / ultimoPunto) + COSTE.DISTANCIA * d + COSTE.DIRECCION * r, punto, giro, modo);
        });
      });
    });
  }

  /* El descuento por ir apilado (DESCUENTO_APILADO) sólo si el nombre no tiene NINGUNA
     posición entera dentro: donde cabe dentro, dentro gana; donde no, sobre sus íconos
     gana a al costado de ellos. Sin esta condición, en el Perú A4 una docena de
     provincias cambiaba su nombre entero dentro —lejos de sus íconos— por uno apilado
     que asomaba. */
  if (!lista.some((c) => c.fuera === 0)) for (const c of lista) c.coste -= c.descuento;
  /* Orden estable: a igual coste, el de generación, que ya va de lo preferido a lo
     menos preferido. */
  lista.sort((a, b) => a.coste - b.coste || a.orden - b.orden);
  let admisibles = lista;
  if (sinEnlace) {
    const mejorConLinea = lista.find((c) => c.enlace);
    admisibles = lista.filter((c) => !c.enlace && (!mejorConLinea || c.coste < mejorConLinea.coste));
  }
  /* Los estrictos conservan el doble: tienen pocas posiciones admisibles y cada una
     que se guarda es una oportunidad más cuando otro nombre les ocupa la mejor. */
  return admisibles.slice(0, s.estricto ? MAXIMO_CANDIDATOS * 2 : MAXIMO_CANDIDATOS);
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
  // Las líneas de los rótulos colocados que llevan línea, por rótulo.
  const enlaces = new Map();
  const poner = (i, k) => {
    eleccion[i] = k;
    ocupacion.agregar(i, rotulos[i].candidatos[k].caja, hxDe(i));
    if (rotulos[i].candidatos[k].enlace) enlaces.set(i, rotulos[i].candidatos[k].enlace);
  };
  const quitar = (i) => {
    ocupacion.quitar(i, rotulos[i].candidatos[eleccion[i]].caja);
    enlaces.delete(i);
    eleccion[i] = -1;
  };
  /**
   * Rótulos colocados con los que chocaría el rótulo `i` en este candidato (sin
   * contarse): los de caja contra caja y, si hay líneas, los de una línea contra la
   * caja o la línea del otro. Una línea que cruza otra o pasa sobre un nombre no dice
   * de quién es. Las líneas son pocas y sólo las hay en los recuadros, así que se
   * recorren una a una.
   */
  const choques = (c, i) => {
    const lista = ocupacion.chocan(c.caja, HOLGURA_MM, hxDe(i)).filter((j) => j !== i);
    if (!enlaces.size && !c.enlace) return lista;
    const vistos = new Set(lista);
    const anotar = (j) => { if (!vistos.has(j)) { vistos.add(j); lista.push(j); } };
    for (const [j, e] of enlaces) {
      if (j === i) continue;
      if (segmentoCruzaRectangulo(e, c.caja) || (c.enlace && segmentosSeCruzan(e, c.enlace))) anotar(j);
    }
    if (c.enlace) {
      for (let j = 0; j < rotulos.length; j++) {
        if (j === i || eleccion[j] < 0) continue;
        if (segmentoCruzaRectangulo(c.enlace, rotulos[j].candidatos[eleccion[j]].caja)) anotar(j);
      }
    }
    return lista;
  };
  /** El candidato libre más barato de un rótulo, o -1. */
  const mejorLibre = (i) => rotulos[i].candidatos.findIndex((c) => choques(c, i).length === 0);

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
        const estorban = choques(candidatos[k], i);
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
 * lados.
 *
 * Y se miran sobre la franja que ocupan las LETRAS, no sobre la caja: en Source Sans 3
 * la caja de una línea mide 1,326 em —ascenso más descenso—, y las mayúsculas y las
 * astas empiezan a un 27 % de su alto y la línea base queda a un 15 % del pie. Lo de
 * arriba es aire para acentos y lo de abajo, para las colas de la «g» o la «p». Medida
 * sobre la caja, un nombre que sólo rozaba el límite con ese aire contaba como fuera, y
 * en el mapa del país por distritos se perdían cientos de nombres que a la vista cabían
 * (revisión de la Fase 20).
 *
 * @param {number} [altoLetra] alto de UNA línea; por omisión, el de la caja
 */
export function fraccionFuera(r, dentro, altoLetra = r.alto, giro = 0, texto = null) {
  let fuera = 0; let total = 0;
  recorrerLetras(r, altoLetra, giro, texto, (x, y) => { total++; if (!dentro(x, y)) fuera++; });
  return fuera / total;
}

/**
 * Cuántas unidades distintas hay debajo de las letras de un rótulo, hasta dos: con dos
 * ya cruza un límite interior, que es lo que se quiere saber (COSTE.UNA_SUBUNIDAD).
 * Los puntos que no caen en ninguna no cuentan.
 *
 * @param {Array<(x, y) => boolean>} subunidades pruebas de interior, una por unidad
 */
export function unidadesBajo(r, subunidades, altoLetra = r.alto, giro = 0, texto = null) {
  let primera = -1; let distintas = 0;
  recorrerLetras(r, altoLetra, giro, texto, (x, y) => {
    if (distintas >= 2) return;
    const k = subunidades.findIndex((dentro) => dentro(x, y));
    if (k < 0) return;
    if (primera < 0) { primera = k; distintas = 1; } else if (k !== primera) distintas = 2;
  });
  return distintas;
}

/**
 * Recorre los puntos de muestra de la franja de las letras de un rótulo, llamando a
 * `mirar(x, y)` con cada uno en el sistema del mapa.
 *
 * `r` es la caja envolvente del texto, que puede ir girado `giro` grados (`true` vale
 * por -90, el vertical). Se mide en el sistema del texto y se gira cada punto al
 * mirarlo. Acostado o de pie, las medidas del texto salen de la caja; en diagonal hay
 * que darlas en `texto`.
 */
function recorrerLetras(r, altoLetra, giro, texto, mirar) {
  const angulo = giro === true ? -90 : (giro || 0);
  const dePie = Math.abs(Math.abs(angulo) - 90) < 1e-9;
  const largo = texto ? texto.ancho : dePie ? r.alto : r.ancho;
  const corto = texto ? texto.alto : dePie ? r.ancho : r.alto;
  const cx = r.x + r.ancho / 2; const cy = r.y + r.alto / 2;
  const rad = (angulo * Math.PI) / 180; const cos = Math.cos(rad); const sen = Math.sin(rad);
  const m = largo * 0.02;
  const a0 = m; const a1 = largo - m; // a lo largo del texto
  const b0 = altoLetra * 0.27; const b1 = corto - altoLetra * 0.15; // de arriba a la base
  const columnas = Math.max(2, Math.min(8, Math.ceil(largo / corto) + 1));
  const en = (a, b) => {
    const u = a - largo / 2; const v = b - corto / 2;
    mirar(cx + u * cos - v * sen, cy + u * sen + v * cos);
  };
  for (let c = 0; c < columnas; c++) {
    const a = a0 + ((a1 - a0) * c) / (columnas - 1);
    en(a, b0);
    en(a, b1);
  }
  en(a0, (b0 + b1) / 2);
  en(a1, (b0 + b1) / 2);
}

/**
 * La línea que une un nombre con línea (`enlace`) con lo que nombra: desde el borde de
 * su caja hasta el borde de la caja de sus íconos o, sin íconos, hasta el punto
 * interior de su unidad. Sale del centro de la caja del nombre en dirección al
 * destino y se recorta en los dos bordes, para que no pise ni las letras ni los
 * íconos. Si las dos cajas se tocan no hay nada que unir.
 *
 * @returns {{x1, y1, x2, y2, largo}|null}
 */
function trazoDeEnlace(caja, cajaDestino, punto) {
  const desde = { x: caja.x + caja.ancho / 2, y: caja.y + caja.alto / 2 };
  const hasta = cajaDestino
    ? { x: cajaDestino.x + cajaDestino.ancho / 2, y: cajaDestino.y + cajaDestino.alto / 2 }
    : { x: punto.x, y: punto.y };
  const a = salidaDeCaja(caja, desde, hasta);
  const b = cajaDestino ? salidaDeCaja(cajaDestino, hasta, desde) : hasta;
  if (!a || !b) return null;
  const largo = Math.hypot(b.x - a.x, b.y - a.y);
  // Con la línea más corta que una letra, las cajas casi se tocan: no hace falta.
  if (largo < caja.alto * 0.5) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, largo };
}

/** Dónde sale de la caja el segmento que va de `desde` (dentro de ella) a `hasta`. */
function salidaDeCaja(caja, desde, hasta) {
  const dx = hasta.x - desde.x; const dy = hasta.y - desde.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (caja.x + caja.ancho - desde.x) / dx);
  if (dx < 0) t = Math.min(t, (caja.x - desde.x) / dx);
  if (dy > 0) t = Math.min(t, (caja.y + caja.alto - desde.y) / dy);
  if (dy < 0) t = Math.min(t, (caja.y - desde.y) / dy);
  if (!Number.isFinite(t) || t > 1) return null;
  return { x: desde.x + dx * t, y: desde.y + dy * t };
}

/** Caja envolvente, sin girar, de un texto de `ancho` × `alto` girado `giro` grados. */
export function envolvente(ancho, alto, giro = 0) {
  if (!giro) return { ancho, alto };
  const rad = (giro * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)); const sen = Math.abs(Math.sin(rad));
  return { ancho: ancho * cos + alto * sen, alto: ancho * sen + alto * cos };
}

/** Distancia entre dos rectángulos; cero si se tocan o se solapan. */
const distanciaEntre = (a, b) => Math.hypot(
  Math.max(0, b.x - (a.x + a.ancho), a.x - (b.x + b.ancho)),
  Math.max(0, b.y - (a.y + a.alto), a.y - (b.y + b.alto)),
);

const dentroDe = (contenedor, r) => r.x >= contenedor.x && r.y >= contenedor.y
  && r.x + r.ancho <= contenedor.x + contenedor.ancho
  && r.y + r.alto <= contenedor.y + contenedor.alto;

/* En vertical se dibuja como en horizontal, centrado en el mismo punto, y se gira un
   cuarto de vuelta a la izquierda: se lee de abajo arriba, como los números de la
   retícula. Un nombre con línea lleva la línea delante, en su misma tinta, y como
   empieza en el borde de la caja no pisa las letras. */
function dibujar({ lineas, cx, cy, giro = 0, enlace = null }, s, medidor, factor) {
  const alturaLinea = medidor.alto(s.estilo) * 0.92;
  const primera = cy - ((lineas.length - 1) * alturaLinea) / 2 + medidor.alto(s.estilo) * 0.32;
  const halo = {
    colorHalo: color.halo,
    grosorMm: (s.haloMm ?? trazoMm.haloRotulo) * Math.sqrt(factor),
    medidor,
    estilo: s.estilo,
  };
  const girado = giro ? { transform: `rotate(${num(giro, 2)} ${num(cx)} ${num(cy)})` } : {};
  const linea = enlace ? [el('line', {
    x1: num(enlace.x1), y1: num(enlace.y1), x2: num(enlace.x2), y2: num(enlace.y2),
    stroke: s.color || color.tinta,
    'stroke-width': num(trazoMm.enlaceRotulo * Math.sqrt(factor), 3),
    'stroke-linecap': 'round',
  })] : [];
  return grupo(girado, [...linea, ...lineas.map((texto, i) => textoConHalo(texto, {
    x: num(cx),
    y: num(primera + i * alturaLinea),
    'text-anchor': 'middle',
    fill: s.color || color.tinta,
    'font-family': s.estilo.familia,
    'font-size': ptAmm(s.estilo.pt),
    'font-weight': s.peso_ || (s.estilo.variante === 'Bold' ? 700 : 400),
  }, halo))]);
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
 * @param {boolean} [o.vertical] si, cuando acostado no cabe, puede ir girado un cuarto
 *                               de vuelta (en una línea)
 * @param {number|null} [o.giro] el eje de la unidad en grados (ejeDe, en ocupacion.js)
 *                               si es alargada y oblicua: con `vertical`, el nombre
 *                               puede ir también a lo largo de ese eje
 * @param {Array<(x, y) => boolean>} [o.subunidades] pruebas de interior de las unidades
 *                               que componen la de este rótulo (las provincias de un
 *                               departamento): el nombre prefiere cruzar un límite
 *                               entre dos de ellas a caer entero dentro de una
 * @param {boolean} [o.enlace]   si, cuando no cabe de otro modo, puede ir acostado
 *                               sobre terreno despejado con una línea hasta su unidad
 * @param {(x, y) => boolean} [o.despejado] con `enlace`: si un punto está libre de
 *                               unidades del mapa (el mar)
 * @param {boolean} [o.reducible] si puede ir con letra menor cuando no cabe (véase
 *                               `reduccion` en colocarEtiquetas); por omisión, sí
 */
export function crearSolicitud(o) {
  return {
    permitirDosLineas: true, vertical: false, giro: null, subunidades: null,
    enlace: false, despejado: null, reducible: true, ...o,
  };
}
