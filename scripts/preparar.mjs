/**
 * Deja listo todo lo que el sitio necesita antes de compilarlo: directorio de
 * servicios, tipografías y cartografía.
 *
 * Se ejecuta solo como `prebuild`, de modo que `npm run build` funciona en un clon
 * recién hecho sin que haya que acordarse del orden de los pasos. Cada paso se salta
 * si su resultado ya está en public/, y las descargas grandes quedan en .cache/, así
 * que repetirlo cuesta segundos. Con --forzar se rehace todo.
 *
 * Uso:  npm run preparar  ·  npm run preparar -- --forzar
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RAIZ, PUBLICO, abortar, titulo, paquete } from './lib/comun.mjs';
import { VERSION_CAPAS } from './lib/capas.mjs';

const forzar = process.argv.includes('--forzar');

const PASOS = [
  {
    nombre: 'tipografías',
    script: 'fetch-fuentes.mjs',
    listo: () => fs.existsSync(path.join(PUBLICO, 'fonts'))
      && fs.readdirSync(path.join(PUBLICO, 'fonts')).filter((f) => f.endsWith('.ttf')).length >= 8,
  },
  {
    nombre: 'logotipos',
    script: 'build-logos.mjs',
    listo: () => existe('data/logos.json'),
  },
  {
    nombre: 'métricas tipográficas',
    script: 'build-metricas.mjs',
    listo: () => existe('data/metricas.json'),
  },
  {
    nombre: 'cartografía (descarga)',
    script: 'fetch-geo.mjs',
    listo: () => existe('data/geo/indice.json'),
  },
  {
    nombre: 'cartografía (construcción)',
    script: 'build-geo.mjs',
    nodeArgs: ['--max-old-space-size=8192'],
    listo: () => existe('data/geo/indice.json'),
  },
  /* El directorio va DESPUÉS de la cartografía: comprueba cada coordenada contra el
     polígono de su distrito y sitúa en él los servicios de dirección reservada.
     Se da por listo sólo si la versión publicada corresponde al directorio
     anclado ahora, para que una copia antigua de public/data no pase por buena. */
  {
    nombre: 'directorio de servicios',
    script: 'fetch-datos.mjs',
    listo: () => existe('data/centros.json') && existe('data/version.json')
      && leer('data/version.json').datosTag === paquete().DIRECTORIO_SHA256
      && leer('data/version.json').generado === paquete().DIRECTORIO_FECHA
      && fs.existsSync(path.join(RAIZ, 'auditoria', `auditoria_directorio_${paquete().DIRECTORIO_FECHA}.xlsx`)),
  },
  /* Población y pobreza del INEI, para el color del mapa (Fase 22). Después de la
     cartografía, porque informa de qué distritos se quedan sin dato. Listo sólo si lo
     publicado corresponde a los archivos anclados ahora. */
  {
    nombre: 'indicadores del INEI (población y pobreza)',
    script: 'fetch-indicadores.mjs',
    listo: () => existe('data/indicadores.json')
      && leer('data/indicadores.json').poblacion?.sha256 === paquete().POBLACION_SHA256
      && leer('data/indicadores.json').pobreza?.sha256 === paquete().POBREZA_SHA256
      && String(leer('data/indicadores.json').poblacion?.anio) === String(paquete().POBLACION_ANIO),
  },
  /* Ríos y vías, contorno del VRAEM y lugares del buscador (Fase 23). Después de la
     cartografía, de cuyos distritos salen el VRAEM y los lugares. Listo sólo si lo
     publicado es de la instantánea anclada y de esta versión del paso. */
  {
    nombre: 'ríos, vías, VRAEM y lugares',
    script: 'build-capas.mjs',
    nodeArgs: ['--max-old-space-size=6144'],
    listo: () => existe('data/capas.json') && existe('data/lugares.json')
      && leer('data/capas.json').version === VERSION_CAPAS
      && leer('data/capas.json').redes?.sha256 === paquete().REDES_SHA256,
  },
];

const leer = (relativo) => JSON.parse(fs.readFileSync(path.join(PUBLICO, relativo), 'utf8'));

const existe = (relativo) => {
  const f = path.join(PUBLICO, relativo);
  return fs.existsSync(f) && fs.statSync(f).size > 0;
};

const pendientes = PASOS.filter((p) => forzar || !p.listo());

if (!pendientes.length) {
  console.log('✓ Datos, tipografías y cartografía ya están preparados (usa --forzar para rehacerlos).');
  process.exit(0);
}

titulo(`Preparando ${pendientes.length} de ${PASOS.length} pasos`);
for (const paso of pendientes) console.log(`  · ${paso.nombre}`);

for (const paso of pendientes) {
  const r = spawnSync(
    process.execPath,
    [...(paso.nodeArgs || []), path.join(RAIZ, 'scripts', paso.script)],
    { stdio: 'inherit', cwd: RAIZ },
  );
  if (r.status !== 0) {
    abortar(`Falló la preparación en «${paso.nombre}» (${paso.script}).`);
  }
}

console.log('✓ Preparación completa.\n');
