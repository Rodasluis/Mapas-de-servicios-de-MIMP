/**
 * Construye el directorio de servicios del mapa a partir de su ÚNICA fuente: el
 * Directorio Nacional de Servicios del MIMP, publicado en abierto (DIRECTORIO_URL en
 * package.json).
 *
 * Qué hace, en orden:
 *  1. Descarga el .xlsx y comprueba que es la versión anclada (DIRECTORIO_SHA256): la
 *     URL no cambia entre versiones, así que el hash es lo único que la fija.
 *  2. Decide qué registros se publican con el criterio propio de este proyecto
 *     (scripts/lib/criterios.mjs). Un tipo sin criterio se excluye y se avisa.
 *  3. Repara las coordenadas mal escritas (coma decimal, punto decimal perdido) y las
 *     comprueba contra el polígono de su distrito:
 *       - hasta 100 m fuera: es la simplificación de la cartografía → «verificada»;
 *       - hasta 2 km: sede junto al límite → se conserva, marcada «otro_distrito»;
 *       - más lejos: la coordenada es de otro sitio → se sitúa dentro de su
 *         distrito, marcada «reubicada».
 *     Los registros de dirección reservada (Hogares de Refugio Temporal y los CAR
 *     Especializados sin dirección) no usan nunca una coordenada: se sitúan en su
 *     distrito, marcados «por_distrito».
 *  4. Publica centros.json, iconos.json y version.json en public/data, y escribe en
 *     auditoria/ una hoja de cálculo con el directorio completo, los hallazgos de cada
 *     registro y el cambio que se hizo para subsanarlos.
 *
 * Si algo no cuadra el build se detiene: es preferible no generar un mapa a generarlo
 * con datos que no podemos explicar.
 *
 * Como la ubicación usa los polígonos distritales, este paso se ejecuta después de la
 * cartografía (ver preparar.mjs).
 *
 * Uso:  npm run datos
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  paquete, abortar, descargar, escribirJson, titulo, peso, asegurarCarpeta, CACHE, PUBLICO, RAIZ,
} from './lib/comun.mjs';
import { leerHoja } from './lib/xlsx.mjs';
import { escribirLibro } from './lib/xlsx-escribir.mjs';
import { crearUbicador } from './lib/ubicar.mjs';
import { CRITERIOS, VARIANTES, CONFIDENCIAL } from './lib/criterios.mjs';
import { ICONOS, COLORES } from '../src/iconos/catalogo.js';

const { DIRECTORIO_URL, DIRECTORIO_SHA256, DIRECTORIO_FECHA } = paquete();
if (!DIRECTORIO_URL || !DIRECTORIO_SHA256 || !DIRECTORIO_FECHA) {
  abortar('Faltan DIRECTORIO_URL, DIRECTORIO_SHA256 o DIRECTORIO_FECHA en package.json.');
}

const FUENTE = 'Directorio Nacional de Servicios del MIMP';
const DEST_CACHE = path.join(CACHE, 'datos');
const DEST_PUB = path.join(PUBLICO, 'data');
const GEO = path.join(DEST_PUB, 'geo');
/** La hoja de auditoría es para revisar el directorio: va a la vista, no a public/. */
const CARPETA_AUDITORIA = path.join(RAIZ, 'auditoria');

/** Hoja con los datos y columnas que se leen. Si cambian, el build lo dice. */
const HOJA = 'SERVICIOS MIMP';
const COLUMNAS = [
  'ORDEN', 'Servicio', 'CENTRO', 'Modalidad', 'Zona Vraem', 'Cod_centro', 'Ubigeo',
  'Departamento', 'Centro de Atención', 'Dirección', 'Coodinador/a', 'Teléfono',
  'COORD_X', 'COORD_Y', 'CUENTA CON TELEFONO', 'CUENTA CON INTERNET', 'CUENTA CON LUZ',
  'CUENTA CON AGUA', 'CUENTA CON DESAGUE',
];

/** Distancia a su distrito por debajo de la cual una coordenada se da por buena. */
const TOLERANCIA_LIMITE_KM = 0.1;
/** Por debajo de esta se conserva con aviso; por encima, se reubica. */
const CERCA_DEL_LIMITE_KM = 2;

