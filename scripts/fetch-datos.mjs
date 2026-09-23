/**
 * Descarga el directorio de servicios del MIMP desde el repositorio del buscador,
 * anclado a la versión DATOS_TAG de package.json, y lo verifica antes de publicarlo.
 *
 * Este proyecto NO clasifica centros: el buscador ya aplica un criterio de publicación
 * auditado (tabla CLASIFICACION) y aquí sólo se comprueba que lo recibido cumple lo que
 * el mapa da por supuesto. Si algo no cuadra el build se detiene: es preferible no
 * generar un mapa a generarlo con datos que no podemos explicar.
 *
 * Uso:  npm run datos
 */
import fs from 'node:fs';
import path from 'node:path';
import { paquete, abortar, descargar, copiar, escribirJson, titulo, peso, CACHE, PUBLICO } from './lib/comun.mjs';

const { DATOS_TAG } = paquete();
if (!DATOS_TAG) abortar('Falta DATOS_TAG en package.json.');

const ORIGEN = `https://raw.githubusercontent.com/Rodasluis/Distancia-al-centro-de-atencion/${DATOS_TAG}`;
const DEST_CACHE = path.join(CACHE, 'datos');
const DEST_PUB = path.join(PUBLICO, 'data');

/** Marco generoso alrededor del Perú: detecta coordenadas absurdas, no recorta nada. */
const MARCO_PERU = { lonMin: -82, lonMax: -68, latMin: -19, latMax: 0.5 };

/* ------------------------------- descarga ------------------------------- */

titulo(`Directorio de servicios · ${DATOS_TAG.slice(0, 12)}`);
console.log(`  origen: ${ORIGEN}`);

const crudoCentros = await descargar(`${ORIGEN}/app/data/centros.json`, path.join(DEST_CACHE, 'centros.json'));
const crudoIconos = await descargar(`${ORIGEN}/app/data/iconos.json`, path.join(DEST_CACHE, 'iconos.json'));

let centrosJson, iconosJson;
try {
  centrosJson = JSON.parse(crudoCentros.toString('utf8'));
  iconosJson = JSON.parse(crudoIconos.toString('utf8'));
} catch (err) {
  abortar('El origen no devolvió JSON válido. ¿DATOS_TAG apunta a una versión que existe?', err.message);
}

const { meta, catalogo, centros } = centrosJson;
if (!meta || !catalogo || !Array.isArray(centros)) {
  abortar('centros.json no tiene la forma esperada (meta, catalogo, centros).');
}

/* PNG de los íconos: material de referencia para redibujarlos como SVG en la Fase 3.
   Nunca deben acabar dentro de un PDF, que es vectorial por completo. */
const archivosIcono = [...new Set(
  Object.values(iconosJson.tipos).map((t) => t.archivo).filter(Boolean),
)].sort();

console.log(`\n  íconos PNG de referencia (${archivosIcono.length})`);
for (const archivo of archivosIcono) {
  await descargar(`${ORIGEN}/app/assets/iconos/${archivo}`, path.join(DEST_CACHE, 'iconos', archivo));
}

/* ----------------------------- verificación ----------------------------- */

const errores = [];
const avisos = [];

// 1. El recuento declarado y el real tienen que coincidir.
if (centros.length !== meta.total) {
  errores.push(`meta.total declara ${meta.total} centros pero el archivo trae ${centros.length}.`);
}

// 2. Los Hogares de Refugio Temporal no se publican nunca: su dirección está reservada
//    por protección de las víctimas. Si apareciera uno, el origen cambió de criterio.
const REFUGIO = /refugio\s*temporal|\bHRT\b/i;
const refugios = centros.filter((c) => REFUGIO.test(c.tipo || '') || REFUGIO.test(c.servicio || ''));
if (refugios.length) {
  errores.push(
    `Aparecen ${refugios.length} registros de Hogar de Refugio Temporal, que no deben publicarse. `
    + `Ejemplo: ${refugios[0].nombre} (${refugios[0].tipo}).`,
  );
}
const tiposIcono = Object.keys(iconosJson.tipos);
if (tiposIcono.some((t) => REFUGIO.test(t))) {
  errores.push('iconos.json define un ícono para Hogar de Refugio Temporal.');
}

