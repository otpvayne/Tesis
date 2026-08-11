import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Los Server Actions limitan el body a 1MB por defecto, pero
      // MAX_UPLOAD_BYTES en src/modules/documents/validation.ts permite
      // hasta 10MB (imagen de factura). '11mb' deja margen para el
      // overhead de boundaries/metadata de multipart/form-data. Si
      // MAX_UPLOAD_BYTES cambia, revisar este valor también.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
