/**
 * Catálogo de íconos de los servicios del MIMP.
 *
 * ---------------------------------------------------------------------------
 * De dónde sale la forma
 * ---------------------------------------------------------------------------
 * El mapa de 2020 representa cada servicio con una INSIGNIA EN FORMA DE CASA,
 * rellena del color del tipo y con un pictograma blanco dentro. Los PNG que publica
 * el buscador son esa misma familia —casitas de 22 × 22 px— pero a esa resolución
 * sólo se distinguen por el color, y el color no basta: de los veinte tipos, cinco
 * son rojos muy parecidos (CEM #b62539, UA #b93f4d, CAI #dc4649, CARPAM #e31e24 y
 * SAR #ba0d15). A 3 mm de diámetro, impresos, serían el mismo punto.
 *
 * Por eso se conserva la forma —la casa— y el color de iconos.json, que es lo que
 * pide la fase, y se redibuja el interior: cada tipo lleva un pictograma propio,
 * trazado con la geometría más simple que lo haga reconocible. Un dibujo detallado
 * a 3 mm se convierte en una mancha; lo que sobrevive a ese tamaño son siluetas de
 * tres o cuatro elementos con mucho contraste.
 *
 * ---------------------------------------------------------------------------
 * Sistema de coordenadas
 * ---------------------------------------------------------------------------
 * Todo se dibuja en una caja de 100 × 100. La insignia ocupa la caja entera y el
 * pictograma vive dentro del cuerpo de la casa, aproximadamente entre x 22-78 e
 * y 38-88. El motor escala esa caja al tamaño en milímetros que toque.
 *
 * ---------------------------------------------------------------------------
 * Correspondencia tipo → ícono
 * ---------------------------------------------------------------------------
 * La clave de ICONOS es EXACTAMENTE el valor del campo `tipo` de centros.json. No se
 * normaliza ni se interpreta: si el buscador publica un tipo nuevo, el build avisa en
 * vez de asignarle un ícono por parecido. El color no se define aquí: se lee de
 * iconos.json, que es la fuente del buscador.
 */

/** Silueta de la casa. Tejado a dos aguas y base con las esquinas redondeadas. */
export const INSIGNIA = 'M50 3 L95 38 L95 90 Q95 97 88 97 L12 97 Q5 97 5 90 L5 38 Z';

/**
 * Pictogramas, en blanco sobre el color del tipo.
 *
 * `d` son trazados rellenos y `trazos` son líneas con grosor, que a tamaño pequeño
 * aguantan mejor que un relleno fino. Las medidas están pensadas para que ningún
 * elemento baje de 4 unidades (0,12 mm a 3 mm de insignia), que es el límite por
 * debajo del cual una imprenta offset ya no garantiza el trazo.
 */
