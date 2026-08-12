<script lang="ts">
	import { onMount } from 'svelte';
	import type { Server } from '$lib/config';
	import { projects, servers, sessionHref } from '$lib/config';
	import { getOpencodeV2 } from '$lib/opencode';
	import { isWorking, loadProjectServer, type ProjectServerState } from '$lib/sessions';

	type ProjectState = {
		servers: ProjectServerState[];
	};

	let projectsState = $state<Record<string, ProjectState>>({});
	let loading = $state(true);
	let refreshing = $state(false);
	let selected = $state<Set<string>>(new Set());
	let archiving = $state(false);
	let archiveError = $state('');
	const currentSessions = $derived(
		projects
			.flatMap((project) => (projectsState[project.id]?.servers ?? [])
				.flatMap((state) => state.sessions
					.filter((session) => session.time.archived === undefined)
					.map((session) => ({ project, state, session }))))
			.sort((left, right) => right.session.time.updated - left.session.time.updated)
	);
	const allCurrentSelected = $derived(
		currentSessions.length > 0 && currentSessions.every((item) => selected.has(sessionKey(item)))
	);
	const someCurrentSelected = $derived(
		currentSessions.some((item) => selected.has(sessionKey(item)))
	);

	function formatDate(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
	}

	function sessionKey(item: (typeof currentSessions)[number]) {
		return `${item.project.id}:${item.state.server.id}:${item.session.id}`;
	}

	function selectSession(key: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(key);
		else next.delete(key);
		selected = next;
		archiveError = '';
	}

	function selectAllCurrent(checked: boolean) {
		selected = checked ? new Set(currentSessions.map(sessionKey)) : new Set();
		archiveError = '';
	}

	async function archiveSelected() {
		if (archiving) return;
		const items = currentSessions.filter((item) => selected.has(sessionKey(item)));
		if (items.length === 0) return;

		archiving = true;
		archiveError = '';
		const archived = Date.now();
		const results = await Promise.allSettled(items.map((item) =>
			getOpencodeV2(item.state.server.url).session.update({
				sessionID: item.session.id,
				directory: item.project.directory,
				time: { archived }
			})
		));
		const succeeded = new Set(items.filter((_, index) => results[index].status === 'fulfilled').map(sessionKey));

		projectsState = Object.fromEntries(Object.entries(projectsState).map(([projectID, projectState]) => [
			projectID,
			{
				servers: projectState.servers.map((state) => ({
					...state,
					sessions: state.sessions.map((session) => succeeded.has(`${projectID}:${state.server.id}:${session.id}`)
						? { ...session, time: { ...session.time, archived } }
						: session)
				}))
			}
		]));
		selected = new Set([...selected].filter((key) => !succeeded.has(key)));
		const failed = results.length - succeeded.size;
		if (failed > 0) archiveError = `${failed} ${failed === 1 ? 'session' : 'sessions'} could not be archived. Try again.`;
		archiving = false;
	}

	function activeCount(projectID: string) {
		return (projectsState[projectID]?.servers ?? []).reduce(
			(total, server) => total + server.sessions.filter((session) => session.time.archived === undefined && isWorking(server.statuses, session.id)).length,
			0
		);
	}

	function sessionCount(projectID: string) {
		return (projectsState[projectID]?.servers ?? []).reduce(
			(total, server) => total + server.sessions.filter((session) => session.time.archived === undefined).length,
			0
		);
	}

	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		const entries = await Promise.all(projects.map(async (project) => [
			project.id,
			{ servers: await Promise.all(servers.map((server) => loadProjectServer(project, server))) }
		] as const));
		projectsState = Object.fromEntries(entries);
		loading = false;
		refreshing = false;
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

	function terminalHref(server: Server) {
		return `/terminal?${new URLSearchParams({ server: server.id, directory: server.home, returnTo: '/' })}`;
	}
</script>

