/**
 * Convierte la cartografía descargada en TopoJSON listo para imprimir.
 *
 * Tres decisiones gobiernan este script:
 *
 * 1. TRES NIVELES DE DETALLE (bajo, medio, alto). Un mapa nacional en A4 no necesita
 *    el mismo número de vértices que uno en A0, y cargar el detalle de A0 para un A4
 *    sólo cuesta tiempo. El motor elige el nivel según la escala resultante (Fase 1).
 *
 * 2. SIMPLIFICACIÓN SOBRE TOPOLOGÍA COMPARTIDA. Los límites se simplifican una sola vez
 *    para todos los polígonos de un nivel a la vez, de modo que un borde compartido por
 *    dos distritos se simplifica de forma idéntica en ambos. Simplificar cada polígono
 *    por separado abre huecos y solapamientos entre vecinos, que en papel se ven como
 *    hilos blancos a lo largo de las fronteras.
 *
 * 3. PARTICIÓN POR DEPARTAMENTO CON PODA DE ARCOS. Provincias y distritos se reparten en
 *    un archivo por departamento. Al repartir se conservan sólo los arcos que ese
 *    departamento usa, renumerados; como los arcos salen de la topología común, el borde
 *    entre dos departamentos es el MISMO arco en los dos archivos y encaja al milímetro.
 *
 * Uso:  npm run geo:build
 */
import fs from 'node:fs';
import path from 'node:path';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';
import { geoArea } from 'd3-geo';
import polygonClipping from 'polygon-clipping';
import { abortar, titulo, peso, asegurarCarpeta, escribirJson, CACHE, PUBLICO } from './lib/comun.mjs';

const ORIGEN = path.join(CACHE, 'geo');
const DESTINO = path.join(PUBLICO, 'data', 'geo');

if (!fs.existsSync(path.join(ORIGEN, 'distrito.geojson'))) {
  abortar('Falta la cartografía en .cache/geo.', 'Ejecuta antes:  npm run geo:fetch');
}

/**
 * Niveles de detalle, definidos por la tolerancia sobre el terreno en metros.
 *
 * El criterio es de imprenta, no estético: en papel el ojo no separa dos trazos a
 * menos de unos 0,15 mm, así que a escala 1:N cualquier desviación menor que
 * 0,15 mm × N no se ve. Un nivel con tolerancia T sirve, pues, desde 1:(T / 0,15 mm)
 * hacia escalas menos detalladas.
 * Así la elección de nivel es auditable y no un número redondo elegido a ojo.
 *
 *  toleranciaM  desviación máxima admitida sobre el terreno, en metros.
 *  cuantizacion rejilla de coordenadas; 1e6 sobre el ancho del marco son ~2 cm
 *               sobre el terreno, invisible incluso ampliando un A0 al 400 %.
 */
const TRAZO_VISIBLE_MM = 0.15;
const NIVELES = {
  bajo: { toleranciaM: 1200, cuantizacion: 1e5 },
  medio: { toleranciaM: 300, cuantizacion: 5e5 },
  alto: { toleranciaM: 40, cuantizacion: 1e6 },
};

/**
 * Denominador de escala MÍNIMO al que el nivel sigue siendo indistinguible del
 * original. Por debajo de él (mapas más detallados) su tolerancia ya se vería.
 * Es el número que consulta el motor para elegir nivel: sirve si 1:N cumple
 * N >= denominadorMinimo.
 */
const denominadorMinimo = (toleranciaM) => Math.round(toleranciaM / (TRAZO_VISIBLE_MM / 1000));

/** Peso de simplificación (área de triángulo en grados²) para una tolerancia dada. */
const METROS_POR_GRADO = 111_320;
const pesoDe = (toleranciaM) => (toleranciaM / METROS_POR_GRADO) ** 2;

/**
 * Marco de contexto alrededor del Perú (lon/lat) para recortar Natural Earth.
 *
 * Tiene que cubrir lo que llegue a verse en CUALQUIER hoja, no sólo lo que rodea al
 * país. El caso exigente es el nacional apaisado: el Perú es más alto que ancho, así
 * que en A0 horizontal el encaje lo limita la altura y a los lados queda sitio para
 * unos 26° de longitud. Si el contexto acabara antes, aparecerían franjas blancas en
 * los bordes de la hoja. Con este marco sobra holgura para cualquier formato.
 */
