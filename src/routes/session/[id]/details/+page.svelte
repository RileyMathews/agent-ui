<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type {
		AssistantMessage,
		FileDiff,
		Part,
		ProviderListResponse,
		Session,
		SessionMessagesResponse,
		Todo,
		ToolPart,
		UserMessage
	} from '@opencode-ai/sdk/client';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';

	type HistoryMessage = SessionMessagesResponse[number];
	type SessionDetails = Session & {
		slug?: string;
		workspaceID?: string;
		path?: string;
		agent?: string;
		model?: { id: string; providerID: string; variant?: string };
		cost?: number;
		tokens?: TokenCounts;
		metadata?: Record<string, unknown>;
		time: Session['time'] & { archived?: number };
	};
	type TokenCounts = AssistantMessage['tokens'];
	type ChildSession = Session & { cost?: number; tokens?: TokenCounts };
	type DetailedDiff = FileDiff & { status?: string };
	type ToolSummary = { name: string; count: number; failed: number; duration: number };
	type ModelSummary = { name: string; responses: number; tokens: number; cost: number };

	const sessionID = page.params.id;
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const query = server && project ? new URLSearchParams({ server: server.id, project: project.id }) : undefined;
	const threadHref = server && project && sessionID ? sessionHref(sessionID, server.id, project.id) : '/';

	let session = $state<SessionDetails | null>(null);
	let messages = $state<HistoryMessage[]>([]);
	let diffs = $state<DetailedDiff[]>([]);
	let todos = $state<Todo[]>([]);
	let children = $state<ChildSession[]>([]);
	let contextLimit = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let unavailable = $state<string[]>([]);

	const assistantMessages = $derived(messages.map((message) => message.info).filter((info): info is AssistantMessage => info.role === 'assistant'));
	const userMessages = $derived(messages.map((message) => message.info).filter((info): info is UserMessage => info.role === 'user'));
	const totals = $derived(sumTokens(assistantMessages));
	const latestAssistant = $derived(assistantMessages.at(-1));
	const latestUsage = $derived(assistantMessages.findLast((message) => contextTokens(message.tokens) > 0));
	const latestContext = $derived(latestUsage ? contextTokens(latestUsage.tokens) : 0);
	const contextPercent = $derived(contextLimit ? Math.min(100, latestContext / contextLimit * 100) : 0);
	const totalCost = $derived(session?.cost ?? assistantMessages.reduce((sum, message) => sum + message.cost, 0));
	const toolParts = $derived(messages.flatMap((message) => message.parts.filter((part): part is ToolPart => part.type === 'tool')));
	const toolSummary = $derived(summarizeTools(toolParts));
	const modelSummary = $derived(summarizeModels(assistantMessages));
	const failedTools = $derived(toolParts.filter((part) => part.state.status === 'error').length);
	const compactionCount = $derived(assistantMessages.filter((message) => message.summary).length);
	const completedResponses = $derived(assistantMessages.filter((message) => message.time.completed));
	const responseDuration = $derived(completedResponses.reduce((sum, message) => sum + (message.time.completed! - message.time.created), 0));
	const partCounts = $derived(messages.flatMap((message) => message.parts).reduce<Record<string, number>>((counts, part) => {
		counts[part.type] = (counts[part.type] ?? 0) + 1;
		return counts;
	}, {}));
	const additions = $derived(session?.summary?.additions ?? diffs.reduce((sum, diff) => sum + diff.additions, 0));
	const deletions = $derived(session?.summary?.deletions ?? diffs.reduce((sum, diff) => sum + diff.deletions, 0));
	const fileCount = $derived(session?.summary?.files ?? diffs.length);
	const tokenPeak = $derived(Math.max(1, ...assistantMessages.map((message) => contextTokens(message.tokens))));
	const tokenTotal = $derived(Math.max(1, totals.input + totals.output + totals.reasoning + totals.cache.read + totals.cache.write));
	const costPoints = $derived(chartPoints(assistantMessages.map((message) => message.cost)));
	const linkedChildren = $derived(session ? children.filter((child) => child.time.updated > session!.time.created).length : 0);

	function sumTokens(items: AssistantMessage[]): TokenCounts {
		return items.reduce<TokenCounts>((sum, message) => ({
			input: sum.input + message.tokens.input,
			output: sum.output + message.tokens.output,
			reasoning: sum.reasoning + message.tokens.reasoning,
			cache: {
				read: sum.cache.read + message.tokens.cache.read,
				write: sum.cache.write + message.tokens.cache.write
			}
		}), { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } });
	}

	function contextTokens(tokens: TokenCounts) {
		return tokens.input + tokens.cache.read + tokens.cache.write + tokens.output;
	}

	function formatNumber(value: number) {
		return new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
	}

	function formatCost(value: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value < 0.01 ? 4 : 2, maximumFractionDigits: value < 0.01 ? 4 : 2 }).format(value);
	}

	function formatDate(value: number | undefined) {
		return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : 'Not available';
	}

	function formatDuration(value: number) {
		if (value < 1000) return `${Math.round(value)} ms`;
		if (value < 60000) return `${(value / 1000).toFixed(1)} sec`;
		return `${Math.floor(value / 60000)}m ${Math.round(value % 60000 / 1000)}s`;
	}

	function toolDuration(part: ToolPart) {
		if (part.state.status !== 'completed' && part.state.status !== 'error') return 0;
		return part.state.time.end - part.state.time.start;
	}

	function summarizeTools(parts: ToolPart[]): ToolSummary[] {
		const summaries = new Map<string, ToolSummary>();
		for (const part of parts) {
			const current = summaries.get(part.tool) ?? { name: part.tool, count: 0, failed: 0, duration: 0 };
			current.count += 1;
			current.failed += part.state.status === 'error' ? 1 : 0;
			current.duration += toolDuration(part);
			summaries.set(part.tool, current);
		}
		return [...summaries.values()].sort((left, right) => right.count - left.count);
	}

	function summarizeModels(items: AssistantMessage[]): ModelSummary[] {
		const summaries = new Map<string, ModelSummary>();
		for (const message of items) {
			const name = `${message.providerID} / ${message.modelID}`;
			const current = summaries.get(name) ?? { name, responses: 0, tokens: 0, cost: 0 };
			current.responses += 1;
			current.tokens += contextTokens(message.tokens) + message.tokens.reasoning;
			current.cost += message.cost;
			summaries.set(name, current);
		}
		return [...summaries.values()].sort((left, right) => right.tokens - left.tokens);
	}

	function chartPoints(costs: number[]) {
		if (costs.length === 0) return '';
		let cumulative = 0;
		const values = costs.map((cost) => cumulative += cost);
		const max = Math.max(...values, 0.000001);
		return values.map((value, index) => `${costs.length === 1 ? 100 : index / (costs.length - 1) * 200},${58 - value / max * 54}`).join(' ');
	}

	function modelLimit(providers: ProviderListResponse, message: AssistantMessage | undefined) {
		if (!message) return null;
		return providers.all.find((provider) => provider.id === message.providerID)?.models[message.modelID]?.limit.context ?? null;
	}

	onMount(() => {
		if (!sessionID || !server || !project) {
			error = 'The session link is missing its project or server.';
			loading = false;
			return;
		}

		void (async () => {
			const opencode = getOpencode(server.url);
			try {
				session = await opencode.session.get({ path: { id: sessionID }, query: { directory: project.directory } }) as unknown as SessionDetails;
				const directory = session.directory;
				const results = await Promise.allSettled([
					opencode.session.messages({ path: { id: sessionID }, query: { directory } }),
					opencode.session.diff({ path: { id: sessionID }, query: { directory } }),
					opencode.session.todo({ path: { id: sessionID }, query: { directory } }),
					opencode.session.children({ path: { id: sessionID }, query: { directory } }),
					opencode.provider.list({ query: { directory } })
				]);
				const labels = ['message history', 'file changes', 'todos', 'child sessions', 'model limits'];
				unavailable = results.flatMap((result, index) => result.status === 'rejected' ? [labels[index]] : []);
				if (results[0].status === 'rejected') throw results[0].reason;
				messages = results[0].value as unknown as HistoryMessage[];
				if (results[1].status === 'fulfilled') diffs = results[1].value as unknown as DetailedDiff[];
				if (results[2].status === 'fulfilled') todos = results[2].value as unknown as Todo[];
				if (results[3].status === 'fulfilled') children = results[3].value as unknown as ChildSession[];
				if (results[4].status === 'fulfilled') contextLimit = modelLimit(results[4].value as unknown as ProviderListResponse, assistantMessages.findLast((message) => contextTokens(message.tokens) > 0));
			} catch (cause) {
				error = cause instanceof Error ? cause.message : 'Unable to load session details.';
			} finally {
				loading = false;
			}
		})();
	});
