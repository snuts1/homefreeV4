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

	type GeoStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable';
	let geoStatus = $state<GeoStatus>('idle');

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

		if (!navigator.geolocation) geoStatus = 'unavailable';
	});

	onDestroy(() => {
		if (geoWatchId != null) navigator.geolocation?.clearWatch(geoWatchId);
		map?.remove();
	});

	function locate() {
		if (!navigator.geolocation || !L || !map) return;

		// Clear any existing watch
		if (geoWatchId != null) {
			navigator.geolocation.clearWatch(geoWatchId);
			geoWatchId = undefined;
		}

		geoStatus = 'locating';

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
					map!.setView(latlng, Math.max(map!.getZoom(), 12));
				}
				geoStatus = 'active';
			},
			(err) => {
				geoStatus = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
			},
			{ enableHighAccuracy: true, timeout: 15000 }
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

<div bind:this={mapEl} class="map">
	{#if geoStatus !== 'unavailable'}
		<button
			class="locate-btn"
			class:locating={geoStatus === 'locating'}
			class:active={geoStatus === 'active'}
			class:denied={geoStatus === 'denied'}
			onclick={locate}
			title={geoStatus === 'denied'
				? 'Location access denied — click to retry'
				: geoStatus === 'active'
					? 'Location active — click to re-center'
					: 'Show my location'}
		>
			{#if geoStatus === 'locating'}
				<span class="spin">⊙</span>
			{:else}
				◎
			{/if}
		</button>
	{/if}
</div>

<style>
	.map {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.locate-btn {
		position: absolute;
		bottom: 24px;
		right: 10px;
		z-index: 1000;
		width: 34px;
		height: 34px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #444;
		box-shadow: 0 1px 5px rgba(0, 0, 0, 0.15);
		transition: color 0.15s, border-color 0.15s;
	}
	.locate-btn:hover { background: #f4f4f4; }
	.locate-btn.active { color: #4285f4; border-color: #4285f4; }
	.locate-btn.denied { color: #c0392b; border-color: #c0392b; }
	.locate-btn.locating { color: #888; }

	.spin {
		display: inline-block;
		animation: spin 1s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

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
