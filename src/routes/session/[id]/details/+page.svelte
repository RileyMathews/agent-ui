<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { SessionInfo, SessionMessageInfo } from '@opencode/client';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
	import { getAllMessages } from '$lib/messages';
	const sessionID = page.params.id;
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const threadHref = server && project ? sessionHref(sessionID ?? '', server.id, project.id) : '/';
	let session = $state<SessionInfo>();
	let messages = $state<SessionMessageInfo[]>([]);
	let diffs = $state<{ file: string; additions: number; deletions: number }[]>([]);
	let error = $state<string>();
	onMount(() => {
		if (!sessionID || !server) return error = 'The session link is missing its server.';
		const client = getOpencode(server.url);
		void Promise.all([client.session.get({ sessionID }), getAllMessages(client, sessionID), client.session.diff({ sessionID })]).then(([loaded, history, changes]) => { session = loaded; messages = history; diffs = changes; }).catch((cause) => error = cause instanceof Error ? cause.message : 'Unable to load session details.');
	});
</script>
<main>
	<a href={threadHref}>← Back to thread</a>
	<h1>{session?.title ?? 'Session details'}</h1>
	{#if error}<p class="error">{error}</p>{:else if !session}<p>Loading session details…</p>{:else}
		<section><strong>{session.tokens.input + session.tokens.output + session.tokens.reasoning + session.tokens.cache.read + session.tokens.cache.write}</strong><span>total tokens</span><strong>${session.cost.toFixed(4)}</strong><span>recorded spend</span><strong>{messages.filter((message) => message.type === 'assistant').length}</strong><span>assistant responses</span></section>
		<h2>Changed files</h2>{#if diffs.length}<ul>{#each diffs as diff (diff.file)}<li>{diff.file} <b>+{diff.additions}</b> / −{diff.deletions}</li>{/each}</ul>{:else}<p>No changes recorded.</p>{/if}
		<h2>Session record</h2><dl><div><dt>ID</dt><dd>{session.id}</dd></div><div><dt>Directory</dt><dd>{session.location.directory}</dd></div><div><dt>Agent</dt><dd>{session.agent ?? 'Default'}</dd></div><div><dt>Model</dt><dd>{session.model ? `${session.model.providerID}/${session.model.id}` : 'Default'}</dd></div></dl>
	{/if}
</main>
<style>main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; } a { color: var(--color-accent); } h1 { font-size: 2.4rem; } section { display: grid; grid-template-columns: 1fr 1fr; gap: .3rem 1rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: .8rem; } section strong { font-size: 1.4rem; } section span, p, dd { color: var(--color-muted); } .error { color: var(--color-error); } ul { padding-left: 1.2rem; } li { padding: .4rem 0; } b { color: var(--color-accent); } dl div { display: grid; grid-template-columns: 6rem 1fr; padding: .5rem 0; border-top: 1px solid var(--color-border); } dd { margin: 0; overflow-wrap: anywhere; }</style>
