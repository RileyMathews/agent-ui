<script lang="ts">
	import { onMount } from 'svelte';
	import { listSessions } from '$lib/sessions';

	type Directory = {
		path: string;
		updated: number;
	};

	let directories = $state<Directory[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);

	function directoryName(path: string) {
		return path.split('/').filter(Boolean).at(-1) ?? path;
	}

	onMount(async () => {
		try {
			const unique = new Map<string, Directory>();

			for (const session of await listSessions()) {
				const path = session.location.directory;
				if (!path || unique.has(path)) continue;
				unique.set(path, { path, updated: session.time.updated });
			}

			directories = [...unique.values()].sort((left, right) => right.updated - left.updated);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load directories.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Choose a directory</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<header>
		<a class="back" href="/">Back to sessions</a>
		<p class="eyebrow">New thread</p>
		<h1>Choose a directory</h1>
		<p class="intro">Select a directory where you have already used OpenCode.</p>
	</header>

	{#if loading}
		<p class="status">Loading directories...</p>
	{:else if error}
		<p class="status error">{error}</p>
	{:else if directories.length === 0}
		<p class="status">No directories with sessions found.</p>
	{:else}
		<ul>
			{#each directories as directory (directory.path)}
				<li>
					<a href={`/new/chat?directory=${encodeURIComponent(directory.path)}`}>
						<strong>{directoryName(directory.path)}</strong>
						<span>{directory.path}</span>
						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; min-width: 20rem; background: #111315; color: #f1f3f3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 1.75rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	.back:focus-visible, li a:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	.intro { margin: 0.9rem 0 0; color: #aeb8b7; font-size: 0.9rem; line-height: 1.5; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; color: #aeb8b7; }
	.error { border-color: #603638; color: #ffb4b8; }
	ul { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
	li { overflow: hidden; border: 1px solid #2c3334; border-radius: 0.75rem; background: #191d1f; }
	li a { position: relative; display: grid; gap: 0.3rem; padding: 1rem 3rem 1rem 1rem; color: inherit; text-decoration: none; }
	strong { font-size: 1rem; letter-spacing: -0.015em; }
	span { color: #8e9998; font-family: ui-monospace, monospace; font-size: 0.72rem; overflow-wrap: anywhere; }
	.arrow { position: absolute; top: 50%; right: 1rem; color: #79ddc0; font-family: inherit; font-size: 1.15rem; transform: translateY(-50%); }
	@media (hover: hover) { li:hover { border-color: #4a5956; background: #1d2224; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } li a { padding: 1.15rem 3.25rem 1.15rem 1.25rem; } }
</style>
