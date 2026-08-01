	<script lang="ts">
	import { onMount } from 'svelte';
	import type { SessionV2Info } from '@opencode-ai/sdk/v2/client';
	import { listSessions } from '$lib/sessions';

	let sessions = $state<SessionV2Info[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(timestamp));
	}

	function formatDirectory(directory: string) {
		return directory.split('/').filter(Boolean).at(-1) ?? directory;
	}

	onMount(async () => {
		try {
			sessions = (await listSessions())
				.filter((session) => !session.parentID && session.time.archived === undefined)
				.sort((left, right) => right.time.updated - left.time.updated);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load sessions.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Sessions</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<header>
		<div>
			<p class="eyebrow">OpenCode</p>
			<h1>Sessions</h1>
		</div>
		<div class="header-actions">
			{#if !loading && !error}
				<p class="count">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</p>
			{/if}
			<a class="new" href="/new">New</a>
		</div>
	</header>

	{#if loading}
		<p class="status">Loading sessions...</p>
	{:else if error}
		<p class="status error">{error}</p>
	{:else if sessions.length === 0}
		<p class="status">No sessions found.</p>
	{:else}
		<ul>
			{#each sessions as session (session.id)}
				<li>
					<a href={`/session/${encodeURIComponent(session.id)}`}>
						<h2>{session.title || 'Untitled session'}</h2>
						<dl>
							<div><dt>Updated</dt><dd>{formatDate(session.time.updated)}</dd></div>
							<div><dt>Directory</dt><dd>{formatDirectory(session.location.directory)}</dd></div>
						</dl>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-width: 20rem;
		background: #111315;
		color: #f1f3f3;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2.5rem 1rem 3rem;
	}

	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}

	.eyebrow {
		margin: 0 0 0.4rem;
		color: #79ddc0;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 8vw, 2.75rem);
		letter-spacing: -0.055em;
		line-height: 0.95;
	}

	.count {
		margin: 0 0 0.1rem;
		padding: 0.3rem 0.55rem;
		border: 1px solid #33393b;
		border-radius: 999px;
		color: #aeb8b7;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.new {
		padding: 0.55rem 0.8rem;
		border-radius: 0.55rem;
		background: #79ddc0;
		color: #111315;
		font-size: 0.8rem;
		font-weight: 750;
	}

	.status {
		margin: 0;
		padding: 1rem 1.1rem;
		border: 1px solid #2c3334;
		border-radius: 0.75rem;
		background: #1a1e20;
		color: #aeb8b7;
	}

	.error {
		border-color: #603638;
		color: #ffb4b8;
	}

	ul {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
		overflow: hidden;
		border: 1px solid #2c3334;
		border-radius: 0.75rem;
		background: #191d1f;
		box-shadow: 0 1px 0 rgb(255 255 255 / 0.025) inset;
	}

	li a {
		display: block;
		padding: 1.15rem;
		color: inherit;
		text-decoration: none;
	}

	a:focus-visible {
		outline: 2px solid #79ddc0;
		outline-offset: -2px;
	}

	@media (hover: hover) {
		li:hover {
			border-color: #4a5956;
			background: #1d2224;
		}
	}

	li::before {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 3px;
		background: #4fb99a;
		content: '';
	}

	h2 {
		margin: 0 0 1rem;
		color: #f6f7f7;
		font-size: 1rem;
		font-weight: 650;
		letter-spacing: -0.015em;
		line-height: 1.35;
	}

	dl {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
		margin: 0;
	}

	dl div {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}

	dt {
		color: #788382;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		color: #c0c9c8;
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	@media (min-width: 40rem) {
		main {
			padding-right: 1.5rem;
			padding-left: 1.5rem;
		}

		li a {
			padding: 1.25rem 1.35rem;
		}
	}
</style>
