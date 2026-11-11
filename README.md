# Sandbox PTAR

Aplicación web docente para armar a escala una planta de tratamiento de aguas
residuales (PTAR): colocar unidades con sus dimensiones reales sobre el terreno,
conectarlas, validar criterios de diseño, estimar la calidad del efluente y un
costo de orden de magnitud en MXN.

Sitio 100 % estático (sin servidor ni cuentas). Vite + React + TypeScript,
Zustand y react-three-fiber.

## Estado por fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Lienzo isométrico, terreno, catálogo y formulario de dimensiones | Lista |
| 2 | Tuberías y propagación de caudal | Lista |
| 3 | Motor de validación por unidad y del tren | Lista |
| 4 | Calidad del efluente y normas | Lista |
| 5 | Costos | Lista |
| 6 | Guardado, PDF y modo profesor | Lista |

## Uso local

Requiere Node.js 20 o posterior.

```bash
npm install
npm run dev      # servidor de desarrollo en http://localhost:5173
npm test         # pruebas unitarias (Vitest)
npm run build    # revisa tipos y genera el sitio en dist/
npm run preview  # sirve dist/ para probar la versión final
```

## Controles del lienzo

- Arrastrar el fondo: desplazar la vista. Rueda del ratón: acercar o alejar.
- Botones ⟲ ⟳: girar la vista en pasos de 90°. Botón ⤢: encuadrar el terreno.
- Arrastrar una unidad del catálogo al terreno (o hacer clic) para agregarla.
- Arrastrar una unidad para moverla; se ajusta a la cuadrícula de 1 m o 0.5 m.
- `R` rota 90°, `Ctrl+D` duplica, `Supr` borra, `Ctrl+Z` / `Ctrl+Y` deshace y rehace.

## Tuberías

- Cada unidad muestra sus puertos: **cubo = salida**, **esfera = entrada**, con
  el color del fluido (agua, lodos, recirculación, aire, rechazo).
- Para conectar: clic en un puerto de salida y luego en uno de entrada
  resaltado en verde. `Esc` cancela.
- Clic en una tubería para elegir diámetro nominal, material y régimen, y ver
  longitud, caudal y velocidad.
- Con la tubería seleccionada: arrastrar una esfera blanca crea un quiebre;
  arrastrar un punto azul lo mueve; doble clic lo elimina.

### Cómo se calcula el caudal

`src/calc/grafo.ts` propaga el caudal desde el influente (a Qmed y a Qmáx):

- Varias tuberías que llegan a una unidad se suman; varias que salen del mismo
  puerto se reparten por partes iguales.
- La purga de lodos es un caudal fijo (parámetro de la unidad, en m³/d) que se
  resta del efluente.
- La recirculación de lodos vale R % del caudal fresco del reactor (parámetro
  "Recirculación") y solo cuenta si existe la tubería de recirculación.
- Sobrenadante, lixiviado, filtrado y rechazo de ósmosis son un porcentaje del
  caudal que entra a la unidad.
- El caudal por módulo es el de la unidad entre el número de módulos.

Velocidad `v = Q / A` a tubo lleno, con el diámetro interior igual al nominal.
A presión se revisa el mínimo a Qmed y el máximo a Qmáx; en canal o gravedad,
el mínimo a Qmed. Los límites, colores, diámetros y materiales están en
`src/data/tuberias.json`. Las líneas de lodos y de aire no se evalúan (ver las
notas en ese archivo).

## Validación

Cada unidad calcula sus indicadores con el caudal que le llega y los compara
con los rangos de `src/data/rangos.json`. Semáforo: verde (en rango), amarillo
(hasta 15 % fuera del límite violado), rojo (más de 15 % fuera), gris (no se
puede calcular, por ejemplo porque no llega caudal). El mensaje dice el
indicador, el valor y el rango; nunca la dimensión correcta.

Convenciones de cálculo (`src/calc/indicadores.ts`):

- Las áreas y volúmenes suman todos los módulos en paralelo.
- TRH, F/M y carga superficial usan el caudal fresco (sin recirculación de
  lodos); la carga de sólidos del sedimentador secundario sí la incluye.
