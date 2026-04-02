<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import type { Map, LayerGroup, Marker } from 'leaflet';

	let { listings = [] }: { listings?: Record<string, string>[] } = $props();

	let mapEl: HTMLDivElement;
	let map: Map | undefined;
	let listingLayer: LayerGroup | undefined;
	let positionMarker: Marker | undefined;
	let geoWatchId: number | undefined;
	let L: typeof import('leaflet');

	onMount(async () => {
		L = (await import('leaflet')).default;

		map = L.map(mapEl, { zoomControl: true }).setView([39.5, -98.35], 4);

		L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			subdomains: 'abcd',
			maxZoom: 20
		}).addTo(map);

		listingLayer = L.layerGroup().addTo(map);

		tryGeolocate();
	});

	onDestroy(() => {
		if (geoWatchId != null) navigator.geolocation?.clearWatch(geoWatchId);
		map?.remove();
	});

	function tryGeolocate() {
		if (!navigator.geolocation || !L) return;

		const dot = L.divIcon({
			className: '',
			html: '<div class="pos-dot"></div>',
			iconSize: [16, 16],
			iconAnchor: [8, 8]
		});

		geoWatchId = navigator.geolocation.watchPosition(
			({ coords }) => {
				const latlng: [number, number] = [coords.latitude, coords.longitude];
				if (positionMarker) {
					positionMarker.setLatLng(latlng);
				} else {
					positionMarker = L.marker(latlng, { icon: dot, zIndexOffset: 1000 })
						.bindTooltip('Your location', { permanent: false })
						.addTo(map!);
				}
			},
			() => {
				// permission denied or unavailable — silently ignore
			},
			{ enableHighAccuracy: false, timeout: 10000 }
		);
	}

	$effect(() => {
		if (!map || !listingLayer || !L) return;

		listingLayer.clearLayers();
		const bounds: [number, number][] = [];

		for (const listing of listings) {
			const lat = parseFloat(listing.lat ?? listing.latitude ?? '');
			const lng = parseFloat(listing.lng ?? listing.lon ?? listing.longitude ?? '');
			if (isNaN(lat) || isNaN(lng)) continue;

			const marker = L.marker([lat, lng]).bindPopup(buildPopup(listing), { maxWidth: 280 });
			listingLayer.addLayer(marker);
			bounds.push([lat, lng]);
		}

		if (bounds.length > 0) {
			map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
		}
	});

	function buildPopup(l: Record<string, string>) {
		const price = l.price ? `$${Number(l.price.replace(/[^0-9.]/g, '')).toLocaleString()}` : '';
		const beds = l.beds || l.bedrooms || '';
		const baths = l.baths || l.bathrooms || '';
		const sqft = l.sqft || l.sqft_living || '';
		const address = l.address || l.street || '';
		const url = l.url || l.link || '';
		const notes = l.notes || l.description || '';

		return `<div class="lp">
			${address ? `<div class="lp-addr">${address}</div>` : ''}
			${price ? `<div class="lp-price">${price}</div>` : ''}
			<div class="lp-meta">
				${beds ? `<span>${beds} bd</span>` : ''}
				${baths ? `<span>${baths} ba</span>` : ''}
				${sqft ? `<span>${Number(sqft).toLocaleString()} sqft</span>` : ''}
			</div>
			${notes ? `<div class="lp-notes">${notes}</div>` : ''}
			${url ? `<a class="lp-link" href="${url}" target="_blank" rel="noopener">View listing ↗</a>` : ''}
		</div>`;
	}
</script>

<div bind:this={mapEl} class="map"></div>

<style>
	.map {
		width: 100%;
		height: 100%;
	}

	:global(.pos-dot) {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #4285f4;
		border: 3px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	:global(.lp) { font-size: 0.85rem; line-height: 1.5; }
	:global(.lp-addr) { font-weight: 600; margin-bottom: 2px; }
	:global(.lp-price) { color: #1a7a1a; font-weight: 700; font-size: 1rem; margin-bottom: 2px; }
	:global(.lp-meta) { display: flex; gap: 0.5rem; color: #444; font-size: 0.8rem; flex-wrap: wrap; }
	:global(.lp-notes) { color: #666; font-size: 0.78rem; margin-top: 4px; }
	:global(.lp-link) { display: inline-block; margin-top: 6px; color: #1a56db; font-size: 0.8rem; }
</style>