export const GLIFOS = {
  /** Símbolo femenino: círculo con cruz debajo. */
  mujer: {
    d: 'M50 38a13 13 0 1 0 0 26 13 13 0 0 1 0-26zm0 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
    trazos: [[50, 62, 50, 86, 7], [40, 76, 60, 76, 7]],
  },

  /** Dos cumbres: el servicio rural. */
  montanas: {
    d: 'M24 84 L41 52 L54 76 L62 62 L78 84 Z',
  },

  /** Cama: acogida residencial. */
  cama: {
    d: 'M24 62h12v10h40v14H24z',
    trazos: [[24, 86, 24, 58, 7]],
  },

  /** Cama con estrella: acogida residencial especializada. */
  camaEstrella: {
    d: 'M24 66h10v8h34v12H24z M74 40l4 10 10 1-8 7 3 10-9-6-9 6 3-10-8-7 10-1z',
    trazos: [[24, 86, 24, 62, 7]],
  },

  /** Escudo: protección especial. */
  escudo: {
    d: 'M50 36 L74 45 V64 Q74 80 50 90 Q26 80 26 64 V45 Z',
  },

  /** Dos figuras, una mayor y una menor: familia. */
  familia: {
    d: 'M38 40a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'
      + 'M26 62h24v26H26z'
      + 'M66 50a7 7 0 1 1 0 14 7 7 0 0 1 0-14z'
      + 'M57 68h18v20H57z',
  },

  /** Sol: atención de día. */
  sol: {
    d: 'M50 48a14 14 0 1 1 0 28 14 14 0 0 1 0-28z',
    trazos: [
      [50, 32, 50, 42, 6], [50, 82, 50, 92, 6],
      [26, 62, 36, 62, 6], [64, 62, 74, 62, 6],
      [33, 45, 40, 52, 6], [60, 72, 67, 79, 6],
      [67, 45, 60, 52, 6], [40, 72, 33, 79, 6],
    ],
  },

  /**
   * Luna creciente: atención de noche.
   *
   * Los dos arcos tienen que barrer en sentidos OPUESTOS (sweep 0 y sweep 1). Con el
   * mismo sentido, el segundo arco vuelve sobre el primero y el relleno se anula: la
   * insignia salía lisa, sin pictograma.
   */
  luna: {
    d: 'M56 36 A25 25 0 1 0 56 88 A20 20 0 1 1 56 36 Z',
  },

  /** Silla de ruedas: personas con discapacidad. */
  accesible: {
    d: 'M44 34a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
    trazos: [
      [44, 52, 44, 74, 7], [44, 58, 64, 58, 7], [44, 74, 66, 74, 7],
      [66, 74, 72, 88, 7],
    ],
    circulos: [[50, 78, 14, 6]],
  },

  /** Furgoneta: servicio que se desplaza. */
  furgoneta: {
    d: 'M22 52h34v22H22z M56 58h14l10 10v6H56z',
    circulos: [[36, 80, 7, 6], [70, 80, 7, 6]],
  },

  /** Rayo: atención urgente. */
  rayo: {
    d: 'M56 32 L32 68 H46 L42 92 L68 54 H52 Z',
  },

  /** Cruz: urgencia con componente sanitario. */
  cruz: {
    d: 'M42 34h16v20h20v16H58v20H42V70H22V54h20z',
  },

  /** Corazón sobre unas manos: adopciones. */
  corazon: {
    d: 'M50 56c-6-12-22-8-22 4 0 10 12 18 22 26 10-8 22-16 22-26 0-12-16-16-22-4z',
    trazos: [[28, 92, 72, 92, 7]],
  },

  /** Estrella: atención institucional. */
  estrella: {
    d: 'M50 32 L59 56 L84 56 L64 71 L71 94 L50 80 L29 94 L36 71 L16 56 L41 56 Z',
  },

  /** Figura con bastón: personas adultas mayores. */
  baston: {
    d: 'M42 34a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
    trazos: [
      [42, 54, 42, 76, 7], [42, 76, 34, 92, 7], [42, 76, 50, 92, 7],
      [42, 60, 30, 68, 7],
      [66, 52, 66, 92, 6], [60, 52, 72, 52, 6],
    ],
  },

  /** Tres figuras: centro comunal. */
  tresFiguras: {
    d: 'M30 44a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 62h20v26H20z'
      + 'M50 40a8 8 0 1 1 0 16 8 8 0 0 1 0-16z M39 60h22v28H39z'
      + 'M70 44a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M60 62h20v26H60z',
  },

  /** Mostrador con atención: plataforma. */
  mostrador: {
    d: 'M50 34a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M38 56h24v14H38z M18 74h64v14H18z',
  },

  /** Letra «i»: servicio de información y orientación. */
  informacion: {
    d: 'M50 34a8 8 0 1 1 0 16 8 8 0 0 1 0-16z M42 56h16v34H42z',
  },

  /** Pelota: recreación. */
  pelota: {
    d: 'M50 40a24 24 0 1 1 0 48 24 24 0 0 1 0-48zm0 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32z',
    trazos: [[26, 64, 74, 64, 6], [50, 40, 50, 88, 6]],
  },

  /** Signo «+»: la marca del programa Mi60+. */
  mas: {
    d: 'M42 36h16v20h20v16H58v20H42V72H22V56h20z',
  },
};

/**
 * Tipo de servicio → pictograma y sigla.
 *
 * Las claves son los veinte valores de `tipo` que publica centros.json en DATOS_TAG.
 * La sigla se usa en la leyenda cuando el nombre largo no cabe.
 */
export const ICONOS = {
  'Centro Emergencia Mujer y Familia': { glifo: 'mujer', sigla: 'CEM' },
  'Servicio de Atención Rural - SAR': { glifo: 'montanas', sigla: 'SAR' },
  'CAR Básico': { glifo: 'cama', sigla: 'CAR B' },
  'CAR Especializado': { glifo: 'camaEstrella', sigla: 'CAR E' },
  'Unidad de Protección Especial - UPE': { glifo: 'escudo', sigla: 'UPE' },
  'Centro de Desarrollo Integral de La Familia - CEDIF': { glifo: 'familia', sigla: 'CEDIF' },
  'Centro de Atención de Día - CAD': { glifo: 'sol', sigla: 'CAD' },
  'Centro de Atención de Noche - CAN': { glifo: 'luna', sigla: 'CAN' },
  'CAR PCD': { glifo: 'accesible', sigla: 'CAR PCD' },
  'Acercándonos': { glifo: 'furgoneta', sigla: 'ACE' },
  'Servicio de Atención Urgente - SAU': { glifo: 'rayo', sigla: 'SAU' },
  'CAR de Urgencia': { glifo: 'cruz', sigla: 'CAR U' },
  'Unidad de Adopción - UA': { glifo: 'corazon', sigla: 'UA' },
  'Centro de Atencion Institucional - CAI': { glifo: 'estrella', sigla: 'CAI' },
  'Centro de Atención Residencial para Personas Adultas Mayores - CARPAM': { glifo: 'baston', sigla: 'CARPAM' },
  'Centro Comunal Familiar': { glifo: 'tresFiguras', sigla: 'CCF' },
  'Plataforma de Atención': { glifo: 'mostrador', sigla: 'PA' },
  SAIPD: { glifo: 'informacion', sigla: 'SAIPD' },
  'Centro de Recreación Familiar': { glifo: 'pelota', sigla: 'CRF' },
  'Mi60+': { glifo: 'mas', sigla: 'Mi60+' },
};
