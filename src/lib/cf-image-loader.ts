import type { ImageLoaderProps } from "next/image";

const DEFAULT_QUALITY = 75;

// Loader personalizado de next/image.
//
// Next.js llama a esta función una vez por cada ancho del srcset (width) que
// necesita. Aquí `src` es la URL de la imagen (la que vino en la respuesta de
// la API). La reenviamos a /api/cf-image, donde Cloudflare la descarga del
// origen, la transforma y la cachea en el edge.
export function cfImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const params = new URLSearchParams({
    url: src,
    width: String(width),
    quality: String(quality ?? DEFAULT_QUALITY),
    format: "auto", // deja que Cloudflare elija AVIF/WebP según el browser
    fit: "cover",
  });
  return `/api/cf-image?${params.toString()}`;
}
