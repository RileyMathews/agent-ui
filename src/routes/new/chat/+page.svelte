<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Agent, AppAgentsResponse, Provider, ProviderListResponse, Session } from '@opencode-ai/sdk/v2/client';
	import { opencodeV2 } from '$lib/opencode';

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

	const selectedModel = $derived.by(() => {
		if (!modelValue) return undefined;
		const selected = JSON.parse(modelValue) as { providerID: string; modelID: string };
		return providers.find((provider) => provider.id === selected.providerID)?.models[selected.modelID];
	});
	const variants = $derived(Object.keys(selectedModel?.variants ?? {}));

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	function selectInitialModel(defaults: Record<string, string>) {
		const provider = providers[0];
		if (!provider) return;
		const modelID = defaults[provider.id] ?? Object.keys(provider.models)[0];
		if (modelID) modelValue = modelOptionValue(provider.id, modelID);
	}

	function handleModelChange() {
		variant = '';
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
		<form onsubmit={submit}>
			<label class="prompt-label" for="prompt">Initial prompt</label>
			<textarea
				id="prompt"
				bind:value={prompt}
				placeholder="Describe the task, bug, or idea..."
				rows="7"
				disabled={submitting}
			></textarea>

			<div class="controls">
				<label>
					<span>Model</span>
					<select bind:value={modelValue} onchange={handleModelChange} disabled={submitting || providers.length === 0}>
						{#each providers as provider (provider.id)}
							<optgroup label={provider.name}>
								{#each Object.values(provider.models) as model (model.id)}
									<option value={modelOptionValue(provider.id, model.id)}>{model.name}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>

				<label>
					<span>Agent</span>
					<select bind:value={agent} disabled={submitting || agents.length === 0}>
						{#each agents as item (item.name)}
							<option value={item.name}>{item.name}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Reasoning</span>
					<select bind:value={variant} disabled={submitting || variants.length === 0}>
						<option value="">Default</option>
						{#each variants as item (item)}
							<option value={item}>{item}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if error}<p class="form-error" role="alert">{error}</p>{/if}

			<button type="submit" disabled={submitting || !prompt.trim() || !modelValue || !agent}>
				{submitting ? 'Starting thread...' : 'Start thread'}
				<span aria-hidden="true">→</span>
			</button>
		</form>
	{/if}
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(body) { margin: 0; min-width: 20rem; background: #111315; color: #f1f3f3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 1.5rem; }
	.back { display: inline-block; margin-bottom: 1.75rem; color: #aeb8b7; font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	a:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	.eyebrow { margin: 0 0 0.4rem; color: #79ddc0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
	h1 { max-width: 12ch; margin: 0; font-size: clamp(2rem, 8vw, 2.75rem); letter-spacing: -0.055em; line-height: 1; }
	.directory { margin: 0.85rem 0 0; color: #788382; font-family: ui-monospace, monospace; font-size: 0.72rem; overflow-wrap: anywhere; }
	.status { margin: 0; padding: 1rem 1.1rem; border: 1px solid #2c3334; border-radius: 0.75rem; background: #1a1e20; color: #aeb8b7; }
	.status.error { display: grid; gap: 0.55rem; border-color: #603638; color: #ffb4b8; }
	.status a { width: fit-content; color: #79ddc0; font-size: 0.85rem; }
	form { padding: 0.65rem; border: 1px solid #303738; border-radius: 1rem; background: #191d1f; box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.16); }
	.prompt-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	textarea { display: block; width: 100%; min-height: 10rem; resize: vertical; padding: 0.8rem; border: 0; border-radius: 0.65rem; background: transparent; color: #f6f7f7; font: inherit; font-size: 1rem; line-height: 1.55; }
	textarea::placeholder { color: #707a79; }
	textarea:focus-visible { outline-offset: -2px; }
	.controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr); gap: 0.55rem; padding-top: 0.65rem; border-top: 1px solid #2c3334; }
	.controls label { min-width: 0; }
	.controls label:first-child { grid-column: 1 / -1; }
	.controls span { display: block; margin: 0 0 0.3rem 0.15rem; color: #788382; font-size: 0.62rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
	select { width: 100%; min-width: 0; height: 2.65rem; padding: 0 2rem 0 0.7rem; border: 1px solid #343c3d; border-radius: 0.6rem; background: #222729; color: #dce1e0; font: inherit; font-size: 0.78rem; text-transform: capitalize; }
	select:disabled { color: #687170; opacity: 0.7; }
	.form-error { margin: 0.75rem 0.15rem 0; color: #ffb4b8; font-size: 0.82rem; line-height: 1.4; }
	button { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 0.65rem; padding: 0.85rem 1rem; border: 0; border-radius: 0.7rem; background: #79ddc0; color: #111315; font: inherit; font-size: 0.88rem; font-weight: 800; cursor: pointer; }
	button span { font-size: 1.1rem; }
	button:disabled { cursor: not-allowed; opacity: 0.42; }
	@media (hover: hover) { button:not(:disabled):hover { background: #91e7ce; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } form { padding: 0.8rem; } .controls { grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.75fr) minmax(0, 0.75fr); } .controls label:first-child { grid-column: auto; } }
</style>
