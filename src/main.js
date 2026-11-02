/**
 * Aplicación: panel de configuración, vista previa y descarga del PDF.
 *
 * El mismo SVG alimenta la pantalla y el PDF, y la descarga usa exactamente las
 * mismas funciones que `npm run muestras`. Eso no es una comodidad de implementación:
 * es lo que permite afirmar que lo revisado en pantalla y lo que sale de la imprenta
 * son el mismo documento.
 *
 * La composición se hace a petición y con freno: cada tecla del título no puede
 * disparar un mapa nacional entero, que en A0 tarda trece segundos. Desde la Fase 22
 * se hace además en SEGUNDO PLANO (src/trabajador.js): la página sigue respondiendo
 * mientras se compone, y un cambio nuevo descarta la composición que ya no sirve.
 */
import './estilo/fuentes.css';
import './estilo/app.css';
import { aplicarVariablesCss, color } from './estilo/tokens.js';
import { crearHoja } from './motor/hoja.js';
import { crearCargador, lectorNavegador } from './motor/cargador.js';
import { componer } from './motor/render.js';
import { aPdf, lectorTtfNavegador } from './motor/pdf.js';
import { crearPanel } from './ui/panel.js';
import { crearVista } from './ui/vista.js';
import { crearCompositor } from './ui/compositor.js';
import {
  desdeParametros, aParametros, aLlamadasDelMotor, nombreDeArchivo, NOMBRE_NIVEL, TAMANOS,
} from './ui/config.js';

const BASE = import.meta.env.BASE_URL;
const cargador = crearCargador(lectorNavegador(BASE));
const leerTtf = lectorTtfNavegador(BASE);

/* Componer fuera de la página. Si el navegador no admite trabajadores de tipo módulo,
   se compone aquí mismo, como hasta la Fase 21: el mapa es el mismo, sólo que la
   página se queda quieta mientras tanto. */
const compositor = crearCompositor({
  crearTrabajador: () => new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module' }),
  componerAqui: (hoja, composicion) => componer({ hoja: crearHoja(hoja), cargador, ...composicion }),
});

aplicarVariablesCss();
ponerIconoDePestana();

/**
 * Ícono de la pestaña: un marcador de mapa en el rojo institucional. Se compone aquí y
 * no en un archivo aparte para que el rojo salga de tokens.js, que es donde se define.
 */
