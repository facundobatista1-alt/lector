# Lumbre

## Instalar y preparar offline

En Windows, ejecutá `npm.cmd run build` y `npm.cmd run preview -- --port 5173`; abrí `http://127.0.0.1:5173/` en Chrome o Edge. El navegador ofrece **Instalar Lumbre** desde su menú o el icono de instalación de la barra de direcciones. La compilación de producción registra el Service Worker; el servidor de desarrollo (`npm run dev`) no lo registra.

Conectado a internet, agregá un PDF y entrá en **Biblioteca → Escuchar offline → Preparar para escuchar offline**. Esperá hasta ver **Listo para abrir y escuchar sin conexión**. La primera preparación guarda la interfaz, Dora Q8 y el motor local (unos 130 MB); el PDF, texto e índice ya residen en IndexedDB. El audio se genera por fragmentos al escuchar. **Comprobar y reparar** verifica/recupera recursos. El motor WebGPU FP32 no forma parte de esta preparación: usa Dora WASM Q8 offline.

El icono instalado abre el mismo origen del navegador. El perfil, origen y almacenamiento deben conservarse: borrar datos del sitio elimina libros, citas, audio y modelo; exportá un respaldo si querés proteger libros y notas. El navegador puede liberar espacio incluso después de preparar, por eso la pantalla vuelve a comprobar recursos. El modelo y los archivos de la app no viajan dentro del respaldo JSON.

En iPhone, abrí Lumbre en **Safari** desde una dirección HTTPS y usá **Compartir → Agregar a pantalla de inicio**. La dirección `127.0.0.1` de Windows no apunta al iPhone, y servir la app por HTTP desde la red local no habilita el Service Worker. El directorio `dist/` es estático y puede servirse desde un origen HTTPS. Todavía no se configuró ese origen ni se probó Dora en un iPhone real, con pantalla bloqueada o durante dos horas. La preparación de 130 MB y la síntesis local pueden requerir demasiada memoria en algunos modelos.

Lector personal gratuito y local. **Estado actual: audio progresivo con reserva; validación prolongada y móvil pendiente.** La única voz ofrecida en la interfaz es **Dora · Kokoro**. Las implementaciones anteriores se conservan como código de compatibilidad, sin selector ni descarga automática.

## Abrir

Con Node.js 24 instalado, desde esta carpeta:

```powershell
npm.cmd install
npm.cmd run dev
```

Abrir http://localhost:5173 en Chrome o Edge. En esta máquina las dependencias y los pesos ya se descargaron durante el desarrollo.

La pantalla inicial es **Mi biblioteca**: búsqueda por título/autor (sin distinguir tildes), orden por recientes/título/autor/progreso y **Continuar escuchando** con un toque. El porcentaje es una aproximación por texto recorrido, no un tiempo exacto. Las cubiertas tipográficas son identificadores visuales, no portadas extraídas del PDF.

En **Lector**, el panel **Capítulos y secciones** usa los marcadores del PDF o detecta encabezados claros. Incluye capítulo anterior/siguiente, páginas y fuente de la detección. Índice y bibliografía detectados se excluyen del audio por defecto; la casilla correspondiente permite incluirlos y se guarda por libro. Los encabezados repetidos y la numeración reconocida no se sintetizan; el texto original permanece visible y el PDF intacto. Las opciones de motor y las mediciones están plegadas.

1. Agregar o abrir un PDF. Dora comienza automáticamente a preparar hasta cinco minutos desde la posición guardada, sin reproducir. Kokoro usa aproximadamente 88 MiB en WASM o 311 MiB en WebGPU.
2. La pantalla muestra la reserva en minutos/segundos a la velocidad elegida. **Escuchar** espera 30 segundos de reserva antes de empezar, o el resto del libro si es más corto. Si se agota, vuelve a acumular reserva. La generación repone hasta cinco minutos mientras escuchás.
3. **Preparar por adelantado** reanuda la preparación cancelada. Pausar el audio permite que Dora siga preparando; Cancelar detiene la preparación. Dejar la app abierta para que avance. **Comparar motores con Dora** pausa la lectura y mide el mismo texto en WASM/WebGPU; Automático prefiere WASM si la mejora GPU es menor al 10%.
4. Se puede descargar la muestra WAV y exportar las mediciones JSON.
5. Volver a Biblioteca no detiene la reproducción. Abrir otro libro recupera su posición propia; Continuar conserva la reserva si el libro ya está cargado.

La reproducción avanza entre fragmentos y párrafos. Se puede pausar mientras se prepara audio. Tocar otro párrafo mientras se escucha cancela el trabajo anterior y lee desde ahí. Se guardan fragmento, segundos, velocidad y voz. No utiliza speechSynthesis ni voces remotas. El seguimiento es por párrafo, sin inventar marcas temporales de palabras.

