<script>
	let { children } = $props();
</script>

<div class="app">
	{@render children()}
</div>

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(html, body) {
		height: 100%;
		margin: 0;
		padding: 0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.app {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}
</style>
