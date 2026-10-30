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
import { fechaDelMapa } from '../motor/fecha.js';
import { CLASES_POR_DEFECTO, DISPOSICIONES } from '../motor/servicios.js';
import { CAPAS_POR_DEFECTO, PIEZAS_POR_DEFECTO } from '../motor/render.js';
import { DIVISIONES } from '../motor/ambito.js';

/** Lima Metropolitana y Callao: la zona que el recuadro amplía en un solo bloque. */
export const ZOOM_LIMA_CALLAO = ['1501', '07'];

export const TAMANOS = ['A4', 'A3', 'A2', 'A1', 'A0', '2A0', '4A0'];
export const ORIENTACIONES = ['vertical', 'horizontal'];

/** Los textos que escribe la persona y que viajan en la URL. */
const CAMPOS_DE_TEXTO = ['titulo', 'subtitulo', 'periodo'];

export const POR_DEFECTO = {
  hoja: { tamano: 'A1', orientacion: 'vertical' },
  /* Ámbito: nacional, o un ubigeo de departamento (2 dígitos) o provincia (4). */
  ambito: { nivel: 'nacional', id: null },
  /* Nivel de división: 'departamento', 'provincia' o 'distrito'. null es «la del
     ámbito» (motor/ambito.js, DIVISIONES), que es lo que se usaba antes de poder
     elegirla: el país por provincias y un departamento por distritos. */
  division: null,
  textos: {
    titulo: 'Ubicación de los servicios que brinda el MIMP',
    /* Vacío significa AUTOMÁTICO: lo rellena el motor con la descripción del ámbito.
       Guardar aquí «Ámbito nacional» obligaba a adivinar, al cambiar de ámbito, si ese
       texto lo había escrito una persona o lo había dejado la aplicación, y un enlace
       a «?ambito=08» abría un mapa de Cusco subtitulado «Ámbito nacional». */
    subtitulo: '',
    periodo: '',
  },
  tipos: null, // null es «todos»
  /* Cómo se reparten los íconos de cada grupo: 'rejilla', que sigue la forma de las
     unidades angostas, o 'anillo', como el desplazamiento de puntos de QGIS
     (motor/servicios.js, DISPOSICIONES). */
  disposicion: DISPOSICIONES[0],
  capas: { ...CAPAS_POR_DEFECTO },
  piezas: { ...PIEZAS_POR_DEFECTO },
  /* El zoom que le toca al mapa por omisión, el del país por provincias: Lima y Callao.
     Para los demás lo decide zoomPorDefecto(). Los automáticos no se ponen nunca solos:
     tapan parte de la lámina con un trozo del mapa que quien la prepara no ha elegido. */
  zoom: { modo: 'manual', seleccion: [...ZOOM_LIMA_CALLAO] },
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
  /* El ubigeo basta para saber el nivel por su longitud, así que en la URL va solo:
     «?ambito=1501» se lee y se corrige a mano sin tener que explicar también que es
     una provincia. */
  if (config.ambito && config.ambito.id) p.set('ambito', config.ambito.id);
  if (config.division && config.division !== divisionPorDefecto(config.ambito)) {
    p.set('division', config.division);
  }
  if (config.hoja.tamano !== POR_DEFECTO.hoja.tamano) p.set('hoja', config.hoja.tamano);
  if (config.hoja.orientacion !== POR_DEFECTO.hoja.orientacion) {
    p.set('orientacion', config.hoja.orientacion === 'horizontal' ? 'h' : 'v');
  }
  for (const campo of CAMPOS_DE_TEXTO) {
    if (config.textos[campo] !== POR_DEFECTO.textos[campo]) p.set(campo, config.textos[campo]);
  }
  if (config.tipos && config.tipos.length) {
    p.set('tipos', config.tipos.map(siglaDe).join(','));
  }
  if (config.disposicion !== POR_DEFECTO.disposicion) p.set('disposicion', config.disposicion);
  const apagadas = (objeto, defecto) => Object.keys(defecto).filter((k) => objeto[k] === false);
  const capas = apagadas(config.capas, CAPAS_POR_DEFECTO);
  if (capas.length) p.set('sinCapas', capas.join(','));
  const piezas = apagadas(config.piezas, PIEZAS_POR_DEFECTO);
  if (piezas.length) p.set('sinPiezas', piezas.join(','));

  /* Sólo se escribe el zoom que se aparta del que le toca a ese mapa (zoomPorDefecto):
     en el país, Lima y Callao; en lo demás, ninguno. Quitar ese recuadro se escribe
     como zoom=ninguno; sin eso, al recargar el enlace volvería. Los
     automáticos se piden con zoom=auto y los elegidos, con la lista de ubigeos. */
  const zoomDeSiempre = zoomPorDefecto(config.ambito, config.division);
  const esElDeSiempre = config.zoom.modo === zoomDeSiempre.modo
    && (config.zoom.modo !== 'manual' || esZoomLimaCallao(config.zoom) === esZoomLimaCallao(zoomDeSiempre));
  if (!esElDeSiempre) {
    if (config.zoom.modo === 'auto') p.set('zoom', 'auto');
    else if (config.zoom.modo === 'manual') p.set('zoom', config.zoom.seleccion.join(',') || 'ninguno');
    else p.set('zoom', 'ninguno');
  }

  if (config.fecha) p.set('fecha', config.fecha);
  if (config.clases && !iguales(config.clases, CLASES_POR_DEFECTO)) {
    p.set('clases', config.clases.map((c) => `${c.desde}-${Number.isFinite(c.hasta) ? c.hasta : ''}`).join(','));
  }
  return p;
}

