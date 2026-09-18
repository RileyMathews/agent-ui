<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { AgentInfo, ModelInfo } from '@opencode/client';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
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
	let models = $state<ModelInfo[]>([]);
	let agents = $state<AgentInfo[]>([]);
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
			const opencode = getOpencode(server.url);
			await opencode.session.switchAgent({ sessionID, agent });
			const selected = JSON.parse(modelValue) as { providerID: string; modelID: string };
			await opencode.session.switchModel({ sessionID, model: { id: selected.modelID, providerID: selected.providerID, variant: variant || undefined } });
			await opencode.session.prompt({ sessionID, text: prompt.trim() });
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
			const session = await opencode.session.get({ sessionID });
			directory = session.location.directory;
			const [modelResponse, agentResponse] = await Promise.all([
				opencode.model.list({ location: { directory } }),
				opencode.agent.list({ location: { directory } })
			]);
			if (activeRequest !== optionsRequest) return;
			models = modelResponse.data.filter((model) => model.enabled);
			agents = agentResponse.data.filter((candidate) => !candidate.hidden && (candidate.mode === 'primary' || candidate.mode === 'all'));
			const selectedModel = session.model && models.some((model) => model.providerID === session.model?.providerID && model.modelID === session.model.id) ? session.model : undefined;
			const fallbackModel = models[0];
			if (selectedModel) {
				modelValue = modelOptionValue(selectedModel.providerID, selectedModel.id);
				const model = models.find((model) => model.providerID === selectedModel.providerID && model.modelID === selectedModel.id);
				variant = selectedModel.variant && model?.variants.some((item) => item.id === selectedModel.variant) ? selectedModel.variant : '';
			} else if (fallbackModel) modelValue = modelOptionValue(fallbackModel.providerID, fallbackModel.modelID);
			agent = agents.some((candidate) => candidate.id === session.agent) ? session.agent ?? '' : agents.find((candidate) => candidate.id === 'build')?.id ?? agents[0]?.id ?? '';
			if (models.length === 0) error = 'No connected providers with models are available.';
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
			<ChatOptions {models} {agents} bind:modelValue bind:agent bind:variant disabled={submitting} />
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
