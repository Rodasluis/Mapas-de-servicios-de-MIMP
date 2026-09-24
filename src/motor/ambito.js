/**
 * Ámbito del mapa: qué se imprime y con qué geometría.
 *
 * Un mapa del Perú, uno de un departamento y uno de una provincia no se diferencian
 * sólo en el encuadre. Cambia la UNIDAD que colorea el coropletas, cambia qué
 * representa cada símbolo y cambian los nombres que se escriben. Este módulo concentra
 * esas tres decisiones para que el resto del motor —proyección, layout, rótulos,
 * recuadros— trabaje igual sea cual sea el ámbito.
 *
 * La regla que ordena todo es de lectura, no de implementación: **cada mapa se agrega
 * un nivel por debajo del que retrata**. El del país cuenta por provincia; el de un
 * departamento, por distrito; y el de una provincia ya no agrega nada, porque a esa
 * escala cada centro cabe en su sitio real y agruparlos escondería lo único que a esa
 * escala se puede ver: dónde está cada uno.
 *
 * El territorio de alrededor se dibuja siempre. Un departamento que acabara en su
 * propio límite parecería una isla y nadie sabría por dónde se entra; los vecinos van
 * atenuados y con su nombre, que es como se resuelve en cualquier lámina impresa.
 */

export const NIVELES = ['nacional', 'departamento', 'provincia', 'distrito'];

/** Ámbito por omisión: el país entero. */
export const NACIONAL = { nivel: 'nacional', id: null };

/**
 * Normaliza lo que llega de la interfaz o de una muestra.
 *
 * Acepta `'15'` y `'1501'` sueltos además del objeto, porque el ubigeo ya dice de qué
 * nivel se trata por su longitud y obligar a repetirlo sólo da ocasión de contradecirse.
 */
export function normalizarAmbito(ambito) {
  if (!ambito) return { ...NACIONAL };
  if (typeof ambito === 'string') {
    const id = ambito.trim();
    if (!id || id.toLowerCase() === 'nacional' || id === 'pe') return { ...NACIONAL };
    if (id.length === 2) return { nivel: 'departamento', id };
    if (id.length === 4) return { nivel: 'provincia', id };
    if (id.length === 6) return { nivel: 'distrito', id };
    throw new Error(`Ubigeo de ámbito no reconocido: «${ambito}».`);
  }
  const nivel = ambito.nivel || 'nacional';
  if (!NIVELES.includes(nivel)) throw new Error(`Ámbito desconocido: «${nivel}».`);
  if (nivel === 'nacional') return { ...NACIONAL };
  if (!ambito.id) throw new Error(`El ámbito «${nivel}» necesita un ubigeo.`);
  return { nivel, id: String(ambito.id) };
}

/** Departamento al que pertenece un ámbito, o null en el nacional. */
export const departamentoDe = (ambito) => (ambito.nivel === 'nacional' ? null : ambito.id.slice(0, 2));

/**
 * Geometría con la que se tantea la escala.
 *
 * El nivel de detalle se elige por la escala, y la escala sale del encaje, así que hay
 * un huevo y una gallina. Se rompe encajando primero con el contorno más ligero: entre
 * niveles la diferencia son metros de contorno frente a las decenas de kilómetros del
 * ámbito, así que no cambia la elección, y después se rehace con el nivel definitivo.
 */
export async function encajeDeTanteo(ambito, cargador) {
  const { nivel, id } = ambito;
  if (nivel === 'nacional') return cargador.departamentos('bajo');
  if (nivel === 'departamento') {
    const todos = await cargador.departamentos('bajo');
    return soloRasgos(todos, (f) => f.properties.ubigeo === id, `departamento ${id}`);
  }
  if (nivel === 'provincia') {
    const provincias = await cargador.provinciasDe(departamentoDe(ambito), 'bajo');
    return soloRasgos(provincias, (f) => f.properties.ubigeo === id, `provincia ${id}`);
  }
  /* Un distrito es tan pequeño que el nivel ligero ya no lo describe: a esa escala su
     contorno son cuatro vértices y el encaje saldría torcido. Se tantea con el alto,
     que es además el que se va a dibujar. */
  const distritos = await cargador.distritosDe(departamentoDe(ambito), 'alto');
  return soloRasgos(distritos, (f) => f.properties.ubigeo === id, `distrito ${id}`);
}

