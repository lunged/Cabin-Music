// Regression check for the keep-alive in src/lib/stores/player.svelte.ts.
//
// Plays a 3-track queue in the dev app inside a real headless Chrome and listens to the audio-focus
// feed behind chrome://media-internals. Passes if the page holds audio focus without a break from
// the first track to the end of the queue, and lets go of it once the queue ends.
//
//   npm run dev            (in another terminal)
//   npm run check:focus    (KEEPALIVE=off shows the lapse the keep-alive prevents, and fails)
//
// Env: CHROME (path to a Chrome/Chromium binary), APP (dev server URL), KEEPALIVE (tone|silent|off).
// It runs a real browser against no real server: the tracks are near-silent tones served from here,
// each delayed by LATENCY ms to stand in for the car's round trip to Plex.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = process.env.APP ?? 'http://localhost:5173';
const MODE = process.env.KEEPALIVE ?? 'tone';
const LATENCY = 600;
const TRACK_SECONDS = 6; // over 5 s, so Chrome treats it as music rather than a short sound effect
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a stand-in Plex: three quiet tones, no CORS headers (like plex.direct), slow to answer ---
function tone(hz) {
	const rate = 44100;
	const n = rate * TRACK_SECONDS;
	const b = Buffer.alloc(44 + n * 2);
	b.write('RIFF', 0);
	b.writeUInt32LE(36 + n * 2, 4);
	b.write('WAVEfmt ', 8);
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(rate, 24);
	b.writeUInt32LE(rate * 2, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write('data', 36);
	b.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(40 * Math.sin((2 * Math.PI * hz * i) / rate)), 44 + i * 2);
	return b;
}
const tones = [330, 440, 550].map(tone);
const plex = createServer((req, res) => {
	const m = req.url.match(/^\/t(\d)\.wav/);
	if (!m) return res.writeHead(204).end();
	setTimeout(() => res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(tones[Number(m[1])]), LATENCY);
});
await new Promise((r) => plex.listen(0, '127.0.0.1', r));
const plexUrl = `http://127.0.0.1:${plex.address().port}`;

// --- headless Chrome over the DevTools protocol ---
const profile = mkdtempSync(join(tmpdir(), 'cabin-focus-'));
const chrome = spawn(
	CHROME,
	['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', 'about:blank'],
	{ stdio: ['ignore', 'ignore', 'pipe'] }
);
const wsUrl = await new Promise((resolve, reject) => {
	let err = '';
	chrome.stderr.on('data', (d) => {
		err += d;
		const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
		if (m) resolve(m[1]);
	});
	chrome.on('error', () => reject(new Error(`could not start Chrome at ${CHROME} (set CHROME=...)`)));
	setTimeout(() => reject(new Error('Chrome did not open a DevTools port')), 15000);
});
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const waiting = new Map();
ws.onmessage = (m) => {
	const d = JSON.parse(m.data);
	waiting.get(d.id)?.(d);
	waiting.delete(d.id);
};
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const id = ++seq;
		waiting.set(id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});
async function open(url) {
	const { targetId } = await send('Target.createTarget', { url, newWindow: true });
	return (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
}
async function run(page, expression) {
	const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page);
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
}

let failed = false;
try {
	const internals = await open('chrome://media-internals');
	const app = await open(APP);
	await sleep(2500);

	// Record every audio-focus change the browser announces: how many sessions hold focus, and when.
	await run(internals, `(() => {
		window.focusLog = [];
		const orig = media.onReceiveAudioFocusState.bind(media);
		media.onReceiveAudioFocusState = (s) => { focusLog.push({ t: Date.now(), n: (s?.sessions ?? []).length }); orig(s); };
	})()`);

	// Pretend to be paired (the stores are reachable in dev because Vite serves one module instance).
	await run(app, `(async () => {
		const s = await import('/src/lib/stores/session.svelte.ts');
		const l = await import('/src/lib/stores/library.svelte.ts');
		l.library.sections = [{ key: '1', title: 'Music', type: 'artist' }];
		l.library.activeId = '1'; l.library.loaded = true;
		s.session.active = { serverName: 'check', connType: 'local', baseUri: ${JSON.stringify(plexUrl)}, machineId: 'x', accessToken: 'x' };
		s.session.token = 'x'; s.session.status = 'connected';
		const p = await import('/src/lib/stores/player.svelte.ts');
		window.dbg = (await import('/src/lib/stores/debug.svelte.ts')).debug;
		p.setKeepAlive(${JSON.stringify(MODE)});
		p.playList([0, 1, 2].map((i) => ({ ratingKey: '', type: 'track', title: 'Tone ' + i,
			duration: ${TRACK_SECONDS * 1000}, Media: [{ Part: [{ key: '/t' + i + '.wav' }] }] })), 0);
	})()`);

	const deadline = Date.now() + (TRACK_SECONDS * 1000 + LATENCY + 2000) * 3 + 5000;
	let events = [];
	while (Date.now() < deadline) {
		events = await run(app, `dbg.events.map((e) => ({ t: e.t, msg: e.msg })).reverse()`);
		if (events.some((e) => e.msg.startsWith('end of queue'))) break;
		await sleep(250);
	}
	await sleep(500);
	const focus = await run(internals, `focusLog`);

	const started = events.find((e) => e.msg.startsWith('playing'))?.t;
	const ended = events.find((e) => e.msg.startsWith('end of queue'))?.t;
	const changes = events.filter((e) => e.msg.startsWith('ended')).length;
	if (!started || !ended || changes !== 3) throw new Error(`the queue did not play through:\n${events.map((e) => '  ' + e.msg).join('\n')}`);
	const lapses = focus.filter((f) => f.n === 0 && f.t > started && f.t < ended - 50);
	const released = focus.some((f) => f.n === 0 && f.t >= ended - 50);

	console.log(`keep-alive: ${MODE} · ${changes} tracks · load gap about ${LATENCY} ms each`);
	console.log(lapses.length ? `FAIL  audio focus dropped ${lapses.length}× between tracks` : 'ok    audio focus held across every track change');
	console.log(released ? 'ok    audio focus released at the end of the queue' : 'FAIL  audio focus still held after the queue ended');
	failed = lapses.length > 0 || !released;
} catch (e) {
	console.error('FAIL ', e.message);
	failed = true;
} finally {
	await send('Browser.close').catch(() => {});
	chrome.kill();
	plex.close();
	await sleep(300);
	rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
