import { expect, test } from '@playwright/test';

const directory = '/home/riley/code/configs/agent-ui';
const activeSession = {
	id: 'dashboard-active',
	projectID: 'configs',
	cost: 0,
	tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
	time: { created: 10, updated: 20 },
	title: 'Dashboard session',
	location: { type: 'path', path: directory }
};
const archivedSession = {
	...activeSession,
	id: 'dashboard-archived',
	time: { created: 5, updated: 15, archived: 16 },
	title: 'Old dashboard session'
};

test('shows and archives current sessions across the dashboard', async ({ page }) => {
	const archiveRequests: unknown[] = [];

	await page.route('https://*/**', async (route) => {
		const url = new URL(route.request().url());
		if (!url.hostname.endsWith('opencode.rileymathews.com')) return route.continue();
		if (url.hostname === 'opencode.rileymathews.com') {
			if (url.pathname === '/project/current') return route.fulfill({ json: { id: 'other', vcs: 'none', worktree: '/tmp' } });
			return route.abort();
		}
		if (url.pathname === '/project/current') {
			return route.fulfill({
				json: url.searchParams.get('directory') === directory
					? { id: 'configs', vcs: 'git', worktree: '/home/riley/code/configs' }
					: { id: 'other', vcs: 'none', worktree: '/tmp' }
			});
		}
		if (url.pathname === '/file') return route.fulfill({ json: [] });
		if (url.pathname === '/api/session') return route.fulfill({ json: { data: [activeSession, archivedSession], cursor: {} } });
		if (url.pathname === '/session/status') return route.fulfill({ json: {} });
		if (url.pathname === '/vcs') return route.fulfill({ json: { branch: 'main', default_branch: 'main' } });
		if (url.pathname === '/vcs/status') return route.fulfill({ json: [] });
		if (url.pathname === '/session/dashboard-active' && route.request().method() === 'PATCH') {
			archiveRequests.push(route.request().postDataJSON());
			return route.fulfill({ json: { ...activeSession, time: { ...activeSession.time, archived: Date.now() } } });
		}
		return route.abort();
	});

	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/');

	const current = page.getByRole('region', { name: 'Current sessions' });
	await expect(current.getByRole('link', { name: /Dashboard session/ })).toBeVisible();
	await expect(current.getByRole('link', { name: /Old dashboard session/ })).toBeHidden();
	await expect(current.getByText('agent-ui / scottyopencode')).toBeVisible();
	await current.getByLabel('Select all').check();
	await current.getByRole('button', { name: 'Archive (1)' }).click();

	await expect(current.getByText('No current sessions.')).toBeVisible();
	expect(archiveRequests).toHaveLength(1);
	expect(archiveRequests[0]).toMatchObject({ time: { archived: expect.any(Number) } });
	await expect(page.locator('.projects').getByText('0 total').first()).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
