<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getProject, servers, sessionHref } from '$lib/config';
	import { getOpencodeV2 } from '$lib/opencode';
	import { isReady, isWorking, loadInParallel, loadProjectServer, type ProjectServerState, type ServerLoad } from '$lib/sessions';

	const project = getProject(page.params.id);
	let serverStates = $state<Record<string, ServerLoad<ProjectServerState>>>({});
	let showArchived = $state(false);
	let selected = $state<Set<string>>(new Set());
	let archiving = $state(false);
	let archiveError = $state('');
	let request = 0;
	const readyStates = $derived(
		servers
			.map((server) => {
				const load = serverStates[server.id];
				return isReady(load) ? load.value : undefined;
			})
			.filter((state): state is ProjectServerState => state !== undefined)
	);
	const pendingCount = $derived(
		servers.filter((server) => (serverStates[server.id]?.status ?? 'pending') === 'pending').length
	);
	const sessions = $derived(
		readyStates
			.flatMap((state) => state.sessions.map((session) => ({ session, state })))
			.sort((left, right) => right.session.time.updated - left.session.time.updated)
	);
	const visibleSessions = $derived(
		showArchived ? sessions : sessions.filter((item) => item.session.time.archived === undefined)
	);
	const allVisibleSelected = $derived(
		visibleSessions.length > 0 && visibleSessions.every((item) => selected.has(sessionKey(item)))
	);
	const someVisibleSelected = $derived(
		visibleSessions.some((item) => selected.has(sessionKey(item)))
	);
	const serverProblems = $derived(
		readyStates.filter((state) => state.error || !state.available || state.sessionError || state.gitError)
	);

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
	}

	function sessionKey(item: (typeof sessions)[number]) {
		return `${item.state.server.id}:${item.session.id}`;
	}

	function selectSession(key: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(key);
		else next.delete(key);
		selected = next;
		archiveError = '';
	}

	function selectAllVisible(checked: boolean) {
		const next = new Set(selected);
		for (const item of visibleSessions) {
			if (checked) next.add(sessionKey(item));
			else next.delete(sessionKey(item));
		}
		selected = next;
		archiveError = '';
	}

	function setShowArchived(checked: boolean) {
		showArchived = checked;
		if (!checked) {
			const archivedKeys = new Set(sessions
				.filter((item) => item.session.time.archived !== undefined)
				.map(sessionKey));
			selected = new Set([...selected].filter((key) => !archivedKeys.has(key)));
		}
	}

	async function archiveSelected() {
		if (!project || archiving) return;
		const items = sessions.filter((item) => selected.has(sessionKey(item)));
		if (items.length === 0) return;

		archiving = true;
		archiveError = '';
		const archived = Date.now();
		const results = await Promise.allSettled(items.map((item) =>
			getOpencodeV2(item.state.server.url).session.update({
				sessionID: item.session.id,
				directory: project.directory,
				time: { archived }
			})
		));
		const succeeded = new Set(items.filter((_, index) => results[index].status === 'fulfilled').map(sessionKey));

		serverStates = Object.fromEntries(Object.entries(serverStates).map(([id, load]) => [
			id,
			isReady(load)
				? {
						...load,
						value: {
							...load.value,
							sessions: load.value.sessions.map((session) => succeeded.has(`${load.value.server.id}:${session.id}`)
								? { ...session, time: { ...session.time, archived } }
								: session)
						}
					}
				: load
		]));
		selected = new Set([...selected].filter((key) => !succeeded.has(key)));
		const failed = results.length - succeeded.size;
		if (failed > 0) archiveError = `${failed} ${failed === 1 ? 'session' : 'sessions'} could not be archived. Try again.`;
		archiving = false;
	}

	async function refresh() {
		if (!project) return;
		const activeRequest = ++request;
		serverStates = Object.fromEntries(servers.map((server) => [server.id, { status: 'pending' }]));
		await loadInParallel(
			servers.map((server) => ({ id: server.id, load: () => loadProjectServer(project, server) })),
			(id, load) => {
				if (activeRequest === request) serverStates = { ...serverStates, [id]: load };
			}
		);
	}

	onMount(() => {
		const resume = () => {
			if (!document.hidden) void refresh();
		};
		void refresh();
		window.addEventListener('pageshow', resume);
		window.addEventListener('online', resume);
		document.addEventListener('visibilitychange', resume);
		return () => {
			window.removeEventListener('pageshow', resume);
			window.removeEventListener('online', resume);
			document.removeEventListener('visibilitychange', resume);
		};
	});
