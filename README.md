# Mapas imprimibles del MIMP

Aplicación web estática que genera mapas de los servicios del MIMP **listos para
imprenta**, como PDF vectorial. El usuario elige tamaño de hoja, orientación, ámbito
(Perú, departamento, provincia, distrito), capas, tipos de servicio y textos; la
aplicación compone el mapa y lo descarga.

No es una captura de pantalla ampliada: el PDF se construye a partir de la geometría,
con las fuentes incrustadas, de modo que se puede imprimir en A0 sin que aparezca un
solo píxel.

> **Estado: Fase 0 — andamiaje, datos y despliegue.**
> La página publicada todavía no dibuja mapas; comprueba que los datos se sirven y de
> qué versión del directorio proceden. La composición llega en las fases siguientes.

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
indistinguible del original hasta la escala 1:(*T* / 0,15 mm).

| Nivel | Tolerancia | Sirve hasta | Para qué |
|---|---:|---|---|
| `bajo` | 1 200 m | 1:8 000 000 | mapas de ubicación, nacional en A4 |
| `medio` | 300 m | 1:2 000 000 | nacional en A1–A0 |
| `alto` | 40 m | 1:266 000 | departamento, provincia y distrito |

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

## Despliegue

Cada push a `main` publica en GitHub Pages
(`.github/workflows/deploy.yml`). El trabajo por fases va en ramas `fase-N-...` y `main`
sólo recibe fusiones revisadas, porque cualquier cosa que llegue a `main` se publica.

## Licencias

Poppins y Source Sans 3 se distribuyen bajo SIL Open Font License 1.1; su texto viaja
junto a los archivos en `public/fonts/`. La cartografía procede del INEI y de Natural
Earth (dominio público).
