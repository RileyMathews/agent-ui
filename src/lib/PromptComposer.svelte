<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		disabled = false,
		submitDisabled = false,
		placeholder = 'Describe what you want to do...',
		label = 'Prompt',
		submitLabel = 'Send',
		error,
		rows = 4,
		children,
		onsubmit
	}: {
		value: string;
		disabled?: boolean;
		submitDisabled?: boolean;
		placeholder?: string;
		label?: string;
		submitLabel?: string;
		error?: string | null;
		rows?: number;
		children?: Snippet;
		onsubmit: (event: SubmitEvent) => void;
	} = $props();

	let textarea: HTMLTextAreaElement;

	function resizeTextarea() {
		textarea.style.height = 'auto';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
		textarea.style.overflowY = textarea.scrollHeight > 240 ? 'auto' : 'hidden';
	}

	$effect(() => {
		value;
		if (!textarea) return;
		const frame = requestAnimationFrame(resizeTextarea);
		return () => cancelAnimationFrame(frame);
	});
</script>

<form {onsubmit}>
	<label for="prompt-composer">{label}</label>
	<textarea
		bind:this={textarea}
		id="prompt-composer"
		bind:value
		oninput={resizeTextarea}
		{placeholder}
		{rows}
		{disabled}
	></textarea>

	{#if children}{@render children()}{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<button type="submit" disabled={disabled || submitDisabled || !value.trim()}>
		{submitLabel}
		<span aria-hidden="true">→</span>
	</button>
</form>

<style>
	form { padding: 0.65rem; border: 1px solid #303738; border-radius: 1rem; background: #191d1f; box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.16); }
	label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	textarea { display: block; width: 100%; min-height: 4.75rem; max-height: 15rem; resize: none; overflow-y: hidden; padding: 0.8rem; border: 0; border-radius: 0.65rem; background: transparent; color: #f6f7f7; font: inherit; font-size: 1rem; line-height: 1.55; }
	textarea::placeholder { color: #707a79; }
	textarea:focus-visible, button:focus-visible { outline: 2px solid #79ddc0; outline-offset: -2px; }
	textarea:disabled { opacity: 0.65; }
	.error { margin: 0.75rem 0.15rem 0; color: #ffb4b8; font-size: 0.82rem; line-height: 1.4; }
	button { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 0.65rem; padding: 0.85rem 1rem; border: 0; border-radius: 0.7rem; background: #79ddc0; color: #111315; font: inherit; font-size: 0.88rem; font-weight: 800; cursor: pointer; }
	button span { font-size: 1.1rem; }
	button:disabled { cursor: not-allowed; opacity: 0.42; }
	@media (hover: hover) { button:not(:disabled):hover { background: #91e7ce; } }
	@media (min-width: 40rem) { form { padding: 0.8rem; } }
</style>
