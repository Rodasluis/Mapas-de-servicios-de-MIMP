/**
 * Extrae las métricas de las tipografías para poder medir texto sin navegador.
 *
 * Hace falta saber cuánto ocupa un texto ANTES de componerlo: para que la caja del
 * título tenga el ancho justo, para decidir si una línea del pie cabe junto a la
 * escala y, sobre todo, para que el motor de rótulos de la Fase 4 detecte colisiones
 * con cajas reales y no con estimaciones. Una estimación por anchura media se equivoca
 * fácilmente en un 15 %, que a cuerpo pequeño es la diferencia entre dos rótulos
 * separados y dos rótulos pisándose.
 *
 * Se leen directamente las tablas del TTF —la misma fuente que se incrusta en el PDF—,
 * así que lo que se mide aquí es exactamente lo que compondrá el visor.
 *
 * Uso:  npm run metricas
 */
import fs from 'node:fs';
import path from 'node:path';
import { PUBLICO, abortar, titulo, peso, escribirJson } from './lib/comun.mjs';
import { fuentes } from '../src/estilo/tokens.js';

const ORIGEN = path.join(PUBLICO, 'fonts');
const DESTINO = path.join(PUBLICO, 'data', 'metricas.json');

/**
 * Repertorio que se mide: ASCII imprimible, el Latin-1 que usa el español y unos
 * pocos signos de imprenta. Medir los 3 000 glifos de cada fuente multiplicaría por
 * quince el archivo para caracteres que ningún mapa del MIMP va a componer.
 */
function repertorio() {
  const cps = [];
  for (let c = 0x20; c <= 0x7e; c++) cps.push(c);
  for (let c = 0xa0; c <= 0xff; c++) cps.push(c);
  for (const c of ['–', '—', '‘', '’', '“', '”', '…', '·', '€', '№', '™', '′', '″']) {
    cps.push(c.codePointAt(0));
  }
  return cps;
}

/* ------------------------------ lectura TTF ----------------------------- */

function leerTablas(buf) {
  const etiqueta = buf.readUInt32BE(0);
  if (etiqueta !== 0x00010000 && etiqueta !== 0x74727565) {
    throw new Error(`cabecera desconocida 0x${etiqueta.toString(16)}`);
  }
  const n = buf.readUInt16BE(4);
  const tablas = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    tablas[buf.toString('ascii', o, o + 4)] = {
      offset: buf.readUInt32BE(o + 8),
      length: buf.readUInt32BE(o + 12),
    };
  }
  return tablas;
}

/** cmap formato 4: el que usan estas fuentes para el plano básico. */
function leerCmap(buf, offset) {
  const n = buf.readUInt16BE(offset + 2);
  let mejor = null;
  for (let i = 0; i < n; i++) {
    const o = offset + 4 + i * 8;
    const plataforma = buf.readUInt16BE(o);
    const codificacion = buf.readUInt16BE(o + 2);
    const sub = offset + buf.readUInt32BE(o + 4);
    const formato = buf.readUInt16BE(sub);
    const prioridad = plataforma === 3 && codificacion === 1 ? 3
      : plataforma === 3 && codificacion === 10 ? 2
        : plataforma === 0 ? 1 : 0;
    if (formato === 4 && prioridad > (mejor?.prioridad ?? -1)) mejor = { sub, prioridad };
  }
  if (!mejor) throw new Error('sin subtabla cmap de formato 4');

  const sub = mejor.sub;
  const segX2 = buf.readUInt16BE(sub + 6);
  const seg = segX2 / 2;
  const fin = sub + 14;
  const inicio = fin + segX2 + 2;
  const delta = inicio + segX2;
  const rango = delta + segX2;

  return (cp) => {
    if (cp > 0xffff) return 0;
    for (let i = 0; i < seg; i++) {
      if (buf.readUInt16BE(fin + i * 2) >= cp) {
        const ini = buf.readUInt16BE(inicio + i * 2);
        if (ini > cp) return 0;
        const idRango = buf.readUInt16BE(rango + i * 2);
        const idDelta = buf.readInt16BE(delta + i * 2);
        if (idRango === 0) return (cp + idDelta) & 0xffff;
        const pos = rango + i * 2 + idRango + (cp - ini) * 2;
        if (pos + 1 >= buf.length) return 0;
        const g = buf.readUInt16BE(pos);
        return g === 0 ? 0 : (g + idDelta) & 0xffff;
      }
    }
    return 0;
  };
}