/** Marco generoso alrededor del Perú: sirve para reparar coordenadas, no recorta nada. */
const MARCO_PERU = { lonMin: -82, lonMax: -68, latMin: -19, latMax: 0.5 };

/** Siglas que se escriben en mayúsculas dentro de los nombres. */
const SIGLAS = new Set(['cem', 'car', 'ct', 'sec', 'sar', 'hrt', 'upe', 'cedif', 'sau', 'cai',
  'pias', 'cad', 'can', 'saipd', 'soufcat', 'carpam', 'pcd', 'mimp', 'inabif', 'ufcat',
  'demuna', 'crf', 'ccf', 'uae', 'ua', 'sdf', 'aec', 'effa']);
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el', 'en', 'a', 'al', 'para', 'con', 'por']);

/* ------------------------------- descarga ------------------------------- */

titulo(`${FUENTE} · ${DIRECTORIO_FECHA} · ${DIRECTORIO_SHA256.slice(0, 12)}`);
console.log(`  origen: ${DIRECTORIO_URL}`);

/* La caché se nombra por el hash esperado: al actualizar DIRECTORIO_SHA256 se vuelve a
   descargar, y mientras no cambie se trabaja siempre con el mismo archivo. */
const crudo = await descargar(
  DIRECTORIO_URL,
  path.join(DEST_CACHE, 'directorio', `${DIRECTORIO_SHA256.slice(0, 16)}.xlsx`),
  { etiqueta: 'directorio (.xlsx)' },
);
const hash = createHash('sha256').update(crudo).digest('hex');
if (hash !== DIRECTORIO_SHA256) {
  abortar(
    'El directorio descargado no es la versión anclada en package.json.',
    `esperado  ${DIRECTORIO_SHA256}\nrecibido  ${hash}\n\n`
    + 'El MIMP publicó otra versión. Revisa el informe que imprime este script con la nueva\n'
    + 'y, si está en orden, copia el hash recibido en DIRECTORIO_SHA256 y la fecha de\n'
    + 'publicación en DIRECTORIO_FECHA.',
  );
}

let hoja;
try {
  hoja = leerHoja(crudo, HOJA);
} catch (err) {
  abortar('No se pudo leer el directorio.', err.message);
}
const faltan = COLUMNAS.filter((c) => !hoja.cabecera.includes(c));
if (faltan.length) abortar(`La hoja «${HOJA}» no tiene las columnas esperadas.`, `Faltan: ${faltan.join(', ')}.`);

/* ------------------------------ territorio ------------------------------ */

/* Los nombres de departamento, provincia y distrito salen de la cartografía del INEI,
   con sus tildes, y no del directorio, que los escribe de varias formas. */
const nombresDe = (archivo, objeto) => new Map(
  JSON.parse(fs.readFileSync(path.join(GEO, archivo), 'utf8'))
    .objects[objeto].geometries.map((g) => [g.properties.ubigeo, g.properties.nombre]),
);
const nombreDep = nombresDe('departamentos.bajo.topojson', 'departamentos');
const nombreProv = nombresDe('provincias.bajo.topojson', 'provincias');
const ubicador = crearUbicador(GEO);

/* --------------------------- lectura y criterio -------------------------- */

const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const siNo = (v) => (/^s[ií]$/i.test(limpio(v)) ? 1 : /^no$/i.test(limpio(v)) ? 0 : null);
const km1 = (n) => Math.round(n * 10) / 10;

const errores = [];
const excluidos = new Map(); // «tipo||motivo» → n
const excluir = (tipo, motivo) => {
  const clave = `${tipo}||${motivo}`;
  excluidos.set(clave, (excluidos.get(clave) || 0) + 1);
};
const sinCriterio = new Map();
const variantesUsadas = new Map();
const stats = { verificada: 0, otro_distrito: 0, reubicada: 0, por_distrito: 0, reparadas: 0 };
const reubicados = [];
const centros = [];
const ordenes = new Set();

/**
 * Una entrada por fila del directorio, en su orden, se publique o no: es la hoja de
 * auditoría (auditoria/). Recoge lo que se encontró en el ubigeo y las coordenadas de
 * cada registro y lo que se hizo para subsanarlo, para que se pueda revisar y, si
 * procede, corregir en el directorio del MIMP.
 */
const auditoria = [];

