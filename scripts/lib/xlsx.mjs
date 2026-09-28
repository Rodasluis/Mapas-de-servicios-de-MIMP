/**
 * Lector mínimo de hojas .xlsx, sólo lo que pide el directorio del MIMP.
 *
 * Un .xlsx es un zip de XML. Para leer una tabla de texto y números basta con tres
 * piezas: el libro (qué hojas hay y en qué archivo está cada una), las cadenas
 * compartidas y la hoja. No se interpretan fórmulas, estilos ni fechas: el directorio
 * no las usa en las columnas que se leen, y un lector que no las entiende no puede
 * interpretarlas mal.
 *
 * Se descomprime con fflate, que ya estaba en el proyecto, en vez de añadir una
 * dependencia de hojas de cálculo entera para leer una tabla.
 */
import { unzipSync, strFromU8 } from 'fflate';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTIDADES[e])
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Texto de un nodo que puede venir partido en varios <t> (texto enriquecido). */
const textoDe = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((m) => decodificar(m[1])).join('');

/** «AB» → 27. */
const columnaANumero = (letras) => [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0);

/**
 * Lee una hoja por su nombre y devuelve sus filas como objetos, con las claves de la
 * primera fila (la cabecera). Las celdas vacías llegan como cadena vacía.
 *
 * @param {Buffer|Uint8Array} buffer  el .xlsx completo
 * @param {string} nombreHoja
 * @returns {{cabecera: string[], filas: object[]}}
 */
export function leerHoja(buffer, nombreHoja) {
  const zip = unzipSync(new Uint8Array(buffer));
  const leer = (ruta) => {
    if (!zip[ruta]) throw new Error(`El .xlsx no contiene «${ruta}».`);
    return strFromU8(zip[ruta]);
  };

  const libro = leer('xl/workbook.xml');
  const hojas = [...libro.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    nombre: decodificar(m[0].match(/\bname="([^"]*)"/)[1]),
    rid: m[0].match(/\br:id="([^"]*)"/)[1],
  }));
  const hoja = hojas.find((h) => h.nombre === nombreHoja);
  if (!hoja) {
    throw new Error(`No hay hoja «${nombreHoja}». Hojas: ${hojas.map((h) => h.nombre).join(', ')}.`);
  }

  /* El nombre del archivo de la hoja no se deduce del orden: lo dice la tabla de
     relaciones del libro. */
  const relaciones = leer('xl/_rels/workbook.xml.rels');
  const rel = [...relaciones.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((r) => r.includes(`Id="${hoja.rid}"`));
  const destino = rel.match(/\bTarget="([^"]*)"/)[1].replace(/^\/?(xl\/)?/, '');

  const compartidas = zip['xl/sharedStrings.xml']
    ? [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]))
    : [];

  const filas = [];
  for (const mFila of leer(`xl/${destino}`).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const mCelda of mFila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = mCelda[1];
      const cuerpo = mCelda[2] || '';
      const col = columnaANumero(atributos.match(/\br="([A-Z]+)\d+"/)[1]) - 1;
      const tipo = (atributos.match(/\bt="([^"]*)"/) || [])[1];
      const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valor = '';
      if (tipo === 's') valor = compartidas[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo);
      else if (v !== undefined) valor = decodificar(v);
      fila[col] = valor;
    }
    filas.push(Array.from(fila, (x) => x ?? ''));
  }

  const [cabecera = [], ...resto] = filas;
  const claves = cabecera.map((c) => String(c).trim());
  return {
    cabecera: claves,
    filas: resto
      .filter((f) => f.some((x) => String(x).trim() !== ''))
      .map((f) => Object.fromEntries(claves.map((k, i) => [k, f[i] ?? '']))),
  };
}
