// ────────────────────────────────────────────────────────────────────────────
// Backend real: Rick and Morty API — https://rickandmortyapi.com
//
// Mapea 1:1 con tu escenario:
//   - Tu API (BFF) llama a una API upstream (aquí, Rick & Morty).
//   - Esa API devuelve la URL de la imagen (el avatar, alojado en su CDN).
//     En tu caso real esa URL apuntaría a S3 (AWS).
//   - El browser nunca pide la imagen directo: pide /api/cf-image?id=... y
//     Cloudflare la descarga del origen, la transforma y la cachea.
//
// Para adaptarlo a S3 solo cambias ALLOWED_IMAGE_HOSTS y de dónde sale la URL.
// ────────────────────────────────────────────────────────────────────────────

const RM_API_BASE = "https://rickandmortyapi.com/api/character";

// Allowlist anti-SSRF: la ruta de transform solo acepta orígenes de estos hosts.
// (Los avatares de Rick & Morty se sirven desde rickandmortyapi.com.)
// En tu caso real: new Set(["mi-bucket.s3.us-east-1.amazonaws.com"]).
export const ALLOWED_IMAGE_HOSTS = new Set(["rickandmortyapi.com"]);

// Forma cruda que devuelve la API upstream.
type RawCharacter = {
  id: number;
  name: string;
  status: string;
  species: string;
  image: string; // URL del avatar (el "origen" a transformar)
};

type CharactersApiPayload = {
  results?: RawCharacter[];
};

// Lo que recibe el browser. Incluye la URL de la imagen tal como la devuelve
// la API upstream — la misma llamada ya trae todas las imágenes, así que no
// hace falta re-resolver nada por id.
export type PublicCharacter = {
  id: number;
  name: string;
  status: string;
  species: string;
  image: string;
};

// Lista de personajes (primera página). Cacheada 5 min en el fetch de Next.
// Una sola llamada trae los personajes con sus imágenes.
export async function fetchCharacters(): Promise<PublicCharacter[]> {
  const res = await fetch(RM_API_BASE, { next: { revalidate: 300 } });

  if (!res.ok) {
    throw new Error(`Rick & Morty API respondio con status ${res.status}.`);
  }

  const data = (await res.json()) as CharactersApiPayload;

  // Limitamos a 12 para no saturar el origen de avatares (rate limit 429),
  // sobre todo en dev donde no hay caché de edge.
  return (data.results ?? []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    species: c.species,
    image: c.image,
  }));
}

// Valida que la URL de origen pertenezca a un host permitido (anti-SSRF).
// Imprescindible: /api/cf-image ahora recibe la URL desde el cliente.
export function isAllowedImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
