/**
 * Datos propios de quien hace el mapa (Fase 23).
 *
 * Una tabla suya, en CSV o Excel, con una de dos cosas o las dos:
 *  · VALORES por ubigeo —casos atendidos, metas, presupuesto—, uno o varios por fila
 *    (valor1, valor2…), de los que se elige cuál colorea el mapa en lugar de los
 *    servicios (motor/variables.js, «propia»);
 *  · PUNTOS con su latitud y longitud —sedes de otra entidad, comunidades—, que se
 *    dibujan como rombos grises, una forma que ningún servicio del MIMP usa: los
 *    servicios sólo salen del directorio (regla 1 del proyecto) y no se pueden confundir
 *    con lo que añade cada quien.
 *
 * El archivo se lee en el navegador y no sale de él: no se sube a ningún sitio y, por
 * eso mismo, no viaja en el enlace de la configuración. Este módulo no toca el DOM, así
 * que sirve igual en Node, que es como las muestras leen su archivo de ejemplo.
 */
import { leerFilas } from './xlsx.js';
import { escribirLibro } from './xlsx-escribir.js';

/** Más filas que esto ya no es una tabla para un mapa impreso, y el PDF lo pagaría. */
export const MAXIMO_FILAS = 20000;

/** Caja del Perú con holgura: un punto fuera de ella tiene las coordenadas mal. */
const CAJA_PERU = { lonMin: -82, lonMax: -68, latMin: -19, latMax: 0.5 };

const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Cómo se reconoce cada columna por su cabecera, ya sin tildes ni mayúsculas. */
const COLUMNAS = {
  ubigeo: /^(ubigeo|ubigeo inei|cod ubigeo|codigo ubigeo|cod ubig|ubig)$/,
  lat: /^(lat|latitud|latitude|y|coord y|coordenada y)$/,
  lon: /^(lon|lng|long|longitud|longitude|x|coord x|coordenada x)$/,
  nombre: /^(nombre|name|denominacion|descripcion|lugar|sede|establecimiento)$/,
};

/** Columnas de texto del modelo, que nunca son valores aunque alguien escriba un número. */
const DE_TEXTO = /^(departamento|provincia|distrito|dpto|prov|dist|ambito|region)$/;

/** Cuántas columnas de valor trae el modelo que se descarga. */
export const COLUMNAS_DEL_MODELO = 5;

/* --------------------------------- lectura -------------------------------- */

/**
 * Las filas de un archivo, como listas de celdas de texto.
 * @param {{nombre: string, bytes: Uint8Array|ArrayBuffer}} archivo
 */
export function leerArchivo({ nombre, bytes }) {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (/\.xlsx$/i.test(nombre)) return leerFilas(datos, null);
  if (/\.xls$/i.test(nombre)) {
    throw new Error('El formato .xls antiguo no se puede leer: guárdalo como .xlsx o como CSV.');
  }
  return leerCsv(decodificar(datos));
}

