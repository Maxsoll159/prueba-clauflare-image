# cf-image-s3-demo

Simulación del flujo **API → Cloudflare Image Transform → cache → `next/image`**,
basada en el patrón del proyecto `web-proyect-uat-renderer` (módulo de banners).
Usa la **API real de [Rick & Morty](https://rickandmortyapi.com)** como upstream.

## El escenario

1. Tu **API** (`/api/characters`) consume la API upstream (Rick & Morty). Al browser
   le manda solo `id`, nombre, estado y especie. La URL del avatar **no sale del servidor**.
   > En tu caso real, esa URL apuntaría a **S3 (AWS)** en vez de al CDN de Rick & Morty.
2. La UI pinta cada personaje con **`next/image`** usando un **loader personalizado**
   (`src/lib/cf-image-loader.ts`) que genera el srcset apuntando a `/api/cf-image?id=…&width=…`.
3. **`/api/cf-image`** (el Worker):
   - Revisa **`caches.default`** primero → en HIT responde del edge sin llamar a la API.
   - En MISS: resuelve `id → URL de origen` (fetch real a Rick & Morty), valida el host
     (anti-SSRF) y transforma con Cloudflare:
     - Primario: `fetch(src, { cf: { image } })` — Image Resizing del zone.
     - Fallback: binding `IMAGES` (Cloudflare Images) si el zone no lo tiene.
   - Guarda el resultado en `caches.default` con `Cache-Control: public, max-age=300, s-maxage=86400`.

## Piezas clave

| Archivo | Rol |
|---|---|
| `src/lib/characters-api.ts` | Cliente de la **API upstream** (Rick & Morty) + allowlist anti-SSRF. |
| `src/app/api/characters/route.ts` | Tu **API/BFF**: datos públicos, sin URL de imagen. |
| `src/app/api/cf-image/route.ts` | **Transform + cache** en Cloudflare. Corazón del demo. |
| `src/lib/cf-image-loader.ts` | **Loader** de `next/image` → enruta por `/api/cf-image`. |
| `src/components/character-gallery.tsx` | Galería con `<Image>` optimizado. |

## Cómo adaptarlo a tu proyecto real (S3)

En `src/lib/characters-api.ts`:

```ts
// La allowlist pasa a ser el host de tu bucket S3
export const ALLOWED_IMAGE_HOSTS = new Set(["mi-bucket.s3.us-east-1.amazonaws.com"]);

// fetchCharacters → llama a TU API; findCharacterImageUrl → devuelve la URL de S3
```

Todo lo demás (loader, ruta de transform, cache) queda igual.

## Ejecutar

```bash
npm install

npm run dev      # UI + flujo API→next/image (avatares SIN transformar en dev: passthrough)
npm run preview  # runtime real de Cloudflare (workerd)
npm run deploy   # despliegue — aquí SÍ corren transform + cache de verdad
```

> `preview`/`deploy` requieren `wrangler login` y una cuenta de Cloudflare.
> Para el transform: habilita **Image Resizing / Transformations** en tu zone,
> o configura el binding **Images** (ya declarado en `wrangler.jsonc`).

## Verificar el cacheo

DevTools → Network → filtra por `cf-image`:

- 1ª carga: `x-cf-cache: miss`
- recarga: `x-cf-cache: hit`
- `x-transform-status`: `cf-applied` | `images-binding` | `passthrough`
