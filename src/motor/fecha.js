/**
 * La fecha de un mapa, siempre en el calendario del Perú.
 *
 * Aparece en dos sitios —impresa en el pie y en los metadatos del PDF— y los dos
 * dependían de la zona horaria de la máquina, así que el mismo mapa salía distinto
 * según dónde se generara. Eso rompe la regla de salida determinista, y se vio en la
 * integración continua: con la fecha fija 2026-01-01, en Lima el pie imprimía
 * «31/12/2025» y el servidor en UTC «01/01/2026».
 *
 * Son dos trampas distintas:
 *
 * `new Date('2026-01-01')` es medianoche UTC, no del Perú, así que en cualquier zona al
 * oeste de Greenwich cae en el día anterior. Se ancla al mediodía de Lima, hora a la que
 * ninguna zona razonable cambia de día.
 *
 * Y tanto `toLocaleDateString` como el conversor de jsPDF usan la zona del anfitrión si
 * no se les dice otra cosa. Este mapa lo firma un ministerio peruano: la fecha que le
 * corresponde es la del Perú, tanto si lo genera una máquina en Lima como una en UTC.
 *
 * El Perú no usa horario de verano desde 1994, así que el desfase es siempre −05:00.
 */

const ZONA = 'America/Lima';
const DESFASE = '-05:00';

/** Desfase tal como lo escribe un PDF: `-05'00'`. */
const DESFASE_PDF = "-05'00'";

const partes = (fecha, opciones) => new Intl.DateTimeFormat('es-PE', { timeZone: ZONA, ...opciones })
  .formatToParts(fecha)
  .reduce((o, p) => Object.assign(o, { [p.type]: p.value }), {});

/**
 * Resuelve la fecha de un mapa.
 *
 * Admite la cadena y el Date a propósito: la configuración de la interfaz ya trae un
 * Date resuelto y el banco de muestras trae la cadena de `--fecha`, y las dos acaban
 * en la misma llamada. Aceptar sólo la cadena hacía que el camino de la web volviera a
 * anclar un Date ya anclado y saliera una fecha inválida.
 *
 * @param {string|Date} [cuando]  fecha fija en YYYY-MM-DD, o el instante ya resuelto;
 *                                sin nada, el momento actual
 * @returns {{fecha: Date, texto: string, iso: string}} el instante, lo que se imprime
 *          en el pie y su forma ordenable
 */
export function fechaDelMapa(cuando) {
  let fecha;
  if (cuando instanceof Date) fecha = cuando;
  else if (cuando) fecha = new Date(`${cuando}T12:00:00${DESFASE}`);
  else fecha = new Date();
  const p = partes(fecha, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    fecha,
    texto: `${p.day}/${p.month}/${p.year}`,
    iso: `${p.year}-${p.month}-${p.day}`,
  };
}

/**
 * La misma fecha en el formato de los metadatos de un PDF.
 *
 * Se le da ya formateada a jsPDF —que la acepta como cadena— porque su conversor la
 * compone con getTimezoneOffset() y los getters locales, y entonces el mismo mapa
 * llevaría `D:...-05'00'` generado en Lima y `D:...+00'00'` generado en UTC. Son
 * treinta y pico caracteres que no cambian nada de lo impreso y bastan para que dos
 * salidas idénticas no coincidan al compararlas.
 */
export function aFechaPdf(fecha) {
  const p = partes(fecha, {
    day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return `D:${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}${DESFASE_PDF}`;
}