for (const fila of hoja.filas) {
  const a = {
    fila, tipo: '', nombre: '', publicado: false, decision: '', hallazgos: [], cambios: [],
    lat: null, lon: null, calidad: null, caeEn: null, km: null,
  };
  auditoria.push(a);
  const noSePublica = (motivo, tipoExcluido = a.tipo) => {
    a.decision = `No se publica: ${motivo}`;
    excluir(tipoExcluido, motivo);
  };

  const original = limpio(fila.CENTRO);
  const tipo = VARIANTES[original] || original;
  a.tipo = tipo;
  if (tipo !== original) {
    variantesUsadas.set(original, (variantesUsadas.get(original) || 0) + 1);
    a.hallazgos.push(`Tipo de servicio escrito «${original}»`);
    a.cambios.push(`Se unificó como «${tipo}»`);
  }
  const nombre = formatearNombre(limpio(fila['Centro de Atención']));
  a.nombre = nombre;

  /* Diagnóstico del ubigeo y de la coordenada. Se hace para TODAS las filas, también
     las de tipos que no se publican: la hoja de auditoría sirve para revisar el
     directorio entero, no sólo lo que sale en el mapa. */
  const ubigeoCrudo = limpio(fila.Ubigeo);
  const ubigeo = ubigeoCrudo.padStart(6, '0');
  const distrito = /^\d{6}$/.test(ubigeo) ? ubicador.distrito(ubigeo) : null;
  const ubigeoValido = Boolean(distrito && nombreProv.has(ubigeo.slice(0, 4)) && nombreDep.has(ubigeo.slice(0, 2)));
  if (!ubigeoValido) a.hallazgos.push(`El ubigeo «${ubigeoCrudo}» no existe en la cartografía del INEI`);

  const direccion = limpio(fila['Dirección']);
  const reservada = CONFIDENCIAL.test(direccion);
  const hayCoordenada = limpio(fila.COORD_X) !== '' || limpio(fila.COORD_Y) !== '';
  const par = repararCoordenadas(fila.COORD_X, fila.COORD_Y);
  if (par?.reparacion) {
    a.hallazgos.push(par.reparacion.hallazgo);
    a.cambios.push(par.reparacion.cambio);
  }
  if (!par && hayCoordenada) {
    a.hallazgos.push(`Coordenada que no se puede interpretar o cae fuera del Perú («${limpio(fila.COORD_X)}», «${limpio(fila.COORD_Y)}»)`);
  }
  if (!hayCoordenada && !reservada) a.hallazgos.push('Sin coordenadas');
  if (par && ubigeoValido) {
    a.km = ubicador.distanciaKm(ubigeo, par.lon, par.lat);
    if (a.km > TOLERANCIA_LIMITE_KM) {
      const donde = ubicador.distritoEn(par.lon, par.lat);
      a.caeEn = donde ? `${donde.nombre} (${donde.ubigeo})` : 'fuera de todo distrito (mar o país vecino)';
      a.hallazgos.push(`La coordenada cae fuera de su distrito, a ${km1(a.km)} km, en ${a.caeEn}`);
    }
  }

  const criterio = CRITERIOS[tipo];
  if (!criterio) {
    sinCriterio.set(tipo, limpio(fila.Servicio));
    noSePublica('tipo sin criterio de publicación (revisar scripts/lib/criterios.mjs)');
    continue;
  }
  if (!criterio.publica) { noSePublica(criterio.motivo); continue; }

  const orden = Number(limpio(fila.ORDEN));
  const ref = `${nombre || '(sin nombre)'} [ORDEN ${limpio(fila.ORDEN)}]`;
  if (!Number.isInteger(orden) || orden <= 0) { errores.push(`${ref}: ORDEN no es un entero.`); continue; }
  if (ordenes.has(orden)) { errores.push(`${ref}: ORDEN repetido.`); continue; }
  ordenes.add(orden);

  if (!ubigeoValido) {
    noSePublica('ubigeo que no está en la cartografía del INEI');
    a.cambios.push('Se excluye del mapa: sin un distrito válido no hay dónde ubicarlo');
    continue;
  }

  /* Por distrito van los tipos que lo son siempre (hogares de refugio) y los registros
     de dirección reservada de un tipo que lo admite expresamente (CAR Especializado). */
  const porDistrito = criterio.ubicacion === 'distrito' || (reservada && criterio.siReservada === 'distrito');
  let punto;
  let calidad;
  let coordenadaOriginal;

  if (porDistrito) {
    /* Nunca se usa su coordenada, aunque el directorio llegara a traerla. Y si un
       servicio que siempre es de dirección reservada trajera una dirección, el build se
       detiene: la tabla del ámbito distrital la imprimiría y quedaría localizado. */
    if (criterio.ubicacion === 'distrito' && direccion && !reservada) {
      errores.push(`${ref}: el directorio publica una dirección para un servicio de dirección reservada. Revísalo antes de publicarla.`);
      continue;
    }
    punto = ubicador.puntoInterior(ubigeo);
    calidad = 'por_distrito';
    a.hallazgos.push('Dirección reservada por el directorio («No se registra por confidencialidad»)');
    a.cambios.push(`Ubicado en un punto interior de su distrito, ${distrito.nombre} (${ubigeo}); se marca con asterisco`);
    if (par) a.cambios.push('Su coordenada no se usa');
  } else if (reservada) {
    noSePublica('dirección reservada por el directorio; su tipo no se publica por distrito');
    a.hallazgos.push('Dirección reservada por el directorio («No se registra por confidencialidad»)');
    a.cambios.push('Se excluye del mapa');
    continue;
  } else if (!par) {
    noSePublica('sin coordenadas utilizables en el directorio');
    a.cambios.push('Se excluye del mapa');
    continue;
  } else {
    if (par.reparacion) stats.reparadas++;
    if (a.km <= TOLERANCIA_LIMITE_KM) {
      punto = par; calidad = 'verificada';
    } else if (a.km <= CERCA_DEL_LIMITE_KM) {
      punto = par; calidad = 'otro_distrito';
      a.cambios.push(`Se conserva la coordenada (a menos de ${CERCA_DEL_LIMITE_KM} km del límite); se marca con asterisco`);
    } else {
      punto = ubicador.puntoInterior(ubigeo);
      calidad = 'reubicada';
      coordenadaOriginal = { lat: par.lat, lon: par.lon };
      reubicados.push({ nombre, tipo, ubigeo, km: a.km });
      a.cambios.push(`Se situó en un punto interior de su distrito, ${distrito.nombre} (${ubigeo}); se marca con asterisco`);
    }
  }
  if (!punto) { errores.push(`${ref}: no se pudo calcular un punto interior del distrito ${ubigeo}.`); continue; }
  stats[calidad]++;

  Object.assign(a, { publicado: true, decision: 'Se publica', lat: redondo(punto.lat), lon: redondo(punto.lon), calidad });

  const ccdd = ubigeo.slice(0, 2);
  const ccpp = ubigeo.slice(0, 4);
  centros.push({
    id: orden,
    nombre,
    tipo,
    servicio: limpio(fila.Servicio) || null,
    modalidad: limpio(fila.Modalidad) || null,
    codigo: limpio(fila.Cod_centro) || null,
    ubigeo,
    ccdd,
    ccpp,
    dep: nombreDep.get(ccdd),
    prov: nombreProv.get(ccpp),
    dist: distrito.nombre,
    /* Etiqueta administrativa del MIMP («Lima Metropolitana», «Lima Provincias»). */
    ambito: limpio(fila.Departamento) || null,
    direccion: direccion || null,
    responsable: limpio(fila['Coodinador/a']) || null,
    telefono: limpio(fila['Teléfono']) || null,
    vraem: siNo(fila['Zona Vraem']) === 1,
    lat: redondo(punto.lat),
    lon: redondo(punto.lon),
    calidad,
    ...(coordenadaOriginal ? { coordenadaOriginal } : {}),
    equip: {
      telefono: siNo(fila['CUENTA CON TELEFONO']),
      internet: siNo(fila['CUENTA CON INTERNET']),
      luz: siNo(fila['CUENTA CON LUZ']),
      agua: siNo(fila['CUENTA CON AGUA']),
      desague: siNo(fila['CUENTA CON DESAGUE']),
    },
  });
}

