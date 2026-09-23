# Hallazgos técnicos — Lumbre

## Corrección de plataforma móvil — iPhone

El usuario usa iPhone, no Android. Se añadió `apple-touch-icon`, metadatos de web app de Apple e instrucciones específicas dentro de la pantalla offline. WebKit documenta que las páginas añadidas a la pantalla de inicio se abren como web apps en iOS 26 y que el manifiesto/iconos se aprovechan cuando existen: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ . La app sigue necesitando un origen HTTPS accesible desde el iPhone; `127.0.0.1` de Windows no es esa dirección.

**Limitación de producto abierta:** el audio se entrega en WAV por fragmentos. Cada transición depende del evento `ended` y de JavaScript para cargar el siguiente. Las pruebas Edge/Chrome offline no validan que WebKit mantenga vivo ese ciclo ni la generación ONNX WASM al bloquear el iPhone. No se debe prometer un audiolibro continuo bajo bloqueo hasta una prueba física; si falla, habrá que probar audio continuo preparado o considerar un contenedor nativo gratuito que permita configurar la sesión de audio. El navegador también puede desalojar cache/IndexedDB bajo presión de almacenamiento según WebKit: https://webkit.org/blog/14403/updates-to-storage-policy/ .


## PWA y escucha offline — 21 de septiembre de 2026

- Build de producción crea iconos 192/512, manifiesto instalable y Service Worker con 12 recursos de interfaz versionados; no se registra en `vite dev` para evitar caches de desarrollo. El botón Biblioteca → Escuchar offline prepara app, libro ya local, Dora Q8, eSpeak y ONNX WASM (aprox. 130 MB) y sólo entonces muestra listo. Cache modelo ligado a revisión, runtime ligado a versiones.
- E2E real en Edge y Chrome: importar PDF, preparar, comprobar cache, vaciar WAV, seleccionar párrafo 2, cerrar la página, cortar la red del contexto, reabrir desde el Service Worker, restaurar el párrafo y generar/reproducir Dora desde modelos y runtime cacheados. La suite de regresión verificó Edge (21,7 s) y Chrome (20,7 s) con el cache versionado. Emulación de 390 px sin desbordamiento.
- Hallazgo corregido: el primer Service Worker generado había sustituido placeholders de un comentario ESLint, dejando `__PRECACHE__` sin resolver; la instalación falló. El generador ahora sustituye las declaraciones concretas. Otro prototipo halló que una importación dinámica de ONNX desde worker fallaba offline; el worker obtiene `.mjs`, WASM y eSpeak desde Cache Storage mediante URL Blob. Ambas causas se detectaron con pruebas sin red, no sólo por inspección del DOM.
- Límites: WebGPU FP32 no se precachea; offline usa Dora WASM Q8 cuando `navigator.onLine` es falso. El navegador puede desalojar cache/IndexedDB; se solicita almacenamiento persistente, pero no se garantiza. El respaldo JSON excluye app/modelo/audio. No se ha probado instalación Android real, pantalla bloqueada ni escucha de dos horas; los tests Chromium no prueban esas condiciones. Android requiere HTTPS o `localhost` del propio teléfono para PWA, pendiente habilitar un origen seguro de acceso sencillo sin servicio pago.
- Regresión global detectó dos carreras en tests antiguos: clic Play antes de terminar la importación en la prueba de citas y cierre inmediatamente después de tocar un párrafo en la prueba de restauración. La prueba de citas espera el libro e incluye un párrafo de duración suficiente para medir reproducción real. El reproductor ahora actualiza el cursor sin esperar la escritura anterior y usa marcas de tiempo monotónicas, también al recibir posiciones importadas con reloj adelantado. 44 tests unitarios pasan, incluida selección inmediata.

## Actualización: biblioteca, continuación y capítulos

Pantalla inicial Biblioteca con último libro, Continuar en un toque, búsqueda por título/autor, orden por recientes/título/autor/progreso, página y capítulo. Progreso aproximado por caracteres anteriores al fragmento; no se presenta como tiempo exacto ni como prueba de comprensión. 100% requiere evento de final de reproducción. Cubiertas tipográficas, no portadas PDF extraídas.

Capítulos: prioridad a `getOutline`, destinos nombrados `getDestination` y referencias `getPageIndex` verificados contra los tipos locales de PDF.js 6.3.289. Destinos inválidos no impiden importar. Se conservan niveles; títulos coincidentes dentro de una misma página permiten seleccionar bloques distintos. Si no hay marcador coincidente, el destino se aproxima al primer bloque de su página (sin precisión vertical del destino).

