/**
 * Control de calidad: lo que hay que poder afirmar antes de publicar.
 *
 * `npm run muestras` ya comprueba lo que se puede medir mientras se compone —totales,
 * superposiciones, escala, vectorialidad—. Aquí se añade lo que sólo se ve mirando el
 * ARCHIVO terminado:
 *
 *   1. que el dibujo no ha cambiado sin que nadie lo decidiera (regresión visual);
 *   2. que ninguna lámina lleva una imagen de mapa de bits;
 *   3. que los tiempos de generación siguen dentro del presupuesto.
 *
 * Uso:  npm run qa                 · comprueba contra las referencias aprobadas
 *       npm run qa -- --aprobar    · aprueba el estado actual como referencia nueva
 *       npm run qa -- --generar    · regenera las muestras antes de comprobar
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { RAIZ, abortar, titulo, peso } from './lib/comun.mjs';
import { verificarArchivo } from '../tests/verificar-pdf.mjs';
import {
  prepararRenderizador, firmarPdf, compararFirmas, leerReferencias, escribirReferencias,
  escribirDiferencia, LADO_FIRMA, PPP, TOLERANCIA_MEDIA, TOLERANCIA_CELDA,
} from '../tests/regresion-visual.mjs';

const MUESTRAS = path.join(RAIZ, 'muestras');
const INFORME = path.join(MUESTRAS, 'informe.json');
const DIFERENCIAS = path.join(MUESTRAS, 'regresion');

const argumentos = process.argv.slice(2);
const aprobar = argumentos.includes('--aprobar');
const generar = argumentos.includes('--generar') || !fs.existsSync(INFORME);

/**
 * Presupuesto de generación de la lámina más pesada.
 *
 * El nacional en A0 es el caso extremo: el país entero al nivel de detalle más fino,
 * con cuatro recuadros que redibujan su entorno. Si se pasa de aquí, el control no
 * falla —el PDF sale bien— pero lo dice, porque una espera de medio minuto en la web
 * se percibe como que la aplicación se ha colgado.
 */
const PRESUPUESTO_MS = 20000;

if (generar) {
  titulo('Generando las muestras');
  /* Con fecha fija: la regresión visual compara dibujos, y el pie con la fecha del día
     cambiaría la firma cada mañana por algo que no es un cambio del mapa. */
  execFileSync('node', [path.join(RAIZ, 'scripts', 'muestras.mjs'), '--fecha=2026-01-01'], {
    stdio: 'inherit',
    cwd: RAIZ,
  });
}

const informe = JSON.parse(fs.readFileSync(INFORME, 'utf8'));

/* --------------------------- 1. regresión visual ------------------------ */

titulo(`Regresión visual (${PPP} ppp, firma de ${LADO_FIRMA}×${LADO_FIRMA})`);

const referencias = leerReferencias();
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const erroresPagina = [];
pagina.on('pageerror', (e) => erroresPagina.push(e.message));
await prepararRenderizador(pagina);

const firmas = {};
const fallosVisuales = [];
const nuevas = [];

for (const m of informe.muestras) {
  const rutaPdf = path.join(MUESTRAS, `${m.nombre}.pdf`);
  if (!fs.existsSync(rutaPdf)) {
    fallosVisuales.push({ nombre: m.nombre, motivo: 'el PDF no existe' });
    continue;
  }
  process.stdout.write(`  · ${m.nombre.padEnd(32)}`);
  const { firma, anchoPx, altoPx, pppReal } = await firmarPdf(pagina, rutaPdf);
  firmas[m.nombre] = firma;

  const previa = referencias.firmas?.[m.nombre];
  const c = compararFirmas(previa, firma);
  const medidas = `${anchoPx}×${altoPx} px a ${pppReal} ppp`;

  if (!previa) {
    nuevas.push(m.nombre);
    console.log(`${medidas}  · sin referencia`);
  } else if (c.pasa) {
    console.log(`${medidas}  · media ${c.media.toFixed(2)}  ✓`);
  } else {
    console.log(`${medidas}  · media ${c.media.toFixed(2)}, máx ${c.maxima}, `
      + `${c.celdas} celda(s) fuera de tolerancia  ✗`);
    const imagen = await escribirDiferencia({
      pagina, rutaPdf, nombre: m.nombre, referencia: previa, destino: DIFERENCIAS,
    });
    fallosVisuales.push({
      nombre: m.nombre,
      motivo: `media ${c.media.toFixed(2)} (tolerada ${TOLERANCIA_MEDIA}),`
        + ` máxima ${c.maxima} (tolerada ${TOLERANCIA_CELDA})`,
      imagen: path.relative(RAIZ, imagen),
    });
  }
}