</script>

<svelte:head><title>{project?.name ?? 'Project'}</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
	<a class="back" href="/">All projects</a>
	{#if !project}
		<p class="status error">Unknown project.</p>
	{:else}
		<header>
			<div><p class="eyebrow">{project.parentName ? `${project.parentName} subproject` : 'Project'}</p><h1>{project.name}</h1></div>
			<a class="new" href={`/new?project=${project.id}`}>New</a>
		</header>
		<div class="project-location"><span>{project.repository}</span><code>{project.directory}</code></div>

		<section class="checkout-list" aria-label="Git checkout status">
			{#each servers as server (server.id)}
				{@const state = serverStates[server.id] ?? { status: 'pending' }}
				{#if isReady(state)}
					{@const value = state.value}
					<div class="checkout" class:dirty={value.git?.dirty} class:unavailable={!value.available || !!value.gitError}>
						<strong>{value.server.name}</strong>
						{#if value.git}
							<code title={value.git.branch ?? 'Detached HEAD'}>{value.git.branch ?? 'detached'}</code>
							<span><b aria-hidden="true">{value.git.dirty ? '●' : '✓'}</b> {value.git.dirty ? `${value.git.changedFiles} changed` : 'clean'}</span>
						{:else}
							<span>{value.error ? 'unreachable' : !value.available ? 'not checked out' : 'status unavailable'}</span>
						{/if}
					</div>
				{:else}
					<div class="checkout loading" aria-busy="true">
						<strong>{server.name}</strong>
						<span class="pulse">checking…</span>
					</div>
				{/if}
			{/each}
		</section>

		{#if sessions.length === 0}
			{#if pendingCount > 0}
				<p class="status" aria-live="polite">Loading sessions from {pendingCount} server{pendingCount === 1 ? '' : 's'}...</p>
			{:else}
				<p class="status">No sessions for this project.</p>
			{/if}
		{:else}
			<div class="session-actions">
					<label class="select-all">
						<input
							type="checkbox"
							checked={allVisibleSelected}
							indeterminate={someVisibleSelected && !allVisibleSelected}
							onchange={(event) => selectAllVisible(event.currentTarget.checked)}
						/>
						<span>Select all</span>
					</label>
					<div class="session-buttons">
						<label class="archived-toggle">
							<input type="checkbox" checked={showArchived} onchange={(event) => setShowArchived(event.currentTarget.checked)} />
							<span>Show archived</span>
						</label>
						{#if selected.size > 0}
							<button class="archive" type="button" onclick={archiveSelected} disabled={archiving}>
								{archiving ? 'Archiving...' : `Archive (${selected.size})`}
							</button>
						{/if}
					</div>
				</div>
				{#if archiveError}<p class="archive-error" role="alert">{archiveError}</p>{/if}
				{#if visibleSessions.length === 0}
					<p class="status">No active sessions. Turn on "Show archived" to view archived sessions.</p>
				{:else}
					<ul>
						{#each visibleSessions as item (sessionKey(item))}
							<li class:working={isWorking(item.state.statuses, item.session.id)} class:archived={item.session.time.archived !== undefined}>
								<label class="session-select" aria-label={`Select ${item.session.title || 'Untitled session'}`}>
									<input
										type="checkbox"
										checked={selected.has(sessionKey(item))}
										onchange={(event) => selectSession(sessionKey(item), event.currentTarget.checked)}
									/>
								</label>
								<a href={sessionHref(item.session.id, item.state.server.id, project.id)}>
									<div><strong>{item.session.title || 'Untitled session'}</strong>{#if isWorking(item.state.statuses, item.session.id)}<span class="spinner" aria-label="Agent working"></span>{/if}</div>
									<p class="metadata"><span>{item.state.server.name}</span><time>{formatDate(item.session.time.updated)}</time></p>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

			{#if serverProblems.length > 0}
				<section class="issues" aria-label="Server issues">
					{#each serverProblems as state (state.server.id)}
						<div class="server-note">
							<strong>{state.server.name}</strong>
							<span>{state.error ? 'Server is unreachable.' : !state.available ? `No git checkout found at ${project.directory}.` : state.sessionError ? 'The checkout is ready, but its sessions could not be loaded.' : 'Git status could not be loaded.'}</span>
						</div>
					{/each}
				</section>
			{/if}
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: var(--color-muted); font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.eyebrow { margin: 0 0 0.4rem; color: var(--color-accent); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 0.95; }
	.new { padding: 0.6rem 0.85rem; border-radius: 0.6rem; background: var(--color-accent); color: var(--color-background); font-size: 0.8rem; font-weight: 800; text-decoration: none; }
	.project-location { display: grid; gap: 0.25rem; margin: 0.8rem 0 1.6rem; color: #75817f; font-family: ui-monospace, monospace; font-size: 0.68rem; overflow-wrap: anywhere; }
	.project-location code { color: #9ba6a4; font: inherit; }
	.checkout-list { display: grid; gap: 0.45rem; margin: -0.7rem 0 1.4rem; }
	.checkout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; min-height: 2.6rem; padding: 0.55rem 0.7rem; border: 1px solid #293132; border-radius: 0.6rem; background: #141819; font-family: ui-monospace, monospace; }
	.checkout strong, .checkout code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.checkout strong { color: #cbd3d2; font-size: 0.72rem; }
	.checkout code { color: #8d9a97; font: inherit; font-size: 0.68rem; }
	.checkout span { color: #79b99f; font-size: 0.66rem; white-space: nowrap; }
	.checkout span b { margin-right: 0.15rem; font-size: 0.57rem; }
	.checkout.dirty span { color: #e4ad67; }
	.checkout.unavailable span { color: #b18d55; }
	.checkout.loading { grid-template-columns: minmax(0, 1fr) auto; }
	.checkout.loading span { color: #7f8a88; animation: pulse 1.4s ease-in-out infinite; }
	.status, .server-note { margin: 0; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-panel); color: var(--color-muted); }
	.status.error { border-color: #603638; color: var(--color-error); }
	.session-actions { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; margin-bottom: 0.65rem; }
	.select-all, .archived-toggle { display: flex; align-items: center; gap: 0.45rem; color: var(--color-muted); font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
	.session-buttons { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 0.55rem; }
	input[type='checkbox'] { width: 1.05rem; height: 1.05rem; margin: 0; accent-color: var(--color-accent); }
	.archive { min-height: 2.2rem; padding: 0 0.7rem; border: 1px solid #725253; border-radius: 0.55rem; background: #382526; color: #ffd5d7; font: inherit; font-size: 0.72rem; font-weight: 800; }
	.archive:disabled { opacity: 0.6; }
	.archive-error { margin: 0 0 0.65rem; color: var(--color-error); font-size: 0.75rem; }
	ul { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: auto minmax(0, 1fr); overflow: hidden; border: 1px solid var(--color-border); border-radius: 0.7rem; background: var(--color-surface); }
	li.working { border-color: #315d72; }
	li.archived { border-left: 0.3rem solid #697170; }
	.session-select { display: grid; align-items: start; padding: 1.05rem 0 1rem 0.85rem; }
	li a { display: grid; gap: 0.55rem; padding: 0.95rem; color: inherit; text-decoration: none; }
	li a > div { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
	li strong { font-size: 0.9rem; line-height: 1.35; }
	.metadata { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin: 0; color: #7f8a88; font-size: 0.7rem; }
	.metadata span { color: #9eaaa8; font-family: ui-monospace, monospace; }
	.issues { display: grid; gap: 0.5rem; margin-top: 1.4rem; }
	.server-note { display: grid; gap: 0.3rem; padding: 0.8rem 0.9rem; font-size: 0.75rem; line-height: 1.45; }
	.server-note strong { color: #c3ccca; font-family: ui-monospace, monospace; font-size: 0.72rem; }
	.spinner { flex: 0 0 auto; width: 0.9rem; height: 0.9rem; margin-top: 0.1rem; border: 2px solid #304c64; border-top-color: #72bdff; border-radius: 50%; animation: spin 0.8s linear infinite; }
	a:focus-visible, button:focus-visible, input:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@keyframes pulse { 50% { opacity: 0.45; } }
	@media (hover: hover) { li:hover { border-color: #4a5956; background: #1d2224; } li.archived:hover { border-left-color: #697170; } }
	@media (prefers-reduced-motion: reduce) { .spinner, .checkout.loading span { animation: none; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
