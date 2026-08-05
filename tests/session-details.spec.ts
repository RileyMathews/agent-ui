import { expect, test } from '@playwright/test';

const directory = '/home/riley/code/agent-ui';
const query = '?server=scottyopencode.rileymathews.com&project=agent-ui';

test('opens detailed session telemetry from the thread bar', async ({ page }) => {
	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/event') return new Promise(() => {});
		if (url.pathname === '/session/test') return route.fulfill({ json: { id: 'test', projectID: 'project', directory, title: 'Telemetry test', version: '1.2.3', time: { created: 1000, updated: 9000 }, summary: { additions: 42, deletions: 7, files: 3 } } });
		if (url.pathname === '/session/test/message') return route.fulfill({ json: [
			{ info: { id: 'user', sessionID: 'test', role: 'user', time: { created: 1000 }, agent: 'build', model: { providerID: 'zen', modelID: 'big-pickle' } }, parts: [{ id: 'text', sessionID: 'test', messageID: 'user', type: 'text', text: 'Test' }] },
			{ info: { id: 'assistant', sessionID: 'test', role: 'assistant', time: { created: 2000, completed: 5000 }, parentID: 'user', modelID: 'big-pickle', providerID: 'zen', mode: 'build', path: { cwd: directory, root: directory }, cost: 0.0123, tokens: { input: 1000, output: 250, reasoning: 50, cache: { read: 500, write: 100 } }, finish: 'stop' }, parts: [{ id: 'tool', sessionID: 'test', messageID: 'assistant', type: 'tool', callID: 'call', tool: 'read', state: { status: 'completed', input: {}, output: '', title: 'Read', metadata: {}, time: { start: 2500, end: 3000 } } }] }
		] });
		if (url.pathname === '/session/test/diff') return route.fulfill({ json: [{ file: 'src/app.ts', additions: 42, deletions: 7, status: 'modified' }] });
		if (url.pathname === '/session/test/todo') return route.fulfill({ json: [{ id: 'todo', content: 'Test', status: 'completed', priority: 'high' }] });
		if (url.pathname === '/session/test/children') return route.fulfill({ json: [] });
		if (url.pathname === '/provider') return route.fulfill({ json: { all: [{ id: 'zen', name: 'Zen', source: 'api', env: [], options: {}, models: { 'big-pickle': { id: 'big-pickle', providerID: 'zen', name: 'Big Pickle', api: {}, capabilities: {}, cost: {}, limit: { context: 200000, output: 32000 }, status: 'active', options: {}, headers: {} } } }], default: {}, connected: ['zen'] } });
		return route.abort();
	});

	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto(`/session/test${query}`);
	await page.getByRole('link', { name: 'Details' }).click();
	await expect(page).toHaveURL(`/session/test/details${query}`);
	await expect(page.getByRole('heading', { name: 'Dirty details' })).toBeVisible();
	await expect(page.getByRole('heading', { name: '1,850 tokens' })).toBeVisible();
	await expect(page.getByText('1%')).toBeVisible();
	await expect(page.locator('.big-stat.accent').getByText('$0.01')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Activity metrics' }).getByText('+42')).toBeVisible();
	await expect(page.getByText('read', { exact: true })).toBeVisible();
	await expect(page.locator('.model-list').getByText('zen / big-pickle')).toBeVisible();
});