function medirFuente(archivo) {
  const buf = fs.readFileSync(archivo);
  const tablas = leerTablas(buf);
  for (const t of ['head', 'hhea', 'hmtx', 'cmap']) {
    if (!tablas[t]) throw new Error(`falta la tabla ${t}`);
  }

  const unidades = buf.readUInt16BE(tablas.head.offset + 18);
  const nMetricas = buf.readUInt16BE(tablas.hhea.offset + 34);
  const ascenso = buf.readInt16BE(tablas.hhea.offset + 4) / unidades;
  const descenso = buf.readInt16BE(tablas.hhea.offset + 6) / unidades;
  const interlinea = buf.readInt16BE(tablas.hhea.offset + 8) / unidades;

  const avance = (glifo) => {
    const i = Math.min(glifo, nMetricas - 1);
    return buf.readUInt16BE(tablas.hmtx.offset + i * 4) / unidades;
  };

  const glifoDe = leerCmap(buf, tablas.cmap.offset);
  const anchos = {};
  let sinGlifo = 0;
  for (const cp of repertorio()) {
    const g = glifoDe(cp);
    if (!g) { sinGlifo++; continue; }
    anchos[cp] = Number(avance(g).toFixed(4));
  }

  return {
    unidadesPorEm: unidades,
    ascenso: Number(ascenso.toFixed(4)),
    descenso: Number(descenso.toFixed(4)),
    interlinea: Number(interlinea.toFixed(4)),
    // Anchura de reserva para lo que no esté en el repertorio.
    porDefecto: Number(avance(glifoDe(0x6e) || 0).toFixed(4)),
    anchos,
    sinGlifo,
  };
}

/* ------------------------------ construcción ---------------------------- */

titulo('Métricas tipográficas');

if (!fs.existsSync(ORIGEN)) abortar('Faltan las tipografías.', 'Ejecuta antes:  npm run fuentes');

const salida = { generado: new Date().toISOString().slice(0, 10), fuentes: {} };
for (const [clave, archivo] of Object.entries(fuentes)) {
  const ruta = path.join(ORIGEN, archivo);
  if (!fs.existsSync(ruta)) abortar(`Falta ${archivo} en public/fonts.`);
  let m;
  try {
    m = medirFuente(ruta);
  } catch (err) {
    abortar(`No se pudieron leer las métricas de ${archivo}.`, err.message);
  }
  salida.fuentes[clave] = m;
  console.log(`  ✓ ${clave.padEnd(24)} ${Object.keys(m.anchos).length} glifos`
    + ` · em ${m.unidadesPorEm} · asc ${m.ascenso.toFixed(3)} desc ${m.descenso.toFixed(3)}`
    + (m.sinGlifo ? `  (${m.sinGlifo} sin glifo)` : ''));
}

/* Comprobación: una palabra conocida tiene que dar una anchura razonable. */
const prueba = 'Poblaciones Vulnerables';
for (const clave of Object.keys(salida.fuentes)) {
  const f = salida.fuentes[clave];
  const ancho = [...prueba].reduce((s, c) => s + (f.anchos[c.codePointAt(0)] ?? f.porDefecto), 0);
  if (!(ancho > 5 && ancho < 20)) {
    abortar(`Las métricas de ${clave} dan una anchura absurda para «${prueba}»: ${ancho} em.`);
  }
}
console.log(`  «${prueba}» mide entre ${Math.min(...Object.values(salida.fuentes)
  .map((f) => [...prueba].reduce((s, c) => s + (f.anchos[c.codePointAt(0)] ?? f.porDefecto), 0))).toFixed(2)}`
  + ` y ${Math.max(...Object.values(salida.fuentes)
    .map((f) => [...prueba].reduce((s, c) => s + (f.anchos[c.codePointAt(0)] ?? f.porDefecto), 0))).toFixed(2)} em`);

const tam = escribirJson(DESTINO, salida);
console.log(`\n✓ metricas.json ${peso(tam)} en public/data.\n`);
