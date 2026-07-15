"use client";

import Image from "next/image";
import { cfImageLoader } from "@/lib/cf-image-loader";
import type { PublicCharacter } from "@/lib/characters-api";

const CARD_QUALITY = 75;
// Tamaño fijo → next/image pide pocas variantes (1x y 2x), no todos los
// deviceSizes. Menos peticiones al origen (evita el 429 por ráfaga).
const CARD_SIZE = 300;

const statusColor: Record<string, string> = {
  Alive: "bg-emerald-50 text-emerald-700",
  Dead: "bg-rose-50 text-rose-700",
  unknown: "bg-slate-100 text-slate-500",
};

export function CharacterGallery({ characters }: { characters: PublicCharacter[] }) {
  if (!characters.length) {
    return (
      <div className="rounded-3xl bg-slate-50 p-10 text-center text-sm text-slate-500">
        No se recibieron personajes desde la API.
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {characters.map((character) => {
        // La URL que verá el browser (misma que Next usará en el srcset).
        const sampleUrl = cfImageLoader({
          src: character.image,
          width: CARD_SIZE * 2,
          quality: CARD_QUALITY,
        });

        return (
          <article
            key={character.id}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="aspect-square w-full bg-slate-100">
              <Image
                loader={cfImageLoader}
                src={character.image}
                alt={character.name}
                width={CARD_SIZE}
                height={CARD_SIZE}
                quality={CARD_QUALITY}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-950">{character.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    statusColor[character.status] ?? statusColor.unknown
                  }`}
                >
                  {character.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">{character.species}</p>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-[0.15em] text-emerald-600 uppercase">
                  URL optimizada (lo que ve el browser)
                </p>
                <p className="break-all rounded-lg bg-emerald-50 px-2.5 py-1.5 font-mono text-[10px] leading-4 text-emerald-900">
                  {sampleUrl}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
