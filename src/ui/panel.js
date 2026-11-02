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
import {
  TAMANOS, ORIENTACIONES, siglaDe, subtituloDe, divisionesDe, divisionPorDefecto,
  zoomPorDefecto, esZoomLimaCallao, tituloPorDefecto,
} from './config.js';
import { dibujarIcono, ICONOS, VICEMINISTERIOS } from '../iconos/index.js';
import { VARIABLES } from '../motor/variables.js';

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

/**
 * Grupo que se pliega: los que casi nunca se tocan —recuadros, capas y elementos del
 * layout— empiezan cerrados para que el panel no mida tres pantallas (revisión de uso
 * de la Fase 22). Se abren solos si la configuración se aparta de lo normal en algo que
 * contienen: un ajuste que no se ve es un ajuste que se olvida. Plegados, sus controles
 * siguen en el documento con su valor; el tabulador llega al título del grupo y Intro o
 * Espacio lo abren.
 */
const grupoPlegable = (id, titulo, contenido, abierto) => {
  const detalles = el('details', { clase: 'grupo plegable', id });
  detalles.open = abierto;
  detalles.append(el('summary', { texto: titulo }), el('div', { clase: 'contenido-plegable' }, [].concat(contenido)));
  return detalles;
};

const campoTexto = (id, etiqueta, valor, alCambiar) => {
  const input = el('input', { type: 'text', id, value: valor ?? '' });
  input.addEventListener('input', () => alCambiar(input.value));
  return el('p', { clase: 'campo' }, [el('label', { for: id, texto: etiqueta }), input]);
};

/**
 * Muestra de un ícono para el panel: el mismo SVG que va al mapa, a 18 px. La caja
 * se amplía un poco porque algunos pictogramas salen del círculo (las ondas del SAU).
 */