// 3. Ubigeo de seis dígitos y coherente con sus prefijos de departamento y provincia.
const malUbigeo = [];
const malPrefijo = [];
for (const c of centros) {
  if (!/^\d{6}$/.test(String(c.ubigeo ?? ''))) { malUbigeo.push(c); continue; }
  if (c.ccdd !== c.ubigeo.slice(0, 2) || c.ccpp !== c.ubigeo.slice(0, 4)) malPrefijo.push(c);
}
if (malUbigeo.length) {
  errores.push(
    `${malUbigeo.length} centros sin ubigeo de 6 dígitos. `
    + `Ejemplo: ${malUbigeo[0].nombre} → «${malUbigeo[0].ubigeo}».`,
  );
}
if (malPrefijo.length) {
  errores.push(
    `${malPrefijo.length} centros cuyo ubigeo no concuerda con ccdd/ccpp. `
    + `Ejemplo: ${malPrefijo[0].nombre} → ${malPrefijo[0].ubigeo} vs ${malPrefijo[0].ccdd}/${malPrefijo[0].ccpp}.`,
  );
}

// 4. Coordenadas presentes, numéricas y dentro del marco del país.
const sinCoord = [];
const fueraMarco = [];
for (const c of centros) {
  const { lat, lon } = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { sinCoord.push(c); continue; }
  if (lon < MARCO_PERU.lonMin || lon > MARCO_PERU.lonMax || lat < MARCO_PERU.latMin || lat > MARCO_PERU.latMax) {
    fueraMarco.push(c);
  }
}
if (sinCoord.length) {
  errores.push(`${sinCoord.length} centros sin coordenadas. Ejemplo: ${sinCoord[0].nombre}.`);
}
if (fueraMarco.length) {
  errores.push(
    `${fueraMarco.length} centros con coordenadas fuera del Perú. `
    + `Ejemplo: ${fueraMarco[0].nombre} → ${fueraMarco[0].lat}, ${fueraMarco[0].lon}.`,
  );
}

// 5. Todo tipo presente en los datos necesita su entrada en iconos.json: sin ella
//    no hay forma de dibujarlo ni de ponerlo en la leyenda.
const conteoTipo = new Map();
for (const c of centros) conteoTipo.set(c.tipo, (conteoTipo.get(c.tipo) || 0) + 1);
const sinIcono = [...conteoTipo.keys()].filter((t) => !iconosJson.tipos[t]);
if (sinIcono.length) {
  errores.push(`Tipos sin entrada en iconos.json: ${sinIcono.join(', ')}.`);
}
const iconoSinUso = tiposIcono.filter((t) => !conteoTipo.has(t));
if (iconoSinUso.length) {
  avisos.push(`iconos.json define ${iconoSinUso.length} tipos sin ningún centro: ${iconoSinUso.join(', ')}.`);
}

// 6. Tipos sin PNG: el buscador los representa por sigla. Al redibujar los íconos
//    habrá que darles un símbolo propio.
const tiposSinPng = [...conteoTipo.keys()].filter((t) => iconosJson.tipos[t] && !iconosJson.tipos[t].archivo);
if (tiposSinPng.length) {
  avisos.push(
    `${tiposSinPng.length} tipos con centros no tienen PNG y se muestran por sigla en el buscador `
    + `(${tiposSinPng.map((t) => iconosJson.tipos[t].sigla).join(', ')}). Necesitarán símbolo propio en la Fase 3.`,
  );
}

// 7. El catálogo debe cubrir lo que aparece en los centros.
const depsCatalogo = new Set(catalogo.departamentos.map((d) => d.id));
const provCatalogo = new Set(catalogo.provincias.map((p) => p.id));
const huerfanos = centros.filter((c) => !depsCatalogo.has(c.ccdd) || !provCatalogo.has(c.ccpp));
if (huerfanos.length) {
  errores.push(`${huerfanos.length} centros cuyo departamento o provincia no está en el catálogo.`);
}

/* -------------------------------- informe ------------------------------- */

