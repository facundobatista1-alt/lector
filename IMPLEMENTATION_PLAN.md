# Plan y criterios de aceptación

PWA/offline implementado: manifiesto, iconos, Service Worker versionado, botón de preparación para Dora WASM Q8, verificación de interfaz/libro/modelo/motor, cache de recursos y síntesis desde caché sin red. E2E Edge y Chrome cierran/reabren el sitio desconectado, restauran párrafo y generan audio real. **Corrección de destino móvil: el usuario tiene iPhone.** Siguientes validaciones: origen HTTPS accesible desde Safari iOS, instalación en pantalla de inicio, capacidad de Dora WASM Q8 en ese hardware, continuidad al bloquear y sesión larga. OCR y notas al pie siguen pendientes.

Respaldo/transferencia manual implementado: exportación JSON v1 con PDFs opcionales, texto y capítulos, progreso, citas y preferencias; importación validada/atómica con resolución por fecha y deduplicación por hash. Límite 100 MB, sin audio/modelos. Siguiente etapa: PWA/offline y prueba física Android/bloqueo; no se implementó sincronización automática ni IA.

Citas implementadas: botón persistente Guardar cita, fragmento de audio y párrafo original, metadatos y posición, edición/comentarios/color, búsqueda y copia con referencia. Persistencia IndexedDB con migración desde esquema 1. Próximos pasos: respaldo exportable/importable, PWA/offline y pruebas físicas de Android. Selección libre y subrayado dentro del lector quedan pendientes.

Biblioteca + Continuar + capítulos implementados: inicio en biblioteca, posiciones independientes, búsqueda/orden/progreso, continuación sin reiniciar reserva activa, marcadores PDF con fallback a encabezados, anterior/siguiente, omisión reversible de índice/bibliografía y marcado conservador de ruido. Verificación con PDF de marcadores generado y PDF real de Weber. Se mantienen como siguientes etapas citas, PWA/offline y pruebas físicas de teléfono; no se adelantó IA.

Actualización de producto: Dora es la única voz visible. Al importar/abrir un PDF se prepara automáticamente una reserva de cinco minutos; Play espera 30 segundos preparados (o el final si queda menos). Esto reemplaza la cola inicial de tres fragmentos y el botón de 21 fragmentos mencionados en el historial. La preparación se reanuda desde cache y no inicia audio sin pulsar Play.

## Fase 0 — prototipos implementados; puerta de rendimiento/calidad pendiente

1. Inspeccionar carpeta y fuentes oficiales; verificar versiones de npm.
2. Laboratorio aislado: cinco párrafos originales en español, tres voces Kokoro, selección automática/WebGPU/WASM, descarga explícita, reproducción y exportación WAV.
3. Medir carga, inferencia, duración, RTF (segundos de generación / segundos de audio), tamaño PCM y memoria JS cuando el navegador la exponga. La memoria JS no representa memoria total ni GPU.
4. Prototipo PDF: importar, hash, metadata, páginas/etiquetas, texto y advertencias de escaneo.
5. Prototipo de sincronización por bloque con audio real; guardar y restaurar posición en IndexedDB.
6. Build, lint, tests unitarios y Playwright; registrar resultados reales y pendientes en TECHNICAL_FINDINGS.md.
7. Puerta de calidad: escucha humana de los cinco párrafos y prueba en teléfono real. No declarar voz aprobada usando un WAV simulado o una prueba DOM.

Resultado inicial: Kokoro tuvo RTF entre 1,45 y 1,70, insuficiente para generación sostenida. Piper es más rápido, pero el usuario prefiere Dora. Dora es la voz inicial. Se implementaron separación geométrica de párrafos, audio progresivo, tres fragmentos anticipados, preparación de 21 fragmentos, comparación local de motores, controles Media Session y posición por fragmento. Falta escucha de transiciones y prueba prolongada/móvil antes de aprobar el MVP completo. Evidencia en TECHNICAL_FINDINGS.md y artifacts/.

## Fase 1 — MVP, después de validar voz

Biblioteca → agregar PDF → procesar → leer/escuchar → buffer progresivo → pausa/velocidad/salto por párrafo → persistencia → cerrar y continuar. Cache limitado y recuperación de errores. Media Session y ensayo de dos horas en PC y Android. Pruebas E2E del recorrido completo.

## Fase 2

Capítulos/índice, limpieza geométrica avanzada, OCR Tesseract.js en worker con resultados persistidos por página, notas al pie configurables, citas y selección, PWA/offline verificado. Probar PDFs de columnas y numeraciones distintas; conservar el original como referencia.

## Fase 3

Exportación/importación versionada con validación y resolución de conflictos por libro/hash; evaluar sincronización por archivo cifrado o WebRTC sin servidor permanente. Búsqueda local con procedencia, proveedores opcionales de IA/traducción local y botón No entendí. Sin descarga de LLM automática.

## Casos de aceptación

PDF limpio 250 páginas, escaneo, notas abundantes, citas extranjeras, etiquetas distintas del índice del archivo, cierre inesperado, poca memoria, GPU real y WASM. Cada caso debe marcarse probado / pendiente / limitado; emulación de pantalla móvil no cuenta como prueba de hardware móvil.
