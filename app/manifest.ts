import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Armario Virtual Hombres',
    short_name: 'Armario',
    description: 'Tu armario digital: escanea, organiza por estación y encuentra cada prenda.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#f7f4ee',
    theme_color: '#14284b',
    lang: 'es',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
