/**
 * Qué mide el color del mapa: la variable del coropletas (Fase 22).
 *
 * Hasta la Fase 21 el color de cada unidad decía siempre lo mismo —cuántos TIPOS de
 * servicio distintos hay en ella— y esa regla estaba repartida por el motor: en el
 * dibujo del mapa, en el de los recuadros y en el título de la leyenda. Ahora cada
 * variable sabe su valor por unidad, sus clases, su rampa y cómo se titula, y el resto
 * del motor sólo pregunta «¿de qué clase es esta unidad?» (`indiceDe`).
 *
 * Todas cuentan con los centros de atención de los TIPOS MARCADOS: con sólo los CEM, el
 * número es de CEM y la distancia es al CEM más cercano. «Servicio» es el tipo (CEM,
 * SAR…); cada sede del directorio es un CENTRO DE ATENCIÓN, y eso es lo que se cuenta y
 * lo que se mide (corrección del área usuaria en la Fase 22).
 *
 * Los colores salen de tokens.js, como todos los del mapa.
 */
import { geoCentroid, geoDistance } from 'd3-geo';
import { claseDe, clasesUsadas, CLASES_POR_DEFECTO } from './servicios.js';
import { RADIO_TERRESTRE_M } from './proyeccion.js';
import { color, rampaNaranjas, rampaAzules, rampaMorados } from '../estilo/tokens.js';
import { ICONOS } from '../iconos/index.js';

/** Las variables, en el orden en que las ofrece la interfaz. La primera es la de siempre. */
export const VARIABLES = ['presencia', 'centros', 'cobertura', 'tasa', 'pobreza'];
export const VARIABLE_POR_DEFECTO = VARIABLES[0];

/** Las que necesitan los indicadores del INEI (public/data/indicadores.json). */
export const VARIABLES_CON_INDICADORES = ['tasa', 'pobreza'];

/** Cortes de la tasa de centros de atención por cada 100 mil habitantes (ver prepararTasa). */
export const LIMITES_TASA = [2, 5, 10, 25];

/** Cortes de la pobreza monetaria total, en % (ver prepararPobreza). */
export const LIMITES_POBREZA = [15, 30, 45, 60];

/**
 * Límites de las clases de distancia, en kilómetros.
 *
 * Se eligieron mirando el reparto real en el Perú por distritos (Fase 22): con todos los
 * servicios, la mitad de los distritos sin ninguno tiene uno a menos de 15 km y casi
 * todos a menos de 50; con sólo los CAR, la mayoría pasa de 50 km y hacía falta partir
 * por encima, en 100. Seis clases —«hay servicio» y cinco tramos— y no más: más tonos
 * de un mismo azul ya no se distinguen impresos.
 */
export const LIMITES_KM = [10, 25, 50, 100];

/** «el distrito», «la provincia»… para escribir las clases y las notas. */
const CON_ARTICULO = { distrito: 'el distrito', provincia: 'la provincia', departamento: 'el departamento' };

/**
 * Prepara la variable pedida para un mapa.
 *
 * @param {object} o
 * @param {string} [o.variable]        una de VARIABLES; cualquier otra cosa, la de siempre
 * @param {object} o.agregado          servicios del ámbito por unidad (agregarCentros)
 * @param {object} o.centrosJson       el directorio entero, para buscar fuera del ámbito
 * @param {Set|null} o.tiposActivos    tipos marcados; null es «todos»
 * @param {Array} [o.clasesDeConteo]   clases de las variables que cuentan (?clases= en la URL)
 * @param {Array} o.unidades           las unidades que colorea el mapa (rasgos GeoJSON)
 * @param {string} o.unidad            qué son: 'distrito', 'provincia' o 'departamento'
 * @param {object} [o.indicadores]     población y pobreza del INEI, si la variable las usa
 * @returns {{clave, clases, rampa, rampaFija, indiceDe, clasesUsadas, titulo, nota, fuentes}}
 */