Sin marcadores válidos se detectan títulos de capítulo/parte/sección, prólogo/introducción/conclusiones y encabezados cortos en mayúsculas cerca del inicio de página. Se identifica la fuente de detección en pantalla. Cuando no hay evidencia, se ofrece Texto completo en lugar de inventar capítulos. Columnas, encabezados complejos, capítulos solo con números romanos y estructuras ambiguas siguen limitados.

Verificación con el PDF privado de Weber: 59 páginas, 200 bloques; Inicio, **LA POLÍTICA COMO VOCACIÓN** en página 2 y **LA CIENCIA COMO VOCACIÓN** en página 39. Detectados por encabezados, no por un índice inventado. Evidencia en `artifacts/chapter-inspection.json`; reproducible con `node scripts/inspect-chapters.mjs <ruta>`. No se copia el PDF al repositorio.

Ruido: se marcan bloques cortos repetidos en extremos de páginas y números de página coincidentes. Índice y bibliografía con encabezado identificado se omiten del audio hasta la siguiente sección. Opción persistida por libro para incluir esas secciones. Heurísticas conservadoras, no reconocimiento semántico perfecto; todo el texto y el PDF se conservan. No se implementó todavía tratamiento de notas al pie.

Migración: estructura versionada por separado; libros con extracción actual reciben capítulos sin reextraer ni cambiar índices de bloque. Posiciones propias por libro, segmento y segundos conservados. Si un bloque pasa a ser omitido, el reproductor se sitúa en el próximo legible. Reabrir el libro activo o usar Continuar no cancela una reserva ya preparada. Dora y la estrategia de reserva no se cambiaron.

Pruebas añadidas: marcadores reales en PDF generado localmente con cuatro secciones, dos libros con posiciones independientes, continuar con audio Dora real, búsqueda/orden, persistencia de la opción de bibliografía, migración del PDF de Weber, fallback de detección y exclusión de texto en el plan de audio. Pendientes: Android físico, pantalla bloqueada, PWA/offline integral, citas y prueba larga. Sin nuevas dependencias ni servicios.

Validación: build/lint correctos, 35 tests unitarios, 12 E2E aprobados en Edge y Chrome (4,9 minutos). E2E de continuación con síntesis Dora real y conexiones externas bloqueadas. Se corrigió la actualización diferida de la casilla de secciones opcionales. Capturas verificadas: `artifacts/edge-library.png`, `artifacts/edge-chapters-mobile.png`; pruebas de ancho móvil sin overflow en ambos navegadores. Esto valida layout móvil emulado, no hardware Android ni pantalla bloqueada.

## Actualización: Dora única y reserva automática

Por pedido del usuario, se retiró el selector de otras voces y se fuerza Dora al abrir/restaurar libros. Importar, abrir o recuperar un PDF dispara preparación silenciosa automática. Se acumulan hasta 300 segundos de escucha a la velocidad seleccionada; no se convierte el libro entero ni se acumula audio ilimitado en memoria. Los fragmentos se guardan en IndexedDB y se reutilizan después de cerrar. Un salto cancela la generación anterior y prepara desde el destino.

Play espera 30 segundos de reserva contigua antes de empezar (o el final del libro si queda menos). Después de agotar el buffer se aplica la misma espera; no se reproduce un fragmento aislado para volver a cortar enseguida. El contador muestra segundos reales de audio disponible divididos por velocidad. La preparación sigue durante pausa hasta alcanzar el objetivo. Cancelar la detiene. Con la aplicación cerrada no se genera audio; tampoco se garantiza la ejecución con el teléfono bloqueado.

Esto cambia la estrategia de espera, **no acelera la inferencia de Dora**. Como RTF sigue por encima de 1 en este PC, eventualmente puede agotarse incluso esta reserva. Para escuchar con menos cortes conviene dejar preparar minutos antes de pulsar Play. Los benchmarks de 10/32 s que siguen pertenecen a la versión anterior, que iniciaba con un solo fragmento; ya no describen el inicio con reserva.

Tests unitarios específicos: generación automática sin autoplay, umbral de reserva antes de Play y límite de cinco minutos configurable internamente para pruebas. E2E actualizado para sintetizar con Dora real, importar sin pulsar Preparar, restaurar fragmento y verificar que las otras voces no aparecen.