function ponerIconoDePestana() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + `<path d="M16 1.5C9.6 1.5 4.6 6.4 4.6 12.7 4.6 21 16 30.5 16 30.5S27.4 21 27.4 12.7C27.4 6.4 22.4 1.5 16 1.5z" fill="${color.mimpRojo}"/>`
    + '<circle cx="16" cy="12.6" r="4.6" fill="#fff"/></svg>';
  const enlace = document.createElement('link');
  enlace.rel = 'icon';
  enlace.type = 'image/svg+xml';
  enlace.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  document.head.appendChild(enlace);
}

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

  /* Los lugares del buscador (Fase 23) no son imprescindibles: sin ellos el panel
     arranca igual, sin buscador. */
  const [centros, lugares] = await Promise.all([
    cargador.centros(), cargador.lugares().catch(() => null), fuentesListas(),
  ]);
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
    /* Sólo los distritos CON algún centro: son los únicos que centros.json cataloga, y
       también los únicos que tiene sentido ofrecer para AMPLIAR. */
    distritos: [...centros.catalogo.distritos].sort(porNombre),
    /* Todos los departamentos, provincias y distritos, para el buscador. */
    lugares,

    /**
     * Distritos de una provincia, leídos de la CARTOGRAFÍA.
     *
     * Para elegir el ámbito no sirve el catálogo de centros.json, que sólo lista los que
     * tienen algún centro: un distrito sin servicios también se puede imprimir, y su
     * mapa es justamente el que dice que no hay ninguno y ofrece los más cercanos. Se
     * cargan por departamento y se recuerdan, porque el selector los vuelve a pedir
     * cada vez que se cambia de provincia dentro del mismo departamento.
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

  /* De qué corte del directorio salen los servicios. Hasta la Fase 22 sólo lo decían
     las propiedades del PDF; quien prepara un mapa tiene que poder verlo antes de
     imprimirlo. */
  cargador.version().then((v) => {
    const nodo = $('version-datos');
    if (!nodo || !v) return;
    const [anio, mes, dia] = String(v.generado || '').split('-');
    nodo.textContent = `Directorio Nacional de Servicios del MIMP${dia ? ` publicado el ${dia}/${mes}/${anio}` : ''}`
      + ` · ${v.totalCentros ?? centros.centros.length} centros de atención`;
    nodo.hidden = false;
  }).catch(() => {});

  let ultimo = null;
  /* Cada composición lleva un número; sólo se muestra la que corresponde a la última
     petición. Una respuesta vieja que llegue tarde no puede pisar a la nueva. */
  let secuencia = 0;
  let reloj = null;

  /* El ámbito puede venir de la URL, así que los distritos de su departamento hacen
     falta desde el primer dibujo. El VRAEM no es un departamento: los suyos los pide el
     motor. */
  const pedirDistritosDelAmbito = () => {
    if (config.ambito.id && config.ambito.nivel !== 'vraem') pedirDistritos(config.ambito.id.slice(0, 2));
  };
  pedirDistritosDelAmbito();

  const panel = crearPanel({
    contenedor: $('panel'),
    config,
    catalogo,
    alCambiar: () => programarComposicion(),
    alGenerar: () => generar(),
  });

  /* ----------------------------- composición --------------------------- */

  /* El reloj de la espera: en A0 por distritos son veinte segundos, y un «Componiendo…»
     quieto durante veinte segundos parece una aplicación colgada. Va aparte del mensaje
     de estado, que es el que leen los lectores de pantalla: anunciar cada segundo sería
     ruido. */
  const empezarReloj = () => {
    const inicio = Date.now();
    clearInterval(reloj);
    panel.reloj(0);
    reloj = setInterval(() => panel.reloj(Math.round((Date.now() - inicio) / 1000)), 1000);
  };
  const pararReloj = () => { clearInterval(reloj); reloj = null; panel.reloj(null); };

  /* Compone y muestra. Se llama «recomponer» y no «componer» porque el motor exporta
     una función con ese nombre: llamarlas igual hacía que ésta se invocara a sí misma. */
  async function recomponer() {
    const id = ++secuencia;
    const hoja = crearHoja(config.hoja);
    const llamadas = aLlamadasDelMotor(config);
    vista.ocupado(true);
    panel.progreso('Componiendo el mapa…', true);
    empezarReloj();
    try {
      const { svg, meta } = await compositor.componer({ ...config.hoja }, llamadas.composicion);
      if (id !== secuencia) return;
      ultimo = { svg, meta, hoja, pdf: llamadas.pdf };
      vista.mostrar(svg, hoja);
      mostrarResumen(meta);
      mostrarAvisos(meta, config);
      panel.avisoZoom(textoCapacidad(meta));
      panel.progreso('');
      sincronizarUrl();
    } catch (err) {
      if (err.cancelada || id !== secuencia) return;
      /* Sin mapa nuevo no se descarga el viejo: no corresponde a lo que hay elegido. */
      ultimo = null;
      panel.progreso(`No se pudo componer el mapa: ${err.message}`, false, { puedeGenerar: false });
      $('avisos').innerHTML = '';
    } finally {
      if (id === secuencia) {
        vista.ocupado(false);
        pararReloj();
      }
    }
  }

  /**
   * Freno. Escribir un título dispararía una composición por tecla. Lo que importa es
   * el último estado, no los intermedios: si ya hay una composición en marcha, la nueva
   * la sustituye (ui/compositor.js).
   */
  let temporizador = null;
  function programarComposicion() {
    clearTimeout(temporizador);
    /* Desde el primer cambio, el mapa de la vista ya no es el de la configuración: no se
       puede descargar hasta que se recomponga. */
    panel.mapaDesactualizado();
    /* Ningún tipo marcado: no hay mapa que componer hasta que se marque alguno. Antes se
       componía con TODOS, de modo que «Ninguno» llenaba el mapa justo cuando se iba a
       elegir. La composición en curso, si la hay, deja de valer. */
    if (config.tipos && config.tipos.length === 0) {
      secuencia++;
      pararReloj();
      vista.ocupado(false);
      panel.progreso('Marca al menos un tipo de servicio para componer el mapa.', false, { puedeGenerar: false });
      return;
    }
    temporizador = setTimeout(recomponer, 260);
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
    /* En palabras de quien prepara el mapa, no del motor: «Detalle medio (±300 m)» no
       le decía nada a quien no es cartógrafo (revisión de uso de la Fase 22). */
    const tipos = meta.servicios.tipos.length;
    const filas = [
      ['Escala', meta.escala],
      ['Precisión de los límites', `±${{ bajo: 1200, medio: 300, alto: 40 }[meta.nivel]} m`],
      ['Centros de atención', `${meta.servicios.totalDibujado} de ${tipos} tipo${tipos === 1 ? '' : 's'} de servicio`],
      ['Nombres puestos', Object.entries(meta.etiquetas.porNivel)
        .map(([n, v]) => `${NOMBRE_NIVEL[n] || n} ${v.colocados} de ${v.total}`).join(' · ') || '—'],
      ['Recuadros', meta.servicios.recuadros.length
        ? meta.servicios.recuadros.map((z) => z.etiqueta).join(', ') : 'ninguno'],
    ];
    /* Las capas de la Fase 23, sólo si se dibujó alguna. */
    const sp = meta.superposiciones || {};
    const capas = [
      sp.redes?.rios ? 'ríos' : '',
      sp.redes?.viasNacional || sp.redes?.viasDepartamental ? 'vías' : '',
      sp.vraem ? 'VRAEM' : '',
      sp.puntosPropios ? `${sp.puntosPropios} puntos propios` : '',
    ].filter(Boolean);
    if (capas.length) filas.push(['Capas adicionales', capas.join(' · ')]);
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
  /**
   * Cambia el tamaño de hoja como si se hubiera elegido en el panel: el mismo control,
   * el mismo evento, así la URL, el panel y el mapa siguen sincronizados.
   */
  const usarHoja = (tamano) => {
    const selector = $('tamano');
    if (!selector || selector.value === tamano) return;
    selector.value = tamano;
    selector.dispatchEvent(new Event('change'));
    dialogo.close();
  };
  /** Lo mismo con el nivel de división, si el ámbito lo admite. */
  const usarDivision = (division) => {
    const selector = $('division');
    if (!selector || ![...selector.options].some((o) => o.value === division)) return;
    selector.value = division;
    selector.dispatchEvent(new Event('change'));
    dialogo.close();
  };
  /** La hoja siguiente en tamaño, o nada si ya es la mayor. */
  const hojaMayor = (tamano) => TAMANOS[TAMANOS.indexOf(tamano) + 1] || null;
  const conHojaMayor = (cfg) => {
    const mayor = hojaMayor(cfg.hoja.tamano);
    return mayor ? { etiqueta: `Probar en ${mayor}`, accion: () => usarHoja(mayor) } : null;
  };
  const lista = (nombres, cuantos = 5) => `${nombres.slice(0, cuantos).join(', ')}${nombres.length > cuantos ? '…' : ''}`;

  function mostrarAvisos(meta, cfg) {
    /* Cada aviso dice qué falta en lenguaje llano y, cuando el remedio es una hoja
       mayor, lo ofrece con un botón. Hasta la Fase 22 hablaban el idioma del motor
       («7 posiciones probadas: 0 fuera del marco, 7 sobre un bloque»). */
    const avisos = [];
    const avisar = (texto, accion = null) => avisos.push({ texto, accion });
    const s = meta.servicios;

    if (s.gruposApinados.length > 12) {
      const unidades = NOMBRE_NIVEL[meta.ambito.agregacion] || 'unidades';
      avisar(`En ${meta.hoja} los íconos se tocan en ${s.gruposApinados.length} ${unidades}.`
        + ' Se leen mejor en una hoja mayor o con menos tipos de servicio.', conHojaMayor(cfg));
    }
    /* El país partido en distritos se dibuja en cualquier hoja, pero por debajo de A1
       muchos distritos de la sierra miden menos de dos milímetros y sus límites se
       juntan en manchas grises. Se dice antes de que alguien lo descubra impreso. */
    if (meta.ambito.nivel === 'nacional' && meta.ambito.division === 'distrito'
      && TAMANOS.indexOf(cfg.hoja.tamano) < TAMANOS.indexOf('A1')) {
      avisar(`El mapa del Perú por distritos se lee bien desde A1. En ${cfg.hoja.tamano} muchos`
        + ' distritos miden menos de 2 mm y sus límites se juntan.', { etiqueta: 'Usar A1', accion: () => usarHoja('A1') });
    }
    const omitidos = meta.etiquetas.omitidos;
    if (omitidos.length) {
      avisar(`${omitidos.length === 1 ? 'Un nombre no cabe' : `${omitidos.length} nombres no caben`} en esta hoja:`
        + ` ${lista(omitidos)}. En una hoja mayor caben más.`, conHojaMayor(cfg));
    }
    for (const a of meta.servicios.avisosRecuadros || []) avisar(a);

    /* La distancia se mide desde el centro de cada unidad: con provincias enteras, una
       provincia grande sale «lejos» aunque tenga distritos junto a un servicio. */
    if (meta.servicios.variable === 'cobertura' && meta.ambito.agregacion !== 'distrito') {
      const unidad = meta.ambito.agregacion === 'departamento' ? 'departamento' : 'provincia';
      avisar(`La distancia se mide desde el centro de cada ${unidad}. Dividido hasta distritos`
        + ' se ve dónde están de verdad las brechas.', { etiqueta: 'Dividir hasta distritos', accion: () => usarDivision('distrito') });
    }

    /* Datos propios (Fase 23): de otro nivel que el del mapa no colorean nada, y unos
       puntos que caen todos fuera del ámbito no se ven. Las dos cosas se dicen. */
    const vp = meta.superposiciones?.valoresPropios;
    if (vp?.nivelDistinto) {
      avisar(`Tus datos son por ${vp.nivel} y este mapa está dividido en ${NOMBRE_NIVEL[meta.ambito.agregacion] || 'otras unidades'}:`
        + ' el color sale «Sin dato».', { etiqueta: `Dividir hasta ${vp.nivel}s`, accion: () => usarDivision(vp.nivel) });
    }
    const dp = cfg.datosPropios;
    if (dp?.puntos?.length && dp.mostrarPuntos !== false && !meta.superposiciones?.puntosPropios) {
      avisar(`Ninguno de los ${dp.puntos.length} puntos de «${dp.archivo}» cae dentro de este ámbito.`);
    }

    /* Un nombre de país que falta se nota; saber por qué falta no, y sin eso parece un
       descuido del programa. El caso normal es que un recuadro de zoom o la leyenda
       ocupen el hueco. El motivo técnico queda en meta.rotulos.motivos. */
    const paisesFuera = (meta.rotulos.omitidos || [])
      .filter((n) => n === n.toLocaleUpperCase('es') && !n.startsWith('OCÉANO') && !n.startsWith('LAGO'));
    if (paisesFuera.length) {
      avisar(`No se escribe el nombre de ${lista(paisesFuera)}: su sitio lo ocupan la leyenda,`
        + ' un recuadro u otro elemento, y escribirlo sobre el Perú confundiría.');
    }
    if (meta.layout.omitidas.length) {
      avisar(`No caben en la hoja: ${meta.layout.omitidas.join(', ')}. Prueba una hoja mayor`
        + ' o apaga otro elemento en «Layout».', conHojaMayor(cfg));
    }

    $('avisos').innerHTML = '';
    for (const { texto, accion } of avisos) {
      const li = document.createElement('li');
      const p = document.createElement('span');
      p.textContent = texto;
      li.appendChild(p);
      if (accion) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'secundario accion-aviso';
        b.textContent = accion.etiqueta;
        b.addEventListener('click', accion.accion);
        li.appendChild(b);
      }
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
      panel.progreso(config.datosPropios
        ? 'Enlace copiado. No lleva los datos propios: quien lo abra tendrá que cargarlos.'
        : 'Enlace copiado al portapapeles');
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