const MARCO = { lonMin: -92, latMin: -24, lonMax: -58, latMax: 6 };

const leer = (nombre) => JSON.parse(fs.readFileSync(path.join(ORIGEN, nombre), 'utf8'));

/* ------------------------- catálogo de nombres -------------------------- */

/** Lector de CSV con comillas, suficiente para el catálogo del INEI. */
function leerCsv(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const partir = (linea) => {
    const campos = [];
    let actual = '';
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (comillas && linea[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas;
      } else if (c === ',' && !comillas) { campos.push(actual); actual = ''; } else actual += c;
    }
    campos.push(actual);
    return campos;
  };
  const cabecera = partir(lineas[0]);
  return lineas.slice(1).map((l) => {
    const campos = partir(l);
    return Object.fromEntries(cabecera.map((h, i) => [h, campos[i]]));
  });
}

const ubigeos = leerCsv(fs.readFileSync(path.join(ORIGEN, 'ubigeos.csv'), 'utf8'));
const nombreDe = new Map(ubigeos.map((u) => [u.ubigeo, u.nombre]));
if (nombreDe.size < 2000) {
  abortar('El catálogo de ubigeos parece incompleto.', `Sólo se leyeron ${nombreDe.size} filas.`);
}

/* --------------------------- utilidades TopoJSON ------------------------ */

/** Recorre la estructura anidada de referencias a arcos de una geometría. */
function mapearArcos(arcos, fn) {
  return Array.isArray(arcos[0]) ? arcos.map((a) => mapearArcos(a, fn)) : arcos.map(fn);
}

function recorrerArcos(arcos, fn) {
  if (Array.isArray(arcos[0])) arcos.forEach((a) => recorrerArcos(a, fn));
  else arcos.forEach(fn);
}

/**
 * Extrae un subconjunto de geometrías con sólo los arcos que usan, renumerados.
 * Los arcos conservados son los mismos objetos de la topología común, así que los
 * bordes compartidos con departamentos vecinos siguen coincidiendo exactamente.
 */
function podar(topo, nombreObjeto, geometrias) {
  const usados = new Set();
  for (const g of geometrias) {
    if (g.arcs) recorrerArcos(g.arcs, (i) => usados.add(i < 0 ? ~i : i));
  }
  const orden = [...usados].sort((a, b) => a - b);
  const nuevo = new Map(orden.map((viejo, i) => [viejo, i]));
  return {
    type: 'Topology',
    transform: topo.transform,
    objects: {
      [nombreObjeto]: {
        type: 'GeometryCollection',
        geometries: geometrias.map((g) => ({
          type: g.type,
          properties: g.properties,
          arcs: g.arcs ? mapearArcos(g.arcs, (i) => (i < 0 ? ~nuevo.get(~i) : nuevo.get(i))) : g.arcs,
        })),
      },
    },
    arcs: orden.map((i) => topo.arcs[i]),
    bbox: bboxDeArcos(topo.transform, orden.map((i) => topo.arcs[i])),
  };
}

/** Caja envolvente en lon/lat a partir de arcos cuantizados y delta-codificados. */
function bboxDeArcos(transform, arcos) {
  const [kx, ky] = transform.scale;
  const [x0, y0] = transform.translate;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const arco of arcos) {
    let x = 0;
    let y = 0;
    for (const punto of arco) {
      x += punto[0];
      y += punto[1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX * kx + x0, minY * ky + y0, maxX * kx + x0, maxY * ky + y0];
}

function contarVertices(topo) {
  return topo.arcs.reduce((s, a) => s + a.length, 0);
}

/* ---------------------------- sentido de giro --------------------------- */

/**
 * d3-geo interpreta los polígonos sobre la esfera, y ahí el sentido de giro decide
 * qué lado es el interior: exige el anillo exterior EN SENTIDO HORARIO, justo al
 * revés de lo que pide el RFC 7946 de GeoJSON. Un anillo al revés no se dibuja mal
 * a medias: d3 rellena todo el planeta MENOS la figura, y de paso geoBounds devuelve
 * el mundo entero, con lo que cualquier encuadre automático se va al traste.
 *
 * Los recortes de polygon-clipping salen con el criterio del RFC, así que hay que
 * darles la vuelta. Se aplica a todas las capas por igual: es idempotente y deja el
 * proyecto entero en la convención que espera el motor de dibujo.
 */
const areaConSigno = (anillo) => {
  let a = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    a += anillo[j][0] * anillo[i][1] - anillo[i][0] * anillo[j][1];
  }
  return a / 2;
};

