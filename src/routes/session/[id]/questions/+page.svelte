<script lang="ts">
	import { page } from '$app/state';
	import { getProject, getServer, sessionHref } from '$lib/config';
	import { getOpencode } from '$lib/opencode';
	import { answerFromValues, composeCustomValues, getForm, initialValues, isFieldVisible, listForms, validateForm, type FormValues } from '$lib/forms';
	import type { FormDetail, FormField } from '@opencode/client';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	const server = getServer(page.url.searchParams.get('server'));
	const project = getProject(page.url.searchParams.get('project'));
	const threadHref = server && project ? sessionHref(page.params.id ?? '', server.id, project.id) : '/';
	let form = $state<FormDetail | null>(null);
	let values = $state<FormValues>({});
	let errors = $state<Record<string, string>>({});
	let loading = $state(true);
	let submitting = $state(false);
	let message = $state('');
	let customFields = $state<Record<string, boolean>>({});
	let customValues = $state<Record<string, string>>({});
	let disposed = false;
	const sessionID = page.params.id ?? '';

	async function load() {
		if (!server || !sessionID) { loading = false; message = 'This form link is incomplete.'; return; }
		loading = true;
		try {
			const pending = await listForms(server.url, sessionID);
			if (!pending.length) { await goto(threadHref); return; }
			for (const info of pending) {
				try {
					const detail = await getForm(server.url, sessionID, info.id);
					if (detail.state.status === 'pending') { form = detail; values = initialValues(detail.fields); errors = {}; customFields = {}; customValues = {}; message = ''; return; }
				} catch { /* Move on when a listed form has already disappeared. */ }
			}
			await goto(threadHref);
		} catch (cause) { if (!disposed) message = cause instanceof Error ? cause.message : 'Unable to load this form.'; }
		finally { if (!disposed) loading = false; }
	}

	function setValue(key: string, value: FormValues[string]) { values = { ...values, [key]: value }; errors = { ...errors, [key]: '' }; }
	function numberValue(event: Event, field: FormField) { const raw = (event.currentTarget as HTMLInputElement).value; setValue(field.key, raw === '' ? undefined : Number(raw)); }
	function toggleOption(event: Event, key: string, option: string) { const current = Array.isArray(values[key]) ? values[key] as string[] : []; const next = (event.currentTarget as HTMLInputElement).checked ? [...current, option] : current.filter((value) => value !== option); setValue(key, next); }
	function setCustomOption(field: FormField, value: string) {
		if (field.type === 'string') { customValues = { ...customValues, [field.key]: value }; setValue(field.key, value); return; }
		if (field.type === 'multiselect') {
			const previous = customValues[field.key];
			const current = Array.isArray(values[field.key]) && previous ? (values[field.key] as string[]).filter((option) => option !== previous) : values[field.key];
			setValue(field.key, composeCustomValues(current, value));
			customValues = { ...customValues, [field.key]: value };
		}
	}

	async function reply() {
		if (!form || !server || submitting) return;
		errors = validateForm(form.fields, values);
		if (Object.keys(errors).length) return;
		submitting = true; message = '';
		try { await getOpencode(server.url).session.form.reply({ sessionID, formID: form.id, answer: answerFromValues(form.fields, values) }); await load(); }
		catch (cause) { message = cause instanceof Error ? cause.message : 'Unable to submit the form.'; }
		finally { submitting = false; }
	}

	async function cancel() {
		if (!form || !server || submitting || !confirm('Dismiss this form and continue without answering?')) return;
		submitting = true;
		try { await getOpencode(server.url).session.form.cancel({ sessionID, formID: form.id }); await load(); }
		catch (cause) { message = cause instanceof Error ? cause.message : 'Unable to dismiss the form.'; }
		finally { submitting = false; }
	}

	onMount(() => { void load(); const resume = () => { if (!document.hidden) void load(); }; window.addEventListener('pageshow', resume); window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume); return () => { disposed = true; window.removeEventListener('pageshow', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); }; });
</script>

