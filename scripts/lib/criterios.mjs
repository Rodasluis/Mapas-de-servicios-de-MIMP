/**
 * Criterio de publicación de este proyecto: qué registros del Directorio Nacional de
 * Servicios del MIMP entran en el mapa y cómo se ubican.
 *
 * Es un criterio PROPIO. Partió de la tabla del buscador (Distancia-al-centro-de-
 * atencion) pero no depende de ella ni tiene que coincidir: este proyecto publica
 * además los Educadores de Calle y los Hogares de Refugio Temporal, que el buscador
 * deja fuera.
 *
 * Cada valor de la columna CENTRO está revisado a mano y el motivo queda escrito al
 * lado para poder auditarlo. Un valor que no figure aquí se EXCLUYE y el build avisa:
 * si el MIMP añade un servicio nuevo, no aparece en el mapa sin que alguien lo haya
 * decidido antes.
 *
 * ubicacion:
 *  - 'coordenada': se dibuja en la coordenada del directorio, comprobada contra su
 *    distrito (ver fetch-datos.mjs).
 *  - 'distrito': se dibuja en un punto interior de su distrito, nunca en una
 *    coordenada. Para servicios cuya dirección es reservada.
 *
 * siReservada: 'distrito' permite publicar por distrito los registros de un tipo
 * 'coordenada' cuya dirección el directorio declara reservada. Sin esa declaración,
 * esos registros quedan fuera: mostrar un servicio de dirección reservada, aunque sea
 * por distrito, es una decisión que se toma tipo a tipo.
 */
export const CRITERIOS = {
  // — Con local de atención al público —
  'Centro Emergencia Mujer y Familia': { publica: true, ubicacion: 'coordenada', motivo: 'Local de atención al público, regular o en comisaría' },
  'Servicio de Atención Rural - SAR': { publica: true, ubicacion: 'coordenada', motivo: 'Punto de atención fijo en zona rural' },
  'CAR Básico': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de acogida residencial' },
  /* Seis de ellos tienen la dirección reservada, como los hogares de refugio: esos se
     muestran por distrito. Los demás, en su coordenada. */
  'CAR Especializado': { publica: true, ubicacion: 'coordenada', siReservada: 'distrito', motivo: 'Centro de acogida residencial' },
  'CAR de Urgencia': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de acogida residencial' },
  'CAR PCD': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de acogida residencial para personas con discapacidad' },
  'Centro de Atención Residencial para Personas Adultas Mayores - CARPAM': { publica: true, ubicacion: 'coordenada', motivo: 'Residencia para personas adultas mayores' },
  'Centro de Desarrollo Integral de La Familia - CEDIF': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de cuidado diurno' },
  'Centro Comunal Familiar': { publica: true, ubicacion: 'coordenada', motivo: 'Extensión del CEDIF en local comunal' },
  'Centro de Recreación Familiar': { publica: true, ubicacion: 'coordenada', motivo: 'Extensión del CEDIF con local propio' },
  'Centro de Atención de Día - CAD': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de día para personas adultas mayores' },
  'Centro de Atención de Noche - CAN': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de noche para personas adultas mayores' },
  'Centro de Atencion Institucional - CAI': { publica: true, ubicacion: 'coordenada', motivo: 'Centro de atención institucional' },
  'Mi60+': { publica: true, ubicacion: 'coordenada', motivo: 'Local de acogida temporal para personas adultas mayores' },
  'Servicio de Atención Urgente - SAU': { publica: true, ubicacion: 'coordenada', motivo: 'Sede con equipo de atención urgente' },
  'Unidad de Adopción - UA': { publica: true, ubicacion: 'coordenada', motivo: 'Oficina de atención al público para adopciones' },
  'Unidad de Protección Especial - UPE': { publica: true, ubicacion: 'coordenada', motivo: 'Oficina de atención al público para protección de NNA' },
  SAIPD: { publica: true, ubicacion: 'coordenada', motivo: 'Servicio de atención integral a personas con discapacidad, con local' },
  'Acercándonos': { publica: true, ubicacion: 'coordenada', motivo: 'EFFA: espacio de fortalecimiento familiar con local' },
  'Plataforma de Atención': { publica: true, ubicacion: 'coordenada', motivo: 'Oficina de la Red Alivia con atención presencial' },

  // — Criterios propios de este proyecto —
  'Educadores de Calle': { publica: true, ubicacion: 'coordenada', motivo: 'Interviene en vía pública; se dibuja la sede desde la que opera cada equipo' },
  'Hogares de Refugio Temporal - HRT': { publica: true, ubicacion: 'distrito', motivo: 'Casa de acogida con dirección reservada: sólo se muestra en qué distrito hay una' },

  // — Sin local de atención al público —
  'Linea 100': { publica: false, motivo: 'Servicio telefónico de alcance nacional' },
  'Chat 100': { publica: false, motivo: 'Orientación virtual' },
  'Familias Igualitarias': { publica: false, motivo: 'Programa por zonas que opera dentro de un CEDIF' },
  'Coordinación Territorial': { publica: false, motivo: 'Oficina administrativa de coordinación, no atiende público' },
  SOUFCAT: { publica: false, motivo: 'Sede de operación de la UFCAT, no atiende público' },
  'Inabif en Acción': { publica: false, motivo: 'Equipo móvil de emergencias y urgencias' },
  'Unidad de Asistencia Económica y Acompañamiento': { publica: false, motivo: 'Unidad administrativa de asistencia económica' },
};

/**
 * Variantes de escritura de la columna CENTRO que designan el MISMO tipo. No es
 * reclasificar: es la misma palabra con otras mayúsculas. Cada una se declara aquí
 * para que ninguna se unifique por parecido sin que alguien lo haya visto.
 */
export const VARIANTES = {
  'Car Especializado': 'CAR Especializado',
};

/** El texto con el que el directorio oculta una dirección. */
export const CONFIDENCIAL = /no se registra por confidencialidad/i;
