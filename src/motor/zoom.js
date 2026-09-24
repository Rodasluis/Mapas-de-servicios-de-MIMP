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
 * QUÉ TROZO DE LA ZONA. La zona entera siempre que quepa ampliada. Cuando no cabe, en
 * automático se repliega a su núcleo —las provincias que concentran los servicios— y lo
 * dice en el informe; en manual se dibuja entera igual, porque esa decisión ya la ha
 * tomado una persona. El rectángulo de referencia sobre el mapa principal dice siempre
 * qué trozo se ha ampliado de verdad.
 *
 * Que una zona no quepa es geometría, no una decisión: Cusco ocupa 154 × 185 mm en un A1
 * y el mayor hueco libre de la lámina son 131 × 156. Y no se arregla con más papel,
 * porque al agrandar la hoja crecen las dos cosas a la vez; se arregla GIRÁNDOLA, que es
 * lo que dicen los avisos.
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

/** Por encima de esta fracción pisada, los íconos de una provincia se estorban. */
export const UMBRAL_APINAMIENTO = 0.35;

/** Por debajo de esta ampliación el recuadro repite el mapa en vez de ampliarlo. */
export const AMPLIACION_MINIMA = 1.5;

/**
 * Qué hacer cuando una zona no cabe ampliada.
 *
 * NO es «usa una hoja mayor», aunque lo parezca. Medido departamento a departamento: al
 * pasar de A4 a A0 en vertical, la zona y el hueco libre crecen a la vez y la ampliación
 * se queda clavada en torno a ×1. Lo que abre sitio es girar la hoja: el Perú es alto y
 * estrecho, así que en apaisado el marco se ensancha y deja un hueco grande a los lados.
 * Cusco pasa de ×0,95 en A2 vertical a ×1,77 en A2 apaisado, con el mismo papel.
 */
function consejoDeEspacio(marco) {
  if (marco.ancho <= marco.alto) {
    return ' Prueba con la hoja apaisada: el Perú es alto y estrecho, así que girarla abre'
      + ' un hueco libre mucho mayor que agrandarla.';
  }
  /* Ya está apaisada. Decir «gira la hoja» aquí sería un consejo imposible, y decir «usa
     una hoja mayor» sería falso: de A2 a A0 la zona y el hueco crecen a la vez. Lo que
     queda es la verdad, que es accionable de otra manera —imprimir ese departamento como
     ámbito propio en vez de como recuadro del mapa nacional—. */
  return ' Es demasiado grande respecto a la lámina para ampliarlo aquí, y cambiar de'
    + ' tamaño de hoja no lo arregla: la zona y el hueco libre crecen a la vez.';
}

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

/**
 * La zona es SIEMPRE el nivel inmediatamente superior a la unidad que se dibuja.
 *
 * En el mapa del país la unidad es la provincia y la zona el departamento; en el de un
 * departamento la unidad es el distrito y la zona su provincia; en el de una provincia,
 * la zona es el propio distrito. El ámbito lo declara en `plan.zonas` —cuántos dígitos
 * del ubigeo forman la clave y cómo se llama cada una—, así que aquí no hay que saber
 * en qué ámbito se está.
 *
 * El corte de Lima sólo se aplica cuando las zonas son departamentos: dentro de un mapa
 * del departamento de Lima, «Lima Metropolitana» ya es una de sus provincias y partirla
 * otra vez no significaría nada.
 */
export function zonaDe(ubigeo, def) {
  if (def.limaAparte) {
    const ccdd = ubigeo.slice(0, 2);
    if (ubigeo === LIMA_METROPOLITANA || ccdd === CALLAO) {
      return { clave: 'lima-callao', nombre: 'Lima Metropolitana y Callao' };
    }
    if (ccdd === LIMA) return { clave: 'lima-provincias', nombre: 'Lima provincias' };
  }
  const clave = ubigeo.slice(0, def.longitud);
  return { clave, nombre: def.nombres.get(clave) || clave };
}

/** ¿Esta unidad pertenece a esa zona? */
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
 * @param {object} unidades   colección de rasgos de la unidad que se dibuja
 * @param {Map} anillos       geometría proyectada por rasgo
 * @param {object} zonas      {longitud, nombres, limaAparte} que declara el ámbito
 * @param {number} margenMm   aire alrededor de la zona en el mapa principal
 */
