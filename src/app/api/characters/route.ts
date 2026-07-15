import { fetchCharacters } from "@/lib/characters-api";

// "TU API" (BFF).
// Consume la API upstream (Rick & Morty) y devuelve al cliente SOLO datos
// públicos: id, nombre, estado, especie. La URL del avatar se queda en el server;
// el browser la pedirá luego (transformada) vía /api/cf-image?id=...
export async function GET() {
  try {
    const characters = await fetchCharacters();

    console.log(`[API][CHARACTERS] Devolviendo ${characters.length} personajes`);


    console.log("El pepe", Response.json(
      { characters },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=300",
        },
      },
    ))

    return Response.json(
      { characters },
      {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=300",
        },
      },
    );


    
  } catch (error) {
    console.error("[API][CHARACTERS]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Error al listar personajes." },
      { status: 500 },
    );
  }
}