/**
 * Carga todo lo que el ámbito necesita, ya clasificado por su papel en el dibujo.
 *
 * Devuelve siempre las mismas claves, con listas vacías donde no apliquen, para que
 * quien dibuja no tenga que preguntar en qué ámbito está.
 *
 * @returns {{
 *   unidades, intermedios, contorno, exterior, encaje,
 *   agregacion: 'provincia'|'distrito'|'ninguna',
 *   simbolos: 'agregado'|'individual',
 *   claveCentro: (centro) => string,
 *   perteneceAlAmbito: (centro) => boolean,
 *   rotulos: Array<{nivel, rasgos, prioridad, mayusculas, exterior}>,
 * }}
 */
export async function cargarAmbito({ ambito, cargador, nivel }) {
  if (ambito.nivel === 'nacional') return cargarNacional({ cargador, nivel });
  if (ambito.nivel === 'departamento') return cargarDepartamento({ ambito, cargador, nivel });
  if (ambito.nivel === 'provincia') return cargarProvincia({ ambito, cargador, nivel });
  return cargarDistrito({ ambito, cargador, nivel });
}

/* ------------------------------- nacional -------------------------------- */

/**
 * El país: se colorea por provincia y se rotulan departamentos y provincias.
 * Fuera del Perú sólo hay países vecinos, que los trae la capa de contexto.
 */
async function cargarNacional({ cargador, nivel }) {
  const [departamentos, provincias] = await Promise.all([
    cargador.departamentos(nivel), cargador.provincias(nivel),
  ]);
  return {
    nombre: 'Perú',
    descripcion: 'Ámbito nacional',
    jerarquia: '',
    unidades: provincias,
    intermedios: coleccion([]),
    contorno: departamentos,
    exterior: coleccion([]),
    encaje: departamentos,
    zonas: zonasPor(2, departamentos.features, true),
    trazos: { unidad: 'limiteProvincial', intermedio: null, contorno: 'limiteDepartamental' },
    agregacion: 'provincia',
    simbolos: 'agregado',
    claveCentro: (c) => c.ccpp,
    perteneceAlAmbito: () => true,
    rotulos: [
      { nivel: 'departamento', rasgos: departamentos.features, prioridad: 1, mayusculas: true },
      { nivel: 'provincia', rasgos: provincias.features, prioridad: 2, mayusculas: false },
    ],
  };
}

/* ----------------------------- departamento ------------------------------ */

/**
 * Un departamento: se colorea por DISTRITO y se rotulan provincias y distritos.
 *
 * Las provincias siguen dibujándose como límite intermedio aunque ya no sean la unidad
 * del color. Sin ellas, ochenta o cien distritos forman una retícula sin jerarquía en
 * la que no se distingue a qué provincia pertenece cada uno.
 */
async function cargarDepartamento({ ambito, cargador, nivel }) {
  const ccdd = ambito.id;
  const [departamentos, provincias, distritos] = await Promise.all([
    cargador.departamentos(nivel),
    cargador.provinciasDe(ccdd, nivel),
    cargador.distritosDe(ccdd, nivel),
  ]);
  const propio = departamentos.features.find((f) => f.properties.ubigeo === ccdd);
  if (!propio) throw new Error(`No hay geometría del departamento ${ccdd}.`);

  const vecinos = departamentos.features.filter((f) => f.properties.ubigeo !== ccdd);

  return {
    nombre: propio.properties.nombre,
    descripcion: `Departamento de ${propio.properties.nombre}`,
    jerarquia: '',
    unidades: distritos,
    intermedios: provincias,
    contorno: coleccion([propio]),
    exterior: coleccion(vecinos),
    encaje: coleccion([propio]),
    zonas: zonasPor(4, provincias.features),
    /* Tres pesos bien separados: distrito fino y gris, provincia gruesa y oscura, y el
       contorno del departamento por encima de las dos. */
    trazos: {
      unidad: 'limiteDistrital',
      intermedio: 'limiteProvincialDestacado',
      contorno: 'limiteNacional',
    },
    agregacion: 'distrito',
    simbolos: 'agregado',
    claveCentro: (c) => c.ubigeo,
    perteneceAlAmbito: (c) => c.ccdd === ccdd,
    rotulos: [
      { nivel: 'provincia', rasgos: provincias.features, prioridad: 1, mayusculas: true },
      { nivel: 'distrito', rasgos: distritos.features, prioridad: 2, mayusculas: false },
      /* Los departamentos vecinos se rotulan aunque estén fuera: son la referencia que
         dice hacia dónde sigue el territorio. Van los últimos en prioridad porque
         ninguno de ellos debe quitarle el sitio a un nombre de dentro del ámbito. */
      { nivel: 'exterior', rasgos: vecinos, prioridad: 3, mayusculas: true, exterior: true },
    ],
  };
}