/** Deja el anillo exterior en sentido horario y los agujeros en antihorario. */
function rebobinar(geometria) {
  const polis = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates;
  let corregidos = 0;
  for (const poli of polis) {
    poli.forEach((anillo, i) => {
      const quiero = i === 0 ? -1 : 1; // exterior horario (área negativa), agujeros al revés
      if (Math.sign(areaConSigno(anillo)) !== quiero) { anillo.reverse(); corregidos++; }
    });
  }
  return corregidos;
}

/** Rebobina una FeatureCollection entera y avisa de cuánto hubo que corregir. */
function rebobinarColeccion(fc, etiqueta) {
  let corregidos = 0;
  for (const f of fc.features) corregidos += rebobinar(f.geometry);
  if (corregidos) console.log(`  · ${corregidos} anillos de ${etiqueta} rebobinados al sentido de d3-geo`);
  return fc;
}

/**
 * Construye los tres niveles de detalle de una capa.
 * @param {object} fc        FeatureCollection de origen
 * @param {string} nombre    nombre del objeto dentro del TopoJSON
 * @param {Function} props   traduce las propiedades del INEI a las que publicamos
 */
function construirNiveles(fc, nombre, props) {
  rebobinarColeccion(fc, nombre);
  const base = presimplify(topology({ [nombre]: fc }));
  const verticesOriginales = contarVertices(base);
  const resultado = {};
  for (const [nivel, cfg] of Object.entries(NIVELES)) {
    const simplificado = simplify(base, pesoDe(cfg.toleranciaM));
    const topo = quantize(simplificado, cfg.cuantizacion);
    for (const g of topo.objects[nombre].geometries) g.properties = props(g.properties);
    resultado[nivel] = topo;
  }
  return { niveles: resultado, verticesOriginales };
}

/** Línea de informe común a todas las capas. */
function informarNivel(nivel, topo, verticesOriginales, sufijo = '') {
  const v = contarVertices(topo);
  const pct = ((v / verticesOriginales) * 100).toFixed(0);
  console.log(
    `  ${nivel.padEnd(5)} ±${String(NIVELES[nivel].toleranciaM).padStart(4)} m`
    + `  desde 1:${denominadorMinimo(NIVELES[nivel].toleranciaM).toLocaleString('es')}`.padEnd(22)
    + `${v.toLocaleString('es').padStart(9)} vértices (${pct.padStart(3)} %)  ${sufijo}`,
  );
}

/** Escribe un TopoJSON y devuelve su tamaño. */
function escribir(archivo, topo) {
  return escribirJson(archivo, topo);
}

/* ------------------------------ construcción ---------------------------- */

const inicio = Date.now();
asegurarCarpeta(DESTINO);
const manifiesto = {
  generado: new Date().toISOString().slice(0, 10),
  proyeccionOrigen: 'EPSG:4326 (lon/lat)',
  trazoVisibleMm: TRAZO_VISIBLE_MM,
  niveles: Object.fromEntries(Object.entries(NIVELES).map(([k, v]) => [k, {
    toleranciaM: v.toleranciaM,
    denominadorMinimo: denominadorMinimo(v.toleranciaM),
  }])),
  capas: {},
};

/* ····························· departamentos ···························· */

titulo('Departamentos');
{
  const fc = leer('departamento.geojson');
  const { niveles, verticesOriginales } = construirNiveles(fc, 'departamentos', (p) => ({
    ubigeo: p.ubigeo,
    nombre: nombreDe.get(p.ubigeo) || p.nombre,
  }));
  console.log(`  ${fc.features.length} polígonos, ${verticesOriginales.toLocaleString('es')} vértices originales`);
  manifiesto.capas.departamentos = { ambito: 'nacional', archivos: {} };
  for (const [nivel, topo] of Object.entries(niveles)) {
    const archivo = `departamentos.${nivel}.topojson`;
    const tam = escribir(path.join(DESTINO, archivo), topo);
    manifiesto.capas.departamentos.archivos[nivel] = { archivo, bytes: tam };
    informarNivel(nivel, topo, verticesOriginales, `${peso(tam).padStart(8)}  ${archivo}`);
  }
  manifiesto.capas.departamentos.bbox = niveles.alto.bbox;
}

