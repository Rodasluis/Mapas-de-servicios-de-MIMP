/**
 * Regresión visual de los PDF.
 *
 * Los demás controles miran la ESTRUCTURA: que los totales cuadren, que nada se
 * superponga, que la barra mida lo que dice. Ninguno vería que una capa dejó de
 * dibujarse, que un relleno cambió de color o que el mapa entero se desplazó tres
 * milímetros, porque todas esas cosas pasan las comprobaciones estructurales sin
 * inmutarse. Lo único que las detecta es mirar el papel.
 *
 * Así que se rasteriza el PDF —el archivo final, no el SVG del que salió— y se compara
 * con una referencia aprobada. Rasterizarlo importa: entre el SVG y el papel está
 * svg2pdf, que es justamente donde han aparecido los fallos más caros de este proyecto
 * (el texto en Times, los halos sin `paint-order`, el interletraje). Un control que
 * mirara el SVG los habría dado todos por buenos.
 *
 * QUÉ SE GUARDA. No las imágenes: un A0 a 150 ppp son 35 megapíxeles y quince de esos
 * archivos no caben en un repositorio. Se guarda una FIRMA —el mapa reducido a una
 * rejilla de 64 × 64 grises— que ocupa unos kilobytes y cambia en cuanto algo se mueve
 * de sitio. Cuando una firma no cuadra, el control escribe la imagen completa y el mapa
 * de diferencias en `muestras/regresion/` para poder mirarlas.
 *
 * QUÉ TOLERA. Casi nada, y eso es deliberado. Entre dos ejecuciones idénticas la
 * diferencia medida es EXACTAMENTE cero en las quince muestras —el PDF es determinista
 * con fecha fija y el rasterizado también—, así que el margen que queda no es para el
 * ruido, que no existe, sino para un cambio de versión del navegador o de pdf.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../scripts/lib/comun.mjs';

/** Lado de la rejilla de la firma. 64 × 64 = 4096 celdas por lámina. */
export const LADO_FIRMA = 64;

/** Resolución de rasterizado, en puntos por pulgada. */
export const PPP = 150;

/**
 * Tope de píxeles por lámina.
 *
 * Un A0 a 150 ppp son 4967 × 7020 píxeles: Chromium los aguanta, pero tarda medio
 * minuto y se come un giga. Como lo que se compara es una rejilla de 64 × 64, cualquier
 * resolución muy por encima de eso es trabajo tirado; se rasteriza a 150 ppp salvo que
 * la lámina pase de este tope, y entonces se reduce proporcionalmente. El informe dice
 * a qué resolución salió cada una.
 */
export const MAXIMO_PIXELES = 12e6;

/**
 * Tolerancias, medidas y no supuestas.
 *
 * El primer intento las puso generosas —media 1,2, celda 24— por miedo al ruido del
 * antialiasing. Con esos números, cambiar el azul del mar de #d9f1ff a #d4eeff pasaba
 * el control: un cambio de color en un tercio de la lámina daba una media de 0,5 y el
 * umbral era del doble. Un control que no ve eso no sirve para nada.
 *
 * Medido: el ruido entre dos ejecuciones idénticas es EXACTAMENTE cero en las quince
 * muestras, porque el PDF es determinista con fecha fija y el rasterizado también. Así
 * que el margen no es para el ruido, que no existe, sino para un cambio de versión del
 * navegador o de pdf.js; y si eso pasa, lo correcto es volver a aprobar las referencias,
 * no ensanchar el umbral. Con estos números el cambio del mar se detecta.
 */
export const TOLERANCIA_MEDIA = 0.15;

/** Diferencia máxima tolerada en una sola celda. */
export const TOLERANCIA_CELDA = 6;

const CARPETA = path.join(RAIZ, 'tests', 'referencias');
const ARCHIVO = path.join(CARPETA, 'firmas.json');

export const leerReferencias = () => (fs.existsSync(ARCHIVO)
  ? JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) : { version: 1, firmas: {} });

/**
 * Rasteriza un PDF en el navegador y devuelve su firma.
 *
 * Se hace en la página y no en Node porque rasterizar necesita un lienzo, y el único
 * que este proyecto ya tiene es el de Chromium. pdf.js se inyecta desde node_modules,
 * así que no hace falta servirlo ni hay problema de origen cruzado.
 */
export async function firmarPdf(pagina, rutaPdf) {
  const datos = fs.readFileSync(rutaPdf);
  return pagina.evaluate(async ({ base64, lado, ppp, maxPixeles }) => {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

    const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const hoja = await doc.getPage(1);

    const base = hoja.getViewport({ scale: 1 });
    let escala = ppp / 72;
    const pixeles = base.width * escala * (base.height * escala);
    if (pixeles > maxPixeles) escala *= Math.sqrt(maxPixeles / pixeles);

    const vista = hoja.getViewport({ scale: escala });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await hoja.render({ canvasContext: ctx, viewport: vista }).promise;

    /* La firma se calcula promediando cada celda entera, no muestreando un píxel: un
       muestreo se desplazaría con el antialiasing y daría falsos positivos. */
    const datosImagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    const firma = new Array(lado * lado).fill(0);
    const cuenta = new Array(lado * lado).fill(0);
    for (let y = 0; y < lienzo.height; y++) {
      const fila = Math.min(lado - 1, Math.floor((y / lienzo.height) * lado));
      for (let x = 0; x < lienzo.width; x++) {
        const col = Math.min(lado - 1, Math.floor((x / lienzo.width) * lado));
        const i = (y * lienzo.width + x) * 4;
        // Luminancia perceptual: un cambio de color que no cambia el gris no se ve.
        const gris = 0.299 * datosImagen[i] + 0.587 * datosImagen[i + 1] + 0.114 * datosImagen[i + 2];
        const k = fila * lado + col;
        firma[k] += gris;
        cuenta[k]++;
      }
    }
    for (let k = 0; k < firma.length; k++) firma[k] = Math.round(firma[k] / Math.max(1, cuenta[k]));

    return {
      anchoPx: lienzo.width,
      altoPx: lienzo.height,
      pppReal: Number(((lienzo.width / base.width) * 72).toFixed(1)),
      firma,
    };
  }, {
    base64: datos.toString('base64'),
    lado: LADO_FIRMA,
    ppp: PPP,
    maxPixeles: MAXIMO_PIXELES,
  });
}

