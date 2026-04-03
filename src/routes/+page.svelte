<script lang="ts">
	import Map from '$lib/Map.svelte';

	type Listing = Record<string, string>;

	let listings: Listing[] = $state([]);
	let statusMsg = $state('');
	let errorMsg = $state('');

	// ── color scale ──────────────────────────────────────────────
	const COLOR_OPTIONS = [
		{ value: 'none',          label: '— none —',    step: 1 },
		{ value: 'price',         label: 'Price',       step: 5000 },
		{ value: 'price_per_sqft',label: '$ / sqft',    step: 5 },
		{ value: 'year_built',    label: 'Build year',  step: 1 },
		{ value: 'lot_acres',     label: 'Lot acres',   step: 0.1 },
	];

	let colorParam = $state('none');
	let colorMin = $state(0);
	let colorMax = $state(1);

	const colorStep = $derived(
		COLOR_OPTIONS.find((o) => o.value === colorParam)?.step ?? 1
	);

	function setRangeFromData(param: string, data: Listing[]) {
		if (param === 'none' || data.length === 0) return;
		const values = data
			.map((l) => parseFloat(l[param] ?? ''))
			.filter((v) => !isNaN(v) && v > 0);
		if (values.length === 0) return;
		colorMin = Math.floor(Math.min(...values));
		colorMax = Math.ceil(Math.max(...values));
	}

	function onParamChange() {
		setRangeFromData(colorParam, listings);
	}

	function parseCSV(text: string): Listing[] {
		const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
		if (lines.length < 2) return [];

		const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

		return lines
			.slice(1)
			.filter((l) => l.trim())
			.map((line) => {
				const fields = splitCSVLine(line);
				return Object.fromEntries(headers.map((h, i) => [h, (fields[i] ?? '').trim()]));
			});
	}

	function splitCSVLine(line: string): string[] {
		const fields: string[] = [];
		let inQuote = false;
		let field = '';
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuote && line[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuote = !inQuote;
				}
			} else if (ch === ',' && !inQuote) {
				fields.push(field);
				field = '';
			} else {
				field += ch;
			}
		}
		fields.push(field);
		return fields;
	}

	// Redfin mislabels column 9 as "URL" — it's actually BEDS.
	// The real listing URL is in the long "URL (SEE ...)" column.
	function normalizeRedfin(raw: Listing): Listing {
		const lotSqft = parseFloat(raw['lot size'] ?? '');
		const lotAcres = isNaN(lotSqft) ? '' : (lotSqft / 43560).toFixed(2);

		const urlKey = Object.keys(raw).find((k) => k.startsWith('url (see'));
		const link = urlKey ? raw[urlKey] : '';

		return {
			lat: raw['latitude'] ?? '',
			lng: raw['longitude'] ?? '',
			address: [raw['address'], raw['city'], raw['state or province'], raw['zip or postal code']]
				.filter(Boolean)
				.join(', '),
			link,
			sqft: raw['square feet'] ?? '',
			lot_acres: lotAcres,
			beds: raw['url'] ?? '', // mislabeled column 9
			baths: raw['baths'] ?? '',
			year_built: raw['year built'] ?? '',
			price: raw['price'] ?? '',
			price_per_sqft: raw['$/square feet'] ?? '',
			hoa: raw['hoa/month'] ?? '',
			status: raw['status'] ?? ''
		};
	}

	function isRedfinExport(rows: Listing[]): boolean {
		return rows.length > 0 && 'sale type' in rows[0] && 'lot size' in rows[0];
	}

	function handleFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		errorMsg = '';
		statusMsg = '';

		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				// Redfin exports have a disclaimer row as row 2 — filter out rows with no coordinates
				let parsed = parseCSV(ev.target?.result as string);

				if (isRedfinExport(parsed)) {
					parsed = parsed.map(normalizeRedfin);
				}

				const valid = parsed.filter((r: Listing) => {
					const lat = parseFloat(r.lat ?? r.latitude ?? '');
					const lng = parseFloat(r.lng ?? r.lon ?? r.longitude ?? '');
					return !isNaN(lat) && !isNaN(lng);
				});

				listings = valid;
				setRangeFromData(colorParam, valid);
				if (valid.length === 0) {
					errorMsg = 'No rows with valid lat/lng found. Check your column names.';
				} else {
					statusMsg = `${valid.length} listing${valid.length !== 1 ? 's' : ''} loaded`;
					if (valid.length < parsed.length) {
						statusMsg += ` (${parsed.length - valid.length} skipped — missing coords)`;
					}
				}
			} catch {
				errorMsg = 'Could not parse file.';
			}
		};
		reader.readAsText(file);
	}
</script>

<svelte:head>
	<title>homefree</title>
</svelte:head>

<div class="shell">
	<header class="toolbar">
		<span class="brand">homefree</span>

		<label class="btn-load">
			Load CSV
			<input type="file" accept=".csv,text/csv" onchange={handleFile} />
		</label>

		<a class="sample-link" href="/redfin_2026-03-28-06-58-34.csv" download>sample CSV</a>

		{#if statusMsg}
			<span class="status ok">{statusMsg}</span>
		{/if}
		{#if errorMsg}
			<span class="status err">{errorMsg}</span>
		{/if}

		{#if listings.length > 0}
			<div class="color-row">
				<label class="ctrl-label">
					Color by
					<select bind:value={colorParam} onchange={onParamChange}>
						{#each COLOR_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</label>

				{#if colorParam !== 'none'}
					<div class="range-control">
						<span class="swatch" style="background:hsl(120,80%,38%)"></span>
						<input class="range-input" type="number" bind:value={colorMin} step={colorStep} />
						<div class="gradient-bar"></div>
						<input class="range-input" type="number" bind:value={colorMax} step={colorStep} />
						<span class="swatch" style="background:hsl(0,80%,38%)"></span>
					</div>
				{/if}
			</div>
		{/if}
	</header>

	<div class="map-wrap">
		<Map {listings} {colorParam} {colorMin} {colorMax} />
	</div>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.45rem 1rem;
		background: #fff;
		border-bottom: 1px solid #ddd;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.brand {
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: -0.03em;
		color: #111;
		margin-right: 0.25rem;
	}

	.btn-load {
		display: inline-block;
		padding: 0.3rem 0.8rem;
		background: #111;
		color: #fff;
		border-radius: 5px;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 500;
		user-select: none;
		transition: background 0.15s;
	}
	.btn-load:hover {
		background: #333;
	}
	.btn-load input[type='file'] {
		display: none;
	}

	.sample-link {
		font-size: 0.78rem;
		color: #666;
		text-decoration: underline dotted;
	}
	.sample-link:hover {
		color: #111;
	}

	.status {
		font-size: 0.78rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}
	.status.ok {
		color: #1a6e1a;
		background: #eaf5ea;
	}
	.status.err {
		color: #8b1a1a;
		background: #fdecea;
	}

	.map-wrap {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.color-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.3rem 0;
		flex-wrap: wrap;
	}

	.ctrl-label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #555;
	}
	.ctrl-label select {
		font-size: 0.8rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 0.2rem 0.3rem;
		background: #fff;
	}

	.range-control {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.range-input {
		width: 7rem;
		font-size: 0.8rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 0.2rem 0.35rem;
		text-align: right;
	}

	.gradient-bar {
		width: 80px;
		height: 10px;
		border-radius: 3px;
		background: linear-gradient(to right, hsl(120, 80%, 38%), hsl(60, 80%, 38%), hsl(0, 80%, 38%));
		flex-shrink: 0;
	}
</style>