/** Parámetros de la URL → configuración, tolerando valores que no reconozca. */
export function desdeParametros(p) {
  const config = estructuraClonada(POR_DEFECTO);

  const ambito = (p.get('ambito') || '').trim();
  if (/^[0-9]{2}$/.test(ambito)) config.ambito = { nivel: 'departamento', id: ambito };
  else if (/^[0-9]{4}$/.test(ambito)) config.ambito = { nivel: 'provincia', id: ambito };
  else if (/^[0-9]{6}$/.test(ambito)) config.ambito = { nivel: 'distrito', id: ambito };

  /* Sólo una división que el ámbito admita: «division=departamento» en el enlace de un
     mapa de Cusco no significa nada y se ignora. */
  const division = p.get('division');
  if (divisionesDe(config.ambito).includes(division)) {
    config.division = division === divisionPorDefecto(config.ambito) ? null : division;
  }

  const hoja = p.get('hoja');
  if (hoja && TAMANOS.includes(hoja)) config.hoja.tamano = hoja;
  const orientacion = p.get('orientacion');
  if (orientacion) config.hoja.orientacion = orientacion.startsWith('h') ? 'horizontal' : 'vertical';

  /* Un enlace antiguo con «elaboradoPor» abre igual: el parámetro ya no se lee. */
  for (const campo of CAMPOS_DE_TEXTO) {
    if (p.has(campo)) config.textos[campo] = p.get(campo);
  }

  if (p.has('tipos')) {
    const tipos = p.get('tipos').split(',').map((s) => TIPO_DE.get(s.trim())).filter(Boolean);
    config.tipos = tipos.length ? tipos : null;
  }

  const disposicion = p.get('disposicion');
  if (DISPOSICIONES.includes(disposicion)) config.disposicion = disposicion;

  /* «iconos=casa» o «iconos=circulo» de los enlaces anteriores a la Fase 16 se
     ignoran: sólo queda el círculo, y el enlace sigue abriendo el mismo mapa. */

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
  /* zoom=ninguno se sigue aceptando: es lo que escribían los enlaces de antes, cuando
     el modo por omisión era el automático. */
  if (zoom === 'auto') config.zoom = { modo: 'auto', seleccion: [] };
  else if (zoom === 'ninguno') config.zoom = { modo: 'ninguno', seleccion: [] };
  else if (zoom) config.zoom = { modo: 'manual', seleccion: zoom.split(',').filter(Boolean) };
  /* El país abre con Lima y Callao ampliados (ver zoomPorDefecto). Sólo si el enlace
     no dice nada del zoom: uno con zoom=ninguno lo pidió así. */
  else config.zoom = zoomPorDefecto(config.ambito, config.division);

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

/** Divisiones que admite un ámbito, de la más gruesa a la más fina. */
export const divisionesDe = (ambito) => (DIVISIONES[ambito?.nivel] || DIVISIONES.nacional).opciones;

/** La división que usa un ámbito cuando nadie elige otra. */
export const divisionPorDefecto = (ambito) => (DIVISIONES[ambito?.nivel] || DIVISIONES.nacional).porDefecto;

/**
 * Recuadros con los que abre un mapa cuando nadie los ha pedido.
 *
 * El país, partido hasta provincias o hasta distritos, abre con Lima y Callao
 * ampliados juntos, como un solo bloque —el recuadro de «Lima Metropolitana y
 * Callao»—, que es como se leen. Son 156 centros en unos pocos milímetros: sin ampliar,
 * el mapa enseña ahí una mancha de grupos que se pisan, y con el recuadro en la lámina
 * esos íconos se dibujan sólo en él (motor/zoom.js, SOLO_EN_RECUADRO).
 *
 * El país hasta departamentos no lo lleva: sus unidades son departamentos, y Lima
 * Metropolitana es sólo una parte del de Lima. Los demás ámbitos, ninguno.
 */
export function zoomPorDefecto(ambito, division) {
  const d = division || divisionPorDefecto(ambito);
  if (ambito?.nivel === 'nacional' && (d === 'provincia' || d === 'distrito')) {
    return { modo: 'manual', seleccion: [...ZOOM_LIMA_CALLAO] };
  }
  return { modo: 'ninguno', seleccion: [] };
}

/** ¿Es éste el recuadro de Lima y Callao que se pone por omisión? */
export const esZoomLimaCallao = (zoom) => zoom?.modo === 'manual'
  && zoom.seleccion.length === ZOOM_LIMA_CALLAO.length
  && ZOOM_LIMA_CALLAO.every((z) => zoom.seleccion.includes(z));

/**
 * Subtítulo que le corresponde a un ámbito.
 *
 * Tiene que decir lo mismo que `plan.descripcion` del motor, porque es el texto que el
 * motor pone cuando nadie ha escrito uno. Vive aquí además porque la interfaz lo
 * necesita ANTES de componer, para mostrarlo en su casilla.
 */
export function subtituloDe(ambito, nombre) {
  if (!ambito || ambito.nivel === 'nacional') return 'Ámbito nacional';
  if (ambito.nivel === 'departamento') return `Departamento de ${nombre}`;
  if (ambito.nivel === 'provincia') return `Provincia de ${nombre}`;
  return `Distrito de ${nombre}`;
}

/** Nombres de los niveles de rótulo, para los informes de la interfaz. */
export const NOMBRE_NIVEL = {
  departamento: 'departamentos',
  provincia: 'provincias',
  distrito: 'distritos',
  exterior: 'fuera del ámbito',
};

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
    /* Sin división se omite, y el motor usa la del ámbito: así una configuración por
       omisión llega al motor exactamente igual que antes de existir la opción. */
    ...(config.division ? { division: config.division } : {}),
    tipos: config.tipos,
    disposicion: config.disposicion,
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
      ambito: config.ambito,
      /* Un subtítulo vacío se OMITE en vez de enviarse: así el motor aplica su
         descripción del ámbito en lugar de imprimir una línea en blanco. */
      textos: {
        ...config.textos,
        ...(config.textos.subtitulo ? {} : { subtitulo: undefined }),
        ...(config.fecha ? { fecha: config.fecha } : {}),
      },
      opciones: aOpcionesDelMotor(config),
    },
    pdf: {
      propiedades: { titulo: config.textos.titulo },
      // Con fecha fija el PDF sale reproducible byte a byte.
      ...(config.fecha ? { fecha: fechaDelMapa(config.fecha).fecha } : {}),
    },
  };
}

/** Nombre de archivo descriptivo: ámbito, tamaño y fecha. */
export function nombreDeArchivo(config, fecha = config.fecha ? new Date(config.fecha) : new Date()) {
  const partes = [config.ambito && config.ambito.id ? `ubigeo${config.ambito.id}` : 'peru'];
  // Sólo si no es la de siempre: «peru_distritos» se distingue de «peru» a la vista.
  if (config.division) partes.push(`${config.division}s`);
  if (config.tipos && config.tipos.length === 1) partes.push(siglaDe(config.tipos[0]).toLowerCase());
  else if (config.tipos && config.tipos.length) partes.push(`${config.tipos.length}tipos`);
  partes.push(`${config.hoja.tamano}-${config.hoja.orientacion === 'horizontal' ? 'h' : 'v'}`);
  partes.push(fecha.toISOString().slice(0, 10));
  return `${partes.join('_').replace(/[^\w.-]/g, '')}.pdf`;
}

const estructuraClonada = (o) => (typeof structuredClone === 'function'
  ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
