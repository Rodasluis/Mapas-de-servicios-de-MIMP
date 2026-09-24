/**
 * Panel de configuración.
 *
 * Construye los controles a partir de los datos publicados —los tipos de servicio
 * salen de centros.json, no de una lista escrita a mano— y avisa al resto de la
 * aplicación cada vez que algo cambia.
 *
 * Todo se maneja con el teclado sin trucos: controles nativos (`select`, `input`,
 * `fieldset`, `legend`) con su etiqueta asociada. Un panel hecho de `div` con
 * `role="button"` obliga a reimplementar el foco, las flechas y el anuncio del estado,
 * y casi siempre se reimplementa peor.
 */
import { TAMANOS, ORIENTACIONES, siglaDe, subtituloDe } from './config.js';

const el = (etiqueta, atributos = {}, hijos = []) => {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'clase') nodo.className = v;
    else if (k === 'texto') nodo.textContent = v;
    else if (v !== null && v !== undefined && v !== false) nodo.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) if (h) nodo.appendChild(h);
  return nodo;
};

const grupo = (titulo, contenido) => el('fieldset', { clase: 'grupo' }, [
  el('legend', { texto: titulo }),
  ...[].concat(contenido),
]);

const campoTexto = (id, etiqueta, valor, alCambiar) => {
  const input = el('input', { type: 'text', id, value: valor ?? '' });
  input.addEventListener('input', () => alCambiar(input.value));
  return el('p', { clase: 'campo' }, [el('label', { for: id, texto: etiqueta }), input]);
};

const casilla = (id, etiqueta, activa, alCambiar) => {
  const input = el('input', { type: 'checkbox', id });
  input.checked = activa;
  input.addEventListener('change', () => alCambiar(input.checked));
  return el('label', { clase: 'casilla', for: id }, [input, el('span', { texto: etiqueta })]);
};