/* ------------------------------- provincia ------------------------------- */

/**
 * Una provincia: cada centro en su posición real, con su ícono.
 *
 * A esta escala agregar sería tapar la respuesta. El mapa nacional dice qué servicios
 * LLEGAN a cada provincia; el de una provincia tiene que decir DÓNDE está cada uno, que
 * es lo que alguien necesita para ir. El coropletas sigue por distrito, que da el
 * contexto de reparto sin competir con los símbolos.
 */
async function cargarProvincia({ ambito, cargador, nivel }) {
  const ccpp = ambito.id;
  const ccdd = departamentoDe(ambito);
  const [provincias, distritos, departamentos] = await Promise.all([
    cargador.provinciasDe(ccdd, nivel),
    cargador.distritosDe(ccdd, nivel),
    cargador.departamentos(nivel),
  ]);
  const propia = provincias.features.find((f) => f.properties.ubigeo === ccpp);
  if (!propia) throw new Error(`No hay geometría de la provincia ${ccpp}.`);

  const departamento = departamentos.features.find((f) => f.properties.ubigeo === ccdd);
  const dentro = distritos.features.filter((f) => f.properties.ubigeo.startsWith(ccpp));
  const fuera = distritos.features.filter((f) => !f.properties.ubigeo.startsWith(ccpp));

  /* El exterior se compone en dos anillos: los distritos del mismo departamento, que
     son los vecinos inmediatos, y los demás departamentos enteros para lo que quede
     más allá. Sin los segundos, una provincia en el borde del departamento aparecería
     rodeada de vacío justo por el lado por el que se llega a ella. */
  const otrosDepartamentos = departamentos.features.filter((f) => f.properties.ubigeo !== ccdd);

  return {
    nombre: propia.properties.nombre,
    descripcion: `Provincia de ${propia.properties.nombre}`,
    jerarquia: departamento ? `Departamento de ${departamento.properties.nombre}` : '',
    unidades: coleccion(dentro),
    intermedios: coleccion([]),
    contorno: coleccion([propia]),
    exterior: coleccion([...otrosDepartamentos, ...fuera]),
    encaje: coleccion([propia]),
    zonas: zonasPor(6, dentro),
    trazos: { unidad: 'limiteDistrital', intermedio: null, contorno: 'limiteNacional' },
    agregacion: 'distrito',
    simbolos: 'individual',
    claveCentro: (c) => c.ubigeo,
    perteneceAlAmbito: (c) => c.ccpp === ccpp,
    rotulos: [
      { nivel: 'distrito', rasgos: dentro, prioridad: 1, mayusculas: false },
      { nivel: 'exterior', rasgos: fuera, prioridad: 3, mayusculas: false, exterior: true },
    ],
  };
}

/* -------------------------------- distrito ------------------------------- */

/**
 * Un distrito: todos sus centros identificados uno a uno.
 *
 * Es el único ámbito en el que el mapa no responde «dónde hay servicios» sino «cuáles
 * son». A esta escala caben los dos datos que faltaban —el nombre y la dirección de
 * cada centro—, y por eso la lámina lleva una tabla: un ícono sobre una manzana dice
 * que ahí hay un CEM, pero no cuál ni en qué calle.
 *
 * No se colorea por clases. La coropleta compara unidades entre sí y aquí sólo hay una:
 * pintarla de un tono de la rampa invitaría a leer una intensidad que no significa nada.
 */
