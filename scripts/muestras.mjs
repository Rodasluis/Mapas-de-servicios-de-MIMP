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

/**
 * Muestras. La Fase 1 pedía los tres formatos verticales; la Fase 2 añade A4 y A0
 * apaisados, que es donde se comprueba que el layout se recoloca de verdad y no
 * está clavado a una plantilla vertical.
 */
const MUESTRAS = [
  { nombre: 'nacional_A4_vertical', hoja: { tamano: 'A4', orientacion: 'vertical' } },
  /* El A1 vertical es el formato del mapa de 2020: es la muestra que se pone al lado
     de la referencia para comparar. */
  { nombre: 'nacional_A1_vertical', hoja: { tamano: 'A1', orientacion: 'vertical' } },
  { nombre: 'nacional_A4_horizontal', hoja: { tamano: 'A4', orientacion: 'horizontal' } },
  { nombre: 'nacional_A3_vertical', hoja: { tamano: 'A3', orientacion: 'vertical' } },
  { nombre: 'nacional_A0_vertical', hoja: { tamano: 'A0', orientacion: 'vertical' } },
  { nombre: 'nacional_A0_horizontal', hoja: { tamano: 'A0', orientacion: 'horizontal' } },
  /* Con un solo tipo activo se comprueba que el filtro llega hasta el final: el
     coropletas se recalcula, la leyenda pierde las diecinueve entradas que sobran y
     las clases altas desaparecen porque ninguna provincia llega a ellas. */
  /* Zoom elegido a mano: Lima y Callao son vecinas, así que se fusionan en un solo
     recuadro. Áncash entero (20 provincias) pasa raspando el límite; con él se
     comprueba de paso el aviso de «zona demasiado grande». */
  {
    nombre: 'nacional_A2_zoom_manual',
    hoja: { tamano: 'A2', orientacion: 'vertical' },
    opciones: { zoom: { modo: 'manual', seleccion: ['1501', '0701', '02'] } },
    textos: { subtitulo: 'Recuadros elegidos: Lima, Callao y Áncash' },
  },
  {
    nombre: 'nacional_A2_solo_CEM',
    hoja: { tamano: 'A2', orientacion: 'vertical' },
    opciones: { tipos: ['Centro Emergencia Mujer y Familia'] },
    textos: { subtitulo: 'Centros Emergencia Mujer y Familia' },
  },
];

const TEXTOS = {
  titulo: 'Ubicación de los servicios que brinda el MIMP',
  subtitulo: 'Ámbito nacional',
  periodo: 'Enero – Diciembre 2026',
};

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

/* svg2pdf coloca el texto con lo que mide el NAVEGADOR, no con las métricas del TTF
   que incrusta jsPDF. Si las dos no coinciden, todo lo centrado o alineado a la
   derecha sale corrido en el PDF. Se comprueba antes de generar nada. */
titulo('Métricas: TTF frente a navegador');
const metricas = await pagina.evaluate(() => window.comprobarMetricas());
let desvioMaximo = 0;
const sinCargar = [];
for (const m of metricas) {
  desvioMaximo = Math.max(desvioMaximo, Math.abs(m.desvioPct));
  console.log(`  ${m.familia.padEnd(22)} ${m.texto.padEnd(24)}`
    + `TTF ${String(m.metricasMm).padStart(7)} · navegador ${String(m.navegadorMm).padStart(7)} mm`
    + ` · ${m.desvioPct >= 0 ? '+' : ''}${String(m.desvioPct).padStart(5)} %`
    + `   (reserva ${m.desvioReservaPct >= 0 ? '+' : ''}${m.desvioReservaPct} %)`);
  // Si la medida buena coincide con la de reserva, la fuente nunca llegó a cargarse.
  if (Math.abs(m.desvioPct - m.desvioReservaPct) < 0.5) sinCargar.push(m.familia);
}
if (sinCargar.length) {
  await cerrar();
  abortar(
    `El navegador no cargó ${sinCargar.join(', ')}: mide con su tipografía de reserva.`,
    'Revisa que src/estilo/fuentes.css declare las ocho variantes y que se espere a document.fonts.',
  );
}
/* Queda un desvío pequeño y esperado: al medir, el navegador aplica el interletraje
   de pares (kerning) y jsPDF no lo aplica al componer. Las métricas del TTF, que
   tampoco lo aplican, son por tanto las que predicen la anchura REAL del PDF, y por
   eso las cajas se dimensionan con ellas. Un desvío grande sí delataría otra fuente. */
