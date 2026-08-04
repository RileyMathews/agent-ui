<script lang="ts">
	import { onMount } from 'svelte';
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
		terminalHref,
		fullPage = false,
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
		terminalHref?: string;
		fullPage?: boolean;
		children?: Snippet;
		onsubmit: (event: SubmitEvent) => void;
	} = $props();

	let textarea: HTMLTextAreaElement;
	let keyboardOffset = $state(0);

	function resizeTextarea() {
		if (fullPage) {
			textarea.style.overflowY = 'auto';
			return;
		}
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

	onMount(() => {
		if (!fullPage) return;

		const viewport = window.visualViewport;
		function updateViewport() {
			keyboardOffset = viewport
				? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
				: 0;
		}

		updateViewport();
		window.addEventListener('resize', updateViewport);
		viewport?.addEventListener('resize', updateViewport);
		viewport?.addEventListener('scroll', updateViewport);

		return () => {
			window.removeEventListener('resize', updateViewport);
			viewport?.removeEventListener('resize', updateViewport);
			viewport?.removeEventListener('scroll', updateViewport);
		};
	});
</script>

<form
	class:full-page={fullPage}
	style={`--keyboard-offset: ${keyboardOffset}px;`}
	{onsubmit}
>
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

	<div class="bottom-controls">
		{#if children}{@render children()}{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<div class="actions">
			{#if terminalHref}
				<a class="terminal" href={terminalHref} aria-label="Open terminal" title="Open terminal">
					<span aria-hidden="true">&gt;_</span>
				</a>
			{/if}
			<button type="submit" disabled={disabled || submitDisabled || !value.trim()}>
				{submitLabel}
				<span aria-hidden="true">→</span>
			</button>
		</div>
	</div>
</form>

<style>
	form { padding: 0.65rem; border: 1px solid #303738; border-radius: 1rem; background: var(--color-surface); box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.16); }
	label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	textarea { display: block; width: 100%; min-height: 4.75rem; max-height: 15rem; resize: none; overflow-y: hidden; padding: 0.8rem; border: 0; border-radius: 0.65rem; background: transparent; color: #f6f7f7; font: inherit; font-size: 1rem; line-height: 1.55; }
	textarea::placeholder { color: #707a79; }
	textarea:focus-visible, button:focus-visible, a:focus-visible { outline: var(--focus-ring); outline-offset: -2px; }
	textarea:disabled { opacity: 0.65; }
	.error { margin: 0.75rem 0.15rem 0; color: var(--color-error); font-size: 0.82rem; line-height: 1.4; }
	.actions { display: flex; gap: 0.55rem; margin-top: 0.65rem; }
	button { display: flex; flex: 1; align-items: center; justify-content: space-between; min-width: 0; padding: 0.85rem 1rem; border: 0; border-radius: 0.7rem; background: var(--color-accent); color: var(--color-background); font: inherit; font-size: 0.88rem; font-weight: 800; cursor: pointer; }
	button span { font-size: 1.1rem; }
	.terminal { display: grid; flex: 0 0 3.2rem; place-items: center; border: 1px solid #3a4544; border-radius: 0.7rem; background: #242a2b; color: #cdd5d4; font-family: ui-monospace, monospace; font-size: 0.78rem; font-weight: 800; text-decoration: none; }
	button:disabled { cursor: not-allowed; opacity: 0.42; }
	form.full-page { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
	.full-page textarea { height: 12rem; min-height: 12rem; max-height: 12rem; padding: 1rem 0.25rem; overflow-y: auto; }
	.full-page .bottom-controls { position: sticky; z-index: 1; bottom: var(--keyboard-offset); padding: 0.7rem 1rem max(0.7rem, env(safe-area-inset-bottom)); background: var(--color-background); }
	@media (hover: hover) { button:not(:disabled):hover { background: #91e7ce; } .terminal:hover { border-color: #5b6d6a; background: #2d3535; } }
	@media (min-width: 40rem) { form { padding: 0.8rem; } .full-page .bottom-controls { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
