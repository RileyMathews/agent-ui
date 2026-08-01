<script lang="ts">
	import type { Agent, Provider } from '@opencode-ai/sdk/v2/client';

	let {
		providers,
		agents,
		modelValue = $bindable(),
		agent = $bindable(),
		variant = $bindable(),
		disabled = false
	}: {
		providers: Provider[];
		agents: Agent[];
		modelValue: string;
		agent: string;
		variant: string;
		disabled?: boolean;
	} = $props();

	const selectedModel = $derived.by(() => {
		if (!modelValue) return undefined;
		const selected = JSON.parse(modelValue) as { providerID: string; modelID: string };
		return providers.find((provider) => provider.id === selected.providerID)?.models[selected.modelID];
	});
	const variants = $derived(Object.keys(selectedModel?.variants ?? {}));

	function modelOptionValue(providerID: string, modelID: string) {
		return JSON.stringify({ providerID, modelID });
	}

	function handleModelChange() {
		variant = '';
	}
</script>

<div class="controls">
	<label>
		<span>Model</span>
		<select bind:value={modelValue} onchange={handleModelChange} disabled={disabled || providers.length === 0}>
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
		<select bind:value={agent} disabled={disabled || agents.length === 0}>
			{#each agents as item (item.name)}
				<option value={item.name}>{item.name}</option>
			{/each}
		</select>
	</label>

	<label>
		<span>Reasoning</span>
		<select bind:value={variant} disabled={disabled || variants.length === 0}>
			<option value="">Default</option>
			{#each variants as item (item)}
				<option value={item}>{item}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.72fr); gap: 0.55rem; padding-top: 0.65rem; border-top: 1px solid #2c3334; }
	label { min-width: 0; }
	label:first-child { grid-column: 1 / -1; }
	span { display: block; margin: 0 0 0.3rem 0.15rem; color: #788382; font-size: 0.62rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
	select { width: 100%; min-width: 0; height: 2.65rem; padding: 0 2rem 0 0.7rem; border: 1px solid #343c3d; border-radius: 0.6rem; background: #222729; color: #dce1e0; font: inherit; font-size: 0.78rem; text-transform: capitalize; }
	select:focus-visible { outline: 2px solid #79ddc0; outline-offset: 3px; }
	select:disabled { color: #687170; opacity: 0.7; }
	@media (min-width: 40rem) {
		.controls { grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.75fr) minmax(0, 0.75fr); }
		label:first-child { grid-column: auto; }
	}
</style>
