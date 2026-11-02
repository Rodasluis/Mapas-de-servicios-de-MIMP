/**
 * Capas de la Fase 23: ríos y vías, contorno del VRAEM y lugares del buscador.
 *
 *  1. RÍOS Y VÍAS. Lee la instantánea anclada en origenes/redes/ (fetch-redes.mjs),
 *     comprueba su hash, deduce la importancia de cada río y publica los tres niveles
 *     de detalle del mapa (redes.bajo|medio|alto.topojson). Cada nivel lleva sólo lo que
 *     a sus escalas se dibuja (src/motor/redes.js): el nivel bajo, el de un Perú en A3,
 *     no necesita las quebradas.
 *  2. VRAEM. Comprueba la lista del decreto (src/motor/vraem.js) contra la cartografía
 *     —cada ubigeo existe y su nombre es el del decreto— y publica, por nivel, el
 *     contorno del ámbito entero y el del de intervención directa, uniendo sus
 *     distritos de ese mismo nivel: así el contorno coincide con sus límites.
 *  3. LUGARES. La lista de departamentos, provincias y distritos que consulta el
 *     buscador de la interfaz, sacada de la misma cartografía que se dibuja.
 *
 * Va después de la cartografía (build-geo.mjs), que es de donde lee los distritos.
 *
 * Uso:  node scripts/build-capas.mjs   (lo llama npm run preparar)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';
import polygonClipping from 'polygon-clipping';
import {
  paquete, abortar, titulo, peso, escribirJson, PUBLICO, RAIZ,
} from './lib/comun.mjs';
import { VERSION_CAPAS } from './lib/capas.mjs';
import { LONGITUD_RANGO_KM, visibleA } from '../src/motor/redes.js';
import { DISTRITOS_VRAEM, DEPARTAMENTOS_VRAEM, NORMA_VRAEM } from '../src/motor/vraem.js';

const P = paquete();
for (const clave of ['REDES_FECHA', 'REDES_SHA256']) {
  if (!P[clave]) abortar(`Falta ${clave} en package.json.`, 'Ancla una instantánea con:  npm run redes -- --anclar');
}
const GEO = path.join(PUBLICO, 'data', 'geo');
if (!fs.existsSync(path.join(GEO, 'indice.json'))) {
  abortar('Falta la cartografía en public/data/geo.', 'Ejecuta antes:  npm run geo');
}
const indice = JSON.parse(fs.readFileSync(path.join(GEO, 'indice.json'), 'utf8'));
const leerTopo = (relativo, objeto) => feature(JSON.parse(fs.readFileSync(path.join(GEO, relativo), 'utf8')), objeto);
const inicio = Date.now();

/* Las mismas tolerancias que la cartografía (build-geo.mjs), leídas de su índice para
   que un nivel de las redes sirva exactamente a las escalas del nivel del mismo nombre. */
const METROS_POR_GRADO = 111_320;
const pesoDe = (toleranciaM) => (toleranciaM / METROS_POR_GRADO) ** 2;
const CUANTIZACION = { bajo: 1e5, medio: 5e5, alto: 1e6 };

/* -------------------------------- redes ---------------------------------- */

titulo('Ríos y vías: instantánea anclada');
const archivoRedes = `redes_${P.REDES_FECHA}_${P.REDES_SHA256.slice(0, 7)}.topojson.gz`;
const rutaRedes = path.join(RAIZ, 'origenes', 'redes', archivoRedes);
if (!fs.existsSync(rutaRedes)) {
  abortar(`Falta la instantánea origenes/redes/${archivoRedes}.`, 'Vuelve a anclarla con:  npm run redes -- --anclar');
}
const comprimido = fs.readFileSync(rutaRedes);
const hash = createHash('sha256').update(comprimido).digest('hex');
if (hash !== P.REDES_SHA256) {
  abortar('La instantánea de ríos y vías no es la anclada.', `esperado  ${P.REDES_SHA256}\nencontrado ${hash}`);
}
const topoRedes = JSON.parse(gunzipSync(comprimido).toString('utf8'));
const metadata = topoRedes.metadata || {};
const redes = feature(topoRedes, 'redes').features;
console.log(`  · ${archivoRedes} (${peso(comprimido.length)}) ✓  descargada el ${metadata.descargado}`);

