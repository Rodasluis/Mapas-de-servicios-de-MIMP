/**
 * Configuración del mapa: valores por omisión y traducción desde y hacia la URL.
 *
 * El estado completo vive en la barra de direcciones para que una configuración se
 * pueda compartir por correo o repetir meses después. Eso obliga a que la
 * serialización sea legible y estable: nada de índices que se desplacen al añadir un
 * tipo de servicio ni de JSON en base64, que convierte la URL en un borrón y hace
 * imposible corregir un título a mano.
 *
 * Sólo se escribe en la URL lo que se aparta de lo normal. Una configuración por
 * omisión deja la dirección limpia, y cada parámetro que aparece señala una decisión
 * que alguien tomó.
 */
import { ICONOS } from '../iconos/index.js';
import { CLASES_POR_DEFECTO } from '../motor/servicios.js';
import { CAPAS_POR_DEFECTO, PIEZAS_POR_DEFECTO } from '../motor/render.js';

export const TAMANOS = ['A4', 'A3', 'A2', 'A1', 'A0'];
export const ORIENTACIONES = ['vertical', 'horizontal'];

export const POR_DEFECTO = {
  hoja: { tamano: 'A1', orientacion: 'vertical' },
  textos: {
    titulo: 'Ubicación de los servicios que brinda el MIMP',
    subtitulo: 'Ámbito nacional',
    periodo: '',
    elaboradoPor: '',
  },
  tipos: null, // null es «todos»
  capas: { ...CAPAS_POR_DEFECTO },
  piezas: { ...PIEZAS_POR_DEFECTO },
  zoom: { modo: 'auto', seleccion: [] },
  /* Fecha de generación. Normalmente es la del día, pero se puede fijar en la URL
     para REPETIR una configuración tal cual: un mapa regenerado meses después con la
     misma dirección sale idéntico, incluida la línea «Generado el» del pie. Es también
     lo que permite comparar byte a byte la descarga de la web con «npm run muestras». */
  fecha: null,
};

/** Sigla ↔ tipo, para que la URL diga «CEM» y no un índice que mañana cambie. */
const SIGLA_DE = new Map(Object.entries(ICONOS).map(([tipo, i]) => [tipo, i.sigla]));
const TIPO_DE = new Map(Object.entries(ICONOS).map(([tipo, i]) => [i.sigla, tipo]));

export const siglaDe = (tipo) => SIGLA_DE.get(tipo) || tipo;

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Sólo se acepta AAAA-MM-DD; cualquier otra cosa en la URL se ignora. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Configuración → parámetros de la URL, omitiendo todo lo que esté por omisión. */
export function aParametros(config) {
  const p = new URLSearchParams();
  if (config.hoja.tamano !== POR_DEFECTO.hoja.tamano) p.set('hoja', config.hoja.tamano);
  if (config.hoja.orientacion !== POR_DEFECTO.hoja.orientacion) {
    p.set('orientacion', config.hoja.orientacion === 'horizontal' ? 'h' : 'v');
  }
  for (const campo of ['titulo', 'subtitulo', 'periodo', 'elaboradoPor']) {
    if (config.textos[campo] !== POR_DEFECTO.textos[campo]) p.set(campo, config.textos[campo]);
  }
  if (config.tipos && config.tipos.length) {
    p.set('tipos', config.tipos.map(siglaDe).join(','));
  }
  const apagadas = (objeto, defecto) => Object.keys(defecto).filter((k) => objeto[k] === false);
  const capas = apagadas(config.capas, CAPAS_POR_DEFECTO);
  if (capas.length) p.set('sinCapas', capas.join(','));
  const piezas = apagadas(config.piezas, PIEZAS_POR_DEFECTO);
  if (piezas.length) p.set('sinPiezas', piezas.join(','));

  if (config.zoom.modo === 'ninguno') p.set('zoom', 'ninguno');
  else if (config.zoom.modo === 'manual') p.set('zoom', config.zoom.seleccion.join(',') || 'ninguno');

  if (config.fecha) p.set('fecha', config.fecha);
  if (config.clases && !iguales(config.clases, CLASES_POR_DEFECTO)) {
    p.set('clases', config.clases.map((c) => `${c.desde}-${Number.isFinite(c.hasta) ? c.hasta : ''}`).join(','));
  }
  return p;
}

