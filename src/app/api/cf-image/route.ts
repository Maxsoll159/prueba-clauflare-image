import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAllowedImageUrl } from "@/lib/characters-api";

// ────────────────────────────────────────────────────────────────────────────
// /api/cf-image?url=<url-de-origen>&width=&quality=&format=&fit=
//
// La URL viene desde el cliente (ya la trajo la API en la lista), así que NO
// hay una petición extra por id. La allowlist anti-SSRF es la que protege.
//
// Flujo:
//   1. Valida la URL contra la allowlist (anti-SSRF).
//   2. Busca en el Worker Cache (caches.default) usando la URL+params como key.
//        → HIT: responde al instante desde el edge.
//   3. MISS: descarga el origen y transforma con Cloudflare:
//        - Primario: fetch(src, { cf: { image } })  (Image Resizing del zone)
//        - Fallback: binding IMAGES (Cloudflare Images) si el zone no lo tiene.
//   4. Guarda el resultado en caches.default y responde.
// ────────────────────────────────────────────────────────────────────────────

type WorkerImageFit = "cover" | "contain" | "pad" | "crop" | "scale-down";
type WorkerImageFormat = "auto" | "jpeg" | "png" | "webp" | "avif";
type ImagesOutputFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png";

type ImagesBinding = {
  input(s: ReadableStream): {
    transform(o: Record<string, unknown>): {
      output(o: Record<string, unknown>): Promise<{
        image(): ReadableStream;
        contentType(): string;
      }>;
    };
  };
};

function clampDimension(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.round(parsed), 2400);
}

function clampQuality(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 75;
  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

function normalizeFormat(value: string | null): WorkerImageFormat {
  switch (value) {
    case "jpeg":
    case "png":
    case "webp":
    case "avif":
      return value;
    default:
      return "auto";
  }
}

function normalizeFit(value: string | null): WorkerImageFit {
  switch (value) {
    case "contain":
    case "pad":
    case "crop":
    case "scale-down":
      return value;
    default:
      return "cover";
  }
}

function toOutputFormat(format: WorkerImageFormat): ImagesOutputFormat {
  const map: Record<string, ImagesOutputFormat> = {
    avif: "image/avif",
    webp: "image/webp",
    jpeg: "image/jpeg",
    png: "image/png",
    auto: "image/webp",
  };
  return map[format] ?? "image/webp";
}

// caches.default es una extensión del runtime de Cloudflare Workers.
// En Node (next dev) no existe → devolvemos undefined y el flujo sigue sin cache.
function getWorkerCache(): Cache | undefined {
  const store = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return store?.default;
}

// Reintento con backoff ante 429 (rate limit) / 5xx transitorios del origen.
// Importante en dev, donde sin cache cada carga golpea el origen en ráfaga.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) return res;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceUrl = searchParams.get("url") ?? "";

    if (!sourceUrl) {
      return Response.json({ error: "URL de origen no especificada." }, { status: 400 });
    }

    // Anti-SSRF: el origen debe pertenecer a la allowlist.
    if (!isAllowedImageUrl(sourceUrl)) {
      return Response.json({ error: "Origen no permitido." }, { status: 400 });
    }

    const width = clampDimension(searchParams.get("width")) ?? 1200;
    const height = clampDimension(searchParams.get("height"));
    const quality = clampQuality(searchParams.get("quality"));
    const format = normalizeFormat(searchParams.get("format"));
    const fit = normalizeFit(searchParams.get("fit"));

    // ?bypass-worker-cache=true → ignora el cache (útil para forzar regeneración)
    const bypassWorkerCache = searchParams.get("bypass-worker-cache") === "true";

    // Cache key = URL + params (cada combinación se cachea por separado).
    const cacheKeyUrl = new URL(request.url);
    cacheKeyUrl.searchParams.delete("bypass-worker-cache");
    const cacheKey = cacheKeyUrl.toString();

    const workerCache = getWorkerCache();

    // 2. Cache primero → en HIT ni siquiera consultamos la API upstream.
    //    (En next dev workerCache es undefined y se salta este bloque.)
    if (!bypassWorkerCache && workerCache) {
      const cached = await workerCache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("x-cf-cache", "hit");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }

    // 3. MISS → transformar directo desde la URL de origen.
    // Primario: cf.image (Image Resizing del zone).
    const cfImageOptions: Record<string, unknown> = { width, quality, format, fit };
    if (height !== undefined) cfImageOptions.height = height;

    const upstream = await fetchWithRetry(sourceUrl, {
      cf: { image: cfImageOptions },
    } as RequestInit & { cf: { image: Record<string, unknown> } });

    if (!upstream.ok || !upstream.body) {
      throw new Error(`El origen respondio con status ${upstream.status}.`);
    }

    // Cloudflare setea "cf-resized" cuando el Image Transform realmente corrió.
    // Ausente ⇒ el zone no tiene Image Resizing → fallback al binding IMAGES.
    const cfResized = upstream.headers.get("cf-resized");

    let transformStatus: "cf-applied" | "images-binding" | "passthrough";
    let contentType: string;
    let bodyBytes: ArrayBuffer;

    if (cfResized) {
      transformStatus = "cf-applied";
      contentType = upstream.headers.get("content-type") ?? "image/jpeg";
      bodyBytes = await upstream.arrayBuffer();
    } else {
      // Fallback: binding IMAGES. upstream.body ya trae los bytes originales,
      // los transformamos aquí sin una segunda descarga.
      const { env } = await getCloudflareContext({ async: true });
      const images = (env as unknown as { IMAGES?: ImagesBinding }).IMAGES;

      if (images) {
        const transformOpts: Record<string, unknown> = { width, fit };
        if (height !== undefined) transformOpts.height = height;

        const result = await images
          .input(upstream.body)
          .transform(transformOpts)
          .output({ quality, format: toOutputFormat(format) });

        transformStatus = "images-binding";
        contentType = result.contentType();
        bodyBytes = await new Response(result.image()).arrayBuffer();
      } else {
        transformStatus = "passthrough";
        contentType = upstream.headers.get("content-type") ?? "image/jpeg";
        bodyBytes = await upstream.arrayBuffer();
      }
    }

    console.log(
      `[CF_IMAGE] url=${sourceUrl} width=${width} height=${height ?? "auto"} ` +
        `q=${quality} fmt=${format} transform=${transformStatus} cf-resized=${cfResized ?? "none"}`,
    );

    const clientHeaders = new Headers({
      "content-type": contentType,
      "cache-control": bypassWorkerCache
        ? "no-store"
        : "public, max-age=300, s-maxage=86400",
      "x-cf-cache": bypassWorkerCache ? "bypass" : "miss",
      "x-transform-status": transformStatus,
    });

    // 4. Guardar en el Worker Cache (siempre, incluso en bypass, para refrescar).
    //    En next dev no hay cache → se omite.
    if (workerCache) {
      const cacheHeaders = new Headers({
        "content-type": contentType,
        "cache-control": "public, max-age=300, s-maxage=86400",
        "x-cf-cache": "miss",
        "x-transform-status": transformStatus,
      });
      await workerCache.put(
        cacheKey,
        new Response(bodyBytes, { status: 200, headers: cacheHeaders }),
      );
    }

    return new Response(bodyBytes, { status: 200, headers: clientHeaders });
  } catch (error) {
    console.error("[API][CF_IMAGE]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Error al transformar la imagen." },
      { status: 500 },
    );
  }
}
