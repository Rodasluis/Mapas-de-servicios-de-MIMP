/**
 * Genera los PDF de muestra sin interfaz y los verifica.
 *
 * Se apoya en un Chromium sin ventana en lugar de componer el PDF en Node a propósito:
 * svg2pdf mide el texto con el motor de tipografía del navegador, y cualquier emulación
 * daría posiciones distintas. Pasando por el navegador, el PDF de estas muestras y el
 * que descargue un usuario desde la web salen del mismo código y del mismo medidor,
 * que es lo que la Fase 5 tendrá que demostrar.
 *
 * Uso:  npm run muestras            · todas las muestras
 *       npm run muestras -- --fecha=2026-09-23   · fecha fija (salida reproducible)
 */
import fs from 'node:fs';
import path from 'node:path';
import { preview, build } from 'vite';
import { chromium } from 'playwright';
import { RAIZ, abortar, titulo, peso, asegurarCarpeta } from './lib/comun.mjs';
import { verificarArchivo, ptAmm } from '../tests/verificar-pdf.mjs';

const DESTINO = path.join(RAIZ, 'muestras');
const PUERTO = 4180;

const argumentos = process.argv.slice(2);
const opcion = (nombre) => {
  const a = argumentos.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : undefined;
};
const fechaFija = opcion('fecha');

/** Las muestras que pide la Fase 1: el país entero en tres formatos verticales. */
const MUESTRAS = [
  { nombre: 'nacional_A4_vertical', hoja: { tamano: 'A4', orientacion: 'vertical' } },
  { nombre: 'nacional_A3_vertical', hoja: { tamano: 'A3', orientacion: 'vertical' } },
  { nombre: 'nacional_A0_vertical', hoja: { tamano: 'A0', orientacion: 'vertical' } },
];

/* ---------------------------- sitio y navegador ------------------------- */

if (!fs.existsSync(path.join(RAIZ, 'dist', 'muestras.html')) || argumentos.includes('--construir')) {
  titulo('Construyendo el sitio');
  await build({ logLevel: 'warn' });
}

const servidor = await preview({
  preview: { port: PUERTO, strictPort: true, open: false },
  logLevel: 'error',
});
const urlBase = servidor.resolvedUrls.local[0];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

/* Sin esto, un error dentro de la página se manifestaría como una espera infinita. */
const erroresPagina = [];
pagina.on('pageerror', (err) => erroresPagina.push(err.message));
pagina.on('console', (msg) => {
  if (msg.type() === 'error') erroresPagina.push(msg.text());
});

await pagina.goto(new URL('muestras.html', urlBase).href, { waitUntil: 'networkidle' });
await pagina.waitForFunction(() => typeof window.generarMapa === 'function', { timeout: 30000 });

/* -------------------------------- generación ---------------------------- */

titulo(`Generando ${MUESTRAS.length} muestras`);
asegurarCarpeta(DESTINO);

const resultados = [];
for (const muestra of MUESTRAS) {
  process.stdout.write(`  · ${muestra.nombre} … `);
  const t0 = Date.now();
  let salida;
  try {
    salida = await pagina.evaluate((cfg) => window.generarMapa(cfg), {
      hoja: muestra.hoja,
      fecha: fechaFija,
    });
  } catch (err) {
    console.log('ERROR');
    await cerrar();
    abortar(`Falló la generación de ${muestra.nombre}.`, `${err.message}\n${erroresPagina.join('\n')}`);
  }
  const msTotalNode = Date.now() - t0;

  const archivo = path.join(DESTINO, `${muestra.nombre}.pdf`);
  fs.writeFileSync(archivo, Buffer.from(salida.pdf, 'base64'));
  const verificacion = verificarArchivo(archivo);
  resultados.push({ muestra, salida, verificacion, msTotalNode });
  console.log(`${peso(verificacion.bytes)} en ${(msTotalNode / 1000).toFixed(1)} s`);
}

await cerrar();

async function cerrar() {
  await navegador.close().catch(() => {});
  await servidor.close().catch(() => {});
}

/* --------------------------------- informe ------------------------------ */

titulo('Muestras generadas');
const columnas = ['hoja', 'nivel', 'escala', 'var.', 'SVG', 'PDF', 'compos.', 'PDF ms', 'total'];
console.log(`  ${columnas[0].padEnd(16)}${columnas[1].padEnd(7)}${columnas[2].padStart(12)}`
  + `${columnas[3].padStart(7)}${columnas[4].padStart(9)}${columnas[5].padStart(9)}`
  + `${columnas[6].padStart(9)}${columnas[7].padStart(8)}${columnas[8].padStart(8)}`);
for (const { muestra, salida, verificacion } of resultados) {
  const m = salida.meta;
  console.log(
    `  ${m.hoja.padEnd(16)}${m.nivel.padEnd(7)}${m.escala.padStart(12)}`
    + `${`${m.variacionEscalaPct}%`.padStart(7)}`
    + `${peso(salida.bytesSvg).padStart(9)}${peso(verificacion.bytes).padStart(9)}`
    + `${`${m.msComposicion} ms`.padStart(9)}${`${m.msPdf}`.padStart(8)}`
    + `${`${((m.msComposicion + m.msPdf) / 1000).toFixed(1)} s`.padStart(8)}`,
  );
}

titulo('Verificación de los PDF');
let fallos = 0;
for (const { muestra, verificacion: v } of resultados) {
  const medidas = v.medidasPt.map(([w, h]) => `${ptAmm(w)}×${ptAmm(h)} mm`).join(', ');
  console.log(`  ${muestra.nombre}`);
  console.log(`    ${v.paginas} página ${medidas}`);
  console.log(`    imágenes raster: ${v.imagenes}${v.imagenes === 0 ? '  ✓' : '  ✗'}`);
  console.log(`    tipografías incrustadas: ${v.totalIncrustadas} · ${v.fuentes.join(', ')}`);
  for (const p of v.problemas) { console.log(`    ✗ ${p}`); fallos++; }
}

const totalBytes = resultados.reduce((s, r) => s + r.verificacion.bytes, 0);
console.log(`\n  ${resultados.length} archivos en muestras/ (${peso(totalBytes)})`);
if (fechaFija) console.log(`  fecha fija ${fechaFija}: la salida es reproducible byte a byte`);

if (fallos) abortar(`${fallos} problema(s) en los PDF generados.`);
console.log('\n✓ Muestras generadas y verificadas.\n');
