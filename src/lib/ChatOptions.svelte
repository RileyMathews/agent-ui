<script lang="ts">
	import type { AgentInfo, ModelInfo } from '@opencode/client';

	let {
		models,
		agents,
		modelValue = $bindable(),
		agent = $bindable(),
		variant = $bindable(),
		disabled = false
	}: {
		models: ModelInfo[];
		agents: AgentInfo[];
		modelValue: string;
		agent: string;
		variant: string;
		disabled?: boolean;
	} = $props();

	const selectedModel = $derived.by(() => {
		if (!modelValue) return undefined;
		const selected = JSON.parse(modelValue) as { providerID: string; modelID: string };
		return models.find((model) => model.providerID === selected.providerID && model.modelID === selected.modelID);
	});
	const variants = $derived(selectedModel?.variants.map((variant) => variant.id) ?? []);

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
		<select bind:value={modelValue} onchange={handleModelChange} disabled={disabled || models.length === 0}>
			{#each models as model (`${model.providerID}/${model.modelID}`)}
				<option value={modelOptionValue(model.providerID, model.modelID)}>{model.providerID} / {model.name}</option>
			{/each}
		</select>
	</label>

	<label>
		<span>Agent</span>
		<select bind:value={agent} disabled={disabled || agents.length === 0}>
			{#each agents as item (item.id)}
				<option value={item.id}>{item.name}</option>
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
	.controls { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.75fr) minmax(0, 0.75fr); gap: 0.55rem; padding-top: 0.65rem; border-top: 1px solid var(--color-border); }
	label { min-width: 0; }
	span { display: block; margin: 0 0 0.3rem 0.15rem; color: #788382; font-size: 0.62rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
	select { width: 100%; min-width: 0; height: 2.65rem; padding: 0 2rem 0 0.7rem; border: 1px solid #343c3d; border-radius: 0.6rem; background: #222729; color: #dce1e0; font: inherit; font-size: 0.78rem; text-transform: capitalize; }
	select:focus-visible { outline: var(--focus-ring); outline-offset: 3px; }
	select:disabled { color: #687170; opacity: 0.7; }
</style>
