<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { Event, Part, ReasoningPart, SessionMessagesResponse, TextPart, ToolPart } from '@opencode-ai/sdk/client';
	import Markdown from '$lib/Markdown.svelte';
	import { getProject, getServer } from '$lib/config';
	import { getOpencode, getOpencodeV2 } from '$lib/opencode';

	let { subAgent = false }: { subAgent?: boolean } = $props();

	type HistoryMessage = SessionMessagesResponse[number];
	type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';

	const parentSessionID = page.params.id;
	const sessionID = $derived(subAgent ? page.params.subAgentID : parentSessionID);
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	let messages = $state<HistoryMessage[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let connectionState = $state<ConnectionState>('connecting');
	let directory = $state<string | undefined>(project?.directory);
	let sessionTitle = $state('Loading session...');
	let sessionLoaded = $state(false);
	let archiving = $state(false);
	let archiveError = $state<string | null>(null);
	let showReasoning = $state(false);
	let main: HTMLElement;
	let following = $state(true);
	const query = server && project ? new URLSearchParams({ server: server.id, project: project.id }) : undefined;
	const parentThreadHref = query ? `/session/${encodeURIComponent(parentSessionID ?? '')}?${query}` : '/';
	const threadHref = $derived(query ? `/session/${encodeURIComponent(sessionID ?? '')}?${query}` : '/');
	const detailsHref = $derived(query ? `/session/${encodeURIComponent(sessionID ?? '')}/details?${query}` : undefined);
	const terminalHref = $derived(directory && server
		? `/terminal?${new URLSearchParams({ directory: directory ?? '', server: server.id, returnTo: threadHref })}`
		: undefined);
	const opencodeHref = $derived(sessionLoaded && directory && server && sessionID
		? `${server.url}/${btoa(Array.from(new TextEncoder().encode(directory), (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}/session/${encodeURIComponent(sessionID)}`
		: undefined);

	async function archiveSession() {
		if (!sessionID || !server || !directory || archiving) return;
		if (!window.confirm(`Archive "${sessionTitle}"?`)) return;

		archiving = true;
		archiveError = null;
		try {
			await getOpencodeV2(server.url).session.update({
				sessionID,
				directory,
				time: { archived: Date.now() }
			});
			await goto('/');
		} catch (cause) {
			archiveError = cause instanceof Error ? cause.message : 'Unable to archive this session. Try again.';
			archiving = false;
		}
	}

	function scrollToBottom() {
		following = true;
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
	}

	function textParts(parts: Part[]): TextPart[] {
		return parts.filter((part): part is TextPart => part.type === 'text' && !part.ignored);
	}

	function reasoningParts(parts: Part[]): ReasoningPart[] {
		return parts.filter((part): part is ReasoningPart => part.type === 'reasoning');
	}

	function toolParts(parts: Part[]): ToolPart[] {
		return parts.filter((part): part is ToolPart => part.type === 'tool');
	}

	function subAgentParts(parts: ToolPart[]) {
		return parts.filter((part) => part.tool === 'task');
	}

	function otherToolParts(parts: ToolPart[]) {
		return parts.filter((part) => part.tool !== 'task');
	}

	function stringInput(part: ToolPart, key: string) {
		const value = part.state.input[key];
		return typeof value === 'string' ? value : undefined;
	}

	function subAgentTitle(part: ToolPart) {
		return (part.state.status === 'running' || part.state.status === 'completed') && part.state.title
			? part.state.title
			: stringInput(part, 'description') ?? 'Sub-agent task';
	}

	function subAgentSessionID(part: ToolPart) {
		if ('metadata' in part.state) {
			const sessionId = part.state.metadata?.sessionId;
			if (typeof sessionId === 'string') return sessionId;
			const sessionID = part.state.metadata?.sessionID;
			if (typeof sessionID === 'string') return sessionID;
		}
		return stringInput(part, 'task_id');
	}

	function subAgentHref(part: ToolPart) {
		const childSessionID = subAgentSessionID(part);
		if (subAgent || !childSessionID || !query) return undefined;
		return `/session/${encodeURIComponent(parentSessionID ?? '')}/sub-agent/${encodeURIComponent(childSessionID)}?${query}`;
	}

	function toolStatus(part: ToolPart) {
		if (part.state.status === 'pending') return 'Queued';
		if (part.state.status === 'running') return 'Running';
		if (part.state.status === 'completed') return 'Finished';
		return 'Failed';
	}

	function toolDetail(part: ToolPart): string {
		const input = part.state.input ?? {};
		const str = (key: string) => typeof input[key] === 'string' ? (input[key] as string) : undefined;
		const summarize = (value: string) => value.replace(/\s+/g, ' ').trim();

		switch (part.tool) {
			case 'bash': {
				const command = str('command');
				return command ? summarize(`$ ${command}`) : '';
			}
			case 'read':
			case 'write':
			case 'edit':
			case 'patch': {
				const file = str('filePath') ?? str('file') ?? str('path');
				return file ? summarize(file) : '';
			}
			case 'glob': {
				const pattern = str('pattern') ?? '';
				const path = str('path');
				return summarize(path ? `${path}: ${pattern}` : pattern);
			}
			case 'grep': {
				const pattern = str('pattern') ?? '';
				const path = str('path');
				const include = str('include');
				const bits = [pattern];
				if (path) bits.push(`in ${path}`);
				if (include) bits.push(`(${include})`);
				return summarize(bits.join(' '));
			}
			case 'webfetch':
				return summarize(str('url') ?? '');
			case 'websearch':
				return summarize(str('query') ?? '');
			case 'todowrite': {
				const todos = input['todos'];
				if (Array.isArray(todos)) return `${todos.length} ${todos.length === 1 ? 'todo' : 'todos'}`;
				return '';
			}
			case 'skill':
				return summarize(str('name') ?? '');
			default:
				return '';
		}
	}

	function applyEvent(event: Event) {
		if (event.type === 'message.updated' && event.properties.info.sessionID === sessionID) {
			const index = messages.findIndex((message) => message.info.id === event.properties.info.id);
			if (index === -1) {
				messages = [...messages, { info: event.properties.info, parts: [] }];
				return;
			}

			messages = messages.map((message, messageIndex) =>
				messageIndex === index ? { ...message, info: event.properties.info } : message
			);
			return;
		}

		if (event.type === 'message.removed' && event.properties.sessionID === sessionID) {
			messages = messages.filter((message) => message.info.id !== event.properties.messageID);
			return;
		}

		if (event.type === 'message.part.updated' && event.properties.part.sessionID === sessionID) {
			const part = event.properties.part;
			messages = messages.map((message) => {
				if (message.info.id !== part.messageID) return message;
				const index = message.parts.findIndex((candidate) => candidate.id === part.id);
				const parts = index === -1
					? [...message.parts, part]
					: message.parts.map((candidate, partIndex) => partIndex === index ? part : candidate);
				return { ...message, parts };
			});
			return;
		}

		if (event.type === 'message.part.removed' && event.properties.sessionID === sessionID) {
			messages = messages.map((message) =>
				message.info.id === event.properties.messageID
					? { ...message, parts: message.parts.filter((part) => part.id !== event.properties.partID) }
					: message
			);
		}
	}

	onMount(() => {
		let lastScrollTop = window.scrollY;
		let lastPointerY: number | undefined;
		let scrollFrame: number | undefined;

		function followLatest() {
			if (!following || scrollFrame !== undefined) return;
			scrollFrame = requestAnimationFrame(() => {
				scrollFrame = undefined;
				if (!following) return;
				window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
				lastScrollTop = window.scrollY;
			});
		}

		function trackScroll() {
			const scrollTop = window.scrollY;
			if (scrollTop < lastScrollTop - 1) followLatest();
			lastScrollTop = scrollTop;
		}

		function trackWheel(event: WheelEvent) {
			if (event.deltaY < 0) following = false;
		}

		function trackPointerStart(event: PointerEvent) {
			if (event.isPrimary) lastPointerY = event.clientY;
		}

		function trackPointerDrag(event: PointerEvent) {
			if (event.buttons !== 1 || lastPointerY === undefined) return;
			const movingUp = event.pointerType === 'mouse'
				? event.clientY < lastPointerY
				: event.clientY > lastPointerY;
			if (movingUp) following = false;
			lastPointerY = event.clientY;
		}

		function trackScrollKey(event: KeyboardEvent) {
			if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) {
				following = false;
			}
		}

		const resizeObserver = new ResizeObserver(followLatest);
		resizeObserver.observe(main);
		window.addEventListener('scroll', trackScroll, { passive: true });
		window.addEventListener('wheel', trackWheel, { passive: true });
		window.addEventListener('pointerdown', trackPointerStart, { passive: true });
		window.addEventListener('pointermove', trackPointerDrag, { passive: true });
		window.addEventListener('keydown', trackScrollKey);
		followLatest();

		return () => {
			if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
			resizeObserver.disconnect();
			window.removeEventListener('scroll', trackScroll);
			window.removeEventListener('wheel', trackWheel);
			window.removeEventListener('pointerdown', trackPointerStart);
			window.removeEventListener('pointermove', trackPointerDrag);
			window.removeEventListener('keydown', trackScrollKey);
		};
	});

	onMount(() => {
		const id = sessionID ?? '';
		if (!id || !server || !project) {
			error = 'The session link is missing its project or server.';
			loading = false;
			return undefined;
		}

		let controller: AbortController | undefined;
		let everConnected = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let disposed = false;
		const opencode = getOpencode(server.url);
		const projectDirectory = project.directory;

		async function refreshMessages() {
			try {
				// The generated SDK types do not preserve the client's responseStyle setting.
				messages = (await opencode.session.messages({
					path: { id },
					query: directory ? { directory } : undefined
				})) as unknown as HistoryMessage[];
				error = null;
			} catch (cause) {
				if (!disposed) error = cause instanceof Error ? cause.message : 'Unable to load session history.';
			} finally {
				if (!disposed) loading = false;
			}
		}

		function connect() {
			if (disposed || document.hidden) return;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			controller?.abort();
			controller = new AbortController();
			connectionState = navigator.onLine ? (everConnected ? 'reconnecting' : 'connecting') : 'offline';
			if (!navigator.onLine) return;

			const activeController = controller;
			void (async () => {
				try {
					const events = await opencode.event.subscribe({
						query: directory ? { directory } : undefined,
						signal: activeController.signal,
						sseDefaultRetryDelay: 1000,
						sseMaxRetryDelay: 15000,
						onSseError: () => {
							if (!activeController.signal.aborted) connectionState = navigator.onLine ? 'reconnecting' : 'offline';
						}
					});

					for await (const event of events.stream) {
						if (activeController.signal.aborted || disposed) return;
						if (connectionState !== 'connected') {
							connectionState = 'connected';
							everConnected = true;
							void refreshMessages();
						}
						applyEvent(event);
					}
				} catch {
					if (!activeController.signal.aborted) connectionState = navigator.onLine ? 'reconnecting' : 'offline';
				}

				if (!activeController.signal.aborted && !disposed) {
					reconnectTimer = setTimeout(connect, 1000);
				}
			})();
		}

		async function initialize() {
			try {
				const session = (await opencode.session.get({ path: { id }, query: { directory: projectDirectory } })) as unknown as { directory: string; title?: string };
				directory = session.directory;
				sessionTitle = session.title || 'Untitled session';
				sessionLoaded = true;
			} catch {
				// The history request below provides the user-facing error and can recover on reconnect.
			}
			await refreshMessages();
			connect();

		}

		function resume() {
			if (document.hidden) return;
			connect();
			void refreshMessages();
		}

		function goOffline() {
			controller?.abort();
			connectionState = 'offline';
		}

		void initialize();
		document.addEventListener('visibilitychange', resume);
		window.addEventListener('pageshow', resume);
		window.addEventListener('online', resume);
		window.addEventListener('offline', goOffline);

		return () => {
			disposed = true;
			controller?.abort();
			if (reconnectTimer) clearTimeout(reconnectTimer);
			document.removeEventListener('visibilitychange', resume);
			window.removeEventListener('pageshow', resume);
			window.removeEventListener('online', resume);
			window.removeEventListener('offline', goOffline);
		};
	});
