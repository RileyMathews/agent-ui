<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Agent, AppAgentsResponse, Provider, ProviderListResponse, Session } from '@opencode-ai/sdk/v2/client';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode, getOpencodeV2 } from '$lib/opencode';
	import PromptComposer from '$lib/PromptComposer.svelte';
	import ChatOptions from '$lib/ChatOptions.svelte';

	const sessionID = page.params.id;
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const threadHref = server && project ? sessionHref(sessionID ?? '', server.id, project.id) : '/';
	let directory = $state<string | undefined>();
	const terminalHref = $derived(directory
		? `/terminal?${new URLSearchParams({ directory, server: server?.id ?? '', returnTo: `${threadHref.replace(`/session/${encodeURIComponent(sessionID ?? '')}`, `/session/${encodeURIComponent(sessionID ?? '')}/prompt`)}` })}`
		: undefined);
	let providers = $state<Provider[]>([]);
	let agents = $state<Agent[]>([]);
	let prompt = $state('');
	let modelValue = $state('');
	let agent = $state('');
	let variant = $state('');
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let optionsRequest = 0;

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!sessionID || !directory || !modelValue || !agent || !prompt.trim() || submitting) return;
		submitting = true;
		error = null;
		try {
			if (!server) throw new Error('The server is missing from this session link.');
			const opencodeV2 = getOpencodeV2(server.url);
			const model = JSON.parse(modelValue) as { providerID: string; modelID: string };
			await opencodeV2.session.promptAsync({ sessionID, directory, model, agent, variant: variant || undefined, parts: [{ type: 'text', text: prompt.trim() }] });
			await goto(threadHref);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to send the follow-up.';
			submitting = false;
		}
	}

	async function loadOptions() {
		if (!sessionID || !server || !project) {
			error = 'The session link is missing its project or server.';
			loading = false;
			return;
		}
		const activeRequest = ++optionsRequest;
		loading = true;
		error = null;
		try {
			const opencode = getOpencode(server.url);
			const opencodeV2 = getOpencodeV2(server.url);
			const session = (await opencode.session.get({ path: { id: sessionID }, query: { directory: project.directory } })) as unknown as { directory: string };
			directory = session.directory;
			const [providerResponse, agentResponse, sessionOptions] = await Promise.all([
				opencodeV2.provider.list({ directory }) as unknown as Promise<ProviderListResponse>,
				opencodeV2.app.agents({ directory }) as unknown as Promise<AppAgentsResponse>,
				opencodeV2.session.get({ sessionID, directory }) as unknown as Promise<Session>
			]);
			if (activeRequest !== optionsRequest) return;
			const connected = new Set(providerResponse.connected);
			providers = providerResponse.all.filter((provider) => connected.has(provider.id) && Object.keys(provider.models).length > 0);
			agents = agentResponse.filter((candidate) => !candidate.hidden && (candidate.mode === 'primary' || candidate.mode === 'all'));
			const selectedModel = sessionOptions.model && providers.some((provider) => provider.id === sessionOptions.model?.providerID && provider.models[sessionOptions.model.id]) ? sessionOptions.model : undefined;
			const provider = providers[0];
			const fallbackModelID = providerResponse.default[provider?.id ?? ''] ?? Object.keys(provider?.models ?? {})[0];
			if (selectedModel) {
				modelValue = modelOptionValue(selectedModel.providerID, selectedModel.id);
				const model = providers.find((provider) => provider.id === selectedModel.providerID)?.models[selectedModel.id];
				variant = selectedModel.variant && model?.variants?.[selectedModel.variant] ? selectedModel.variant : '';
			} else if (provider && fallbackModelID) modelValue = modelOptionValue(provider.id, fallbackModelID);
			agent = agents.some((candidate) => candidate.name === sessionOptions.agent) ? sessionOptions.agent ?? '' : agents.find((candidate) => candidate.name === 'build')?.name ?? agents[0]?.name ?? '';
			if (providers.length === 0) error = 'No connected providers with models are available.';
			else if (agents.length === 0) error = 'No chat agents are available.';
		} catch (cause) {
			if (activeRequest === optionsRequest) error = cause instanceof Error ? cause.message : 'Unable to load chat options.';
		} finally {
			if (activeRequest === optionsRequest) loading = false;
		}
	}

	onMount(() => {
		const resume = () => {
			if (!document.hidden && !submitting) void loadOptions();
		};
		void loadOptions();
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

<svelte:head><title>Follow up</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
	<header>
		<a class="back" href={threadHref}>Back to thread</a>
	</header>
	{#if loading}
		<p class="status">Loading models and agents...</p>
	{:else}
		<PromptComposer bind:value={prompt} onsubmit={submit} label="Follow-up prompt" placeholder="Ask a follow-up..." rows={7} fullPage disabled={submitting || !directory} submitDisabled={!modelValue || !agent} submitLabel={submitting ? 'Sending...' : 'Send follow-up'} {error} {terminalHref}>
			<ChatOptions {providers} {agents} bind:modelValue bind:agent bind:variant disabled={submitting} />
		</PromptComposer>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 0.25rem; }
	.back { display: inline-block; color: var(--color-muted); font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	a:focus-visible { outline: var(--focus-ring); outline-offset: 3px; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: 0.75rem; background: var(--color-panel); color: var(--color-muted); }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