Los libros anteriores se reextraen una vez desde el PDF guardado para reconocer sangrías y separación entre párrafos. La posición antigua se aproxima por texto/página y reinicia los segundos del párrafo localizado; las posiciones nuevas se restauran por fragmento. El PDF original permanece intacto.

## Pesos locales opcionales

```powershell
npm.cmd run models
npm.cmd run models -- --webgpu
npm.cmd run models -- --piper
```

Los pesos se guardan en public/models/kokoro y public/models/piper, excluidos de Git. Si no están presentes, el botón de preparación los obtiene desde Hugging Face y los conserva en Cache Storage. No hay clave, cuenta ni inferencia en servidor. La aplicación necesita servir sus archivos; no se abre index.html mediante file://.

## Verificación

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
node scripts/benchmark-progressive.mjs
```

Playwright usa Chrome y Edge instalados, PDF de prueba generado localmente y **síntesis neuronal real**. Requiere pesos disponibles y puede tardar. El benchmark progresivo compara Dora WASM/WebGPU y registra inicio y cambios de reproducción. Los artefactos se escriben en artifacts. Los scripts benchmark.mjs y benchmark-piper.mjs corresponden a la interfaz anterior; usar benchmark-progressive.mjs para la actual. La ventana móvil emulada prueba layout, no rendimiento Android.

## Límites explícitos

- Dora fue aprobada por el usuario; las transiciones nuevas requieren escucha humana. Si RTF × velocidad supera 1, un buffer finito no evita pausas indefinidamente.
- Se usa HTMLAudio para avanzar entre WAV locales. Puede haber separación audible entre archivos. Media Session ofrece controles donde están soportados; no garantiza workers activos con pantalla bloqueada.
- No están implementados aún OCR, citas, notas al pie, IA, traducción, sincronización, instalación PWA ni garantía offline completa.
- No se ha validado pantalla bloqueada ni sesiones de dos horas en Android.
- La extracción conserva el original y hace limpieza básica. Columnas, notas y encabezados alternados requieren la fase 2.
- IndexedDB pertenece a este navegador y origen: Chrome, Edge, localhost y 127.0.0.1 tienen bibliotecas distintas. Borrar datos del sitio borra libros y progreso.
- La posición se escribe cada segundo durante reproducción y al pausar/cambiar de párrafo. No se inicia audio automáticamente al abrir.
- Sin telemetría, analytics ni backend. El runtime y la fonemización se sirven localmente. No hay LLM descargado.
- El servidor local configura COOP/COEP para usar hasta cuatro hilos WASM; al alojar la aplicación sin esos encabezados utiliza un hilo. Son archivos estáticos, sin backend de datos.

Ver [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) y [TECHNICAL_FINDINGS.md](TECHNICAL_FINDINGS.md).
# Guardar citas

Con un PDF abierto, pulsá **Guardar cita** en el reproductor para conservar el fragmento actual sin pausar. En **Citas y notas** podés editar el texto, agregar comentarios, elegir color, buscar y copiar texto solo o con autor/título/página. El párrafo original sigue disponible. Los cambios del editor se confirman con **Guardar cambios**. Las citas permanecen en IndexedDB de este navegador y origen; el respaldo exportable todavía está pendiente. La captura es por fragmento de audio, no por palabra. La muestra del laboratorio no permite guardar citas.
# Respaldo y transferencia

En **Biblioteca → Respaldo y transferencia**, pulsá **Exportar respaldo**. Incluye texto extraído, capítulos, progreso por libro, citas/comentarios/colores y preferencias (tema, seguimiento y tamaño; velocidad/voz/motor en la posición). Marcá **Incluir PDFs originales** si querés conservarlos también.

Copiá el JSON al otro dispositivo, elegí **Seleccionar respaldo**, revisá el resumen y pulsá **Importar este respaldo**. No necesita servidor. Se usa el hash del PDF para identificar libros y la fecha de modificación para resolver posiciones/citas/preferencias; en empate se mantiene lo local. Conviene que ambos dispositivos tengan el reloj correcto. El texto sin PDF permite leer y sintetizar; agregar después el PDF idéntico lo adjunta sin duplicar el libro.

Límite actual: 100 MB por archivo, procesamiento JSON en memoria (no adecuado para bibliotecas enormes). El archivo contiene datos privados sin cifrar. Audio generado, modelos y mediciones del equipo quedan fuera; en un dispositivo nuevo hay que disponer del modelo Dora. Importar pausa el audio, no lo inicia automáticamente y no elimina datos existentes. Si una extracción difiere, conserva el texto local y aproxima la posición por contenido/página, reiniciando los segundos del fragmento.
