/**
 * Ríos y vías (Fase 23): instantánea anclada de dos servicios oficiales.
 *
 *  - RÍOS: red hidrográfica de la Autoridad Nacional del Agua (ANA), capa
 *    «RiosQuebradas» de su geoservidor (elaborada el 30 de enero de 2018): 945 ríos y
 *    279 quebradas con su nombre oficial, codificados por Pfafstetter.
 *  - VÍAS: Red Vial Nacional y Red Vial Departamental del Ministerio de Transportes y
 *    Comunicaciones (MTC), del WFS de su geoportal, cada una con su fecha de corte.
 *    Los tramos «Proyectado» se dejan fuera: no existen sobre el terreno, y dibujarlos
 *    como carretera diría que se puede llegar por donde no se puede.
 *
 * Ninguno de los dos se publica como archivo con versión: son servicios vivos que
 * devuelven lo que haya ese día. Por eso no se anclan por la URL sino por una
 * INSTANTÁNEA que se versiona en origenes/redes/ con su SHA-256 en package.json
 * (REDES_SHA256), igual que el directorio y los indicadores se anclan por el hash del
 * archivo. El build (build-capas.mjs) lee siempre la instantánea, nunca la red.
 *
 * Los originales pesan 330 MB y 11,8 millones de vértices: el MTC traza sus vías con
 * un vértice cada metro o dos. La instantánea se simplifica a SIMPLIFICACION_M metros
 * —casi tres veces más fino que el nivel de detalle más alto del mapa (40 m)— y se
 * guarda como TopoJSON cuantizado a unos 2 m y comprimido: 2 MB en vez de 330, sin
 * perder nada que se pueda imprimir.
 *
 * Uso:  npm run redes                → descarga, escribe la instantánea y dice su hash
 *       npm run redes -- --anclar    → además la ancla en package.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { topology } from 'topojson-server';
import {
  abortar, titulo, peso, asegurarCarpeta, paquete, RAIZ,
} from './lib/comun.mjs';

const ANCLAR = process.argv.includes('--anclar');
const CARPETA = path.join(RAIZ, 'origenes', 'redes');

/** Tolerancia de la simplificación de la instantánea, en metros sobre el terreno. */
const SIMPLIFICACION_M = 15;

/** Rejilla de la cuantización: 2e6 pasos sobre los 18° del país son unos 2 m. */
const CUANTIZACION = 2e6;

const RIOS_URL = 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/Rios/MapServer/37/query'
  + '?where=1%3D1&outFields=NOMBRE_CA,TIPO_CA,CODIGO_CA,LONG_KM,NOMBRE_UH&returnGeometry=true&outSR=4326&f=geojson';
const WFS = 'https://swmapas.mtc.gob.pe:8443/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature'
  + '&outputFormat=application/json&srsName=EPSG:4326';
const VIAS = [
  {
    red: 'nacional',
    url: `${WFS}&typeNames=geoportal:gli_ogpp_red_vial_nacional&propertyName=geom,codruta,superfic_l,feccorte`,
  },
  {
    red: 'departamental',
    url: `${WFS}&typeNames=geoportal:gli_ogpp_red_vial_departamental&propertyName=geom,codruta,superfic_l,feccorte`,
  },
];

/** Intentos por servicio: el geoservidor de la ANA responde HTTP 500 de vez en cuando
    a la misma consulta que un momento después sirve entera. */
const INTENTOS = 4;

async function pedirJson(url, nombre) {
  process.stdout.write(`  ↓ ${nombre} … `);
  let ultimo = '';
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const texto = await res.text();
        console.log(`${peso(Buffer.byteLength(texto))}${intento > 1 ? ` (intento ${intento})` : ''}`);
        return JSON.parse(texto);
      }
      ultimo = `HTTP ${res.status}`;
    } catch (err) {
      ultimo = err.message;
    }
    await new Promise((r) => { setTimeout(r, 5000 * intento); });
  }
  console.log('ERROR');
  return abortar(`El servicio de ${nombre} no respondió tras ${INTENTOS} intentos (${ultimo}).`, url);
}

