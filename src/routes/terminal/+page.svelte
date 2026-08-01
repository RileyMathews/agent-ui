<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { Pty } from '@opencode-ai/sdk/v2/client';
	import Terminal from '$lib/Terminal.svelte';
	import { opencodeV2 } from '$lib/opencode';

	type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'exited' | 'error';

	const directory = $derived(page.url.searchParams.get('directory'));
	const requestedReturnTo = $derived(page.url.searchParams.get('returnTo'));
	const returnTo = $derived(requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/');
	let pty = $state<Pty | undefined>();
	let connectionState = $state<ConnectionState>('connecting');
	let detail = $state('Starting shell');
	let closing = $state(false);
	let removed = false;

	function updateState(next: ConnectionState, message?: string) {
		connectionState = next;
		detail = message ?? ({
			connecting: 'Connecting',
			connected: 'Connected',
			reconnecting: 'Reconnecting',
			offline: 'Offline',
			exited: 'Shell exited',
			error: 'Terminal unavailable'
		} satisfies Record<ConnectionState, string>)[next];
	}

	async function removeTerminal() {
		if (!pty || removed) return;
		removed = true;
		await opencodeV2.v2.pty.remove({
			ptyID: pty.id,
			location: { directory: directory ?? undefined }
		}).catch(() => undefined);
	}

	async function close() {
		if (closing) return;
		closing = true;
		await removeTerminal();
		await goto(returnTo);
	}

	onMount(() => {
		let disposed = false;
		if (!directory) {
			connectionState = 'error';
			detail = 'No directory was selected';
			return undefined;
		}

		void opencodeV2.v2.pty.create({
			location: { directory },
			title: 'Agent UI terminal'
		}).then((response) => {
			if (disposed) {
				const created = response as unknown as { data: Pty };
				void opencodeV2.v2.pty.remove({ ptyID: created.data.id, location: { directory } }).catch(() => undefined);
				return;
			}
			pty = (response as unknown as { data: Pty }).data;
		}).catch((cause) => {
			if (disposed) return;
			connectionState = 'error';
			detail = cause instanceof Error ? cause.message : 'Unable to start a shell';
		});

		return () => {
			disposed = true;
			void removeTerminal();
		};
	});
</script>

<svelte:head>
	<title>Terminal</title>
	<meta name="theme-color" content="#0b0d0e" />
</svelte:head>

<main>
	<header>
		<button class="close" type="button" onclick={close} disabled={closing} aria-label="Close terminal">
			<span aria-hidden="true">←</span>
		</button>
		<span class="sr-only" role="status">{detail}</span>
	</header>

	<section class="screen">
		{#if pty && directory}
			<Terminal ptyID={pty.id} {directory} onstate={updateState} />
		{:else}
			<div class="status" class:error={connectionState === 'error'}>
				{#if connectionState === 'connecting'}<span class="spinner" aria-hidden="true"></span>{/if}
				<p>{detail}</p>
				{#if connectionState === 'error'}<button type="button" onclick={close}>Go back</button>{/if}
			</div>
		{/if}
	</section>
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html), :global(body) { height: 100%; overflow: hidden; }
	:global(body) { margin: 0; min-width: 20rem; background: #0b0d0e; color: #d8dfdd; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	main { display: grid; width: 100%; height: 100dvh; grid-template-rows: auto minmax(0, 1fr); padding-top: env(safe-area-inset-top); background: #0b0d0e; }
	header { display: flex; align-items: center; min-height: 3.25rem; padding: 0.35rem max(0.5rem, env(safe-area-inset-right)) 0.35rem max(0.5rem, env(safe-area-inset-left)); border-bottom: 1px solid #252b2c; background: #111516; }
	.close { display: grid; width: 2.5rem; height: 2.5rem; padding: 0; place-items: center; border: 0; border-radius: 0.7rem; background: #202627; color: #e6ebea; font: inherit; font-size: 1.2rem; cursor: pointer; }
	.close:focus-visible, .status button:focus-visible { outline: 2px solid #79ddc0; outline-offset: 2px; }
	.close:disabled { opacity: 0.5; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.screen { min-width: 0; min-height: 0; padding-bottom: env(safe-area-inset-bottom); overflow: hidden; }
	.status { display: grid; height: 100%; place-content: center; justify-items: center; gap: 0.8rem; color: #8c9795; font-size: 0.82rem; }
	.status p { max-width: 28rem; margin: 0; padding: 0 1rem; text-align: center; overflow-wrap: anywhere; }
	.status.error { color: #ffb4b8; }
	.status button { padding: 0.7rem 1rem; border: 0; border-radius: 0.65rem; background: #79ddc0; color: #111315; font: inherit; font-weight: 800; }
	.spinner { width: 1.1rem; height: 1.1rem; border: 2px solid #33403e; border-top-color: #79ddc0; border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.8s; } }
</style>
