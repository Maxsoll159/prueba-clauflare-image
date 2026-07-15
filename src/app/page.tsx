import { headers } from "next/headers";
import { CharacterGallery } from "@/components/character-gallery";
import { fetchCharacters, type PublicCharacter } from "@/lib/characters-api";

// La home hace una petición real a /api/characters en cada request (usa headers()).
export const dynamic = "force-dynamic";

// Reconstruye el origen (http://host) para poder hacer fetch absoluto a /api en SSR.
async function getBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Hace la petición REAL a tu API (/api/characters) desde el servidor.
// Si falla, cae a consultar la API upstream directamente para no quedar vacío.
async function loadCharacters(): Promise<PublicCharacter[]> {
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/characters`, { cache: "no-store" });
    if (!res.ok) throw new Error(`/api/characters status ${res.status}`);
    const data = (await res.json()) as { characters: PublicCharacter[] };
    return data.characters;
  } catch (error) {
    console.error("[HOME] Fallback a API upstream directa:", error);
    return fetchCharacters().catch(() => []);
  }
}

export default async function Home() {
  const characters = await loadCharacters();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10">
      <section className="space-y-3">
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase shadow-sm">
          Cloudflare Image Transform + Cache
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          API → Cloudflare → next/image
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          La página pide <span className="font-mono">/api/characters</span> (tu BFF), que consume
          la API real de <span className="font-semibold">Rick &amp; Morty</span>. Cada personaje se
          pinta con <span className="font-mono">next/image</span> usando un{" "}
          <span className="font-mono">loader</span> que enruta por{" "}
          <span className="font-mono">/api/cf-image</span>, donde Cloudflare descarga el avatar del
          origen, lo transforma y lo cachea en el edge.
        </p>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white/70 p-6 text-sm leading-6 text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] text-sky-600 uppercase">1 · API</p>
          <p><span className="font-mono">/api/characters</span> → Rick &amp; Morty API. Devuelve id, nombre, estado, especie. La URL del avatar se queda en el server.</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] text-emerald-600 uppercase">2 · next/image</p>
          <p>El <span className="font-mono">loader</span> genera el srcset apuntando a <span className="font-mono">/api/cf-image?id=…&amp;width=…</span>.</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] text-amber-600 uppercase">3 · Transform</p>
          <p>En MISS, el Worker resuelve id → URL de origen y transforma con <span className="font-mono">cf.image</span> (o binding IMAGES).</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] text-violet-600 uppercase">4 · Cache</p>
          <p><span className="font-mono">caches.default</span> guarda por URL+params. En HIT ni se llama a la API. Revisa <span className="font-mono">x-cf-cache</span>.</p>
        </div>
      </section>

      <CharacterGallery characters={characters} />

      <footer className="rounded-3xl bg-slate-900 p-6 text-sm leading-6 text-slate-300">
        <p className="font-semibold text-white">Cómo verificar el cacheo</p>
        <p className="mt-2">
          Abre DevTools → Network, filtra por <span className="font-mono text-emerald-300">cf-image</span>.
          La primera carga trae <span className="font-mono text-amber-300">x-cf-cache: miss</span>; recarga y
          verás <span className="font-mono text-emerald-300">x-cf-cache: hit</span>. El header{" "}
          <span className="font-mono text-sky-300">x-transform-status</span> indica si transformó por{" "}
          <span className="font-mono">cf.image</span> o por el binding IMAGES.
        </p>
        <p className="mt-2 text-slate-400">
          Nota: <span className="font-mono">cf.image</span> y <span className="font-mono">caches.default</span> solo
          corren de verdad al desplegar en Cloudflare (<span className="font-mono">npm run deploy</span>). En{" "}
          <span className="font-mono">next dev</span> los avatares se sirven sin transformar (passthrough).
        </p>
      </footer>
    </main>
  );
}