/* ------------------------------ simplificación ---------------------------- */

const M_POR_GRADO = 111_320;

/** Douglas-Peucker en metros, sobre una proyección local equirrectangular. */
function simplificar(linea, toleranciaM) {
  if (linea.length <= 2) return linea;
  const lat0 = (linea[0][1] * Math.PI) / 180;
  const kx = Math.cos(lat0) * M_POR_GRADO;
  const xy = linea.map(([x, y]) => [x * kx, y * M_POR_GRADO]);
  const conservar = new Uint8Array(linea.length);
  conservar[0] = 1;
  conservar[linea.length - 1] = 1;
  const pila = [[0, linea.length - 1]];
  const t2 = toleranciaM * toleranciaM;
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let max = -1;
    let indice = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d2 = ex * ex + ey * ey;
      if (d2 > max) { max = d2; indice = i; }
    }
    if (max > t2) {
      conservar[indice] = 1;
      pila.push([a, indice], [indice, b]);
    }
  }
  return linea.filter((_, i) => conservar[i]);
}

/** Líneas de una geometría lineal, simplificadas y redondeadas; sin las degeneradas. */
function lineasDe(geometria) {
  if (!geometria) return [];
  const partes = geometria.type === 'LineString' ? [geometria.coordinates]
    : geometria.type === 'MultiLineString' ? geometria.coordinates : [];
  return partes
    .map((l) => simplificar(l, SIMPLIFICACION_M))
    .filter((l) => l.length >= 2);
}

const geometriaDe = (lineas) => (lineas.length === 1
  ? { type: 'LineString', coordinates: lineas[0] }
  : { type: 'MultiLineString', coordinates: lineas });

const vertices = (fc) => fc.features.reduce((s, f) => {
  const g = f.geometry;
  if (!g) return s;
  return s + (g.type === 'LineString' ? g.coordinates.length : g.coordinates.reduce((t, l) => t + l.length, 0));
}, 0);

/* --------------------------------- ríos --------------------------------- */

titulo('Ríos: red hidrográfica de la ANA');
const rios = await pedirJson(RIOS_URL, 'RiosQuebradas (ANA)');
if (rios.exceededTransferLimit) abortar('El servicio de la ANA cortó la respuesta (exceededTransferLimit).');
if (rios.features.length < 1000) abortar(`La ANA devolvió sólo ${rios.features.length} cursos de agua.`);
const verticesRios = vertices(rios);

/* --------------------------------- vías --------------------------------- */

titulo('Vías: Red Vial Nacional y Departamental del MTC');
const vias = [];
for (const v of VIAS) {
  const fc = await pedirJson(v.url, `Red vial ${v.red} (MTC)`);
  const cortes = [...new Set(fc.features.map((f) => f.properties.feccorte).filter(Boolean))];
  if (cortes.length !== 1) abortar(`La red vial ${v.red} trae ${cortes.length} fechas de corte: ${cortes.join(', ')}.`);
  const [dia, mes, anio] = cortes[0].split('/');
  vias.push({ ...v, fc, corte: `${anio}-${mes}-${dia}`, vertices: vertices(fc) });
}

/* ------------------------------ instantánea ------------------------------ */

titulo('Instantánea');
const features = [];
for (const f of rios.features) {
  const lineas = lineasDe(f.geometry);
  if (!lineas.length) continue;
  const p = f.properties;
  features.push({
    type: 'Feature',
    properties: {
      capa: 'rio',
      nombre: String(p.NOMBRE_CA || '').trim(),
      tipo: p.TIPO_CA === 'Quebrada' ? 'quebrada' : 'rio',
      codigo: String(p.CODIGO_CA || ''),
      cuenca: String(p.NOMBRE_UH || '').trim(),
      km: Math.round(Number(p.LONG_KM || 0) * 10) / 10,
    },
    geometry: geometriaDe(lineas),
  });
}
const proyectados = {};
for (const v of vias) {
  for (const f of v.fc.features) {
    const superficie = String(f.properties.superfic_l || '').trim();
    if (superficie === 'Proyectado') { proyectados[v.red] = (proyectados[v.red] || 0) + 1; continue; }
    const lineas = lineasDe(f.geometry);
    if (!lineas.length) continue;
    features.push({
      type: 'Feature',
      properties: { capa: 'via', red: v.red, ruta: String(f.properties.codruta || '').trim(), superficie },
      geometry: geometriaDe(lineas),
    });
  }
}

