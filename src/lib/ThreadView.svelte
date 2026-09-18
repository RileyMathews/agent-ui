<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { FormInfo, SessionMessageInfo } from '@opencode/client';
	import Markdown from '$lib/Markdown.svelte';
	import { getProject, getServer } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
	import { goto } from '$app/navigation';

	let { subAgent = false }: { subAgent?: boolean } = $props();
	const parentSessionID = page.params.id;
	const sessionID = $derived(subAgent ? page.params.subAgentID : parentSessionID);
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const query = server && project ? new URLSearchParams({ server: server.id, project: project.id }) : undefined;
	const threadHref = $derived(query ? `/session/${encodeURIComponent(sessionID ?? '')}?${query}` : '/');
	const formsHref = $derived(query ? `/session/${encodeURIComponent(sessionID ?? '')}/questions?${query}` : '/');
	let messages = $state<SessionMessageInfo[]>([]);
	let sessionTitle = $state('Session history');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let connecting = $state(true);
	let showReasoning = $state(false);
	let forms = $state<FormInfo[]>([]);
	let deleting = $state(false);
	let deleteError = $state('');

	async function deleteSession() {
		if (!server || !sessionID || deleting || !confirm(`Permanently delete “${sessionTitle}”? This cannot be undone.`)) return;
		deleting = true; deleteError = '';
		try { await getOpencode(server.url).session.remove({ sessionID }); await goto(project ? `/project/${project.id}` : '/'); }
		catch (cause) { deleteError = cause instanceof Error ? cause.message : 'Unable to delete this session.'; deleting = false; }
	}

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
		let refreshTimer: ReturnType<typeof setTimeout> | undefined;
		const refresh = async () => {
			try {
				const [session, history, pendingForms] = await Promise.all([client.session.get({ sessionID }), client.message.list({ sessionID, limit: 5000, order: 'asc' }), client.session.form.list({ sessionID })]);
				if (disposed) return;
				sessionTitle = session.title ?? 'Untitled session';
				messages = history.data;
				forms = pendingForms;
				error = null;
			} catch (cause) {
				if (!disposed) error = cause instanceof Error ? cause.message : 'Unable to load session history.';
			} finally {
				if (!disposed) loading = false;
			}
		};
		const scheduleRefresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), 120); };
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
						if (event.type === 'server.connected') scheduleRefresh();
						else if (event.type === 'form.created' && event.data.form.sessionID === sessionID) scheduleRefresh();
						else if ((event.type === 'form.replied' || event.type === 'form.cancelled') && event.data.sessionID === sessionID) scheduleRefresh();
						else if ('data' in event && event.data && 'sessionID' in event.data && event.data.sessionID === sessionID) scheduleRefresh();
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
		return () => { disposed = true; controller?.abort(); if (timer) clearTimeout(timer); if (refreshTimer) clearTimeout(refreshTimer); window.removeEventListener('online', resume); window.removeEventListener('pageshow', resume); document.removeEventListener('visibilitychange', resume); };
	});
</script>

<svelte:head><title>{sessionTitle}</title></svelte:head>
<main>
	<nav><a href="/">⌂</a><strong>{sessionTitle}</strong><button type="button" onclick={() => showReasoning = !showReasoning}>Reasoning</button><button class="delete" type="button" onclick={deleteSession} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button></nav>
	{#if deleteError}<p class="status error" role="alert">{deleteError}</p>{/if}
	{#if connecting}<p class="connection">Connecting to OpenCode…</p>{/if}
	{#if forms.length > 0}<section class="forms" aria-label="Pending forms">{#each forms as form (form.id)}<a class="form-card" href={formsHref}><strong>{form.title}</strong><span>Input needed · Continue →</span></a>{/each}</section>{/if}
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
	.connection, .status { padding: .8rem; border: 1px solid var(--color-border); border-radius: .7rem; color: var(--color-muted); } .error { color: var(--color-error); } section { display: grid; gap: 1.2rem; } .forms { gap: .55rem; margin: .8rem 0 1.2rem; } .form-card { display: grid; gap: .25rem; padding: .85rem 1rem; border: 1px solid var(--color-accent); border-radius: .7rem; background: var(--color-panel); text-decoration: none; } .form-card span { color: var(--color-accent); font-size: .78rem; } article { min-width: 0; } article.user { justify-self: end; max-width: 88%; padding: .8rem 1rem; border-radius: 1rem 1rem .2rem; background: #1677e8; color: white; } p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; } aside { margin: 0 0 .6rem; padding: .65rem; border-radius: .6rem; background: #201d29; color: #d4c6ec; white-space: pre-wrap; } small { display: block; margin-top: .5rem; color: var(--color-muted); font-family: ui-monospace, monospace; } nav .delete { margin-left: auto; border-color: #725253; background: #382526; color: #ffd5d7; } button:disabled { opacity: .6; } @media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } footer { right: max(1.5rem, calc((100% - 43rem) / 2)); left: max(1.5rem, calc((100% - 43rem) / 2)); } }
</style>