export function prepararVariable({
  variable, agregado, centrosJson, tiposActivos, clasesDeConteo = CLASES_POR_DEFECTO, unidades, unidad, indicadores = null,
}) {
  const clave = VARIABLES.includes(variable) ? variable : VARIABLE_POR_DEFECTO;
  if (clave === 'cobertura') return prepararCobertura({ agregado, centrosJson, tiposActivos, unidades, unidad });
  if (clave === 'tasa') return prepararTasa({ agregado, indicadores, unidades });
  if (clave === 'pobreza') return prepararPobreza({ indicadores, unidades });

  /* Las dos que CUENTAN: tipos de servicio distintos (la de siempre) o centros de
     atención. Mismos tramos y misma rampa; cambia qué se cuenta y, con eso, el título y
     cómo se nombra cada clase. */
  const campo = clave === 'centros' ? 'total' : 'tiposDistintos';
  const valorDe = (ubigeo) => {
    const datos = agregado.porUnidad.get(ubigeo);
    return datos ? datos[campo] : 0;
  };
  return {
    clave,
    clases: clave === 'centros' ? enCentros(clasesDeConteo) : clasesDeConteo,
    rampa: rampaNaranjas,
    rampaFija: false,
    indiceDe: (f) => claseDe(valorDe(f.properties.ubigeo), clasesDeConteo),
    /* La de siempre, con la función de siempre: un mapa por omisión tiene que salir
       idéntico al de la Fase 21. */
    clasesUsadas: clave === 'presencia'
      ? clasesUsadas(agregado, clasesDeConteo)
      : usadas([...agregado.porUnidad.values()].map((d) => claseDe(d.total, clasesDeConteo))),
    titulo: (u) => (clave === 'centros' ? `Número de centros de atención por ${u}` : `Presencia de servicios por ${u}`),
    nota: null,
    fuentes: [],
  };
}

/**
 * Brechas de cobertura: la distancia en línea recta de cada unidad al servicio más
 * cercano de los tipos marcados, esté donde esté —una provincia de Puno puede tener el
 * más cercano en Cusco—.
 *
 * Se mide desde el CENTRO GEOGRÁFICO de la unidad (su centroide esférico) y no desde
 * el borde: el borde daría unos metros para un servicio al otro lado del límite, que es
 * cierto y no ayuda a planificar. Y en línea recta, no por carretera, que es lo único
 * que se puede afirmar con estos datos; la leyenda lo dice. Una unidad con algún
 * servicio de esos tipos está a 0 km y forma su propia clase.
 */
function prepararCobertura({ agregado, centrosJson, tiposActivos, unidades, unidad }) {
  const puntos = centrosJson.centros
    .filter((c) => (!tiposActivos || tiposActivos.has(c.tipo)) && Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => [c.lon, c.lat]);

  /* Por ubigeo: los recuadros de zoom vuelven a preguntar por las mismas unidades, a
     veces con su contorno a otro nivel de detalle. */
  const memoria = new Map();
  const kmDe = (f) => {
    const id = f.properties.ubigeo;
    if (memoria.has(id)) return memoria.get(id);
    let km = null;
    if ((agregado.porUnidad.get(id)?.total || 0) > 0) km = 0;
    else if (puntos.length) {
      const centro = geoCentroid(f);
      let minimo = Infinity;
      for (const p of puntos) minimo = Math.min(minimo, geoDistance(centro, p));
      km = (minimo * RADIO_TERRESTRE_M) / 1000;
    }
    memoria.set(id, km);
    return km;
  };
  const indiceDe = (f) => {
    const km = kmDe(f);
    if (km === null) return -1;
    if (km === 0) return 0;
    const tramo = LIMITES_KM.findIndex((limite) => km <= limite);
    return 1 + (tramo < 0 ? LIMITES_KM.length : tramo);
  };

  const enLaUnidad = CON_ARTICULO[unidad] || 'la unidad';
  const km = (n) => `${n} km`;
  const clases = [
    { etiqueta: `Con centro de atención en ${enLaUnidad}` },
    { etiqueta: `A ${km(LIMITES_KM[0])} o menos` },
    ...LIMITES_KM.slice(1).map((hasta, i) => ({ etiqueta: `Entre ${LIMITES_KM[i]} y ${km(hasta)}` })),
    { etiqueta: `A más de ${km(LIMITES_KM.at(-1))}` },
  ];

  /* «al CEM más cercano» si hay un solo tipo marcado: así la leyenda dice exactamente
     qué se midió. */
  const tipos = tiposActivos ? [...tiposActivos] : [];
  const objeto = tipos.length === 1 ? (ICONOS[tipos[0]]?.sigla || tipos[0]) : 'centro de atención';

  return {
    clave: 'cobertura',
    clases,
    rampa: rampaAzules,
    /* La rampa NO se desplaza: el tono más claro significa «hay servicio aquí», y en un
       ámbito sin ningún servicio no puede pasar a significar «a 10 km». */
    rampaFija: true,
    indiceDe,
    clasesUsadas: usadas(unidades.map(indiceDe)),
    titulo: () => `Distancia en línea recta al ${objeto} más cercano`,
    nota: `Medida desde el centro geográfico de cada ${unidad || 'unidad'}.`,
    fuentes: [],
  };
}

