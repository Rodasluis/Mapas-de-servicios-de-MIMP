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
import { RAIZ, PUBLICO, abortar, titulo } from './lib/comun.mjs';

const forzar = process.argv.includes('--forzar');

const PASOS = [
  {
    nombre: 'directorio de servicios',
    script: 'fetch-datos.mjs',
    listo: () => existe('data/centros.json') && existe('data/version.json') && existe('data/iconos.json'),
  },
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
];

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