/* ······························· provincias ······························ */

titulo('Provincias');
{
  const fc = leer('provincia.geojson');
  const { niveles, verticesOriginales } = construirNiveles(fc, 'provincias', (p) => ({
    ubigeo: p.ubigeo,
    nombre: nombreDe.get(p.ubigeo) || p.nombre,
  }));
  console.log(`  ${fc.features.length} polígonos, ${verticesOriginales.toLocaleString('es')} vértices originales`);

  manifiesto.capas.provincias = { ambito: 'nacional', archivos: {} };
  for (const [nivel, topo] of Object.entries(niveles)) {
    const archivo = `provincias.${nivel}.topojson`;
    const tam = escribir(path.join(DESTINO, archivo), topo);
    manifiesto.capas.provincias.archivos[nivel] = { archivo, bytes: tam };
    informarNivel(nivel, topo, verticesOriginales, `${peso(tam).padStart(8)}  ${archivo}`);
  }
  manifiesto.capas.provincias.bbox = niveles.alto.bbox;

  repartirPorDepartamento(niveles, 'provincias');
}

/* ································ distritos ······························ */

titulo('Distritos');
{
  const fc = leer('distrito.geojson');
  const { niveles, verticesOriginales } = construirNiveles(fc, 'distritos', (p) => ({
    ubigeo: p.ubigeo,
    nombre: nombreDe.get(p.ubigeo) || p.nombre,
  }));
  console.log(`  ${fc.features.length} polígonos, ${verticesOriginales.toLocaleString('es')} vértices originales`);
  for (const [nivel, topo] of Object.entries(niveles)) {
    informarNivel(nivel, topo, verticesOriginales, 'sólo se publica repartido');
  }
  repartirPorDepartamento(niveles, 'distritos');
}

/**
 * Reparte una capa en un archivo por departamento y por nivel, podando arcos.
 * No se publica un archivo nacional de distritos: pesaría de más y ningún ámbito
 * necesita los 1 893 distritos del país a la vez.
 */
function repartirPorDepartamento(niveles, nombre) {
  const entrada = manifiesto.capas[`${nombre}PorDepartamento`] = {
    ambito: 'departamento',
    patron: `${nombre}/{ccdd}.{nivel}.topojson`,
    departamentos: {},
  };
  const alto = niveles.alto;
  const departamentos = [...new Set(
    alto.objects[nombre].geometries.map((g) => g.properties.ubigeo.slice(0, 2)),
  )].sort();

  const resumen = {};
  for (const nivel of Object.keys(niveles)) {
    resumen[nivel] = { total: 0, mayor: 0, mayorDd: '', compartidos: 0, ajenos: 0 };
  }

  /* Cada arco de la topología común se apunta con los departamentos que lo usan:
     los que aparecen en dos son exactamente los bordes interdepartamentales, y
     verificar que los dos archivos se llevan el mismo arco es la prueba de que no
     quedan huecos entre vecinos. */
  const duenos = new Map();
  for (const nivel of Object.keys(niveles)) duenos.set(nivel, new Map());

  for (const dd of departamentos) {
    const info = { archivos: {} };
    for (const [nivel, topo] of Object.entries(niveles)) {
      const geometrias = topo.objects[nombre].geometries
        .filter((g) => g.properties.ubigeo.slice(0, 2) === dd);
      const recortado = podar(topo, nombre, geometrias);
      const archivo = `${nombre}/${dd}.${nivel}.topojson`;
      const tam = escribir(path.join(DESTINO, archivo), recortado);
      info.archivos[nivel] = { archivo, bytes: tam };
      if (nivel === 'alto') { info.bbox = recortado.bbox; info.n = geometrias.length; }
      resumen[nivel].total += tam;
      if (tam > resumen[nivel].mayor) { resumen[nivel].mayor = tam; resumen[nivel].mayorDd = dd; }

      const mapa = duenos.get(nivel);
      for (const g of geometrias) {
        recorrerArcos(g.arcs, (i) => {
          const clave = i < 0 ? ~i : i;
          if (!mapa.has(clave)) mapa.set(clave, new Set());
          mapa.get(clave).add(dd);
        });
      }
      /* El archivo escrito debe contener, punto por punto, los arcos de la topología
         común que le tocan; si no, dos vecinos dibujarían bordes distintos. */
      const propios = [...new Set(
        geometrias.flatMap((g) => { const l = []; recorrerArcos(g.arcs, (i) => l.push(i < 0 ? ~i : i)); return l; }),
      )].sort((a, b) => a - b);
      propios.forEach((viejo, nuevoIndice) => {
        if (JSON.stringify(recortado.arcs[nuevoIndice]) !== JSON.stringify(topo.arcs[viejo])) {
          abortar(`La poda alteró un arco de ${nombre}/${dd} en el nivel ${nivel}.`);
        }
      });
    }
    entrada.departamentos[dd] = info;
  }

  for (const [nivel, mapa] of duenos) {
    for (const dds of mapa.values()) if (dds.size > 1) resumen[nivel].compartidos++;
  }

  for (const [nivel, r] of Object.entries(resumen)) {
    console.log(
      `  ✓ ${nivel.padEnd(5)} ${departamentos.length} archivos  ${peso(r.total).padStart(9)} en total`
      + `  (mayor: ${nombreDe.get(r.mayorDd)} ${peso(r.mayor)};`
      + ` ${r.compartidos} arcos de borde compartidos, idénticos en ambos vecinos)`,
    );
  }
}

