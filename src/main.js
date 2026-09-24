/**
 * Aplicación: panel de configuración, vista previa y descarga del PDF.
 *
 * El mismo SVG alimenta la pantalla y el PDF, y la descarga usa exactamente las
 * mismas funciones que `npm run muestras`. Eso no es una comodidad de implementación:
 * es lo que permite afirmar que lo revisado en pantalla y lo que sale de la imprenta
 * son el mismo documento.
 *
 * La composición se hace a petición y con freno: cada tecla del título no puede
 * disparar un mapa nacional entero, que en A0 tarda trece segundos.
 */
import './estilo/fuentes.css';
import './estilo/app.css';
import { aplicarVariablesCss } from './estilo/tokens.js';
import { crearHoja } from './motor/hoja.js';
import { crearCargador, lectorNavegador } from './motor/cargador.js';
import { componer } from './motor/render.js';
import { aPdf, lectorTtfNavegador } from './motor/pdf.js';
import { crearPanel } from './ui/panel.js';
import { crearVista } from './ui/vista.js';
import {
  desdeParametros, aParametros, aLlamadasDelMotor, nombreDeArchivo, NOMBRE_NIVEL,
} from './ui/config.js';

const BASE = import.meta.env.BASE_URL;
const cargador = crearCargador(lectorNavegador(BASE));
const leerTtf = lectorTtfNavegador(BASE);

aplicarVariablesCss();

/** Espera a que las ocho variantes estén cargadas antes de medir nada. */
async function fuentesListas() {
  const variantes = [
    '400 10px Poppins', '500 10px Poppins', '600 10px Poppins', '700 10px Poppins',
    '400 10px SourceSans3', 'italic 400 10px SourceSans3',
    '600 10px SourceSans3', '700 10px SourceSans3',
  ];
  await Promise.all(variantes.map((v) => document.fonts.load(v)));
  await document.fonts.ready;
}

const $ = (id) => document.getElementById(id);

