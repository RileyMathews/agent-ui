import { expect, test, type Page } from '@playwright/test';

const configsDirectory = '/home/riley/code/configs';
const activeSession = {
	id: 'resilient-active',
	projectID: 'configs',
	cost: 0,
	tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
	time: { created: 10, updated: 20 },
	title: 'Resilient session',
	location: { type: 'path', path: configsDirectory }
};

function never() {
	return new Promise(() => {});
}

async function installRoutes(page: Page) {
	await page.route('https://*/**', async (route) => {
		const url = new URL(route.request().url());
		if (!url.hostname.endsWith('opencode.rileymathews.com')) return route.continue();
		if (url.hostname === 'ds9opencode.rileymathews.com') return never();
		if (url.hostname === 'opencode.rileymathews.com') {
			if (url.pathname === '/project/current') return route.fulfill({ json: { id: 'other', vcs: 'none', worktree: '/tmp' } });
			return route.abort();
		}
		if (url.pathname === '/project/current') {
			return route.fulfill({
				json: url.searchParams.get('directory') === configsDirectory
					? { id: 'configs', vcs: 'git', worktree: '/home/riley/code/configs' }
					: { id: 'other', vcs: 'none', worktree: '/tmp' }
			});
		}
		if (url.pathname === '/file') return route.fulfill({ json: [] });
		if (url.pathname === '/api/session') return route.fulfill({ json: { data: [activeSession], cursor: {} } });
		if (url.pathname === '/session/status') return route.fulfill({ json: {} });
		if (url.pathname === '/vcs') return route.fulfill({ json: { branch: 'main', default_branch: 'main' } });
		if (url.pathname === '/vcs/status') return route.fulfill({ json: [] });
		return route.abort();
	});
}

test('dashboard renders ready servers while another server is still loading', async ({ page }) => {
	await installRoutes(page);
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/');

	const current = page.getByRole('region', { name: 'Current sessions' });
	await expect(current.getByRole('link', { name: /Resilient session/ })).toBeVisible();
	await expect(current.getByText('configs / scottyopencode')).toBeVisible();

	const configsCard = page.locator('.projects li').filter({ has: page.getByRole('heading', { name: 'configs' }) });
	await expect(configsCard.getByText('checking…')).toBeVisible();
	await expect(configsCard.getByText('1 sessions')).toBeVisible();

	await page.close();
});

test('new thread page lists a ready server while another is still loading', async ({ page }) => {
	await installRoutes(page);
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/new?project=configs');

	const list = page.locator('ul');
	const readyRow = list.getByRole('link', { name: /Continue →/ });
	await expect(readyRow).toBeVisible();
	await expect(readyRow.getByText(configsDirectory)).toBeVisible();
	await expect(list.getByText('Checking availability…')).toBeVisible();

	await page.close();
});

test('project page shows sessions from a ready server while another is loading', async ({ page }) => {
	await installRoutes(page);
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto('/project/configs');

	await expect(page.getByRole('link', { name: /Resilient session/ })).toBeVisible();
	const checkout = page.getByLabel('Git checkout status');
	await expect(checkout.getByText('checking…')).toBeVisible();
	await expect(checkout.getByText('main')).toBeVisible();

	await page.close();
});