/**
 * Importancia de los ríos. La ANA parte cada río en tramos entre afluentes, y el mismo
 * nombre se repite en ríos distintos («Río Chico» hay decenas). Un río es, pues, el
 * conjunto de tramos del MISMO nombre que se tocan por sus extremos; su longitud, la
 * suma de la de sus tramos.
 */
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const extremos = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates)
  .flatMap((l) => [l[0], l[l.length - 1]]);
const claveDe = ([x, y]) => `${Math.round(x * 2000)},${Math.round(y * 2000)}`; // ~50 m
const rios = redes.filter((f) => f.properties.capa === 'rio');
const padre = rios.map((_, i) => i);
const raiz = (i) => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
{
  const porExtremo = new Map();
  rios.forEach((f, i) => {
    const nombre = normalizar(f.properties.nombre || '');
    if (!nombre) return;
    for (const p of extremos(f.geometry)) {
      const clave = `${nombre}|${claveDe(p)}`;
      if (porExtremo.has(clave)) padre[raiz(i)] = raiz(porExtremo.get(clave));
      else porExtremo.set(clave, i);
    }
  });
}
const kmPorRio = new Map();
rios.forEach((f, i) => kmPorRio.set(raiz(i), (kmPorRio.get(raiz(i)) || 0) + (f.properties.km || 0)));
const rangoDe = (f, i) => {
  if (f.properties.tipo === 'quebrada') return 4;
  const km = kmPorRio.get(raiz(i));
  return km >= LONGITUD_RANGO_KM[0] ? 1 : km >= LONGITUD_RANGO_KM[1] ? 2 : 3;
};
const conRango = rios.map((f, i) => ({
  type: 'Feature',
  properties: { capa: 'rio', nombre: f.properties.nombre, rango: rangoDe(f, i) },
  geometry: f.geometry,
}));
const PAVIMENTADAS = new Set(['Pavimentado', 'Asfaltado económico']);
const vias = redes.filter((f) => f.properties.capa === 'via').map((f) => ({
  type: 'Feature',
  properties: {
    capa: 'via', red: f.properties.red, ruta: f.properties.ruta,
    pavimentada: PAVIMENTADAS.has(f.properties.superficie),
  },
  geometry: f.geometry,
}));
const principales = [...new Set(conRango.filter((f) => f.properties.rango === 1).map((f) => f.properties.nombre))]
  .sort((a, b) => a.localeCompare(b, 'es'));
const porRango = [1, 2, 3, 4].map((r) => conRango.filter((f) => f.properties.rango === r).length);
console.log(`  · ríos por importancia: ${porRango.map((n, i) => `${n} de rango ${i + 1}`).join(', ')}`);
console.log(`  · principales (${principales.length}): ${principales.join(', ')}`);
console.log(`  · vías: ${vias.filter((f) => f.properties.red === 'nacional').length} tramos de la red nacional,`
  + ` ${vias.filter((f) => f.properties.red === 'departamental').length} de la departamental`);

/**
 * Une en un solo rasgo los tramos que se dibujan igual: un río entero, o una ruta con
 * el mismo tipo de firme. En el nivel bajo, el de un Perú en A3, los 7 600 tramos de la
 * red nacional eran 7 600 rasgos con sus propiedades repetidas para dibujar 160 rutas.
 */
function agrupar(rasgos, claveDe) {
  const grupos = new Map();
  for (const f of rasgos) {
    const clave = claveDe(f);
    if (!grupos.has(clave)) grupos.set(clave, { type: 'Feature', properties: f.properties, lineas: [] });
    const g = f.geometry;
    grupos.get(clave).lineas.push(...(g.type === 'LineString' ? [g.coordinates] : g.coordinates));
  }
  return [...grupos.values()].map(({ lineas, ...f }) => ({ ...f, geometry: { type: 'MultiLineString', coordinates: lineas } }));
}