Validación de esta actualización: build y lint correctos, 29 tests unitarios y 8 E2E aprobados en Edge/Chrome (4 minutos de suite). Los E2E de reproducción ahora usan Dora real, sin sustituirla por Piper. No se hizo otra medición de rendimiento ni se afirma que la inferencia sea más rápida.

## Actualización: reproducción progresiva y párrafos (21/09/2026)

Implementado: extracción geométrica por interlineado/sangría, reextracción versionada de libros existentes, reproducción automática de fragmentos y párrafos, primera oración independiente, tres fragmentos anticipados, preparación explícita de hasta 21, priorización al saltar, pausa durante síntesis, cache por texto/voz/motor, posición por fragmento y segundo, controles Media Session. No se agregaron dependencias, servicios ni APIs pagas.

La migración de una posición del reproductor antiguo busca texto y página y reinicia los segundos del párrafo localizado; no promete equivalencia temporal con el audio antiguo. Las posiciones nuevas se guardan cada segundo, en pausa, salto y cambio de velocidad. Las transiciones usan HTMLAudio entre WAV: pueden tener una pequeña separación audible; no hay alineación temporal por palabra.

### Dora: medición real de esta versión

Edge 153 headless en este PC, síntesis secuencial sin otros tests de síntesis en paralelo. Modelos servidos localmente. La calibración usa el mismo texto en ambos motores, cada uno con worker nuevo. RTF WASM: **1,790** (carga 4,80 s, generación 14,05 s, audio 7,85 s). WebGPU: **1,738** (carga 17,51 s, generación 13,69 s, audio 7,88 s). Una muestra no establece superioridad estadística. Automático conserva WASM cuando GPU no mejora al menos 10%; sin calibración usa WASM. Los motores se pueden elegir manualmente; si GPU falla en Automático, se reintenta WASM.

Prueba progresiva separada, primer párrafo de muestra a 1×: primer audio disponible **9,9 s WASM / 32,1 s WebGPU**; primera reproducción observada mediante sondeo de un segundo **10,16 s / 32,42 s**. Hubo una espera entre fragmentos de aproximadamente **11 s / 7 s**. La aplicación retomó sola y avanzó al párrafo siguiente. No comparar estos tiempos con los 333/600 segundos reportados por el usuario: eran otros textos/condiciones.

**Limitación vigente:** los dos motores todavía generan más lento que tiempo real en esta máquina. El buffer no elimina indefinidamente las pausas. Preparar audio por adelantado permite escucharlo desde cache, pero el botón actual prepara hasta 21 fragmentos, no dos horas de libro. La prueba no valida sesiones largas, móviles ni pantalla bloqueada. La voz Dora fue aprobada por el usuario antes de estos cambios; hace falta su evaluación de las nuevas transiciones.

Se volvió a observar fallo de Cache Storage al guardar pesos FP32; la sesión siguió con el modelo servido localmente. No se garantiza offline completo de la aplicación ni persistencia del cache del modelo.

Evidencia: `artifacts/dora-calibration.json`, `artifacts/progressive-measurements.json`, `artifacts/progressive-benchmark.json`; ejecución reproducible `node scripts/benchmark-progressive.mjs`. El benchmark previo a introducir el margen de 10% seleccionó GPU por RTF mínimo; la regla final selecciona WASM con esas mismas mediciones (cubierta por tests). Los registros de síntesis son anteriores a ese ajuste de selección, no se modificaron sus números.

Pruebas añadidas: segmentación sin pérdida, geometría de párrafos y caracteres contiguos, migración de posición, cola limitada, resultados obsoletos al saltar, pausa durante generación, selección de motor por muestra comparable. E2E neuronal en Edge/Chrome: reproducción directa y continua, pausa durante preparación, cambio de párrafo, cierre/reapertura de fragmento, y PDF privado de Weber con migración de extracción.

Build y lint correctos. 28 tests unitarios aprobados (incluido fallback GPU→WASM). Suite de 8 E2E aprobada en Edge/Chrome; comprobación visual del layout móvil sin overflow. Las pruebas de cola con proveedor controlado son unitarias y no se usan para afirmar calidad de voz; los E2E usan síntesis Piper real y el benchmark usa Dora real.

Fecha de implementación: 21 de septiembre de 2026. Alcance: fase 0. Este documento distingue una función implementada de una capacidad probada.