/* ································ contexto ······························· */

titulo('Contexto Natural Earth (recortado al marco del Perú)');

/** El marco como MultiPolygon, en el formato que espera polygon-clipping. */
const RECT = [[[
  [MARCO.lonMin, MARCO.latMin], [MARCO.lonMax, MARCO.latMin],
  [MARCO.lonMax, MARCO.latMax], [MARCO.lonMin, MARCO.latMax],
  [MARCO.lonMin, MARCO.latMin],
]]];

function cajaDeAnillo(anillo) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of anillo) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const tocaMarco = (caja) => !(caja[2] < MARCO.lonMin || caja[0] > MARCO.lonMax
  || caja[3] < MARCO.latMin || caja[1] > MARCO.latMax);

/**
 * Recorta una geometría al marco. Antes de llamar al recortador se descartan los
 * polígonos que ni rozan el marco: Brasil o el océano mundial traen decenas de miles
 * de vértices al otro lado del planeta que sólo harían lento el recorte.
 */
function recortar(geometria) {
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates;
  const cercanos = poligonos.filter((poly) => tocaMarco(cajaDeAnillo(poly[0])));
  if (!cercanos.length) return null;
  let recorte;
  try {
    recorte = polygonClipping.intersection(cercanos, RECT);
  } catch (err) {
    abortar('Falló el recorte de una geometría de contexto.', err.message);
  }
  if (!recorte || !recorte.length) return null;
  return { type: 'MultiPolygon', coordinates: recorte };
}

const contextoFc = { type: 'FeatureCollection', features: [] };

/* Países. El Perú NO se toma de aquí: su contorno sale del INEI, que es la fuente
   oficial del país y la que usan las capas temáticas.

   Se recorta TODA la tierra que cae dentro del marco, no sólo los cinco vecinos: por
   la esquina nororiental asoman Venezuela y Guyana, y dejarlas fuera abriría un hueco
   blanco en mitad del mapa, que en papel parece un error de impresión. Sólo los cinco
   vecinos llevan `rotular`, que es lo que la Fase 2 usará para poner su nombre. */
{
  const VECINOS = { ECU: 'Ecuador', COL: 'Colombia', BRA: 'Brasil', BOL: 'Bolivia', CHL: 'Chile' };
  const enMarco = leer('ne_10m_admin_0_countries.geojson').features
    .filter((f) => f.properties.ADM0_A3 !== 'PER')
    .map((f) => ({ f, geom: recortar(f.geometry) }))
    .filter((x) => x.geom);
  const hallados = enMarco.map((x) => x.f.properties.ADM0_A3);
  const faltan = Object.keys(VECINOS).filter((k) => !hallados.includes(k));
  if (faltan.length) abortar(`Natural Earth no trajo estos países vecinos: ${faltan.join(', ')}.`);
  for (const { f, geom } of enMarco.sort((a, b) => a.f.properties.ADM0_A3.localeCompare(b.f.properties.ADM0_A3))) {
    const codigo = f.properties.ADM0_A3;
    contextoFc.features.push({
      type: 'Feature',
      properties: {
        capa: 'pais',
        codigo,
        nombre: VECINOS[codigo] || f.properties.NAME_ES || f.properties.NAME,
        rotular: Boolean(VECINOS[codigo]),
      },
      geometry: geom,
    });
  }
  const otros = enMarco.filter((x) => !VECINOS[x.f.properties.ADM0_A3]);
  console.log(`  · países en el marco: ${enMarco.length} (5 vecinos rotulables`
    + `${otros.length ? `, ${otros.length} sin rótulo: ${otros.map((x) => x.f.properties.NAME_ES || x.f.properties.NAME).join(', ')}` : ''})`);
}