/* El día de la descarga en el Perú, no en UTC: de noche, UTC ya va por el siguiente. */
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const metadata = {
  descargado: hoy,
  simplificacionM: SIMPLIFICACION_M,
  fuentes: [
    {
      capa: 'rio', entidad: 'ANA', nombre: 'Red hidrográfica (RiosQuebradas)', anio: 2018,
      url: RIOS_URL, elementos: rios.features.length,
    },
    ...vias.map((v) => ({
      capa: 'via', entidad: 'MTC', nombre: `Red Vial ${v.red === 'nacional' ? 'Nacional' : 'Departamental'}`,
      red: v.red, corte: v.corte, url: v.url, elementos: v.fc.features.length,
      proyectadosExcluidos: proyectados[v.red] || 0,
    })),
  ],
};

/* TopoJSON con la procedencia en «metadata», que el formato admite como miembro
   adicional y que build-capas.mjs lee para el pie y el informe. */
const topo = topology({ redes: { type: 'FeatureCollection', features } }, CUANTIZACION);
topo.metadata = metadata;
const comprimido = gzipSync(Buffer.from(JSON.stringify(topo)), { level: 9 });
const hash = createHash('sha256').update(comprimido).digest('hex');
asegurarCarpeta(CARPETA);
const archivo = `redes_${hoy}_${hash.slice(0, 7)}.topojson.gz`;
fs.writeFileSync(path.join(CARPETA, archivo), comprimido);

const original = verticesRios + vias.reduce((s, v) => s + v.vertices, 0);
console.log(`  ${features.filter((f) => f.properties.capa === 'rio').length} ríos y quebradas,`
  + ` ${features.filter((f) => f.properties.capa === 'via').length} tramos de vía`
  + ` (${Object.entries(proyectados).map(([r, n]) => `${n} proyectados de la ${r}`).join(', ')} fuera)`);
const simplificados = features.reduce((s, f) => s + vertices({ features: [f] }), 0);
console.log(`  ${original.toLocaleString('es')} vértices → ${simplificados.toLocaleString('es')} a ±${SIMPLIFICACION_M} m`);
console.log(`  origenes/redes/${archivo}  ${peso(comprimido.length)}`);
console.log(`  REDES_FECHA   ${hoy}`);
console.log(`  REDES_SHA256  ${hash}`);

if (ANCLAR) {
  const ruta = path.join(RAIZ, 'package.json');
  const P = paquete();
  const anterior = P.REDES_SHA256;
  /* Se reescribe sólo el valor, sin reordenar el archivo: que el diff diga sólo eso. */
  let contenido = fs.readFileSync(ruta, 'utf8');
  for (const [clave, valor] of [['REDES_FECHA', hoy], ['REDES_SHA256', hash]]) {
    const re = new RegExp(`("${clave}": ")[^"]*(")`);
    if (!re.test(contenido)) abortar(`Falta ${clave} en package.json: añádelo antes de anclar.`);
    contenido = contenido.replace(re, `$1${valor}$2`);
  }
  fs.writeFileSync(ruta, contenido);
  /* La instantánea anterior deja de servir: se quita para no versionar dos. */
  for (const f of fs.readdirSync(CARPETA)) {
    if (f.startsWith('redes_') && f !== archivo) fs.rmSync(path.join(CARPETA, f));
  }
  console.log(`\n✓ Anclada en package.json${anterior ? ` (antes ${anterior.slice(0, 7)})` : ''}.`);
} else {
  console.log('\nPara usarla: npm run redes -- --anclar');
}