export function zonasAmpliables({ agregado, grupos, unidades, anillos, zonas: def, margenMm }) {
  const apinamientoDe = new Map(grupos.map((g) => [g.unidad, g.apinamiento]));
  const zonas = new Map();

  for (const f of unidades.features) {
    const ubigeo = f.properties.ubigeo;
    const z = zonaDe(ubigeo, def);
    let zona = zonas.get(z.clave);
    if (!zona) {
      zona = {
        ...z,
        servicios: 0,
        apinamiento: 0,
        apinadas: [],
        estaApinada: new Set(),
        miembros: [],
        servicioPor: new Map(),
      };
      zonas.set(z.clave, zona);
    }
    const datos = agregado.porUnidad.get(ubigeo);
    zona.servicios += datos ? datos.total : 0;
    zona.servicioPor.set(ubigeo, datos ? datos.total : 0);
    const apinamiento = apinamientoDe.get(ubigeo) || 0;
    zona.apinamiento = Math.max(zona.apinamiento, apinamiento);
    if (apinamiento > UMBRAL_APINAMIENTO) {
      zona.apinadas.push(f.properties.nombre);
      zona.estaApinada.add(ubigeo);
    }
    zona.miembros.push(f);
  }

  /* Cada zona se ofrece con DOS encuadres, y el motor usa el primero que de verdad
     amplíe.

     El preferido es el departamento ENTERO, que es lo que se espera de un recuadro
     titulado «Cusco». El problema es de superficie y no tiene arreglo: Cusco ocupa
     154 × 185 mm en un A1 y el mayor hueco libre de la lámina son 131 × 156, porque el
     Perú está en medio y sólo quedan libres dos franjas de unos 130 mm a los lados. Un
     «zoom» dibujado ahí saldría a 0,85 veces el tamaño del mapa: una REDUCCIÓN rotulada
     como ampliación.

     El de repliegue es el NÚCLEO: las provincias que concentran la mayor parte de los
     servicios de esa zona. Sigue siendo Cusco y sólo Cusco, el rectángulo rojo sobre el
     mapa dice qué trozo es, y el informe avisa de que no cupo entero. Es preferible a
     no ampliar Cusco en absoluto. */
  const regiones = [];
  for (const zona of zonas.values()) {
    if (!zona.servicios) continue;
    const completa = cajaDeRasgos(zona.miembros, anillos, margenMm);
    if (!completa) continue;
    regiones.push({ ...zona, ...completa, nucleo: cajaDelNucleo(zona, anillos, margenMm) });
  }

  /* Por CANTIDAD DE SERVICIOS. El criterio anterior era el apiñamiento, que mide otra
     cosa: cuánto se pisan los íconos en el papel. Eso depende del tamaño de la hoja y
     de la forma de la provincia, así que una provincia diminuta con tres servicios
     salía por delante de un departamento con cuarenta repartidos. Lo que un lector
     quiere ver de cerca es dónde hay MÁS servicios. */
  return regiones.sort(
    (a, b) => b.servicios - a.servicios || a.clave.localeCompare(b.clave),
  );
}

/** Caja envolvente de unos rasgos ya proyectados, con aire alrededor. */
function cajaDeRasgos(rasgos, anillos, margenMm) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const f of rasgos) {
    const caja = cajaDe(anillos.get(f));
    if (!caja) continue;
    x0 = Math.min(x0, caja.x); y0 = Math.min(y0, caja.y);
    x1 = Math.max(x1, caja.x + caja.ancho); y1 = Math.max(y1, caja.y + caja.alto);
  }
  if (!Number.isFinite(x0)) return null;
  return {
    x: x0 - margenMm,
    y: y0 - margenMm,
    ancho: x1 - x0 + margenMm * 2,
    alto: y1 - y0 + margenMm * 2,
  };
}

/** Fracción de los servicios de la zona que tiene que quedar dentro del núcleo. */
const COBERTURA_NUCLEO = 0.6;

/**
 * Encuadre de repliegue: las provincias que concentran la mayor parte de los servicios.
 *
 * Se ordenan por número de servicios y se toman las que hagan falta para cubrir el 60 %
 * del total de la zona. En Cusco eso es la provincia de Cusco y las tres o cuatro de su
 * entorno, que es exactamente el trozo que hay que separar; en una zona repartida por
 * igual el núcleo acaba siendo casi toda la zona, y entonces tampoco cabrá, que es la
 * respuesta correcta.
 */