/* Océano. Se publica recortado al marco; el motor puede además rellenar el marco
   entero con el color de agua y dibujar la tierra encima, que evita el hilo blanco
   donde la costa de Natural Earth y la del INEI no coinciden al milímetro. */
{
  const oceano = leer('ne_10m_ocean.geojson').features[0];
  const geom = recortar(oceano.geometry);
  if (!geom) abortar('El recorte del océano quedó vacío: revisa el marco.');
  contextoFc.features.push({ type: 'Feature', properties: { capa: 'oceano', nombre: 'Océano Pacífico' }, geometry: geom });
  console.log(`  · océano recortado: ${geom.coordinates.length} polígonos`);
}

/**
 * Natural Earth ya nombra algunos lagos «Lago …» o «Laguna …» y otros no.
 * Anteponer «Lago» sin mirar producía «Lago Laguna Huaytunas».
 */
const YA_LLEVA_LAGO = /^(lago|laguna)[\s'’]/i;

function nombreDeLago(p) {
  const base = String(p.name_es || p.name || 'Lago').trim();
  return YA_LLEVA_LAGO.test(base) ? base : `Lago ${base}`;
}

/* Lagos. Sólo los grandes: el mapa de referencia rotula el Titicaca y poco más. */
{
  const AREA_MINIMA = 0.02; // grados cuadrados, ~250 km²
  const lagos = leer('ne_10m_lakes.geojson').features.filter((f) => {
    const caja = cajaDeAnillo(f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]);
    if (!tocaMarco(caja)) return false;
    return (caja[2] - caja[0]) * (caja[3] - caja[1]) >= AREA_MINIMA;
  });
  for (const f of lagos.sort((a, b) => String(a.properties.name).localeCompare(String(b.properties.name)))) {
    const geom = recortar(f.geometry);
    if (!geom) continue;
    contextoFc.features.push({
      type: 'Feature',
      properties: { capa: 'lago', nombre: nombreDeLago(f.properties) },
      geometry: geom,
    });
  }
  console.log(`  · lagos: ${lagos.map((f) => f.properties.name).join(', ') || 'ninguno'}`);
}

{
  /* El contexto es fondo: nunca se imprime a escala grande, así que basta la
     tolerancia del nivel medio aunque el mapa principal vaya en alto. */
  rebobinarColeccion(contextoFc, 'contexto');
  const base = presimplify(topology({ contexto: contextoFc }));
  const originales = contarVertices(base);
  const topo = quantize(simplify(base, pesoDe(NIVELES.medio.toleranciaM)), 1e6);
  topo.bbox = [MARCO.lonMin, MARCO.latMin, MARCO.lonMax, MARCO.latMax];
  console.log(`  · ${originales.toLocaleString('es')} vértices originales → ${contarVertices(topo).toLocaleString('es')} a ±${NIVELES.medio.toleranciaM} m`);
  const tam = escribir(path.join(DESTINO, 'contexto.topojson'), topo);
  manifiesto.capas.contexto = {
    ambito: 'nacional',
    archivo: 'contexto.topojson',
    bytes: tam,
    marco: [MARCO.lonMin, MARCO.latMin, MARCO.lonMax, MARCO.latMax],
    elementos: contextoFc.features.map((f) => ({ capa: f.properties.capa, nombre: f.properties.nombre })),
  };
  console.log(`  ✓ contexto.topojson  ${contarVertices(topo).toLocaleString('es')} vértices  ${peso(tam)}`);
}

