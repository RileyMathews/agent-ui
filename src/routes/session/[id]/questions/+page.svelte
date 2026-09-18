<script lang="ts">
	import { page } from '$app/state';
	import { getProject, getServer, sessionHref } from '$lib/config';
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const threadHref = server && project ? sessionHref(page.params.id ?? '', server.id, project.id) : '/';
</script>
<main><a href={threadHref}>← Back to thread</a><h1>Agent input</h1><p>OpenCode V2 uses interactive forms instead of the legacy question API. Form responses are not yet available in this client.</p></main>
<style>main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem; } a { color: var(--color-accent); } p { color: var(--color-muted); line-height: 1.5; }</style>
