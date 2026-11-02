/**
 * Indicadores del INEI para el color del mapa (Fase 22): población y pobreza.
 *
 *  - POBLACIÓN: «Perú: Población total proyectada al 30 de junio de cada año, según
 *    departamento, provincia y distrito, 2018-2026» (INEI, publicado el 31 de diciembre
 *    de 2025). Se usa el año POBLACION_ANIO. Sirve para la tasa de servicios por cada
 *    100 mil habitantes, en los tres niveles.
 *  - POBREZA: «Mapa de pobreza monetaria provincial y distrital 2018», anexo estadístico
 *    (INEI, publicado el 20 de febrero de 2020). El INEI no publica una cifra única por
 *    distrito sino el INTERVALO de confianza al 95 % de la incidencia de pobreza
 *    monetaria total; se toma su punto medio, que es la estimación puntual (el intervalo
 *    es simétrico). Algunos distritos se estimaron agrupados y comparten valor. Trae
 *    también los departamentos, salvo Amazonas, cuya fila del Anexo 2 viene vacía en el
 *    archivo del INEI: por departamentos, Amazonas sale «Sin dato».
 *
 * Igual que el directorio (fetch-datos.mjs): cada archivo se ancla por su SHA-256 en
 * package.json y su copia verificada se versiona en origenes/indicadores/, así que el
 * build no depende de que gob.pe responda. Si la copia falta o no coincide, se descarga
 * de la URL anclada y se comprueba el hash; si no cuadra, el build se detiene.
 *
 * Escribe public/data/indicadores.json con los valores por ubigeo en el formato de la
 * cartografía: «01» departamento, «0101» provincia, «010101» distrito.
 *
 * Uso:  node scripts/fetch-indicadores.mjs   (lo llama npm run preparar)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { feature } from 'topojson-client';
import {
  paquete, abortar, descargar, escribirJson, titulo, peso, asegurarCarpeta, CACHE, PUBLICO, RAIZ,
} from './lib/comun.mjs';
import { leerFilas } from './lib/xlsx.mjs';

const P = paquete();
for (const clave of ['POBLACION_URL', 'POBLACION_SHA256', 'POBLACION_FECHA', 'POBLACION_ANIO', 'POBREZA_URL', 'POBREZA_SHA256', 'POBREZA_FECHA']) {
  if (!P[clave]) abortar(`Falta ${clave} en package.json.`);
}

const CARPETA_ORIGENES = path.join(RAIZ, 'origenes', 'indicadores');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * El archivo anclado: la copia versionada si su hash es el de package.json; si no, la
 * descarga, que se comprueba y pasa a ser la copia versionada.
 */
async function anclado({ nombre, prefijo, url, hash }) {
  asegurarCarpeta(CARPETA_ORIGENES);
  const archivo = `${prefijo}_${hash.slice(0, 7)}.xlsx`;
  const local = path.join(CARPETA_ORIGENES, archivo);
  if (fs.existsSync(local)) {
    const buf = fs.readFileSync(local);
    if (sha256(buf) === hash) {
      console.log(`  · ${nombre}: copia versionada ${archivo} (${peso(buf.length)}) ✓`);
      return buf;
    }
    console.log(`  ! ${archivo} no tiene el hash anclado: se vuelve a descargar.`);
  }
  const buf = await descargar(url, path.join(CACHE, 'indicadores', `${hash.slice(0, 16)}.xlsx`), { etiqueta: nombre });
  const recibido = sha256(buf);
  if (recibido !== hash) {
    abortar(
      `El archivo de ${nombre} no es la versión anclada.`,
      `esperado  ${hash}\nrecibido  ${recibido}\n\nSi el INEI publicó otra versión, revísala y, si está en orden,`
      + ' copia el hash recibido en package.json.',
    );
  }
  for (const f of fs.readdirSync(CARPETA_ORIGENES)) {
    if (f.startsWith(`${prefijo}_`) && f !== archivo) fs.rmSync(path.join(CARPETA_ORIGENES, f));
  }
  fs.writeFileSync(local, buf);
  console.log(`  · ${nombre}: versionado en origenes/indicadores/${archivo}`);
  return buf;
}

/** Ubigeo de seis dígitos del INEI → el de la cartografía según su nivel. */
const aUbigeo = (u) => (u.endsWith('0000') ? u.slice(0, 2) : u.endsWith('00') ? u.slice(0, 4) : u);
const nivelDe = (u) => (u.length === 2 ? 'departamento' : u.length === 4 ? 'provincia' : 'distrito');

titulo('Indicadores del INEI: población y pobreza');

/* ------------------------------- población ------------------------------ */

const ANIO = Number(P.POBLACION_ANIO);
const filasPob = leerFilas(await anclado({
  nombre: 'población proyectada', prefijo: 'poblacion_inei_2018-2026', url: P.POBLACION_URL, hash: P.POBLACION_SHA256,
}), 'POB. PROYECTADA 2018-2026');

/* La columna del año se busca por su cabecera, no se supone: si el INEI añade un año,
   la del pedido sigue estando donde diga su cabecera. */
const filaAnios = filasPob.find((f) => f.some((c) => String(c).trim() === String(ANIO)));
if (!filaAnios) abortar(`El cuadro de población no tiene la columna ${ANIO}.`);
const colAnio = filaAnios.findIndex((c) => String(c).trim() === String(ANIO));

const poblacion = {};
let nacional = null;
for (const f of filasPob) {
  const u = String(f[0] || '').trim();
  if (!/^\d{6}$/.test(u)) continue;
  const n = Number(f[colAnio]);
  if (!Number.isFinite(n) || n < 0) abortar(`Población no válida para ${u}: «${f[colAnio]}».`);
  if (u === '000000') { nacional = n; continue; }
  poblacion[aUbigeo(u)] = n;
}