function cajaDelNucleo(zona, anillos, margenMm) {
  /* Si hay provincias cuyos íconos se pisan, el núcleo son ésas: es el racimo que de
     verdad hay que separar y suele ser muy compacto —en Cusco, el entorno de la ciudad,
     unos quince milímetros de lado—. Sólo cuando no hay apiñamiento se recurre a las
     provincias con más servicios, que pueden estar repartidas por todo el departamento
     y dar un núcleo casi tan grande como la zona entera; en ese caso tampoco cabrá, que
     es la respuesta correcta. */
  const apinadas = zona.miembros.filter((f) => zona.estaApinada.has(f.properties.ubigeo));
  if (apinadas.length) return cajaDeRasgos(apinadas, anillos, margenMm);

  const conServicios = zona.miembros
    .map((f) => ({ f, n: zona.servicioPor.get(f.properties.ubigeo) || 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!conServicios.length) return null;

  const objetivo = zona.servicios * COBERTURA_NUCLEO;
  const elegidos = [];
  let acumulado = 0;
  for (const x of conServicios) {
    elegidos.push(x.f);
    acumulado += x.n;
    if (acumulado >= objetivo) break;
  }
  return cajaDeRasgos(elegidos, anillos, margenMm);
}

/**
 * Regiones a partir de una selección manual.
 *
 * Se agrupan por la MISMA regla que en automático —una zona por departamento, con Lima
 * partida en metrópoli y provincias—, para que elegir a mano no dé un recuadro con otra
 * lógica que el que habría salido solo. Admite ubigeos de provincia o de departamento;
 * seleccionar «08» y seleccionar sus catorce provincias dan lo mismo.
 */
function regionesManuales({ seleccion, agregado, unidades, anillos, zonas: def, margenMm }) {
  const pedidas = new Set(seleccion.map(String));
  const coincide = (ubigeo) => pedidas.has(ubigeo) || pedidas.has(ubigeo.slice(0, 2));
  const elegidas = unidades.features.filter((f) => coincide(f.properties.ubigeo));
  if (!elegidas.length) return [];

  /* A mano se amplía LO SELECCIONADO, no el departamento entero al que pertenece:
     quien marca tres provincias quiere esas tres. El nombre sí sale de la zona, para
     que el recuadro se titule igual que si lo hubiera elegido el motor. */
  const porZona = new Map();
  for (const f of elegidas) {
    const ubigeo = f.properties.ubigeo;
    const z = zonaDe(ubigeo, def);
    let zona = porZona.get(z.clave);
    if (!zona) {
      zona = {
        ...z, servicios: 0, apinamiento: 1, apinadas: [], estaApinada: new Set(),
        miembros: [], servicioPor: new Map(),
      };
      porZona.set(z.clave, zona);
    }
    const datos = agregado.porUnidad.get(ubigeo);
    zona.servicios += datos ? datos.total : 0;
    zona.miembros.push(f);
  }

  const regiones = [];
  for (const zona of porZona.values()) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const f of zona.miembros) {
      const caja = cajaDe(anillos.get(f));
      if (!caja) continue;
      x0 = Math.min(x0, caja.x); y0 = Math.min(y0, caja.y);
      x1 = Math.max(x1, caja.x + caja.ancho); y1 = Math.max(y1, caja.y + caja.alto);
    }
    if (!Number.isFinite(x0)) continue;
    regiones.push({
      ...zona,
      x: x0 - margenMm,
      y: y0 - margenMm,
      ancho: x1 - x0 + margenMm * 2,
      alto: y1 - y0 + margenMm * 2,
    });
  }
  return regiones.sort((a2, b2) => b2.servicios - a2.servicios || a2.clave.localeCompare(b2.clave));
}

/**
 * Construye los recuadros de zoom, ya dimensionados y colocados.
 *
 * @returns {{colocados, referencias, regiones, avisos, capacidad}}
 */
