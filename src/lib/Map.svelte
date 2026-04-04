<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import 'leaflet/dist/leaflet.css';
	import type { Map as LeafletMap, LayerGroup, Marker, GeoJSON } from 'leaflet';

	let {
		listings = [],
		colorParam = 'none',
		colorMin = 0,
		colorMax = 1
	}: {
		listings?: Record<string, string>[];
		colorParam?: string;
		colorMin?: number;
		colorMax?: number;
	} = $props();

	let mapEl: HTMLDivElement;
	let map = $state<LeafletMap | undefined>(undefined);
	let listingLayer = $state<LayerGroup | undefined>(undefined);
	let positionMarker: Marker | undefined;
	let geoWatchId: number | undefined;
	let L: typeof import('leaflet');

	type GeoStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable';
	let geoStatus = $state<GeoStatus>('idle');

	// ── layer management ─────────────────────────────────────────
	type LayerId = 'listings' | 'pois' | 'forest' | 'park' | 'jurisdictions' | 'soil';

	const LAYER_DEFS: { id: LayerId; label: string }[] = [
		{ id: 'listings',      label: 'Listings' },
		{ id: 'pois',          label: 'Points of Interest' },
		{ id: 'forest',        label: 'Forest Boundary' },
		{ id: 'park',          label: 'Park Boundary' },
		{ id: 'jurisdictions', label: 'VA Jurisdictions' },
		{ id: 'soil',          label: 'Soil Data' },
	];

	let layerVis = $state<Record<LayerId, boolean>>({
		listings: true, pois: true, forest: true, park: true, jurisdictions: true, soil: true,
	});

	// Plain (non-reactive) refs — populated as each layer loads
	const layerRefs: Partial<Record<LayerId, LayerGroup | GeoJSON>> = {};

	let panelOpen = $state(true);

	function toggleLayer(id: LayerId) {
		layerVis[id] = !layerVis[id];
		if (!map) return;
		const ref = id === 'listings' ? listingLayer : layerRefs[id];
		if (!ref) return;
		if (layerVis[id]) ref.addTo(map);
		else ref.remove();
	}

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

		const geoStyle = { color: '#228B22', fillColor: '#228B22', fillOpacity: 0.18, weight: 1.5, opacity: 0.5 };
		const geoPaths: [LayerId, string][] = [
			['forest', '/forest_boundary1.geojson'],
			['park',   '/park_boundary1.geojson'],
		];
		for (const [id, path] of geoPaths) {
			fetch(path)
				.then((r) => r.json())
				.then((data) => {
					const layer = L.geoJSON(data, { style: geoStyle }).addTo(map!);
					layerRefs[id] = layer;
				})
				.catch(() => console.warn(`Could not load ${path}`));
		}

		fetch('/Virginia_Jurisdictions.geojson')
			.then((r) => r.json())
			.then((data) => {
				const layer = L.geoJSON(data, {
					style: { color: '#555', weight: 1, opacity: 0.5, fillOpacity: 0 },
					onEachFeature(feature, layer) {
						const name = feature.properties?.NAMELSAD ?? feature.properties?.NAME;
						if (name) layer.bindTooltip(name, { sticky: true, opacity: 0.85 });
					}
				}).addTo(map!);
				layerRefs.jurisdictions = layer;
			})
			.catch(() => console.warn('Could not load Virginia_Jurisdictions.geojson'));

		fetch('/soil_data.js')
			.then((r) => r.text())
			.then((src) => {
				const json = src.replace(/^\s*var\s+soilData\s*=\s*/, '').replace(/;\s*$/, '');
				const data = JSON.parse(json);
				// Capability class 1–8: 1=best (green), 8=worst (gray-red)
				const capColor: Record<string, string> = {
					'1': '#1a9641', '2': '#a6d96a', '3': '#ffffbf',
					'4': '#fdae61', '5': '#d7191c', '6': '#a50026',
					'7': '#7f0000', '8': '#aaaaaa',
				};
				const layer = L.geoJSON(data, {
					style(feature) {
						const cap = feature?.properties?.capability ?? '';
						return {
							color: '#888', weight: 0.3, opacity: 0.4,
							fillColor: capColor[cap] ?? '#cccccc',
							fillOpacity: 0.45,
						};
					},
					onEachFeature(feature, layer) {
						const p = feature.properties ?? {};
						layer.bindTooltip(
							`<strong>${p.muname ?? ''}</strong><br>` +
							`Capability: ${p.capability ?? '?'} · ${p.farmlndcl ?? ''}<br>` +
							`Drainage: ${p.drainage ?? ''} · Slope: ${p.slope_pct ?? '?'}%`,
							{ sticky: true, opacity: 0.9 }
						);
					}
				}).addTo(map!);
				layerRefs.soil = layer;
			})
			.catch(() => console.warn('Could not load soil_data.js'));

		fetch('/pois.json')
			.then((r) => r.json())
			.then((pois: { name: string; lat: number; lng: number; cat: string }[]) => {
				const layer = L.layerGroup().addTo(map!);
				layerRefs.pois = layer;
				const icon = L.divIcon({
					className: '',
					html: '<div class="poi-marker">!</div>',
					iconSize: [20, 20],
					iconAnchor: [10, 10],
					popupAnchor: [0, -12]
				});
				for (const poi of pois) {
					L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 500 })
						.bindTooltip(
							`<strong>${poi.name}</strong><br><span class="poi-cat">${poi.cat}</span>`,
							{ direction: 'top', offset: [0, -10] }
						)
						.addTo(layer);
				}
			})
			.catch(() => console.warn('Could not load pois.json'));

		if (!navigator.geolocation) geoStatus = 'unavailable';
	});

	onDestroy(() => {
		if (geoWatchId != null) navigator.geolocation?.clearWatch(geoWatchId);
		map?.remove();
	});

	function locate() {
		if (!navigator.geolocation || !L || !map) return;

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

	function markerColor(listing: Record<string, string>): string {
		if (colorParam === 'none') return '#d95f02';
		const raw = listing[colorParam];
		const value = parseFloat(raw ?? '');
		if (!raw || isNaN(value) || (colorParam !== 'year_built' && value === 0)) return '#999';
		if (colorMin === colorMax) return 'hsl(60, 80%, 40%)';
		const t = Math.max(0, Math.min(1, (value - colorMin) / (colorMax - colorMin)));
		return `hsl(${Math.round(120 * (1 - t))}, 80%, 38%)`;
	}

	function makeLotIcon(color: string) {
		return L.divIcon({
			className: '',
			html: `<div class="marker-lot" style="background:${color}"></div>`,
			iconSize: [12, 12],
			iconAnchor: [6, 6],
			popupAnchor: [0, -8]
		});
	}

	$effect(() => {
		if (!map || !listingLayer || !L) return;

		listingLayer.clearLayers();
		const bounds: [number, number][] = [];

		for (const listing of listings) {
			const lat = parseFloat(listing.lat ?? listing.latitude ?? '');
			const lng = parseFloat(listing.lng ?? listing.lon ?? listing.longitude ?? '');
			if (isNaN(lat) || isNaN(lng)) continue;

			const sqft = parseFloat(listing.sqft ?? '');
			const isLot = !listing.sqft || isNaN(sqft) || sqft === 0;
			const color = markerColor(listing);

			const marker = isLot
				? L.marker([lat, lng], { icon: makeLotIcon(color) })
				: L.circleMarker([lat, lng], {
						radius: 7,
						color: '#fff',
						weight: 2,
						fillColor: color,
						fillOpacity: 0.9
					});

			marker.bindPopup(buildPopup(listing), { maxWidth: 280 });
			listingLayer.addLayer(marker);
			bounds.push([lat, lng]);
		}

		if (bounds.length > 0) {
			map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
		}
	});

	function buildPopup(l: Record<string, string>) {
		const price = l.price ? `$${Number(l.price.replace(/[^0-9.]/g, '')).toLocaleString()}` : '';
		const ppsf = l.price_per_sqft ? `$${l.price_per_sqft}/sqft` : '';
		const beds = l.beds || l.bedrooms || '';
		const baths = l.baths || l.bathrooms || '';
		const sqft = l.sqft || l.sqft_living || '';
		const lot = l.lot_acres ? `${l.lot_acres} ac` : '';
		const year = l.year_built || '';
		const hoa = l.hoa ? `HOA $${l.hoa}/mo` : '';
		const address = l.address || l.street || '';
		const link = l.link || l.url || '';
		const notes = l.notes || l.description || '';

		return `<div class="lp">
			${address ? `<div class="lp-addr">${address}</div>` : ''}
			${price ? `<div class="lp-price">${price}${ppsf ? `<span class="lp-ppsf"> · ${ppsf}</span>` : ''}</div>` : ''}
			<div class="lp-meta">
				${beds ? `<span>${beds} bd</span>` : ''}
				${baths ? `<span>${baths} ba</span>` : ''}
				${sqft ? `<span>${Number(sqft).toLocaleString()} sqft</span>` : ''}
				${lot ? `<span>${lot}</span>` : ''}
				${year ? `<span>built ${year}</span>` : ''}
			</div>
			${hoa ? `<div class="lp-hoa">${hoa}</div>` : ''}
			${notes ? `<div class="lp-notes">${notes}</div>` : ''}
			${link ? `<a class="lp-link" href="${link}" target="_blank" rel="noopener">View on Redfin ↗</a>` : ''}
		</div>`;
	}
</script>

<div bind:this={mapEl} class="map">
	<!-- Layer panel -->
	<div class="layer-panel">
		<button class="layer-header" onclick={() => (panelOpen = !panelOpen)}>
			<span>Layers</span>
			<span class="chevron" class:flipped={panelOpen}>▾</span>
		</button>
		{#if panelOpen}
			<ul class="layer-list" transition:slide={{ duration: 160 }}>
				{#each LAYER_DEFS as def}
					<li class="layer-row">
						<label>
							<input
								type="checkbox"
								checked={layerVis[def.id]}
								onchange={() => toggleLayer(def.id)}
							/>
							<span class="layer-name">{def.label}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Locate button -->
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

	/* ── Layer panel ── */
	.layer-panel {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 1000;
		width: 190px;
		background: rgba(255, 255, 255, 0.96);
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
		overflow: hidden;
	}

	.layer-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.7rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		color: #222;
		letter-spacing: 0.01em;
	}
	.layer-header:hover { background: rgba(0, 0, 0, 0.04); }

	.chevron {
		font-size: 1rem;
		line-height: 1;
		transition: transform 0.15s;
		display: inline-block;
	}
	.chevron.flipped { transform: rotate(180deg); }

	.layer-list {
		list-style: none;
		margin: 0;
		padding: 0 0 0.3rem;
		border-top: 1px solid #eee;
	}

	.layer-row { padding: 0; }

	.layer-row label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.7rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: #333;
	}
	.layer-row label:hover { background: rgba(0, 0, 0, 0.04); }

	.layer-row input[type='checkbox'] {
		accent-color: #1a56db;
		width: 15px;
		height: 15px;
		cursor: pointer;
		flex-shrink: 0;
	}

	/* ── Locate button ── */
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

	/* ── Marker styles ── */
	:global(.poi-marker) {
		width: 20px;
		height: 20px;
		background: #c0392b;
		color: #fff;
		font-weight: 900;
		font-size: 13px;
		line-height: 18px;
		text-align: center;
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}
	:global(.poi-cat) { font-size: 0.75rem; color: #666; }

	:global(.marker-lot) {
		width: 12px;
		height: 12px;
		border: 2px solid #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
	}

	:global(.pos-dot) {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #4285f4;
		border: 3px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}

	/* ── Popup styles ── */
	:global(.lp) { font-size: 0.85rem; line-height: 1.5; }
	:global(.lp-addr) { font-weight: 600; margin-bottom: 2px; }
	:global(.lp-price) { color: #1a7a1a; font-weight: 700; font-size: 1rem; margin-bottom: 2px; }
	:global(.lp-ppsf) { font-weight: 400; font-size: 0.8rem; color: #444; }
	:global(.lp-meta) { display: flex; gap: 0.5rem; color: #444; font-size: 0.8rem; flex-wrap: wrap; }
	:global(.lp-hoa) { font-size: 0.78rem; color: #666; }
	:global(.lp-notes) { color: #666; font-size: 0.78rem; margin-top: 4px; }
	:global(.lp-link) { display: inline-block; margin-top: 6px; color: #1a56db; font-size: 0.8rem; }
</style>