/* Que cuadre: la suma de los distritos de cada provincia es la provincia, y la de los
   departamentos es el país. Si no, el cuadro cambió de forma y no sabemos leerlo. */
const sumar = (filtro) => Object.entries(poblacion).filter(([u]) => filtro(u)).reduce((s, [, n]) => s + n, 0);
const descuadres = Object.keys(poblacion).filter((u) => u.length === 4)
  .filter((p) => Math.abs(sumar((u) => u.length === 6 && u.startsWith(p)) - poblacion[p]) > 1);
if (descuadres.length) abortar(`La población de ${descuadres.length} provincia(s) no es la suma de sus distritos: ${descuadres.slice(0, 5).join(', ')}.`);
if (nacional !== null && Math.abs(sumar((u) => u.length === 2) - nacional) > 1) abortar('La suma de los departamentos no es la población del país.');

/* --------------------------------- pobreza ------------------------------ */

const filasPobreza = leerFilas(await anclado({
  nombre: 'mapa de pobreza 2018', prefijo: 'pobreza_inei_2018', url: P.POBREZA_URL, hash: P.POBREZA_SHA256,
}), 'Anexo2');

/* Columnas del Anexo 2: A ubigeo, B sufijo (distritos agrupados), C nombre, D población
   2020, E y F límites inferior y superior del intervalo al 95 %. Se comprueba la
   cabecera antes de leer: si el INEI la cambia, no se leen números al azar. */
const cabecera = filasPobreza.find((f) => String(f[0] || '').trim() === 'Ubigeo');
if (!cabecera || !/Intervalo de confianza/i.test(String(cabecera[4] || ''))) {
  abortar('El Anexo 2 del mapa de pobreza no tiene la cabecera esperada (Ubigeo … Intervalo de confianza al 95 %).');
}
const pobreza = {};
let agrupados = 0;
for (const f of filasPobreza) {
  const u = String(f[0] || '').trim();
  if (!/^\d{6}$/.test(u) || String(f[4]).trim() === '' || String(f[5]).trim() === '') continue;
  const inferior = Number(f[4]);
  const superior = Number(f[5]);
  if (!Number.isFinite(inferior) || !Number.isFinite(superior) || inferior > superior || inferior < 0 || superior > 100) {
    abortar(`Intervalo de pobreza no válido para ${u}: ${f[4]}–${f[5]}.`);
  }
  if (/^\d{3}$/.test(String(f[1]).trim()) && String(f[1]).trim() !== '000') agrupados++;
  pobreza[aUbigeo(u)] = Math.round(((inferior + superior) / 2) * 10) / 10;
}

/* ------------------------- frente a la cartografía ---------------------- */

/* Qué distritos de la cartografía se quedan sin dato: los creados después de cada
   cuadro. No es un error —el mapa los deja en blanco y la leyenda lo dice—, pero tiene
   que saberse. */
const carpetaDistritos = path.join(PUBLICO, 'data', 'geo', 'distritos');
const distritos = fs.existsSync(carpetaDistritos)
  ? fs.readdirSync(carpetaDistritos).filter((a) => a.endsWith('.bajo.topojson'))
    .flatMap((a) => feature(JSON.parse(fs.readFileSync(path.join(carpetaDistritos, a), 'utf8')), 'distritos').features)
    .map((f) => ({ ubigeo: f.properties.ubigeo, nombre: f.properties.nombre }))
  : [];
const sinPoblacion = distritos.filter((d) => !(d.ubigeo in poblacion));
const sinPobreza = distritos.filter((d) => !(d.ubigeo in pobreza));

const cuenta = (o, nivel) => Object.keys(o).filter((u) => nivelDe(u) === nivel).length;
console.log(`  · población ${ANIO}: ${cuenta(poblacion, 'departamento')} departamentos, ${cuenta(poblacion, 'provincia')} provincias,`
  + ` ${cuenta(poblacion, 'distrito')} distritos · país ${nacional?.toLocaleString('es-PE')}`);
console.log(`  · pobreza 2018: ${cuenta(pobreza, 'departamento')} departamentos, ${cuenta(pobreza, 'provincia')} provincias, ${cuenta(pobreza, 'distrito')} distritos`
  + ` (${agrupados} estimados en grupo)`);
if (distritos.length) {
  console.log(`  · de los ${distritos.length} distritos de la cartografía, sin población: ${sinPoblacion.length}`
    + `${sinPoblacion.length ? ` (${sinPoblacion.map((d) => `${d.nombre} ${d.ubigeo}`).join(', ')})` : ''}`);
  console.log(`    sin pobreza: ${sinPobreza.length} (creados después de 2018)`);
}

/* -------------------------------- publicar ------------------------------ */

const salida = {
  poblacion: {
    fuente: 'INEI',
    titulo: 'Perú: Población total proyectada al 30 de junio de cada año, según departamento, provincia y distrito, 2018-2026',
    anio: ANIO,
    publicado: P.POBLACION_FECHA,
    url: P.POBLACION_URL,
    sha256: P.POBLACION_SHA256,
    valores: poblacion,
  },
  pobreza: {
    fuente: 'INEI',
    titulo: 'Mapa de pobreza monetaria provincial y distrital 2018',
    anio: 2018,
    publicado: P.POBREZA_FECHA,
    medida: 'Incidencia de la pobreza monetaria total (%): punto medio del intervalo de confianza al 95 %',
    url: P.POBREZA_URL,
    sha256: P.POBREZA_SHA256,
    valores: pobreza,
  },
};
const bytes = escribirJson(path.join(PUBLICO, 'data', 'indicadores.json'), salida);
console.log(`  ✓ public/data/indicadores.json (${peso(bytes)})`);
