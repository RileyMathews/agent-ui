<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { AgentInfo, ModelInfo } from '@opencode/client';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
	import { checkProject } from '$lib/sessions';
	import PromptComposer from '$lib/PromptComposer.svelte';
	import ChatOptions from '$lib/ChatOptions.svelte';

	type ChatPreferences = {
		providerID: string;
		modelID: string;
		agent: string;
		variant: string;
	};

	const preferencesKey = 'agent-ui:chat-preferences';

	const project = $derived(getProject(page.url.searchParams.get('project')));
	const server = $derived(getServer(page.url.searchParams.get('server')));
	const directory = $derived(project?.directory);
	let checkoutAvailable = $state(false);
	const terminalHref = $derived(checkoutAvailable && directory && project && server
		? `/terminal?${new URLSearchParams({ directory, server: server.id, returnTo: `/new/chat?${new URLSearchParams({ project: project.id, server: server.id })}` })}`
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

	function defaultModel() {
		const model = models.find((candidate) => candidate.enabled);
		if (model) modelValue = modelOptionValue(model.providerID, model.modelID);
	}

	function readPreferences() {
		if (!browser) return undefined;
		try {
			const value = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null') as Partial<ChatPreferences> | null;
			if (!value || typeof value.providerID !== 'string' || typeof value.modelID !== 'string' || typeof value.agent !== 'string' || typeof value.variant !== 'string') return undefined;
			return value as ChatPreferences;
		} catch {
			return undefined;
		}
	}

	function selectInitialOptions() {
		const preferences = readPreferences();
		const preferredModel = preferences
			? models.find((model) => model.providerID === preferences.providerID && model.modelID === preferences.modelID)
			: undefined;
		if (preferences && preferredModel) modelValue = modelOptionValue(preferences.providerID, preferences.modelID);
		else defaultModel();

		agent = preferences && agents.some((candidate) => candidate.id === preferences.agent)
			? preferences.agent
			: agents.find((candidate) => candidate.id === 'build')?.id ?? agents[0]?.id ?? '';
		variant = preferences?.variant && preferredModel?.variants.some((candidate) => candidate.id === preferences.variant)
			? preferences.variant
			: '';
	}

	function savePreferences(model: { providerID: string; modelID: string }) {
		if (!browser) return;
		try {
			localStorage.setItem(preferencesKey, JSON.stringify({ ...model, agent, variant } satisfies ChatPreferences));
		} catch {
			// Starting a thread should still succeed when browser storage is unavailable.
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!directory || !project || !server || !modelValue || !agent || !prompt.trim() || submitting) return;

		submitting = true;
		error = null;

		try {
			const opencode = getOpencode(server.url);
			const selectedModel = JSON.parse(modelValue) as { providerID: string; modelID: string };
			const model = { id: selectedModel.modelID, providerID: selectedModel.providerID, variant: variant || undefined };
			const session = await opencode.session.create({
				location: { directory },
				agent,
				model
			});

			try {
				await opencode.session.prompt({
					sessionID: session.id,
					text: prompt.trim()
				});
			} catch (cause) {
				await opencode.session.remove({ sessionID: session.id }).catch(() => undefined);
				throw cause;
			}

			savePreferences(selectedModel);
			await goto(sessionHref(session.id, server.id, project.id));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to start the thread.';
			submitting = false;
		}
	}

	async function loadOptions() {
		if (!directory || !project || !server) {
			loading = false;
			return;
		}
		const activeRequest = ++optionsRequest;
		loading = true;
		error = null;
		checkoutAvailable = false;
		try {
			const availability = await checkProject(project, server);
			if (!availability.available) {
				throw new Error(availability.error ? 'The selected server is unreachable.' : `The project is not checked out at ${directory}.`);
			}
			checkoutAvailable = true;
			const opencode = getOpencode(server.url);
			const [modelResponse, agentResponse] = await Promise.all([
				opencode.model.list({ location: { directory } }),
				opencode.agent.list({ location: { directory } })
			]);
			if (activeRequest !== optionsRequest) return;
			models = modelResponse.data.filter((model) => model.enabled);
			agents = agentResponse.data.filter(
				(candidate) => !candidate.hidden && (candidate.mode === 'primary' || candidate.mode === 'all')
			);

			selectInitialOptions();
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

<svelte:head>
	<title>New thread</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<header>
		<a class="back" href={project ? `/new?project=${project.id}` : '/new'}>Choose another server</a>
	</header>

	{#if !directory || !project || !server}
		<section class="status error">
			<strong>No valid project and server selected.</strong>
			<a href="/new">Choose a project</a>
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
			fullPage
			disabled={submitting}
			submitDisabled={!modelValue || !agent}
			submitLabel={submitting ? 'Starting thread...' : 'Start thread'}
			{error}
			{terminalHref}
		>
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
	.status.error { display: grid; gap: 0.55rem; border-color: #603638; color: var(--color-error); }
	.status a { width: fit-content; color: var(--color-accent); font-size: 0.85rem; }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } }
</style>
