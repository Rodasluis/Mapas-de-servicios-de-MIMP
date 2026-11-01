/**
 * Censo de nombres e íconos, territorio por territorio, en muchas configuraciones.
 *
 * Es la revisión «uno por uno» de la Fase 21 hecha a máquina: compone cientos de mapas
 * —el Perú en sus tres divisiones y las siete hojas en vertical y horizontal, los 25
 * departamentos por provincias y por distritos en A4, A3 y A1, las 196 provincias en A4
 * y A2— y anota, para cada departamento, provincia y distrito de cada mapa, si su
 * nombre se puso, si quedó entero dentro de su territorio, si va girado y si sus íconos
 * cayeron dentro. Sirve para medir el motor de rótulos antes y después de un cambio,
 * que es lo que un puñado de muestras no puede decir.
 *
 * Tarda: unos 25 minutos los tres lotes, en un equipo justo. Nada sale de la máquina.
 *
 * Uso:  npm run censo                                  · los tres lotes, etiqueta «censo»
 *       npm run censo -- nacional                      · sólo ese lote (nacional,
 *                                                        departamentos, provincias)
 *       npm run censo -- --etiqueta=antes              · con otra etiqueta
 *       npm run censo -- --comparar antes despues      · compara dos censos ya hechos
 *
 * Escribe muestras/censo/<etiqueta>.jsonl (una línea por territorio y configuración) y
 * <etiqueta>-configs.jsonl (una por configuración). No se versionan: son salida.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, PUBLICO, titulo, asegurarCarpeta } from './lib/comun.mjs';
import { crearCargador } from '../src/motor/cargador.js';
import { crearHoja } from '../src/motor/hoja.js';
import { componer } from '../src/motor/render.js';

const CARPETA = path.join(RAIZ, 'muestras', 'censo');
const argumentos = process.argv.slice(2);
const opcion = (nombre) => argumentos.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
const etiqueta = opcion('etiqueta') || 'censo';
const LOTES = ['nacional', 'departamentos', 'provincias'];
const lotes = argumentos.filter((a) => LOTES.includes(a));
const TAMANOS = ['A4', 'A3', 'A2', 'A1', 'A0', '2A0', '4A0'];
/* El recuadro que el mapa del país lleva por omisión en la web. */
const LIMA_Y_CALLAO = { modo: 'manual', seleccion: ['1501', '07'] };

