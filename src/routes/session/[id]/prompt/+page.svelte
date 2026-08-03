<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { Agent, AppAgentsResponse, Provider, ProviderListResponse, Session } from '@opencode-ai/sdk/v2/client';
	import { opencode, opencodeV2 } from '$lib/opencode';
	import PromptComposer from '$lib/PromptComposer.svelte';
	import ChatOptions from '$lib/ChatOptions.svelte';

	const sessionID = page.params.id;
	const draftKey = `agent-ui:prompt:session:${sessionID}`;
	let directory = $state<string | undefined>();
	const terminalHref = $derived(directory
		? `/terminal?${new URLSearchParams({ directory, returnTo: `/session/${encodeURIComponent(sessionID ?? '')}/prompt` })}`
		: undefined);
	let providers = $state<Provider[]>([]);
	let agents = $state<Agent[]>([]);
	let prompt = $state(browser ? sessionStorage.getItem(draftKey) ?? '' : '');
	let modelValue = $state('');
	let agent = $state('');
	let variant = $state('');
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (browser) sessionStorage.setItem(draftKey, prompt);
	});

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!sessionID || !directory || !modelValue || !agent || !prompt.trim() || submitting) return;
		submitting = true;
		error = null;
		try {
			const model = JSON.parse(modelValue) as { providerID: string; modelID: string };
			await opencodeV2.session.promptAsync({ sessionID, directory, model, agent, variant: variant || undefined, parts: [{ type: 'text', text: prompt.trim() }] });
			sessionStorage.removeItem(draftKey);
			await goto(`/session/${encodeURIComponent(sessionID)}`);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to send the follow-up.';
			submitting = false;
		}
	}

	onMount(async () => {
		if (!sessionID) {
			error = 'The session ID is missing.';
			loading = false;
			return;
		}
		try {
			const session = (await opencode.session.get({ path: { id: sessionID } })) as unknown as { directory: string };
			directory = session.directory;
			const [providerResponse, agentResponse, sessionOptions] = await Promise.all([
				opencodeV2.provider.list({ directory }) as unknown as Promise<ProviderListResponse>,
				opencodeV2.app.agents({ directory }) as unknown as Promise<AppAgentsResponse>,
				opencodeV2.session.get({ sessionID, directory }) as unknown as Promise<Session>
			]);
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
			error = cause instanceof Error ? cause.message : 'Unable to load chat options.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head><title>Follow up</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
	<header>
		<a class="back" href={`/session/${encodeURIComponent(sessionID ?? '')}`}>Back to thread</a>
		<p class="eyebrow">Follow up</p>
		<h1>What should happen next?</h1>
	</header>
	{#if loading}
		<p class="status">Loading models and agents...</p>
	{:else}
		<PromptComposer bind:value={prompt} onsubmit={submit} label="Follow-up prompt" placeholder="Ask a follow-up..." rows={7} disabled={submitting || !directory} submitDisabled={!modelValue || !agent} submitLabel={submitting ? 'Sending...' : 'Send follow-up'} {error} {terminalHref}>
			<ChatOptions {providers} {agents} bind:modelValue bind:agent bind:variant disabled={submitting} />
		</PromptComposer>
	{/if}
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; min-width: 20rem; background: #111315; color: #f1f3f3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { display: flex; min-height: 100dvh; max-width: 46rem; flex-direction: column; margin: 0 auto; padding: 1.25rem 1rem max(1.5rem, env(safe-area-inset-bottom)); }
	header { margin-bottom: 1.5rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	a:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { max-width: 14ch; margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; color: #aeb8b7; }
	:global(form) { margin-top: auto; }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
