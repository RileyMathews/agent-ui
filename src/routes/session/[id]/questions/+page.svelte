<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
	import {
		answerQuestion,
		listPendingQuestions,
		rejectQuestion,
		type PendingQuestion
	} from '$lib/questions';

	const sessionID = page.params.id;
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const threadHref = server && project ? sessionHref(sessionID ?? '', server.id, project.id) : '/';
	let directory = $state<string | undefined>();
	let requests = $state<PendingQuestion[]>([]);
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let answers = $state<string[][]>([]);
	let customAnswers = $state<string[]>([]);

	const request = $derived(requests[0]);
	let questionIndex = $state(0);
	const question = $derived(request?.questions[questionIndex]);

	function selected(label: string) {
		return (answers[questionIndex] ?? []).includes(label);
	}

	function choose(label: string) {
		if (!question) return;
		const current = answers[questionIndex] ?? [];
		const next = question.multiple
			? current.includes(label) ? current.filter((value) => value !== label) : [...current, label]
			: current.includes(label) ? [] : [label];
		answers = [...answers.slice(0, questionIndex), next, ...answers.slice(questionIndex + 1)];
	}

	function setCustomAnswer(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		customAnswers = [...customAnswers.slice(0, questionIndex), value, ...customAnswers.slice(questionIndex + 1)];
	}

	function currentAnswer() {
		const selectedAnswers = answers[questionIndex] ?? [];
		const custom = customAnswers[questionIndex]?.trim();
		return custom ? [...selectedAnswers, custom] : selectedAnswers;
	}

	function canContinue() {
		return currentAnswer().length > 0;
	}

	function nextQuestion() {
		if (!request || !canContinue()) return;
		if (questionIndex < request.questions.length - 1) questionIndex += 1;
		else void submitRequest();
	}

	function previousQuestion() {
		if (questionIndex > 0) questionIndex -= 1;
	}

	async function loadQuestions() {
		if (!sessionID || !server || !project) {
			error = 'The question link is missing its project or server.';
			loading = false;
			return;
		}

		try {
			const session = (await getOpencode(server.url).session.get({ path: { id: sessionID }, query: { directory: project.directory } })) as unknown as { directory: string };
			directory = session.directory;
			requests = await listPendingQuestions(server.url, session.directory, sessionID);
			if (requests.length === 0) questionIndex = 0;
			else if (questionIndex >= requests[0].questions.length) questionIndex = 0;
			error = null;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to load pending questions.';
		} finally {
			loading = false;
		}
	}

	async function submitRequest() {
		if (!request || !directory || !server || submitting || !canContinue()) return;
		submitting = true;
		error = null;
		try {
			const allAnswers = answers.map((value, index) => {
				const custom = customAnswers[index]?.trim();
				return custom ? [...value, custom] : value;
			});
			await answerQuestion(server.url, directory, request.id, allAnswers);
			requests = requests.filter((candidate) => candidate.id !== request.id);
			answers = [];
			customAnswers = [];
			questionIndex = 0;
			if (requests.length === 0) await goto(threadHref);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to submit these answers.';
		} finally {
			submitting = false;
		}
	}

	async function reject() {
		if (!request || !directory || !server || submitting) return;
		submitting = true;
		error = null;
		try {
			await rejectQuestion(server.url, directory, request.id);
			requests = requests.filter((candidate) => candidate.id !== request.id);
			answers = [];
			customAnswers = [];
			questionIndex = 0;
			if (requests.length === 0) await goto(threadHref);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to dismiss this question.';
		} finally {
			submitting = false;
		}
	}

	onMount(() => {
		const resume = () => {
			if (!document.hidden && !submitting) void loadQuestions();
		};
		void loadQuestions();
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

<svelte:head><title>Answer questions</title><meta name="theme-color" content="#111315" /></svelte:head>

<main>
	<header>
		<a class="back" href={threadHref}>Back to thread</a>
		<p class="eyebrow">Agent input</p>
		<h1>Answer questions</h1>
		<p class="intro">The agent is waiting for your answers before it can continue.</p>
	</header>

	{#if loading}
		<p class="status"><span class="spinner" aria-hidden="true"></span> Loading questions...</p>
	{:else if error}
		<p class="status error" role="alert">{error}</p>
	{:else if !request || !question}
		<section class="empty-state">
			<h2>No pending questions</h2>
			<p>This request may have already been answered in another tab.</p>
			<a class="primary" href={threadHref}>Return to thread</a>
		</section>
	{:else}
		<section class="question-panel" aria-labelledby="question-heading">
			<div class="progress" aria-label={`Question ${questionIndex + 1} of ${request.questions.length}`}>
				<span>Question {questionIndex + 1} of {request.questions.length}</span>
				<span>{question.header}</span>
			</div>
			<h2 id="question-heading">{question.question}</h2>
			<div class="options" role={question.multiple ? 'group' : 'radiogroup'} aria-label={question.header}>
				{#each question.options as option}
					<label class="option" class:selected={selected(option.label)}>
						<input
							type={question.multiple ? 'checkbox' : 'radio'}
							name={`question-${questionIndex}`}
							value={option.label}
							checked={selected(option.label)}
							onchange={() => choose(option.label)}
						/>
						<span>
							<strong>{option.label}</strong>
							<small>{option.description}</small>
						</span>
					</label>
				{/each}
			</div>
			{#if question.custom}
				<label class="custom-answer">
					<span>Your answer</span>
					<input value={customAnswers[questionIndex] ?? ''} oninput={setCustomAnswer} placeholder="Type a custom answer" />
				</label>
			{/if}
			<div class="actions">
				<button class="secondary" type="button" onclick={previousQuestion} disabled={questionIndex === 0 || submitting}>Back</button>
				<button class="primary" type="button" onclick={nextQuestion} disabled={!canContinue() || submitting}>{questionIndex === request.questions.length - 1 ? (submitting ? 'Sending...' : 'Send answers') : 'Next'}</button>
			</div>
			<button class="reject" type="button" onclick={reject} disabled={submitting}>Dismiss question</button>
		</section>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; }
	header { margin-bottom: 2rem; }
	.back { display: inline-block; margin-bottom: 2.5rem; color: var(--color-muted); font-size: 0.85rem; text-decoration: none; }
	.back::before { content: '← '; }
	.eyebrow { margin: 0 0 0.45rem; color: var(--color-accent); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2.25rem, 11vw, 3.25rem); letter-spacing: -0.07em; line-height: 0.92; }
	.intro { max-width: 28rem; margin: 1rem 0 0; color: var(--color-muted); line-height: 1.5; }
	a:focus-visible, button:focus-visible, input:focus-visible { outline: var(--focus-ring); outline-offset: 3px; }
	.status, .empty-state, .question-panel { border: 1px solid var(--color-border); border-radius: 0.9rem; background: var(--color-panel); }
	.status { display: flex; align-items: center; gap: 0.55rem; margin: 0; padding: 1rem 1.1rem; color: var(--color-muted); }
	.status.error { border-color: #603638; color: var(--color-error); }
	.spinner { width: 0.8rem; height: 0.8rem; border: 2px solid #53605e; border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
	.empty-state { padding: 1.25rem; }
	h2 { margin: 0; font-size: 1.2rem; letter-spacing: -0.025em; }
	.empty-state p { color: var(--color-muted); line-height: 1.5; }
	.question-panel { padding: 1rem; }
	.progress { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1.2rem; color: var(--color-muted); font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
	.progress span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.question-panel h2 { font-size: clamp(1.4rem, 7vw, 2rem); line-height: 1.1; }
	.options { display: grid; gap: 0.55rem; margin-top: 1.25rem; }
	.option { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.8rem; border: 1px solid var(--color-border); border-radius: 0.7rem; cursor: pointer; }
	.option.selected { border-color: var(--color-accent); background: #1b2926; }
	.option input { flex: 0 0 auto; width: 1.05rem; height: 1.05rem; margin: 0.1rem 0 0; accent-color: var(--color-accent); }
	.option span { display: grid; gap: 0.2rem; }
	.option strong { font-size: 0.86rem; }
	.option small { color: var(--color-muted); font-size: 0.75rem; line-height: 1.4; }
	.custom-answer { display: grid; gap: 0.4rem; margin-top: 1rem; color: var(--color-muted); font-size: 0.75rem; font-weight: 750; }
	.custom-answer input { width: 100%; min-height: 2.8rem; padding: 0.7rem; border: 1px solid var(--color-border); border-radius: 0.6rem; background: #121617; color: var(--color-text); font: inherit; }
	.actions { display: grid; grid-template-columns: auto 1fr; gap: 0.55rem; margin-top: 1.35rem; }
	.actions button, .primary { display: flex; min-height: 3rem; align-items: center; justify-content: center; padding: 0.7rem 0.9rem; border: 1px solid var(--color-border); border-radius: 0.65rem; font: inherit; font-weight: 800; text-decoration: none; }
	.primary { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-background); }
	.secondary { background: #242a2b; color: var(--color-text); cursor: pointer; }
	.actions button:disabled { cursor: not-allowed; opacity: 0.45; }
	.reject { display: block; margin: 1rem auto 0; border: 0; background: none; color: var(--color-muted); cursor: pointer; font: inherit; font-size: 0.75rem; text-decoration: underline; }
	.reject:disabled { cursor: not-allowed; opacity: 0.5; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
	@media (min-width: 40rem) { main { padding-right: 1.5rem; padding-left: 1.5rem; } .question-panel { padding: 1.4rem; } }
</style>