/* Un hallazgo de un registro que no sale en el mapa no se subsana: se deja dicho. */
for (const a of auditoria) {
  if (a.hallazgos.length && !a.cambios.length) a.cambios.push(a.publicado ? 'Ninguno' : 'Ninguno: el registro no se publica en el mapa');
}

/* Todo tipo publicado necesita ícono y color: sin ellos no hay forma de dibujarlo ni
   de ponerlo en la leyenda. */
const conteoTipo = new Map();
for (const c of centros) conteoTipo.set(c.tipo, (conteoTipo.get(c.tipo) || 0) + 1);
for (const t of conteoTipo.keys()) {
  if (!ICONOS[t]) errores.push(`«${t}» se publica pero no tiene ícono en src/iconos/catalogo.js.`);
  if (!COLORES[t]) errores.push(`«${t}» se publica pero no tiene color en COLORES (src/iconos/catalogo.js).`);
}
for (const t of Object.keys(CRITERIOS).filter((k) => CRITERIOS[k].publica)) {
  if (!conteoTipo.has(t)) errores.push(`El criterio publica «${t}», pero el directorio no trae ningún registro publicable.`);
}

/* -------------------------------- informe ------------------------------- */

titulo('Informe de datos');
console.log(`  fuente              ${FUENTE}`);
console.log(`  versión             ${DIRECTORIO_FECHA} · sha256 ${hash.slice(0, 12)}`);
console.log(`  registros           ${hoja.filas.length}`);
console.log(`  centros publicados  ${centros.length}`);
console.log(`  departamentos       ${new Set(centros.map((c) => c.ccdd)).size} de ${nombreDep.size}`);
console.log(`  provincias con red  ${new Set(centros.map((c) => c.ccpp)).size} de ${nombreProv.size}`);
console.log(`  distritos con red   ${new Set(centros.map((c) => c.ubigeo)).size}`);