titulo('Informe de datos');
console.log(`  fuente              ${meta.fuente}`);
console.log(`  generado            ${meta.generado}`);
console.log(`  versión (DATOS_TAG) ${DATOS_TAG}`);
console.log(`  centros publicados  ${centros.length}`);
console.log(`  del directorio      ${meta.totalDirectorio} (${meta.excluidos} excluidos por el criterio del buscador)`);
console.log(`  departamentos       ${new Set(centros.map((c) => c.ccdd)).size} de ${catalogo.departamentos.length}`);
console.log(`  provincias con red  ${new Set(centros.map((c) => c.ccpp)).size} de ${catalogo.provincias.length}`);
console.log(`  distritos con red   ${new Set(centros.map((c) => c.ubigeo)).size}`);

console.log(`\n  Centros por tipo (${conteoTipo.size} tipos)`);
const porTipo = [...conteoTipo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
for (const [tipo, n] of porTipo) {
  const marca = iconosJson.tipos[tipo]?.archivo ? ' ' : '·';
  console.log(`   ${marca} ${String(n).padStart(4)}  ${tipo}`);
}
console.log(`     ${String(centros.length).padStart(4)}  TOTAL`);
console.log('   (· = sin PNG en el buscador, representado por sigla)');

const calidad = new Map();
for (const c of centros) calidad.set(c.calidad, (calidad.get(c.calidad) || 0) + 1);
console.log('\n  Calidad de las coordenadas');
for (const [k, n] of [...calidad.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(n).padStart(4)}  ${k}`);
}
const aproximados = centros.length - (calidad.get('verificada') || 0);
console.log(`   ${aproximados} centros llevan aviso de coordenada aproximada (Fase 7).`);

console.log('\n  Hogares de Refugio Temporal: 0 (excluidos en origen, comprobado)');

if (avisos.length) {
  console.log('\n  Avisos');
  for (const a of avisos) console.log(`   ! ${a}`);
}

if (errores.length) {
  abortar(
    `El directorio descargado no supera la verificación (${errores.length} ${errores.length === 1 ? 'problema' : 'problemas'}).`,
    errores.map((e, i) => `${i + 1}. ${e}`).join('\n'),
  );
}

/* ------------------------------- publicación ---------------------------- */

titulo('Publicación en public/data');
let total = 0;
total += copiar(path.join(DEST_CACHE, 'centros.json'), path.join(DEST_PUB, 'centros.json'));
total += copiar(path.join(DEST_CACHE, 'iconos.json'), path.join(DEST_PUB, 'iconos.json'));
console.log(`  ✓ centros.json  ${peso(fs.statSync(path.join(DEST_PUB, 'centros.json')).size)}`);
console.log(`  ✓ iconos.json   ${peso(fs.statSync(path.join(DEST_PUB, 'iconos.json')).size)}`);

let pesoIconos = 0;
for (const archivo of archivosIcono) {
  pesoIconos += copiar(path.join(DEST_CACHE, 'iconos', archivo), path.join(DEST_PUB, 'iconos-png', archivo));
}
total += pesoIconos;
console.log(`  ✓ iconos-png/   ${archivosIcono.length} PNG, ${peso(pesoIconos)} (referencia para redibujar; fuera del PDF)`);

/* La versión de los datos va en el pie de cada PDF, así que se publica como dato. */
const version = {
  datosTag: DATOS_TAG,
  datosTagCorto: DATOS_TAG.length === 40 ? DATOS_TAG.slice(0, 7) : DATOS_TAG,
  repositorio: 'Rodasluis/Distancia-al-centro-de-atencion',
  fuente: meta.fuente,
  generado: meta.generado,
  descargado: new Date().toISOString().slice(0, 10),
  totalCentros: centros.length,
  totalDirectorio: meta.totalDirectorio,
  excluidos: meta.excluidos,
  tipos: porTipo.map(([tipo, n]) => ({ tipo, n })),
};
total += escribirJson(path.join(DEST_PUB, 'version.json'), version);
console.log(`  ✓ version.json  ${peso(fs.statSync(path.join(DEST_PUB, 'version.json')).size)}`);

console.log(`\n✓ Directorio verificado y publicado (${peso(total)}).\n`);
