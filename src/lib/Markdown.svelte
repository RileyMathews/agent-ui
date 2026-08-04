<script lang="ts">
	import DOMPurify from 'dompurify';
	import { Marked } from 'marked';

	let { source }: { source: string } = $props();

	const parser = new Marked({
		renderer: {
			// Agent output is Markdown, not a source of arbitrary HTML.
			html: () => ''
		}
	});
	const html = $derived(DOMPurify.sanitize(parser.parse(source) as string, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: ['style'],
		FORBID_ATTR: ['style']
	}));
</script>

<div class="markdown">
	{@html html}
</div>

<style>
	.markdown { overflow-wrap: anywhere; line-height: 1.55; }
	.markdown :global(:first-child) { margin-top: 0; }
	.markdown :global(:last-child) { margin-bottom: 0; }
	.markdown :global(h1) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h2) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h3) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h4) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h5) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h6) { margin: 1.3em 0 0.55em; line-height: 1.15; }
	.markdown :global(h1) { font-size: 1.5em; }
	.markdown :global(h2) { font-size: 1.3em; }
	.markdown :global(h3) { font-size: 1.15em; }
	.markdown :global(p), .markdown :global(ul), .markdown :global(ol), .markdown :global(blockquote), .markdown :global(pre), .markdown :global(table) { margin: 0 0 1em; }
	.markdown :global(ul), .markdown :global(ol) { padding-left: 1.4em; }
	.markdown :global(li + li) { margin-top: 0.3em; }
	.markdown :global(a) { color: var(--color-accent); }
	.markdown :global(code) { padding: 0.1em 0.3em; border-radius: 0.25rem; background: #242a2b; font-family: ui-monospace, monospace; font-size: 0.9em; }
	.markdown :global(pre) { overflow-x: auto; padding: 0.8rem; border: 1px solid #303839; border-radius: 0.6rem; background: #161a1c; }
	.markdown :global(pre code) { padding: 0; background: none; font-size: 0.8em; white-space: pre; }
	.markdown :global(blockquote) { padding-left: 0.85rem; border-left: 0.2rem solid #4a5b58; color: #b8c4c2; }
	.markdown :global(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
	.markdown :global(th), .markdown :global(td) { padding: 0.45rem 0.6rem; border: 1px solid #3a4544; text-align: left; }
	.markdown :global(img) { max-width: 100%; height: auto; }
</style>