**Actualización tras evaluación humana:** el usuario prefiere claramente Dora en WASM Q8 y también aprobó su voz en el otro motor probado. Alex resultó aceptable (333 s reportados), Santa no gustó (600 s reportados), y David/Piper fue rápido pero no gustó. Esos tiempos no son comparables con el benchmark sin conocer texto, carga y condiciones. Dora vuelve a ser la voz inicial; se respeta la selección previamente guardada. Piper queda como alternativa rápida, no como criterio de calidad. Las pruebas prolongadas/móviles siguen pendientes.

**Tildes — reproducido y corregido en el PDF aportado:** `Weber-Politica-Vocacion.pdf`, SHA-256 `115f3d03c041553f8dd01931a99b3a68329936ef29472d4a7a166673bbebdc5c`. PDF.js devuelve `polÌtica`, `exposiciÛn`, `VOCACI”N`, `øQuÈ` y `ìEstadoî` antes de normalizar o sintetizar. La inversión de MacRoman a bytes y su interpretación Windows-1252 recupera `política`, `exposición`, `VOCACIÓN`, `¿Qué` y `“Estado”`. El archivo declara PageMaker 6.5 / Distiller 3.0 para Windows; la atribución exacta del defecto a una herramienta de origen no fue verificada.

La reparación se limita al hash comprobado: no se hacen sustituciones globales en otros PDFs. Conserva el PDF original y los bloques anteriores (`originalBlocks`), es idempotente y se aplica tanto al importar como al iniciar con el libro ya guardado. Mantiene los identificadores, páginas y posición; el tiempo de audio conservado es aproximado porque cambia la pronunciación. La clave de cache incluye texto, de modo que los párrafos corregidos no reutilizan su audio defectuoso. No se modifican los metadatos, que ya venían correctamente codificados. Otras ediciones del PDF necesitarán diagnóstico propio.

Pruebas: normalización NFC/NFD, acento fonético, inversión de caracteres, aislamiento de otros libros, conservación del original, nueva clave de audio y migración de IndexedDB con posición y voz intactas. `tests/e2e/weber.spec.ts` usa el PDF privado indicado mediante `WEBER_PDF`; no se incluye el libro en el repositorio. `scripts/inspect-weber.mjs <ruta>` reproduce la extracción cruda localmente. Esto no constituye una nueva evaluación auditiva de Dora.

## Corrección de la espera — Piper

Validación posterior a la corrección de codificación: build y lint correctos, 20 tests unitarios y 6 E2E aprobados en Edge/Chrome, incluyendo importación del PDF real y migración simulada de su extracción anterior. Captura inspeccionada: `artifacts/weber-edge-reparado.png`.

Se midieron los mismos cinco párrafos con `es_ES-davefx-medium`, revisión v1.0.0 de rhasspy/piper-voices. Modelo de 60,3 MiB, WASM con cuatro hilos en Edge. Primera carga: 4,8 s; generación del primer párrafo: 4,0 s para 12,9 s de audio. Los siguientes: 1,9–2,4 s por párrafo para 14,9–16,6 s de audio (RTF 0,12–0,14). Aproximadamente 17 s para preparar las cinco muestras, frente a más de dos minutos de generación con Kokoro WASM. Estos tiempos corresponden a las muestras; párrafos más largos llevan más tiempo.

La carga se conserva entre párrafos. Cambiar de familia de modelo termina el worker anterior para liberar memoria. La voz audible sigue siendo neuronal local, no speechSynthesis. El cache identifica cada modelo por separado. Se añadió tiempo transcurrido visible y etapas de carga/inferencia. Para posiciones antiguas se conserva la voz guardada: seleccionar **David · Piper (rápida)** permite cambiar sin perder el libro.

Evidencia: artifacts/piper-measurements.json, artifacts/piper-davefx.wav y artifacts/piper-model-download.json. El audio requiere escucha humana para evaluar si la entonación resulta suficientemente natural; rendimiento rápido no implica aprobación auditiva. Las cifras y decisiones de Kokoro que siguen se conservan como historial de la comparación.

Validación de esta corrección: build y lint correctos, 15 tests unitarios y 4 E2E con síntesis Piper real en Chrome/Edge aprobados. Se verifican importación, reproducción, pausa, cache, restauración de segundos y selección de párrafo, sin solicitudes externas durante los E2E.

## Inspección y arquitectura

La carpeta inicial estaba vacía: no había aplicación previa, dependencias ni AGENTS.md aplicable. Se eligió React/TypeScript/Vite, PDF.js, Dexie y proveedores reemplazables. No se agregó backend ni servicio pago. Diseño y secuencia: ARCHITECTURE.md e IMPLEMENTATION_PLAN.md.

