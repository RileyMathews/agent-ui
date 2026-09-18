<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { SessionMessageInfo } from '@opencode/client';
	import Markdown from '$lib/Markdown.svelte';
	import { getProject, getServer } from '$lib/config';
	import { getOpencode } from '$lib/opencode';

	let { subAgent = false }: { subAgent?: boolean } = $props();
	const parentSessionID = page.params.id;
	const sessionID = $derived(subAgent ? page.params.subAgentID : parentSessionID);
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const query = server && project ? new URLSearchParams({ server: server.id, project: project.id }) : undefined;
	const threadHref = $derived(query ? `/session/${encodeURIComponent(sessionID ?? '')}?${query}` : '/');
	let messages = $state<SessionMessageInfo[]>([]);
	let sessionTitle = $state('Session history');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let connecting = $state(true);
	let showReasoning = $state(false);

	function text(message: SessionMessageInfo) {
		if (message.type === 'user' || message.type === 'synthetic' || message.type === 'system') return message.text;
		if (message.type === 'assistant') return message.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
		return '';
	}

	function reasoning(message: SessionMessageInfo) {
		return message.type === 'assistant' ? message.content.filter((part) => part.type === 'reasoning').map((part) => part.text) : [];
	}

	onMount(() => {
		if (!sessionID || !server || !project) {
			error = 'The session link is missing its project or server.';
			loading = false;
			return;
		}
		const client = getOpencode(server.url);
		let disposed = false;
		let controller: AbortController | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const refresh = async () => {
			try {
				const [session, history] = await Promise.all([client.session.get({ sessionID }), client.message.list({ sessionID, limit: 5000, order: 'asc' })]);
				if (disposed) return;
				sessionTitle = session.title ?? 'Untitled session';
				messages = history.data;
				error = null;
			} catch (cause) {
				if (!disposed) error = cause instanceof Error ? cause.message : 'Unable to load session history.';
			} finally {
				if (!disposed) loading = false;
			}
		};
		const connect = () => {
			controller?.abort();
			if (disposed || document.hidden || !navigator.onLine) return;
			controller = new AbortController();
			connecting = true;
			void (async () => {
				try {
					for await (const event of client.event.subscribe({ signal: controller!.signal })) {
						if (disposed || controller?.signal.aborted) return;
						connecting = false;
						if ('data' in event && event.data && 'sessionID' in event.data && event.data.sessionID === sessionID) void refresh();
					}
				} catch { /* reconnect below */ }
				if (!disposed && !controller?.signal.aborted) timer = setTimeout(connect, 1000);
			})();
		};
		void refresh();
		connect();
		const resume = () => { if (!document.hidden) { void refresh(); connect(); } };
		window.addEventListener('online', resume);
		window.addEventListener('pageshow', resume);
		document.addEventListener('visibilitychange', resume);
		return () => { disposed = true; controller?.abort(); if (timer) clearTimeout(timer); window.removeEventListener('online', resume); window.removeEventListener('pageshow', resume); document.removeEventListener('visibilitychange', resume); };
	});
</script>

<svelte:head><title>{sessionTitle}</title></svelte:head>
<main>
	<nav><a href="/">⌂</a><strong>{sessionTitle}</strong><button type="button" onclick={() => showReasoning = !showReasoning}>Reasoning</button></nav>
	{#if connecting}<p class="connection">Connecting to OpenCode…</p>{/if}
	{#if loading}<p class="status">Loading session history…</p>{:else if error}<p class="status error">{error}</p>{:else}
		<section>{#each messages as message (message.id)}
			{@const body = text(message)}
			<article class:user={message.type === 'user'}>
				{#if showReasoning}{#each reasoning(message) as part}<aside>{part}</aside>{/each}{/if}
				{#if message.type === 'assistant'}<Markdown source={body} />{:else if body}<p>{body}</p>{/if}
				{#if message.type === 'assistant'}{#each message.content.filter((part) => part.type === 'tool') as tool (tool.id)}<small>Tool: {tool.name} · {tool.state.status}</small>{/each}{/if}
			</article>
		{/each}</section>
	{/if}
	<footer><a href={subAgent ? `/session/${parentSessionID}?${query}` : project ? `/project/${project.id}` : '/'}>← Back</a><a href={`${threadHref}/prompt`}>Follow up →</a></footer>
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 0 1rem 5.5rem; }
	nav, footer { position: sticky; z-index: 2; display: flex; align-items: center; gap: .65rem; padding: .7rem 0; background: var(--color-background); } nav { top: 0; } footer { position: fixed; right: 1rem; bottom: 0; left: 1rem; justify-content: space-between; }
	nav strong { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } a, button { color: var(--color-text); font: inherit; text-decoration: none; } nav a, nav button, footer a { padding: .65rem .8rem; border: 1px solid var(--color-border); border-radius: .6rem; background: var(--color-panel); } footer a:last-child { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-background); font-weight: 800; }
	.connection, .status { padding: .8rem; border: 1px solid var(--color-border); border-radius: .7rem; color: var(--color-muted); } .error { color: var(--color-error); } section { display: grid; gap: 1.2rem; } article { min-width: 0; } article.user { justify-self: end; max-width: 88%; padding: .8rem 1rem; border-radius: 1rem 1rem .2rem; background: #1677e8; color: white; } p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; } aside { margin: 0 0 .6rem; padding: .65rem; border-radius: .6rem; background: #201d29; color: #d4c6ec; white-space: pre-wrap; } small { display: block; margin-top: .5rem; color: var(--color-muted); font-family: ui-monospace, monospace; } @media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } footer { right: max(1.5rem, calc((100% - 43rem) / 2)); left: max(1.5rem, calc((100% - 43rem) / 2)); } }
</style>
