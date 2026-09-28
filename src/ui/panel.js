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

  /* Los distritos salen de la CARTOGRAFÍA, no de centros.json. El catálogo de centros.json
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

  /* El modo va en botones de opción y no en una lista desplegable: son tres opciones y
     se ven todas sin abrir nada. El grupo es un fieldset propio, con su leyenda, que es
     lo que un lector de pantalla anuncia al entrar en él. */
  const MODOS_ZOOM = [
    ['auto', 'Automáticos (donde los símbolos no caben)'],
    ['manual', 'Elegir zonas'],
    ['ninguno', 'Ninguno'],
  ];
  const grupoModo = el('fieldset', { clase: 'opciones', id: 'zoom-modo' }, [el('legend', { texto: 'Modo' })]);
  const radiosModo = MODOS_ZOOM.map(([valor, texto]) => {
    const input = el('input', {
      type: 'radio', name: 'zoom-modo', id: `zoom-modo-${valor}`, value: valor,
    });
    input.checked = config.zoom.modo === valor;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      config.zoom.modo = valor;
      sincronizarZoom();
      emitir();
    });
    grupoModo.appendChild(el('label', { clase: 'casilla', for: input.id }, [input, el('span', { texto })]));
    return input;
  });

  /* Zonas elegidas a mano: tres selectores encadenados —departamento, provincia y
     distrito— y un botón que añade lo elegido a la lista. Se amplía el nivel más fino
     que se haya elegido: con sólo el departamento, el departamento; con la provincia,
     la provincia. La lista permite pedir varios recuadros, uno por zona. */
  const selZonaDep = el('select', { id: 'zoom-departamento' });
  const selZonaProv = el('select', { id: 'zoom-provincia' });
  const selZonaDist = el('select', { id: 'zoom-distrito' });
  const botonAnadir = el('button', { type: 'button', clase: 'secundario', id: 'zoom-anadir' },
    [el('span', { texto: 'Añadir zona' })]);
  const listaZonas = el('ul', { clase: 'zonas-elegidas', id: 'zoom-zonas', 'aria-label': 'Zonas a ampliar' });
  const notaZonas = el('p', { clase: 'nota', id: 'nota-zonas', 'aria-live': 'polite' });

  const opcion = (value, texto) => el('option', { value, texto });
  const nombreDep = (id) => (catalogo.departamentos.find((d) => d.id === id) || {}).nombre || id;
  const nombreProv = (id) => (catalogo.provincias.find((p) => p.id === id) || {}).nombre || id;
  const nombreDist = (id) => ((catalogo.distritosDe ? catalogo.distritosDe(id.slice(0, 4)) : [])
    .find((d) => d.id === id) || catalogo.distritos.find((d) => d.id === id) || {}).nombre || id;
  const nombreZona = (id) => {
    if (id.length === 2) return nombreDep(id);
    if (id.length === 4) return `${nombreProv(id)} (${nombreDep(id.slice(0, 2))})`;
    return `${nombreDist(id)} (${nombreProv(id.slice(0, 4))})`;
  };

  /**
   * Qué se puede ampliar en el ámbito actual. Un recuadro amplía algo que el mapa
   * dibuja: el nacional dibuja provincias, así que se amplían departamentos o
   * provincias, y un distrito, que no está en ese mapa, no se ofrece. El departamental
   * y el provincial dibujan distritos. Los niveles por encima del ámbito los fija él
   * mismo: en el mapa de Cusco no se elige otro departamento. En el distrital no hay
   * nada por debajo que ampliar.
   *
   * `minimo` es la longitud mínima del ubigeo elegido: ampliar Cusco entero dentro del
   * mapa de Cusco repetiría el mapa.
   */
  const reglasZona = () => {
    const a = ambitoActual();
    if (a.nivel === 'nacional') return { dep: null, prov: null, distrito: false, minimo: 2 };
    if (a.nivel === 'departamento') return { dep: a.id, prov: null, distrito: true, minimo: 4 };
    if (a.nivel === 'provincia') return { dep: a.id.slice(0, 2), prov: a.id, distrito: true, minimo: 6 };
    return null;
  };

  /** ¿Sirve este ubigeo como zona en el ámbito actual? */
  const zonaValida = (id, r = reglasZona()) => Boolean(r)
    && id.length >= r.minimo
    && (r.distrito || id.length <= 4)
    && id.startsWith(r.prov || r.dep || '');

  const llenarZonaDep = () => {
    const r = reglasZona();
    selZonaDep.innerHTML = '';
    if (r && r.dep) {
      selZonaDep.appendChild(opcion(r.dep, nombreDep(r.dep)));
      selZonaDep.value = r.dep;
      selZonaDep.disabled = true;
      return;
    }
    selZonaDep.appendChild(opcion('', r ? '— Elige un departamento —' : '—'));
    if (r) for (const d of catalogo.departamentos) selZonaDep.appendChild(opcion(d.id, d.nombre));
    selZonaDep.disabled = !r;
  };

  const llenarZonaProv = () => {
    const r = reglasZona();
    const ccdd = selZonaDep.value;
    selZonaProv.innerHTML = '';
    if (r && r.prov) {
      selZonaProv.appendChild(opcion(r.prov, nombreProv(r.prov)));
      selZonaProv.value = r.prov;
      selZonaProv.disabled = true;
      return;
    }
    selZonaProv.appendChild(opcion('', !r || !ccdd ? '—' : r.minimo <= 2 ? 'Todo el departamento' : '— Elige una provincia —'));
    if (r && ccdd) {
      for (const p of catalogo.provincias.filter((x) => x.ccdd === ccdd)) selZonaProv.appendChild(opcion(p.id, p.nombre));
    }
    selZonaProv.disabled = !r || !ccdd;
  };

  const llenarZonaDist = (elegido = '') => {
    const r = reglasZona();
    const ccpp = selZonaProv.value;
    selZonaDist.innerHTML = '';
    if (r && !r.distrito) {
      selZonaDist.appendChild(opcion('', 'No disponible en el mapa nacional'));
      selZonaDist.disabled = true;
      return;
    }
    selZonaDist.appendChild(opcion('', !r || !ccpp ? '—' : r.minimo <= 4 ? 'Toda la provincia' : '— Elige un distrito —'));
    if (r && ccpp) {
      for (const d of (catalogo.distritosDe ? catalogo.distritosDe(ccpp) : [])) selZonaDist.appendChild(opcion(d.id, d.nombre));
    }
    selZonaDist.value = elegido;
    selZonaDist.disabled = !r || !ccpp;
  };

  const zonaElegida = () => selZonaDist.value || selZonaProv.value || selZonaDep.value || '';
  const sincronizarBoton = () => {
    const z = zonaElegida();
    botonAnadir.disabled = !zonaValida(z) || config.zoom.seleccion.includes(z);
  };

  const pintarZonas = () => {
    listaZonas.innerHTML = '';
    for (const id of config.zoom.seleccion) {
      const nombre = nombreZona(id);
      const quitar = el('button', {
        type: 'button', clase: 'enlace', 'aria-label': `Quitar ${nombre}`,
      }, [el('span', { texto: 'Quitar' })]);
      quitar.addEventListener('click', () => {
        config.zoom.seleccion = config.zoom.seleccion.filter((x) => x !== id);
        pintarZonas();
        sincronizarBoton();
        emitir();
      });
      listaZonas.appendChild(el('li', {}, [el('span', { texto: nombre }), quitar]));
    }
    listaZonas.hidden = !config.zoom.seleccion.length;
    notaZonas.textContent = !reglasZona()
      ? 'En un mapa distrital no hay zonas que ampliar.'
      : config.zoom.seleccion.length ? '' : 'Aún no hay zonas: elige una y pulsa «Añadir zona».';
  };

  selZonaDep.addEventListener('change', () => { llenarZonaProv(); llenarZonaDist(); sincronizarBoton(); });
  selZonaProv.addEventListener('change', () => { llenarZonaDist(); sincronizarBoton(); });
  selZonaDist.addEventListener('change', sincronizarBoton);
  botonAnadir.addEventListener('click', () => {
    const z = zonaElegida();
    if (!zonaValida(z) || config.zoom.seleccion.includes(z)) return;
    config.zoom.seleccion = [...config.zoom.seleccion, z];
    pintarZonas();
    sincronizarBoton();
    emitir();
  });

  /**
   * Rehace los selectores y la lista para el ámbito actual. Lo elegido que deja de
   * valer en el ámbito nuevo se descarta en vez de arrastrarlo: una selección
   * invisible que sigue actuando es peor que perderla.
   */
  const llenarZonas = () => {
    const r = reglasZona();
    config.zoom.seleccion = config.zoom.seleccion.filter((id) => zonaValida(id, r));
    llenarZonaDep();
    llenarZonaProv();
    llenarZonaDist();
    pintarZonas();
    sincronizarBoton();
  };
  llenarZonas();

  const campoZonas = el('div', { clase: 'zonas', id: 'campo-zonas' }, [
    el('p', { clase: 'campo' }, [el('label', { for: 'zoom-departamento', texto: 'Departamento' }), selZonaDep]),
    el('p', { clase: 'campo' }, [el('label', { for: 'zoom-provincia', texto: 'Provincia' }), selZonaProv]),
    el('p', { clase: 'campo' }, [el('label', { for: 'zoom-distrito', texto: 'Distrito' }), selZonaDist]),
    botonAnadir,
    listaZonas,
    notaZonas,
  ]);
  const avisoZoom = el('p', { clase: 'nota', id: 'aviso-zoom' });

  const sincronizarZoom = () => {
    const manual = config.zoom.modo === 'manual';
    campoZonas.hidden = !manual;
    avisoZoom.hidden = !manual;
    for (const r of radiosModo) r.checked = r.value === config.zoom.modo;
  };
  sincronizarZoom();

  const bloqueZoom = grupo('Recuadros de zoom', [grupoModo, campoZonas, avisoZoom]);

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
    /** Rehace la lista de distritos cuando su cartografía termina de cargarse. */
    refrescarDistritos() {
      llenarDistritos(selProvincia.value, config.ambito.nivel === 'distrito' ? config.ambito.id : '');
      /* El selector de distrito del zoom también sale de la cartografía, y la lista de
         zonas elegidas escribe sus nombres: los dos se rehacen al llegar. */
      llenarZonaDist(selZonaDist.value);
      pintarZonas();
      sincronizarBoton();
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