/** UTF-8 si lo es; si no, Windows-1252, que es como guarda un CSV el Excel en español. */
function decodificar(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * CSV con comillas. El separador se deduce de la primera línea: el Excel en español
 * separa con punto y coma porque la coma es su separador decimal.
 */
export function leerCsv(texto) {
  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const separador = [';', '\t', ','].map((s) => [s, primera.split(s).length - 1])
    .sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === separador) { fila.push(celda); celda = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

/**
 * Número escrito a la peruana o a la inglesa: «1 234,5», «1.234,5», «1,234.5», «12,5».
 * Con un solo separador, la coma es decimal y el punto también: «1.234» es 1,234, no mil
 * doscientos treinta y cuatro. Quien tenga miles con punto tiene que quitarlos.
 */
export function leerNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor ?? '').trim().replace(/[\s  ]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma >= 0) s = s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ubigeo del INEI, con los ceros de la izquierda que Excel se come: «10101» es
 * «010101». Devuelve null si no tiene forma de ubigeo.
 */
export function leerUbigeo(valor) {
  const s = String(valor ?? '').trim().replace(/\.0+$/, '');
  if (!/^\d{1,6}$/.test(s)) return null;
  const largo = s.length <= 2 ? 2 : s.length <= 4 ? 4 : 6;
  return s.padStart(largo, '0');
}

const NIVEL_POR_LARGO = { 2: 'departamento', 4: 'provincia', 6: 'distrito' };

/* ------------------------------ interpretación ----------------------------- */

/**
 * Qué hay en la tabla: busca las columnas por su cabecera y lee cada fila.
 *
 * Las columnas de VALOR son todas las que traen números —al menos uno, y números en
 * cuatro de cada cinco celdas llenas— salvo las que ya son otra cosa (ubigeo,
 * coordenadas, nombre, departamento, provincia, distrito). Así sirven igual «valor1» y
 * «valor2» del modelo, una columna renombrada «Casos 2025» o la «población 2026» de un
 * cuadro del INEI. Una columna del modelo que se deja vacía no cuenta.
 *
 * @param {string[][]} filas  como las devuelve leerArchivo
 * @returns {{
 *   columnas: object, series: Array<{columna, valores, conDato}>, valores: object|null,
 *   puntos: Array<{lon, lat, nombre}>, nivel: string|null, resumen: object, avisos: string[],
 * }}
 */
export function interpretar(filas) {
  const conDatos = filas.filter((f) => f.some((c) => String(c ?? '').trim() !== ''));
  if (conDatos.length < 2) throw new Error('El archivo no tiene filas de datos bajo la cabecera.');
  if (conDatos.length - 1 > MAXIMO_FILAS) {
    throw new Error(`El archivo tiene ${conDatos.length - 1} filas; el máximo es ${MAXIMO_FILAS.toLocaleString('es-PE')}.`);
  }
  const [cabecera, ...cuerpo] = conDatos;
  const nombres = cabecera.map(normalizar);
  const buscar = (re) => nombres.findIndex((n) => re.test(n));
  const columnas = {
    ubigeo: buscar(COLUMNAS.ubigeo),
    lat: buscar(COLUMNAS.lat),
    lon: buscar(COLUMNAS.lon),
    nombre: buscar(COLUMNAS.nombre),
  };
  const ocupadas = new Set(Object.values(columnas).filter((i) => i >= 0));
  const indicesDeValor = columnas.ubigeo < 0 ? [] : cabecera.map((_, i) => i).filter((i) => {
    if (ocupadas.has(i) || DE_TEXTO.test(nombres[i])) return false;
    const llenas = cuerpo.filter((f) => String(f[i] ?? '').trim() !== '');
    const numericas = llenas.filter((f) => leerNumero(f[i]) !== null).length;
    return numericas > 0 && numericas >= llenas.length * 0.8;
  });
  const conPuntos = columnas.lat >= 0 && columnas.lon >= 0;
  const conValores = indicesDeValor.length > 0;
  if (!conPuntos && !conValores) {
    throw new Error(columnas.ubigeo >= 0
      ? 'Hay columna de ubigeo, pero ninguna columna de valor tiene números.'
      : 'No se encontraron columnas de «ubigeo» y de valor, ni de «latitud» y «longitud».'
        + ` Las cabeceras leídas son: ${cabecera.map((c) => `«${String(c).trim()}»`).join(', ')}.`);
  }

  const avisos = [];
  const resumen = { filas: cuerpo.length, puntos: 0, valores: 0, descartadas: 0 };

  /* Puntos. Una latitud de -75 es una longitud: si las dos vienen cambiadas en la
     fila, se cambian; si no caen en el Perú, la fila se descarta. */
  const puntos = [];
  if (conPuntos) {
    let cambiadas = 0;
    let fuera = 0;
    for (const f of cuerpo) {
      let lat = leerNumero(f[columnas.lat]);
      let lon = leerNumero(f[columnas.lon]);
      if (lat === null || lon === null) { fuera++; continue; }
      if (lat < -60 && lon > -25) { [lat, lon] = [lon, lat]; cambiadas++; }
      if (lon < CAJA_PERU.lonMin || lon > CAJA_PERU.lonMax || lat < CAJA_PERU.latMin || lat > CAJA_PERU.latMax) {
        fuera++; continue;
      }
      puntos.push({ lon, lat, nombre: columnas.nombre >= 0 ? String(f[columnas.nombre] ?? '').trim() : '' });
    }
    resumen.puntos = puntos.length;
    if (cambiadas) avisos.push(`${cambiadas} fila(s) tenían la latitud y la longitud cambiadas de columna: se corrigieron.`);
    if (fuera) avisos.push(`${fuera} fila(s) sin coordenadas válidas en el Perú no se dibujan.`);
  }

  /* Valores por ubigeo. El nivel es el de la mayoría de ubigeos; las filas de otro
     nivel, y las de un ubigeo repetido, se descartan diciéndolo. Una celda vacía es
     «sin dato» para esa columna, no un cero. */
  const series = [];
  let nivel = null;
  if (conValores) {
    const conUbigeo = cuerpo.map((f) => ({ f, ubigeo: leerUbigeo(f[columnas.ubigeo]) })).filter((x) => x.ubigeo);
    const porLargo = {};
    for (const x of conUbigeo) porLargo[x.ubigeo.length] = (porLargo[x.ubigeo.length] || 0) + 1;
    const largo = Number(Object.entries(porLargo).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]);
    if (largo) {
      nivel = NIVEL_POR_LARGO[largo];
      const vistos = new Set();
      const validas = [];
      let repetidos = 0;
      for (const x of conUbigeo) {
        if (x.ubigeo.length !== largo) continue;
        if (vistos.has(x.ubigeo)) { repetidos++; continue; }
        vistos.add(x.ubigeo);
        validas.push(x);
      }
      for (const i of indicesDeValor) {
        const valores = {};
        for (const { f, ubigeo } of validas) {
          const v = leerNumero(f[i]);
          if (v !== null) valores[ubigeo] = v;
        }
        const conDato = Object.keys(valores).length;
        if (conDato) series.push({ columna: String(cabecera[i]).trim(), valores, conDato });
      }
      const otroNivel = conUbigeo.length - validas.length - repetidos;
      if (otroNivel) avisos.push(`${otroNivel} fila(s) con ubigeo de otro nivel que el de la mayoría (${nivel}) no se usan.`);
      if (repetidos) avisos.push(`${repetidos} ubigeo(s) repetidos: vale la primera fila de cada uno.`);
      const sinUbigeo = cuerpo.length - conUbigeo.length;
      if (sinUbigeo && !conPuntos) avisos.push(`${sinUbigeo} fila(s) sin un ubigeo válido no se usan.`);
    }
    resumen.valores = series[0]?.conDato || 0;
  }
  resumen.descartadas = cuerpo.length - Math.max(resumen.puntos, resumen.valores);

  return {
    columnas: Object.fromEntries(Object.entries(columnas).map(([k, i]) => [k, i >= 0 ? String(cabecera[i]).trim() : null])),
    series,
    /* La primera columna de valor, que es la que colorea mientras no se elija otra. */
    valores: series[0]?.valores || null,
    puntos,
    nivel: series.length ? nivel : null,
    resumen,
    avisos,
  };
}