/** Parámetros de la URL → configuración, tolerando valores que no reconozca. */
export function desdeParametros(p) {
  const config = estructuraClonada(POR_DEFECTO);

  const hoja = p.get('hoja');
  if (hoja && TAMANOS.includes(hoja)) config.hoja.tamano = hoja;
  const orientacion = p.get('orientacion');
  if (orientacion) config.hoja.orientacion = orientacion.startsWith('h') ? 'horizontal' : 'vertical';

  for (const campo of ['titulo', 'subtitulo', 'periodo', 'elaboradoPor']) {
    if (p.has(campo)) config.textos[campo] = p.get(campo);
  }

  if (p.has('tipos')) {
    const tipos = p.get('tipos').split(',').map((s) => TIPO_DE.get(s.trim())).filter(Boolean);
    config.tipos = tipos.length ? tipos : null;
  }

  for (const [clave, objeto, defecto] of [
    ['sinCapas', config.capas, CAPAS_POR_DEFECTO],
    ['sinPiezas', config.piezas, PIEZAS_POR_DEFECTO],
  ]) {
    if (!p.has(clave)) continue;
    for (const nombre of p.get(clave).split(',')) {
      if (nombre in defecto) objeto[nombre] = false;
    }
  }

  const zoom = p.get('zoom');
  if (zoom === 'ninguno') config.zoom = { modo: 'ninguno', seleccion: [] };
  else if (zoom) config.zoom = { modo: 'manual', seleccion: zoom.split(',').filter(Boolean) };

  if (p.has('fecha') && FECHA_ISO.test(p.get('fecha'))) config.fecha = p.get('fecha');

  if (p.has('clases')) {
    const clases = p.get('clases').split(',').map((tramo) => {
      const [desde, hasta] = tramo.split('-');
      return {
        desde: Number(desde),
        hasta: hasta === '' || hasta === undefined ? Infinity : Number(hasta),
      };
    }).filter((c) => Number.isFinite(c.desde));
    if (clases.length) config.clases = clases.map(etiquetarClase);
  }

  return config;
}

/** Texto de una clase, para que la leyenda lo diga igual que las de por omisión. */
export function etiquetarClase(c) {
  if (!Number.isFinite(c.hasta)) return { ...c, etiqueta: `${c.desde} servicios o más` };
  if (c.desde === c.hasta) {
    return { ...c, etiqueta: `${c.desde} servicio${c.desde === 1 ? '' : 's'}` };
  }
  return { ...c, etiqueta: `Entre ${c.desde} y ${c.hasta} servicios` };
}

/** Lo que el motor espera, a partir de la configuración de la interfaz. */
export function aOpcionesDelMotor(config) {
  return {
    tipos: config.tipos,
    clases: config.clases,
    capas: config.capas,
    piezas: config.piezas,
    zoom: config.zoom.modo === 'ninguno' ? false : config.zoom,
  };
}

/**
 * Argumentos con los que se llama al motor.
 *
 * Es el ÚNICO sitio donde la configuración de la interfaz se traduce a lo que esperan
 * componerNacional() y aPdf(). La vista previa, el botón de descarga y el banco de
 * muestras pasan todos por aquí, así que no pueden divergir: si la web añadiera por su
 * cuenta un texto, un margen o una fecha, el PDF descargado dejaría de coincidir byte
 * a byte con la muestra, y eso es precisamente lo que comprueba
 * tests/web-igual-que-muestras.mjs.
 */
export function aLlamadasDelMotor(config) {
  return {
    composicion: {
      textos: { ...config.textos, ...(config.fecha ? { fecha: config.fecha } : {}) },
      opciones: aOpcionesDelMotor(config),
    },
    pdf: {
      propiedades: { titulo: config.textos.titulo },
      // Con fecha fija el PDF sale reproducible byte a byte.
      ...(config.fecha ? { fecha: new Date(config.fecha) } : {}),
    },
  };
}

/** Nombre de archivo descriptivo: ámbito, tamaño y fecha. */
export function nombreDeArchivo(config, fecha = config.fecha ? new Date(config.fecha) : new Date()) {
  const partes = ['peru'];
  if (config.tipos && config.tipos.length === 1) partes.push(siglaDe(config.tipos[0]).toLowerCase());
  else if (config.tipos && config.tipos.length) partes.push(`${config.tipos.length}tipos`);
  partes.push(`${config.hoja.tamano}-${config.hoja.orientacion === 'horizontal' ? 'h' : 'v'}`);
  partes.push(fecha.toISOString().slice(0, 10));
  return `${partes.join('_').replace(/[^\w.-]/g, '')}.pdf`;
}

const estructuraClonada = (o) => (typeof structuredClone === 'function'
  ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