async function cargarDistrito({ ambito, cargador, nivel }) {
  const ubigeo = ambito.id;
  const ccpp = ubigeo.slice(0, 4);
  const ccdd = ubigeo.slice(0, 2);
  const [distritos, provincias, departamentos] = await Promise.all([
    cargador.distritosDe(ccdd, nivel),
    cargador.provinciasDe(ccdd, nivel),
    cargador.departamentos(nivel),
  ]);
  const propio = distritos.features.find((f) => f.properties.ubigeo === ubigeo);
  if (!propio) throw new Error(`No hay geometría del distrito ${ubigeo}.`);
  const provincia = provincias.features.find((f) => f.properties.ubigeo === ccpp);
  const departamento = departamentos.features.find((f) => f.properties.ubigeo === ccdd);

  const vecinos = distritos.features.filter((f) => f.properties.ubigeo !== ubigeo);
  const otrosDepartamentos = departamentos.features.filter((f) => f.properties.ubigeo !== ccdd);

  return {
    nombre: propio.properties.nombre,
    descripcion: `Distrito de ${propio.properties.nombre}`,
    jerarquia: [
      provincia && `Provincia de ${provincia.properties.nombre}`,
      departamento && `Departamento de ${departamento.properties.nombre}`,
    ].filter(Boolean).join(' · '),
    unidades: coleccion([propio]),
    intermedios: coleccion([]),
    contorno: coleccion([propio]),
    exterior: coleccion([...otrosDepartamentos, ...vecinos]),
    encaje: coleccion([propio]),
    /* Sin recuadros de zoom: la zona sería el propio distrito, así que el «recuadro»
       repetiría el mapa entero a su lado. */
    zonas: null,
    coropleta: false,
    trazos: { unidad: 'limiteNacional', intermedio: null, contorno: 'limiteNacional' },
    agregacion: 'distrito',
    simbolos: 'numerado',
    claveCentro: (c) => c.ubigeo,
    perteneceAlAmbito: (c) => c.ubigeo === ubigeo,
    rotulos: [
      /* El propio distrito lleva su nombre sobre el mapa, con prioridad máxima: el
         título lo dice, pero sobre la lámina hay que poder señalar cuál de las áreas
         blancas es la que se está retratando sin volver a leer la cabecera. */
      { nivel: 'provincia', rasgos: [propio], prioridad: 1, mayusculas: true },
      { nivel: 'exterior', rasgos: vecinos, prioridad: 2, mayusculas: false, exterior: true },
    ],
  };
}

/* -------------------------------- utilidades ----------------------------- */

const coleccion = (features) => ({ type: 'FeatureCollection', features });

/**
 * Cómo se agrupan las unidades en ZONAS ampliables, y cómo se llama cada una.
 *
 * La zona es siempre el nivel inmediatamente superior a la unidad que se dibuja, que es
 * la agrupación que un lector reconoce: en el mapa del país, las provincias se amplían
 * por departamento; en el de un departamento, los distritos por provincia. `longitud`
 * son los dígitos del ubigeo de la unidad que forman la clave de su zona.
 *
 * `limaAparte` sólo tiene sentido cuando las zonas son departamentos: es el corte que
 * separa Lima Metropolitana y Callao del resto de Lima. Dentro de un mapa del
 * departamento de Lima, «Lima Metropolitana» ya es una de sus provincias.
 */
const zonasPor = (longitud, rasgos, limaAparte = false) => ({
  longitud,
  limaAparte,
  nombres: new Map(rasgos.map((f) => [f.properties.ubigeo, f.properties.nombre])),
});

function soloRasgos(coleccionEntera, predicado, queEs) {
  const features = coleccionEntera.features.filter(predicado);
  if (!features.length) throw new Error(`No hay geometría del ${queEs}.`);
  return coleccion(features);
}
