import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			manifest: {
				name: 'homefree',
				short_name: 'homefree',
				description: 'House hunting map',
				theme_color: '#111111',
				background_color: '#ffffff',
				display: 'standalone',
				icons: [
					{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
				]
			},
			workbox: {
				// Precache the built app shell
				globPatterns: ['client/**/*.{js,css,html,svg,webp,png}'],
				// Don't precache large GeoJSON — cache at runtime on first load instead
				globIgnores: ['**/*.geojson'],
				runtimeCaching: [
					// Carto map tiles — cache-first, large bucket, long TTL
					{
						urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'map-tiles',
							expiration: {
								maxEntries: 10000,
								maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
							},
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					// GeoJSON layers — network-first so updates come through, falls back to cache
					{
						urlPattern: /\.geojson$/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'geojson-layers',
							expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
							cacheableResponse: { statuses: [0, 200] }
						}
					},
					// Sample CSV and other static assets
					{
						urlPattern: /\.(csv|json)$/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'static-data',
							expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
							cacheableResponse: { statuses: [0, 200] }
						}
					}
				]
			}
		})
	]
});
