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
import { buscarSolapes } from '../src/motor/colisiones.js';
import { ICONOS, VICEMINISTERIOS } from '../src/iconos/index.js';
import { comprobarWebIgualQueMuestras } from '../tests/web-igual-que-muestras.mjs';

const DESTINO = path.join(RAIZ, 'muestras');
const PUERTO = 4180;

const argumentos = process.argv.slice(2);
const opcion = (nombre) => {
  const a = argumentos.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : undefined;
};
const fechaFija = opcion('fecha');

/**
 * El recuadro con el que la web abre el mapa del país (src/ui/config.js,
 * zoomPorDefecto): Lima y Callao juntos, con sus íconos sólo ahí. Las muestras del país
 * que retratan lo que sale por omisión lo llevan; sin él el motor amplía en automático.
 */
const LIMA_Y_CALLAO = { modo: 'manual', seleccion: ['1501', '07'] };

/**
 * Muestras. La Fase 1 pedía los tres formatos verticales; la Fase 2 añade A4 y A0
 * horizontales, que es donde se comprueba que el layout se recoloca de verdad y no
 * está clavado a una plantilla vertical.
 */
const MUESTRAS = [
  {
    nombre: 'nacional_A4_vertical',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
  /* El A1 vertical es el formato del mapa de 2020: es la muestra que se pone al lado
     de la referencia para comparar. */
  {
    nombre: 'nacional_A1_vertical',
    hoja: { tamano: 'A1', orientacion: 'vertical' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
  {
    nombre: 'nacional_A4_horizontal',
    hoja: { tamano: 'A4', orientacion: 'horizontal' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
  {
    nombre: 'nacional_A3_vertical',
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
  {
    nombre: 'nacional_A0_vertical',
    hoja: { tamano: 'A0', orientacion: 'vertical' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
  /* Las dos horizontales grandes siguen con los recuadros automáticos: es donde caben
     varios y se comprueba cómo elige el motor qué ampliar. */
  {
    nombre: 'nacional_A0_horizontal',
    hoja: { tamano: 'A0', orientacion: 'horizontal' },
    opciones: { zoom: { modo: 'auto' } },
  },
  /* Fase 10. Los múltiplos del A0: el doble y el cuádruple de su área. Uno en cada
     orientación, para ver que el layout y el tope del ícono escalan más allá del A0. */
  {
    nombre: 'nacional_2A0_horizontal',
    hoja: { tamano: '2A0', orientacion: 'horizontal' },
    opciones: { zoom: { modo: 'auto' } },
  },
  {
    nombre: 'nacional_4A0_vertical',
    hoja: { tamano: '4A0', orientacion: 'vertical' },
    opciones: { zoom: LIMA_Y_CALLAO },
  },
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
    /* En automático: con un solo tipo los símbolos dejan de estorbarse y los
       recuadros tienen que desaparecer solos. */
    opciones: { tipos: ['Centro Emergencia Mujer y Familia'], zoom: { modo: 'auto' } },
    textos: { subtitulo: 'Centros Emergencia Mujer y Familia' },
  },

  /* Fase 6. Las cuatro muestras del criterio de aceptación, elegidas para cubrir los
     dos ámbitos nuevos en sus extremos: un departamento denso y uno disperso, y una
     provincia urbana llena de centros frente a una amazónica enorme con trece.

     Ninguna fija el subtítulo, para que se compruebe de paso que el que pone el motor
     describe el ámbito de verdad y no arrastra el «Ámbito nacional» de los demás. */
  {
    nombre: 'departamento_Lima_A1',
    ambito: '15',
    hoja: { tamano: 'A1', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  {
    nombre: 'departamento_Cusco_A3',
    ambito: '08',
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  /* Lima provincia: 134 centros sobre 43 distritos. Es el caso que pone a prueba el
     dibujo individual, porque varios comparten manzana. */
  {
    nombre: 'provincia_Lima_A2',
    ambito: '1501',
    hoja: { tamano: 'A2', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  /* Maynas: casi 120 000 km² y trece centros. El extremo contrario, y el que comprueba
     que un ámbito enorme y vacío se sigue leyendo. */
  {
    nombre: 'provincia_Maynas_A4',
    ambito: '1601',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },

  /* Fase 7. Los tres casos del criterio de aceptación, que son los tres extremos de la
     tabla: llena, con una sola fila, y vacía. */
  {
    nombre: 'distrito_Lima_A3',
    ambito: '150101',
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  {
    nombre: 'distrito_Apata_A4',
    ambito: '120403',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  /* Chicche no tiene ningún centro: el mapa se genera igual, dice que no hay ninguno y
     ofrece los seis más cercanos con su distancia en línea recta. */
  {
    nombre: 'distrito_Chicche_sin_centros_A4',
    ambito: '120106',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },

  /* Fase 9. Los dos tipos que publica este proyecto y el buscador no. El mapa nacional con sólo
     ellos comprueba íconos, colores y la nota de la leyenda; Carabayllo, que tiene un
     hogar de refugio, comprueba que en la tabla sale con asterisco, con la dirección
     que publica el directorio («No se registra por confidencialidad») y con el aviso
     de que el punto es el distrito y no la sede. */
  {
    nombre: 'nacional_A2_EC_y_HRT',
    hoja: { tamano: 'A2', orientacion: 'vertical' },
    opciones: { tipos: ['Educadores de Calle', 'Hogares de Refugio Temporal - HRT'], zoom: LIMA_Y_CALLAO },
    textos: { subtitulo: 'Educadores de Calle y Hogares de Refugio Temporal' },
  },
  /* Fase 20. Los íconos se disponen por omisión en rejilla, que sigue la forma de las
     unidades angostas; ésta guarda el anillo de QGIS, que sigue siendo una opción. */
  {
    nombre: 'nacional_A3_anillo',
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    opciones: { disposicion: 'anillo', zoom: LIMA_Y_CALLAO },
  },
  {
    nombre: 'distrito_Carabayllo_A4',
    ambito: '150106',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    textos: { subtitulo: undefined },
  },
  /* Fase 14. Lo que marca cada casilla de viceministerio de la interfaz: sus tipos,
     sacados del mismo catálogo que usa ella. */
  ...Object.entries(VICEMINISTERIOS).map(([vm, nombre]) => ({
    nombre: `nacional_A3_${vm}`,
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    opciones: {
      tipos: Object.keys(ICONOS).filter((t) => ICONOS[t].viceministerio === vm),
      zoom: LIMA_Y_CALLAO,
    },
    textos: { subtitulo: `Servicios del ${nombre}` },
  })),
  /* Fase 15. El nivel de división. El país por departamentos en la hoja más pequeña,
     que es donde esa lámina tiene sentido; por distritos en A1, la menor en la que se
     leen, con el color y los íconos por distrito; y Cusco por
     provincias, el mapa departamental sin distritos. */
  {
    nombre: 'nacional_A4_departamentos',
    hoja: { tamano: 'A4', orientacion: 'vertical' },
    opciones: { division: 'departamento' },
  },
  {
    nombre: 'nacional_A1_distritos',
    hoja: { tamano: 'A1', orientacion: 'vertical' },
    opciones: { division: 'distrito', zoom: LIMA_Y_CALLAO },
  },
  {
    nombre: 'departamento_Cusco_A3_provincias',
    ambito: '08',
    hoja: { tamano: 'A3', orientacion: 'vertical' },
    opciones: { division: 'provincia' },
    textos: { subtitulo: undefined },
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

/* Sin esto, un error dentro de la página se manifestaría como una espera infinita. */
const erroresPagina = [];

/** Abre una pestaña del banco de muestras, lista para generar. */
async function abrirPagina() {
  const p = await navegador.newPage();
  p.on('pageerror', (err) => erroresPagina.push(err.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error') erroresPagina.push(msg.text());
  });
  await p.goto(new URL('muestras.html', urlBase).href, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => typeof window.generarMapa === 'function', { timeout: 30000 });
  return p;
}

const pagina = await abrirPagina();

/* -------------------------------- generación ---------------------------- */

/* Las métricas del TTF son con las que el motor dimensiona cada caja Y con las que
   resuelve el centrado (ver anclar(), en motor/svg.js). Si no fueran las de la
   tipografía que se incrusta —otra versión de Poppins, metricas.json sin regenerar—,
   el layout entero mediría mal. Se comprueba antes de generar nada. */
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
   eso las cajas se dimensionan con ellas. Un desvío grande sí delataría otra fuente.

   El límite es un límite de verdad porque la medida se toma a un cuerpo cien veces
   mayor y se divide: al cuerpo real, el redondeo de avances de Chromium sobre Linux
   metía hasta un 24 % de ruido y el control no distinguía una fuente equivocada de
   una bien cargada. */
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
  /* Cada lámina en su propia pestaña, que se cierra al terminar. Generadas todas en la
     misma, la memoria se acumulaba de una a otra —la cartografía de cada nivel queda en
     caché— y en un equipo con poca memoria la pestaña moría en las A0, 2A0 o 4A0 sin
     avisar: el script se quedaba esperando para siempre. Cerrarla la libera, y si
     Playwright detecta que se cayó, se dice cuál en vez de seguir esperando (cuando el
     sistema la mata por falta de memoria puede no enterarse). Los PDF no cambian: cada
     pestaña compone desde cero lo mismo que componía la compartida. */
  const pestana = await abrirPagina();
  const caida = new Promise((_, rechazar) => {
    pestana.on('crash', () => rechazar(new Error(
      'la pestaña del navegador se cayó, casi seguro por falta de memoria',
    )));
  });
  // Que se caiga DESPUÉS de terminar no debe tumbar el proceso por un rechazo sin atender.
  caida.catch(() => {});
  const t0 = Date.now();
  let salida;
  let msTotalNode;
  try {
    salida = await Promise.race([caida, pestana.evaluate((cfg) => window.generarMapa(cfg), {
      hoja: muestra.hoja,
      ambito: muestra.ambito,
      /* La fecha fija va en los DOS sitios, igual que la pone la interfaz en
         aLlamadasDelMotor(): en `textos` porque de ahí sale la del pie, y suelta porque
         de ahí sale la de los metadatos del PDF. Pasándola sólo suelta, el pie seguía
         imprimiendo la fecha del día y la firma de regresión cambiaba cada mañana. */
      textos: { ...TEXTOS, ...(fechaFija ? { fecha: fechaFija } : {}), ...(muestra.textos || {}) },
      opciones: muestra.opciones,
      fecha: fechaFija,
    })]);
    msTotalNode = Date.now() - t0;
  } catch (err) {
    console.log('ERROR');
    await cerrar();
    abortar(`Falló la generación de ${muestra.nombre}.`, `${err.message}\n${erroresPagina.join('\n')}`);
  } finally {
    await pestana.close().catch(() => {});
  }

  /* Con --fecha, el pie tiene que imprimir ESA fecha. Si se quedara con la del día, la
     regresión visual fallaría cada mañana por una diferencia que no es del mapa, y el
     aviso saldría a los veinte minutos en la integración continua, no aquí.

     Se comprueba contra lo que se IMPRIME, reconstruido desde la cadena pedida. La
     primera versión comparaba el ISO en UTC, y así se le escapó que el pie imprimía
     «31/12/2025» en Lima y «01/01/2026» en el servidor de CI para la misma fecha fija:
     el ISO en UTC era idéntico en las dos máquinas, y el papel no. */
  const [anio, mes, dia] = fechaFija ? fechaFija.split('-') : [];
  const esperada = fechaFija ? `${dia}/${mes}/${anio}` : null;
  if (esperada && salida.meta.fechaPieImpresa !== esperada) {
    console.log('ERROR');
    await cerrar();
    abortar(
      `${muestra.nombre}: se pidió la fecha ${fechaFija} y el pie imprime`
      + ` ${salida.meta.fechaPieImpresa}, no ${esperada}.`,
      'La fecha fija va en `textos`, y el pie la formatea en el calendario del Perú.',
    );
  }

  const archivo = path.join(DESTINO, `${muestra.nombre}.pdf`);
  fs.writeFileSync(archivo, Buffer.from(salida.pdf, 'base64'));
  /* Escrito el archivo, el PDF ya no hace falta en memoria: los controles de abajo usan
     sólo el informe (meta). Guardar los 24 hasta el final eran más de cien megas que
     le faltaban al navegador para componer la 2A0 en un equipo justo de memoria. */
  salida.pdf = null;
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

/* ---------------- criterio de aceptación de la Fase 5 ------------------- */

/* El PDF que descarga un usuario desde la web tiene que ser IDÉNTICO al que sale de
   aquí con la misma configuración. Se conduce el navegador por la interfaz de verdad
   —abrir, esperar la vista previa, pulsar «Generar PDF»— y se comparan los bytes. */
titulo('La web frente a las muestras');
let fallosWeb = 0;
const { comparaciones, panel } = await comprobarWebIgualQueMuestras({ navegador, pagina, urlBase });
for (const c of comparaciones) {
  console.log(`  ${c.nombre.padEnd(34)} ${c.archivo}`);
  console.log(`    página ${c.paginaMm[0]}×${c.paginaMm[1]} mm · controles y URL según la configuración pedida`
    + `${c.problemas.length ? '  ✗' : '  ✓'}`);
  for (const p of c.problemas) { console.log(`    ✗ ${p}`); fallosWeb++; }
  if (c.iguales) {
    console.log(`    ✓ ${peso(c.bytes)} idénticos byte a byte a la muestra`);
  } else {
    console.log(`    ✗ difieren: web ${c.bytes} B, muestra ${c.bytesReferencia} B`
      + `, primera diferencia en el byte ${c.primeraDiferencia}`);
    fallosWeb++;
  }
}
console.log(`  el panel manda: A2 ${panel.antes} → A4 ${panel.despues}`
  + ` · la URL queda en hoja=${panel.urlTrasCambio}${panel.problemas.length ? '  ✗' : '  ✓'}`);
for (const p of panel.problemas) { console.log(`    ✗ ${p}`); fallosWeb++; }

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

  /* El recuento esperado se calcula AQUÍ, desde centros.json, aplicando el mismo
     recorte de ámbito y de tipos que declara la muestra. No se le pregunta al motor:
     si el motor se equivocara al filtrar, preguntarle confirmaría su error. */
  const recuentoEsperado = (muestra) => {
    const ambito = muestra.ambito || null;
    const tipos = muestra.opciones?.tipos ? new Set(muestra.opciones.tipos) : null;
    const dentro = (c) => {
      if (!ambito) return true;
      if (ambito.length === 2) return c.ccdd === ambito;
      if (ambito.length === 4) return c.ccpp === ambito;
      return c.ubigeo === ambito;
    };
    const cuenta = new Map();
    let total = 0;
    for (const c of centros.centros) {
      if (!dentro(c) || (tipos && !tipos.has(c.tipo))) continue;
      total++;
      cuenta.set(c.tipo, (cuenta.get(c.tipo) || 0) + 1);
    }
    return { cuenta, total };
  };

  for (const { muestra, salida } of resultados) {
    const s2 = salida.meta.servicios;
    const { cuenta: esperado, total: totalEsperado } = recuentoEsperado(muestra);

    const desajustes = [];
    for (const { tipo, n } of s2.tipos) {
      if (esperado.get(tipo) !== n) desajustes.push(`${tipo}: ${n} ≠ ${esperado.get(tipo) ?? 0}`);
    }
    for (const [tipo, n] of esperado) {
      if (!s2.tipos.some((t) => t.tipo === tipo)) desajustes.push(`${tipo}: falta (${n} en los datos)`);
    }
    /* Un mapa con filtro no puede dibujar ningún tipo que no se haya pedido. */
    if (s2.filtro) {
      for (const t of s2.tipos) {
        if (!s2.filtro.includes(t.tipo)) desajustes.push(`${t.tipo}: dibujado sin estar en el filtro`);
      }
    }
    const totalOk = s2.totalDibujado === totalEsperado;

    const donde = salida.meta.ambito.nivel === 'nacional'
      ? 'Perú' : `${salida.meta.ambito.nombre} (${salida.meta.ambito.nivel})`;
    console.log(`  ${muestra.nombre.padEnd(24)} ${donde.padEnd(22)}`
      + ` ${s2.totalDibujado} centros en ${s2.tipos.length} tipos`
      + ` · ${s2.unidadesConServicio}/${s2.unidadesDibujadas} unidades con servicio`
      + `${s2.filtro ? ` · filtro de ${s2.filtro.length}` : ''}`
      + `${totalOk && !desajustes.length ? '  ✓' : '  ✗'}`);
    if (!totalOk) {
      console.log(`    ✗ total ${s2.totalDibujado} ≠ ${totalEsperado} esperados en este ámbito`);
      fallosDatos++;
    }
    for (const d of desajustes) { console.log(`    ✗ ${d}`); fallosDatos++; }
  }
  if (!fallosDatos) {
    console.log(`  ✓ cada muestra dibuja exactamente los centros que centros.json pone`
      + ' en su ámbito y con su filtro');
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
    ? s3.recuadros.map((z) => `${z.etiqueta} ${z.anchoMm}×${z.altoMm} mm (${z.unidades} unid., x${z.ampliacion}${z.completa ? "" : ", núcleo"})`).join(' · ')
    : 'ninguno'}${s3.unidadesSoloEnRecuadro
    ? ` · ${s3.unidadesSoloEnRecuadro} unidad(es) con los íconos sólo en su recuadro` : ''}`);
  console.log(`    capacidad: ${cap.colocados} de ${cap.tope} permitidos en esta hoja`
    + `${cap.cabeOtro ? ' · aún cabría otro' : ' · sin hueco para más'}`);
  for (const a of s3.avisosRecuadros || []) console.log(`    ! ${a}`);
}

/* ----------------------- rótulos del mapa (Fase 4) ---------------------- */

titulo('Rótulos: colocados y omitidos por nivel');
let fallosRotulos = 0;
for (const { muestra, salida } of resultados) {
  const e = salida.meta.etiquetas;
  const niveles = Object.entries(e.porNivel)
    .map(([n, v]) => `${n}${n.endsWith('r') ? 'es' : 's'} ${v.colocados}/${v.total}`)
    .join(' · ');
  console.log(`  ${muestra.nombre.padEnd(24)} ${niveles}`);
  if (e.omitidos.length) {
    console.log(`    omitidos: ${e.omitidos.slice(0, 8).join(', ')}${e.omitidos.length > 8 ? `, … (${e.omitidos.length})` : ''}`);
  }

  /* Criterio de aceptación de la fase: cero superposiciones, comprobadas
     geométricamente por pares y sin fiarse del índice que las colocó.

     Dos clases de solape están PERMITIDAS, y las dos por decisión, no por descuido:

     - símbolo contra símbolo, que es el APIÑAMIENTO. Se mide aparte y se resuelve
       ampliando la zona en un recuadro, no borrando símbolos.
     - un rótulo del mapa sobre un grupo de símbolos, como último recurso. Tratarlo
       como obstáculo dejaba a Huancavelica sin rótulo y a LA LIBERTAD arrinconada.
       Desde la revisión de la Fase 20 el motor lo acota: fuera del nivel superior,
       un nombre no puede tener más de un 10 % de su caja bajo íconos.

     Todo lo demás —dos rótulos entre sí, un bloque sobre cualquier cosa— sigue siendo
     un fallo. */
  const PERMITIDO_SOBRE_SIMBOLO = new Set(['simbolos', 'departamento', 'provincia', 'distrito']);
  const permitido = (x) => {
    const na = x.nivelA || '';
    const nb = x.nivelB || '';
    return (na === 'simbolos' && PERMITIDO_SOBRE_SIMBOLO.has(nb))
      || (nb === 'simbolos' && PERMITIDO_SOBRE_SIMBOLO.has(na));
  };
  const solapes = buscarSolapes(e.cajas, 0.01).filter((x) => !permitido(x));
  if (solapes.length) {
    console.log(`    ✗ ${solapes.length} superposición(es): `
      + solapes.slice(0, 4).map((x) => `${x.a} × ${x.b} (${x.areaMm2} mm²)`).join(', '));
    fallosRotulos += solapes.length;
  } else {
    console.log(`    ✓ ${e.cajas.length} cajas comprobadas por pares, sin superposiciones`);
  }
}

/* ------------- rótulos territorio por territorio (revisión Fase 20) ------------- */

/* Lo que pidió el área usuaria: revisar cada territorio, uno por uno. Para cada nombre
   que el mapa intenta poner —departamento, provincia o distrito— se anota si se puso,
   cuánto sale de su unidad, a qué distancia queda de sus íconos y si tapa alguno, junto
   con cómo se dispusieron esos íconos. La lista completa va a muestras/territorios.csv
   (una fila por territorio y lámina); aquí, el resumen. No falla nada: es para mirar. */
titulo('Rótulos: territorio por territorio');
const filasTerritorio = [];
for (const { muestra, salida } of resultados) {
  const e = salida.meta.etiquetas;
  const grupoDe = new Map((salida.meta.servicios.grupos || []).map((g) => [g.unidad, g]));
  const porNivel = {};
  const anotar = (nivel, clave) => {
    porNivel[nivel] = porNivel[nivel] || {
      total: 0, dentro: 0, poco: 0, mucho: 0, sinSitio: 0, pegados: 0, conGrupo: 0, tapan: 0, verticales: 0,
    };
    porNivel[nivel][clave]++;
  };
  for (const c of e.colocados) {
    if (c.nivel === 'exterior') continue;
    anotar(c.nivel, 'total');
    anotar(c.nivel, c.fueraPct === 0 ? 'dentro' : c.fueraPct < 25 ? 'poco' : 'mucho');
    if (c.aGrupoMm !== null) {
      anotar(c.nivel, 'conGrupo');
      if (c.aGrupoMm === 0) anotar(c.nivel, 'pegados');
    }
    if (c.sobreSimbolosPct > 0) anotar(c.nivel, 'tapan');
    if (c.vertical) anotar(c.nivel, 'verticales');
  }
  for (const o of e.sinSitio) {
    if (o.nivel === 'exterior') continue;
    anotar(o.nivel, 'total');
    anotar(o.nivel, 'sinSitio');
  }
  console.log(`  ${muestra.nombre}`);
  for (const [nivel, v] of Object.entries(porNivel)) {
    console.log(`    ${`${nivel}${nivel.endsWith('r') ? 'es' : 's'}`.padEnd(14)} ${v.dentro}/${v.total} dentro de su unidad`
      + ` · ${v.poco} asoman menos de un cuarto · ${v.mucho} más · ${v.sinSitio} sin sitio`
      + (v.conGrupo ? ` · ${v.pegados}/${v.conGrupo} pegados a sus íconos` : '')
      + (v.tapan ? ` · ${v.tapan} rozan íconos` : '')
      + (v.verticales ? ` · ${v.verticales} en vertical` : ''));
  }

  /* Puesto (en vertical, si va girado) o el motivo por el que falta: «no cabe» en su
     unidad, o «sin hueco libre» porque otros nombres le ocuparon las posiciones. */
  const fila = (nivel, id, nombre, r, motivo) => {
    const g = grupoDe.get(id);
    filasTerritorio.push([
      muestra.nombre, nivel, id, nombre,
      r ? (r.vertical ? 'puesto en vertical' : 'puesto') : `sin sitio: ${motivo || '—'}`,
      r ? r.lineas : '', r ? r.fueraPct : '', r && r.aGrupoMm !== null ? r.aGrupoMm : '',
      r ? r.sobreSimbolosPct : '', g ? g.iconos : '', g && g.dentro !== null ? g.dentro : '',
      g ? g.forma : '', g ? (g.conNombre ? 'sí' : 'no') : '',
    ]);
  };
  for (const c of e.colocados) if (c.nivel !== 'exterior') fila(c.nivel, c.id, c.texto, c);
  for (const o of e.sinSitio) if (o.nivel !== 'exterior') fila(o.nivel, o.id, o.texto, null, o.motivo);
}
const CABECERA_TERRITORIOS = [
  'muestra', 'nivel', 'ubigeo', 'nombre', 'rótulo', 'líneas', 'fuera de su unidad (%)',
  'distancia a sus íconos (mm)', 'tapa íconos (%)', 'íconos', 'íconos dentro', 'rejilla',
  'rejilla junto a su nombre',
];
/* Con punto y coma y la marca BOM, que es como una hoja de cálculo en español abre un
   CSV con tildes sin preguntar. */
const celda = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
fs.writeFileSync(path.join(DESTINO, 'territorios.csv'), `﻿${[CABECERA_TERRITORIOS, ...filasTerritorio]
  .map((f) => f.map(celda).join(';')).join('\n')}\n`);
console.log(`\n  ${filasTerritorio.length} territorios, uno por fila, en muestras/territorios.csv`);

titulo('Layout: solapamientos y escala gráfica');
let fallosLayout = 0;
for (const { muestra, salida } of resultados) {
  const { layout, escalaGrafica, grilla, rotulos } = salida.meta;
  console.log(`  ${muestra.nombre}`);
  console.log(`    piezas: ${layout.colocadas.map((p) => `${p.nombre}@${p.anclaje}`).join(', ') || 'ninguna'}`);
  const ley = layout.colocadas.find((p) => p.nombre === 'leyenda');
  if (ley) {
    const c = layout.leyenda;
    console.log(`    leyenda: ${ley.ancho}×${ley.alto} mm en ${ley.anclaje}`
      + ` · tapa ${ley.territorioTapadoPct} % de su caja`
      + (c ? ` · ${c.columnas} columna(s),`
        + ` ${c.abreviada ? 'siglas' : 'nombres completos'}${c.nombresPartidos ? ' partidos' : ' en una línea'},`
        + ` texto al ${Math.round(c.escalaTexto * 100)} %` : ''));
    const cl = layout.colocadas.find((p) => p.nombre === 'clases');
    if (cl) console.log(`    clases: ${cl.ancho}×${cl.alto} mm en ${cl.anclaje}`);
    const esc = layout.colocadas.find((p) => p.nombre === 'escala');
    if (esc) console.log(`    escala gráfica: en ${esc.anclaje}${esc.anclaje.startsWith('abajo') ? '' : '  · fuera de la fila de abajo'}`);
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

/* Informe legible por máquina de todo lo que salió de esta ejecución. Lo consume
   `npm run qa` para la regresión visual y el informe de rendimiento, y sirve además
   como registro de qué se generó y con qué versión de los datos. */
fs.writeFileSync(path.join(DESTINO, 'informe.json'), `${JSON.stringify({
  generado: new Date().toISOString(),
  datosTag: resultados[0]?.salida.meta.datosTag,
  fechaFija: fechaFija || null,
  muestras: resultados.map(({ muestra, salida, verificacion, msTotalNode }) => ({
    nombre: muestra.nombre,
    ambito: salida.meta.ambito,
    hoja: salida.meta.hoja,
    escala: salida.meta.escala,
    nivel: salida.meta.nivel,
    centros: salida.meta.servicios.totalDibujado,
    bytesPdf: verificacion.bytes,
    bytesSvg: salida.bytesSvg,
    msComposicion: salida.meta.msComposicion,
    msPdf: salida.meta.msPdf,
    msTotal: msTotalNode,
    imagenes: verificacion.imagenes,
    fuentes: verificacion.fuentes,
  })),
}, null, 1)}
`);

const totalBytes = resultados.reduce((s, r) => s + r.verificacion.bytes, 0);
console.log(`\n  ${resultados.length} archivos en muestras/ (${peso(totalBytes)})`);
if (fechaFija) console.log(`  fecha fija ${fechaFija}: la salida es reproducible byte a byte`);

if (fallos || fallosLayout || fallosDatos || fallosRotulos || fallosWeb) {
  abortar(`${fallos + fallosLayout + fallosDatos + fallosRotulos + fallosWeb} problema(s) en las muestras generadas.`);
}
console.log('\n✓ Muestras generadas y verificadas.\n');