- `F/M = Q·DBO₅ / (V·SSLM)`. La DBO₅ que llega al reactor se estima con las
  eficiencias de `src/data/eficiencias.json`.
- `TRC = V·(Qr + Qw) / (Qw·(Q + Qr))`, del balance de sólidos en el
  sedimentador, con Qw = caudal de purga y Qr = recirculación. En el SBR,
  `TRC = V·(1 − fracción de decantación) / Qw`.
- Rejillas: velocidad entre barras con el área libre `ancho × tirante × a/(a+e)`.
- Contacto de cloro: relación largo:ancho del recorrido = `n²·L / W`, con n
  canales en serpentín.

La validación del tren (`src/calc/tren.ts`) revisa: exactamente un influente y
al menos un destino, unidades sin conectar, puertos obligatorios libres,
unidades que generan lodos sin línea de lodos, orden de etapas y las reglas de
`src/data/reglasTren.json` (pretratamiento antes del primario y secundario,
sedimentador secundario después de los reactores, filtración antes de ósmosis).

## Calidad del efluente y normas

La calidad se propaga unidad por unidad con las eficiencias típicas de
`src/data/eficiencias.json` (fracción removida, o unidades logarítmicas para
coliformes fecales y huevos de helminto). Donde se juntan dos líneas de agua,
se mezcla ponderando por caudal. Las eficiencias no dependen de las
dimensiones: si una unidad aguas arriba está en rojo, la pestaña **Norma**
advierte que la estimación no es confiable.

Cada destino se compara contra su norma (`src/data/normas.json`):

| Destino | Norma |
|---|---|
| Descarga a cuerpo receptor o suelo | NOM-001-SEMARNAT-2021, según el tipo de receptor |
| Descarga a alcantarillado | NOM-002-SEMARNAT-1996 |
| Reúso con contacto directo o indirecto, y riego | NOM-003-SEMARNAT-1997 |

El valor estimado se compara contra el promedio mensual; si la norma no lo
define, contra el diario o el instantáneo. Estados posibles: cumple, no cumple,
no aplica (la norma marca N.A.), sin límite (la norma remite a otro documento o
el valor no se pudo transcribir) y no concluyente.

**Todos los límites llevan `"verificado": false`.** Se transcribieron del texto
publicado; hay que cotejarlos contra el DOF antes de usarlos en clase y cambiar
la marca a `true`. Lo que quedó sin valor está explicado en el campo `nota`
de cada límite.

## Costos

La pestaña **Costos** muestra la inversión como rango (−30 % / +50 %) con la
leyenda "estimación de orden de magnitud, no es presupuesto", el desglose por
etapa, la operación anual y el costo por m³ tratado. Todo sale de
`src/data/precios.json`; cada precio lleva su `fuente` y `"verificado": false`.

- **Obra civil por unidad:** excavación, concreto de losa y muros (espesores
  configurables; los módulos rectangulares adosados comparten muro) y acero
  por cuantía (kg por m³ de concreto).
- **Equipo:** `fijo × cantidad + unitario × capacidad`, donde la capacidad
  depende del equipo (kW instalados, m de diámetro, m² de tanque, L/s, etc.).
- **Tuberías:** `precioDN100 × (DN/100)^exponente` por metro, según el material.
- **Indirectos e ingeniería** como porcentaje del costo directo; **IVA** sobre
  el subtotal.
- **Operación anual:** energía (potencia en operación × factor de uso × 8 760 h
  × tarifa) y cloro (dosis × caudal). No incluye personal, mantenimiento ni
  disposición de lodos.
- **Costo por m³:** operación anual entre el volumen anual a Qmed; y operación
  más la inversión repartida en la vida útil, sin intereses.

No se incluyen edificios, instalación eléctrica, instrumentación, urbanización
ni terreno. Para actualizar precios de otro año se cambia `factorActualizacion`.

## Guardar, cargar y reporte

- **Autoguardado:** el diseño se guarda solo en el navegador (localStorage) y
  se recupera al volver a abrir la página. No sustituye al archivo: borrar los
  datos del navegador o cambiar de equipo lo pierde.
- **Guardar / Abrir:** descarga y carga el diseño como archivo `.json`. Es lo
  que el alumno entrega. Al abrir, lo que no se reconoce (unidades de un
  catálogo distinto, tuberías sin extremos) se descarta y se avisa.