## Investigación de voz

| Opción | Evidencia / decisión |
| --- | --- |
| Kokoro 82M ONNX | Modelo candidato del laboratorio; voces ef_dora, em_alex y em_santa. Pesos Apache-2.0. Se prueba Q8/WASM y FP32/WebGPU. |
| kokoro-js 1.2.1 | No se usa directamente: su frontend inspeccionado escoge pronunciación inglesa. Tener pesos españoles no agrega fonemización española al wrapper. |
| phonemizer 1.2.1 | Instalado, probado y descartado: `phonemize(text, 'es')` devuelve Invalid language identifier. Su distribución solo incluye voces inglesas. Se eliminó la dependencia. |
| eSpeak de Echogarden | @echogarden/espeak-ng-emscripten 0.3.5, multilingüe, GPL-3.0. Fonemización española probada. Se usa únicamente como frontend; el audio audible es neuronal, de Kokoro. Esta distribución ejecuta código compilado JS/Emscripten y datos locales. |
| Piper | Alternativa local razonable si Kokoro no alcanza calidad/rendimiento; proyecto actual OHF-Voice/piper1-gpl. Existen wrappers web, pero no se declara compatibilidad móvil ni superioridad auditiva sin probarlos. No instalado ni medido. |
| Supertonic 3 | Se investigó su soporte español y ejemplo web ONNX. El repositorio oficial redirige al archivo y anuncia fin de desarrollo/soporte, archivado el 9 de septiembre de 2026. No se elige como dependencia principal mantenida; podría evaluarse como proveedor opcional sin servicios alojados. No medido. |
| speechSynthesis | No utilizado. No se presenta como fallback de calidad neuronal. |

Fuentes primarias consultadas:

