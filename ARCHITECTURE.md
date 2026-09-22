# Lumbre — lector personal local

## PWA y audio offline

El build crea iconos PNG, manifiesto y `dist/sw.js` con la lista versionada de archivos JS/CSS/interfaz. Instalación del Service Worker sólo en producción; navegación intenta red y vuelve a la interfaz cacheada sin conexión. Los recursos con hash se sirven desde el cache. No se precarga el modelo al instalar la PWA.

`src/pwa/offline.ts` prepara el libro presente en IndexedDB, el modelo Dora Q8, tokenizer, voz, datos eSpeak y binarios WASM. Verifica las cuatro categorías antes de afirmar que está listo; solicita almacenamiento persistente cuando el navegador lo permite. El cache de runtime incluye las versiones de ONNX Runtime y eSpeak en su nombre; el cache de modelo incluye revisión. Preparar no sintetiza el libro entero.

En modo sin conexión, el worker de Dora crea URLs Blob desde el Cache Storage para el módulo `.mjs` y WASM de ONNX Runtime, y el fonemizador usa su JS y datos cacheados. Esto evita que una importación dinámica de un Web Worker dependa de una petición de red que el Service Worker del documento no resuelva. `BookPlayer` usa WASM Q8 cuando `navigator.onLine === false`, incluso si la posición guardada eligió WebGPU. Audio y posiciones siguen en IndexedDB. El Service Worker no accede al contenido de los libros.

Límites: la comprobación depende del almacenamiento del origen, que el navegador puede desalojar. No se prepara el modelo FP32 de WebGPU. El estado `navigator.onLine` no siempre equivale a conectividad real. En iPhone, el acceso inicial requiere HTTPS o localhost del propio teléfono; una dirección LAN HTTP no habilita Service Workers. Safari iOS, memoria disponible, importación PDF, síntesis WASM y reproducción con pantalla bloqueada requieren prueba física. La cola actual cambia de WAV con JavaScript al terminar cada fragmento; iOS puede suspender ese trabajo en segundo plano, de modo que no se promete continuidad bajo bloqueo.

Biblioteca y estructura: `library/Library.tsx` presenta búsqueda, orden, tarjetas y continuación; `library/progress.ts` calcula progreso por caracteres anteriores al fragmento (100% solo con final explícito). `liveQuery` de Dexie actualiza posiciones sin introducir una dependencia. La portada actual es tipográfica.

`pdf/outline.ts` resuelve marcadores PDF.js, destinos nombrados, referencias de página y niveles. No sigue enlaces externos; destinos inválidos se ignoran individualmente. `reader/chapters.ts` prioriza marcadores y, en su ausencia, detecta títulos claros. Marca ruido y secciones complementarias sobre los mismos bloques, sin borrar ni cambiar sus identificadores. `structureVersion` es independiente de `extractionVersion`, de modo que añadir capítulos a libros con extracción actual no reinicia su posición. La preferencia `includeSupplement` se guarda por libro.

El proveedor TTS recibe bloques con texto vacío para ruido/secciones omitidas, conservando índices globales. La cola salta esos bloques. Si una posición anterior apunta a texto ahora omitido, se usa el próximo bloque legible. Las tarjetas indican ubicación y progreso aproximado; Media Session usa el título del capítulo. Pantalla inicial Biblioteca, audio restaurado pero sin autoplay; un gesto en Continuar llama al reproductor sin reiniciar una reserva ya cargada.

Actualización de reserva: la interfaz ofrece solamente Dora y normaliza a Dora las preferencias restauradas. Abrir/importar un PDF llama `prepareAhead()` sin autoplay. La cola usa duración acumulada, no número fijo de fragmentos: objetivo 300 segundos dividido por velocidad; umbral inicial/rebuffer de 30 segundos. Al pausar sigue preparando hasta el límite; cancelar detiene el worker activo. Se permite cambiar de libro durante preparación. Los proveedores anteriores quedan internos por compatibilidad; no hay selector de otras voces.

## Alcance y puerta de calidad

Primero se entrega un laboratorio funcional (fase 0). El MVP no se considera viable técnicamente hasta verificar síntesis española real, rendimiento sostenido y naturalidad. No se implementan IA, traducción ni sincronización remota antes de estabilizar lectura y audio.

## Decisiones iniciales

- React + TypeScript + Vite, una interfaz responsive.
- PDF.js con su worker: extracción por página, etiquetas originales y metadata. El PDF se conserva localmente.
- Dexie/IndexedDB: libros, bloques, posición, resultados de experimentos y audio. Transacciones para importar; SHA-256 para duplicados.
- Kokoro ONNX + ONNX Runtime Web en worker dedicado. Fonemizador eSpeak NG compilado a JavaScript mediante Emscripten, explícitamente español. No usar el frontend inglés de kokoro-js para español.
- Dora/Kokoro es la voz predeterminada tras evaluación humana. Piper (es_ES-davefx-medium, WASM) es alternativa rápida. Se reutilizan runtime y fonemizador sin dependencias adicionales; se libera el worker al cambiar de familia de modelo.
- WebGPU se prueba ejecutando el modelo; detectar navigator.gpu no demuestra compatibilidad. WASM es alternativa automática. En equipos limitados se prefiere WASM cuantizado. Métricas separan carga, inferencia y duración.
- HTMLAudioElement para reproducción, velocidad con preservesPitch y eventos para seguimiento por bloque. No se presentan estimaciones temporales como alineación exacta por oración.
- Recursos del motor alojables junto a la app; descarga de pesos gratuita y explícita. Nunca se transmite texto, PDF ni notas.
- Sin backend, cuentas, claves, telemetría ni servicios de inferencia.