</script>

<svelte:head>
	<title>{subAgent ? 'Sub-agent history' : 'Session history'}</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main bind:this={main}>
	<nav class="session-bar" aria-label="Session controls">
		<a class="home" href="/" aria-label="Home dashboard" title="Home dashboard"><span aria-hidden="true">⌂</span></a>
		<div class="session-identity">
			<span>{server?.name ?? 'Unknown server'}</span>
			{#if opencodeHref}
				<a href={opencodeHref}>{sessionTitle}</a>
			{:else}
				<strong>{sessionTitle}</strong>
			{/if}
		</div>
		<div class="session-controls">
			{#if detailsHref}<a class="details" href={detailsHref}>Details</a>{/if}
			<button class="reasoning-toggle" type="button" onclick={() => showReasoning = !showReasoning} aria-pressed={showReasoning}>
				Reasoning
			</button>
			<button class="archive-session" type="button" onclick={archiveSession} disabled={archiving || !sessionLoaded || !directory || !server}>
				{archiving ? 'Archiving...' : 'Archive'}
			</button>
		</div>
	</nav>
	{#if archiveError}<p class="archive-error" role="alert">{archiveError}</p>{/if}

	{#if connectionState !== 'connected'}
		<div class="connection" role="status" aria-live="polite">
			<span class="spinner" aria-hidden="true"></span>
			{connectionState === 'offline' ? 'Offline' : connectionState === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
		</div>
	{/if}

	<header>
		<p class="eyebrow">{project?.name ?? 'OpenCode'} · {server?.name ?? 'Unknown server'}</p>
		<h1>{subAgent ? 'Sub-agent history' : 'Session history'}</h1>
	</header>

	{#if loading}
		<p class="status">Loading session history...</p>
	{:else if error}
		<p class="status error">{error}</p>
	{:else if messages.length === 0}
		<p class="status">This session has no messages.</p>
	{:else}
		<section aria-label="Session messages">
			{#each messages as message (message.info.id)}
				{@const text = textParts(message.parts)}
				{@const reasoning = reasoningParts(message.parts)}
				{@const tools = toolParts(message.parts)}
				{@const subAgents = subAgentParts(tools)}
				{@const otherTools = otherToolParts(tools)}
				<article class:user={message.info.role === 'user'}>
					{#if showReasoning && reasoning.length > 0}
						<section class="reasoning" aria-label="Reasoning">
							{#each reasoning as part (part.id)}
								<p>{part.text}</p>
							{/each}
						</section>
					{/if}
					{#each text as part (part.id)}
						{#if message.info.role === 'assistant'}
							<Markdown source={part.text} />
						{:else}
							<p class="message-text">{part.text}</p>
						{/if}
					{/each}
					{#if subAgents.length > 0}
						<div class="sub-agents" aria-label="Sub-agents">
							{#each subAgents as part (part.id)}
								{@const href = subAgentHref(part)}
								<svelte:element this={href ? 'a' : 'div'} {href} class:linked={href} class:running={part.state.status === 'running'} class:error-state={part.state.status === 'error'} class="sub-agent">
									<div class="agent-mark" aria-hidden="true">
										{#if part.state.status === 'running'}
											<span class="agent-spinner"></span>
										{:else if part.state.status === 'completed'}
											<span class="agent-check">✓</span>
										{:else if part.state.status === 'error'}
											<span class="agent-error">!</span>
										{:else}
											<span class="agent-dot"></span>
										{/if}
									</div>
									<div class="agent-detail">
										<div class="agent-heading">
											<strong>{subAgentTitle(part)}</strong>
											<span class="agent-status">{toolStatus(part)}</span>
										</div>
										<p>{stringInput(part, 'subagent_type') ?? 'agent'}</p>
									</div>
								</svelte:element>
							{/each}
						</div>
					{/if}
					{#if otherTools.length > 0}
						<ul class="tools" aria-label="Tool calls">
							{#each otherTools as part (part.id)}
								<li class="tool" class:running={part.state.status === 'running'} class:error-state={part.state.status === 'error'}>
									<span class="tool-mark" aria-hidden="true">
										{#if part.state.status === 'running'}
											<span class="tool-spinner"></span>
										{:else if part.state.status === 'completed'}
											<span class="tool-check">✓</span>
										{:else if part.state.status === 'error'}
											<span class="tool-error">!</span>
										{:else}
											<span class="tool-dot"></span>
										{/if}
									</span>
									<span class="tool-name">{part.tool}</span>
									<span class="tool-detail">{toolDetail(part)}</span>
									<span class="tool-status">{toolStatus(part)}</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if text.length === 0 && tools.length === 0}
						<p class="empty">No displayable content.</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}

	{#if subAgent}
		<footer class="thread-actions sub-agent-actions" aria-label="Sub-agent actions">
			<a class="back" href={parentThreadHref} aria-label="Back to parent thread" title="Back to parent thread"><span aria-hidden="true">←</span></a>
		</footer>
	{:else}
		<footer class="thread-actions" aria-label="Thread actions">
			<a class="back" href={project ? `/project/${project.id}` : '/'} aria-label="Back to project" title="Back to project"><span aria-hidden="true">←</span></a>
			{#if terminalHref}
				<a class="terminal" href={terminalHref}>Terminal <span aria-hidden="true">&gt;_</span></a>
			{:else}
				<span class="terminal" aria-disabled="true">Terminal <span aria-hidden="true">&gt;_</span></span>
			{/if}
			<a class="follow-up" href={`${threadHref.replace(`/session/${encodeURIComponent(sessionID ?? '')}`, `/session/${encodeURIComponent(sessionID ?? '')}/prompt`)}`}>Follow up <span aria-hidden="true">→</span></a>
			<button class="scroll-to-bottom" class:following onclick={scrollToBottom} aria-label={following ? 'Following newest messages' : 'Scroll to bottom and follow newest messages'} title={following ? 'Following newest messages' : 'Scroll to bottom and follow newest messages'} aria-pressed={following}><span aria-hidden="true">↓</span></button>
		</footer>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 0 1rem 6.75rem; }
	.session-bar { position: sticky; z-index: 8; top: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; min-height: 3rem; margin: 0 -1rem 1.25rem; padding: max(0.35rem, env(safe-area-inset-top)) 1rem 0.35rem; border-bottom: 1px solid #293031; background: rgb(17 19 21 / 0.96); backdrop-filter: blur(0.6rem); }
	.session-bar a, .session-bar button { min-height: 2rem; border: 1px solid #3a4544; border-radius: 0.5rem; background: #202627; color: #d7dddc; font: inherit; font-size: 0.7rem; font-weight: 750; text-decoration: none; }
	.session-bar .home { display: grid; width: 2rem; padding: 0; place-items: center; font-size: 1rem; }
	.session-identity { min-width: 0; line-height: 1.1; }
	.session-identity span { display: block; margin-bottom: 0.15rem; color: #85918f; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.session-identity a, .session-identity strong { display: block; min-height: 0; padding: 0; border: 0; background: none; color: var(--color-accent); font-size: 0.72rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.session-identity strong { color: #d7dddc; }
	.archive-session { padding: 0 0.6rem; cursor: pointer; }
	.session-controls { display: flex; gap: 0.4rem; }
	.session-controls .details { display: grid; padding: 0 0.55rem; place-items: center; }
	.reasoning-toggle { padding: 0 0.55rem; cursor: pointer; }
	.reasoning-toggle[aria-pressed="true"] { border-color: var(--color-accent); color: var(--color-accent); }
	.archive-session:disabled { cursor: not-allowed; opacity: 0.55; }
	.session-bar a:focus-visible, .session-bar button:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
	.archive-error { margin: -0.5rem 0 1rem; padding: 0.65rem 0.75rem; border: 1px solid #603638; border-radius: 0.6rem; background: #2a1d1e; color: var(--color-error); font-size: 0.72rem; }
	.connection { position: fixed; z-index: 10; top: max(3.65rem, calc(env(safe-area-inset-top) + 3rem)); left: 50%; display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.7rem; border: 1px solid #3c4646; border-radius: 999px; background: rgb(26 30 32 / 0.94); color: #cbd2d1; box-shadow: 0 0.4rem 1.5rem rgb(0 0 0 / 0.3); font-size: 0.72rem; font-weight: 700; transform: translateX(-50%); backdrop-filter: blur(0.5rem); }
	.spinner { width: 0.75rem; height: 0.75rem; border: 2px solid #53605e; border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
	header { margin-bottom: 1.75rem; }
	.eyebrow { margin: 0 0 0.4rem; color: var(--color-accent); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 0.95; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-panel); color: var(--color-muted); }
	.error { border-color: #603638; color: var(--color-error); }
	section { display: grid; gap: 1.5rem; }
	article { min-width: 0; }
	article.user { justify-self: end; max-width: 90%; padding: 0.9rem 1rem; border-radius: 1.25rem 1.25rem 0.25rem; background: #1677e8; color: #fff; }
	.message-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
	.message-text + .message-text { margin-top: 0.75rem; }
	.reasoning { margin-bottom: 0.85rem; padding: 0.7rem 0.8rem; border: 1px solid #4b3d68; border-radius: 0.7rem; background: #201d29; color: #d4c6ec; font-size: 0.8rem; line-height: 1.5; }
	.reasoning p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
	.reasoning p + p { margin-top: 0.65rem; }
	.sub-agents { display: grid; gap: 0.5rem; margin-top: 0.85rem; }
	.sub-agent { display: flex; align-items: center; gap: 0.75rem; min-width: 0; padding: 0.75rem 0.8rem; border: 1px solid #303839; border-radius: 0.8rem; background: linear-gradient(135deg, #1d2224, #181c1e); box-shadow: 0 1px 0 rgb(255 255 255 / 0.035) inset; }
	.sub-agent.linked { color: inherit; text-decoration: none; }
	.sub-agent.linked::after { content: '›'; flex: 0 0 auto; color: var(--color-accent); font-size: 1.25rem; }
	.sub-agent.linked:focus-visible { outline: var(--focus-ring); outline-offset: 3px; }
	.sub-agent.running { border-color: #3e645a; background: linear-gradient(135deg, #1d2927, #181e1e); }
	.sub-agent.error-state { border-color: #603638; }
	.agent-mark { display: grid; flex: 0 0 auto; width: 1.9rem; height: 1.9rem; place-items: center; border: 1px solid #3c4746; border-radius: 0.6rem; background: #121617; color: var(--color-accent); }
	.agent-spinner { width: 0.85rem; height: 0.85rem; border: 2px solid #3d5c54; border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
	.agent-check, .agent-error { font-size: 0.85rem; font-weight: 800; }
	.agent-error { color: #ff9c9f; }
	.agent-dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: #71807e; }
	.agent-detail { min-width: 0; flex: 1; }
	.agent-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
	.agent-heading strong { min-width: 0; color: #edf2f1; font-size: 0.82rem; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
	.agent-status { flex: 0 0 auto; color: #8e9a98; font-size: 0.65rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
	.running .agent-status { color: var(--color-accent); }
	.error-state .agent-status { color: #ff9c9f; }
	.agent-detail p { margin: 0.2rem 0 0; color: #74817f; font-family: ui-monospace, monospace; font-size: 0.68rem; }
	.tools { display: grid; gap: 0.35rem; margin: 0.9rem 0 0; padding: 0; list-style: none; }
	.tool { display: flex; align-items: center; gap: 0.5rem; min-width: 0; padding: 0.4rem 0.55rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: #161a1c; font-family: ui-monospace, monospace; font-size: 0.72rem; }
	.tool.running { border-color: #3e645a; background: #18201e; }
	.tool.error-state { border-color: #603638; }
	.tool-mark { display: grid; flex: 0 0 auto; width: 1.1rem; height: 1.1rem; place-items: center; color: var(--color-accent); }
	.tool-spinner { width: 0.6rem; height: 0.6rem; border: 2px solid #3d5c54; border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
	.tool-check, .tool-error { font-size: 0.7rem; font-weight: 800; }
	.tool-error { color: #ff9c9f; }
	.tool-dot { width: 0.35rem; height: 0.35rem; border-radius: 50%; background: #71807e; }
	.tool-name { flex: 0 0 auto; color: #cdd5d4; font-weight: 700; }
	.tool-detail { flex: 1 1 auto; min-width: 0; color: #9ca9a7; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.tool-status { flex: 0 0 auto; color: #8e9a98; font-size: 0.6rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
	.running .tool-status { color: var(--color-accent); }
	.error-state .tool-status { color: #ff9c9f; }
	.user .tool { border-color: rgb(255 255 255 / 0.18); background: rgb(0 0 0 / 0.15); }
	.user .tool-name { color: #fff; }
	.user .tool-detail { color: #d9ecff; }
	.user .tool-status { color: #cfe3ff; }
	.empty { margin: 0; color: #788382; font-style: italic; }
	.thread-actions { position: fixed; z-index: 5; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: auto 0.8fr 1.2fr auto; gap: 0.55rem; padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom)); border-top: 1px solid #293031; background: rgb(17 19 21 / 0.96); backdrop-filter: blur(0.6rem); }
	.thread-actions.sub-agent-actions { grid-template-columns: auto; justify-content: start; }
	.thread-actions a, .thread-actions button, .thread-actions span[aria-disabled] { display: flex; align-items: center; justify-content: space-between; min-height: 3.1rem; padding: 0.75rem 0.9rem; border: 1px solid #3a4544; border-radius: 0.75rem; background: #242a2b; color: #cdd5d4; font-size: 0.88rem; font-weight: 800; text-decoration: none; }
	.thread-actions button { font: inherit; cursor: pointer; }
	.thread-actions .follow-up { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-background); }
	.thread-actions .back, .thread-actions .scroll-to-bottom { justify-content: center; width: 3.1rem; min-width: 3.1rem; padding: 0; font-size: 1rem; }
	.thread-actions .scroll-to-bottom.following { border-color: var(--color-accent); color: var(--color-accent); }
	.thread-actions span[aria-disabled] { cursor: not-allowed; opacity: 0.45; }
	.thread-actions a:focus-visible, .thread-actions button:focus-visible { outline: var(--focus-ring); outline-offset: 3px; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner, .agent-spinner, .tool-spinner { animation: none; } }

	@media (min-width: 40rem) {
		main { padding-right: 1.5rem; padding-left: 1.5rem; }
		.session-bar { margin-right: -1.5rem; margin-left: -1.5rem; padding-right: 1.5rem; padding-left: 1.5rem; }
		.thread-actions { padding-right: max(1.5rem, calc((100% - 43rem) / 2)); padding-left: max(1.5rem, calc((100% - 43rem) / 2)); }
		article.user { padding: 1rem 1.25rem; }
	}
</style>
