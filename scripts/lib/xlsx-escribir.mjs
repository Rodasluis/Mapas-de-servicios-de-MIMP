/**
 * Escritor mínimo de libros .xlsx, para la hoja de auditoría del directorio.
 *
 * Como el lector (xlsx.mjs), se apoya sólo en fflate: un .xlsx es un zip con media
 * docena de XML. Escribe texto y números, una fila de cabecera fija con filtros, anchos
 * de columna y tres estilos: cabecera, texto normal y fila resaltada. No hace falta
 * más para que la hoja se pueda revisar y filtrar en Excel o LibreOffice.
 *
 * La salida es determinista: el zip lleva una fecha fija, así que el mismo contenido
 * produce el mismo archivo byte a byte.
 */
import { zipSync, strToU8 } from 'fflate';

const FECHA_ZIP = new Date('2026-01-01T00:00:00Z');

const escapar = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control que XML no admite (llegan a veces en celdas pegadas).
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const letraDe = (i) => {
  let n = i + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Estilos: 0 normal, 1 cabecera, 2 resaltado (fila con hallazgo), 3 atenuado. */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF777777"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * @param {Array<{nombre: string, columnas: Array<{titulo, ancho}>, filas: Array<{celdas: Array, estilo?: number}>}>} hojas
 * @returns {Uint8Array}
 */
export function escribirLibro(hojas) {
  const archivos = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
  hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
  hojas.map((h, i) => `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${
  definicionesDeFiltro(hojas)}</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
  hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': ESTILOS,
  };
  hojas.forEach((h, i) => { archivos[`xl/worksheets/sheet${i + 1}.xml`] = hojaXml(h); });

  return zipSync(Object.fromEntries(Object.entries(archivos)
    .map(([ruta, xml]) => [ruta, [strToU8(xml), { mtime: FECHA_ZIP }]])), { level: 6 });
}

/** Un único bloque definedNames con el rango filtrable de cada hoja que lo tenga. */
function definicionesDeFiltro(hojas) {
  const nombres = hojas
    .map((h, i) => (h.filtro === false ? '' : `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapar(h.nombre)}'!$A$1:$${letraDe(h.columnas.length - 1)}$${h.filas.length + 1}</definedName>`))
    .join('');
  return nombres ? `<definedNames>${nombres}</definedNames>` : '';
}

function hojaXml({ columnas, filas, filtro = true }) {
  const ultima = letraDe(columnas.length - 1);
  const celda = (valor, col, fila, estilo) => {
    const ref = `${letraDe(col)}${fila}`;
    if (valor === null || valor === undefined || valor === '') return estilo ? `<c r="${ref}" s="${estilo}"/>` : '';
    if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`;
    return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
  };
  const cabecera = `<row r="1" ht="30" customHeight="1">${columnas.map((c, i) => celda(c.titulo, i, 1, 1)).join('')}</row>`;
  const cuerpo = filas.map((f, j) => `<row r="${j + 2}">${f.celdas.map((v, i) => celda(v, i, j + 2, f.estilo || 0)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${ultima}${filas.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${
  columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('')
}</cols><sheetData>${cabecera}${cuerpo}</sheetData>${filtro ? `<autoFilter ref="A1:${ultima}${filas.length + 1}"/>` : ''}</worksheet>`;
}