/* --------------------------------- modelo --------------------------------- */

/**
 * El modelo que se descarga desde la interfaz: un Excel con todos los distritos —su
 * ubigeo y los nombres de su departamento, provincia y distrito, tal como los escribe la
 * cartografía— y COLUMNAS_DEL_MODELO columnas de valor vacías. Quien lo llena no tiene
 * que buscar ubigeos ni preocuparse por el cero inicial: el ubigeo va como texto.
 *
 * Sale de public/data/lugares.json, la misma lista del buscador, así que trae
 * exactamente los distritos que el mapa sabe dibujar. Lleva una segunda hoja con las
 * instrucciones.
 *
 * @param {Array<[string, string]>} lugares  [ubigeo, nombre] de los tres niveles
 * @returns {Uint8Array} el .xlsx
 */
export function libroModelo(lugares) {
  const nombre = new Map(lugares);
  const distritos = lugares.filter(([u]) => u.length === 6).sort((a, b) => a[0].localeCompare(b[0]));
  const valores = Array.from({ length: COLUMNAS_DEL_MODELO }, (_, i) => `valor${i + 1}`);
  return escribirLibro([
    {
      nombre: 'datos',
      columnas: [
        { titulo: 'ubigeo', ancho: 10 },
        { titulo: 'departamento', ancho: 16 },
        { titulo: 'provincia', ancho: 22 },
        { titulo: 'distrito', ancho: 28 },
        ...valores.map((v) => ({ titulo: v, ancho: 11 })),
      ],
      filas: distritos.map(([u, n]) => ({
        celdas: [u, nombre.get(u.slice(0, 2)) || '', nombre.get(u.slice(0, 4)) || '', n],
      })),
    },
    {
      nombre: 'instrucciones',
      filtro: false,
      columnas: [{ titulo: 'Cómo llenar el modelo', ancho: 110 }],
      filas: [
        'Escribe tus datos en las columnas valor1, valor2… de la hoja «datos». Puedes cambiarles el nombre (por ejemplo, «Casos 2025»): el nombre aparece al elegir la columna en el mapa.',
        'Una celda vacía significa «sin dato»: ese distrito sale en blanco. No escribas 0 si el dato no existe.',
        'No cambies la columna «ubigeo»: es la que une cada fila con su distrito en el mapa. Puedes borrar las filas de los distritos que no uses.',
        'Los números pueden llevar decimales con coma o con punto («12,5» o «12.5»). No uses separador de miles con punto.',
        'Los datos son por distrito: el mapa los colorea dividido hasta distritos. Para datos por provincia o departamento, usa una tabla con el ubigeo de 4 o 6 dígitos de ese nivel.',
        'Para dibujar puntos en lugar de colorear, usa una tabla con las columnas «nombre», «latitud» y «longitud».',
        'Guarda el archivo como .xlsx o .csv y cárgalo en «Datos propios». No sale de tu computadora ni viaja en el enlace del mapa.',
      ].map((texto) => ({ celdas: [texto] })),
    },
  ]);
}
