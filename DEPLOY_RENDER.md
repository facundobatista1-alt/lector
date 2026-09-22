# Publicar Lumbre en Render

Lumbre es una PWA estática. No necesita servidor ni base de datos para leer PDFs,
generar Dora o guardar citas: esos datos permanecen en IndexedDB del dispositivo.

## Configuración

- Servicio: **Static Site**
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Node: usar la versión LTS disponible en Render

El archivo `render.yaml` contiene esta configuración para un despliegue desde un
repositorio Git. Render entrega una URL HTTPS estable, necesaria para instalar la
PWA en Safari.

## Modelo y privacidad

Los modelos locales no se suben al repositorio (`public/models/` está ignorado).
La primera síntesis descarga Dora desde Hugging Face y luego la guarda en la caché
local. El PDF, las citas, el audio y el progreso no se envían a Render.

## Después del despliegue en iPhone

1. Abrir la URL de Render en Safari.
2. Compartir → Agregar a Inicio.
3. Importar el PDF o el respaldo.
4. Pulsar **Preparar para escuchar offline**.

La URL temporal de Cloudflare ya no será necesaria.
