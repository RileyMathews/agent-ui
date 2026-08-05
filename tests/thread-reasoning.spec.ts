import { expect, test } from '@playwright/test';

test('shows reasoning only after it is enabled from the session bar', async ({ page }) => {
	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/event') return new Promise(() => {});
		if (path === '/session/test/message') {
			return route.fulfill({ json: [{
				info: { id: 'assistant-1', role: 'assistant' },
				parts: [
					{ id: 'reasoning-1', messageID: 'assistant-1', sessionID: 'test', type: 'reasoning', text: 'Internal analysis for this response.', time: { start: 0 } },
					{ id: 'text-1', messageID: 'assistant-1', sessionID: 'test', type: 'text', text: 'Visible response.' }
				]
			}] });
		}
		if (path === '/session/test') return route.fulfill({ json: { id: 'test', directory: '/home/riley/code/agent-ui' } });
		return route.abort();
	});

	await page.goto('/session/test?server=scottyopencode.rileymathews.com&project=agent-ui');
	await expect(page.getByText('Visible response.')).toBeVisible();
	await expect(page.getByText('Internal analysis for this response.')).toBeHidden();

	const toggle = page.getByRole('button', { name: 'Reasoning' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('region', { name: 'Reasoning' }).getByText('Internal analysis for this response.')).toBeVisible();

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByText('Internal analysis for this response.')).toBeHidden();
});
