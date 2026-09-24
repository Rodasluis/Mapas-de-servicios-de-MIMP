/**
 * Recuadros de zoom: el mismo mapa, ampliado donde hace falta.
 *
 * Dos decisiones gobiernan este módulo.
 *
 * QUÉ SE AMPLÍA. En modo automático no hay una lista de «amplía Lima y Cusco»: el
 * motor mide, provincia a provincia, qué fracción del grupo de íconos pisa la del
 * vecino (servicios.js → medirApinamiento) y amplía donde se estorban. El criterio vale
 * para cualquier hoja y cualquier filtro: al dejar un solo tipo activo los símbolos
 * dejan de estorbarse y los recuadros desaparecen solos.
 *
 * DE QUIÉN ES CADA RECUADRO. Uno por DEPARTAMENTO, y se llama por su nombre. Antes la
 * región se armaba fusionando cajas de provincias apiñadas que se tocaban, y salían
 * conjuntos sin correspondencia con ninguna división real —tres provincias de Áncash,
 * una de La Libertad y media de Huánuco— que sólo se podían rotular «Zoom 1». Un
 * recuadro que hay que ir a buscar al mapa para saber de dónde sale no es un zoom: es
 * otro mapa suelto. Ahora dice «Cusco» y dentro sólo hay provincias de Cusco.
 *
 * QUÉ TROZO DEL DEPARTAMENTO. El del conglomerado que se estorba, no el departamento
 * entero: Cusco ocupa 154 × 185 mm en un A1 y el mayor hueco libre de la lámina son
 * 151 × 180, así que ampliarlo completo daría el mismo dibujo a la misma escala. El
 * rectángulo de referencia sobre el mapa principal dice qué trozo se ha ampliado.
 *
 * CUÁNTO MIDE Y DÓNDE VA. No se coloca en un anclaje con tamaño fijo: cada recuadro le
 * pregunta a la rejilla de ocupación por el MAYOR HUECO LIBRE CON SU PROPORCIÓN. De ahí
 * salen dos cosas a la vez. El tamaño se adapta al formato —en A0 el Pacífico deja una
 * franja enorme y el recuadro crece, en A4 apenas cabe uno pequeño— y la forma de la
 * zona decide la ubicación: una zona alargada en vertical encaja en el mar, que es alto
 * y estrecho, y una alargada en horizontal sobre Brasil, que es ancho. Cuando ya no
 * queda hueco se dejan de dibujar, y ése es el máximo dinámico.
 */
import { geoBounds } from 'd3-geo';
import { crearProyeccion, crearRuta } from './proyeccion.js';
import { claseDe, repartirIconos } from './servicios.js';
import { dibujarIcono } from '../iconos/index.js';
import { geoPath } from 'd3-geo';
import {
  mayorRectanguloLibre, rectangulo, recolectorDeAnillos, polosDeInaccesibilidad,
  puntoEnAnillos,
} from './ocupacion.js';
import { crearIndice } from './colisiones.js';
import { colocarEtiquetas, crearSolicitud } from './etiquetas.js';
import { tipografia } from '../estilo/tokens.js';
import { color, trazoMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, textoConHalo, rect } from './svg.js';

/** Por debajo de esta ampliación el recuadro repite el mapa en vez de ampliarlo. */
export const AMPLIACION_MINIMA = 1.5;

/** Por debajo de este lado el recuadro no aporta nada legible. */
export const LADO_MINIMO_MM = 34;

/**
 * Cuántos recuadros caben como mucho según el formato.
 *
 * Es un tope duro por encima del que no se intenta nada; el número REAL lo decide el
 * hueco libre, que es lo que se agota primero. A4 admite uno, A0 hasta cuatro.
 */
export function maximoPorFormato(factor) {
  return Math.max(1, Math.min(4, Math.round(factor * 1.15)));
}

/** Separación entre el recuadro y lo que lo rodea. */
const AIRE_MM = 2.5;

