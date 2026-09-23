/**
 * Comprobación de que un PDF cumple lo que este proyecto promete.
 *
 * Dos cosas son innegociables y se comprueban aquí:
 *  · que NO haya ninguna imagen de mapa de bits —un solo <image> colado convertiría
 *    el mapa en una captura ampliada y se vería al imprimir en A0—, y
 *  · que las tipografías vayan INCRUSTADAS, porque un PDF que dependa de las fuentes
 *    instaladas en el ordenador de la imprenta se compone allí con otras y se
 *    descuadran todos los rótulos.
 *
 * Se lee el PDF directamente en vez de depender de poppler (pdfimages/pdffonts), que
 * no está instalado en todas partes. jsPDF comprime los flujos de contenido pero deja
 * los diccionarios de objetos en claro, que es lo que se inspecciona. Si poppler está
 * disponible, `npm run muestras` contrasta ambos resultados.
 *
 * Uso:  node tests/verificar-pdf.mjs muestras/*.pdf
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {Buffer|Uint8Array} datos
 * @returns {{imagenes: number, fuentes: Array, paginas: number, medidasPt: Array, problemas: string[]}}
 */
export function analizarPdf(datos) {
  const texto = Buffer.from(datos).toString('latin1');

  /* Imágenes: cualquier XObject de subtipo Image. Se aceptan espacios y saltos de
     línea entre el nombre y el valor, que el formato permite. */
  const imagenes = (texto.match(/\/Subtype\s*\/Image\b/g) || []).length;

  /* Fuentes incrustadas: FontFile2 es TrueType; FontFile3 CFF; FontFile Type 1. */
  const incrustadas = {
    FontFile: (texto.match(/\/FontFile\s/g) || []).length,
    FontFile2: (texto.match(/\/FontFile2\s/g) || []).length,
    FontFile3: (texto.match(/\/FontFile3\s/g) || []).length,
  };

  const nombres = [...texto.matchAll(/\/BaseFont\s*\/([#\w+-]+)/g)].map((m) => decodificarNombre(m[1]));
  const fuentes = [...new Set(nombres)].sort();

  const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const medidasPt = [...texto.matchAll(/\/MediaBox\s*\[\s*([\d.\-\s]+?)\]/g)]
    .map((m) => m[1].trim().split(/\s+/).map(Number))
    .map(([x0, y0, x1, y1]) => [Number((x1 - x0).toFixed(2)), Number((y1 - y0).toFixed(2))]);

  const problemas = [];
  if (imagenes > 0) {
    problemas.push(`Contiene ${imagenes} imagen(es) de mapa de bits; la salida debe ser 100 % vectorial.`);
  }
  const totalIncrustadas = incrustadas.FontFile + incrustadas.FontFile2 + incrustadas.FontFile3;
  const noBase14 = fuentes.filter((f) => !esBase14(f));
  if (noBase14.length && totalIncrustadas === 0) {
    problemas.push(`Usa ${noBase14.length} tipografía(s) sin incrustar: ${noBase14.join(', ')}.`);
  }
  const base14 = fuentes.filter(esBase14);
  if (base14.length) {
    problemas.push(
      `Cae en tipografías del visor (${base14.join(', ')}): alguna llamada a setFont no encontró `
      + 'la fuente registrada y el texto no saldrá en la tipografía institucional.',
    );
  }

  return { imagenes, fuentes, incrustadas, totalIncrustadas, paginas, medidasPt, problemas };
}

/** Los nombres del PDF escapan caracteres como #20; y los subconjuntos van como ABCDEF+Nombre. */
function decodificarNombre(n) {
  return n.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const BASE14 = /^(Helvetica|Courier|Times|Symbol|ZapfDingbats)/i;
const esBase14 = (n) => BASE14.test(n.replace(/^[A-Z]{6}\+/, ''));

/** Milímetros de una medida en puntos PostScript. */
export const ptAmm = (pt) => Number(((pt * 25.4) / 72).toFixed(2));

export function verificarArchivo(archivo) {
  const analisis = analizarPdf(fs.readFileSync(archivo));
  return { archivo, bytes: fs.statSync(archivo).size, ...analisis };
}

/* ------------------------------- CLI ------------------------------------ */

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('verificar-pdf.mjs')) {
  const archivos = process.argv.slice(2);
  if (!archivos.length) {
    console.error('Uso: node tests/verificar-pdf.mjs <archivo.pdf> [...]');
    process.exit(1);
  }
  let fallos = 0;
  for (const archivo of archivos) {
    const r = verificarArchivo(archivo);
    const medidas = r.medidasPt.map(([w, h]) => `${ptAmm(w)}×${ptAmm(h)} mm`).join(', ');
    console.log(`\n${path.basename(archivo)}  ${(r.bytes / 1024).toFixed(0)} KB`);
    console.log(`  páginas      ${r.paginas} (${medidas})`);
    console.log(`  imágenes     ${r.imagenes}${r.imagenes === 0 ? '  ✓ sin raster' : '  ✗'}`);
    console.log(`  tipografías  ${r.fuentes.length} (${r.totalIncrustadas} incrustadas)`);
    for (const f of r.fuentes) console.log(`               · ${f}`);
    for (const p of r.problemas) { console.log(`  ✗ ${p}`); fallos++; }
    if (!r.problemas.length) console.log('  ✓ vectorial y con las tipografías incrustadas');
  }
  process.exit(fallos ? 1 : 0);
}