async function arrancar() {
  const config = desdeParametros(new URLSearchParams(window.location.search));

  const [centros] = await Promise.all([cargador.centros(), fuentesListas()]);
  const conteo = new Map();
  for (const c of centros.centros) conteo.set(c.tipo, (conteo.get(c.tipo) || 0) + 1);
  const nombreDepartamento = new Map(centros.catalogo.departamentos.map((d) => [d.id, d.nombre]));

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const catalogo = {
    tipos: [...conteo.keys()].sort((a, b) => conteo.get(b) - conteo.get(a) || a.localeCompare(b, 'es')),
    conteo,
    departamentos: [...centros.catalogo.departamentos].sort(porNombre),
    provincias: centros.catalogo.provincias
      .map((p) => ({ ...p, departamento: nombreDepartamento.get(p.ccdd) || '' }))
      .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es') || porNombre(a, b)),
    /**
     * Distritos de una provincia, leídos de la CARTOGRAFÍA.
     *
     * Ni para elegir el ámbito ni para elegir una zona a ampliar sirve el catálogo del
     * buscador, que sólo lista los que tienen algún centro: un distrito sin servicios
     * también se puede imprimir —su mapa es justamente el que dice que no hay ninguno y
     * ofrece los más cercanos— y también se puede ampliar dentro de otro mapa. Se cargan
     * por departamento y se recuerdan, porque los selectores los vuelven a pedir cada vez
     * que se cambia de provincia dentro del mismo departamento.
     */
    distritosDe(ccpp) {
      if (!ccpp) return [];
      const lista = distritosPorDepartamento.get(ccpp.slice(0, 2));
      if (!lista) {
        pedirDistritos(ccpp.slice(0, 2));
        return [];
      }
      return lista.filter((d) => d.id.startsWith(ccpp));
    },
  };

  /* Carga perezosa: los distritos de los veinticinco departamentos son varios megas y
     casi ninguna sesión los necesita todos. Se pide el del departamento elegido y, al
     llegar, se rehace el panel para que su selector aparezca relleno. */
  const distritosPorDepartamento = new Map();
  const pedidos = new Set();
  function pedirDistritos(ccdd) {
    if (!ccdd || pedidos.has(ccdd)) return;
    pedidos.add(ccdd);
    cargador.distritosDe(ccdd, 'bajo').then((geo) => {
      distritosPorDepartamento.set(ccdd, geo.features
        .map((f) => ({ id: f.properties.ubigeo, nombre: f.properties.nombre }))
        .sort(porNombre));
      if (panel) panel.refrescarDistritos();
    }).catch(() => { pedidos.delete(ccdd); });
  }

  const vista = crearVista({
    contenedor: $('vista'),
    alCambiarZoom: (z) => { $('nivel-zoom').textContent = `${Math.round(z * 100)} %`; },
  });

  const dialogo = $('dialogo-avisos');

  let ultimo = null;
  let pendiente = null;
  let componiendo = false;

  /* El ámbito puede venir de la URL, así que los distritos de su departamento hacen
     falta desde el primer dibujo. */
  if (config.ambito.id) pedirDistritos(config.ambito.id.slice(0, 2));

  const panel = crearPanel({
    contenedor: $('panel'),
    config,
    catalogo,
    alCambiar: () => programarComposicion(),
    alGenerar: () => generar(),
  });

  /* ----------------------------- composición --------------------------- */

  /* Compone y muestra. Se llama «recomponer» y no «componer» porque el motor exporta
     una función con ese nombre: llamarlas igual hacía que ésta se invocara a sí misma. */
  async function recomponer() {
    componiendo = true;
    vista.ocupado(true);
    panel.progreso('Componiendo el mapa…', true);
    try {
      const hoja = crearHoja(config.hoja);
      const llamadas = aLlamadasDelMotor(config);
      const { svg, meta } = await componer({ hoja, cargador, ...llamadas.composicion });
      ultimo = { svg, meta, hoja, pdf: llamadas.pdf };
      vista.mostrar(svg, hoja);
      mostrarResumen(meta);
      mostrarAvisos(meta, config);
      panel.avisoZoom(textoCapacidad(meta));
      panel.progreso('');
      sincronizarUrl();
    } catch (err) {
      panel.progreso(`No se pudo componer el mapa: ${err.message}`);
      $('avisos').innerHTML = '';
    } finally {
      componiendo = false;
      vista.ocupado(false);
      if (pendiente) { const f = pendiente; pendiente = null; f(); }
    }
  }

  /**
   * Freno. Escribir un título dispararía una composición por tecla, y en A0 cada una
   * tarda trece segundos; además, si ya hay una en marcha se encola UNA sola, porque
   * lo que importa es el último estado, no los intermedios.
   */
  let temporizador = null;
  function programarComposicion() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (componiendo) pendiente = recomponer;
      else recomponer();
    }, 260);
  }

  /* ------------------------------ descarga ----------------------------- */

  async function generar() {
    if (!ultimo) return;
    panel.progreso('Generando el PDF…', true);
    try {
      const { bytes } = await aPdf({
        svg: ultimo.svg, hoja: ultimo.hoja, leerTtf, ...ultimo.pdf,
      });
      const nombre = nombreDeArchivo(config);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      panel.progreso(`Descargado ${nombre}`);
    } catch (err) {
      panel.progreso(`No se pudo generar el PDF: ${err.message}`);
    }
  }

  /* ------------------------------- informes ---------------------------- */

  function mostrarResumen(meta) {
    $('resumen').innerHTML = '';
    const filas = [
      ['Escala', meta.escala],
      ['Detalle', `${meta.nivel} (±${{ bajo: 1200, medio: 300, alto: 40 }[meta.nivel]} m)`],
      ['Centros', `${meta.servicios.totalDibujado} en ${meta.servicios.tipos.length} tipos`],
      ['Rótulos', Object.entries(meta.etiquetas.porNivel)
        .map(([n, v]) => `${NOMBRE_NIVEL[n] || n} ${v.colocados}/${v.total}`).join(' · ') || '—'],
      ['Recuadros', meta.servicios.recuadros.length
        ? meta.servicios.recuadros.map((z) => z.etiqueta).join(', ') : 'ninguno'],
    ];
    /* Cada pareja va envuelta en un div —que la lista de definiciones admite— para
       que el resumen se pueda disponer en UNA línea con saltos limpios. Sin la
       envoltura, el término y su valor se separan al repartirse por la fila. */
    for (const [clave, valor] of filas) {
      const dt = document.createElement('dt'); dt.textContent = clave;
      const dd = document.createElement('dd'); dd.textContent = valor;
      const pareja = document.createElement('div');
      pareja.append(dt, dd);
      $('resumen').appendChild(pareja);
    }
  }

  /**
   * Avisos. La regla es señalar lo que el mapa NO está diciendo: un tamaño de hoja
   * que no da para los tipos activos, rótulos que se quedaron fuera, zonas que
   * pedían ampliación y no cupieron. Sin esto, un mapa incompleto parece completo.
   *
   * Viven en un diálogo, no bajo el mapa: la lista crecía hasta comerse cien píxeles
   * de alto del mapa, que es lo que se ha venido a mirar. El botón de la barra queda
   * a la vista y cambia de color cuando hay algo que señalar, de modo que se gana
   * sitio sin esconder el aviso: lo que se oculta es el texto, nunca que exista.
   */
  function mostrarAvisos(meta, cfg) {
    const avisos = [];
    const s = meta.servicios;

    if (s.gruposApinados.length > 12) {
      avisos.push(`En ${meta.hoja} los símbolos se estorban en ${s.gruposApinados.length} provincias.`
        + ' Usa una hoja mayor o filtra tipos de servicio.');
    }
    const omitidos = meta.etiquetas.omitidos.length;
    if (omitidos) {
      avisos.push(`${omitidos} rótulo(s) omitidos por falta de sitio: `
        + `${meta.etiquetas.omitidos.slice(0, 5).join(', ')}${omitidos > 5 ? '…' : ''}.`);
    }
    for (const a of meta.servicios.avisosRecuadros || []) avisos.push(a);

    /* Un nombre de país que falta se nota; saber por qué falta no, y sin eso parece un
       descuido del programa. El caso normal es que un recuadro de zoom ocupe el hueco. */
    const paisesFuera = (meta.rotulos.omitidos || [])
      .filter((n) => n === n.toLocaleUpperCase('es') && !n.startsWith('OCÉANO') && !n.startsWith('LAGO'));
    for (const n of paisesFuera) {
      const motivo = (meta.rotulos.motivos || {})[n];
      avisos.push(`Sin sitio para el nombre de ${n}${motivo ? ` (${motivo})` : ''}.`
        + ' Se omite antes que escribirlo sobre el Perú.');
    }
    if (meta.layout.omitidas.length) {
      avisos.push(`No cupieron estos elementos: ${meta.layout.omitidas.join(', ')}.`);
    }
    if (cfg.tipos && cfg.tipos.length === 0) {
      avisos.push('No hay ningún tipo marcado; se muestran todos.');
    }

    $('avisos').innerHTML = '';
    for (const texto of avisos) {
      const li = document.createElement('li');
      li.textContent = texto;
      $('avisos').appendChild(li);
    }
    $('sin-avisos').hidden = avisos.length > 0;

    const boton = $('ver-avisos');
    boton.classList.toggle('hay', avisos.length > 0);
    $('avisos-cuenta').textContent = avisos.length
      ? `${avisos.length} aviso${avisos.length === 1 ? '' : 's'}`
      : 'Sin avisos';
    /* Si el mapa recién compuesto ya no tiene nada que señalar, no puede quedarse
       abierto un diálogo vacío de la composición anterior. */
    if (!avisos.length && dialogo.open) dialogo.close();
  }

  const textoCapacidad = (meta) => {
    const c = meta.servicios.capacidadRecuadros;
    if (!c) return '';
    return `En esta hoja caben ${c.tope} recuadro(s); hay ${c.colocados} dibujado(s)`
      + `${c.cabeOtro ? ' y aún queda hueco para otro.' : '.'}`;
  };

  function sincronizarUrl() {
    const p = aParametros(config);
    const cadena = p.toString();
    const url = cadena ? `${window.location.pathname}?${cadena}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }

  /* ------------------------------ controles ---------------------------- */
  $('ver-avisos').addEventListener('click', () => dialogo.showModal());
  /* Pulsar fuera del recuadro cierra, como se espera de una ventana de este tipo. */
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });

  $('acercar').addEventListener('click', () => vista.acercar());
  $('alejar').addEventListener('click', () => vista.alejar());
  $('ajustar').addEventListener('click', () => vista.ajustar());
  $('copiar-enlace').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      panel.progreso('Enlace copiado al portapapeles');
    } catch {
      panel.progreso('No se pudo copiar; la dirección de la barra ya tiene la configuración');
    }
  });

  document.body.classList.remove('cargando');
  await recomponer();
}

arrancar().catch((err) => {
  document.body.classList.remove('cargando');
  const aviso = $('arranque');
  if (aviso) {
    aviso.hidden = false;
    aviso.textContent = `No se pudo iniciar la aplicación: ${err.message}. `
      + 'Ejecuta «npm run preparar» antes de construir el sitio.';
  }
});
