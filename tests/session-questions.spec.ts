import { expect, test } from '@playwright/test';

test('shows a pending question card and answers it on the dedicated page', async ({ page }) => {
	let replyBody: unknown;
	const request = {
		id: 'question-1',
		sessionID: 'parent',
		questions: [{
			header: 'Direction',
			question: 'Which direction should we take?',
			options: [{ label: 'Keep it simple', description: 'Prefer the smallest change.' }]
		}]
	};

	await page.route('https://scottyopencode.rileymathews.com/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/event') return new Promise(() => {});
		if (url.pathname === '/session/parent/message') return route.fulfill({ json: [] });
		if (url.pathname === '/session/parent') return route.fulfill({ json: { id: 'parent', directory: '/home/riley/code/agent-ui', title: 'Question session' } });
		if (url.pathname === '/question' && route.request().method() === 'GET') return route.fulfill({ json: [request] });
		if (url.pathname === '/question/question-1/reply' && route.request().method() === 'POST') {
			replyBody = route.request().postDataJSON();
			return route.fulfill({ json: true });
		}
		return route.abort();
	});

	await page.goto('/session/parent?server=scottyopencode.rileymathews.com&project=agent-ui');
	await expect(page.getByRole('link', { name: /Direction.*Waiting/i })).toHaveAttribute(
		'href',
		'/session/parent/questions?server=scottyopencode.rileymathews.com&project=agent-ui'
	);

	await page.getByRole('link', { name: /Direction.*Waiting/i }).click();
	await expect(page).toHaveURL(/\/session\/parent\/questions\?/);
	await page.getByLabel('Keep it simple').check();
	await page.getByRole('button', { name: 'Send answers' }).click();
	await expect(page).toHaveURL(/\/session\/parent\?/);
	await expect.poll(() => replyBody).toEqual({ answers: [['Keep it simple']] });
});
