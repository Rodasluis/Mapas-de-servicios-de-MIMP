/**
 * Descarga la cartografía de referencia a .cache/geo.
 *
 * Dos orígenes:
 *  · Rodasluis/Peru-maps — límites del INEI (departamento, provincia, distrito) y el
 *    catálogo de ubigeos con los nombres oficiales acentuados. Se toman los archivos
 *    SIN simplificar: este proyecto imprime hasta A0 y necesita el detalle original
 *    para generar después sus propios niveles (scripts/build-geo.mjs).
 *  · Natural Earth 1:10m — países vecinos, océano y lagos, para el contexto del marco.
 *
 * La lógica de descarga y caché sigue la de tools/fetch-geo.mjs del buscador; sólo
 * cambian los archivos pedidos y el anclaje por versión.
 *
 * Uso:  npm run geo:fetch
 */
import fs from 'node:fs';
import path from 'node:path';
import { paquete, abortar, descargar, titulo, peso, CACHE } from './lib/comun.mjs';

const { GEO_TAG, NATURAL_EARTH_TAG } = paquete();
if (!GEO_TAG) abortar('Falta GEO_TAG en package.json.');
if (!NATURAL_EARTH_TAG) abortar('Falta NATURAL_EARTH_TAG en package.json.');

const PERU_MAPS = `https://raw.githubusercontent.com/Rodasluis/Peru-maps/${GEO_TAG}/salida`;
const NE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_TAG}/geojson`;
const DEST = path.join(CACHE, 'geo');

/* El catálogo de ubigeos cambia de nombre con cada actualización anual del INEI.
   Se prueban los nombres conocidos, del más reciente al más antiguo. */
const CANDIDATOS_UBIGEO = ['ubigeos_2026.csv', 'ubigeos_2025.csv'];

titulo(`Cartografía INEI · Peru-maps ${GEO_TAG.slice(0, 12)}`);

for (const nombre of ['departamento.geojson', 'provincia.geojson', 'distrito.geojson']) {
  await descargar(`${PERU_MAPS}/${nombre}`, path.join(DEST, nombre));
}

/* Ubigeos: se resuelve cuál existe y se deja siempre con el mismo nombre local,
   para que build-geo.mjs no tenga que saber de qué año es. */
const destinoUbigeo = path.join(DEST, 'ubigeos.csv');
if (fs.existsSync(destinoUbigeo) && fs.statSync(destinoUbigeo).size > 0) {
  console.log(`  · ubigeos.csv ya en caché (${peso(fs.statSync(destinoUbigeo).size)})`);
} else {
  let resuelto = null;
  for (const nombre of CANDIDATOS_UBIGEO) {
    const res = await fetch(`${PERU_MAPS}/${nombre}`, { method: 'HEAD' });
    if (res.ok) { resuelto = nombre; break; }
  }
  if (!resuelto) {
    abortar(
      'No se encontró el catálogo de ubigeos en Peru-maps.',
      `Se probó con: ${CANDIDATOS_UBIGEO.join(', ')}.\n`
      + `Revisa qué archivo publica ${PERU_MAPS} y añádelo a CANDIDATOS_UBIGEO.`,
    );
  }
  await descargar(`${PERU_MAPS}/${resuelto}`, destinoUbigeo, { etiqueta: `ubigeos.csv (${resuelto})` });
}

titulo(`Contexto Natural Earth 1:10m · ${NATURAL_EARTH_TAG}`);

for (const nombre of ['ne_10m_admin_0_countries.geojson', 'ne_10m_ocean.geojson', 'ne_10m_lakes.geojson']) {
  await descargar(`${NE}/${nombre}`, path.join(DEST, nombre));
}

const total = fs.readdirSync(DEST).reduce((s, f) => s + fs.statSync(path.join(DEST, f)).size, 0);
console.log(`\n✓ Cartografía en .cache/geo (${peso(total)}).\n`);
