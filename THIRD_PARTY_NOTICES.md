# Componentes de terceros

Esta aplicación personal no utiliza APIs de inferencia externas. Las licencias originales se conservan en node_modules y en los recursos indicados.

| Componente | Licencia declarada por su distribución |
| --- | --- |
| React / React DOM | MIT |
| Vite | MIT |
| Dexie | Apache-2.0 |
| PDF.js | Apache-2.0 |
| ONNX Runtime Web | MIT |
| Kokoro 82M / pesos ONNX | Apache-2.0 |
| @echogarden/espeak-ng-emscripten | GPL-3.0 |

El fonemizador se usa para convertir texto español en fonemas. La voz audible la produce Kokoro. El archivo COPYING de eSpeak se copia a public/runtime junto a su distribución. Fuente: https://github.com/echogarden-project/espeak-ng-emscripten y el fork de eSpeak enlazado en su README. No se modificó su distribución.

Modelos: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX (revisión 1939ad2). Las voces españolas son ef_dora, em_alex y em_santa. El script de descarga registra tamaño y SHA-256 de las descargas en artifacts/model-download.json.

El texto de los cinco párrafos de prueba es original, creado para el laboratorio. No se atribuye a ningún autor ni libro publicado.

Piper: pesos españoles `es_ES-davefx-medium` del repositorio rhasspy/piper-voices, revisión v1.0.0. Su MODEL_CARD declara dataset CC0 y ajuste desde lessac-medium; se conserva íntegro en public/models/piper/MODEL_CARD. Se implementó un adaptador ONNX propio sobre el runtime y fonemizador ya instalados, sin incorporar el paquete Python de Piper. Referencia del contrato de entradas: https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/voice.py. Procedencia y hashes: artifacts/piper-model-download.json.