export function crearPanel({ contenedor, config, catalogo, alCambiar, alGenerar }) {
  const emitir = () => alCambiar(config);

  /* ------------------------------- hoja -------------------------------- */
  const selTamano = el('select', { id: 'tamano' });
  for (const t of TAMANOS) selTamano.appendChild(el('option', { value: t, texto: t }));
  selTamano.value = config.hoja.tamano;
  selTamano.addEventListener('change', () => { config.hoja.tamano = selTamano.value; emitir(); });

  const selOrientacion = el('select', { id: 'orientacion' });
  for (const o of ORIENTACIONES) {
    selOrientacion.appendChild(el('option', { value: o, texto: o === 'vertical' ? 'Vertical' : 'Horizontal' }));
  }
  selOrientacion.value = config.hoja.orientacion;
  selOrientacion.addEventListener('change', () => {
    config.hoja.orientacion = selOrientacion.value; emitir();
  });

  /* ------------------------------- ámbito ------------------------------- */

  /* Selector encadenado: el de provincia se rellena con las del departamento elegido.
     Una lista plana de las 196 provincias obligaría a buscar «Lima» entre tres
     entradas con ese nombre en departamentos distintos. Mientras el departamento sea
     «Perú», el de provincia se queda deshabilitado en vez de desaparecer: un control
     que aparece y desaparece mueve todo lo que tiene debajo cada vez que se toca. */
  const selDepartamento = el('select', { id: 'ambito' });
  selDepartamento.appendChild(el('option', { value: '', texto: 'Perú (nacional)' }));
  for (const d of catalogo.departamentos) {
    selDepartamento.appendChild(el('option', { value: d.id, texto: d.nombre }));
  }

  const selProvincia = el('select', { id: 'ambito-provincia' });
  const selDistrito = el('select', { id: 'ambito-distrito' });

  const llenarProvincias = (ccdd, elegida) => {
    selProvincia.innerHTML = '';
    selProvincia.appendChild(el('option', { value: '', texto: ccdd ? 'Todo el departamento' : '—' }));
    for (const p of catalogo.provincias.filter((x) => x.ccdd === ccdd)) {
      selProvincia.appendChild(el('option', { value: p.id, texto: p.nombre }));
    }
    selProvincia.value = elegida || '';
    selProvincia.disabled = !ccdd;
  };

  /* Los distritos salen de la CARTOGRAFÍA, no de centros.json. El catálogo del buscador
     sólo lista los que tienen algún centro, y un distrito sin servicios también se
     puede imprimir: su mapa dice que no hay ninguno y ofrece los más cercanos. */
  const llenarDistritos = (ccpp, elegido) => {
    selDistrito.innerHTML = '';
    selDistrito.appendChild(el('option', { value: '', texto: ccpp ? 'Toda la provincia' : '—' }));
    for (const d of (catalogo.distritosDe ? catalogo.distritosDe(ccpp) : [])) {
      selDistrito.appendChild(el('option', { value: d.id, texto: d.nombre }));
    }
    selDistrito.value = elegido || '';
    selDistrito.disabled = !ccpp;
  };

  const ambitoActual = () => {
    if (!selDepartamento.value) return { nivel: 'nacional', id: null };
    if (!selProvincia.value) return { nivel: 'departamento', id: selDepartamento.value };
    if (!selDistrito.value) return { nivel: 'provincia', id: selProvincia.value };
    return { nivel: 'distrito', id: selDistrito.value };
  };

  const departamentoInicial = config.ambito.id ? config.ambito.id.slice(0, 2) : '';
  const provinciaInicial = config.ambito.id && config.ambito.id.length >= 4
    ? config.ambito.id.slice(0, 4) : '';
  selDepartamento.value = departamentoInicial;
  llenarProvincias(departamentoInicial, provinciaInicial);
  llenarDistritos(provinciaInicial, config.ambito.nivel === 'distrito' ? config.ambito.id : '');

  /* Nombre del ámbito, para el subtítulo. */
  const nombreDeAmbito = (a) => {
    if (a.nivel === 'departamento') return (catalogo.departamentos.find((d) => d.id === a.id) || {}).nombre || '';
    if (a.nivel === 'provincia') return (catalogo.provincias.find((p) => p.id === a.id) || {}).nombre || '';
    if (a.nivel === 'distrito') {
      const lista = catalogo.distritosDe ? catalogo.distritosDe(a.id.slice(0, 4)) : [];
      return (lista.find((d) => d.id === a.id) || {}).nombre || '';
    }
    return '';
  };

  /* El subtítulo automático se enseña como MARCADOR del campo, no como su valor: el
     campo vacío significa «pon el del ámbito» y se ve cuál va a ser, mientras que un
     valor escrito por la aplicación no se distinguiría de uno escrito por una persona
     y habría que adivinar cuál pisar al cambiar de ámbito. */
  const sincronizarSubtitulo = () => {
    const campo = contenedor.querySelector('#subtitulo');
    if (campo) campo.placeholder = subtituloDe(config.ambito, nombreDeAmbito(config.ambito));
  };

  const alCambiarAmbito = () => {
    config.ambito = ambitoActual();
    sincronizarSubtitulo();
    llenarZonas();
    emitir();
  };
  selDepartamento.addEventListener('change', () => {
    llenarProvincias(selDepartamento.value, '');
    llenarDistritos('', '');
    alCambiarAmbito();
  });
  selProvincia.addEventListener('change', () => {
    llenarDistritos(selProvincia.value, '');
    alCambiarAmbito();
  });
  selDistrito.addEventListener('change', alCambiarAmbito);

  const bloqueHoja = grupo('Hoja y ámbito', [
    el('p', { clase: 'campo' }, [el('label', { for: 'tamano', texto: 'Tamaño' }), selTamano]),
    el('p', { clase: 'campo' }, [el('label', { for: 'orientacion', texto: 'Orientación' }), selOrientacion]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'ambito', texto: 'Departamento' }), selDepartamento,
    ]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'ambito-provincia', texto: 'Provincia' }), selProvincia,
    ]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'ambito-distrito', texto: 'Distrito' }), selDistrito,
    ]),
  ]);

  /* ------------------------------ textos ------------------------------- */
  const bloqueTextos = grupo('Textos', [
    campoTexto('titulo', 'Título', config.textos.titulo, (v) => { config.textos.titulo = v; emitir(); }),
    campoTexto('subtitulo', 'Subtítulo', config.textos.subtitulo, (v) => { config.textos.subtitulo = v; emitir(); }),
    campoTexto('periodo', 'Periodo', config.textos.periodo, (v) => { config.textos.periodo = v; emitir(); }),
    campoTexto('elaboradoPor', 'Elaborado por', config.textos.elaboradoPor, (v) => {
      config.textos.elaboradoPor = v; emitir();
    }),
  ]);

  /* --------------------------- tipos de servicio ----------------------- */
  const casillasTipo = new Map();
  const activos = () => [...casillasTipo.entries()].filter(([, c]) => c.checked).map(([t]) => t);

  const listaTipos = el('div', { clase: 'lista-tipos' });
  for (const tipo of catalogo.tipos) {
    const id = `tipo-${siglaDe(tipo).replace(/\W/g, '')}`;
    const input = el('input', { type: 'checkbox', id });
    input.checked = !config.tipos || config.tipos.includes(tipo);
    input.addEventListener('change', () => {
      const marcados = activos();
      /* Ningún tipo marcado no es un mapa vacío: es «todos». Un mapa en blanco sin
         explicación parece un fallo, y desmarcar el último es casi siempre un
         descuido, no una intención. */
      config.tipos = marcados.length === 0 || marcados.length === catalogo.tipos.length
        ? null : marcados;
      emitir();
    });
    casillasTipo.set(tipo, input);
    listaTipos.appendChild(el('label', { clase: 'casilla', for: id }, [
      input,
      el('span', { texto: `${tipo} (${catalogo.conteo.get(tipo) || 0})` }),
    ]));
  }

  const marcarTodos = (valor) => {
    for (const c of casillasTipo.values()) c.checked = valor;
    config.tipos = valor ? null : [];
    emitir();
  };
  const bloqueTipos = grupo('Tipos de servicio', [
    el('p', { clase: 'acciones-linea' }, [
      botón('Todos', () => marcarTodos(true)),
      botón('Ninguno', () => marcarTodos(false)),
    ]),
    listaTipos,
  ]);

  /* ------------------------------- capas ------------------------------- */
  const nombresCapa = {
    coropleta: 'Coropleta por unidad territorial',
    simbolos: 'Símbolos de servicios',
    grilla: 'Retícula UTM',
    rotulos: 'Nombres de departamentos y provincias',
    contexto: 'Nombres de países y del mar',
  };
  const bloqueCapas = grupo('Capas', Object.entries(nombresCapa).map(([clave, etiqueta]) => casilla(
    `capa-${clave}`, etiqueta, config.capas[clave] !== false,
    (v) => { config.capas[clave] = v; emitir(); },
  )));

  /* ------------------------------- piezas ------------------------------ */
  const nombresPieza = {
    institucional: 'Logotipo institucional',
    titulo: 'Caja de título',
    leyenda: 'Leyenda',
    escala: 'Escala gráfica',
    norte: 'Rosa de los vientos',
    ubicacion: 'Mapa de ubicación',
  };
  const bloquePiezas = grupo('Elementos del layout', Object.entries(nombresPieza).map(([clave, etiqueta]) => casilla(
    `pieza-${clave}`, etiqueta, config.piezas[clave] !== false,
    (v) => { config.piezas[clave] = v; emitir(); },
  )));

  /* -------------------------------- zoom ------------------------------- */
  const selZoom = el('select', { id: 'zoom-modo' });
  for (const [valor, texto] of [
    ['auto', 'Automáticos (donde los símbolos no caben)'],
    ['manual', 'Elegir zonas'],
    ['ninguno', 'Ninguno'],
  ]) selZoom.appendChild(el('option', { value: valor, texto }));
  selZoom.value = config.zoom.modo;

  /**
   * Las zonas se eligen bajando por la jerarquía, no de una lista plana.
   *
   * Antes era un `select multiple` con todo lo ampliable del ámbito: en el nacional,
   * 196 provincias entre las que hay que reconocer «Lima» de tres que se llaman igual,
   * y con la tecla de control pulsada para marcar más de una. Tres desplegables
   * encadenados —departamento, provincia, distrito— llegan a la zona en tres decisiones
   * cortas, y lo elegido se acumula en una lista con su botón de quitar: se ve qué se ha
   * pedido sin tener que releer una selección múltiple.
   *
   * Cada nivel se ofrece sólo mientras signifique algo. Los de arriba los fija el ámbito
   * —en un mapa de Cusco el departamento no se elige— y el de abajo se apaga cuando el
   * mapa no dibuja esa unidad: el nacional amplía provincias, así que pedir un distrito
   * daría una zona que el motor descartaría sin que se entendiera por qué.
   */
  const selZonaDep = el('select', { id: 'zona-departamento' });
  const selZonaProv = el('select', { id: 'zona-provincia' });
  const selZonaDist = el('select', { id: 'zona-distrito' });
  const listaZonas = el('ul', { clase: 'lista-zonas', id: 'zonas-elegidas' });
  const notaNivel = el('p', { clase: 'nota' });
  const botonAnadir = el('button', { type: 'button', clase: 'enlace', id: 'zona-anadir' },
    [el('span', { texto: 'Añadir zona' })]);

  const camposZona = [
    el('p', { clase: 'campo' }, [
      el('label', { for: 'zona-departamento', texto: 'Departamento' }), selZonaDep,
    ]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'zona-provincia', texto: 'Provincia' }), selZonaProv,
    ]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'zona-distrito', texto: 'Distrito' }), selZonaDist,
    ]),
  ];

  /**
   * Qué puede ser una zona en cada ámbito, en dígitos de ubigeo —2 departamento,
   * 4 provincia, 6 distrito—.
   *
   * El techo lo pone la unidad que el mapa dibuja: el nacional colorea provincias, así
   * que un distrito no es nada que pueda ampliar. El suelo lo pone la ZONA, que es el
   * nivel por el que el motor agrupa y titula cada recuadro: en un mapa provincial cada
   * recuadro es un distrito, así que pedir «toda la provincia» no daría un recuadro sino
   * uno por cada distrito que tiene.
   */
  const RANGO_DE_ZONA = {
    nacional: [2, 4],
    departamento: [4, 6],
    provincia: [6, 6],
    /* El distrital no lleva recuadros: la zona sería el propio distrito. */
    distrito: [0, 0],
  };

  const NOTA_NIVEL = {
    nacional: 'El mapa del Perú amplía provincias: elige un departamento entero o una de sus provincias.',
    departamento: 'El mapa departamental amplía distritos: elige una provincia entera o uno de sus distritos.',
    provincia: 'El mapa provincial amplía un distrito cada vez: elige uno.',
    distrito: 'Un mapa distrital no lleva recuadros: la zona sería el propio distrito y el recuadro'
      + ' repetiría el mapa a su lado.',
  };

  /** Rellena un desplegable conservando lo ya elegido si sigue estando en la lista. */
  const rellenar = (sel, lista, vacio, fijo) => {
    const previo = fijo || sel.value;
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', texto: vacio }));
    for (const x of lista) sel.appendChild(el('option', { value: x.id, texto: x.nombre }));
    sel.value = [...sel.options].some((o) => o.value === previo) ? previo : '';
  };

  const sincronizarZonas = () => {
    const a = ambitoActual();
    const [minimo, hondo] = RANGO_DE_ZONA[a.nivel];
    const depFijo = a.id ? a.id.slice(0, 2) : '';
    const provFija = a.id && a.id.length >= 4 ? a.id.slice(0, 4) : '';

    rellenar(selZonaDep, catalogo.departamentos, 'Elige un departamento', depFijo);
    selZonaDep.disabled = Boolean(depFijo);

    /* La opción vacía de cada nivel dice si quedarse ahí ya es una zona: «Todo el
       departamento» sólo cuando un departamento entero puede ser un recuadro, y «Elige
       una provincia» cuando hay que seguir bajando. */
    const ccdd = selZonaDep.value;
    rellenar(
      selZonaProv,
      ccdd ? catalogo.provincias.filter((p) => p.ccdd === ccdd) : [],
      !ccdd ? '—' : (minimo <= 2 ? 'Todo el departamento' : 'Elige una provincia'),
      provFija,
    );
    selZonaProv.disabled = Boolean(provFija) || !ccdd;

    const ccpp = selZonaProv.value;
    /* Pedir los distritos aquí dispara su carga si aún no están; cuando lleguen, la
       aplicación llama a refrescarDistritos() y este desplegable se rellena solo. */
    const distritos = hondo >= 6 && ccpp && catalogo.distritosDe ? catalogo.distritosDe(ccpp) : [];
    let vacioDistrito = '—';
    if (hondo < 6) vacioDistrito = 'No se amplían distritos en este mapa';
    else if (ccpp) vacioDistrito = minimo <= 4 ? 'Toda la provincia' : 'Elige un distrito';
    rellenar(selZonaDist, distritos, vacioDistrito);
    selZonaDist.disabled = hondo < 6 || !ccpp;

    notaNivel.textContent = NOTA_NIVEL[a.nivel] || '';
    for (const campo of camposZona) campo.hidden = hondo === 0;
    botonAnadir.hidden = hondo === 0;
    listaZonas.hidden = hondo === 0;

    /* El botón se apaga en vez de no hacer nada al pulsarlo: si falta bajar un nivel más,
       lo dice el botón apagado junto al desplegable que hay que tocar. */
    const elegida = zonaElegida();
    botonAnadir.disabled = !elegida
      || elegida.length < minimo
      || config.zoom.seleccion.includes(elegida);
  };

  /** El ubigeo más profundo que se haya elegido, o null si no hay ninguno. */
  const zonaElegida = () => selZonaDist.value || selZonaProv.value || selZonaDep.value || null;

  /** Nombre legible de un ubigeo, de lo más concreto a lo más general. */
  const nombreDeZona = (id) => {
    const partes = [];
    if (id.length >= 6) {
      const lista = catalogo.distritosDe ? catalogo.distritosDe(id.slice(0, 4)) : [];
      partes.push((lista.find((d) => d.id === id) || {}).nombre || id);
    }
    if (id.length >= 4) {
      partes.push((catalogo.provincias.find((p) => p.id === id.slice(0, 4)) || {}).nombre || id.slice(0, 4));
    }
    partes.push((catalogo.departamentos.find((d) => d.id === id.slice(0, 2)) || {}).nombre || id.slice(0, 2));
    return partes.join(' · ');
  };

  const pintarZonas = () => {
    listaZonas.innerHTML = '';
    for (const id of config.zoom.seleccion) {
      const nombre = nombreDeZona(id);
      const quitar = el('button', {
        type: 'button', clase: 'enlace', 'aria-label': `Quitar ${nombre}`,
      }, [el('span', { texto: 'Quitar' })]);
      quitar.addEventListener('click', () => {
        config.zoom.seleccion = config.zoom.seleccion.filter((x) => x !== id);
        pintarZonas();
        sincronizarZonas();
        emitir();
      });
      listaZonas.appendChild(el('li', {}, [el('span', { texto: nombre }), quitar]));
    }
    if (!config.zoom.seleccion.length) {
      listaZonas.appendChild(el('li', { clase: 'vacia', texto: 'Ninguna zona elegida todavía.' }));
    }
  };

  botonAnadir.addEventListener('click', () => {
    const id = zonaElegida();
    if (!id || config.zoom.seleccion.includes(id)) return;
    config.zoom.seleccion = [...config.zoom.seleccion, id];
    pintarZonas();
    sincronizarZonas();
    emitir();
  });
  selZonaDep.addEventListener('change', sincronizarZonas);
  selZonaProv.addEventListener('change', sincronizarZonas);
  selZonaDist.addEventListener('change', sincronizarZonas);

  const llenarZonas = () => {
    /* Al cambiar de ámbito, parte de lo elegido antes puede quedar fuera de lo que el
       mapa dibuja. Se descarta en vez de arrastrarlo: una zona que ya no está en el mapa
       seguiría contando en la URL sin aparecer en ninguna parte, y el motor la
       descartaría en silencio. */
    const a = ambitoActual();
    const [minimo, hondo] = RANGO_DE_ZONA[a.nivel];
    config.zoom.seleccion = config.zoom.seleccion.filter(
      (id) => (!a.id || id.startsWith(a.id)) && id.length >= minimo && id.length <= hondo,
    );
    sincronizarZonas();
    pintarZonas();
  };
  llenarZonas();

  /* Un `fieldset` anidado con su `legend`, y no un `div` con un párrafo en negrita: así
     «Zonas a ampliar» es el nombre del grupo también para un lector de pantalla, que
     anuncia los tres desplegables como tres pasos de lo mismo. */
  const campoZonas = el('fieldset', { clase: 'zonas' }, [
    el('legend', { texto: 'Zonas a ampliar' }),
    notaNivel,
    ...camposZona,
    el('p', { clase: 'acciones-linea' }, [botonAnadir]),
    listaZonas,
  ]);
  const avisoZoom = el('p', { clase: 'nota', id: 'aviso-zoom' });

  const sincronizarZoom = () => {
    campoZonas.hidden = selZoom.value !== 'manual';
    avisoZoom.hidden = selZoom.value !== 'manual';
  };
  selZoom.addEventListener('change', () => {
    config.zoom.modo = selZoom.value;
    sincronizarZoom();
    emitir();
  });
  sincronizarZoom();

  const bloqueZoom = grupo('Recuadros de zoom', [
    el('p', { clase: 'campo' }, [el('label', { for: 'zoom-modo', texto: 'Modo' }), selZoom]),
    campoZonas,
    avisoZoom,
  ]);

  /* ------------------------------ generar ------------------------------ */
  const botonGenerar = el('button', { type: 'button', clase: 'generar', id: 'generar' },
    [el('span', { texto: 'Generar PDF' })]);
  botonGenerar.addEventListener('click', () => alGenerar());
  const progreso = el('p', { clase: 'progreso', id: 'progreso', role: 'status', 'aria-live': 'polite' });

  contenedor.append(
    bloqueHoja, bloqueTextos, bloqueTipos, bloqueZoom, bloqueCapas, bloquePiezas,
    el('div', { clase: 'pie-panel' }, [botonGenerar, progreso]),
  );

  // El marcador del subtítulo necesita el campo ya insertado para poder encontrarlo.
  sincronizarSubtitulo();

  return {
    /**
     * Rehace las listas de distritos cuando su cartografía termina de cargarse.
     *
     * Son dos: la del ámbito y la de las zonas a ampliar. También se repinta la lista de
     * zonas elegidas, porque una que viniera en la URL se muestra por su ubigeo hasta
     * que llegan los nombres.
     */
    refrescarDistritos() {
      llenarDistritos(selProvincia.value, config.ambito.nivel === 'distrito' ? config.ambito.id : '');
      sincronizarZonas();
      pintarZonas();
    },

    /** Mensaje de estado del botón de generación. */
    progreso(texto, ocupado = false) {
      progreso.textContent = texto || '';
      botonGenerar.disabled = ocupado;
      botonGenerar.setAttribute('aria-busy', ocupado ? 'true' : 'false');
    },
    /** Aviso propio del bloque de zoom (capacidad de la hoja, zonas demasiado grandes). */
    avisoZoom(texto) { avisoZoom.textContent = texto || ''; },
  };
}

function botón(texto, alPulsar) {
  const b = el('button', { type: 'button', clase: 'enlace' }, [el('span', { texto })]);
  b.addEventListener('click', alPulsar);
  return b;
}