/**
 * Centros de atención de los tipos marcados por cada 100 mil habitantes de la unidad,
 * con la población proyectada del INEI para el año anclado (POBLACION_ANIO).
 *
 * Una unidad sin ningún centro queda en blanco, como en el mapa de siempre: «ningún
 * centro» no es «una tasa baja». Una unidad con centros pero sin población en el
 * cuadro —un distrito creado después— va a «Sin dato».
 *
 * Los cortes son enteros y valen para los tres niveles: en el Perú por distritos la
 * mediana de los distritos con servicio es de 6 por cada 100 mil, y en el país por
 * provincias, de 3 (Fase 22).
 */
function prepararTasa({ agregado, indicadores, unidades }) {
  const { valores, anio } = indicadores.poblacion;
  const tasaDe = (id) => {
    const n = agregado.porUnidad.get(id)?.total || 0;
    if (!n) return 0;
    return valores[id] ? (n / valores[id]) * 100000 : null;
  };
  const clases = [
    { etiqueta: `Menos de ${LIMITES_TASA[0]}` },
    ...LIMITES_TASA.slice(1).map((hasta, i) => ({ etiqueta: `Entre ${LIMITES_TASA[i]} y ${hasta}` })),
    { etiqueta: `${LIMITES_TASA.at(-1)} o más` },
    { etiqueta: 'Sin dato de población' },
  ];
  const sinDato = clases.length - 1;
  const indiceDe = (f) => {
    const v = tasaDe(f.properties.ubigeo);
    if (v === null) return sinDato;
    if (!v) return -1;
    const tramo = LIMITES_TASA.findIndex((limite) => v < limite);
    return tramo < 0 ? LIMITES_TASA.length : tramo;
  };
  return {
    clave: 'tasa',
    clases,
    rampa: [...rampaNaranjas, color.sinDato],
    rampaFija: true,
    indiceDe,
    clasesUsadas: usadas(unidades.map(indiceDe)),
    titulo: (u) => `Centros de atención por cada 100 mil habitantes, por ${u}`,
    nota: `Población proyectada a ${anio}. En blanco, sin ningún centro de atención.`,
    fuentes: [`Población: INEI, población total proyectada al 30 de junio de ${anio}.`],
  };
}

/**
 * Pobreza monetaria total del mapa de pobreza 2018 del INEI: el punto medio del
 * intervalo de confianza al 95 %, que es la estimación puntual
 * (scripts/fetch-indicadores.mjs). Vale en los tres niveles; el anexo del INEI trae la
 * fila de Amazonas vacía, así que por departamentos Amazonas sale «Sin dato», como los
 * distritos creados después de 2018.
 *
 * Cortes de 15 en 15 puntos: dejan tramos parecidos de distritos —283, 503, 555, 417 y
 * 116— con la mediana, 34 %, en el del medio (Fase 22).
 */
function prepararPobreza({ indicadores, unidades }) {
  const { valores, anio } = indicadores.pobreza;
  const clases = [
    { etiqueta: `Menos de ${LIMITES_POBREZA[0]} %` },
    ...LIMITES_POBREZA.slice(1).map((hasta, i) => ({ etiqueta: `Entre ${LIMITES_POBREZA[i]} y ${hasta} %` })),
    { etiqueta: `${LIMITES_POBREZA.at(-1)} % o más` },
    { etiqueta: 'Sin dato' },
  ];
  const sinDato = clases.length - 1;
  const indiceDe = (f) => {
    const v = valores[f.properties.ubigeo];
    if (v === undefined) return sinDato;
    const tramo = LIMITES_POBREZA.findIndex((limite) => v < limite);
    return tramo < 0 ? LIMITES_POBREZA.length : tramo;
  };
  return {
    clave: 'pobreza',
    clases,
    rampa: [...rampaMorados, color.sinDato],
    rampaFija: true,
    indiceDe,
    clasesUsadas: usadas(unidades.map(indiceDe)),
    titulo: () => `Pobreza monetaria total, ${anio} (% de la población)`,
    nota: 'Punto medio del intervalo de confianza al 95 % estimado por el INEI.',
    fuentes: [`Pobreza: INEI, Mapa de pobreza monetaria provincial y distrital ${anio}.`],
  };
}

/**
 * Las clases de conteo nombradas en centros: «1 centro», «Entre 2 y 3 centros», «10
 * centros o más». Los tramos son los mismos (también los de ?clases= en la URL); sólo
 * cambia el nombre, que en la de siempre habla de tipos de servicio.
 */
function enCentros(clases) {
  return clases.map((c) => ({
    ...c,
    etiqueta: c.hasta === Infinity ? `${c.desde} centros o más`
      : c.desde === c.hasta ? `${c.desde} centro${c.desde === 1 ? '' : 's'}`
        : `Entre ${c.desde} y ${c.hasta} centros`,
  }));
}

/** Índices de clase presentes, sin repetir y en orden; -1 (sin dato) no cuenta. */
function usadas(indices) {
  return [...new Set(indices.filter((i) => i >= 0))].sort((a, b) => a - b);
}