const porTipo = [...conteoTipo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
console.log(`\n  Centros por tipo (${porTipo.length} tipos)`);
for (const [tipo, n] of porTipo) {
  const marca = CRITERIOS[tipo].ubicacion === 'distrito' ? '◦' : ' ';
  console.log(`   ${marca} ${String(n).padStart(4)}  ${tipo}`);
}
console.log(`     ${String(centros.length).padStart(4)}  TOTAL`);
console.log('   (◦ = ubicado por distrito: dirección reservada)');

console.log('\n  Calidad de las coordenadas');
for (const [k, n] of Object.entries(stats)) console.log(`     ${String(n).padStart(4)}  ${k}`);

if (reubicados.length) {
  console.log(`\n  Coordenada a más de ${CERCA_DEL_LIMITE_KM} km de su distrito → situados dentro del suyo`);
  for (const r of reubicados.sort((a, b) => b.km - a.km)) {
    console.log(`     ${String(Math.round(r.km)).padStart(5)} km  ${r.nombre} (${r.ubigeo}) · ${r.tipo}`);
  }
}

const listaExcluidos = [...excluidos].sort((a, b) => b[1] - a[1]);
console.log(`\n  Excluidos (${hoja.filas.length - centros.length})`);
for (const [clave, n] of listaExcluidos) {
  const [tipo, motivo] = clave.split('||');
  console.log(`   ${String(n).padStart(4)}  ${tipo}`);
  console.log(`         ↳ ${motivo}`);
}

const avisos = [];
for (const [variante, n] of variantesUsadas) {
  avisos.push(`${n} registro(s) con CENTRO «${variante}» se tratan como «${VARIANTES[variante]}» (VARIANTES).`);
}
for (const [tipo, servicio] of sinCriterio) {
  avisos.push(`Tipo sin criterio, excluido por precaución: «${tipo}» (Servicio: «${servicio}»). Decide en scripts/lib/criterios.mjs.`);
}
if (avisos.length) {
  console.log('\n  Avisos');
  for (const a of avisos) console.log(`   ! ${a}`);
}

if (errores.length) {
  abortar(
    `El directorio no supera la verificación (${errores.length} ${errores.length === 1 ? 'problema' : 'problemas'}).`,
    errores.map((e, i) => `${i + 1}. ${e}`).join('\n'),
  );
}

/* ------------------------------- publicación ---------------------------- */

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const unico = (lista, clave) => [...new Map(lista.map((x) => [x[clave], x])).values()];
const catalogo = {
  departamentos: unico(centros.map((c) => ({ id: c.ccdd, nombre: c.dep })), 'id').sort(porNombre),
  provincias: unico(centros.map((c) => ({ id: c.ccpp, nombre: c.prov, ccdd: c.ccdd })), 'id').sort(porNombre),
  distritos: unico(centros.map((c) => ({ id: c.ubigeo, nombre: c.dist, ccpp: c.ccpp, ccdd: c.ccdd })), 'id').sort(porNombre),
  tipos: porTipo.map(([t]) => t).sort((a, b) => a.localeCompare(b, 'es')),
};

const version = {
  fuente: FUENTE,
  url: DIRECTORIO_URL,
  /* `datosTag` es la versión de los datos: el hash del archivo publicado por el MIMP.
     Con él se aprueban las referencias visuales y se imprime el pie. */
  datosTag: DIRECTORIO_SHA256,
  datosTagCorto: DIRECTORIO_SHA256.slice(0, 7),
  generado: DIRECTORIO_FECHA,
  totalCentros: centros.length,
  totalDirectorio: hoja.filas.length,
  excluidos: hoja.filas.length - centros.length,
  tipos: porTipo.map(([tipo, n]) => ({ tipo, n })),
};

titulo('Publicación en public/data');
let total = 0;
total += escribirJson(path.join(DEST_PUB, 'centros.json'), {
  meta: { ...version, calidadCoordenadas: stats },
  catalogo,
  centros: centros.sort((a, b) => a.id - b.id),
});
total += escribirJson(path.join(DEST_PUB, 'iconos.json'), {
  fuente: 'src/iconos/catalogo.js',
  tipos: Object.fromEntries(porTipo.map(([t]) => [t, { color: COLORES[t], etiqueta: t }])),
});
total += escribirJson(path.join(DEST_PUB, 'version.json'), version);
/* Restos de cuando los datos venían del repositorio del buscador. */
fs.rmSync(path.join(DEST_PUB, 'iconos-png'), { recursive: true, force: true });
for (const f of ['centros.json', 'iconos.json', 'version.json']) {
  console.log(`  ✓ ${f.padEnd(13)} ${peso(fs.statSync(path.join(DEST_PUB, f)).size)}`);
}

/* ------------------------------- auditoría ------------------------------ */

titulo('Hoja de auditoría');
const rutaAuditoria = path.join(CARPETA_AUDITORIA, `auditoria_directorio_${DIRECTORIO_FECHA}.xlsx`);
asegurarCarpeta(CARPETA_AUDITORIA);
/* Sólo la de la versión vigente: una hoja de otra versión describe otro archivo, y
   tenerla al lado invita a revisar lo que ya no está. El historial queda en git. */
for (const f of fs.readdirSync(CARPETA_AUDITORIA)) {
  if (/^auditoria_directorio_.*\.xlsx$/.test(f) && path.join(CARPETA_AUDITORIA, f) !== rutaAuditoria) {
    fs.rmSync(path.join(CARPETA_AUDITORIA, f));
  }
}
fs.writeFileSync(rutaAuditoria, libroDeAuditoria());
const conHallazgo = auditoria.filter((a) => a.hallazgos.length).length;
console.log(`  ✓ ${path.relative(RAIZ, rutaAuditoria)}  ${peso(fs.statSync(rutaAuditoria).size)}`
  + ` · ${auditoria.length} registros, ${conHallazgo} con hallazgos`);

console.log(`\n✓ Directorio verificado y publicado (${peso(total)}).\n`);

/**
 * El directorio completo, fila por fila y con sus columnas originales, más lo que este
 * proyecto encontró en cada registro y lo que hizo con él. Tres hojas: el directorio
 * auditado, el criterio aplicado a cada tipo de servicio y una hoja «Léeme».
 */
function libroDeAuditoria() {
  const UBICACION = {
    verificada: 'Coordenada del directorio',
    otro_distrito: 'Coordenada del directorio, junto al límite (*)',
    reubicada: 'Punto interior de su distrito (*)',
    por_distrito: 'Punto interior de su distrito; dirección reservada (*)',
  };
  const ANCHOS = {
    Servicio: 34, CENTRO: 30, 'Centro de Atención': 34, 'Dirección': 38, 'Coodinador/a': 28, Departamento: 16,
  };
  const anadidas = [
    { titulo: 'Tipo en el mapa', ancho: 30 },
    { titulo: 'Nombre en el mapa', ancho: 34 },
    { titulo: '¿Se publica?', ancho: 11 },
    { titulo: 'Decisión', ancho: 40 },
    { titulo: 'Hallazgos', ancho: 64 },
    { titulo: 'Cambio realizado', ancho: 64 },
    { titulo: 'Ubicación en el mapa', ancho: 34 },
    { titulo: 'Latitud en el mapa', ancho: 12 },
    { titulo: 'Longitud en el mapa', ancho: 12 },
    { titulo: 'Distancia a su distrito (km)', ancho: 12 },
    { titulo: 'Distrito donde cae la coordenada', ancho: 30 },
  ];
  const directorio = {
    nombre: 'Directorio auditado',
    columnas: [
      ...hoja.cabecera.map((c) => ({ titulo: c, ancho: ANCHOS[c] || 13 })),
      ...anadidas,
    ],
    filas: auditoria.map((a) => ({
      /* Resaltadas las que tienen algún hallazgo; atenuadas las que no se publican y no
         tienen nada que revisar. */
      estilo: a.hallazgos.length ? 2 : a.publicado ? 0 : 3,
      celdas: [
        ...hoja.cabecera.map((c) => {
          const v = limpio(a.fila[c]);
          return c === 'ORDEN' && /^\d+$/.test(v) ? Number(v) : v;
        }),
        a.tipo,
        a.nombre,
        a.publicado ? 'Sí' : 'No',
        a.decision,
        a.hallazgos.join('; '),
        a.cambios.join('; '),
        a.calidad ? UBICACION[a.calidad] : '',
        a.lat,
        a.lon,
        a.km !== null && a.km > TOLERANCIA_LIMITE_KM ? km1(a.km) : null,
        a.caeEn,
      ],
    })),
  };

  const porCentro = new Map();
  for (const a of auditoria) {
    const t = porCentro.get(a.tipo) || { registros: 0, publicados: 0 };
    t.registros++;
    if (a.publicado) t.publicados++;
    porCentro.set(a.tipo, t);
  }
  const tiposCriterio = [...new Set([...porCentro.keys(), ...Object.keys(CRITERIOS)])]
    .sort((x, y) => (porCentro.get(y)?.registros || 0) - (porCentro.get(x)?.registros || 0) || x.localeCompare(y, 'es'));
  const criterios = {
    nombre: 'Criterios',
    columnas: [
      { titulo: 'Tipo de servicio (CENTRO)', ancho: 44 },
      { titulo: '¿Se publica?', ancho: 11 },
      { titulo: 'Ubicación', ancho: 40 },
      { titulo: 'Motivo', ancho: 70 },
      { titulo: 'Registros en el directorio', ancho: 14 },
      { titulo: 'Publicados', ancho: 12 },
    ],
    filas: tiposCriterio.map((t) => {
      const c = CRITERIOS[t];
      const n = porCentro.get(t) || { registros: 0, publicados: 0 };
      const ubicacion = !c?.publica ? ''
        : c.ubicacion === 'distrito' ? 'Por distrito (dirección reservada)'
          : c.siReservada === 'distrito' ? 'Coordenada; por distrito si la dirección es reservada'
            : 'Coordenada';
      return {
        estilo: c?.publica ? 0 : 3,
        celdas: [t, c ? (c.publica ? 'Sí' : 'No') : 'Sin criterio', ubicacion,
          c ? c.motivo : 'Sin decidir: se excluye hasta que se decida en scripts/lib/criterios.mjs',
          n.registros, n.publicados],
      };
    }),
  };

  const leeme = {
    nombre: 'Léeme',
    filtro: false,
    columnas: [{ titulo: 'Campo', ancho: 30 }, { titulo: 'Descripción', ancho: 110 }],
    filas: [
      ['Fuente', FUENTE],
      ['Archivo', DIRECTORIO_URL],
      ['Versión (fecha de publicación)', DIRECTORIO_FECHA],
      ['SHA-256 del archivo', DIRECTORIO_SHA256],
      ['Registros', auditoria.length],
      ['Publicados en el mapa', centros.length],
      ['Registros con hallazgos', auditoria.filter((a) => a.hallazgos.length).length],
      ['Filas resaltadas', 'Registros con algún hallazgo en el tipo, el ubigeo o las coordenadas.'],
      ['Filas en gris', 'Registros que no se publican y no tienen hallazgos.'],
      ['Hallazgos', 'Lo que se encontró en el registro: ubigeo inexistente, coordenada mal escrita, coordenada fuera de su distrito, dirección reservada, variante de escritura del tipo.'],
      ['Cambio realizado', 'Lo que hizo este proyecto para subsanarlo. El directorio del MIMP no se modifica: los cambios sólo se aplican al mapa.'],
      ['Coordenada fuera de su distrito', `Hasta ${TOLERANCIA_LIMITE_KM * 1000} m se da por buena (simplificación de la cartografía). Hasta ${CERCA_DEL_LIMITE_KM} km se conserva con asterisco. Más lejos, el centro se sitúa en un punto interior del distrito de su ubigeo, con asterisco.`],
      ['Dirección reservada', 'Hogares de Refugio Temporal y CAR Especializados sin dirección publicada: se sitúan en un punto interior de su distrito, con asterisco; nunca en una coordenada.'],
      ['Distrito donde cae la coordenada', 'Distrito del INEI que contiene la coordenada del directorio, cuando no es el de su ubigeo. Sirve para decidir si el error está en la coordenada o en el ubigeo.'],
      ['Punto interior del distrito', 'Polo de inaccesibilidad: el punto del distrito más alejado de su borde. No pretende parecerse a la ubicación real.'],
      ['Cómo se genera', 'npm run datos (scripts/fetch-datos.mjs), con el criterio de scripts/lib/criterios.mjs. Se regenera con cada versión del directorio.'],
    ].map((celdas) => ({ celdas })),
  };

  return escribirLibro([directorio, criterios, leeme]);
}

/* ------------------------------- utilidades ----------------------------- */

/**
 * Coordenadas tal como las escribe el directorio, reparadas si hace falta:
 *  - coma decimal («-71,40440»);
 *  - punto decimal perdido («-80744639»): se divide por la MISMA potencia de 10 los
 *    dos ejes hasta que caen en el Perú. Un factor distinto para cada eje produce
 *    puntos plausibles pero equivocados.
 * @returns {{lon, lat, reparacion: {hallazgo, cambio}|null}|null}
 */
function repararCoordenadas(xCrudo, yCrudo) {
  const leer = (v) => {
    const s = limpio(v).replace(',', '.');
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : null;
  };
  const X = leer(xCrudo);
  const Y = leer(yCrudo);
  if (X === null || Y === null) return null;
  const crudo = `«${limpio(xCrudo)}», «${limpio(yCrudo)}»`;
  const conComa = /,/.test(limpio(xCrudo) + limpio(yCrudo));
  for (let k = 0; k <= 9; k++) {
    const lon = X / 10 ** k;
    const lat = Y / 10 ** k;
    if (lon >= MARCO_PERU.lonMin && lon <= MARCO_PERU.lonMax && lat >= MARCO_PERU.latMin && lat <= MARCO_PERU.latMax) {
      /* Qué se encontró y qué se hizo, en palabras, para la hoja de auditoría. */
      const reparacion = k > 0
        ? {
          hallazgo: `Coordenada sin punto decimal (${crudo})`,
          cambio: `Se dividieron los dos ejes entre ${10 ** k}: ${redondo(lon)}, ${redondo(lat)}`,
        }
        : conComa
          ? { hallazgo: `Coordenada con coma decimal (${crudo})`, cambio: 'Se leyó la coma como punto decimal' }
          : null;
      return { lon, lat, reparacion };
    }
  }
  return null;
}

function redondo(n) { return Math.round(n * 1e6) / 1e6; }

/**
 * Nombre en el formato de la lámina: «CEM REGULAR SATIPO» → «CEM Regular Satipo».
 * Las siglas del MIMP quedan en mayúsculas y los artículos, en minúsculas.
 */
function formatearNombre(s) {
  if (!s) return '';
  return s.toLowerCase().split(/(\s+|-|\/)/).map((p, i) => {
    if (!p || /^(\s+|-|\/)$/.test(p)) return p;
    if (SIGLAS.has(p)) return p.toUpperCase();
    if (/^[a-zñ](?:\.[a-zñ]){1,}\.?$/.test(p)) return p.toUpperCase(); // «c.a.i.» → «C.A.I.»
    if (i > 0 && MENORES.has(p)) return p;
    if (/^\d/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join('');
}
