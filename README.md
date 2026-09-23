# Mapas imprimibles del MIMP

Aplicación web estática que genera mapas de los servicios del MIMP **listos para
imprenta**, como PDF vectorial. El usuario elige tamaño de hoja, orientación, ámbito
(Perú, departamento, provincia, distrito), capas, tipos de servicio y textos; la
aplicación compone el mapa y lo descarga.

No es una captura de pantalla ampliada: el PDF se construye a partir de la geometría,
con las fuentes incrustadas, de modo que se puede imprimir en A0 sin que aparezca un
solo píxel.

> **Estado: Fase 1 — motor de composición y PDF vectorial.**
> `npm run muestras` ya genera mapas nacionales imprimibles en A4, A3 y A0. Faltan los
> elementos del layout (Fase 2), el contenido temático (Fase 3), los rótulos (Fase 4) y
> la interfaz web (Fase 5): la página publicada todavía no compone mapas.

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo (prepara los datos la primera vez)
```

Para generar el sitio tal y como se publica:

```bash
npm run build      # prepara lo que falte y compila en dist/
npm run preview    # sirve dist/ para revisarlo
```

La primera ejecución descarga unos 95 MB de cartografía y tipografías y tarda algo más
de un minuto. Queda todo en `.cache/`, así que las siguientes son de segundos.

## De dónde salen los datos

Nada de lo que hay en `public/data` ni en `public/fonts` se versiona: son material
derivado que el build reconstruye desde orígenes **anclados a una versión concreta**,
declarada en `package.json`. Así dos personas que compilen el mismo commit obtienen
exactamente el mismo mapa.

| Variable | Origen | Qué aporta |
|---|---|---|
| `DATOS_TAG` | [Distancia-al-centro-de-atencion](https://github.com/Rodasluis/Distancia-al-centro-de-atencion) | `centros.json`, `iconos.json` y los PNG de los íconos |
| `GEO_TAG` | [Peru-maps](https://github.com/Rodasluis/Peru-maps) | límites de departamento, provincia y distrito (INEI) |
| `NATURAL_EARTH_TAG` | [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | países vecinos, océano y lagos |
| `POPPINS_TAG` | [google/fonts](https://github.com/google/fonts) | Poppins (SIL OFL 1.1) |
| `SOURCE_SANS_TAG` | [adobe-fonts/source-sans](https://github.com/adobe-fonts/source-sans) | Source Sans 3 (SIL OFL 1.1) |

`DATOS_TAG` y `GEO_TAG` admiten una etiqueta, una rama o un SHA de commit. Hoy apuntan
a un commit porque esos repositorios todavía no publican etiquetas; en cuanto exista
una, basta con poner su nombre.

### Actualizar el directorio de servicios

1. Cambia `DATOS_TAG` en `package.json` por la versión nueva del buscador.
2. `npm run datos` — vuelve a descargarlo y **lo verifica**.
3. Revisa el informe que imprime: total de centros, recuento por tipo y calidad de las
   coordenadas. Debe cuadrar con lo que publique el buscador en esa versión.
4. `npm run build`.

La versión queda registrada en `public/data/version.json` y aparece en el pie de cada
PDF, para que un mapa impreso siempre diga de qué corte de datos salió.

### El criterio de publicación no se toca aquí

Qué centros se publican lo decide el buscador, con una tabla de clasificación auditada.
Este proyecto **no reclasifica nada**: si un tipo no está en `centros.json`, no existe
para el mapa. Los **Hogares de Refugio Temporal** quedan fuera en origen —su dirección
está reservada para proteger a las víctimas— y `npm run datos` se detiene si alguna vez
apareciera uno, incluso dentro de un recuento agregado.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run datos` | Descarga y **verifica** el directorio de servicios |
| `npm run fuentes` | Descarga Poppins y Source Sans 3 con sus licencias |
| `npm run geo` | Descarga la cartografía y construye el TopoJSON |
| `npm run preparar` | Ejecuta los pasos anteriores que falten (`-- --forzar` rehace todo) |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Prepara lo necesario y compila en `dist/` |
| `npm run muestras` | Genera y verifica los PDF de `muestras/` |

## Cómo está organizado

```
scripts/      build: descarga, verificación y construcción de la cartografía
src/motor/    composición del mapa y exportación a PDF (Fase 1)
src/ui/       interfaz de configuración (Fase 5)
src/estilo/   tokens.js — única definición de colores, tipografías y grosores
public/       lo que se sirve tal cual (datos y tipografías, generados)
referencias/  mapa de 2020 y logotipos que sirven de referencia
muestras/     PDF de prueba que genera cada fase
tests/        pruebas de integridad y de regresión visual (Fase 8)
```

