# Sincronización Supabase

1. En Supabase, activar **Authentication → Providers → Anonymous sign-ins**.
2. Abrir **SQL Editor** y ejecutar [supabase/schema.sql](supabase/schema.sql).
3. En Render, agregar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno.

La clave publishable/anon puede estar en el frontend. Nunca usar `service_role`.
La aplicación seguirá leyendo desde IndexedDB y sincronizará cuando haya conexión.
