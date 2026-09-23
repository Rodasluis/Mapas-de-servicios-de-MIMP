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
import { TAMANOS, ORIENTACIONES, siglaDe } from './config.js';

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

  const bloqueHoja = grupo('Hoja', [
    el('p', { clase: 'campo' }, [el('label', { for: 'tamano', texto: 'Tamaño' }), selTamano]),
    el('p', { clase: 'campo' }, [el('label', { for: 'orientacion', texto: 'Orientación' }), selOrientacion]),
    el('p', { clase: 'campo' }, [
      el('label', { for: 'ambito', texto: 'Ámbito' }),
      el('select', { id: 'ambito', disabled: 'disabled', title: 'Los ámbitos departamental, provincial y distrital llegan en la Fase 6' }, [
        el('option', { texto: 'Perú (nacional)' }),
      ]),
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
    coropleta: 'Coropleta por provincia',
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

  const selProvincias = el('select', { id: 'zoom-provincias', multiple: 'multiple', size: 8 });
  for (const p of catalogo.provincias) {
    selProvincias.appendChild(el('option', { value: p.id, texto: `${p.nombre} · ${p.departamento}` }));
  }
  for (const o of selProvincias.options) o.selected = config.zoom.seleccion.includes(o.value);

  const campoProvincias = el('p', { clase: 'campo' }, [
    el('label', { for: 'zoom-provincias', texto: 'Zonas a ampliar' }),
    selProvincias,
  ]);
  const avisoZoom = el('p', { clase: 'nota', id: 'aviso-zoom' });

  const sincronizarZoom = () => {
    campoProvincias.hidden = selZoom.value !== 'manual';
    avisoZoom.hidden = selZoom.value !== 'manual';
  };
  selZoom.addEventListener('change', () => {
    config.zoom.modo = selZoom.value;
    sincronizarZoom();
    emitir();
  });
  selProvincias.addEventListener('change', () => {
    config.zoom.seleccion = [...selProvincias.selectedOptions].map((o) => o.value);
    emitir();
  });
  sincronizarZoom();

  const bloqueZoom = grupo('Recuadros de zoom', [
    el('p', { clase: 'campo' }, [el('label', { for: 'zoom-modo', texto: 'Modo' }), selZoom]),
    campoProvincias,
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

  return {
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