/**
 * Teselas. Un departamento en A3 ya se dibuja con el nivel alto, y el nivel alto del
 * país entero pesa 6 MB: casi todo, de vías que caen fuera de la hoja. Los niveles
 * medio y alto se publican partidos en teselas de TESELA_GRADOS de lado, y el motor
 * pide sólo las que toca su marco. Un rasgo va en cada tesela que toca su caja, entero
 * —no se corta—, con un id para que el motor no lo dibuje dos veces.
 */
const TESELA_GRADOS = 3;
const ORIGEN_TESELAS = [-82, -19];

/** Caja de cada geometría de una topología cuantizada, a partir de sus arcos. */
function cajasDeGeometrias(topo, objeto) {
  const [kx, ky] = topo.transform.scale;
  const [x0, y0] = topo.transform.translate;
  const cajaArco = topo.arcs.map((arco) => {
    let x = 0; let y = 0;
    const caja = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [dx, dy] of arco) {
      x += dx; y += dy;
      caja[0] = Math.min(caja[0], x); caja[1] = Math.min(caja[1], y);
      caja[2] = Math.max(caja[2], x); caja[3] = Math.max(caja[3], y);
    }
    return [caja[0] * kx + x0, caja[1] * ky + y0, caja[2] * kx + x0, caja[3] * ky + y0];
  });
  return topo.objects[objeto].geometries.map((g) => {
    const caja = [Infinity, Infinity, -Infinity, -Infinity];
    const recorrer = (a) => (Array.isArray(a) ? a.forEach(recorrer) : (() => {
      const c = cajaArco[a < 0 ? ~a : a];
      caja[0] = Math.min(caja[0], c[0]); caja[1] = Math.min(caja[1], c[1]);
      caja[2] = Math.max(caja[2], c[2]); caja[3] = Math.max(caja[3], c[3]);
    })());
    recorrer(g.arcs || []);
    return caja;
  });
}

/** Sub-topología con sólo los arcos que usan las geometrías dadas, renumerados. */
function podar(topo, objeto, geometrias) {
  const usados = new Set();
  const marcar = (a) => (Array.isArray(a) ? a.forEach(marcar) : usados.add(a < 0 ? ~a : a));
  for (const g of geometrias) marcar(g.arcs || []);
  const orden = [...usados].sort((a, b) => a - b);
  const nuevo = new Map(orden.map((viejo, i) => [viejo, i]));
  const renumerar = (a) => (Array.isArray(a) ? a.map(renumerar) : (a < 0 ? ~nuevo.get(~a) : nuevo.get(a)));
  return {
    type: 'Topology',
    transform: topo.transform,
    objects: { [objeto]: { type: 'GeometryCollection', geometries: geometrias.map((g) => ({ ...g, arcs: renumerar(g.arcs) })) } },
    arcs: orden.map((i) => topo.arcs[i]),
  };
}

const seTocan = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

titulo('Ríos y vías: niveles de detalle');
const contarVertices = (topo) => topo.arcs.reduce((s, a) => s + a.length, 0);
const manifiestoRedes = {};
const raizDeRio = new Map(conRango.map((f, i) => [f, raiz(i)]));
for (const [nivel, cfg] of Object.entries(indice.niveles)) {
  /* Sólo lo que se dibuja a la escala más detallada que usa este nivel. */
  const visibles = (lista) => lista.filter((f) => visibleA(f.properties, cfg.denominadorMinimo));
  const teselado = nivel !== 'bajo';
  const rasgos = teselado ? [...visibles(conRango), ...visibles(vias)] : [
    ...agrupar(visibles(conRango), (f) => raizDeRio.get(f)),
    ...agrupar(visibles(vias), (f) => `${f.properties.red}|${f.properties.ruta}|${f.properties.pavimentada}`),
  ];
  const base = presimplify(topology({ redes: { type: 'FeatureCollection', features: rasgos } }));
  const topo = quantize(simplify(base, pesoDe(cfg.toleranciaM)), CUANTIZACION[nivel]);
  topo.objects.redes.geometries.forEach((g, i) => { g.id = i; });

  if (!teselado) {
    const archivo = `redes.${nivel}.topojson`;
    const bytes = escribirJson(path.join(GEO, archivo), topo);
    manifiestoRedes[nivel] = { archivo, bytes };
    console.log(`  ✓ ${archivo.padEnd(22)} ${String(rasgos.length).padStart(6)} rasgos`
      + `  ${contarVertices(topo).toLocaleString('es').padStart(9)} vértices  ${peso(bytes)}`);
    continue;
  }
  const cajas = cajasDeGeometrias(topo, 'redes');
  const teselas = [];
  let total = 0;
  for (let x = ORIGEN_TESELAS[0]; x < -68; x += TESELA_GRADOS) {
    for (let y = ORIGEN_TESELAS[1]; y < 1; y += TESELA_GRADOS) {
      const caja = [x, y, x + TESELA_GRADOS, y + TESELA_GRADOS];
      const dentro = topo.objects.redes.geometries.filter((_, i) => seTocan(cajas[i], caja));
      if (!dentro.length) continue;
      const archivo = `redes/${nivel}/${x}_${y}.topojson`;
      const bytes = escribirJson(path.join(GEO, archivo), podar(topo, 'redes', dentro));
      total += bytes;
      teselas.push({ archivo, caja, bytes });
    }
  }
  manifiestoRedes[nivel] = { teselas, bytes: total };
  const mayor = Math.max(...teselas.map((t) => t.bytes));
  console.log(`  ✓ redes/${nivel}/ (${teselas.length} teselas) ${String(rasgos.length).padStart(6)} rasgos`
    + `  ${contarVertices(topo).toLocaleString('es').padStart(9)} vértices  ${peso(total)} (la mayor, ${peso(mayor)})`);
}