</script>

<svelte:head>
	<title>{session?.title ?? 'Session details'}</title>
	<meta name="theme-color" content="#111315" />
</svelte:head>

<main>
	<nav class="topbar" aria-label="Session details controls">
		<a class="back" href={threadHref} aria-label="Back to thread">←</a>
		<div><span>{server?.name ?? 'Unknown server'}</span><strong>{session?.title ?? 'Session details'}</strong></div>
		<a class="home" href="/" aria-label="Home dashboard">⌂</a>
	</nav>

	<header>
		<p class="eyebrow">Session telemetry</p>
		<h1>Dirty details</h1>
		<p>Tokens, spend, timing, tools, and workspace impact straight from OpenCode.</p>
	</header>

	{#if loading}
		<p class="status">Crunching the session data...</p>
	{:else if error}
		<p class="status error" role="alert">{error}</p>
	{:else if session}
		{#if unavailable.length}<p class="notice">Some details are unavailable: {unavailable.join(', ')}.</p>{/if}

		<section class="hero-grid" aria-label="Session overview">
			<article class="context-card">
				<div class="ring" style={`--usage: ${contextPercent * 3.6}deg`}>
					<div><strong>{contextLimit ? `${Math.round(contextPercent)}%` : '—'}</strong><span>context</span></div>
				</div>
				<div>
					<p class="label">Latest request</p>
					<h2>{formatNumber(latestContext)} <small>tokens</small></h2>
					<p>{contextLimit ? `${formatNumber(contextLimit)} token model window` : 'Model context limit unavailable'}</p>
				</div>
			</article>
			<article class="big-stat"><p class="label">Total token traffic</p><strong>{formatNumber(totals.input + totals.output + totals.reasoning + totals.cache.read + totals.cache.write)}</strong><span>including cache activity</span></article>
			<article class="big-stat accent"><p class="label">Recorded spend</p><strong>{formatCost(totalCost)}</strong><span>{assistantMessages.length} model responses</span></article>
		</section>

		<section class="panel">
			<div class="section-heading"><div><p class="label">Token anatomy</p><h2>Where the tokens went</h2></div><strong>{formatNumber(totals.input + totals.output + totals.reasoning)}</strong></div>
			<div class="token-bar" aria-label="Token category distribution">
				<span class="input" style={`width:${totals.input / tokenTotal * 100}%`}></span>
				<span class="output" style={`width:${totals.output / tokenTotal * 100}%`}></span>
				<span class="reasoning" style={`width:${totals.reasoning / tokenTotal * 100}%`}></span>
				<span class="cache-read" style={`width:${totals.cache.read / tokenTotal * 100}%`}></span>
				<span class="cache-write" style={`width:${totals.cache.write / tokenTotal * 100}%`}></span>
			</div>
			<div class="legend">
				<div><i class="input"></i><span>Input</span><strong>{formatNumber(totals.input)}</strong></div>
				<div><i class="output"></i><span>Output</span><strong>{formatNumber(totals.output)}</strong></div>
				<div><i class="reasoning"></i><span>Reasoning</span><strong>{formatNumber(totals.reasoning)}</strong></div>
				<div><i class="cache-read"></i><span>Cache read</span><strong>{formatNumber(totals.cache.read)}</strong></div>
				<div><i class="cache-write"></i><span>Cache write</span><strong>{formatNumber(totals.cache.write)}</strong></div>
			</div>
		</section>

		<section class="panel chart-panel">
			<div class="section-heading"><div><p class="label">Context pressure</p><h2>Request by request</h2></div><span>{assistantMessages.length} responses</span></div>
			{#if assistantMessages.length}
				<div class="bars" aria-label="Context tokens by response">
					{#each assistantMessages as message, index (message.id)}
						<div class="bar-column" title={`Response ${index + 1}: ${formatNumber(contextTokens(message.tokens))} tokens`}><span style={`height:${Math.max(3, contextTokens(message.tokens) / tokenPeak * 100)}%`}></span></div>
					{/each}
				</div>
				<div class="axis"><span>First</span><span>Latest · {formatNumber(latestContext)}</span></div>
			{:else}<p class="empty">No assistant responses yet.</p>{/if}
		</section>

		<section class="panel cost-panel">
			<div class="section-heading"><div><p class="label">Spend curve</p><h2>Cumulative cost</h2></div><strong>{formatCost(totalCost)}</strong></div>
			{#if costPoints}<svg viewBox="0 0 200 62" role="img" aria-label="Cumulative session cost"><defs><linearGradient id="cost-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#79ddc0" stop-opacity=".42"/><stop offset="1" stop-color="#79ddc0" stop-opacity="0"/></linearGradient></defs><polyline class="area" points={`0,62 ${costPoints} 200,62`}/><polyline class="line" points={costPoints}/></svg>{:else}<p class="empty">No cost data yet.</p>{/if}
		</section>

		<section class="metric-grid" aria-label="Activity metrics">
			<article><span>Messages</span><strong>{messages.length}</strong><small>{userMessages.length} user · {assistantMessages.length} assistant</small></article>
			<article><span>Model time</span><strong>{formatDuration(responseDuration)}</strong><small>{completedResponses.length ? `${formatDuration(responseDuration / completedResponses.length)} average` : 'No completed responses'}</small></article>
			<article><span>Tool calls</span><strong>{toolParts.length}</strong><small>{failedTools} failed · {toolSummary.length} tools</small></article>
			<article><span>Compactions</span><strong>{compactionCount}</strong><small>{session.time.compacting ? 'Currently compacting' : 'Completed summaries'}</small></article>
			<article><span>Workspace</span><strong>{fileCount}</strong><small><b>+{additions}</b> / <em>−{deletions}</em> lines</small></article>
			<article><span>Sub-sessions</span><strong>{children.length}</strong><small>{linkedChildren} linked</small></article>
			<article><span>Todos</span><strong>{todos.length}</strong><small>{todos.filter((todo) => todo.status === 'completed').length} complete</small></article>
		</section>

		{#if toolSummary.length}
			<section class="panel">
				<div class="section-heading"><div><p class="label">Agent activity</p><h2>Tool breakdown</h2></div></div>
				<ul class="tool-list">
					{#each toolSummary as tool (tool.name)}
						<li><strong>{tool.name}</strong><span class="tool-track"><i style={`width:${tool.count / toolSummary[0].count * 100}%`}></i></span><b>{tool.count}</b><small>{tool.duration ? formatDuration(tool.duration) : '—'}{tool.failed ? ` · ${tool.failed} failed` : ''}</small></li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if modelSummary.length}
			<section class="panel">
				<div class="section-heading"><div><p class="label">Inference mix</p><h2>Models used</h2></div></div>
				<ul class="model-list">
					{#each modelSummary as model (model.name)}
						<li><strong>{model.name}</strong><span>{model.responses} responses</span><b>{formatNumber(model.tokens)} tokens</b><small>{formatCost(model.cost)}</small></li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if diffs.length || todos.length || children.length}
			<section class="panel records">
				<div class="section-heading"><div><p class="label">Attached records</p><h2>Work products</h2></div></div>
				{#if diffs.length}<h3>Changed files</h3><ul>{#each diffs as diff, index (`${diff.file}-${index}`)}<li><strong>{diff.file ?? 'Unnamed file'}</strong><span><b>+{diff.additions}</b> <em>−{diff.deletions}</em>{diff.status ? ` · ${diff.status}` : ''}</span></li>{/each}</ul>{/if}
				{#if todos.length}<h3>Todos</h3><ul>{#each todos as todo, index (`${todo.content}-${index}`)}<li><strong>{todo.content}</strong><span>{todo.status} · {todo.priority}</span></li>{/each}</ul>{/if}
				{#if children.length}<h3>Child sessions</h3><ul>{#each children as child (child.id)}<li><strong>{child.title}</strong><span>{formatDate(child.time.updated)}</span></li>{/each}</ul>{/if}
			</section>
		{/if}

		<section class="panel facts">
			<div class="section-heading"><div><p class="label">Raw facts</p><h2>Session record</h2></div></div>
			<dl>
				<div><dt>Session ID</dt><dd>{session.id}</dd></div>
				<div><dt>Project ID</dt><dd>{session.projectID}</dd></div>
				<div><dt>Directory</dt><dd>{session.directory}</dd></div>
				<div><dt>Created</dt><dd>{formatDate(session.time.created)}</dd></div>
				<div><dt>Updated</dt><dd>{formatDate(session.time.updated)}</dd></div>
				<div><dt>Version</dt><dd>{session.version}</dd></div>
				<div><dt>Latest model</dt><dd>{latestAssistant ? `${latestAssistant.providerID} / ${latestAssistant.modelID}` : session.model ? `${session.model.providerID} / ${session.model.id}` : 'Not available'}</dd></div>
				<div><dt>Latest agent</dt><dd>{session.agent ?? userMessages.at(-1)?.agent ?? 'Not available'}</dd></div>
				<div><dt>Finish reason</dt><dd>{latestAssistant?.finish ?? 'Not available'}</dd></div>
				<div><dt>Parts recorded</dt><dd>{Object.entries(partCounts).map(([type, count]) => `${type}: ${count}`).join(' · ') || 'None'}</dd></div>
				<div><dt>Share</dt><dd>{session.share?.url ?? 'Private'}</dd></div>
				{#if session.parentID}<div><dt>Parent session</dt><dd>{session.parentID}</dd></div>{/if}
				{#if session.revert}<div><dt>Reverted at</dt><dd>{session.revert.messageID}</dd></div>{/if}
			</dl>
		</section>
	{/if}
</main>

<style>
	main { max-width: var(--content-width); margin: 0 auto; padding: 0 1rem 3rem; }
	.topbar { position: sticky; z-index: 5; top: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.65rem; min-height: 3rem; margin: 0 -1rem 1.8rem; padding: max(0.35rem, env(safe-area-inset-top)) 1rem 0.35rem; border-bottom: 1px solid #293031; background: rgb(17 19 21 / .96); backdrop-filter: blur(.6rem); }
	.topbar > a { display: grid; width: 2rem; height: 2rem; place-items: center; border: 1px solid #3a4544; border-radius: .5rem; background: #202627; color: #d7dddc; font-weight: 800; text-decoration: none; }
	.topbar div { min-width: 0; }
	.topbar span, .topbar strong { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.topbar span { margin-bottom: .1rem; color: #85918f; font-size: .58rem; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
	.topbar strong { color: var(--color-accent); font-size: .72rem; }
	header { margin-bottom: 1.6rem; }
	.eyebrow, .label { margin: 0 0 .35rem; color: var(--color-accent); font-size: .64rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
	header h1 { margin: 0; font-size: clamp(2.4rem, 13vw, 4rem); letter-spacing: -.065em; line-height: .9; }
	header > p:last-child { max-width: 32rem; margin: .8rem 0 0; color: var(--color-muted); font-size: .86rem; line-height: 1.5; }
	.status, .notice { padding: 1rem; border: 1px solid var(--color-border); border-radius: .8rem; background: var(--color-panel); color: var(--color-muted); }
	.status.error, .notice { border-color: #60483a; color: #ffc997; }
	.notice { margin: 0 0 1rem; font-size: .72rem; }
	.hero-grid, .metric-grid { display: grid; gap: .7rem; }
	.context-card, .big-stat, .panel, .metric-grid article { border: 1px solid var(--color-border); border-radius: 1rem; background: linear-gradient(145deg, #1d2224, #171b1d); box-shadow: 0 1px 0 rgb(255 255 255 / .035) inset; }
	.context-card { display: grid; grid-template-columns: 7rem minmax(0, 1fr); align-items: center; gap: 1rem; padding: 1rem; }
	.ring { display: grid; width: 7rem; aspect-ratio: 1; padding: .65rem; border-radius: 50%; background: conic-gradient(var(--color-accent) var(--usage), #303838 0); box-shadow: 0 0 1.5rem rgb(121 221 192 / .1); }
	.ring > div { display: grid; border-radius: 50%; background: #15191b; place-content: center; text-align: center; }
	.ring strong, .ring span { display: block; }
	.ring strong { font-size: 1.45rem; letter-spacing: -.06em; }
	.ring span { color: #85918f; font-size: .58rem; text-transform: uppercase; }
	.context-card h2 { margin: 0; font-size: 1.8rem; letter-spacing: -.05em; }
	.context-card h2 small { color: #8f9a98; font-size: .65rem; letter-spacing: 0; }
	.context-card div > p:last-child { margin: .35rem 0 0; color: #85918f; font-size: .68rem; }
	.big-stat { padding: 1rem; }
	.big-stat strong, .big-stat span { display: block; }
	.big-stat strong { font-size: 2rem; letter-spacing: -.055em; }
	.big-stat span { margin-top: .2rem; color: #85918f; font-size: .68rem; }
	.big-stat.accent { border-color: #3e645a; background: linear-gradient(145deg, #1b2926, #171e1d); }
	.panel { margin-top: .75rem; padding: 1rem; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
	.section-heading h2 { margin: 0; font-size: 1.15rem; letter-spacing: -.03em; }
	.section-heading > strong { color: var(--color-accent); font-size: 1.15rem; }
	.section-heading > span { color: #85918f; font-size: .68rem; }
	.token-bar { display: flex; height: .8rem; overflow: hidden; border-radius: 999px; background: #303638; }
	.token-bar span { min-width: 1px; }
	.input { background: #79ddc0; }
	.output { background: #e5b566; }
	.reasoning { background: #a88de4; }
	.cache-read { background: #4e9fe6; }
	.cache-write { background: #e17c91; }
	.legend { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem 1rem; margin-top: 1rem; }
	.legend div { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .45rem; min-width: 0; font-size: .7rem; }
	.legend i { width: .55rem; height: .55rem; border-radius: 2px; }
	.legend span { color: #9ba6a4; }
	.bars { display: flex; align-items: end; gap: .22rem; height: 8rem; padding-top: .5rem; border-bottom: 1px solid #38403f; overflow-x: auto; }
	.bar-column { display: flex; flex: 1 0 .45rem; align-items: end; height: 100%; }
	.bar-column span { width: 100%; min-height: 3px; border-radius: 2px 2px 0 0; background: linear-gradient(#79ddc0, #347a68); }
	.axis { display: flex; justify-content: space-between; margin-top: .4rem; color: #778280; font-size: .58rem; }
	.cost-panel svg { display: block; width: 100%; height: 7rem; overflow: visible; }
	.line { fill: none; stroke: var(--color-accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.area { fill: url(#cost-fill); stroke: none; }
	.metric-grid { grid-template-columns: 1fr 1fr; margin-top: .75rem; }
	.metric-grid article { min-width: 0; padding: .85rem; }
	.metric-grid span, .metric-grid strong, .metric-grid small { display: block; }
	.metric-grid span { color: #85918f; font-size: .62rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	.metric-grid strong { margin: .25rem 0; font-size: 1.5rem; letter-spacing: -.05em; }
	.metric-grid small { color: #899492; font-size: .62rem; overflow-wrap: anywhere; }
	.metric-grid b { color: var(--color-accent); font-style: normal; }
	.metric-grid em { color: #e17c91; font-style: normal; }
	.tool-list { display: grid; gap: .7rem; margin: 0; padding: 0; list-style: none; }
	.tool-list li { display: grid; grid-template-columns: minmax(4.8rem, .7fr) 1fr auto; align-items: center; gap: .5rem; font-size: .72rem; }
	.tool-list li > strong { overflow: hidden; text-overflow: ellipsis; }
	.tool-list li > b { color: var(--color-accent); }
	.tool-list small { grid-column: 2 / 4; margin-top: -.35rem; color: #74807e; font-size: .58rem; }
	.tool-track { height: .35rem; overflow: hidden; border-radius: 999px; background: #303738; }
	.tool-track i { display: block; height: 100%; border-radius: inherit; background: var(--color-accent); }
	.model-list, .records ul { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
	.model-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .3rem .75rem; padding: .7rem 0; border-top: 1px solid #293031; }
	.model-list strong { overflow-wrap: anywhere; }
	.model-list span, .model-list small { color: #7f8b89; font-size: .62rem; }
	.model-list b { color: var(--color-accent); font-size: .7rem; text-align: right; }
	.model-list small { text-align: right; }
	.records h3 { margin: 1rem 0 .35rem; color: #8e9a98; font-size: .65rem; letter-spacing: .1em; text-transform: uppercase; }
	.records h3:first-of-type { margin-top: 0; }
	.records li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; padding: .6rem 0; border-top: 1px solid #293031; font-size: .68rem; }
	.records li strong { min-width: 0; font-weight: 650; overflow-wrap: anywhere; }
	.records li span { color: #84908e; text-align: right; }
	.records li b { color: var(--color-accent); }
	.records li em { color: #e17c91; font-style: normal; }
	.facts dl { display: grid; gap: 0; margin: 0; }
	.facts dl div { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: .7rem; padding: .65rem 0; border-top: 1px solid #293031; }
	.facts dt { color: #84908e; font-size: .65rem; }
	.facts dd { min-width: 0; margin: 0; font-family: ui-monospace, monospace; font-size: .65rem; text-align: right; overflow-wrap: anywhere; }
	.empty { color: #7f8a88; font-size: .75rem; }
	.topbar a:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
	@media (min-width: 30rem) { .hero-grid { grid-template-columns: 1fr 1fr; } .context-card { grid-column: 1 / -1; } .metric-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
