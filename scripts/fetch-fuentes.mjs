/**
 * Descarga las tipografías del proyecto a public/fonts, con su licencia.
 *
 * Las dos son de licencia abierta (SIL OFL 1.1), que permite incrustarlas en un PDF
 * y redistribuirlas con el sitio. El PDF debe llevar las fuentes dentro para que la
 * imprenta componga el texto igual que la pantalla, así que hacen falta TTF ESTÁTICOS:
 * jsPDF incrusta el archivo tal cual y un lector de PDF no sabe interpretar los ejes
 * de una fuente variable, de modo que una variable saldría siempre en su peso por
 * defecto y la negrita se perdería. Por eso Source Sans 3 se toma de la versión de
 * Adobe y no de Google Fonts, donde sólo se publica como fuente variable.
 *
 * Uso:  npm run fuentes
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { paquete, abortar, descargar, titulo, peso, asegurarCarpeta, CACHE, PUBLICO } from './lib/comun.mjs';

const { POPPINS_TAG, SOURCE_SANS_TAG } = paquete();
if (!POPPINS_TAG || !SOURCE_SANS_TAG) abortar('Faltan POPPINS_TAG o SOURCE_SANS_TAG en package.json.');

const DEST_CACHE = path.join(CACHE, 'fuentes');
const DEST_PUB = path.join(PUBLICO, 'fonts');

/* Pesos que usa el proyecto. Se descarga sólo lo que se va a componer: cada TTF que
   sobra son 400 KB que el navegador descarga para nada. */
const POPPINS = ['Regular', 'Medium', 'SemiBold', 'Bold'];
const SOURCE_SANS = ['Regular', 'It', 'Semibold', 'Bold'];

asegurarCarpeta(DEST_PUB);
let total = 0;

/* -------------------------------- Poppins ------------------------------- */

titulo(`Poppins · google/fonts ${POPPINS_TAG.slice(0, 7)}`);
{
  const base = `https://raw.githubusercontent.com/google/fonts/${POPPINS_TAG}/ofl/poppins`;
  for (const peso_ of POPPINS) {
    const archivo = `Poppins-${peso_}.ttf`;
    const buf = await descargar(`${base}/${archivo}`, path.join(DEST_CACHE, archivo));
    fs.writeFileSync(path.join(DEST_PUB, archivo), buf);
    total += buf.length;
  }
  const lic = await descargar(`${base}/OFL.txt`, path.join(DEST_CACHE, 'Poppins-OFL.txt'));
  fs.writeFileSync(path.join(DEST_PUB, 'Poppins-OFL.txt'), lic);
  total += lic.length;
}

/* ----------------------------- Source Sans 3 ---------------------------- */

titulo(`Source Sans 3 · adobe-fonts ${SOURCE_SANS_TAG}`);
{
  const zipUrl = `https://github.com/adobe-fonts/source-sans/releases/download/${SOURCE_SANS_TAG}/TTF-source-sans-${SOURCE_SANS_TAG}.zip`;
  const zip = await descargar(zipUrl, path.join(DEST_CACHE, `source-sans-${SOURCE_SANS_TAG}.zip`), {
    etiqueta: `TTF-source-sans-${SOURCE_SANS_TAG}.zip`,
  });
  let contenido;
  try {
    contenido = unzipSync(new Uint8Array(zip));
  } catch (err) {
    abortar('No se pudo abrir el paquete de Source Sans 3.', err.message);
  }
  for (const peso_ of SOURCE_SANS) {
    const archivo = `SourceSans3-${peso_}.ttf`;
    const datos = contenido[`TTF/${archivo}`];
    if (!datos) {
      abortar(
        `El paquete de Source Sans 3 no trae ${archivo}.`,
        `Contiene: ${Object.keys(contenido).filter((k) => k.endsWith('.ttf')).join(', ')}`,
      );
    }
    fs.writeFileSync(path.join(DEST_PUB, archivo), datos);
    total += datos.length;
    console.log(`  ✓ ${archivo} ${peso(datos.length)}`);
  }
  const lic = await descargar(
    `https://raw.githubusercontent.com/adobe-fonts/source-sans/${SOURCE_SANS_TAG}/LICENSE.md`,
    path.join(DEST_CACHE, 'SourceSans3-LICENSE.md'),
  );
  fs.writeFileSync(path.join(DEST_PUB, 'SourceSans3-LICENSE.md'), lic);
  total += lic.length;
}

/* ------------------------------ comprobación ---------------------------- */

/** Un TTF estático empieza por 0x00010000 y no trae tabla «fvar» (ejes variables). */
function revisarTtf(archivo) {
  const buf = fs.readFileSync(archivo);
  const version = buf.readUInt32BE(0);
  if (version !== 0x00010000 && version !== 0x74727565) {
    return `${path.basename(archivo)}: no parece un TTF (cabecera 0x${version.toString(16)}).`;
  }
  const tablas = buf.readUInt16BE(4);
  for (let i = 0; i < tablas; i++) {
    if (buf.toString('ascii', 12 + i * 16, 16 + i * 16) === 'fvar') {
      return `${path.basename(archivo)}: es una fuente VARIABLE; un PDF la compondría siempre en su peso por defecto.`;
    }
  }
  return null;
}

titulo('Comprobación de las fuentes');
const problemas = [];
const ttfs = fs.readdirSync(DEST_PUB).filter((f) => f.endsWith('.ttf')).sort();
for (const f of ttfs) {
  const fallo = revisarTtf(path.join(DEST_PUB, f));
  if (fallo) problemas.push(fallo);
}
console.log(`  ${ttfs.length} TTF estáticos, aptos para incrustar en PDF`);
console.log(`  licencias: Poppins-OFL.txt, SourceSans3-LICENSE.md (SIL OFL 1.1)`);
if (problemas.length) abortar('Alguna fuente no sirve para incrustar.', problemas.join('\n'));

console.log(`\n✓ Tipografías en public/fonts (${peso(total)}).\n`);