/** Compara dos firmas y devuelve en qué se diferencian. */
export function compararFirmas(referencia, actual) {
  if (!referencia || referencia.length !== actual.length) {
    return { comparable: false, media: Infinity, maxima: Infinity, celdas: 0 };
  }
  let suma = 0;
  let maxima = 0;
  let celdas = 0;
  for (let i = 0; i < actual.length; i++) {
    const d = Math.abs(actual[i] - referencia[i]);
    suma += d;
    if (d > maxima) maxima = d;
    if (d > TOLERANCIA_CELDA) celdas++;
  }
  return {
    comparable: true,
    media: suma / actual.length,
    maxima,
    celdas,
    pasa: suma / actual.length <= TOLERANCIA_MEDIA && maxima <= TOLERANCIA_CELDA,
  };
}

/** Guarda el conjunto de firmas aprobadas. */
export function escribirReferencias(firmas, meta) {
  fs.mkdirSync(CARPETA, { recursive: true });
  const contenido = {
    version: 1,
    generado: new Date().toISOString().slice(0, 10),
    datosTag: meta.datosTag,
    lado: LADO_FIRMA,
    ppp: PPP,
    /* Se guarda para qué versión de los datos se aprobaron: si cambia DATOS_TAG, las
       diferencias son esperables y hay que volver a aprobarlas, no investigarlas. */
    firmas,
  };
  fs.writeFileSync(ARCHIVO, `${JSON.stringify(contenido, null, 1)}\n`);
  return ARCHIVO;
}

/**
 * Escribe la lámina y el mapa de diferencias de una muestra que no cuadra.
 *
 * Sin esto, «la firma de nacional_A1_vertical cambió» no dice nada accionable: hay que
 * poder mirar QUÉ cambió, y dónde.
 */
export async function escribirDiferencia({ pagina, rutaPdf, nombre, referencia, destino }) {
  fs.mkdirSync(destino, { recursive: true });
  const png = await pagina.evaluate(async ({ base64, ref, lado, umbralCelda }) => {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const hoja = await doc.getPage(1);
    const base = hoja.getViewport({ scale: 1 });
    // Ancho fijo: lo que se quiere es mirar la lámina, no medirla al píxel.
    const escala = 900 / base.width;
    const vista = hoja.getViewport({ scale: escala });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await hoja.render({ canvasContext: ctx, viewport: vista }).promise;

    /* Encima, en rojo translúcido, las celdas de la rejilla que se salen de la
       tolerancia: así se ve de un vistazo en qué parte de la lámina está el cambio. */
    if (ref) {
      const anchoCelda = lienzo.width / lado;
      const altoCelda = lienzo.height / lado;
      const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
      ctx.fillStyle = 'rgba(236, 28, 36, 0.45)';
      for (let f = 0; f < lado; f++) {
        for (let c = 0; c < lado; c++) {
          let suma = 0; let n = 0;
          const y0 = Math.floor(f * altoCelda); const y1 = Math.floor((f + 1) * altoCelda);
          const x0 = Math.floor(c * anchoCelda); const x1 = Math.floor((c + 1) * anchoCelda);
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * lienzo.width + x) * 4;
              suma += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
              n++;
            }
          }
          const actual = suma / Math.max(1, n);
          if (Math.abs(actual - ref[f * lado + c]) > umbralCelda) {
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          }
        }
      }
    }
    return lienzo.toDataURL('image/png').split(',')[1];
  }, {
    base64: fs.readFileSync(rutaPdf).toString('base64'),
    ref: referencia || null,
    lado: LADO_FIRMA,
    umbralCelda: TOLERANCIA_CELDA,
  });

  const salida = path.join(destino, `${nombre}.png`);
  fs.writeFileSync(salida, Buffer.from(png, 'base64'));
  return salida;
}

/**
 * Inyecta pdf.js en una página en blanco, sin servidor ni origen cruzado.
 *
 * El worker se pasa como TEXTO y se convierte en un blob dentro de la página. Apuntar
 * `workerSrc` al archivo de node_modules no funciona: desde `about:blank` el navegador
 * no puede importar un módulo por `file://`, y pdf.js cae entonces en su worker falso,
 * que tampoco carga. Con el blob, el worker es del mismo origen que la página.
 */
export async function prepararRenderizador(pagina) {
  const base = path.join(RAIZ, 'node_modules', 'pdfjs-dist', 'build');
  await pagina.goto('about:blank');
  await pagina.addScriptTag({ path: path.join(base, 'pdf.min.mjs'), type: 'module' });
  const fuenteWorker = fs.readFileSync(path.join(base, 'pdf.worker.min.mjs'), 'utf8');
  await pagina.evaluate((fuente) => {
    window.pdfjsLib = window.pdfjsLib || globalThis.pdfjsLib;
    const blob = new Blob([fuente], { type: 'text/javascript' });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  }, fuenteWorker);
}