/* ------------------------------ verificación ---------------------------- */

/**
 * Comprueba lo publicado con el mismo motor que lo va a dibujar. Medir la superficie
 * del Perú sobre la geometría final y compararla con el dato oficial valida de una
 * vez el sentido de giro, la topología y las unidades: si algún anillo quedara del
 * revés, d3 devolvería el área del planeta entero y aquí saltaría.
 */
titulo('Verificación con d3-geo');
{
  const R = 6371.0088; // radio medio terrestre, km
  const AREA_PERU_OFICIAL = 1_285_216; // km², INEI
  const problemas = [];

  const revisar = (archivo, objeto) => {
    const fc = feature(JSON.parse(fs.readFileSync(path.join(DESTINO, archivo), 'utf8')), objeto);
    let area = 0;
    for (const f of fc.features) {
      const a = geoArea(f.geometry);
      if (a > 1) problemas.push(`${archivo}: «${f.properties.nombre}» ocupa ${a.toFixed(2)} sr (anillo invertido)`);
      area += a;
    }
    return { fc, km2: area * R * R };
  };

  const dep = revisar('departamentos.alto.topojson', 'departamentos');
  const prov = revisar('provincias.alto.topojson', 'provincias');
  const desvio = ((dep.km2 - AREA_PERU_OFICIAL) / AREA_PERU_OFICIAL) * 100;
  console.log(`  superficie por departamentos  ${Math.round(dep.km2).toLocaleString('es')} km²  (${desvio >= 0 ? '+' : ''}${desvio.toFixed(2)} % frente al dato oficial)`);
  console.log(`  superficie por provincias     ${Math.round(prov.km2).toLocaleString('es')} km²`);
  if (Math.abs(desvio) > 1) {
    problemas.push(`La superficie calculada se aparta ${desvio.toFixed(2)} % de los ${AREA_PERU_OFICIAL.toLocaleString('es')} km² oficiales.`);
  }

  const ctxFc = feature(JSON.parse(fs.readFileSync(path.join(DESTINO, 'contexto.topojson'), 'utf8')), 'contexto');
  for (const f of ctxFc.features) {
    if (geoArea(f.geometry) > 1) problemas.push(`contexto: «${f.properties.nombre}» invertido`);
  }
  console.log(`  contexto: ${ctxFc.features.length} elementos con sentido de giro correcto`);

  /* Un departamento cualquiera repartido debe cubrir lo mismo que en el archivo nacional. */
  const muestra = '15';
  const provDd = revisar(`provincias/${muestra}.alto.topojson`, 'provincias');
  const nacional = prov.fc.features.filter((f) => f.properties.ubigeo.slice(0, 2) === muestra);
  const km2Nacional = nacional.reduce((s, f) => s + geoArea(f.geometry), 0) * R * R;
  const dif = Math.abs(provDd.km2 - km2Nacional);
  console.log(`  reparto ${nombreDe.get(muestra)}: ${provDd.fc.features.length} provincias, ${Math.round(provDd.km2).toLocaleString('es')} km² (diferencia con el nacional: ${dif.toFixed(3)} km²)`);
  if (dif > 1) problemas.push(`El archivo repartido de ${nombreDe.get(muestra)} no coincide con el nacional (${dif.toFixed(2)} km²).`);

  if (problemas.length) {
    abortar('La cartografía construida no supera la verificación.', problemas.map((p, i) => `${i + 1}. ${p}`).join('\n'));
  }
  console.log('  ✓ sin anillos invertidos, reparto coherente');
}

/* ------------------------------- manifiesto ----------------------------- */

const tamManifiesto = escribirJson(path.join(DESTINO, 'indice.json'), manifiesto);

let totalBytes = 0;
let totalArchivos = 0;
(function pesar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pesar(p);
    else { totalBytes += fs.statSync(p).size; totalArchivos++; }
  }
}(DESTINO));

titulo('Resumen');
console.log(`  ${totalArchivos} archivos, ${peso(totalBytes)} en public/data/geo`);
console.log(`  indice.json ${peso(tamManifiesto)} describe niveles, archivos y cajas envolventes`);
console.log(`\n✓ Cartografía construida en ${((Date.now() - inicio) / 1000).toFixed(1)} s.\n`);