- [Kokoro: voces, español y límites de longitud](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
- [Frontend de kokoro-js](https://github.com/hexgrad/kokoro/blob/main/kokoro.js/src/phonemize.js).
- [Pesos ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
- [Phonemizer.js](https://github.com/xenova/phonemizer.js).
- [eSpeak Emscripten](https://github.com/echogarden-project/espeak-ng-emscripten).
- [Frontend multilingüe de referencia Misaki](https://github.com/hexgrad/misaki/blob/main/misaki/espeak.py).
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html).
- [Piper mantenido por OHF](https://github.com/OHF-Voice/piper1-gpl).
- [Tesseract.js, candidato a OCR local en fase 2](https://github.com/naptha/tesseract.js).
- [Estado oficial de Supertonic](https://github.com/supertone-oss-archive/supertonic).

## Dependencias instaladas y verificadas

Versiones fijadas sin rangos en package.json y resolución en package-lock.json: React/React DOM 19.3.0, Vite 8.3.0, TypeScript 6.0.3, PDF.js 6.3.289, Dexie 4.4.6, ONNX Runtime Web 1.30.0, eSpeak Emscripten 0.3.5, Vitest 5.0.1 y Playwright 1.63.0. Entorno Node 24.15.0 / npm 11.12.1.

Los pesos se fijan a revisión 1939ad2. Tamaños observados: Q8 92.361.116 bytes; FP32 325.532.232 bytes. Tres voces, aproximadamente 0,5 MiB cada una. `artifacts/model-download.json` registra hashes de los archivos descargados.

## PDF e IndexedDB

Probado con PDF digital real generado por el test: título/autor, bloques, etiqueta romana `i` frente a página física `1`, importación y restauración. Hash SHA-256 evita duplicados. Se preserva el Blob original.

Heurísticas implementadas y con tests: palabras cortadas por salto de línea, párrafos separados por espacio vertical, eliminación de números marginales y encabezados repetidos en al menos tres páginas; unión entre páginas solo con evidencia explícita de palabra cortada. No se afirma reconstrucción universal de párrafos, columnas ni notas al pie. La regla conservadora puede conservar ruido o dividir párrafos; el original permanece intacto.

Páginas con menos de 40 caracteres extraíbles se marcan como posibles escaneos/páginas vacías. **OCR aún no implementado**. No se genera texto ficticio para esas páginas.

Posición en IndexedDB: libro/hash, índice del bloque, segundos de audio, voz, motor y velocidad. Escritura cada segundo durante audio, en pausa y al cambiar bloque. Se rechazan escrituras anteriores por timestamp. Errores de almacenamiento se muestran en pantalla. Falta ensayo de caída del proceso durante reproducción prolongada.

## Síntesis y sincronización

Síntesis en Web Worker, fonemización española explícita, puntuación conservada, segmentos limitados y sin truncamiento silencioso. HTMLAudioElement reproduce WAV local con velocidad y preservesPitch. Se resalta el párrafo asociado al audio: **no existe alineación exacta por oración/palabra**.

Modo automático: heurística por disponibilidad real de adaptador WebGPU y memoria expuesta; ante error de GPU intenta WASM. No es una selección aprendida ni una garantía de que GPU sea más rápida. Los botones de motor explícito permiten comparar sin ocultar fallos.

WASM usa su propio bundle; WebGPU usa otro. La primera implementación compartía el bundle WebGPU y fue sustituida por separación de runtimes tras medir lentitud. Se sirve COOP/COEP en Vite para permitir hasta cuatro hilos WASM; sin aislamiento se usa uno. Hosting futuro debe conservar esos encabezados para obtener el mismo perfil de rendimiento.

Cache de audio SHA-256 por texto/voz/motor/revisión/frontend/síntesis, LRU de 500 MiB. No se contabilizan reproducciones desde cache como nueva síntesis. Los pesos están en Cache Storage, separados del cache de audio. No hay precarga de libros completos ni encadenamiento de reproducción: se trata del laboratorio aislado.

## Pruebas y evidencia

- 13 tests unitarios pasaron: limpieza, separación, fonemización española real, límite de tokens, WAV, hashes, cache y persistencia.
- Primer E2E real en Edge pasó: importar → sintetizar → reproducir → pausar → seleccionar párrafo → cerrar pestaña → abrir → restaurar párrafo/velocidad. Segundo E2E: PDF inválido rechazado.
- Capturas desktop y viewport 390 × 844 inspeccionadas. Emular ancho móvil **no** equivale a probar Android.
- Benchmark final: 20 síntesis reales, cinco párrafos por combinación. Resultados detallados debajo.
- Revisión final: build y lint correctos; 13 tests unitarios y **4 E2E aprobados** en Edge 153.0.4234.48 y Chrome 143.0.7499.170, ambos headless Windows.
- El E2E final bloquea solicitudes a orígenes externos, verifica segundos de audio al reabrir, que no se genera una segunda muestra al recuperar cache y que se restaura velocidad/párrafo. No demuestra arranque PWA sin servidor: los archivos de aplicación/modelo se sirven desde localhost.

## Benchmark final

Equipo: Intel Core i5-12450H, 12 procesadores lógicos, 7,68 GiB RAM total; GPU Intel gen-12lp. Edge 153 headless sobre Windows. COOP/COEP activo, cuatro hilos WASM. No se ejecutaron otros tests de síntesis en paralelo durante esta medición final. Es una medición del equipo en su estado actual, no un ensayo de laboratorio de hardware aislado.

| Voz y motor | Párrafos | Generación total | Duración de audio | RTF ponderado |
| --- | ---: | ---: | ---: | ---: |
| Dora · WASM Q8 | 5 | 127,03 s | 74,70 s | 1,70 |
| Alex · WASM Q8 | 5 | 127,87 s | 75,50 s | 1,69 |
| Santa · WASM Q8 | 5 | 122,92 s | 75,90 s | 1,62 |
| Dora · WebGPU FP32 (con fallback de operadores a CPU) | 5 | 108,06 s | 74,78 s | 1,45 |

RTF ponderado = suma de segundos de generación / suma de segundos de audio. Excluye carga de modelo/voz; incluye fonemización e inferencia. La primera carga WASM sumó 5,04 s; el cambio a WebGPU sumó 20,24 s. Las otras voces reutilizaron modelo. El benchmark ejecuta las combinaciones secuencialmente en el mismo worker, por lo que el orden y los heaps retenidos pueden influir en memoria y tiempos.

**Interpretación:** WebGPU fue más rápido en esta comparación, pero ninguno logró RTF < 1. Un buffer finito no resuelve indefinidamente una generación más lenta que la reproducción. No se promete escuchar dos horas de forma fluida con esta configuración. Alternativas gratuitas a probar: Piper español y/o una configuración Kokoro más eficiente; como contingencia, preparar audio local antes de viajar.

Las cuatro muestras WAV exportadas son del primer párrafo, a 24 kHz, entre 13,3 y 13,5 segundos. Señal no nula y sin clipping en PCM16. Esto verifica salida de audio, **no** su fidelidad lingüística o naturalidad. Los cinco párrafos completos de cada combinación sí fueron sintetizados para medir.

Memoria: el worker no expuso `performance.memory`; se registra `jsMemoryAvailable: false`, sin inventar una cifra. No se midió pico total de RAM ni memoria GPU. En la sesión headless la escritura del modelo FP32 a Cache Storage falló y la síntesis continuó; la primera versión mostraba un mensaje genérico de espacio, por lo que no se atribuye una causa exacta. El código final muestra el error concreto. El modelo también está alojado localmente en public/models.

Evidencia reproducible:

- `artifacts/benchmark-measurements.json`: 20 mediciones individuales.
- `artifacts/benchmark-environment.json`: navegador, hardware expuesto y combinaciones completadas.
- `artifacts/benchmark-summary.json`: agregados y comprobación de señal WAV.
- `artifacts/ef_dora-wasm.wav`, `em_alex-wasm.wav`, `em_santa-wasm.wav`, `ef_dora-webgpu.wav`.
- `artifacts/benchmark-results.png`: tabla real del laboratorio.

## Problemas encontrados y corregidos

1. PDF.js actual ya no acepta `isEvalSupported` en DocumentInitParameters: se retiró la opción obsoleta.
2. Frontend de fonemización inglés: sustituido por paquete multilingüe verificado.
3. ONNX Runtime 1.30 solicita recursos asyncify adicionales: incluidos localmente, además de los recursos WASM tradicionales.
4. Demasiados mensajes de progreso por fragmento de descarga: limitados a aproximadamente tres por segundo para no saturar React.
5. Primer camino WASM compartía runtime WebGPU: separado para comparar ejecución CPU real.
6. El build estándar de PDF.js usa `Map.getOrInsertComputed`, ausente en el Chrome instalado. Se cambió al build `legacy` oficial y su worker de compatibilidad, sin escribir un polyfill propio.

## Lo que todavía no está validado

Naturalidad y fatiga de escucha (necesitan evaluación humana), voces en Android físico, rendimiento sin WebGPU en móvil, pantalla bloqueada, sesión de dos horas, PDF real de 250 páginas, columnas/notas al pie, recuperación tras terminación forzada, escaneos/OCR, PWA instalada y arranque sin conexión. No se avanzó con IA o traducción.

No es honesto considerar terminado el MVP hasta superar estas pruebas. La alternativa gratuita a una generación insuficientemente rápida será probar Piper y/o preparar más audio local por adelantado. Media Session no resuelve por sí sola la suspensión de workers por el sistema operativo.
## Citas y notas — 21 de septiembre de 2026

- Botón Guardar cita disponible en el reproductor con PDF abierto. Captura inmediatamente bloque/fragmento/segundos sin pausar ni regenerar audio.
- Se conservan título, autor si existe, etiqueta de página y página de archivo, capítulo, fecha, texto capturado y contexto original. La edición afecta sólo la copia de la cita. Comentario y color editables; búsqueda con tolerancia a tildes; copiar con/sin referencia.
- IndexedDB esquema 2 añade annotations sin sustituir libros, posiciones ni audio. Pruebas unitarias de migración desde esquema 1, captura por segmento y persistencia tras reapertura: 37 tests unitarios pasan. Build y lint pasan.
- Límites: fragmento TTS, no alineación por palabra. Segundos relativos al fragmento WAV, no tiempo total de audiolibro. Color en la tarjeta de cita; subrayado libre en el lector y exportación/importación pendientes. Guardar cambios es explícito en el editor. No permite citas del laboratorio demo.
- Sin dependencias nuevas ni conexiones externas. Prueba E2E usa Dora real y bloquea dominios externos; el portapapeles de Windows devuelve CRLF y se normaliza a LF sólo en la comparación del test.
- E2E de citas completado en Chrome y Edge: importar, reproducir Dora real, guardar sin pausar, editar/comentar/color, recargar, copiar con referencia, recuperar contexto, buscar y verificar pantalla de 390 px. Captura móvil inspeccionada. Edge requirió repetir con `--trace=off` porque Windows bloqueó el archivo de trace al cerrar (EBUSY); repetición exitosa, 23,8 s. Chrome pasó en 27,1 s. Esto no equivale a prueba en teléfono físico. No se repitió la suite histórica completa en esta etapa.
## Respaldo y transferencia — 21 de septiembre de 2026

- Exportación local JSON v1 con PDFs opcionales (base64). Texto, capítulos, metadatos, posición, citas y preferencias incluidos; audio, modelos y calibración excluidos. Los PDFs incluidos se validan por cabecera y SHA-256 antes de toda escritura.
- Importación combina por hash/ID, sólo aplica posiciones/citas/preferencias más recientes y conserva local en empate. No elimina libros. Escritura atómica: fallo en cualquier tabla revierte el conjunto. Si difiere la extracción, posición aproximada por página/contenido y segundos reiniciados. Texto del libro local conservado.
- Un respaldo sin PDF permite lectura/TTS desde el texto. Adjuntar manualmente el mismo PDF conserva libro y posición. Al importar se pausa/suspende el reproductor para evitar que su estado previo pise la posición importada; no se inicia audio automáticamente.
- 43 tests unitarios pasan, incluyendo restauración/reapertura con PDF y sin él, repetición sin duplicados, conflictos, hash incorrecto, datos inválidos, rollback simulado y remapeo. Build/lint pasan. E2E en Edge y Chrome con perfiles separados verifica exportación (ambas opciones), importación, citas, posición, velocidad, adjuntar PDF sin duplicar, persistencia tras recarga y rechazo de JSON inválido. Captura de ancho 390 px revisada; no equivale a teléfono físico.
- Límites explícitos: 100 MiB, memoria adicional por JSON/base64; exportación sin PDFs recomendada para libros grandes. Sin cifrado, streaming ni fusión de ediciones simultáneas de una misma cita. Fechas dependen del reloj del dispositivo. Sin prueba de biblioteca de 100 MB ni de falta de espacio real (rollback probado con fallo simulado). No se repitió la suite E2E histórica completa. PWA/offline y reproducción bloqueada siguen pendientes.

## Revision integral - 2026-09-22

- Fixed restored reader showing demo text while the player held a saved book. Book list now observes IndexedDB updates, including incoming sync.
- Supabase sync now pulls positions, annotations and preferences, refreshes expiring sessions, serializes overlapping sync jobs, paginates downloads and conditionally updates older server records. PDF uploads are remembered per device/account instead of repeated every 30 seconds. Downloaded PDFs are hash-checked.
- Deleted quotes are tombstones so deletion propagates. The existing SQL schema supports these changes without migration. Schema remains single-user; primary keys are not partitioned by account.
- Idle player accepts newer remote positions. Unchanged player state no longer produces a newer timestamp on every visibility event. Explicit persistence awaits pending writes before app refresh. Immediate forced termination before an IndexedDB transaction commits can still lose the latest action.
- Full preparation keeps only nearby WAV blobs in the player, retaining lightweight duration metadata for the rest. Full-book mode does not evict its earlier audio at 500 MiB. Available browser storage is the limit; disk-full errors are surfaced. Audio/model cache is local, not synchronized through Supabase.
- Corrected damaged UI characters and chapter regexes; structure version 2 upgrades stored books. Added UTF-8 editor configuration and a source encoding regression test.
- Added Update app and Sync now controls; fixed service-worker cache fallback and blocked conflicting imports during startup/import. Chapter list is collapsed initially to reduce mobile clutter.
- Verification: build and lint pass; 50 unit tests pass. New reader/selection/restore/quote/delete/update E2E passed in Chrome and Edge at 390 px; real Dora synthesis/playback/quote-edit/clipboard E2E passed in Chrome. Screenshot inspected. Historical laboratory/backup tests refer to removed UI and were not treated as current acceptance tests.
- Limits: no physical iPhone test in this revision; no two-hour playback, full-library quota stress test, or authenticated PC-to-iPhone Supabase integration test. Sync transport/conflict behavior tested with mocked REST responses. Timestamp conflicts still depend on device clocks. Browser background generation cannot be guaranteed on iOS. OCR, translation and local study AI remain pending.

## Continuous preparation regression - 2026-09-23

- Play now always enables full-book preparation, including after configure/reopen. Desktop startup resumes preparation of the stored book without reprocessing the PDF; mobile still defers startup synthesis until interaction.
- Seeking prioritizes the new location, then fills uncached earlier segments. Pause leaves preparation running. The reader exposes prepared/total segment counts.
- Cached nearby WAV loading runs independently of synthesis. A slow distant synthesis no longer blocks playback of already cached upcoming segments.
- 52 unit tests pass, including cold Play/full generation, pause, reopen cache reuse, seeking and cached playback while a distant synthesis is unresolved. Build and lint pass.
- Full preparation remains local and requires the app to stay running; it cannot make synthesis faster than real time or keep generating after the browser is closed. Cached audio is device-specific, so PC preparation does not transfer WAV files to iPhone.