/**
 * Zonas ampliables: una por DEPARTAMENTO, con dos excepciones en Lima.
 *
 * Un recuadro tiene que poder nombrarse. Cuando la región se armaba fusionando cajas
 * de provincias apiñadas que se tocaban, salían conjuntos que no correspondían a
 * ninguna división real —tres provincias de Áncash, una de La Libertad y media de
 * Huánuco— y no había manera de rotularlos sin enumerarlos. Agrupando por departamento,
 * el recuadro se llama «Cusco» y muestra Cusco entero: sus catorce provincias, ninguna
 * de Apurímac ni de Puno.
 *
 * Las dos excepciones son Lima, y no son un capricho administrativo:
 *
 * - **Lima Metropolitana y Callao van juntos.** Son dos ámbitos distintos en el papel y
 *   una sola mancha urbana en el mapa: Callao está rodeado por Lima y sus símbolos se
 *   estorban entre sí. Ampliarlos por separado daría dos recuadros que enseñan lo mismo.
 * - **Lima provincias va aparte.** Las otras nueve provincias del departamento se
 *   extienden trescientos kilómetros al norte y al sur; meterlas en el mismo recuadro
 *   que la metrópoli obligaría a una escala en la que la conurbación —que es lo
 *   apiñado— volvería a ser un punto.
 */
export const LIMA_METROPOLITANA = '1501';
export const CALLAO = '07';
export const LIMA = '15';

/** A qué zona ampliable pertenece una provincia, y cómo se llama esa zona. */
export function zonaDe(ubigeo, nombreDepartamento) {
  const ccdd = ubigeo.slice(0, 2);
  if (ubigeo === LIMA_METROPOLITANA || ccdd === CALLAO) {
    return { clave: 'lima-callao', nombre: 'Lima Metropolitana y Callao' };
  }
  if (ccdd === LIMA) return { clave: 'lima-provincias', nombre: 'Lima provincias' };
  return { clave: ccdd, nombre: nombreDepartamento || `Departamento ${ccdd}` };
}

/** ¿Esta provincia pertenece a esa zona? */
const enZona = (ubigeo, clave) => {
  if (clave === 'lima-callao') return ubigeo === LIMA_METROPOLITANA || ubigeo.startsWith(CALLAO);
  if (clave === 'lima-provincias') return ubigeo.startsWith(LIMA) && ubigeo !== LIMA_METROPOLITANA;
  return ubigeo.startsWith(clave);
};

/**
 * Agrupa por zona las provincias cuyos símbolos se estorban.
 *
 * @param {Array} grupos      grupos de íconos ya medidos (con su apiñamiento)
 * @param {number} umbral     por encima de esta fracción pisada, la provincia pide zoom
 * @param {object} provincias colección de rasgos de provincia
 * @param {Map} anillos       geometría proyectada por rasgo
 * @param {Map} nombresDep    ccdd → nombre del departamento
 * @param {number} margenMm   aire alrededor de la zona en el mapa principal
 */
export function agruparPorZona({ grupos, umbral, provincias, anillos, nombresDep, margenMm }) {
  const apinadas = grupos.filter((g) => g.apinamiento > umbral);
  if (!apinadas.length) return [];

  /* Qué zonas piden ampliación, y con cuánta urgencia. */
  const zonas = new Map();
  for (const g of apinadas) {
    const z = zonaDe(g.ccpp, nombresDep.get(g.ccpp.slice(0, 2)));
    let zona = zonas.get(z.clave);
    if (!zona) {
      zona = { ...z, apinamiento: 0, apinadas: [], cajas: [] };
      zonas.set(z.clave, zona);
    }
    zona.apinamiento = Math.max(zona.apinamiento, g.apinamiento);
    zona.apinadas.push(g.nombre);
    /* La caja del grupo de íconos, que es lo que hay que separar. En selección manual
       los «grupos» no traen caja y se usa la de la provincia entera. */
    zona.cajas.push(g.ancho ? g : cajaDe(anillos.get(
      provincias.features.find((f) => f.properties.ubigeo === g.ccpp),
    )));
  }
  for (const zona of zonas.values()) zona.cajas = zona.cajas.filter(Boolean);

  /* El recuadro encuadra el CONGLOMERADO apiñado, no el departamento entero, y dibuja
     las provincias de ese departamento que caen dentro del encuadre.

     Encuadrar el departamento completo parece lo natural y no funciona: Cusco ocupa
     154 × 185 mm en un A1 y el mayor hueco libre de la lámina son 151 × 180, así que
     el «zoom» saldría a tamaño 1:1 —el mismo dibujo dos veces— y los símbolos seguirían
     pisándose igual. Lo que hay que separar es el racimo de provincias que se estorban,
     que en Cusco son las del entorno de la ciudad y caben en una cuarta parte de eso.
     El rectángulo de referencia sobre el mapa principal dice qué trozo se ha ampliado,
     y el título dice de qué departamento es. */
  const regiones = [];
  for (const zona of zonas.values()) {
    const cajas = zona.cajas;
    if (!cajas.length) continue;
    const x0 = Math.min(...cajas.map((c) => c.x)) - margenMm;
    const y0 = Math.min(...cajas.map((c) => c.y)) - margenMm;
    const x1 = Math.max(...cajas.map((c) => c.x + c.ancho)) + margenMm;
    const y1 = Math.max(...cajas.map((c) => c.y + c.alto)) + margenMm;
    const region = { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };

    /* Sólo provincias de la zona: antes se tomaban todas las que tocaban el rectángulo
       y un recuadro de Áncash acababa enseñando también provincias de La Libertad y de
       Huánuco, de modo que al mirarlo no se sabía dónde acaba lo que se amplía. */
    const miembros = provincias.features.filter((f) => {
      if (!enZona(f.properties.ubigeo, zona.clave)) return false;
      const caja = cajaDe(anillos.get(f));
      return caja && rectangulo.seSolapan(region, caja);
    });
    if (!miembros.length) continue;

    regiones.push({ ...zona, ...region, miembros });
  }

  /* Por gravedad y, a igualdad, por cuántas provincias de la zona están apiñadas: un
     100 % en una provincia suelta importa menos que un 80 % en media región. */
  return regiones.sort(
    (a, b) => b.apinamiento - a.apinamiento
      || b.apinadas.length - a.apinadas.length
      || a.clave.localeCompare(b.clave),
  );
}