const archivoDe = (e, sufijo = '') => path.join(CARPETA, `${e}${sufijo}.jsonl`);
const leer = (e) => fs.readFileSync(archivoDe(e), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

if (argumentos.includes('--comparar')) {
  const i = argumentos.indexOf('--comparar');
  comparar(argumentos[i + 1], argumentos[i + 2]);
} else {
  await censar(lotes.length ? lotes : LOTES);
}

async function censar(cuales) {
  const cargador = crearCargador(async (r) => JSON.parse(fs.readFileSync(path.join(PUBLICO, r), 'utf8')));
  const deps = (await cargador.departamentos('bajo')).features.map((f) => f.properties.ubigeo).sort();
  const provs = (await cargador.provincias('bajo')).features.map((f) => f.properties.ubigeo).sort();

  const configs = [];
  if (cuales.includes('nacional')) {
    for (const division of ['departamento', 'provincia', 'distrito']) {
      for (const tamano of TAMANOS) {
        for (const orientacion of ['vertical', 'horizontal']) {
          configs.push({ ambito: null, division, tamano, orientacion, zoom: division === 'departamento' ? undefined : LIMA_Y_CALLAO });
        }
      }
    }
  }
  if (cuales.includes('departamentos')) {
    for (const d of deps) for (const division of ['provincia', 'distrito']) for (const tamano of ['A4', 'A3', 'A1']) {
      configs.push({ ambito: d, division, tamano, orientacion: 'vertical' });
    }
  }
  if (cuales.includes('provincias')) {
    for (const p of provs) for (const tamano of ['A4', 'A2']) configs.push({ ambito: p, division: 'distrito', tamano, orientacion: 'vertical' });
  }

  asegurarCarpeta(CARPETA);
  titulo(`Censo «${etiqueta}»: ${configs.length} configuraciones (${cuales.join(', ')})`);
  const salida = fs.createWriteStream(archivoDe(etiqueta), { flags: 'a' });
  const resumen = fs.createWriteStream(archivoDe(etiqueta, '-configs'), { flags: 'a' });
  let n = 0;
  for (const c of configs) {
    const clave = `${c.ambito || 'peru'}|${c.division}|${c.tamano}-${c.orientacion[0]}`;
    const t0 = Date.now();
    let meta;
    try {
      ({ meta } = await componer({
        hoja: crearHoja({ tamano: c.tamano, orientacion: c.orientacion }), cargador, ambito: c.ambito,
        textos: { fecha: '2026-01-01' }, opciones: { division: c.division, ...(c.zoom ? { zoom: c.zoom } : {}) },
      }));
    } catch (e) {
      resumen.write(`${JSON.stringify({ clave, error: e.message })}\n`);
      console.log(`  ${clave}: ERROR ${e.message}`);
      continue;
    }
    const ms = Date.now() - t0;
    const grupoDe = new Map((meta.servicios.grupos || []).map((g) => [g.unidad, g]));
    const e = meta.etiquetas;
    const fila = (nivel, id, nombre, r, o) => {
      const g = grupoDe.get(id);
      salida.write(`${JSON.stringify({
        clave, ambito: c.ambito || 'peru', division: c.division, hoja: `${c.tamano}-${c.orientacion[0]}`,
        nivel, id, nombre,
        estado: r ? (r.vertical ? 'vertical' : r.giro ? 'diagonal' : 'puesto') : `sin sitio: ${o?.motivo || '—'}`,
        lineas: r ? r.lineas : null, fuera: r ? r.fueraPct : null, aGrupo: r ? r.aGrupoMm : null,
        sobre: r ? r.sobreSimbolosPct : null,
        reducido: r ? Boolean(r.reducido) : null, enlace: r ? Boolean(r.enlace) : null,
        iconos: g ? g.iconos : null, iconosDentro: g ? g.dentro : null, forma: g ? g.forma : null,
        conNombre: g ? g.conNombre : null,
        anchoMm: o ? o.anchoMm : null, altoMm: o ? o.altoMm : null, radioMm: o ? o.radioMm : null,
      })}\n`);
    };
    for (const r of e.colocados) if (r.nivel !== 'exterior') fila(r.nivel, r.id, r.texto, r, null);
    for (const o of e.sinSitio) if (o.nivel !== 'exterior') fila(o.nivel, o.id, o.texto, null, o);
    resumen.write(`${JSON.stringify({ clave, ms, escala: meta.escala, porNivel: e.porNivel, grupos: (meta.servicios.grupos || []).length })}\n`);
    n++;
    console.log(`  ${String(n).padStart(3)}/${configs.length} ${clave.padEnd(28)} ${String(ms).padStart(6)} ms · ${Object.entries(e.porNivel).map(([k, v]) => `${k} ${v.colocados}/${v.total}`).join(' · ')}`);
  }
  salida.end(); resumen.end();
  console.log(`\n  ${path.relative(RAIZ, archivoDe(etiqueta))}: una línea por territorio y configuración.`);
  console.log('  Compara dos censos con «npm run censo -- --comparar antes despues».\n');
}

/**
 * Compara dos censos: por ámbito, nivel y hoja, nombres puestos, enteros dentro, girados,
 * con letra menor e íconos enteros dentro; y cuenta los territorios que empeoraron.
 */
function comparar(a, b) {
  const A = leer(a); const B = leer(b);
  titulo(`Censo «${a}» frente a «${b}»`);
  const grupoDe = (r) => {
    const ambito = r.ambito === 'peru' ? 'Perú' : r.ambito.length === 2 ? 'departamentos' : 'provincias';
    return `${ambito} por ${r.division}s · ${r.nivel}s · ${r.hoja}`;
  };
  const acumular = (filas) => {
    const g = new Map();
    for (const r of filas) {
      const k = grupoDe(r);
      const s = g.get(k) || { total: 0, puestos: 0, dentro: 0, girados: 0, reducidos: 0, conIconos: 0, iconosDentro: 0 };
      s.total++;
      if (!r.estado.startsWith('sin sitio')) {
        s.puestos++;
        if (r.fuera === 0) s.dentro++;
        if (r.estado !== 'puesto') s.girados++;
        if (r.reducido) s.reducidos++;
      }
      if (r.iconos !== null && r.iconosDentro !== null) { s.conIconos++; if (r.iconosDentro === r.iconos) s.iconosDentro++; }
      g.set(k, s);
    }
    return g;
  };
  const GA = acumular(A); const GB = acumular(B);
  const pct = (x, t) => (t ? `${Math.round((100 * x) / t)} %` : '—');
  const orden = TAMANOS.flatMap((t) => [`${t}-v`, `${t}-h`]);
  const claves = [...new Set([...GA.keys(), ...GB.keys()])].sort((p, q) => {
    const [ap, an, ah] = p.split(' · '); const [bp, bn, bh] = q.split(' · ');
    return ap.localeCompare(bp) || an.localeCompare(bn) || orden.indexOf(ah) - orden.indexOf(bh);
  });
  for (const k of claves) {
    const x = GA.get(k) || {}; const y = GB.get(k) || {};
    console.log(`  ${k.padEnd(46)} puestos ${pct(x.puestos, x.total).padStart(5)} → ${pct(y.puestos, y.total).padEnd(5)}`
      + ` dentro ${pct(x.dentro, x.total).padStart(5)} → ${pct(y.dentro, y.total).padEnd(5)}`
      + ` girados ${String(y.girados || 0).padStart(4)} · letra menor ${String(y.reducidos || 0).padStart(4)}`
      + ` · íconos dentro ${pct(x.iconosDentro, x.conIconos).padStart(5)} → ${pct(y.iconosDentro, y.conIconos)}`);
  }
  const tot = (filas) => filas.reduce((s, r) => {
    s.total++;
    if (!r.estado.startsWith('sin sitio')) { s.puestos++; if (r.fuera === 0) s.dentro++; if (r.reducido) s.reducidos++; }
    if (r.iconos !== null) { s.conIconos++; if (r.iconosDentro === r.iconos) s.iconosDentro++; }
    return s;
  }, { total: 0, puestos: 0, dentro: 0, reducidos: 0, conIconos: 0, iconosDentro: 0 });
  const ta = tot(A); const tb = tot(B);
  console.log(`\n  ${ta.total} filas: nombres puestos ${ta.puestos} → ${tb.puestos} (${tb.reducidos} con letra menor)`
    + ` · enteros dentro ${ta.dentro} → ${tb.dentro}`
    + ` · grupos con todos los íconos dentro ${ta.iconosDentro}/${ta.conIconos} → ${tb.iconosDentro}/${tb.conIconos}`);

  const claveDe = (r) => `${r.clave}|${r.nivel}|${r.id}`;
  const enB = new Map(B.map((r) => [claveDe(r), r]));
  const peor = [];
  for (const r of A) {
    const s = enB.get(claveDe(r));
    if (!s) continue;
    const estaba = !r.estado.startsWith('sin sitio'); const esta = !s.estado.startsWith('sin sitio');
    if (estaba && !esta) peor.push(`${r.clave} ${r.nivel} ${r.nombre}: estaba → ${s.estado}`);
    else if (estaba && esta && r.fuera === 0 && s.fuera > 0) peor.push(`${r.clave} ${r.nivel} ${r.nombre}: dentro → asoma ${s.fuera} %`);
  }
  console.log(`  territorios que empeoran: ${peor.length}${peor.length ? ' (los primeros):' : ''}`);
  for (const p of peor.slice(0, 30)) console.log(`    ${p}`);
  console.log('');
}
