import { expect, test } from '@playwright/test';

test('links a running sub-agent card to its session', async ({ page }) => {
	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/event') return new Promise(() => {});
		if (path === '/session/parent/message') {
			return route.fulfill({
				json: [{
					info: { id: 'message-1', role: 'assistant' },
					parts: [{
						id: 'task-1',
						messageID: 'message-1',
						sessionID: 'parent',
						type: 'tool',
						tool: 'task',
						state: {
							status: 'running',
							input: { description: 'Inspect the issue', subagent_type: 'explore' },
							title: 'Inspect the issue',
							metadata: { sessionID: 'child' }
						}
					}]
				}]
			});
		}
		if (path === '/session/parent') {
			return route.fulfill({ json: { id: 'parent', directory: '/home/riley/code/configs/agent-ui' } });
		}
		return route.abort();
	});

	await page.goto('/session/parent?server=scottyopencode.rileymathews.com&project=agent-ui');
	await expect(page.getByRole('link', { name: /Inspect the issue.*Running/i })).toHaveAttribute(
		'href',
		'/session/parent/sub-agent/child?server=scottyopencode.rileymathews.com&project=agent-ui'
	);
});