/**
 * Regiones a partir de una selección manual.
 *
 * Se agrupan por la MISMA regla que en automático —una zona por departamento, con Lima
 * partida en metrópoli y provincias—, para que elegir a mano no dé un recuadro con otra
 * lógica que el que habría salido solo. Admite ubigeos de provincia o de departamento;
 * seleccionar «08» y seleccionar sus catorce provincias dan lo mismo.
 */
function regionesManuales({ seleccion, provincias, anillos, nombresDep, margenMm }) {
  const pedidas = new Set(seleccion.map(String));
  const coincide = (ubigeo) => pedidas.has(ubigeo) || pedidas.has(ubigeo.slice(0, 2));

  const elegidas = provincias.features
    .filter((f) => coincide(f.properties.ubigeo))
    .map((f) => ({
      ccpp: f.properties.ubigeo,
      nombre: f.properties.nombre,
      apinamiento: 1,
    }));

  return agruparPorZona({
    grupos: elegidas, umbral: 0, provincias, anillos, nombresDep, margenMm,
  });
}

/**
 * Construye los recuadros de zoom, ya dimensionados y colocados.
 *
 * @returns {{colocados, referencias, regiones, avisos, capacidad}}
 */
export function construirRecuadros({
  modo = 'auto', seleccion = [], grupos, umbral, provincias, departamentos, anillos, agregado,
  clases, rampa, iconos, medidor, factor, tamanoIcono, marco, ocupacion, maximo,
}) {
  const nombresDep = new Map(
    (departamentos?.features || []).map((f) => [f.properties.ubigeo, f.properties.nombre]),
  );
  const tope = maximo ?? maximoPorFormato(factor);
  const vacio = {
    colocados: [],
    referencias: '',
    regiones: [],
    avisos: [],
    capacidad: { tope, colocados: 0, cabeOtro: false },
  };
  if (modo === 'ninguno') return vacio;

  const margen = tamanoIcono * 0.8;
  const candidatas = modo === 'manual'
    ? regionesManuales({ seleccion, provincias, anillos, nombresDep, margenMm: margen })
    : agruparPorZona({ grupos, umbral, provincias, anillos, nombresDep, margenMm: margen });
  if (!candidatas.length) return vacio;

  const eTitulo = { familia: 'Poppins', variante: 'SemiBold', pt: 7 * Math.sqrt(factor) };
  const eCifra = { familia: 'SourceSans3', variante: 'Semibold', pt: 5.2 * Math.sqrt(factor) };
  const altoCifra = medidor.alto(eCifra) * 0.95;
  const cabecera = medidor.alto(eTitulo) * 1.5;
  const borde = trazoMm.recuadroZoom;

  /* Tope por recuadro para que el primero no se quede con todo el hueco libre. */
  const ladoMaximo = Math.min(marco.ancho, marco.alto) * 0.48;

  const colocados = [];
  const referencias = [];
  const resumen = [];
  const avisos = [];

  for (const region of candidatas) {
    if (colocados.length >= tope) {
      avisos.push(`Quedaron ${candidatas.length - colocados.length} zona(s) sin ampliar:`
        + ` en esta hoja caben ${tope} recuadro(s).`);
      break;
    }

    /* Los miembros son las provincias de la ZONA, ni una más. Antes se tomaban las
       que tocaban el rectángulo de la región, y así un recuadro de Áncash acababa
       enseñando también provincias de La Libertad y de Huánuco: al mirarlo no se sabía
       dónde empieza y acaba lo que se está ampliando. */
    const miembros = region.miembros;
    if (!miembros.length) continue;

    const sub = { type: 'FeatureCollection', features: miembros };
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(sub);
    const proporcionZona = Math.abs((lon1 - lon0) * Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180)))
      / Math.max(1e-6, Math.abs(lat1 - lat0));

    /* Se pregunta por el hueco con la proporción del RECUADRO COMPLETO —cabecera y
       bordes incluidos—, no con la de la zona: es la caja que de verdad hay que
       encajar, y con zonas pequeñas la cabecera pesa lo suyo.

       La proporción de la caja depende de su altura (la cabecera es fija y pesa más
       cuanto menor sea el recuadro), y la altura depende del hueco que se encuentre:
       es circular. Se resuelve con dos pasadas —una con una altura de tanteo y otra
       con la que devolvió la primera—, que basta para que el mapa llene la caja en
       vez de quedarse con franjas vacías arriba y abajo. */
    const aspectoDe = (alturaMapa) => (alturaMapa * proporcionZona + borde * 2)
      / (alturaMapa + cabecera + borde * 2);

    let hueco = null;
    let alturaMapa = Math.max(LADO_MINIMO_MM, LADO_MINIMO_MM / Math.max(0.3, proporcionZona));
    for (let pasada = 0; pasada < 2; pasada++) {
      const encontrado = mayorRectanguloLibre(ocupacion, {
        aspecto: aspectoDe(alturaMapa),
        region: marco,
        minLadoMm: LADO_MINIMO_MM,
        maxLadoMm: ladoMaximo,
      });
      if (!encontrado) break;
      hueco = encontrado;
      alturaMapa = encontrado.alto - AIRE_MM - cabecera - borde * 2;
      if (alturaMapa <= 0) { hueco = null; break; }
    }
    if (!hueco) {
      avisos.push(`No queda hueco libre para ampliar ${region.nombre}`
        + ' sin tapar territorio peruano.');
      continue;
    }

    const ancho = hueco.ancho - AIRE_MM;
    const alto = hueco.alto - AIRE_MM;
    const anchoMapa = ancho - borde * 2;
    const altoMapa = alto - cabecera - borde * 2;
    if (anchoMapa <= 0 || altoMapa <= 0) continue;

    /* Un recuadro que dibuja la zona al mismo tamaño que el mapa principal no es una
       ampliación: es el mismo dibujo dos veces, gastando un hueco que otra zona sí
       aprovecharía. Como la zona es ahora un departamento entero, ese caso aparece de
       verdad —Loreto o Ucayali ocupan media lámina—, así que se mide y se descarta. */
    const ampliacion = Math.min(anchoMapa / region.ancho, altoMapa / region.alto);
    if (ampliacion < AMPLIACION_MINIMA) {
      avisos.push(`Ampliar ${region.nombre} en esta hoja lo agrandaría sólo`
        + ` ${ampliacion.toFixed(1)} veces: no compensa el sitio que ocupa.`
        + ' Usa una hoja mayor.');
      continue;
    }

    /* El recuadro se llama como la zona que amplía. «Zoom 1» no dice nada: obliga a
       buscar en el mapa cuál de los rectángulos rojos le corresponde, y si hay dos hay
       que compararlos. «Cusco» se entiende sin mirar el mapa principal. */
    const etiqueta = region.nombre;
    const x = hueco.x + AIRE_MM / 2;
    const y = hueco.y + AIRE_MM / 2;

    colocados.push({
      nombre: `zoom-${region.clave}`,
      x,
      y,
      ancho,
      alto,
      svg: dibujarRecuadro({
        x,
        y,
        ancho,
        alto,
        anchoMapa,
        altoMapa,
        cabecera,
        borde,
        etiqueta,
        sub,
        miembros,
        agregado,
        clases,
        rampa,
        iconos,
        tamanoIcono,
        altoCifra,
        eTitulo,
        eCifra,
        medidor,
        factor,
      }),
    });
    ocupacion.marcarBloque(rectangulo.expandir({ x, y, ancho, alto }, AIRE_MM / 2));

    referencias.push(grupo({}, [
      rect(region, {
        fill: 'none', stroke: color.mimpRojo, 'stroke-width': trazoMm.recuadroZoom * 0.7,
      }),
      texto(etiqueta, {
        x: region.x,
        y: region.y - medidor.alto(eTitulo) * 0.25,
        fill: color.mimpRojo,
        'font-family': eTitulo.familia,
        'font-size': ptAmm(eTitulo.pt * 0.8),
        'font-weight': 600,
      }),
    ]));

    resumen.push({
      etiqueta,
      provincias: miembros.length,
      anchoMm: Number(ancho.toFixed(1)),
      altoMm: Number(alto.toFixed(1)),
      ampliacion: Number(ampliacion.toFixed(1)),
      apinamientoPct: Number((region.apinamiento * 100).toFixed(0)),
      motivo: (region.apinadas || []).slice(0, 4),
    });
  }

  /* ¿Cabría uno más? Es lo que la interfaz necesita para decir cuántos se pueden
     pedir en esta hoja, en vez de ofrecer un número fijo que a veces no se cumple. */
  const cabeOtro = colocados.length < tope && Boolean(mayorRectanguloLibre(ocupacion, {
    aspecto: 1,
    region: marco,
    minLadoMm: LADO_MINIMO_MM,
    maxLadoMm: ladoMaximo,
  }));

  return {
    colocados,
    referencias: referencias.join('\n'),
    regiones: resumen,
    avisos,
    capacidad: { tope, colocados: colocados.length, cabeOtro },
  };
}