const LIMITE_KERNING = 3;
if (desvioMaximo > LIMITE_KERNING) {
  await cerrar();
  abortar(
    `El navegador mide el texto un ${desvioMaximo.toFixed(2)} % distinto que el TTF incrustado.`,
    'Más de lo que explica el interletraje: probablemente no es la misma tipografía.',
  );
}
console.log(`  ✓ desvío máximo ${desvioMaximo.toFixed(2)} % (interletraje). Con la tipografía de`
  + ` reserva el desvío llegaría al ${Math.max(...metricas.map((m) => Math.abs(m.desvioReservaPct))).toFixed(1)} %,`
  + ' así que las familias correctas están cargadas');

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
      textos: { ...TEXTOS, ...(muestra.textos || {}) },
      opciones: muestra.opciones,
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

/* Hoja de íconos: es a la vez documentación de la correspondencia tipo → pictograma y
   la comprobación de que a 3 mm siguen distinguiéndose unos de otros. */
process.stdout.write('  · iconos … ');
const hojaIconos = await pagina.evaluate((cfg) => window.generarHojaIconos(cfg), { fecha: fechaFija });
fs.writeFileSync(path.join(DESTINO, 'iconos.pdf'), Buffer.from(hojaIconos.pdf, 'base64'));
console.log(peso(fs.statSync(path.join(DESTINO, 'iconos.pdf')).size));

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

/* ----------------------- comprobaciones de la Fase 2 -------------------- */

/* ------------------- integridad de la capa temática --------------------- */

titulo('Servicios: totales dibujados frente a los datos');
let fallosDatos = 0;
{
  const centros = JSON.parse(fs.readFileSync(path.join(RAIZ, 'public', 'data', 'centros.json'), 'utf8'));
  const esperado = new Map();
  for (const c of centros.centros) esperado.set(c.tipo, (esperado.get(c.tipo) || 0) + 1);

  for (const { muestra, salida } of resultados) {
    const s2 = salida.meta.servicios;
    if (s2.filtro) {
      /* Con filtro, lo que tiene que cuadrar es el subconjunto: los tipos dibujados
         son exactamente los pedidos y sus totales son los de centros.json. */
      const malos = s2.tipos.filter((t) => esperado.get(t.tipo) !== t.n
        || !s2.filtro.includes(t.tipo));
      console.log(`  ${muestra.nombre.padEnd(24)} filtro de ${s2.filtro.length} tipo(s)`
        + ` → ${s2.totalDibujado} centros, ${s2.provinciasConServicio} provincias`
        + ` · clases: ${s2.clasesUsadas.join(' / ')}${malos.length ? '  ✗' : '  ✓'}`);
      for (const t of malos) { console.log(`    ✗ ${t.tipo}: ${t.n}`); fallosDatos++; }
      continue;
    }
    const desajustes = [];
    for (const { tipo, n } of s2.tipos) {
      if (esperado.get(tipo) !== n) desajustes.push(`${tipo}: ${n} ≠ ${esperado.get(tipo) ?? 0}`);
    }
    for (const [tipo, n] of esperado) {
      if (!s2.tipos.some((t) => t.tipo === tipo)) desajustes.push(`${tipo}: falta (${n} en los datos)`);
    }
    const totalOk = s2.totalDibujado === centros.centros.length;
    console.log(`  ${muestra.nombre.padEnd(24)} ${s2.totalDibujado} centros en ${s2.tipos.length} tipos`
      + ` · ${s2.provinciasConServicio} provincias con servicio`
      + `${totalOk && !desajustes.length ? '  ✓' : '  ✗'}`);
    if (!totalOk) {
      console.log(`    ✗ total ${s2.totalDibujado} ≠ ${centros.centros.length} de centros.json`);
      fallosDatos++;
    }
    for (const d of desajustes) { console.log(`    ✗ ${d}`); fallosDatos++; }
  }
  if (!fallosDatos) {
    console.log(`  ✓ los ${centros.centros.length} centros y los ${esperado.size} tipos cuadran con centros.json`);
  }
}

titulo('Símbolos: apiñamiento por provincia');
for (const { muestra, salida } of resultados) {
  const s3 = salida.meta.servicios;
  console.log(`  ${muestra.nombre.padEnd(24)} ícono ${s3.tamanoIconoMm} mm`
    + ` · apiñamiento máx ${s3.apinamientoMaximoPct} %`
    + ` · ${s3.gruposApinados.length} provincia(s) por encima del umbral`);
  if (s3.gruposApinados.length) {
    console.log(`    ${s3.gruposApinados.slice(0, 6).map((g) => `${g.nombre} ${g.apinamientoPct}%`).join(', ')}`
      + `${s3.gruposApinados.length > 6 ? ', …' : ''}`);
  }
  const cap = s3.capacidadRecuadros;
  console.log(`    recuadros: ${s3.recuadros.length
    ? s3.recuadros.map((z) => `${z.etiqueta} ${z.anchoMm}×${z.altoMm} mm (${z.provincias} prov.)`).join(' · ')
    : 'ninguno'}`);
  console.log(`    capacidad: ${cap.colocados} de ${cap.tope} permitidos en esta hoja`
    + `${cap.cabeOtro ? ' · aún cabría otro' : ' · sin hueco para más'}`);
  for (const a of s3.avisosRecuadros || []) console.log(`    ! ${a}`);
}

