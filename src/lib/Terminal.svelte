<script lang="ts">
	import { onMount } from 'svelte';
	import type { FitAddon, Ghostty, Terminal as GhosttyTerminal } from 'ghostty-web';
	import { opencodeV2, OPENCODE_SERVER_URL } from '$lib/opencode';

	type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'exited' | 'error';
	type Disposable = { dispose(): void };

	let {
		ptyID,
		directory,
		onstate
	}: {
		ptyID: string;
		directory: string;
		onstate?: (state: ConnectionState, message?: string) => void;
	} = $props();

	let container: HTMLDivElement;
	let scrollbackHeight = $state(0);
	let sharedGhostty: Promise<{ mod: typeof import('ghostty-web'); ghostty: Ghostty }> | undefined;

	function loadGhostty() {
		if (sharedGhostty) return sharedGhostty;
		sharedGhostty = import('ghostty-web')
			.then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() }))
			.catch((cause) => {
				sharedGhostty = undefined;
				throw cause;
			});
		return sharedGhostty;
	}

	function dispose(value: Disposable | undefined) {
		value?.dispose();
	}

	onMount(() => {
		let terminal: GhosttyTerminal | undefined;
		let fit: FitAddon | undefined;
		let socket: WebSocket | undefined;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		let fitFrame: number | undefined;
		let scrollFrame: number | undefined;
		let attempts = 0;
		let cursor = 0;
		let disposed = false;
		let connecting = false;
		let autoFollow = true;
		let lastSize: { cols: number; rows: number } | undefined;
		let pendingOutput = '';
		let writeQueued = false;
		const subscriptions: Disposable[] = [];
		const decoder = new TextDecoder();

		function setState(state: ConnectionState, message?: string) {
			if (!disposed) onstate?.(state, message);
		}

		function flushOutput() {
			writeQueued = false;
			if (!terminal || !pendingOutput) return;
			const output = pendingOutput;
			pendingOutput = '';
			terminal.write(output);
			requestAnimationFrame(() => updateScrollback(autoFollow));
		}

		function write(output: string) {
			pendingOutput += output;
			if (writeQueued) return;
			writeQueued = true;
			queueMicrotask(flushOutput);
		}

		function scheduleFit() {
			if (disposed || !fit || fitFrame !== undefined) return;
			fitFrame = requestAnimationFrame(() => {
				fitFrame = undefined;
				fit?.fit();
			});
		}

		function updateScrollback(follow = autoFollow) {
			if (!terminal || !container.clientHeight) return;
			const lineHeight = container.clientHeight / terminal.rows;
			scrollbackHeight = terminal.getScrollbackLength() * lineHeight;
			requestAnimationFrame(() => {
				if (disposed) return;
				if (!follow) {
					syncTerminalScroll();
					return;
				}
				setTimeout(() => {
					if (!disposed) window.scrollTo({ top: document.documentElement.scrollHeight });
				}, 0);
			});
		}

		function syncTerminalScroll() {
			if (!terminal || !container.clientHeight) return;
			const lineHeight = container.clientHeight / terminal.rows;
			terminal.scrollToLine(Math.round(window.scrollY / lineHeight));
		}

		function scheduleTerminalScroll() {
			if (scrollFrame !== undefined) return;
			scrollFrame = requestAnimationFrame(() => {
				scrollFrame = undefined;
				if (window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2) autoFollow = true;
				syncTerminalScroll();
			});
		}

		function focusTerminal() {
			if (!terminal) return;
			const input = terminal.textarea;
			if (!input) {
				terminal.focus();
				return;
			}
			input.focus({ preventScroll: true });
			setTimeout(() => terminal?.textarea?.focus({ preventScroll: true }), 0);
		}

		function syncSize(cols: number, rows: number) {
			updateScrollback();
			if (lastSize?.cols === cols && lastSize.rows === rows) return;
			const send = () => {
				lastSize = { cols, rows };
				void opencodeV2.v2.pty.update({
					ptyID,
					location: { directory },
					size: { cols, rows }
				}).catch(() => undefined);
			};

			if (!lastSize) {
				send();
				return;
			}
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(send, 100);
		}

		function disconnect() {
			const current = socket;
			socket = undefined;
			if (current && current.readyState !== WebSocket.CLOSED && current.readyState !== WebSocket.CLOSING) {
				current.close(1000);
			}
		}

		async function terminalExists() {
			try {
				const response = await opencodeV2.v2.pty.get({ ptyID, location: { directory } }) as unknown as {
					data: { status: 'running' | 'exited'; exitCode?: number };
				};
				if (response.data.status === 'exited') {
					setState('exited', response.data.exitCode === undefined ? 'Shell exited' : `Shell exited (${response.data.exitCode})`);
					return false;
				}
				return true;
			} catch (cause) {
				if (cause && typeof cause === 'object' && '_tag' in cause && cause._tag === 'PtyNotFoundError') {
					setState('exited', 'Shell is no longer available');
					return false;
				}
				return true;
			}
		}

		function scheduleReconnect(message = 'Connection lost') {
			if (disposed || document.hidden || reconnectTimer) return;
			if (!navigator.onLine) {
				setState('offline');
				return;
			}
			setState('reconnecting', message);
			const delay = Math.min(250 * 2 ** Math.min(attempts, 4), 4000);
			reconnectTimer = setTimeout(async () => {
				reconnectTimer = undefined;
				if (disposed || !(await terminalExists())) return;
				attempts += 1;
				void connect();
			}, delay);
		}

		async function ticket() {
			const response = await opencodeV2.v2.pty.connectToken(
				{ ptyID, location: { directory } },
				{ headers: { 'x-opencode-ticket': '1' } }
			) as unknown as { data: { ticket: string } };
			return response.data.ticket;
		}

		async function connect() {
			if (disposed || document.hidden || socket || connecting) return;
			if (!navigator.onLine) {
				setState('offline');
				return;
			}

			connecting = true;
			setState(attempts ? 'reconnecting' : 'connecting');
			try {
				const connectTicket = await ticket();
				if (disposed || document.hidden || socket) return;
				const url = new URL(`/api/pty/${encodeURIComponent(ptyID)}/connect`, OPENCODE_SERVER_URL);
				url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
				url.searchParams.set('location[directory]', directory);
				url.searchParams.set('cursor', String(cursor));
				url.searchParams.set('ticket', connectTicket);

				const next = new WebSocket(url);
				next.binaryType = 'arraybuffer';
				socket = next;
				next.addEventListener('open', () => {
					if (socket !== next) return;
					attempts = 0;
					setState('connected');
					if (terminal) syncSize(terminal.cols, terminal.rows);
				});
				next.addEventListener('message', (event) => {
					if (socket !== next) return;
					if (event.data instanceof ArrayBuffer) {
						const bytes = new Uint8Array(event.data);
						if (bytes[0] !== 0) return;
						try {
							const metadata = JSON.parse(decoder.decode(bytes.subarray(1))) as { cursor?: unknown };
							if (typeof metadata.cursor === 'number' && Number.isSafeInteger(metadata.cursor) && metadata.cursor >= 0) {
								cursor = metadata.cursor;
							}
						} catch {
							// Ignore malformed control frames; output frames remain usable.
						}
						return;
					}
					if (typeof event.data !== 'string' || !event.data) return;
					cursor += event.data.length;
					write(event.data);
				});
				next.addEventListener('close', (event) => {
					if (socket !== next) return;
					socket = undefined;
					scheduleReconnect(event.code === 1000 ? 'Checking shell status' : 'Connection lost');
				});
				next.addEventListener('error', () => {
					if (socket === next) setState('reconnecting', 'Connection interrupted');
				});
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : 'Unable to connect to the terminal';
				scheduleReconnect(message);
			} finally {
				connecting = false;
			}
		}

		function resume() {
			if (document.hidden || disposed) return;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = undefined;
			}
			void connect();
		}

		function pause() {
			if (!document.hidden) return;
			disconnect();
		}

		function goOffline() {
			disconnect();
			setState('offline');
		}

		void (async () => {
			try {
				const loaded = await loadGhostty();
				if (disposed) return;
				terminal = new loaded.mod.Terminal({
					ghostty: loaded.ghostty,
					cursorBlink: true,
					cursorStyle: 'bar',
					fontSize: 14,
					fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
					allowTransparency: false,
					convertEol: false,
					scrollback: 10_000,
					theme: {
						background: '#0b0d0e',
						foreground: '#d8dfdd',
						cursor: '#79ddc0',
						selectionBackground: '#31584e'
					}
				});
				fit = new loaded.mod.FitAddon();
				terminal.loadAddon(fit);
				terminal.open(container);
				if (terminal.textarea) terminal.textarea.style.position = 'fixed';
				fit.fit();
				fit.observeResize();
				subscriptions.push(terminal.onResize(({ cols, rows }) => syncSize(cols, rows)));
				subscriptions.push(terminal.onData((data) => {
					if (socket?.readyState === WebSocket.OPEN) socket.send(data);
				}));
				const focus = () => focusTerminal();
				const copy = (event: ClipboardEvent) => {
					const selection = terminal?.getSelection();
					if (!selection || !event.clipboardData) return;
					event.preventDefault();
					event.clipboardData.setData('text/plain', selection);
				};
				const paste = (event: ClipboardEvent) => {
					const text = event.clipboardData?.getData('text/plain');
					if (!text || !terminal) return;
					event.preventDefault();
					terminal.paste(text);
				};
				const wheel = (event: WheelEvent) => {
					event.preventDefault();
					event.stopImmediatePropagation();
					if (event.deltaY < 0) autoFollow = false;
					window.scrollBy({ top: event.deltaY });
				};
				const touchmove = () => {
					autoFollow = false;
				};
				container.addEventListener('pointerdown', focus);
				container.addEventListener('copy', copy, true);
				container.addEventListener('paste', paste, true);
				container.addEventListener('wheel', wheel, { capture: true, passive: false });
				container.addEventListener('touchmove', touchmove, { passive: true });
				subscriptions.push({ dispose: () => container.removeEventListener('pointerdown', focus) });
				subscriptions.push({ dispose: () => container.removeEventListener('copy', copy, true) });
				subscriptions.push({ dispose: () => container.removeEventListener('paste', paste, true) });
				subscriptions.push({ dispose: () => container.removeEventListener('wheel', wheel, true) });
				subscriptions.push({ dispose: () => container.removeEventListener('touchmove', touchmove) });
				if (document.fonts) void document.fonts.ready.then(scheduleFit);
				window.addEventListener('resize', scheduleFit);
				window.addEventListener('scroll', scheduleTerminalScroll, { passive: true });
				focusTerminal();
				syncSize(terminal.cols, terminal.rows);
				updateScrollback(true);
				await connect();
			} catch (cause) {
				setState('error', cause instanceof Error ? cause.message : 'Unable to start the terminal');
			}
		})();

		document.addEventListener('visibilitychange', pause);
		document.addEventListener('visibilitychange', resume);
		window.addEventListener('pageshow', resume);
		window.addEventListener('online', resume);
		window.addEventListener('offline', goOffline);

		return () => {
			disposed = true;
			disconnect();
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (resizeTimer) clearTimeout(resizeTimer);
			if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
			if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
			for (const subscription of subscriptions) dispose(subscription);
			dispose(fit);
			terminal?.dispose();
			document.removeEventListener('visibilitychange', pause);
			document.removeEventListener('visibilitychange', resume);
			window.removeEventListener('pageshow', resume);
			window.removeEventListener('online', resume);
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('resize', scheduleFit);
			window.removeEventListener('scroll', scheduleTerminalScroll);
		};
	});
</script>

<div class="scroll-space" style:--scrollback-height={`${scrollbackHeight}px`}>
	<div class="terminal" bind:this={container} aria-label="Terminal"></div>
</div>

<style>
	.scroll-space { min-height: var(--terminal-content-height); height: calc(var(--terminal-content-height) + var(--scrollback-height)); }
	.terminal { position: sticky; top: var(--terminal-header-height); width: 100%; height: var(--terminal-content-height); min-width: 0; min-height: 0; padding: 0.6rem 0.45rem; overflow: hidden; background: #0b0d0e; }
	.terminal:focus-within { outline: none; }
</style>
