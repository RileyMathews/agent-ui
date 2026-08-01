<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { Part, SessionMessagesResponse, TextPart, ToolPart } from '@opencode-ai/sdk/client';
	import { opencode } from '$lib/opencode';

	type HistoryMessage = SessionMessagesResponse[number];

	const sessionID = page.params.id;
	let messages = $state<HistoryMessage[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);

	function textParts(parts: Part[]): TextPart[] {
		return parts.filter((part): part is TextPart => part.type === 'text' && !part.ignored);
	}

	function toolParts(parts: Part[]): ToolPart[] {
		return parts.filter((part): part is ToolPart => part.type === 'tool');
	}

	onMount(async () => {
		if (!sessionID) {
			error = 'The session ID is missing.';
			loading = false;
			return;
		}

		try {
			// The generated SDK types do not preserve the client's responseStyle setting.
			messages = (await opencode.session.messages({ path: { id: sessionID } })) as unknown as HistoryMessage[];
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load session history.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Session history</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
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
				<article class:user={message.info.role === 'user'}>
					{#each text as part (part.id)}
						<p class="message-text">{part.text}</p>
					{/each}
					{#if tools.length > 0}
						<p class="tools">{tools.map((part) => part.tool).join(' · ')}</p>
					{/if}
					{#if text.length === 0 && tools.length === 0}
						<p class="empty">No displayable content.</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
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

	main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
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
	.tools { margin: 0.9rem 0 0; color: #9ca9a7; font-family: ui-monospace, monospace; font-size: 0.75rem; overflow-wrap: anywhere; }
	.user .tools { color: #d9ecff; }
	.empty { margin: 0; color: #788382; font-style: italic; }

	@media (min-width: 40rem) {
		main { padding-right: 1.5rem; padding-left: 1.5rem; }
		article.user { padding: 1rem 1.25rem; }
	}
</style>
