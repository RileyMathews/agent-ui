<script lang="ts">
	import { page } from '$app/state';

	const directory = $derived(page.url.searchParams.get('directory'));
</script>

<svelte:head>
	<title>New chat</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<header>
		<a class="back" href="/new">Choose another directory</a>
		<p class="eyebrow">New thread</p>
		<h1>New chat</h1>
	</header>

	{#if directory}
		<section>
			<p>Directory</p>
			<strong>{directory}</strong>
			<span>Chat creation is coming next.</span>
		</section>
	{:else}
		<section class="error">
			<strong>No directory selected.</strong>
			<a href="/new">Choose a directory</a>
		</section>
	{/if}
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; min-width: 20rem; background: #111315; color: #f1f3f3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 1.75rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	a:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	section { display: grid; gap: 0.6rem; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; }
	section p { margin: 0; color: #788382; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
	section strong { overflow-wrap: anywhere; font-family: ui-monospace, monospace; font-size: 0.85rem; line-height: 1.5; }
	section span { color: #aeb8b7; font-size: 0.85rem; }
	section.error { border-color: #603638; color: #ffb4b8; }
	section a { width: fit-content; color: #79ddc0; font-size: 0.85rem; }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
