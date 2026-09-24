/**
 * Comprueba el criterio de aceptación de la Fase 5: el PDF que descarga un usuario
 * desde la web es IDÉNTICO al que genera `npm run muestras` con la misma
 * configuración.
 *
 * No se compara el aspecto ni el tamaño del archivo: se comparan los bytes. Es la
 * única forma de descartar que la interfaz haya metido por el camino un ajuste propio
 * —otro cuerpo, otro margen, una proyección «que se ve mejor en pantalla»— que sólo
 * aparecería al imprimir.
 *
 * La prueba conduce el navegador como lo haría una persona: abre la página con la
 * configuración en la URL, espera a que componga, pulsa «Generar PDF» y recoge la
 * descarga. Si en vez de eso llamara a las funciones internas no probaría la interfaz,
 * que es justo lo que hay que probar.
 *
 * La igualdad byte a byte, por sí sola, no basta: los dos lados leen la URL con el
 * mismo desdeParametros(), así que un parámetro que se ignorara se ignoraría en ambos
 * y la comparación seguiría saliendo verde. Por eso cada caso declara además qué tiene
 * que haber pasado —tamaño de página medido en el PDF, controles del panel, parámetros
 * que sobreviven en la barra de direcciones— comprobado por fuera de esa función.
 *
 * La fecha se fija por la URL para que la comparación sea posible: sin ella los dos
 * archivos diferirían en la línea «Generado el» del pie y en el sello del documento.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { analizarPdf, ptAmm } from './verificar-pdf.mjs';

const FECHA = '2026-09-23';

/** Medidas nominales en mm, para comprobar el tamaño de página por fuera del motor. */
const MEDIDAS = {
  A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189],
};

/**
 * Casos que se contrastan. Cubren lo que la interfaz puede cambiar: hoja, filtro de
 * tipos, recuadros elegidos a mano y capas o piezas apagadas.
 *
 * `esperado` es la comprobación independiente: se escribe a mano a partir de lo que
 * dice la URL, no se deriva de la configuración que la página interpretó.
 */
export const CASOS = [
  {
    nombre: 'A3 vertical por omisión',
    parametros: { hoja: 'A3', fecha: FECHA },
    esperado: {
      paginaMm: MEDIDAS.A3,
      controles: { tamano: 'A3', orientacion: 'vertical', 'zoom-modo': 'auto' },
      marcadas: ['capa-grilla', 'pieza-norte', 'pieza-leyenda'],
      desmarcadas: [],
    },
  },
  {
    nombre: 'A2 horizontal, sólo CEM',
    parametros: {
      hoja: 'A2', orientacion: 'h', tipos: 'CEM', fecha: FECHA,
    },
    esperado: {
      paginaMm: [MEDIDAS.A2[1], MEDIDAS.A2[0]],
      controles: { tamano: 'A2', orientacion: 'horizontal' },
      marcadas: ['capa-simbolos'],
      desmarcadas: [],
      unTipo: 'CEM',
    },
  },
  /* Fase 6: el ámbito viaja en la URL y tiene que llegar al PDF igual que lo demás. */
  {
    nombre: 'departamento de Cusco en A3',
    parametros: { ambito: '08', hoja: 'A3', fecha: FECHA },
    esperado: {
      paginaMm: MEDIDAS.A3,
      controles: { tamano: 'A3', ambito: '08', 'ambito-provincia': '' },
      marcadas: ['pieza-ubicacion'],
      desmarcadas: [],
    },
  },
  {
    nombre: 'provincia de Maynas en A4',
    parametros: { ambito: '1601', hoja: 'A4', fecha: FECHA },
    esperado: {
      paginaMm: MEDIDAS.A4,
      controles: { tamano: 'A4', ambito: '16', 'ambito-provincia': '1601' },
      marcadas: ['pieza-ubicacion'],
      desmarcadas: [],
    },
  },
  {
    nombre: 'A2 con zoom manual y capas apagadas',
    parametros: {
      hoja: 'A2', zoom: '1501,0701', sinCapas: 'grilla,contexto', sinPiezas: 'norte',
      titulo: 'Servicios del MIMP en Lima y Callao', fecha: FECHA,
    },
    esperado: {
      paginaMm: MEDIDAS.A2,
      controles: { tamano: 'A2', 'zoom-modo': 'manual', titulo: 'Servicios del MIMP en Lima y Callao' },
      marcadas: ['capa-simbolos', 'pieza-leyenda'],
      desmarcadas: ['capa-grilla', 'capa-contexto', 'pieza-norte'],
    },
  },
];