<svelte:head><title>{form?.title ?? 'Agent input'}</title></svelte:head>
<main><a class="back" href={threadHref}>← Back to thread</a>{#if loading}<p class="status">Loading form…</p>{:else if message && !form}<p class="status error" role="alert">{message}</p>{:else if form}
	<h1>{form.title}</h1><p class="intro">Complete this form to continue the session. You can dismiss it instead.</p>
	<form onsubmit={(event) => { event.preventDefault(); void reply(); }}>
		{#each form.fields as field (field.key)}
			{#if isFieldVisible(field, values)}
				<fieldset class:external={field.type === 'external'}>
					<legend>{field.title ?? field.key}{#if 'required' in field && field.required}<span aria-label="required"> *</span>{/if}</legend>
					{#if field.description}<p class="description">{field.description}</p>{/if}
					{#if field.type === 'external'}<a href={field.url} target="_blank" rel="noreferrer">Open external input ↗</a>
					{:else if field.type === 'boolean'}<label class="check"><input type="checkbox" checked={values[field.key] === true} onchange={(event) => setValue(field.key, event.currentTarget.checked)} /> Yes</label>
					{:else if field.type === 'string'}{#if field.options}<select aria-label={field.title ?? field.key} value={customFields[field.key] ? '__custom__' : values[field.key] as string ?? ''} onchange={(event) => { const selected = event.currentTarget.value; customFields = { ...customFields, [field.key]: selected === '__custom__' }; if (selected !== '__custom__') setValue(field.key, selected); }}><option value="">Choose…</option>{#each field.options as option}<option value={option.value}>{option.label}</option>{/each}{#if field.custom}<option value="__custom__">Custom…</option>{/if}</select>{#if customFields[field.key]}<input aria-label={`${field.title ?? field.key} custom value`} type={field.format === 'email' ? 'email' : field.format === 'uri' ? 'url' : field.format === 'date' ? 'date' : field.format === 'date-time' ? 'datetime-local' : 'text'} value={customValues[field.key] ?? ''} placeholder={field.placeholder} minlength={field.minLength} maxlength={field.maxLength} pattern={field.pattern} oninput={(event) => setCustomOption(field, event.currentTarget.value)} />{/if}{:else}<input aria-label={field.title ?? field.key} type={field.format === 'email' ? 'email' : field.format === 'uri' ? 'url' : field.format === 'date' ? 'date' : field.format === 'date-time' ? 'datetime-local' : 'text'} value={values[field.key] as string ?? ''} placeholder={field.placeholder} minlength={field.minLength} maxlength={field.maxLength} pattern={field.pattern} oninput={(event) => setValue(field.key, event.currentTarget.value)} />{/if}
					{:else if field.type === 'multiselect'}<div class="options">{#each field.options as option (option.value)}<label class="check"><input type="checkbox" checked={Array.isArray(values[field.key]) && (values[field.key] as string[]).includes(option.value)} onchange={(event) => toggleOption(event, field.key, option.value)} />{option.label}</label>{/each}{#if field.custom}<input aria-label={`${field.title ?? field.key} custom value`} type="text" value={customValues[field.key] ?? ''} placeholder="Add custom value" oninput={(event) => setCustomOption(field, event.currentTarget.value)} />{/if}</div>
					{:else}<input aria-label={field.title ?? field.key} type="number" step={field.type === 'integer' ? '1' : 'any'} value={values[field.key] as number ?? ''} min={field.minimum as number | undefined} max={field.maximum as number | undefined} oninput={(event) => numberValue(event, field)} />{/if}
					{#if errors[field.key]}<p id={`${field.key}-error`} class="field-error" role="alert">{errors[field.key]}</p>{/if}
				</fieldset>
			{/if}
		{/each}
		{#if message}<p class="field-error" role="alert">{message}</p>{/if}<div class="actions"><button type="button" onclick={cancel} disabled={submitting}>Dismiss</button><button class="submit" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Continue'}</button></div>
	</form>
{:else}<p class="status">No pending forms.</p>{/if}</main>
<style>main { max-width: var(--content-width); margin: 0 auto; padding: 1.25rem 1rem 3rem; } .back, a { color: var(--color-accent); } h1 { margin: 1.5rem 0 .5rem; } .intro, .description { color: var(--color-muted); line-height: 1.5; } form { display: grid; gap: 1rem; margin-top: 1.5rem; } fieldset { display: grid; gap: .5rem; min-width: 0; padding: .9rem; border: 1px solid var(--color-border); border-radius: .7rem; background: var(--color-panel); } legend { padding: 0 .2rem; font-weight: 750; } .description { margin: 0; font-size: .8rem; } input:not([type='checkbox']), select { width: 100%; box-sizing: border-box; min-height: 2.6rem; padding: .5rem .65rem; border: 1px solid var(--color-border); border-radius: .5rem; background: var(--color-surface); color: inherit; font: inherit; } .check { display: flex; align-items: center; gap: .5rem; padding: .3rem 0; } input[type='checkbox'] { accent-color: var(--color-accent); } .options { display: grid; gap: .25rem; } .field-error, .error { color: var(--color-error); } .status { padding: 1rem; border: 1px solid var(--color-border); border-radius: .7rem; color: var(--color-muted); } .actions { display: flex; justify-content: end; gap: .6rem; } button { min-height: 2.6rem; padding: 0 .8rem; border: 1px solid var(--color-border); border-radius: .55rem; background: var(--color-panel); color: inherit; font: inherit; } .submit { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-background); font-weight: 750; } button:disabled { opacity: .6; } a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }</style>