titulo('Layout: solapamientos y escala gráfica');
let fallosLayout = 0;
for (const { muestra, salida } of resultados) {
  const { layout, escalaGrafica, grilla, rotulos } = salida.meta;
  console.log(`  ${muestra.nombre}`);
  console.log(`    piezas: ${layout.colocadas.map((p) => `${p.nombre}@${p.anclaje}`).join(', ') || 'ninguna'}`);
  const ley = layout.colocadas.find((p) => p.nombre === 'leyenda');
  if (ley) {
    console.log(`    leyenda: ${ley.ancho}×${ley.alto} mm en ${ley.anclaje}`
      + ` · tapa ${ley.territorioTapadoPct} % de su caja`);
  }
  const t = salida.meta.titulo;
  console.log(`    título: cuerpo al ${Math.round(t.reduccion * 100)} % en ${t.lineas} líneas`
    + `, tapa ${t.tapadoMm2} mm² (${t.tapadoPct} % de su caja)`);

  /* Ningún bloque puede montarse sobre otro: es el criterio de aceptación de la fase.
     Se comprueba con los rectángulos que el propio motor reservó, que son los mismos
     con los que dibujó. */
  const solapes = [];
  for (let i = 0; i < layout.colocadas.length; i++) {
    for (let j = i + 1; j < layout.colocadas.length; j++) {
      const a = layout.colocadas[i]; const b = layout.colocadas[j];
      if (!(a.x + a.ancho <= b.x || b.x + b.ancho <= a.x
        || a.y + a.alto <= b.y || b.y + b.alto <= a.y)) {
        solapes.push(`${a.nombre} × ${b.nombre}`);
      }
    }
  }
  console.log(`    solapamientos: ${solapes.length ? solapes.join(', ') : '0  ✓'}`);
  if (solapes.length) fallosLayout++;

  const tapado = layout.colocadas.filter((p) => p.territorioTapadoPct > 2);
  console.log(`    sobre territorio peruano: ${tapado.length
    ? tapado.map((p) => `${p.nombre} ${p.territorioTapadoPct}%`).join(', ')
    : 'ninguna  ✓'}`);
  if (layout.omitidas.length) console.log(`    omitidas: ${layout.omitidas.join(', ')}`);
  if (layout.forzadas.length) {
    console.log(`    forzadas: ${layout.forzadas.map((f) => `${f.nombre} (${f.tapadoPct}%)`).join(', ')}`);
  }

  /* La barra dice N km: se comprueba invirtiendo sus extremos por la proyección. El
     margen admite la variación propia de la Mercator transversa entre el centro del
     marco y el punto donde acabó la barra. */
  if (escalaGrafica.comprobada) {
    const ok = Math.abs(escalaGrafica.errorPct) <= 1.5;
    console.log(`    escala gráfica: declara ${escalaGrafica.km} km, mide ${escalaGrafica.kmMedidos} km`
      + ` (${escalaGrafica.errorPct >= 0 ? '+' : ''}${escalaGrafica.errorPct} %)${ok ? '  ✓' : '  ✗'}`);
    if (!ok) fallosLayout++;
  } else {
    console.log('    escala gráfica: no se pudo comprobar  ✗');
    fallosLayout++;
  }

  console.log(`    retícula: paso ${(grilla.pasoM / 1000).toLocaleString('es-PE')} km,`
    + ` ${grilla.lineas} líneas, ${grilla.rotulos} números, curvatura máx ${grilla.curvaturaMaximaMm} mm`);
  console.log(`    rótulos: ${rotulos.colocados.join(', ') || 'ninguno'}`
    + `${rotulos.omitidos.length ? ` · omitidos: ${rotulos.omitidos.join(', ')}` : ''}`);
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

if (fallos || fallosLayout || fallosDatos) {
  abortar(`${fallos + fallosLayout + fallosDatos} problema(s) en las muestras generadas.`);
}
console.log('\n✓ Muestras generadas y verificadas.\n');