/* -------------------------------- VRAEM ---------------------------------- */

titulo(`VRAEM: ${NORMA_VRAEM}`);

/* d3-geo quiere el anillo exterior en sentido horario (ver build-geo.mjs); los
   resultados de polygon-clipping salen al revés. */
const areaConSigno = (anillo) => {
  let a = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    a += anillo[j][0] * anillo[i][1] - anillo[i][0] * anillo[j][1];
  }
  return a / 2;
};
const rebobinar = (multi) => multi.map((poli) => poli.map((anillo, i) => (
  Math.sign(areaConSigno(anillo)) === (i === 0 ? -1 : 1) ? anillo : [...anillo].reverse())));
const comoMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/*
 * Por nivel, cuatro clases de rasgo, todas uniones de distritos de ese nivel:
 *  · vraem    el ámbito entero, su contorno;
 *  · directa  el de intervención directa, que el mapa del VRAEM marca dentro;
 *  · parte    lo que cada departamento tiene DENTRO del VRAEM: su límite interior y el
 *             sitio de su nombre en el mapa del VRAEM;
 *  · resto    lo que le queda FUERA, que ese mapa dibuja atenuado y con su nombre.
 * Salir todas de los mismos distritos es lo que hace que encajen sin rendijas: el
 * departamento de la cartografía se simplifica por su cuenta y su borde no coincide al
 * milímetro con el de sus distritos.
 */