### La cartografía, en tres niveles

`scripts/build-geo.mjs` publica cada capa en tres niveles de detalle, elegidos por un
criterio de imprenta y no a ojo: en papel no se distinguen dos trazos separados por
menos de unos 0,15 mm, así que un nivel con tolerancia *T* sobre el terreno es
indistinguible del original desde la escala 1:(*T* / 0,15 mm) hacia escalas menos
detalladas.

Cada nivel indica el denominador de escala **mínimo** al que sigue siendo
indistinguible del original; el motor escoge el más ligero que cumpla `N >= mínimo`.

| Nivel | Tolerancia | Válido desde | En la práctica |
|---|---:|---|---|
| `bajo` | 1 200 m | 1:8 000 000 | mapas de ubicación |
| `medio` | 300 m | 1:2 000 000 | nacional en A4 (1:7,9 M) y A3 (1:5,4 M) |
| `alto` | 40 m | 1:266 000 | nacional en A0 (1:1,8 M), departamento, provincia y distrito |

Dos detalles que evitan defectos visibles al imprimir:

- La simplificación se hace **sobre una topología común**, de modo que un límite
  compartido por dos distritos se simplifica igual en los dos. Simplificados por
  separado, aparecen hilos blancos a lo largo de las fronteras.
- Provincias y distritos se reparten en un archivo por departamento conservando **los
  mismos arcos** de esa topología, así que el borde entre dos departamentos encaja
  exactamente aunque cada uno se cargue de un archivo distinto. El build lo comprueba.

El build termina midiendo la superficie del Perú sobre la geometría ya publicada y
comparándola con los 1 285 216 km² oficiales del INEI: sale 1 291 717 km² (+0,51 %),
lo que valida de una vez el sentido de giro de los anillos, la topología y las unidades.

`public/data/geo/indice.json` describe los niveles, los archivos y las cajas
envolventes; es lo que el motor consulta para elegir qué cargar.

## El motor: del dato al PDF

`src/motor/` compone **un solo SVG** que sirve a la vez de vista previa y de original
de imprenta, y `svg2pdf` lo traduce trazo por trazo a operadores de dibujo del PDF. No
hay dos caminos de dibujo, así que la pantalla y el papel no pueden divergir.

- **Todo se mide en milímetros.** El `viewBox` del SVG es la hoja en mm, de modo que un
  `stroke-width` de 0,3 son 0,3 mm impresos. Los grosores y los cuerpos de texto están
  en medidas **reales de imprenta** (`src/estilo/tokens.js`): un límite departamental
  mide lo mismo en A4 que en A0. Lo que cambia con la hoja es cuánto cabe, no el tamaño.
- **La escala se mide, no se deduce.** Se compara una distancia sobre el terreno con la
  que ocupa en el papel, en el centro del marco. Como la Mercator transversa estira al
  alejarse del meridiano central, se comprueban también las esquinas: en el nacional la
  variación es del 0,7 %, que se absorbe en el redondeo de la escala impresa.
- **Nada de mapas de bits.** `tests/verificar-pdf.mjs` rechaza cualquier PDF que
  contenga un `<image>` o que caiga en una tipografía del visor.

`npm run muestras` genera los PDF desde un Chromium sin ventana en lugar de componerlos
en Node, porque `svg2pdf` mide el texto con el motor de tipografía del navegador: así
una muestra y una descarga desde la web salen del mismo código y del mismo medidor.

Con `-- --fecha=AAAA-MM-DD` la salida es reproducible **byte a byte**: además de la
fecha se fija el identificador de archivo del PDF, que jsPDF sortea al azar en cada
ejecución. Sin ese detalle, dos salidas idénticas no se parecen al compararlas.

## Despliegue

Cada push a `main` publica en GitHub Pages
(`.github/workflows/deploy.yml`). El trabajo por fases va en ramas `fase-N-...` y `main`
sólo recibe fusiones revisadas, porque cualquier cosa que llegue a `main` se publica.

## Licencias

Poppins y Source Sans 3 se distribuyen bajo SIL Open Font License 1.1; su texto viaja
junto a los archivos en `public/fonts/`. La cartografía procede del INEI y de Natural
Earth (dominio público).