const muestraIcono = (tipo) => {
  const span = el('span', { clase: 'muestra-icono', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="-1 -1 12 12" width="18" height="18">${dibujarIcono({
    tipo, x: 5, y: 10, tamanoMm: 10,
  })}</svg>`;
  return span;
};

/**
 * Nombre de cada nivel de división. Se dice «hasta» porque lo que se ve es acumulativo:
 * partir el país en distritos dibuja también provincias y departamentos, y llamarlo
 * sólo «Distritos» haría pensar que los demás desaparecen. Escribirlos todos
 * («Departamentos, provincias y distritos») no cabía en el ancho del panel.
 */
const NOMBRES_DIVISION = {
  departamento: 'Hasta departamentos',
  provincia: 'Hasta provincias',
  distrito: 'Hasta distritos',
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

  /* Nivel de división. Sus opciones dependen del ámbito: el país admite tres, un
     departamento dos y una provincia sólo distritos, así que en ella el selector queda
     deshabilitado con su único valor a la vista. En el mapa distrital no hay nada por
     debajo que elegir. */
  const selDivision = el('select', { id: 'division' });
  const llenarDivision = () => {
    const opciones = divisionesDe(config.ambito);
    selDivision.innerHTML = '';
    if (!opciones.length) {
      selDivision.appendChild(el('option', { value: '', texto: 'No aplica en un mapa distrital' }));
      selDivision.disabled = true;
      return;
    }
    for (const d of opciones) {
      selDivision.appendChild(el('option', { value: d, texto: NOMBRES_DIVISION[d] }));
    }
    selDivision.value = config.division || divisionPorDefecto(config.ambito);
    selDivision.disabled = opciones.length < 2;
  };
  selDivision.addEventListener('change', () => {
    config.division = selDivision.value === divisionPorDefecto(config.ambito) ? null : selDivision.value;
    /* Pasar el país a «hasta departamentos» quita el recuadro de Lima y Callao si
       seguía siendo ése, y volver a provincias o distritos lo pone si no había ninguno
       pedido. Lo que haya elegido una persona no se toca. */
    if (config.zoom.modo === 'ninguno' || esZoomLimaCallao(config.zoom)) {
      config.zoom = zoomPorDefecto(config.ambito, config.division);
      sincronizarZoom();
    }
    /* La división cambia qué se puede ampliar: el país por departamentos no tiene
       provincias que poner en un recuadro. */
    llenarZonas();
    sincronizarVariable();
    emitir();
  });

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
    /* Cada ámbito empieza con su división de siempre. Arrastrar la anterior daría
       resultados que nadie ha pedido: «departamentos» no existe dentro de Cusco, y
       «provincias» en el país es lo normal, no una elección. */
    config.division = null;
    llenarDivision();
    /* El recuadro de Lima y Callao puesto por omisión no viaja a otro ámbito, y al
       volver al país se pone si no había otro pedido. */
    if (config.zoom.modo === 'ninguno' || esZoomLimaCallao(config.zoom)) {
      config.zoom = zoomPorDefecto(config.ambito, config.division);
      sincronizarZoom();
    }
    sincronizarSubtitulo();
    sincronizarVariable();
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
    el('p', { clase: 'campo' }, [
      el('label', { for: 'division', texto: 'Nivel de división' }), selDivision,
    ]),
  ]);
  llenarDivision();

  /* ------------------------------ textos ------------------------------- */
  /* Van dentro del grupo «Layout», con los elementos de la lámina (lo pidió el área
     usuaria en la revisión de la Fase 22). El título sigue al tipo de mapa elegido en
     «Color del mapa» mientras nadie lo escriba a mano (ver el selector de la variable). */
  const campoTitulo = campoTexto('titulo', 'Título', config.textos.titulo, (v) => { config.textos.titulo = v; emitir(); });
  const inputTitulo = campoTitulo.querySelector('input');
  const camposTexto = [
    campoTitulo,
    campoTexto('subtitulo', 'Subtítulo', config.textos.subtitulo, (v) => { config.textos.subtitulo = v; emitir(); }),
    campoTexto('periodo', 'Periodo', config.textos.periodo, (v) => { config.textos.periodo = v; emitir(); }),
    /* «Elaborado por» se retiró en la revisión de la Fase 20, con la línea del pie que
       lo imprimía. */
  ];

  /* --------------------------- tipos de servicio ----------------------- */
  const casillasTipo = new Map();
  /* En el orden del catálogo, no en el de la lista: así la URL y el motor reciben los
     tipos igual que antes de agruparlos por viceministerio. */
  const activos = () => catalogo.tipos.filter((t) => casillasTipo.get(t).checked);

  const vmDe = (tipo) => ICONOS[tipo]?.viceministerio;
  const tiposDeVm = (vm) => catalogo.tipos.filter((t) => vmDe(t) === vm);

  /* Casillas de grupo, una por viceministerio. No guardan estado propio: valen lo que
     valgan las de sus tipos —marcada si están todas, a medias si sólo algunas— y al
     pulsarlas marcan o desmarcan todos sus tipos de una vez. */
  const casillasGrupo = new Map();
  const sincronizarGrupos = () => {
    for (const [vm, input] of casillasGrupo) {
      const propios = tiposDeVm(vm);
      const marcados = propios.filter((t) => casillasTipo.get(t).checked).length;
      input.checked = marcados === propios.length;
      input.indeterminate = marcados > 0 && marcados < propios.length;
    }
  };

  const leerCasillas = () => {
    const marcados = activos();
    /* Ningún tipo marcado es una selección a medias, no «todos»: hasta la Fase 22 se
       componía el mapa con todos los tipos mientras las casillas decían lo contrario.
       Ahora se espera a que se marque alguno (main.js lo dice en el estado y no deja
       descargar). El motor sigue tratando una lista vacía como «todos», porque puede
       llegar así de una URL escrita a mano. */
    config.tipos = marcados.length === catalogo.tipos.length ? null : marcados;
    sincronizarGrupos();
    emitir();
  };

  /* Un grupo por viceministerio, PLEGADO (revisión de la Fase 22): en la cabecera, la
     casilla del viceministerio, que marca o desmarca de una vez todos sus tipos, y un
     botón que despliega la lista para elegirlos uno por uno. Los veintidós tipos
     seguidos ocupaban media pantalla del panel. Un grupo con una selección a medias se
     abre solo: lo que está marcado tiene que verse. Dentro, el orden del catálogo: de
     más a menos centros. */
  const cajaTipos = el('div', { clase: 'caja-tipos' });
  for (const [vm, nombre] of Object.entries(VICEMINISTERIOS)) {
    const propios = tiposDeVm(vm);
    if (!propios.length) continue;
    const id = `tipos-${vm.toLowerCase()}`;
    const input = el('input', { type: 'checkbox', id });
    input.addEventListener('change', () => {
      for (const t of propios) casillasTipo.get(t).checked = input.checked;
      leerCasillas();
    });
    casillasGrupo.set(vm, input);
    const total = propios.reduce((n, t) => n + (catalogo.conteo.get(t) || 0), 0);

    const idLista = `lista-${vm.toLowerCase()}`;
    const lista = el('div', { clase: 'lista-tipos', id: idLista });
    for (const tipo of propios) {
      const idTipo = `tipo-${siglaDe(tipo).replace(/\W/g, '')}`;
      const casillaTipo = el('input', { type: 'checkbox', id: idTipo });
      casillaTipo.checked = !config.tipos || config.tipos.includes(tipo);
      casillaTipo.addEventListener('change', leerCasillas);
      casillasTipo.set(tipo, casillaTipo);
      lista.appendChild(el('label', { clase: 'casilla', for: idTipo }, [
        casillaTipo,
        muestraIcono(tipo),
        el('span', { texto: `${tipo} (${catalogo.conteo.get(tipo) || 0})` }),
      ]));
    }

    const desplegar = el('button', {
      type: 'button', clase: 'desplegar', 'aria-controls': idLista,
      'aria-label': `Ver los tipos de servicio del ${nombre}`,
    }, [el('span', { texto: `${propios.length} tipos` })]);
    const abrir = (si) => {
      lista.hidden = !si;
      desplegar.setAttribute('aria-expanded', si ? 'true' : 'false');
    };
    desplegar.addEventListener('click', () => abrir(lista.hidden));
    const marcados = propios.filter((t) => casillasTipo.get(t).checked).length;
    abrir(marcados > 0 && marcados < propios.length);

    cajaTipos.appendChild(el('div', { clase: 'grupo-vm' }, [
      el('div', { clase: 'cabecera-vm' }, [
        el('label', { clase: 'casilla', for: id }, [input, el('span', { texto: `Servicios del ${nombre} (${total})` })]),
        desplegar,
      ]),
      lista,
    ]));
  }

  const marcarTodos = (valor) => {
    for (const c of casillasTipo.values()) c.checked = valor;
    config.tipos = valor ? null : [];
    sincronizarGrupos();
    emitir();
  };
  sincronizarGrupos();
  const bloqueTipos = grupo('Tipos de servicio', [
    el('p', { clase: 'acciones-linea' }, [
      botón('Todos', () => marcarTodos(true)),
      botón('Ninguno', () => marcarTodos(false)),
    ]),
    cajaTipos,
  ]);

  /* --------------------------- color del mapa -------------------------- */

  /* Qué mide el color de cada unidad (motor/variables.js). Cada opción lleva una nota
     que dice en una frase qué se está viendo: «distancia» sin decir desde dónde ni a
     qué invita a leer otra cosa. */
  const NOMBRES_VARIABLE = {
    presencia: 'Tipos de servicio presentes',
    centros: 'Número de centros de atención',
    cobertura: 'Distancia al centro de atención más cercano',
    tasa: 'Centros de atención por cada 100 mil habitantes',
    pobreza: 'Pobreza monetaria (INEI, 2018)',
  };
  const NOTAS_VARIABLE = {
    presencia: 'Cuántos tipos de servicio distintos hay en cada unidad: el mapa de siempre.',
    centros: 'Cuántos centros de atención hay en cada unidad, de los tipos marcados.',
    cobertura: 'A qué distancia en línea recta queda el centro de atención más cercano de los tipos'
      + ' marcados, desde el centro de cada unidad. Se lee mejor hasta distritos.',
    tasa: 'Centros de atención de los tipos marcados por cada 100 mil habitantes, con la población'
      + ' que el INEI proyecta para este año.',
    pobreza: 'Porcentaje de la población en pobreza monetaria según el mapa de pobreza 2018'
      + ' del INEI. No depende de los tipos marcados; los íconos sí.',
  };
  const selVariable = el('select', { id: 'variable' });
  for (const v of VARIABLES) selVariable.appendChild(el('option', { value: v, texto: NOMBRES_VARIABLE[v] || v }));
  selVariable.value = config.variable;
  const notaVariable = el('p', { clase: 'nota', id: 'nota-variable', 'aria-live': 'polite' });
  const sincronizarVariable = () => {
    const sinColor = config.capas.coropleta === false;
    const distrital = config.ambito.nivel === 'distrito';
    selVariable.disabled = sinColor || distrital;
    notaVariable.textContent = distrital ? 'El mapa de un solo distrito no se colorea: no hay con qué compararlo.'
      : sinColor ? 'El color está apagado en «Capas».'
        : NOTAS_VARIABLE[config.variable] || '';
  };
  selVariable.addEventListener('change', () => {
    const anterior = config.variable;
    config.variable = selVariable.value;
    /* El título sigue al tipo de mapa (config.js, TITULOS_POR_VARIABLE) mientras sea el
       que puso la aplicación; uno escrito a mano no se toca. */
    if (config.textos.titulo === tituloPorDefecto(anterior)) {
      config.textos.titulo = tituloPorDefecto(config.variable);
      inputTitulo.value = config.textos.titulo;
    }
    sincronizarVariable();
    emitir();
  });
  const bloqueColor = grupo('Color del mapa', [
    el('p', { clase: 'campo' }, [el('label', { for: 'variable', texto: 'Qué muestra el color' }), selVariable]),
    notaVariable,
  ]);
  sincronizarVariable();

  /* ------------------------------- capas ------------------------------- */
  const nombresCapa = {
    coropleta: 'Coropleta por unidad territorial',
    simbolos: 'Símbolos de servicios',
    grilla: 'Retícula UTM',
    rotulos: 'Nombres de departamentos y provincias',
    contexto: 'Nombres de países y del mar',
  };
  /* Cómo se reparten los íconos de cada grupo. En rejilla, la cuadrícula que se estira
     a lo largo de las unidades angostas (la de por omisión); en anillo, el
     «desplazamiento de puntos» de QGIS. Botones de opción, como el modo de zoom: son
     dos y se ven las dos sin abrir nada. */
  const NOMBRES_DISPOSICION = { rejilla: 'En rejilla, según la forma', anillo: 'En anillo, como QGIS' };
  const grupoDisposicion = el('fieldset', { clase: 'opciones', id: 'disposicion' }, [
    el('legend', { texto: 'Íconos de cada grupo' }),
  ]);
  for (const valor of Object.keys(NOMBRES_DISPOSICION)) {
    const input = el('input', {
      type: 'radio', name: 'disposicion', id: `disposicion-${valor}`, value: valor,
    });
    input.checked = config.disposicion === valor;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      config.disposicion = valor;
      emitir();
    });
    grupoDisposicion.appendChild(el('label', { clase: 'casilla', for: input.id }, [
      input, el('span', { texto: NOMBRES_DISPOSICION[valor] }),
    ]));
  }

  const bloqueCapas = grupoPlegable('grupo-capas', 'Capas', [
    ...Object.entries(nombresCapa).map(([clave, etiqueta]) => casilla(
      `capa-${clave}`, etiqueta, config.capas[clave] !== false,
      (v) => {
        config.capas[clave] = v;
        if (clave === 'coropleta') sincronizarVariable();
        emitir();
      },
    )),
    grupoDisposicion,
  ], Object.keys(nombresCapa).some((k) => config.capas[k] === false)
    || config.disposicion !== Object.keys(NOMBRES_DISPOSICION)[0]);

  /* ------------------------------- piezas ------------------------------ */
  const nombresPieza = {
    institucional: 'Logotipo institucional',
    titulo: 'Caja de título',
    leyenda: 'Leyenda',
    escala: 'Escala gráfica',
    norte: 'Rosa de los vientos',
    ubicacion: 'Mapa de ubicación',
  };
  /* «Layout»: los textos de la lámina y los elementos que se pueden apagar. Se abre
     solo si alguno se aparta de lo normal: un título escrito a mano, un subtítulo o un
     periodo, o un elemento apagado. */
  const textosPropios = config.textos.titulo !== tituloPorDefecto(config.variable)
    || Boolean(config.textos.subtitulo) || Boolean(config.textos.periodo);
  const bloquePiezas = grupoPlegable('grupo-piezas', 'Layout', [
    el('p', { clase: 'subtitulo-grupo', texto: 'Textos' }),
    ...camposTexto,
    el('p', { clase: 'subtitulo-grupo', texto: 'Elementos' }),
    ...Object.entries(nombresPieza).map(([clave, etiqueta]) => casilla(
      `pieza-${clave}`, etiqueta, config.piezas[clave] !== false,
      (v) => { config.piezas[clave] = v; emitir(); },
    )),
  ], textosPropios || Object.keys(nombresPieza).some((k) => config.piezas[k] === false));

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
   *
   * La división recorta lo más fino que se puede pedir, porque un recuadro amplía las
   * unidades por las que se agrupan los íconos: el país por departamentos no tiene
   * provincias que ampliar, ni un departamento por provincias, distritos. El país por
   * distritos agrupa por distrito, así que admite también un distrito.
   */
  const reglasZona = () => {
    const a = ambitoActual();
    const division = config.division || divisionPorDefecto(a);
    if (a.nivel === 'nacional') {
      return {
        dep: null, prov: null, provincia: division !== 'departamento', distrito: division === 'distrito', minimo: 2,
      };
    }
    if (a.nivel === 'departamento') {
      return { dep: a.id, prov: null, provincia: true, distrito: division === 'distrito', minimo: 4 };
    }
    if (a.nivel === 'provincia') {
      return { dep: a.id.slice(0, 2), prov: a.id, provincia: true, distrito: true, minimo: 6 };
    }
    return null;
  };

  /** ¿Sirve este ubigeo como zona en el ámbito actual? */
  const zonaValida = (id, r = reglasZona()) => Boolean(r)
    && id.length >= r.minimo
    && (r.distrito || id.length <= 4)
    && (r.provincia || id.length <= 2)
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
    if (r && !r.provincia) {
      selZonaProv.appendChild(opcion('', 'No disponible al dividir por departamentos'));
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
      selZonaDist.appendChild(opcion('', ambitoActual().nivel === 'nacional'
        ? 'Sólo al dividir hasta distritos' : 'No disponible al dividir por provincias'));
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

  /* Abierto si el recuadro no es el que le toca a este mapa por omisión. */
  const zoomDeSiempre = zoomPorDefecto(config.ambito, config.division);
  const bloqueZoom = grupoPlegable('grupo-zoom', 'Recuadros de zoom', [grupoModo, campoZonas, avisoZoom],
    config.zoom.modo !== zoomDeSiempre.modo
    || (config.zoom.modo === 'manual' && esZoomLimaCallao(config.zoom) !== esZoomLimaCallao(zoomDeSiempre)));

  /* ------------------------------ generar ------------------------------ */
  const botonGenerar = el('button', { type: 'button', clase: 'generar', id: 'generar' },
    [el('span', { texto: 'Generar PDF' })]);
  botonGenerar.addEventListener('click', () => alGenerar());
  const progreso = el('p', { clase: 'progreso', id: 'progreso', role: 'status', 'aria-live': 'polite' });
  /* Los segundos de espera van aparte del estado: el estado lo anuncia el lector de
     pantalla, y anunciar cada segundo sería ruido. */
  const reloj = el('span', { clase: 'reloj', id: 'reloj', 'aria-hidden': 'true' });

  contenedor.append(
    bloqueHoja, bloqueTipos, bloqueColor, bloqueZoom, bloqueCapas, bloquePiezas,
    el('div', { clase: 'pie-panel' }, [botonGenerar, el('div', { clase: 'estado' }, [progreso, reloj])]),
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

    /**
     * Mensaje de estado del botón de generación. `ocupado` es que hay trabajo en
     * marcha; `puedeGenerar`, que hay un mapa al día que descargar (no lo hay mientras
     * se compone, si la composición falló o si no hay ningún tipo marcado).
     */
    progreso(texto, ocupado = false, { puedeGenerar = !ocupado } = {}) {
      progreso.textContent = texto || '';
      botonGenerar.disabled = !puedeGenerar;
      botonGenerar.setAttribute('aria-busy', ocupado ? 'true' : 'false');
    },
    /** La configuración cambió y el mapa de la vista ya no la refleja. */
    mapaDesactualizado() { botonGenerar.disabled = true; },
    /** Segundos que lleva la composición en curso; null lo oculta. */
    reloj(segundos) { reloj.textContent = segundos ? `${segundos} s` : ''; },
    /** Aviso propio del bloque de zoom (capacidad de la hoja, zonas demasiado grandes). */
    avisoZoom(texto) { avisoZoom.textContent = texto || ''; },
  };
}

function botón(texto, alPulsar) {
  const b = el('button', { type: 'button', clase: 'enlace' }, [el('span', { texto })]);
  b.addEventListener('click', alPulsar);
  return b;
}