export function construirRecuadros({
  modo = 'auto', seleccion = [], grupos, umbral, unidades, zonas, anillos, agregado,
  clases, rampa, iconos, medidor, factor, tamanoIcono, marco, ocupacion, maximo,
  modoSimbolos = 'agregado', centros = [],
}) {
  const tope = maximo ?? maximoPorFormato(factor);
  const vacio = {
    colocados: [],
    referencias: '',
    regiones: [],
    avisos: [],
    capacidad: { tope, colocados: 0, cabeOtro: false },
  };
  if (modo === 'ninguno') return vacio;

  /* Ver el comentario del umbral más abajo: en manual no hay mínimo. */
  const minimoAmpliacion = modo === 'manual' ? 0 : AMPLIACION_MINIMA;

  const margen = tamanoIcono * 0.8;
  const candidatas = modo === 'manual'
    ? regionesManuales({ seleccion, agregado, unidades, anillos, zonas, margenMm: margen })
    : zonasAmpliables({ agregado, grupos, unidades, anillos, zonas, margenMm: margen });
  if (!candidatas.length) return vacio;

  const eTitulo = { familia: 'Poppins', variante: 'SemiBold', pt: 7 * Math.sqrt(factor) };
  const eCifra = { familia: 'SourceSans3', variante: 'Semibold', pt: 5.2 * Math.sqrt(factor) };
  const altoCifra = medidor.alto(eCifra) * 0.95;
  const cabecera = medidor.alto(eTitulo) * 1.5;
  const borde = trazoMm.recuadroZoom;

  /* Tope por recuadro para que el primero no se quede con todo el hueco libre. */
  const ladoMaximo = Math.min(marco.ancho, marco.alto) * 0.48;

  /**
   * Busca el mayor hueco libre con la proporción de un encuadre y mide cuánto amplía.
   *
   * @param {object} caja   el encuadre a ampliar (la zona entera o su núcleo)
   * @param {object} zona   la zona a la que pertenece, para elegir qué se dibuja
   */
  function encajarEnHueco(caja, zona) {
    /* Sólo provincias de la ZONA, y de ellas las que tocan el encuadre. Antes se
       tomaban todas las que tocaban el rectángulo, y un recuadro de Áncash acababa
       enseñando también provincias de La Libertad y de Huánuco: al mirarlo no se sabía
       dónde empieza y acaba lo que se amplía. */
    const tocaElEncuadre = (f) => {
      const c = cajaDe(anillos.get(f));
      return c && rectangulo.seSolapan(caja, c);
    };
    let miembros = zona.miembros.filter(tocaElEncuadre);
    if (!miembros.length) return null;

    /* Una zona de una sola unidad no sitúa nada: el recuadro sale con un distrito
       flotando sobre el fondo y sólo el rectángulo rojo dice dónde está. En ese caso se
       añaden las unidades vecinas del MISMO ámbito, que es lo que da el contexto sin
       cruzar ninguna división que el título prometa: en un mapa de la provincia de Lima
       todo lo que entre sigue siendo la provincia de Lima. Pasa en el ámbito
       provincial, donde la zona es el propio distrito. */
    if (miembros.length === 1) miembros = unidades.features.filter(tocaElEncuadre);

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
    let altura = Math.max(LADO_MINIMO_MM, LADO_MINIMO_MM / Math.max(0.3, proporcionZona));
    for (let pasada = 0; pasada < 2; pasada++) {
      const encontrado = mayorRectanguloLibre(ocupacion, {
        aspecto: aspectoDe(altura),
        region: marco,
        minLadoMm: LADO_MINIMO_MM,
        maxLadoMm: ladoMaximo,
      });
      if (!encontrado) return null;
      hueco = encontrado;
      altura = encontrado.alto - AIRE_MM - cabecera - borde * 2;
      if (altura <= 0) return null;
    }

    const ancho = hueco.ancho - AIRE_MM;
    const alto = hueco.alto - AIRE_MM;
    const anchoMapa = ancho - borde * 2;
    const altoMapa = alto - cabecera - borde * 2;
    if (anchoMapa <= 0 || altoMapa <= 0) return null;

    /* Cuánto AMPLÍA de verdad. Un recuadro que dibuja la zona al mismo tamaño que el
       mapa principal no es una ampliación: es el mismo dibujo dos veces, gastando un
       hueco que otra zona sí aprovecharía. */
    const ampliacion = Math.min(anchoMapa / caja.ancho, altoMapa / caja.alto);
    return { miembros, sub, hueco, ancho, alto, anchoMapa, altoMapa, ampliacion };
  }

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

    /* En AUTOMÁTICO se intentan dos encuadres: la zona entera primero y, si no cabe
       ampliada, su núcleo. En MANUAL sólo el primero, porque ahí la decisión ya está
       tomada: quien selecciona Cusco quiere Cusco, no la parte de Cusco que mejor le
       venga al motor. */
    const intentos = [{ caja: region, parcial: false }];
    if (modo !== 'manual'
      && region.nucleo
      && region.nucleo.ancho * region.nucleo.alto < region.ancho * region.alto * 0.8) {
      intentos.push({ caja: region.nucleo, parcial: true });
    }

    let encaje = null;
    let mejor = 0;
    for (const intento of intentos) {
      const r = encajarEnHueco(intento.caja, region);
      if (!r) continue;
      mejor = Math.max(mejor, r.ampliacion);
      /* El umbral es del modo automático, no del recuadro. Ahí el motor elige y no
         debe gastar el mayor hueco de la lámina en algo que no amplía; cuando la
         selección es de una persona, obedece y explica. Antes el umbral se aplicaba a
         los dos, y seleccionar Cusco en una hoja vertical no dibujaba NADA. */
      if (r.ampliacion >= minimoAmpliacion) { encaje = { ...r, ...intento }; break; }
    }

    if (!encaje) {
      avisos.push(mejor > 0
        ? `${region.nombre} no cabe ampliado en esta hoja: el mayor hueco libre lo`
          + ` agrandaría ${mejor.toFixed(1)} veces.${consejoDeEspacio(marco)}`
        : `No queda hueco libre para ampliar ${region.nombre} sin tapar territorio peruano.`);
      continue;
    }

    const {
      miembros, sub, hueco, ancho, alto, anchoMapa, altoMapa, ampliacion, parcial, caja,
    } = encaje;
    if (parcial) {
      avisos.push(`${region.nombre} no cabe entero en esta hoja; se amplía la parte que`
        + ` concentra sus servicios.${consejoDeEspacio(marco)}`);
    }
    /* En manual el recuadro se dibuja aunque apenas amplíe, porque se ha pedido. Lo que
       no puede ocurrir es que se dibuje sin decir lo que es: a esta escala los símbolos
       se estorban igual que en el mapa principal. */
    if (modo === 'manual' && ampliacion < AMPLIACION_MINIMA) {
      avisos.push(`${region.nombre} se amplía sólo ${ampliacion.toFixed(1)} veces en esta`
        + ` hoja, así que sus símbolos se estorban casi igual que en el mapa.${consejoDeEspacio(marco)}`);
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
        modoSimbolos,
        centros,
      }),
    });
    ocupacion.marcarBloque(rectangulo.expandir({ x, y, ancho, alto }, AIRE_MM / 2));

    /* El rectángulo de referencia marca el ENCUADRE que se ha ampliado, que cuando la
       zona no cabe entera es sólo una parte de ella. Dibujar la zona completa mientras
       el recuadro enseña un trozo señalaría un sitio que no es el que se amplió. */
    referencias.push(grupo({}, [
      rect(caja, {
        fill: 'none', stroke: color.mimpRojo, 'stroke-width': trazoMm.recuadroZoom * 0.7,
      }),
      texto(etiqueta, {
        x: caja.x,
        y: caja.y - medidor.alto(eTitulo) * 0.25,
        fill: color.mimpRojo,
        'font-family': eTitulo.familia,
        'font-size': ptAmm(eTitulo.pt * 0.8),
        'font-weight': 600,
      }),
    ]));

    resumen.push({
      etiqueta,
      unidades: miembros.length,
      anchoMm: Number(ancho.toFixed(1)),
      altoMm: Number(alto.toFixed(1)),
      ampliacion: Number(ampliacion.toFixed(1)),
      completa: !parcial,
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
  eTitulo, eCifra, medidor, factor, modoSimbolos = 'agregado', centros = [],
}) {
  const marcoInterno = { x: x + borde, y: y + cabecera, ancho: anchoMapa, alto: altoMapa };
  const proy = crearProyeccion(sub, marcoInterno, 1.2);
  const ruta = crearRuta(proy);
  const idRecorte = `recorte-${etiqueta.replace(/\s+/g, '-').toLowerCase()}`;

  const relleno = miembros.map((f) => {
    const datos = agregado.porUnidad.get(f.properties.ubigeo);
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

  /* El recuadro dibuja LO MISMO que el mapa principal, sólo que más grande. Si el mapa
     pinta cada centro en su sitio y el recuadro los agregara en un grupo con cifras, la
     misma lámina estaría contando dos cosas distintas del mismo lugar y quien la mira
     tendría que adivinar cuál vale. */
  if (modoSimbolos === 'individual') {
    const dentroDelRecuadro = (x, y) => x >= marcoInterno.x && x <= marcoInterno.x + marcoInterno.ancho
      && y >= marcoInterno.y && y <= marcoInterno.y + marcoInterno.alto;
    const enRecuadro = new Set(miembros.map((f) => f.properties.ubigeo));

    for (const c of centros) {
      if (!enRecuadro.has(c.ubigeo)) continue;
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
      const punto = proy([c.lon, c.lat]);
      if (!punto || !dentroDelRecuadro(punto[0], punto[1])) continue;
      simbolos.push(dibujarIcono({
        tipo: c.tipo,
        x: punto[0],
        y: punto[1],
        tamanoMm: tamanoIcono,
        color: iconos.tipos[c.tipo]?.color || color.tintaSuave,
      }));
      cajasSimbolos.push({
        x: punto[0] - tamanoIcono / 2,
        y: punto[1] - tamanoIcono,
        ancho: tamanoIcono,
        alto: tamanoIcono,
        etiqueta: `símbolos ${c.nombre}`,
      });
    }
  } else {
  for (const f of miembros) {
    const datos = agregado.porUnidad.get(f.properties.ubigeo);
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