- **Resumen y PDF:** muestra datos del proyecto, unidades y dimensiones,
  tuberías, alertas activas, cumplimiento de norma y costos, y exporta el
  reporte en PDF con el nombre del alumno y la vista isométrica. En la imagen
  las unidades van numeradas; los números corresponden a la tabla de unidades.

El archivo del diseño no guarda los rangos, eficiencias ni precios: al abrirlo
se evalúa con la configuración que tenga el sitio en ese momento.

## Modo profesor

Se activa agregando `?profesor=1` a la dirección del sitio (por ejemplo
`https://USUARIO.github.io/REPOSITORIO/?profesor=1`). Aparece el botón **Modo
profesor**, con cuatro pestañas: rangos de diseño, eficiencias de remoción,
precios y parámetros generales. Los cambios se aplican de inmediato y quedan
guardados **solo en ese navegador**.

No es un control de acceso: cualquiera que conozca el parámetro puede abrirlo.
Pero un alumno que cambie valores solo afecta su propio navegador, y la barra
inferior muestra el aviso "Configuración del profesor" cuando los valores no
son los de fábrica.

### Cómo hacer llegar su configuración a los alumnos

1. En el modo profesor, ajuste los valores y pulse **Exportar**. Se descarga
   `config-profesor.json`.
2. Copie ese archivo a la carpeta `public/` del proyecto (créela si no existe),
   con ese mismo nombre.
3. Suba el cambio (`git add public/config-profesor.json`, `git commit`,
   `git push`). GitHub Pages vuelve a publicar el sitio.

Al abrir, el sitio busca `config-profesor.json` y lo aplica sobre los valores
de fábrica. Orden de prioridad: cambios locales del navegador, luego
`config-profesor.json`, luego los JSON de `src/data/`. **Restaurar** borra los
cambios locales; **Importar** carga un archivo exportado antes.

La alternativa permanente es editar directamente los archivos de `src/data/`.
Las normas (`normas.json`), el catálogo y las reglas del tren solo se cambian
ahí.

## Estructura

```
src/
  data/    Datos técnicos en JSON (catálogo, rangos, eficiencias, normas, precios, ejemplo).
           Nada técnico va en el código.
  calc/    Funciones puras de cálculo, con pruebas (*.test.ts). No dependen de React.
  store/   Estado (Zustand): diseño con historial, configuración, resultados derivados.
  scene/   Escena 3D: cámara isométrica, terreno, unidades, tuberías, etiquetas.
  ui/      Paneles (proyecto, catálogo, propiedades, alertas, norma, costos) y
           ventanas (resumen, modo profesor).
  io/      Archivos, autoguardado y PDF.
  types/   Tipos compartidos.
```

Convenciones de geometría: 1 unidad = 1 m; `x` hacia el este, `y` hacia el sur;
la posición de una unidad es el centro de su huella. Los módulos rectangulares
en paralelo se dibujan adosados (muro común) y los circulares en fila, con la
separación definida en `src/data/rangos.json`.

## Cómo editar los datos

- `src/data/catalogo.json`: unidades, geometrías permitidas, dimensiones por
  defecto, puertos y parámetros de cada una.
- `src/data/rangos.json`: separaciones y (desde la fase 3) criterios de diseño.
- `src/data/tuberias.json`: fluidos, compatibilidad entre puertos, diámetros,
  materiales y límites de velocidad.
- `src/data/ejemplo-50lps.json`: diseño precargado (lodos activados, 50 L/s).

## Despliegue en GitHub Pages

El repositorio incluye `.github/workflows/deploy.yml`, que prueba, compila y
publica el sitio en cada `push` a `main`.

1. Crear un repositorio en GitHub y subir el proyecto:
   ```bash
   git init
   git add .
   git commit -m "Sandbox PTAR"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPOSITORIO.git
   git push -u origin main
   ```
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Esperar a que termine el flujo "Desplegar en GitHub Pages" (pestaña Actions).
   El sitio queda en `https://USUARIO.github.io/REPOSITORIO/`.

`vite.config.ts` usa rutas relativas (`base: './'`), así que no hay que
configurar el nombre del repositorio.
