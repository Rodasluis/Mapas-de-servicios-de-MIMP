/**
 * Catálogo de los tipos de servicio: sigla de cada uno.
 *
 * La forma y el color de los íconos están en estilos.js; aquí sólo vive lo que no
 * depende del estilo. La sigla se usa en la leyenda cuando el nombre largo no cabe y
 * en la hoja de íconos.
 *
 * Las claves son EXACTAMENTE los valores de `tipo` de centros.json, que es la columna
 * CENTRO del directorio del MIMP, y los tipos que el criterio de publicación
 * (scripts/lib/criterios.mjs) deja entrar. No se normalizan ni se interpretan: si el
 * directorio trae un tipo nuevo, el build avisa en vez de asignarle un ícono por
 * parecido.
 */
export const ICONOS = {
  'Centro Emergencia Mujer y Familia': { sigla: 'CEM' },
  'Servicio de Atención Rural - SAR': { sigla: 'SAR' },
  'CAR Básico': { sigla: 'CAR B' },
  'CAR Especializado': { sigla: 'CAR E' },
  'Unidad de Protección Especial - UPE': { sigla: 'UPE' },
  'Centro de Desarrollo Integral de La Familia - CEDIF': { sigla: 'CEDIF' },
  'Centro de Atención de Día - CAD': { sigla: 'CAD' },
  'Centro de Atención de Noche - CAN': { sigla: 'CAN' },
  'CAR PCD': { sigla: 'CAR PCD' },
  'Acercándonos': { sigla: 'ACE' },
  'Servicio de Atención Urgente - SAU': { sigla: 'SAU' },
  'CAR de Urgencia': { sigla: 'CAR U' },
  'Unidad de Adopción - UA': { sigla: 'UA' },
  'Centro de Atencion Institucional - CAI': { sigla: 'CAI' },
  'Centro de Atención Residencial para Personas Adultas Mayores - CARPAM': { sigla: 'CARPAM' },
  'Centro Comunal Familiar': { sigla: 'CCF' },
  'Plataforma de Atención': { sigla: 'PA' },
  SAIPD: { sigla: 'SAIPD' },
  'Centro de Recreación Familiar': { sigla: 'CRF' },
  'Mi60+': { sigla: 'Mi60+' },
  'Educadores de Calle': { sigla: 'EC' },
  'Hogares de Refugio Temporal - HRT': { sigla: 'HRT' },
};
