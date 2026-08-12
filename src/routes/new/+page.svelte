<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getProject, projects, servers } from '$lib/config';
	import { checkProject, loadInParallel, type ProjectAvailability, type ServerLoad } from '$lib/sessions';

	let projectID = $state(page.url.searchParams.get('project') ?? '');
	let serverStates = $state<Record<string, ServerLoad<ProjectAvailability>>>({});
	let request = 0;
	const project = $derived(getProject(projectID));
	const pendingCount = $derived(
		servers.filter((server) => (serverStates[server.id]?.status ?? 'pending') === 'pending').length
	);

	async function checkServers() {
		const selected = getProject(projectID);
		if (!selected) return;
		const activeRequest = ++request;
		serverStates = Object.fromEntries(servers.map((server) => [server.id, { status: 'pending' }]));
		await loadInParallel(
			servers.map((server) => ({ id: server.id, load: () => checkProject(selected, server) })),
			(id, load) => {
				if (activeRequest === request) serverStates = { ...serverStates, [id]: load };
			}
		);
	}

	function selectProject(event: Event) {
		projectID = (event.currentTarget as HTMLSelectElement).value;
		void checkServers();
	}

	onMount(checkServers);
</script>

<svelte:head><title>New thread</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
	<header><a class="back" href={project ? `/project/${project.id}` : '/'}>Back</a><p class="eyebrow">New thread</p><h1>Choose a server</h1><p class="description">Select where this project should run.</p></header>
	<label class="project-label" for="project">Project</label>
	<select id="project" value={projectID} onchange={selectProject}>
		<option value="" disabled>Select a project</option>
		{#each projects as option}<option value={option.id}>{option.parentName ? `${option.parentName} / ${option.name}` : option.name}</option>{/each}
	</select>

	{#if !project}
		<p class="status">Choose a project to check its servers.</p>
	{:else}
		{#if pendingCount > 0}
			<p class="status" aria-live="polite">Checking {pendingCount} server{pendingCount === 1 ? '' : 's'} on {project.name}...</p>
		{/if}
		<ul>
			{#each servers as server (server.id)}
				{@const state = serverStates[server.id] ?? { status: 'pending' }}
				{@const ready = state.status === 'ready' && state.value.available}
				{@const hasError = state.status === 'ready' && !!state.value.error}
				<li class:ready class:error={hasError} class:loading={state.status !== 'ready'}>
					{#if ready}
						<a href={`/new/chat?${new URLSearchParams({ project: project.id, server: state.value.server.id })}`}><strong>{state.value.server.name}</strong><span>{project.directory}</span><b>Continue →</b></a>
					{:else if state.status === 'ready'}
						<div><strong>{state.value.server.name}</strong><span>{hasError ? 'Server is unreachable.' : `No git checkout found at ${project.directory}.`}</span><b>{hasError ? 'Unavailable' : 'Checkout required'}</b></div>
					{:else}
						<div class="pending"><strong>{server.name}</strong><span class="pulse">Checking availability…</span></div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 1.25rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: var(--color-muted); font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	.eyebrow { margin: 0 0 0.4rem; color: var(--color-accent); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	.description { margin: 0.8rem 0 0; color: var(--color-muted); font-size: 0.88rem; }
	.project-label { display: block; margin-bottom: 0.4rem; color: #9ba6a4; font-size: 0.72rem; font-weight: 700; }
	select { width: 100%; min-height: 3rem; margin-bottom: 1rem; padding: 0 0.85rem; border: 1px solid #343c3d; border-radius: 0.7rem; background: var(--color-panel); color: var(--color-text); font: inherit; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-panel); color: var(--color-muted); }
	ul { display: grid; gap: 0.65rem; margin: 0; padding: 0; list-style: none; }
	li { overflow: hidden; border: 1px solid #3a3430; border-radius: 0.75rem; background: var(--color-surface); }
	li.ready { border-color: #34564d; }
	li.error { border-color: #593638; }
	li a, li > div { display: grid; gap: 0.3rem; padding: 1rem; color: inherit; text-decoration: none; }
	li strong { font-family: ui-monospace, monospace; font-size: 0.82rem; }
	li span { color: #899492; font-size: 0.72rem; line-height: 1.4; overflow-wrap: anywhere; }
	li b { margin-top: 0.4rem; color: #ae935f; font-size: 0.7rem; text-transform: uppercase; }
	li.ready b { color: var(--color-accent); }
	li.error b { color: #ff9c9f; }
	li.loading { border-color: #2b3435; }
	li.loading .pending span:last-child { margin-top: 0.25rem; color: #7f8a88; font-size: 0.7rem; animation: pulse 1.4s ease-in-out infinite; }
	a:focus-visible, select:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
	@media (hover: hover) { li.ready:hover { background: #1d2422; } }
	@media (prefers-reduced-motion: reduce) { li.loading .pending span:last-child { animation: none; opacity: 0.6; } }
	@keyframes pulse { 50% { opacity: 0.45; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
