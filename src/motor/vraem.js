/**
 * Ámbito del VRAEM, el Valle de los ríos Apurímac, Ene y Mantaro (Fase 23).
 *
 * Es un ámbito de intervención del Estado, no una circunscripción: lo fija un decreto
 * supremo con la lista de sus distritos, que se ha reordenado varias veces. La lista de
 * aquí es la VIGENTE: el artículo 1 del D.S. N.º 040-2016-PCM tal como quedó tras el
 * D.S. N.º 133-2022-PCM (El Peruano, 3 de noviembre de 2022). Ese decreto reescribió
 * los incisos que cambiaba y dejó los demás con «(…)», así que la lista se compone de
 * los dos: de 2022, Huanta y La Mar del ámbito directo, La Convención, Chincheros y la
 * parte de influencia de La Mar y de Tayacaja; del de 2016, el resto. Suma 37 distritos
 * de intervención directa y 43 de influencia, 80 en cinco departamentos y diez
 * provincias, que es lo que cuentan los informes del Congreso sobre el VRAEM.
 *
 * Los nombres van como los escribe el decreto; el ubigeo es el del INEI.
 * scripts/build-capas.mjs comprueba en cada build que cada ubigeo existe en la
 * cartografía y que su nombre es el mismo, y se detiene si no.
 *
 * El directorio del MIMP trae su propia marca «Zona Vraem», pero no sirve como ámbito:
 * marca servicios de Pinto Recodo (San Martín) e Ichuña (Moquegua), que no están en
 * ningún decreto del VRAEM. El mapa usa la lista del decreto.
 */

export const NORMA_VRAEM = 'D.S. N.º 040-2016-PCM, modificado por el D.S. N.º 133-2022-PCM';

export const NOMBRE_VRAEM = 'Valle de los ríos Apurímac, Ene y Mantaro';

/** [ubigeo, nombre en el decreto] por ámbito, en el orden del decreto. */
const DIRECTA = [
  // Ayacucho, provincia de Huanta (D.S. 133-2022-PCM)
  ['050402', 'Ayahuanco'], ['050409', 'Canayre'], ['050412', 'Chaca'], ['050408', 'Llochegua'],
  ['050411', 'Pucacolpa'], ['050413', 'Putis'], ['050406', 'Santillana'], ['050407', 'Sivia'],
  ['050410', 'Uchuraccay'],
  // Ayacucho, provincia de La Mar (D.S. 133-2022-PCM)
  ['050510', 'Anchihuay'], ['050502', 'Anco'], ['050503', 'Ayna'], ['050505', 'Chungui'],
  ['050511', 'Oronccoy'], ['050513', 'Río Magdalena'], ['050509', 'Samugari'], ['050507', 'Santa Rosa'],
  ['050512', 'Unión Progreso'],
  // Cusco, provincia de La Convención (D.S. 133-2022-PCM)
  ['080916', 'Cielo Punco'], ['080911', 'Inkawasi'], ['080907', 'Kimbiri'], ['080917', 'Manitea'],
  ['080910', 'Pichari'], ['080912', 'Villa Virgen'], ['080913', 'Villa Kintiarina'], ['080918', 'Unión Asháninka'],
  // Huancavelica, provincia de Tayacaja (D.S. 040-2016-PCM)
  ['090720', 'Andaymarca'], ['090707', 'Huachocolpa'], ['090717', 'Surcubamba'], ['090718', 'Tintay Puncu'],
  ['090721', 'Roble'],
  // Junín, provincia de Huancayo (D.S. 040-2016-PCM)
  ['120124', 'Pariahuanca'], ['120135', 'Santo Domingo de Acobamba'],
  // Junín, provincia de Satipo (D.S. 040-2016-PCM)
  ['120604', 'Mazamari'], ['120606', 'Pangoa'], ['120608', 'Río Tambo'], ['120609', 'Vizcatán del Ene'],
];

const INFLUENCIA = [
  // Apurímac, provincia de Andahuaylas (D.S. 040-2016-PCM)
  ['030202', 'Andarapa'], ['030219', 'Kaquiabamba'], ['030208', 'Pacobamba'],
  // Apurímac, provincia de Chincheros (D.S. 133-2022-PCM)
  ['030612', 'Ahuayro'], ['030610', 'El Porvenir'], ['030604', 'Huaccana'], ['030611', 'Los Chankas'],
  ['030605', 'Ocobamba'], ['030606', 'Ongoy'], ['030609', 'Rocchacc'],
  // Ayacucho, provincia de Huanta (D.S. 040-2016-PCM)
  ['050403', 'Huamanguilla'], ['050401', 'Huanta'], ['050404', 'Iguaín'], ['050405', 'Luricocha'],
  // Ayacucho, provincia de La Mar (D.S. 133-2022-PCM)
  ['050504', 'Chilcas'], ['050506', 'Luis Carranza'], ['050514', 'Ninabamba'], ['050515', 'Patibamba'],
  ['050501', 'San Miguel'], ['050508', 'Tambo'],
  // Huancavelica, provincia de Churcampa (D.S. 040-2016-PCM)
  ['090503', 'Chinchihuasi'], ['090510', 'Pachamarca'], ['090507', 'Paucarbamba'], ['090509', 'San Pedro de Coris'],
  // Huancavelica, provincia de Tayacaja (D.S. 133-2022-PCM)
  ['090702', 'Acostambo'], ['090703', 'Acraquia'], ['090704', 'Ahuaycha'], ['090725', 'Cochabamba'],
  ['090705', 'Colcabamba'], ['090706', 'Daniel Hernández'], ['090709', 'Huaribamba'], ['090724', 'Lambras'],
  ['090710', 'Ñahuimpuquio'], ['090719', 'Quichuas'], ['090713', 'Quishuar'], ['090701', 'Pampas'],
  ['090711', 'Pazos'], ['090722', 'Pichos'], ['090714', 'Salcabamba'], ['090715', 'Salcahuasi'],
  ['090723', 'Santiago de Tucuma'], ['090716', 'San Marcos de Rocchac'],
  // Junín, provincia de Concepción (D.S. 040-2016-PCM)
  ['120203', 'Andamarca'],
];

export const DISTRITOS_VRAEM = [
  ...DIRECTA.map(([ubigeo, nombre]) => ({ ubigeo, nombre, ambito: 'directa' })),
  ...INFLUENCIA.map(([ubigeo, nombre]) => ({ ubigeo, nombre, ambito: 'influencia' })),
];

const AMBITO_DE = new Map(DISTRITOS_VRAEM.map((d) => [d.ubigeo, d.ambito]));

/** ¿Está el distrito en el VRAEM? 'directa', 'influencia' o null. */
export const ambitoVraem = (ubigeo) => AMBITO_DE.get(String(ubigeo)) || null;

/** Departamentos con algún distrito del VRAEM: los únicos que hay que cargar. */
export const DEPARTAMENTOS_VRAEM = [...new Set(DISTRITOS_VRAEM.map((d) => d.ubigeo.slice(0, 2)))].sort();