await navegador.close();

if (aprobar) {
  const archivo = escribirReferencias(firmas, { datosTag: informe.datosTag });
  console.log(`\n  ✓ ${Object.keys(firmas).length} firmas aprobadas en ${path.relative(RAIZ, archivo)}`);
  console.log('    Revisa el diff antes de confirmarlo: aprobar una regresión la vuelve invisible.');
} else if (nuevas.length) {
  console.log(`\n  ! ${nuevas.length} muestra(s) sin referencia: ${nuevas.join(', ')}.`);
  console.log('    Míralas y, si son correctas, apruébalas con «npm run qa -- --aprobar».');
}
if (referencias.datosTag && informe.datosTag && referencias.datosTag !== informe.datosTag) {
  console.log(`\n  ! Las referencias se aprobaron con DATOS_TAG ${referencias.datosTag}`
    + ` y estas muestras son de ${informe.datosTag}: las diferencias son esperables.`);
}

/* ------------------------- 2. nada de mapas de bits --------------------- */

titulo('Vectorialidad de los PDF');
let fallosRaster = 0;
for (const m of informe.muestras) {
  const v = verificarArchivo(path.join(MUESTRAS, `${m.nombre}.pdf`));
  const ok = v.imagenes === 0 && v.problemas.length === 0;
  if (!ok) {
    fallosRaster++;
    console.log(`  ✗ ${m.nombre}: ${v.imagenes} imagen(es)`
      + `${v.problemas.length ? `, ${v.problemas.join('; ')}` : ''}`);
  }
}
if (!fallosRaster) {
  console.log(`  ✓ las ${informe.muestras.length} láminas son 100 % vectoriales`
    + ' y llevan sus tipografías incrustadas');
}

/* --------------------------- 3. rendimiento ----------------------------- */

titulo('Rendimiento por ámbito y formato');
console.log(`  ${'muestra'.padEnd(32)}${'hoja'.padStart(14)}${'compos.'.padStart(10)}`
  + `${'PDF'.padStart(9)}${'total'.padStart(9)}${'peso'.padStart(9)}`);

const lentas = [];
for (const m of [...informe.muestras].sort((a, b) => b.msTotal - a.msTotal)) {
  const total = m.msTotal / 1000;
  if (total * 1000 > PRESUPUESTO_MS) lentas.push(m);
  console.log(`  ${m.nombre.padEnd(32)}${m.hoja.padStart(14)}`
    + `${`${m.msComposicion} ms`.padStart(10)}${`${m.msPdf} ms`.padStart(9)}`
    + `${`${total.toFixed(1)} s`.padStart(9)}${peso(m.bytesPdf).padStart(9)}`
    + `${total * 1000 > PRESUPUESTO_MS ? '  ✗' : ''}`);
}

if (lentas.length) {
  console.log(`\n  ! ${lentas.length} lámina(s) pasan del presupuesto de`
    + ` ${PRESUPUESTO_MS / 1000} s. Por dónde se puede recortar:`);
  console.log('    · el coste está repartido entre componer y exportar, y los dos crecen');
  console.log('      con el número de trazados: en A0 el mapa va al nivel de detalle más');
  console.log('      fino y cada recuadro redibuja su entorno.');
  console.log('    · rebajar el máximo de recuadros en A0 de cuatro a tres quita una');
  console.log('      cuarta parte del entorno redibujado (maximoPorFormato, en zoom.js).');
  console.log('    · el entorno de un recuadro podría dibujarse con el nivel medio: no se');
  console.log('      distingue a esa escala, pero hay que comprobar que no abra hilos');
  console.log('      blancos en los límites compartidos con la zona ampliada.');
  console.log('    · la interfaz ya avisa mientras compone, así que el coste real es la');
  console.log('      espera percibida, no un fallo: ninguna lámina sale mal por esto.');
}

/* ------------------------------- veredicto ------------------------------ */

titulo('Resultado');
const problemas = fallosVisuales.length + fallosRaster;
for (const f of fallosVisuales) {
  console.log(`  ✗ ${f.nombre}: ${f.motivo}`);
  if (f.imagen) console.log(`      mira ${f.imagen} (en rojo, las celdas que cambiaron)`);
}
if (erroresPagina.length) {
  console.log(`  ! errores del renderizador: ${erroresPagina.slice(0, 3).join(' | ')}`);
}

if (problemas) {
  abortar(`${problemas} problema(s) de control de calidad.`);
}
console.log(`  ✓ sin regresiones visuales, sin mapas de bits`
  + `${lentas.length ? `, ${lentas.length} lámina(s) por encima del presupuesto` : ''}.`);
console.log('');