## Contratos y módulos

`pdf` extrae datos geométricos; `extraction` normaliza conservando procedencia; `storage` persiste; `tts` produce PCM; `audio` controla reproducción; `reader` representa bloques; `library` organiza libros; `settings` configura. `ocr`, `annotations`, `search`, `ai`, `translation`, `sync` y `pwa` se amplían según fases.

Contratos reemplazables: TTSProvider, OCRProvider, TranslationProvider, LocalLLMProvider, SyncProvider. Ninguna implementación puede enviar contenido remotamente sin acción explícita. Un proveedor no disponible devuelve su capacidad real, no una respuesta simulada.

## MVP posterior a la prueba de voz

Implementación progresiva: `extraction/layout.ts` reconoce sangrías, interlineado y cambios de tamaño, y junta elementos contiguos sin insertar espacios dentro de palabras. `pdf/extract.ts` versiona la extracción y remapea posiciones antiguas por contenido/página al reabrir el libro. Columnas complejas siguen pendientes.

`audio/segments.ts` conserva offsets del original. Primera oración separada; resto agrupado hasta 230 caracteres, sin truncar. `audio/player.ts` maneja intención de reproducción separada del estado HTMLAudio, cola serial, tres segmentos anticipados, cancelación por epoch y cache LRU. Preparación explícita limitada a 21 segmentos. Un worker activo; las solicitudes obsoletas no cambian audio/posición. Las pausas no disparan reproducción al terminar una síntesis.

La posición nueva guarda segmento y segundos dentro de él. La actualización desde la versión de párrafos enteros recupera el párrafo aproximado, no inventa equivalencia temporal. Los WAV se reproducen con HTMLAudio; puede haber una separación entre archivos, no se promete audio perfectamente continuo.

`tts/calibrate.ts` compara Dora con texto fijo en WASM/WebGPU, secuencialmente y liberando workers. Automático usa mediciones locales; sin calibración usa WASM. Prefiere WASM si la mejora GPU no llega al 10% de RTF, para evitar elegir un modelo mayor por ruido de una única muestra. Si GPU falla durante reproducción automática, reintenta WASM. No hay sondeo neuronal obligatorio al abrir el lector.

Pipeline: archivo → hash → extracción por página → advertencias OCR → limpieza conservadora → bloques con páginas de origen → segmentos limitados por fonemas → síntesis progresiva → cache → audio.

Guardar posición cada segundo y en pausa/cambio de bloque. La posición contiene hash del libro, bloque, desplazamiento de audio, voz y velocidad. Reanudar siempre por gesto del usuario. Cancelación con identificador de generación y terminación del worker para evitar reproducir resultados obsoletos.

Cache LRU por hash de texto + revisión de modelo + voz + motor + configuración de síntesis. La velocidad de reproducción no invalida PCM. Reservar espacio para libros/posiciones antes que cache descartable.

## Restricciones que requieren prueba física

Bloqueo de pantalla Android, suspensión del worker, memoria disponible y sesiones de dos horas no quedan validados por emulación móvil. Media Session mejora controles pero no garantiza ejecución en segundo plano. Si falla generación con pantalla bloqueada, ampliar audio preparado en primer plano o exportar audio local antes del viaje. PWA móvil requiere HTTPS; localhost en PC no habilita instalación por HTTP en la IP de la red.

Offline requiere verificar aplicación, WASM, fonemizador, pesos y voces sin red; abrir un libro no garantiza que el navegador conserve indefinidamente sus datos. Solicitar almacenamiento persistente y permitir exportación en la fase correspondiente.
# Citas locales

`src/annotations/quotes.ts` captura una instantánea del fragmento TTS y contexto original. `Notes.tsx` permite editar una copia, comentar, cambiar color, buscar y copiar referencias sin inventar autor. Tabla Dexie `annotations` en esquema 2, índices id/bookId/createdAt; conserva las tablas previas. La captura no modifica el reproductor ni espera la generación. La posición incluye bloque, segmento y segundos dentro del WAV; no son segundos absolutos del libro ni alineación de palabras. No se añadieron dependencias ni servicios.
# Respaldo local versionado

`src/sync/backup.ts`: formato JSON lumbre-backup v1, validación de tipos/rangos/referencias/IDs duplicados, PDF opcional base64 verificado contra SHA-256 antes de escribir. Snapshot de lectura consistente; importación en transacción Dexie de libros, posiciones, citas y preferencias. Ante fallo se revierte toda la escritura. Metadata/texto no están autenticados criptográficamente. Se excluyen audio/modelos/mediciones.

Esquema Dexie 3 agrega settings (key ui), sin eliminar tablas previas. App escucha preferencias con liveQuery y guarda modificaciones en transacciones. Durante la importación se suspende el reproductor sin refrescar artificialmente la fecha del progreso; se bloquea el flush de visibilidad hasta reconfigurar con el resultado. Se conserva como máximo el último segundo persistido si había reproducción activa. Los libros sin PDF mantienen un Blob vacío y el texto; importPDF adjunta el original idéntico por hash.

Límite 100 MiB, representación JSON/base64 en memoria; no hay streaming, cifrado ni sincronización automática. Cambios concurrentes entre dispositivos se resuelven por updatedAt, conservando local en empate. Versiones distintas del texto se aproximan por página/contenido. Motor guardado se conserva; la calibración de rendimiento del otro dispositivo no se transfiere.