const problemas = [];
const manifiestoVraem = {};
const union = (polis) => rebobinar(polygonClipping.union(...polis));
for (const nivel of Object.keys(indice.niveles)) {
  const deptos = new Map(leerTopo(`departamentos.${nivel}.topojson`, 'departamentos').features
    .map((f) => [f.properties.ubigeo, f.properties.nombre]));
  const distritos = DEPARTAMENTOS_VRAEM.flatMap((dd) => leerTopo(`distritos/${dd}.${nivel}.topojson`, 'distritos').features);
  const porUbigeo = new Map(distritos.map((f) => [f.properties.ubigeo, f]));
  const elegidos = { vraem: [], directa: [] };
  for (const d of DISTRITOS_VRAEM) {
    const f = porUbigeo.get(d.ubigeo);
    if (!f) { if (nivel === 'bajo') problemas.push(`${d.ubigeo} ${d.nombre}: no está en la cartografía`); continue; }
    if (nivel === 'bajo' && normalizar(f.properties.nombre) !== normalizar(d.nombre)) {
      problemas.push(`${d.ubigeo}: el decreto dice «${d.nombre}» y la cartografía «${f.properties.nombre}»`);
    }
    elegidos.vraem.push(comoMulti(f.geometry));
    if (d.ambito === 'directa') elegidos.directa.push(comoMulti(f.geometry));
  }
  if (problemas.length) {
    abortar('La lista del VRAEM no cuadra con la cartografía.', problemas.map((p, i) => `${i + 1}. ${p}`).join('\n'));
  }
  const enVraem = new Set(DISTRITOS_VRAEM.map((d) => d.ubigeo));
  const features = Object.entries(elegidos).map(([ambito, polis]) => ({
    type: 'Feature', properties: { ambito }, geometry: { type: 'MultiPolygon', coordinates: union(polis) },
  }));
  for (const dd of DEPARTAMENTOS_VRAEM) {
    const propios = distritos.filter((f) => f.properties.ubigeo.startsWith(dd));
    for (const [ambito, cuales] of [
      ['parte', propios.filter((f) => enVraem.has(f.properties.ubigeo))],
      ['resto', propios.filter((f) => !enVraem.has(f.properties.ubigeo))],
    ]) {
      features.push({
        type: 'Feature',
        properties: { ambito, ubigeo: dd, nombre: deptos.get(dd) },
        geometry: { type: 'MultiPolygon', coordinates: union(cuales.map((f) => comoMulti(f.geometry))) },
      });
    }
  }
  /* Sin cuantizar de nuevo: los vértices son los mismos que los de los distritos de este
     nivel, y así el contorno cae exactamente sobre sus límites. */
  const archivo = `vraem.${nivel}.topojson`;
  const bytes = escribirJson(path.join(GEO, archivo), topology({ vraem: { type: 'FeatureCollection', features } }));
  manifiestoVraem[nivel] = { archivo, bytes };
  const piezas = (a) => features.filter((f) => f.properties.ambito === a)
    .reduce((s, f) => s + f.geometry.coordinates.length, 0);
  console.log(`  ✓ ${archivo.padEnd(20)} contorno en ${piezas('vraem')} polígono(s), directa en ${piezas('directa')},`
    + ` ${DEPARTAMENTOS_VRAEM.length} partes y ${DEPARTAMENTOS_VRAEM.length} restos de departamento  ${peso(bytes)}`);
}
const nDirecta = DISTRITOS_VRAEM.filter((d) => d.ambito === 'directa').length;
console.log(`  · ${DISTRITOS_VRAEM.length} distritos: ${nDirecta} de intervención directa y`
  + ` ${DISTRITOS_VRAEM.length - nDirecta} de influencia, todos en la cartografía con el nombre del decreto`);

/* ------------------------------- lugares --------------------------------- */

titulo('Lugares del buscador');
const departamentos = leerTopo('departamentos.bajo.topojson', 'departamentos').features;
const lugares = [
  ...departamentos,
  ...leerTopo('provincias.bajo.topojson', 'provincias').features,
  ...departamentos.flatMap((d) => leerTopo(`distritos/${d.properties.ubigeo}.bajo.topojson`, 'distritos').features),
].map((f) => [f.properties.ubigeo, f.properties.nombre])
  .sort((a, b) => a[0].localeCompare(b[0]));
const bytesLugares = escribirJson(path.join(PUBLICO, 'data', 'lugares.json'), lugares);
const cuenta = (n) => lugares.filter(([u]) => u.length === n).length;
console.log(`  ✓ lugares.json  ${cuenta(2)} departamentos, ${cuenta(4)} provincias, ${cuenta(6)} distritos  ${peso(bytesLugares)}`);

/* ------------------------------ manifiesto ------------------------------- */

escribirJson(path.join(PUBLICO, 'data', 'capas.json'), {
  version: VERSION_CAPAS,
  redes: {
    sha256: P.REDES_SHA256,
    fecha: P.REDES_FECHA,
    simplificacionM: metadata.simplificacionM,
    fuentes: (metadata.fuentes || []).map(({ url, ...resto }) => resto),
    niveles: manifiestoRedes,
    riosPrincipales: principales,
  },
  vraem: { norma: NORMA_VRAEM, directa: nDirecta, influencia: DISTRITOS_VRAEM.length - nDirecta, niveles: manifiestoVraem },
  lugares: lugares.length,
});
console.log(`\n✓ Capas construidas en ${((Date.now() - inicio) / 1000).toFixed(1)} s.\n`);