/** Espera a que la página haya compuesto un mapa y el botón vuelva a estar activo. */
async function esperarComposicion(pagina) {
  await pagina.waitForFunction(() => document.querySelector('#vista svg') !== null, { timeout: 180000 });
  await pagina.waitForFunction(() => {
    const b = document.getElementById('generar');
    return b && !b.disabled;
  }, { timeout: 180000 });
}

/**
 * @param {object} contexto
 * @param {import('playwright').Browser} contexto.navegador
 * @param {import('playwright').Page} contexto.pagina    página del banco de pruebas
 * @param {string} contexto.urlBase
 */
export async function comprobarWebIgualQueMuestras({ navegador, pagina, urlBase }) {
  const resultados = [];
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'mimp-descarga-'));
  const urlApp = new URL('index.html', urlBase).href;

  for (const caso of CASOS) {
    const parametros = new URLSearchParams(caso.parametros);
    const problemas = [];

    /* 1. La referencia: el mismo camino que usan las muestras, sin interfaz. */
    const referencia = await pagina.evaluate(
      (busqueda) => window.generarComoLaWeb(busqueda),
      parametros.toString(),
    );

    /* 2. La descarga: la interfaz de verdad, conducida por la página. */
    const web = await navegador.newPage();
    const erroresConsola = [];
    web.on('pageerror', (err) => erroresConsola.push(err.message));
    web.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()); });

    await web.goto(`${urlApp}?${parametros}`, { waitUntil: 'networkidle' });
    await esperarComposicion(web);

    /* 3. ¿Llegó la configuración de la URL a los controles? Si el panel mostrara A1
          mientras el mapa sale en A2, quien lo usa no puede confiar en lo que ve. */
    const vistos = await web.evaluate((ids) => Object.fromEntries(ids.map((id) => {
      const n = document.getElementById(id);
      return [id, n ? (n.type === 'checkbox' ? n.checked : n.value) : null];
    })), [
      ...Object.keys(caso.esperado.controles),
      ...caso.esperado.marcadas, ...caso.esperado.desmarcadas,
    ]);
    for (const [id, valor] of Object.entries(caso.esperado.controles)) {
      if (vistos[id] !== valor) problemas.push(`el control ${id} muestra «${vistos[id]}» y no «${valor}»`);
    }
    for (const id of caso.esperado.marcadas) {
      if (vistos[id] !== true) problemas.push(`${id} debería estar marcada`);
    }
    for (const id of caso.esperado.desmarcadas) {
      if (vistos[id] !== false) problemas.push(`${id} debería estar desmarcada`);
    }
    if (caso.esperado.unTipo) {
      const marcados = await web.evaluate(() => [...document.querySelectorAll('.lista-tipos input:checked')].length);
      if (marcados !== 1) problemas.push(`se pidió un solo tipo y hay ${marcados} marcados`);
    }

    /* 4. ¿Sobrevive la configuración en la barra de direcciones? La página la reescribe
          al terminar de componer; si perdiera un parámetro, el enlace que alguien copie
          daría otro mapa. */
    const devueltos = new URLSearchParams(new URL(web.url()).search);
    for (const [clave, valor] of parametros) {
      const hay = devueltos.get(clave);
      /* La orientación se abrevia a una letra y el conjunto de capas apagadas puede
         reordenarse; se comparan por contenido, no por texto. */
      /* Tres claves se comparan por CONTENIDO y no por texto. La orientación se
         abrevia a una letra; el conjunto de capas apagadas no tiene orden; y las zonas
         de zoom tampoco, porque el motor las agrupa por su geometría y no por el orden
         en que se marcaron —los PDF de las dos listas salen byte a byte iguales—. */
      const mismoConjunto = () => hay !== null
        && [...hay.split(',')].sort().join() === [...valor.split(',')].sort().join();
      const igual = clave === 'orientacion'
        ? (hay || '').startsWith(valor[0])
        : (clave.startsWith('sin') || clave === 'zoom' ? mismoConjunto() : hay === valor);
      if (!igual) problemas.push(`la URL perdió o cambió «${clave}»: «${hay}» en vez de «${valor}»`);
    }

    /* 5. La descarga. */
    const esperaDescarga = web.waitForEvent('download', { timeout: 180000 });
    await web.click('#generar');
    const descarga = await esperaDescarga;
    const destino = path.join(carpeta, descarga.suggestedFilename());
    await descarga.saveAs(destino);
    const bytesWeb = fs.readFileSync(destino);
    if (erroresConsola.length) problemas.push(`errores en la consola: ${erroresConsola.join(' · ')}`);
    await web.close();

    /* 6. Tamaño de página medido en el archivo, no preguntado al motor: cierra el
          hueco de que los dos lados interpreten mal el mismo parámetro. */
    const analisis = analizarPdf(bytesWeb);
    const [anchoPt, altoPt] = analisis.medidasPt[0] || [0, 0];
    const medido = [ptAmm(anchoPt), ptAmm(altoPt)];
    const [anchoEsperado, altoEsperado] = caso.esperado.paginaMm;
    if (Math.abs(medido[0] - anchoEsperado) > 0.5 || Math.abs(medido[1] - altoEsperado) > 0.5) {
      problemas.push(`la página mide ${medido[0]}×${medido[1]} mm y se pidió ${anchoEsperado}×${altoEsperado}`);
    }

    /* 7. Y por fin la igualdad byte a byte. */
    const bytesRef = Buffer.from(referencia.pdf, 'base64');
    const iguales = bytesRef.equals(bytesWeb);
    let primeraDiferencia = -1;
    if (!iguales) {
      const hasta = Math.min(bytesRef.length, bytesWeb.length);
      primeraDiferencia = hasta;
      for (let i = 0; i < hasta; i++) {
        if (bytesRef[i] !== bytesWeb[i]) { primeraDiferencia = i; break; }
      }
    }

    resultados.push({
      nombre: caso.nombre,
      archivo: descarga.suggestedFilename(),
      bytes: bytesWeb.length,
      bytesReferencia: bytesRef.length,
      paginaMm: medido,
      iguales,
      primeraDiferencia,
      problemas,
    });
  }

  /* El panel manda de verdad: se cambia un control y el mapa y la URL tienen que
     seguirlo. Sin esto, la interfaz podría ser un adorno sobre la URL. */
  const web = await navegador.newPage();
  await web.goto(`${urlApp}?hoja=A2&fecha=${FECHA}`, { waitUntil: 'networkidle' });
  await esperarComposicion(web);
  const antes = await web.evaluate(() => document.querySelector('#vista svg').getAttribute('viewBox'));
  await web.selectOption('#tamano', 'A4');
  await web.waitForFunction(
    (previo) => {
      const svg = document.querySelector('#vista svg');
      const b = document.getElementById('generar');
      return svg && svg.getAttribute('viewBox') !== previo && b && !b.disabled;
    },
    antes,
    { timeout: 180000 },
  );
  const despues = await web.evaluate(() => document.querySelector('#vista svg').getAttribute('viewBox'));
  const urlTrasCambio = new URL(web.url()).searchParams.get('hoja');

  /* Y las zonas a ampliar, que ya no son una lista sino tres desplegables encadenados:
     elegir un departamento tiene que rellenar sus provincias, y «Añadir zona» tiene que
     llegar hasta la URL. Sin esto, el encadenamiento podría estar roto y el mapa saldría
     igual —sin recuadros— sin que nada lo dijera. */
  const zonas = { problemas: [] };
  await web.selectOption('#zoom-modo', 'manual');
  await web.selectOption('#zona-departamento', '08');
  zonas.provinciasDeCusco = await web.evaluate(
    () => document.querySelectorAll('#zona-provincia option').length - 1,
  );
  if (zonas.provinciasDeCusco !== 13) {
    zonas.problemas.push(`Cusco tiene 13 provincias y el desplegable ofrece ${zonas.provinciasDeCusco}`);
  }
  zonas.distritoBloqueado = await web.evaluate(() => document.getElementById('zona-distrito').disabled);
  if (!zonas.distritoBloqueado) {
    zonas.problemas.push('el mapa nacional amplía provincias, así que el distrito debería estar bloqueado');
  }
  await web.selectOption('#zona-provincia', '0801');
  await web.click('#zona-anadir');
  try {
    await web.waitForFunction(() => new URL(location.href).searchParams.get('zoom') === '0801',
      null, { timeout: 60000 });
  } catch {
    zonas.problemas.push('tras «Añadir zona» la URL no recogió zoom=0801');
  }
  zonas.urlTrasAnadir = await web.evaluate(() => new URL(location.href).searchParams.get('zoom'));
  zonas.enLista = await web.evaluate(() => document.querySelectorAll('#zonas-elegidas li').length);
  if (zonas.enLista !== 1) zonas.problemas.push(`la lista de zonas tiene ${zonas.enLista} entradas y debería tener 1`);
  await web.close();

  const panel = {
    antes,
    despues,
    urlTrasCambio,
    zonas,
    problemas: [
      ...(urlTrasCambio === 'A4' ? [] : [`la URL dice hoja=${urlTrasCambio} tras elegir A4`]),
      ...zonas.problemas,
    ],
  };

  fs.rmSync(carpeta, { recursive: true, force: true });
  return { comparaciones: resultados, panel };
}
