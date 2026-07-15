import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Solo se usa para el <Image> "SIN optimizar" de comparación (apunta directo a la fuente).
    // El flujo optimizado NO usa remotePatterns porque el loader personalizado
    // enruta todo por /api/cf-image (mismo origen).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rickandmortyapi.com", // host de los avatares (origen a transformar)
      },
    ],
  },
};

export default nextConfig;
