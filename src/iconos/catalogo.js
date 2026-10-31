/**
 * Catálogo de los tipos de servicio: sigla y viceministerio de cada uno.
 *
 * La forma y el color de los íconos están en estilos.js; aquí sólo vive lo que no
 * depende del estilo. La sigla se usa en la leyenda cuando el nombre largo no cabe y
 * en la hoja de íconos.
 *
 * `nombre` es cómo se escribe el tipo en la leyenda cuando el del directorio es una
 * abreviatura. Lo pidió el área usuaria en la revisión de la Fase 20: «CAR» es Centro
 * de Acogida Residencial, «SAIPD» Servicio de Atención Integral de Personas con
 * Discapacidad y «PCD» personas con discapacidad; y corrige la tilde que al del CAI le
 * falta en el directorio. Es sólo texto para leer: el tipo
 * sigue siendo la clave del directorio, y estos tipos no se abrevian en la leyenda
 * aunque no quepan, porque su sigla es justo lo que se quería evitar.
 *
 * Las claves son EXACTAMENTE los valores de `tipo` de centros.json, que es la columna
 * CENTRO del directorio del MIMP, y los tipos que el criterio de publicación
 * (scripts/lib/criterios.mjs) deja entrar. No se normalizan ni se interpretan: si el
 * directorio trae un tipo nuevo, el build avisa en vez de asignarle un ícono por
 * parecido.
 *
 * El viceministerio NO viene en el directorio: ninguna de sus columnas lo dice. Está
 * asignado a mano, tipo a tipo, según la unidad que presta cada servicio (AURORA en
 * el de la Mujer; INABIF, la DGNNA y las demás unidades en el de Poblaciones
 * Vulnerables), y revisado por el área usuaria. Un tipo publicado sin viceministerio
 * detiene el build, igual que uno sin ícono.
 */
export const VICEMINISTERIOS = {
  VMM: 'Viceministerio de la Mujer',
  VMPV: 'Viceministerio de Poblaciones Vulnerables',
};

export const ICONOS = {
  'Centro Emergencia Mujer y Familia': { sigla: 'CEM', viceministerio: 'VMM' },
  'Servicio de Atención Rural - SAR': { sigla: 'SAR', viceministerio: 'VMM' },
  'CAR Básico': { sigla: 'CAR Básico', nombre: 'Centro de Acogida Residencial Básico', viceministerio: 'VMPV' },
  'CAR Especializado': {
    sigla: 'CAR Especializado', nombre: 'Centro de Acogida Residencial Especializado', viceministerio: 'VMPV',
  },
  'Unidad de Protección Especial - UPE': { sigla: 'UPE', viceministerio: 'VMPV' },
  'Centro de Desarrollo Integral de La Familia - CEDIF': { sigla: 'CEDIF', viceministerio: 'VMPV' },
  'Centro de Atención de Día - CAD': { sigla: 'CAD', viceministerio: 'VMPV' },
  'Centro de Atención de Noche - CAN': { sigla: 'CAN', viceministerio: 'VMPV' },
  'CAR PCD': {
    sigla: 'CAR PCD',
    nombre: 'Centro de Acogida Residencial para Personas con Discapacidad',
    viceministerio: 'VMPV',
  },
  'Acercándonos': { sigla: 'ACE', viceministerio: 'VMPV' },
  'Servicio de Atención Urgente - SAU': { sigla: 'SAU', viceministerio: 'VMM' },
  'CAR de Urgencia': { sigla: 'CAR Urgencia', nombre: 'Centro de Acogida Residencial de Urgencia', viceministerio: 'VMPV' },
  'Unidad de Adopción - UA': { sigla: 'UA', viceministerio: 'VMPV' },
  // El directorio lo escribe sin tilde; la leyenda, con ella.
  'Centro de Atencion Institucional - CAI': {
    sigla: 'CAI', nombre: 'Centro de Atención Institucional - CAI', viceministerio: 'VMM',
  },
  'Centro de Atención Residencial para Personas Adultas Mayores - CARPAM': { sigla: 'CARPAM', viceministerio: 'VMPV' },
  'Centro Comunal Familiar': { sigla: 'CCF', viceministerio: 'VMPV' },
  'Plataforma de Atención': { sigla: 'PA', viceministerio: 'VMPV' },
  SAIPD: {
    sigla: 'SAIPD',
    nombre: 'Servicio de Atención Integral de Personas con Discapacidad',
    viceministerio: 'VMPV',
  },
  'Centro de Recreación Familiar': { sigla: 'CRF', viceministerio: 'VMPV' },
  'Mi60+': { sigla: 'Mi60+', viceministerio: 'VMPV' },
  'Educadores de Calle': { sigla: 'EC', viceministerio: 'VMPV' },
  'Hogares de Refugio Temporal - HRT': { sigla: 'HRT', viceministerio: 'VMM' },
};
