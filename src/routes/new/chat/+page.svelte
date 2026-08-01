<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Agent, AppAgentsResponse, Provider, ProviderListResponse, Session } from '@opencode-ai/sdk/v2/client';
	import { opencodeV2 } from '$lib/opencode';
	import PromptComposer from '$lib/PromptComposer.svelte';
	import ChatOptions from '$lib/ChatOptions.svelte';

	const directory = $derived(page.url.searchParams.get('directory'));
	let providers = $state<Provider[]>([]);
	let agents = $state<Agent[]>([]);
	let prompt = $state('');
	let modelValue = $state('');
	let agent = $state('');
	let variant = $state('');
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	function selectInitialModel(defaults: Record<string, string>) {
		const provider = providers[0];
		if (!provider) return;
		const modelID = defaults[provider.id] ?? Object.keys(provider.models)[0];
		if (modelID) modelValue = modelOptionValue(provider.id, modelID);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!directory || !modelValue || !agent || !prompt.trim() || submitting) return;

		submitting = true;
		error = null;

		try {
			const model = JSON.parse(modelValue) as { providerID: string; modelID: string };
			const session = (await opencodeV2.session.create({
				directory,
				agent,
				model: { id: model.modelID, providerID: model.providerID, variant: variant || undefined }
			})) as unknown as Session;

			await opencodeV2.session.promptAsync({
				sessionID: session.id,
				directory,
				agent,
				model,
				variant: variant || undefined,
				parts: [{ type: 'text', text: prompt.trim() }]
			});

			await goto(`/session/${encodeURIComponent(session.id)}`);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to start the thread.';
			submitting = false;
		}
	}

	onMount(async () => {
		if (!directory) {
			loading = false;
			return;
		}

		try {
			const [providerResponse, agentResponse] = await Promise.all([
				opencodeV2.provider.list({ directory }) as unknown as Promise<ProviderListResponse>,
				opencodeV2.app.agents({ directory }) as unknown as Promise<AppAgentsResponse>
			]);
			const connected = new Set(providerResponse.connected);
			providers = providerResponse.all.filter(
				(provider) => connected.has(provider.id) && Object.keys(provider.models).length > 0
			);
			agents = agentResponse.filter(
				(candidate) => !candidate.hidden && (candidate.mode === 'primary' || candidate.mode === 'all')
			);

			selectInitialModel(providerResponse.default);
			agent = agents.find((candidate) => candidate.name === 'build')?.name ?? agents[0]?.name ?? '';
			if (providers.length === 0) error = 'No connected providers with models are available.';
			else if (agents.length === 0) error = 'No chat agents are available.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load chat options.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>New thread</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<header>
		<a class="back" href="/new">Choose another directory</a>
		<p class="eyebrow">New thread</p>
		<h1>What do you want to build?</h1>
		{#if directory}<p class="directory">{directory}</p>{/if}
	</header>

	{#if !directory}
		<section class="status error">
			<strong>No directory selected.</strong>
			<a href="/new">Choose a directory</a>
		</section>
	{:else if loading}
		<p class="status">Loading models and agents...</p>
	{:else}
		<PromptComposer
			bind:value={prompt}
			onsubmit={submit}
			label="Initial prompt"
			placeholder="Describe the task, bug, or idea..."
			rows={7}
			disabled={submitting}
			submitDisabled={!modelValue || !agent}
			submitLabel={submitting ? 'Starting thread...' : 'Start thread'}
			{error}
		>
			<ChatOptions {providers} {agents} bind:modelValue bind:agent bind:variant disabled={submitting} />
		</PromptComposer>
	{/if}
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; min-width: 20rem; background: #111315; color: #f1f3f3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 1.5rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	a:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { max-width: 12ch; margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	.directory { margin: 0.85rem 0 0; color: #788382; font-family: ui-monospace, monospace; font-size: 0.72rem; overflow-wrap: anywhere; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; color: #aeb8b7; }
	.status.error { display: grid; gap: 0.55rem; border-color: #603638; color: #ffb4b8; }
	.status a { width: fit-content; color: #79ddc0; font-size: 0.85rem; }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