<svelte:head><title>Dashboard</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
		<header>
			<div><p class="eyebrow">OpenCode fleet</p><h1>Dashboard</h1></div>
			<button type="button" onclick={refresh} disabled={refreshing}>{refreshing && !loading ? 'Refreshing' : 'Refresh'}</button>
	</header>

		{#if loading}
			<p class="status">Checking projects across {servers.length} servers...</p>
		{:else}
			<section class="current" aria-labelledby="current-heading">
				<div class="section-heading">
					<div><p class="eyebrow">Across the fleet</p><h2 id="current-heading">Current sessions</h2></div>
					<span>{currentSessions.length}</span>
				</div>
				{#if currentSessions.length === 0}
					<p class="status">No current sessions.</p>
				{:else}
					<div class="session-actions">
						<label class="select-all">
							<input
								type="checkbox"
								checked={allCurrentSelected}
								indeterminate={someCurrentSelected && !allCurrentSelected}
								onchange={(event) => selectAllCurrent(event.currentTarget.checked)}
							/>
							<span>Select all</span>
						</label>
						{#if selected.size > 0}
							<button class="archive" type="button" onclick={archiveSelected} disabled={archiving}>
								{archiving ? 'Archiving...' : `Archive (${selected.size})`}
							</button>
						{/if}
					</div>
					{#if archiveError}<p class="archive-error" role="alert">{archiveError}</p>{/if}
					<ul class="current-list">
						{#each currentSessions as item (sessionKey(item))}
							<li class:working={isWorking(item.state.statuses, item.session.id)}>
								<label class="session-select" aria-label={`Select ${item.session.title || 'Untitled session'}`}>
									<input
										type="checkbox"
										checked={selected.has(sessionKey(item))}
										onchange={(event) => selectSession(sessionKey(item), event.currentTarget.checked)}
									/>
								</label>
								<a href={sessionHref(item.session.id, item.state.server.id, item.project.id)}>
									<div><strong>{item.session.title || 'Untitled session'}</strong>{#if isWorking(item.state.statuses, item.session.id)}<span class="spinner" aria-label="Agent working"></span>{/if}</div>
									<p class="metadata"><span>{item.project.name} / {item.state.server.name}</span><time>{formatDate(item.session.time.updated)}</time></p>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="hosts" aria-labelledby="hosts-heading">
				<div class="section-heading">
					<div><p class="eyebrow">Home directories</p><h2 id="hosts-heading">Hosts</h2></div>
					<span>{servers.length}</span>
				</div>
				<ul class="host-list">
					{#each servers as server (server.id)}
						<li>
							<a class="host" href={terminalHref(server)}>
								<div class="host-details">
									<strong>{server.name}</strong>
									<span>{server.home}</span>
								</div>
								<b>Terminal &gt;_</b>
							</a>
						</li>
					{/each}
				</ul>
			</section>

			<div class="section-heading projects-heading"><div><p class="eyebrow">Configured worktrees</p><h2>Projects</h2></div></div>
			<ul class="projects">
			{#each projects as project (project.id)}
				{@const active = activeCount(project.id)}
				{@const total = sessionCount(project.id)}
				<li class:working={active > 0}>
					<a class="project" href={`/project/${project.id}`}>
						<div class="title-row">
							<div>
								<h2>{project.name}</h2>
								{#if project.parentName}<small class="parent">{project.parentName} subproject</small>{/if}
								<p>{active} active {active === 1 ? 'session' : 'sessions'}</p>
							</div>
							<span>{total} total</span>
						</div>
						<div class="server-list">
							{#each projectsState[project.id]?.servers ?? [] as server (server.server.id)}
								{@const currentSessions = server.sessions.filter((session) => session.time.archived === undefined)}
								{@const running = currentSessions.filter((session) => isWorking(server.statuses, session.id)).length}
								<div class:active={running > 0} class:unavailable={!server.available} class:error={!!server.error}>
									<span class="dot"></span>
									<span class="server-details">
										<strong>{server.server.name}</strong>
										{#if server.git}
											<span class:dirty={server.git.dirty} title={server.git.branch ?? 'Detached HEAD'}>
												<b aria-hidden="true">{server.git.dirty ? '●' : '✓'}</b>
												<span class="sr-only">{server.git.dirty ? 'Dirty worktree,' : 'Clean worktree,'}</span>
												{server.git.branch ?? 'detached'}
											</span>
										{:else if server.available}
											<span class="git-unavailable">? status unavailable</span>
										{/if}
									</span>
									<small>{server.error ? 'unreachable' : !server.available ? 'not checked out' : server.sessionError ? 'sessions unavailable' : running ? `${running} running` : `${currentSessions.length} sessions`}</small>
								</div>
							{/each}
						</div>
					</a>
					<a class="new" href={`/new?project=${project.id}`}>New thread</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 2.5rem 1rem 3rem; }
	header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
	.eyebrow { margin: 0 0 0.4rem; color: var(--color-accent); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 0.95; }
	header button { min-height: 2.6rem; padding: 0 0.8rem; border: 1px solid #343c3d; border-radius: 0.65rem; background: #242a2b; color: #d8dfdd; font: inherit; font-size: 0.78rem; font-weight: 700; }
	button:disabled { opacity: 0.55; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-panel); color: var(--color-muted); }
	.current { margin-bottom: 2.25rem; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 0.8rem; }
	.section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -0.035em; }
	.section-heading > span { padding: 0.25rem 0.5rem; border-radius: 99px; background: #23292a; color: #8f9a98; font-size: 0.68rem; }
	.projects-heading { margin-bottom: 0.8rem; }
	.hosts { margin-bottom: 2.25rem; }
	.host-list { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
	.host-list li { overflow: hidden; border: 1px solid #303738; border-radius: 0.9rem; background: var(--color-surface); }
	.host { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.15rem; }
	.host-details { display: grid; min-width: 0; gap: 0.2rem; }
	.host-details strong { color: #cbd3d2; font-family: ui-monospace, monospace; font-size: 0.82rem; }
	.host-details span { color: #71807d; font-family: ui-monospace, monospace; font-size: 0.7rem; }
	.host b { flex: 0 0 auto; color: var(--color-accent); font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
	.session-actions { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; margin-bottom: 0.65rem; }
	.select-all { display: flex; align-items: center; gap: 0.45rem; color: var(--color-muted); font-size: 0.72rem; font-weight: 700; }
	input[type='checkbox'] { width: 1.05rem; height: 1.05rem; margin: 0; accent-color: var(--color-accent); }
	.archive { min-height: 2.2rem; padding: 0 0.7rem; border: 1px solid #725253; border-radius: 0.55rem; background: #382526; color: #ffd5d7; font: inherit; font-size: 0.72rem; font-weight: 800; }
	.archive-error { margin: 0 0 0.65rem; color: var(--color-error); font-size: 0.75rem; }
	.current-list { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
	.current-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); overflow: hidden; border: 1px solid var(--color-border); border-radius: 0.7rem; background: var(--color-surface); }
	.current-list li.working { border-color: #315d72; }
	.session-select { display: grid; align-items: start; padding: 1.05rem 0 1rem 0.85rem; }
	.current-list a { display: grid; gap: 0.55rem; padding: 0.95rem; }
	.current-list a > div { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
	.current-list strong { font-size: 0.9rem; line-height: 1.35; }
	.metadata { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin: 0; color: #7f8a88; font-size: 0.7rem; }
	.metadata span { color: #9eaaa8; font-family: ui-monospace, monospace; }
	.projects { display: grid; gap: 0.8rem; margin: 0; padding: 0; list-style: none; }
	.projects > li { overflow: hidden; border: 1px solid #303738; border-radius: 0.9rem; background: var(--color-surface); }
	.projects > li.working { border-color: #315d72; box-shadow: 0 0 0 1px rgb(88 170 245 / 0.08) inset; }
	a { color: inherit; text-decoration: none; }
	.project { display: block; padding: 1.15rem; }
	.title-row { display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
	h2 { margin: 0; font-size: 1.2rem; letter-spacing: -0.025em; }
	.parent { display: block; margin-top: 0.18rem; color: #7e8987; font-size: 0.65rem; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; }
	.title-row p { margin: 0.25rem 0 0; color: var(--color-accent); font-size: 0.82rem; font-weight: 650; }
	.title-row > span { flex: 0 0 auto; padding: 0.25rem 0.5rem; border-radius: 99px; background: #23292a; color: #8f9a98; font-size: 0.68rem; }
	.server-list { display: grid; gap: 0.45rem; }
	.server-list > div { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; min-height: 2.25rem; padding: 0.45rem 0.6rem; border-radius: 0.55rem; background: #141819; }
	.server-details { display: grid; min-width: 0; gap: 0.14rem; }
	.server-details > strong, .server-details > span { overflow: hidden; font-family: ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
	.server-details > strong { color: #cbd3d2; font-size: 0.72rem; }
	.server-details > span { color: #71807d; font-size: 0.64rem; }
	.server-details > span.dirty { color: #e4ad67; }
	.server-details b { margin-right: 0.25rem; font-size: 0.57rem; }
	.server-details .git-unavailable { color: #9a7e4c; }
	.server-list small { color: #778280; font-size: 0.67rem; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: #65716f; }
	.active .dot { background: #58aaf5; box-shadow: 0 0 0 0.2rem rgb(88 170 245 / 0.12); }
	.active small { color: #72bdff; }
	.unavailable .dot { background: #9a7e4c; }
	.error .dot { background: #b15c61; }
	.new { display: block; padding: 0.75rem 1rem; border-top: 1px solid #2b3233; color: #9fb0ad; font-size: 0.78rem; font-weight: 700; text-align: center; }
	.spinner { flex: 0 0 auto; width: 0.9rem; height: 0.9rem; margin-top: 0.1rem; border: 2px solid #304c64; border-top-color: #72bdff; border-radius: 50%; animation: spin 0.8s linear infinite; }
	a:focus-visible, button:focus-visible, input:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (hover: hover) { .project:hover, .current-list li:hover { background: #1d2224; } .new:hover { color: var(--color-accent); } .host:hover { background: #1d2224; } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