/** Dibuja un recuadro ya dimensionado. */
function dibujarRecuadro({
  x, y, ancho, alto, anchoMapa, altoMapa, cabecera, borde, etiqueta,
  sub, miembros, agregado, clases, rampa, iconos, tamanoIcono, altoCifra,
  eTitulo, eCifra, medidor, factor,
}) {
  const marcoInterno = { x: x + borde, y: y + cabecera, ancho: anchoMapa, alto: altoMapa };
  const proy = crearProyeccion(sub, marcoInterno, 1.2);
  const ruta = crearRuta(proy);
  const idRecorte = `recorte-${etiqueta.replace(/\s+/g, '-').toLowerCase()}`;

  const relleno = miembros.map((f) => {
    const datos = agregado.porProvincia.get(f.properties.ubigeo);
    const clase = claseDe(datos ? datos.tiposDistintos : 0, clases);
    return el('path', { d: ruta(f.geometry), fill: clase >= 0 ? rampa[clase] : color.sinDato });
  });
  const limites = miembros.map((f) => el('path', {
    d: ruta(f.geometry),
    fill: 'none',
    stroke: color.limiteProvincial,
    'stroke-width': trazoMm.limiteProvincial,
    'stroke-linejoin': 'round',
  }));

  /* Geometría proyectada de cada miembro, calculada UNA vez: la usan los símbolos
     para anclarse y los rótulos para buscar sitio. Antes los símbolos se anclaban en
     el centro de la caja envolvente y los rótulos en el polo, así que la reserva que
     hacía el motor de rótulos no coincidía con dónde estaban los íconos y el nombre
     de Callao acababa encima de ellos. */
  const geometria = new Map();
  for (const f of miembros) {
    const recolector = recolectorDeAnillos();
    geoPath(proy, recolector)(f);
    const anillos = recolector.anillos;
    if (!anillos.length) continue;
    const caja = recorteDeCaja(anillos, marcoInterno);
    if (!caja) continue;
    const polos = polosDeInaccesibilidad(anillos, caja, 1, 8);
    if (!polos.length) continue;
    geometria.set(f, { anillos, polos });
  }

  const simbolos = [];
  const cajasSimbolos = [];
  for (const f of miembros) {
    const datos = agregado.porProvincia.get(f.properties.ubigeo);
    const geo = geometria.get(f);
    if (!datos || !geo) continue;
    const centro = [geo.polos[0].x, geo.polos[0].y];
    const tipos = [...datos.tipos.keys()].sort(
      (a, b) => agregado.porTipo.get(b) - agregado.porTipo.get(a) || a.localeCompare(b, 'es'),
    );
    const reparto = repartirIconos(
      tipos.length, { x: centro[0], y: centro[1] }, tamanoIcono, altoCifra,
    );
    const { posiciones } = reparto;
    cajasSimbolos.push({
      x: centro[0] - reparto.ancho / 2,
      y: centro[1] - reparto.alto / 2,
      ancho: reparto.ancho,
      alto: reparto.alto,
      etiqueta: `símbolos ${f.properties.nombre}`,
    });
    tipos.forEach((tipo, i) => {
      simbolos.push(dibujarIcono({
        tipo,
        x: posiciones[i].x,
        y: posiciones[i].y,
        tamanoMm: tamanoIcono,
        color: iconos.tipos[tipo]?.color || color.tintaSuave,
      }));
      simbolos.push(textoConHalo(String(datos.tipos.get(tipo)), {
        x: posiciones[i].x,
        y: posiciones[i].y + altoCifra * 0.82,
        'text-anchor': 'middle',
        fill: color.tinta,
        'font-family': eCifra.familia,
        'font-size': ptAmm(eCifra.pt),
        'font-weight': 600,
      }, { colorHalo: color.halo, grosorMm: trazoMm.haloRotulo * factor * 0.7 }));
    });
  }

  /* Las provincias se rotulan DENTRO del recuadro. Son justamente las que el mapa
     principal no llega a nombrar —su grupo de íconos las llena por completo—, así que
     si el zoom tampoco las nombrara no aparecerían por ninguna parte. Aquí caben,
     porque a esta escala sobra sitio. */
  const rotulos = rotularMiembros({
    geometria, cajasSimbolos, marcoInterno, medidor, factor,
  });

  return grupo({ id: `bloque-${etiqueta.replace(/\s+/g, '-').toLowerCase()}` }, [
    el('defs', {}, el('clipPath', { id: idRecorte }, rect(marcoInterno))),
    rect({ x, y, ancho, alto }, {
      fill: color.fondoHoja, stroke: color.mimpRojo, 'stroke-width': borde,
    }),
    texto(etiqueta, {
      x: x + borde + 1,
      y: y + medidor.ascenso(eTitulo) + borde,
      fill: color.mimpRojo,
      'font-family': eTitulo.familia,
      'font-size': ptAmm(eTitulo.pt),
      'font-weight': 600,
    }),
    grupo({ 'clip-path': `url(#${idRecorte})` }, [
      rect(marcoInterno, { fill: color.oceano }),
      ...relleno, ...limites, ...simbolos, rotulos,
    ]),
    rect(marcoInterno, {
      fill: 'none', stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
    }),
  ]);
}

