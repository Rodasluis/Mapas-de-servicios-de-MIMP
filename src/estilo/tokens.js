/**
 * Tokens de estilo: la ÚNICA definición de colores, tipografías y grosores.
 *
 * Están en JavaScript y no en CSS porque el mismo motor tiene que componer el SVG
 * dentro del navegador y también en Node, cuando `npm run muestras` genera los PDF
 * sin interfaz. Un token definido en una hoja de estilos no existe fuera del DOM.
 * La interfaz los recibe como variables CSS a través de `comoVariablesCss()`.
 *
 * Los valores de la rampa, el agua y el gris de los límites están LEÍDOS del mapa de
 * referencia (referencias/mapa_referencia_2020.png) para que la nueva salida y la de
 * 2020 se puedan poner una al lado de la otra; el rojo y el gris institucionales
 * salen del logotipo (referencias/logos/mimp.png).
 */

/* --------------------------------- color -------------------------------- */

export const color = {
  /* Marca, muestreada del logotipo institucional. */
  mimpRojo: '#ec1c24',
  mimpGris: '#58595b',
  /* Azul institucional de apoyo: pendiente de confirmar con el manual de marca. */
  mimpAzul: '#1b4b8f',

  /* Agua y territorio, muestreados del mapa de referencia. */
  oceano: '#d9f1ff',
  lago: '#90dbff',
  oceanoRotulo: '#2b7ab5',
  paisVecino: '#ebebe9',
  paisVecinoBorde: '#b4b4b0',
  sinDato: '#ffffff',

  /* Territorio peruano FUERA del ámbito impreso (Fase 6). Se dibuja porque el mapa de
     un departamento que acabara en su límite parecería una isla, pero tiene que leerse
     como fondo: algo más oscuro que un país vecino, para que no se confunda con el
     extranjero, y claramente por detrás del ámbito, que va en color de clase. */
  territorioExterior: '#e3e1dd',
  territorioExteriorBorde: '#c2bfba',
  rotuloExterior: '#8a8781',

  /* Localizador: el Perú en miniatura con el ámbito resaltado. */
  localizadorRelleno: '#e8e6e2',
  localizadorDepartamento: '#f6c9b0',
  localizadorBorde: '#9a968f',
  localizadorResalte: '#ec1c24',

  /* Límites administrativos.

     El salto entre el departamental y el provincial es deliberado y grande, en color y
     en grosor a la vez. Con 0,3 mm de gris medio, el límite de departamento apenas se
     distinguía del de provincia y no se veía a qué departamento pertenece cada
     provincia, que es la primera lectura que se le pide a este mapa. */
  limiteNacional: '#000000',
  limiteDepartamental: '#111111',
  limiteProvincial: '#8a8a8a',
  limiteDistrital: '#9a9a9a',

  /* Tinta de los rótulos. */
  tinta: '#1a1a1a',
  tintaSuave: '#5a5a5a',
  halo: '#ffffff',

  /* Armazón del layout. */
  marco: '#000000',
  fondoHoja: '#ffffff',
  grilla: '#8c8c8c',
};

/**
 * Rampa del coropletas, leída de la leyenda del mapa de referencia (de menos a más).
 * Las clases son configurables (Fase 3); esta rampa es el aspecto por defecto.
 */
export const rampaNaranjas = ['#fff7e6', '#ffebbe', '#ffa77f', '#ff5500', '#a83800'];

/* ------------------------------ tipografía ------------------------------ */

/**
 * Cuerpos en PUNTOS REALES de impresión: un rótulo de 7 pt mide lo mismo en A4 que
 * en A0. Lo que cambia con la hoja es cuántos rótulos caben, no su tamaño.
 */
