<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import type { Event, Part, SessionMessagesResponse, TextPart, ToolPart } from '@opencode-ai/sdk/client';
	import type { Agent, AppAgentsResponse, Provider, ProviderListResponse, Session } from '@opencode-ai/sdk/v2/client';
	import { opencode, opencodeV2 } from '$lib/opencode';
	import PromptComposer from '$lib/PromptComposer.svelte';
	import ChatOptions from '$lib/ChatOptions.svelte';

	type HistoryMessage = SessionMessagesResponse[number];
	type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';

	const sessionID = page.params.id;
	const draftKey = `agent-ui:prompt:session:${sessionID}`;
	let messages = $state<HistoryMessage[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let connectionState = $state<ConnectionState>('connecting');
	let directory = $state<string | undefined>();
	const terminalHref = $derived(directory
		? `/terminal?${new URLSearchParams({ directory: directory ?? '', returnTo: `/session/${encodeURIComponent(sessionID ?? '')}` })}`
		: undefined);
	let prompt = $state(browser ? sessionStorage.getItem(draftKey) ?? '' : '');
	let submitting = $state(false);
	let promptError = $state<string | null>(null);
	let providers = $state<Provider[]>([]);
	let agents = $state<Agent[]>([]);
	let modelValue = $state('');
	let agent = $state('');
	let variant = $state('');
	let optionsLoading = $state(true);

	$effect(() => {
		if (!browser) return;
		sessionStorage.setItem(draftKey, prompt);
	});

	function textParts(parts: Part[]): TextPart[] {
		return parts.filter((part): part is TextPart => part.type === 'text' && !part.ignored);
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

	function subAgentStatus(part: ToolPart) {
		if (part.state.status === 'pending') return 'Queued';
		if (part.state.status === 'running') return 'Running';
		if (part.state.status === 'completed') return 'Finished';
		return 'Failed';
	}

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	async function submitFollowUp(event: SubmitEvent) {
		event.preventDefault();
		if (!sessionID || !directory || !modelValue || !agent || !prompt.trim() || submitting) return;

		submitting = true;
		promptError = null;
		try {
			const model = JSON.parse(modelValue) as { providerID: string; modelID: string };
			await opencodeV2.session.promptAsync({
				sessionID,
				directory,
				model,
				agent,
				variant: variant || undefined,
				parts: [{ type: 'text', text: prompt.trim() }]
			});
			prompt = '';
		} catch (cause) {
			promptError = cause instanceof Error ? cause.message : 'Unable to send the follow-up.';
		} finally {
			submitting = false;
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
		const id = sessionID ?? '';
		if (!id) {
			error = 'The session ID is missing.';
			loading = false;
			return undefined;
		}

		let controller: AbortController | undefined;
		let everConnected = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let disposed = false;

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
				const session = (await opencode.session.get({ path: { id } })) as unknown as { directory: string };
				directory = session.directory;
			} catch {
				// The history request below provides the user-facing error and can recover on reconnect.
			}
			await refreshMessages();
			connect();

			if (!directory) {
				optionsLoading = false;
				return;
			}

			try {
				const [providerResponse, agentResponse, session] = await Promise.all([
					opencodeV2.provider.list({ directory }) as unknown as Promise<ProviderListResponse>,
					opencodeV2.app.agents({ directory }) as unknown as Promise<AppAgentsResponse>,
					opencodeV2.session.get({ sessionID: id, directory }) as unknown as Promise<Session>
				]);
				const connected = new Set(providerResponse.connected);
				providers = providerResponse.all.filter(
					(provider) => connected.has(provider.id) && Object.keys(provider.models).length > 0
				);
				agents = agentResponse.filter(
					(candidate) => !candidate.hidden && (candidate.mode === 'primary' || candidate.mode === 'all')
				);

				const sessionModel = session.model && providers.some(
					(provider) => provider.id === session.model?.providerID && provider.models[session.model.id]
				) ? session.model : undefined;
				const provider = providers[0];
				const fallbackModelID = providerResponse.default[provider?.id ?? ''] ?? Object.keys(provider?.models ?? {})[0];
				if (sessionModel) {
					modelValue = modelOptionValue(sessionModel.providerID, sessionModel.id);
					const model = providers.find((provider) => provider.id === sessionModel.providerID)?.models[sessionModel.id];
					variant = sessionModel.variant && model?.variants?.[sessionModel.variant] ? sessionModel.variant : '';
				} else if (provider && fallbackModelID) {
					modelValue = modelOptionValue(provider.id, fallbackModelID);
				}
				agent = agents.some((candidate) => candidate.name === session.agent)
					? session.agent ?? ''
					: agents.find((candidate) => candidate.name === 'build')?.name ?? agents[0]?.name ?? '';
			} catch (cause) {
				promptError = cause instanceof Error ? cause.message : 'Unable to load chat options.';
			} finally {
				optionsLoading = false;
			}
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
	<title>Session history</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	{#if connectionState !== 'connected'}
		<div class="connection" role="status" aria-live="polite">
			<span class="spinner" aria-hidden="true"></span>
			{connectionState === 'offline' ? 'Offline' : connectionState === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
		</div>
	{/if}

	<header>
		<a class="back" href="/">Back to sessions</a>
		<p class="eyebrow">OpenCode</p>
		<h1>Session history</h1>
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
				{@const tools = toolParts(message.parts)}
				{@const subAgents = subAgentParts(tools)}
				{@const otherTools = otherToolParts(tools)}
				<article class:user={message.info.role === 'user'}>
					{#each text as part (part.id)}
						<p class="message-text">{part.text}</p>
					{/each}
					{#if subAgents.length > 0}
						<div class="sub-agents" aria-label="Sub-agents">
							{#each subAgents as part (part.id)}
								<div class:running={part.state.status === 'running'} class:error-state={part.state.status === 'error'} class="sub-agent">
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
											<span class="agent-status">{subAgentStatus(part)}</span>
										</div>
										<p>{stringInput(part, 'subagent_type') ?? 'agent'}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					{#if otherTools.length > 0}
						<p class="tools">{otherTools.map((part) => part.tool).join(' · ')}</p>
					{/if}
					{#if text.length === 0 && tools.length === 0}
						<p class="empty">No displayable content.</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}

	<div class="composer" class:active={prompt.length > 0 || submitting || promptError !== null}>
		<PromptComposer
			bind:value={prompt}
			onsubmit={submitFollowUp}
			label="Follow-up prompt"
			placeholder="Ask a follow-up..."
			rows={3}
			disabled={submitting || !directory || optionsLoading || connectionState === 'offline'}
			submitDisabled={!modelValue || !agent}
			submitLabel={submitting ? 'Sending...' : 'Send follow-up'}
			error={promptError}
			{terminalHref}
		>
			<ChatOptions {providers} {agents} bind:modelValue bind:agent bind:variant disabled={submitting || optionsLoading} />
		</PromptComposer>
	</div>
</main>

<style>
	:global(*) { box-sizing: border-box; }

	:global(body) {
		margin: 0;
		min-width: 20rem;
		background: #111315;
		color: #f1f3f3;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 7rem; }
	.connection { position: fixed; z-index: 10; top: max(0.65rem, env(safe-area-inset-top)); left: 50%; display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.7rem; border: 1px solid #3c4646; border-radius: 999px; background: rgb(26 30 32 / 0.94); color: #cbd2d1; box-shadow: 0 0.4rem 1.5rem rgb(0 0 0 / 0.3); font-size: 0.72rem; font-weight: 700; transform: translateX(-50%); backdrop-filter: blur(0.5rem); }
	.spinner { width: 0.75rem; height: 0.75rem; border: 2px solid #53605e; border-top-color: #79ddc0; border-radius: 50%; animation: spin 0.8s linear infinite; }
	header { margin-bottom: 1.75rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	.back:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 0.95; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; color: #aeb8b7; }
	.error { border-color: #603638; color: #ffb4b8; }
	section { display: grid; gap: 1.5rem; }
	article { min-width: 0; }
	article.user { justify-self: end; max-width: 90%; padding: 0.9rem 1rem; border-radius: 1.25rem 1.25rem 0.25rem; background: #1677e8; color: #fff; }
	.message-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }
	.message-text + .message-text { margin-top: 0.75rem; }
	.sub-agents { display: grid; gap: 0.5rem; margin-top: 0.85rem; }
	.sub-agent { display: flex; align-items: center; gap: 0.75rem; min-width: 0; padding: 0.75rem 0.8rem; border: 1px solid #303839; border-radius: 0.8rem; background: linear-gradient(135deg, #1d2224, #181c1e); box-shadow: 0 1px 0 rgb(255 255 255 / 0.035) inset; }
	.sub-agent.running { border-color: #3e645a; background: linear-gradient(135deg, #1d2927, #181e1e); }
	.sub-agent.error-state { border-color: #603638; }
	.agent-mark { display: grid; flex: 0 0 auto; width: 1.9rem; height: 1.9rem; place-items: center; border: 1px solid #3c4746; border-radius: 0.6rem; background: #121617; color: #79ddc0; }
	.agent-spinner { width: 0.85rem; height: 0.85rem; border: 2px solid #3d5c54; border-top-color: #79ddc0; border-radius: 50%; animation: spin 0.8s linear infinite; }
	.agent-check, .agent-error { font-size: 0.85rem; font-weight: 800; }
	.agent-error { color: #ff9c9f; }
	.agent-dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: #71807e; }
	.agent-detail { min-width: 0; flex: 1; }
	.agent-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
	.agent-heading strong { min-width: 0; color: #edf2f1; font-size: 0.82rem; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
	.agent-status { flex: 0 0 auto; color: #8e9a98; font-size: 0.65rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
	.running .agent-status { color: #79ddc0; }
	.error-state .agent-status { color: #ff9c9f; }
	.agent-detail p { margin: 0.2rem 0 0; color: #74817f; font-family: ui-monospace, monospace; font-size: 0.68rem; }
	.tools { margin: 0.9rem 0 0; color: #9ca9a7; font-family: ui-monospace, monospace; font-size: 0.75rem; overflow-wrap: anywhere; }
	.user .tools { color: #d9ecff; }
	.empty { margin: 0; color: #788382; font-style: italic; }
	.composer { position: fixed; z-index: 5; bottom: 0; left: 50%; width: min(calc(100% - 2rem), 46rem); padding: 1rem 0 max(0rem, env(safe-area-inset-bottom)); background: linear-gradient(transparent, #111315 1rem); transition: transform 180ms ease-out; }
	.composer:not(.active):not(:focus-within) { transform: translate(-50%, calc(100% - 4.75rem)); }
	.composer:focus-within, .composer.active { transform: translate(-50%, 0); }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner, .agent-spinner { animation-duration: 1.8s; } .composer { transition: none; } }

	@media (min-width: 40rem) {
		main { padding-right: 1.5rem; padding-left: 1.5rem; }
		article.user { padding: 1rem 1.25rem; }
	}
</style>