/** Caja envolvente de unos anillos ya proyectados. */
function cajaDe(anillosRasgo) {
  if (!anillosRasgo || !anillosRasgo.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const anillo of anillosRasgo) {
    for (const [x, y] of anillo) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY } : null;
}

/**
 * Rótulos de las provincias dentro de un recuadro de zoom.
 *
 * Usa el mismo motor que el mapa principal, con su propio índice de colisiones
 * sembrado con los grupos de íconos del recuadro. Los nombres van algo mayores que en
 * el mapa grande: un zoom se mira de cerca y es donde se espera poder leerlos.
 */
function rotularMiembros({ geometria, cajasSimbolos, marcoInterno, medidor, factor }) {
  const indice = crearIndice();
  for (const c of cajasSimbolos) indice.agregar(c);

  const estilo = {
    familia: tipografia.rotuloProvincia.familia,
    variante: 'Semibold',
    pt: tipografia.rotuloProvincia.pt * Math.sqrt(factor) * 1.15,
  };

  const solicitudes = [];
  for (const [f, geo] of geometria) {
    solicitudes.push(crearSolicitud({
      id: f.properties.ubigeo,
      texto: f.properties.nombre,
      nivel: 'provincia',
      prioridad: 1,
      peso: geo.polos[0].radioMm,
      puntos: geo.polos,
      estilo,
      dentro: (x, y) => puntoEnAnillos(x, y, geo.anillos),
    }));
  }

  const { svg } = colocarEtiquetas({
    solicitudes, indice, medidor, marco: marcoInterno, factor,
  });
  return svg;
}

/** Caja envolvente de unos anillos, recortada al marco interno del recuadro. */
function recorteDeCaja(anillos, marcoInterno) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const a of anillos) {
    for (const [x, y] of a) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const x0 = Math.max(minX, marcoInterno.x);
  const y0 = Math.max(minY, marcoInterno.y);
  const x1 = Math.min(maxX, marcoInterno.x + marcoInterno.ancho);
  const y1 = Math.min(maxY, marcoInterno.y + marcoInterno.alto);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 } : null;
}