export const tipografia = {
  /* Estos cuerpos son los de un A4; las piezas del layout los multiplican por el
     factor de formato, así que en A0 salen al doble. Partir de un cuerpo de cartel
     dejaba en A4 un título tan grande que no cabía sobre el mar ni sobre los países
     vecinos y acababa tapando Loreto. */
  titular: { familia: 'Poppins', peso: 'Bold', pt: 13 },
  subtitulo: { familia: 'Poppins', peso: 'SemiBold', pt: 9 },
  periodo: { familia: 'Poppins', peso: 'Medium', pt: 8 },
  leyendaTitulo: { familia: 'Poppins', peso: 'SemiBold', pt: 9 },
  leyendaItem: { familia: 'Poppins', peso: 'Regular', pt: 7.5 },
  pie: { familia: 'Poppins', peso: 'Regular', pt: 6.5 },
  tabla: { familia: 'Poppins', peso: 'Regular', pt: 6.5 },

  rotuloDepartamento: { familia: 'SourceSans3', peso: 'Bold', pt: 9, versalitas: true },
  rotuloProvincia: { familia: 'SourceSans3', peso: 'Regular', pt: 6.5 },
  rotuloDistrito: { familia: 'SourceSans3', peso: 'Regular', pt: 5.5 },
  rotuloCentro: { familia: 'SourceSans3', peso: 'Semibold', pt: 5.5 },
  rotuloPais: { familia: 'SourceSans3', peso: 'Bold', pt: 11 },
  rotuloAgua: { familia: 'SourceSans3', peso: 'It', pt: 9 },
  grilla: { familia: 'SourceSans3', peso: 'Regular', pt: 5.5 },
};

/** Archivos TTF que hay que incrustar, por familia y peso. */
export const fuentes = {
  'Poppins:Regular': 'Poppins-Regular.ttf',
  'Poppins:Medium': 'Poppins-Medium.ttf',
  'Poppins:SemiBold': 'Poppins-SemiBold.ttf',
  'Poppins:Bold': 'Poppins-Bold.ttf',
  'SourceSans3:Regular': 'SourceSans3-Regular.ttf',
  'SourceSans3:It': 'SourceSans3-It.ttf',
  'SourceSans3:Semibold': 'SourceSans3-Semibold.ttf',
  'SourceSans3:Bold': 'SourceSans3-Bold.ttf',
};

/* --------------------------------- trazo -------------------------------- */

/**
 * Grosores en MILÍMETROS REALES de impresión, por el mismo motivo que los cuerpos.
 * Por debajo de 0,08 mm una imprenta offset ya no garantiza el trazo.
 */
export const trazoMm = {
  limiteNacional: 0.5,
  limiteDepartamental: 0.5,
  limiteProvincial: 0.15,
  limiteDistrital: 0.1,
  costa: 0.25,
  paisVecino: 0.15,
  marco: 0.6,
  marcoInterior: 0.2,
  grilla: 0.08,
  recuadroZoom: 0.4,
  haloRotulo: 0.35,
};

/** Medidas del layout en milímetros. */
export const layoutMm = {
  margenHoja: 10,
  separacionBloques: 4,
  relleneBloque: 3,
  /* Distancia de la cabecera al marco. Se multiplica por el factor de formato para
     que el aire alrededor del logotipo y del título se vea igual en A4 que en A0. */
  margenCabecera: 2.6,
  iconoMin: 3,
  iconoMax: 6,
};

/* ------------------------------- interfaz ------------------------------- */

/** Vuelca los tokens como variables CSS para que la interfaz no los repita. */
export function comoVariablesCss() {
  const pares = Object.entries(color).map(([k, v]) => [`--c-${guion(k)}`, v]);
  rampaNaranjas.forEach((v, i) => pares.push([`--c-rampa-${i + 1}`, v]));
  return Object.fromEntries(pares);
}

export function aplicarVariablesCss(elemento = document.documentElement) {
  for (const [nombre, valor] of Object.entries(comoVariablesCss())) {
    elemento.style.setProperty(nombre, valor);
  }
}

const guion = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/* ------------------------------ conversiones ---------------------------- */

export const MM_POR_PULGADA = 25.4;
export const PT_POR_PULGADA = 72;

/** Milímetros a puntos PostScript; sólo se usa al exportar el PDF. */
export const mmApt = (mm) => (mm * PT_POR_PULGADA) / MM_POR_PULGADA;
export const ptAmm = (pt) => (pt * MM_POR_PULGADA) / PT_POR_PULGADA;
