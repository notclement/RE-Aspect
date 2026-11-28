// North test runner that runs INSIDE the signed-in test-site tab (paste via the browser tool's JS runner).
// Clement picks the test set zip once; the images stay in the tab (window.__ntCases), so later runs are started
// with window.ntRun({...}) without picking the file again. Calls detect-north one at a time.
// Extra cases: each floor plan can also be sent pre-turned by 90/180/270° clockwise — the right answer is then
// (expected − turn) mod 360, so one brochure gives four independent orientations to check.
(() => {
	const GT = { '00': 168, '01': 293, '02': 0, '03': 0, '04': 0, '05': 190, '06': 125, '07': 205, '08': 180, '09': 83, '10': 0, '11': 180, '12': 180, '13': 180, '14': 353, '15': 208, '16': 195, '18': 90 };
	const B = 'https://kyupdztsvwegaelrkyfd.supabase.co';
	const PK = 'sb_publishable_dyGHYJ-xqOkuEMaD6ZYCKw_-j4ZDmJy';
	window.__nt = window.__nt || { state: 'waiting for zip', res: [] };
	document.getElementById('nt-panel')?.remove();
	const panel = document.createElement('div');
	panel.id = 'nt-panel';
	panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#1f2a24;color:#fff;padding:14px 16px;border-radius:14px;font:14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.35)';
	panel.innerHTML = '<b>North test (Claude)</b><div id="nt-msg" style="margin:6px 0 10px;opacity:.85"></div><label id="nt-pick" style="display:inline-block;background:#7fa27a;color:#10201a;font-weight:700;padding:10px 14px;border-radius:10px;cursor:pointer">Choose test set zip<input id="nt-zip" type="file" accept=".zip" style="display:none"></label>';
	document.body.appendChild(panel);
	const msg = (t) => {
		window.__nt.state = t;
		const m = document.getElementById('nt-msg');
		if (m) m.textContent = t;
	};
	msg(window.__ntCases ? 'Test images loaded — Claude starts runs from here.' : 'Choose the test set zip once. Keep this tab open and the Mac awake.');
	if (window.__ntCases) document.getElementById('nt-pick').style.display = 'none';

	async function unzip(buf) {
		const dv = new DataView(buf);
		let e = buf.byteLength - 22;
		while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
		const n = dv.getUint16(e + 10, true);
		let p = dv.getUint32(e + 16, true);
		const out = {};
		const td = new TextDecoder();
		for (let i = 0; i < n; i++) {
			const method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
			const name = td.decode(new Uint8Array(buf, p + 46, nl));
			p += 46 + nl + el + cl;
			const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
			const data = buf.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + cs);
			out[name] = method === 0 ? new Blob([data]) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
		}
		return out;
	}
	/** JPEG data URL, long side ≤ max, turned `turn`° clockwise (0/90/180/270). */
	async function enc(blob, max, q, turn = 0) {
		const bm = await createImageBitmap(blob);
		const k = Math.min(1, max / Math.max(bm.width, bm.height));
		const w = Math.round(bm.width * k), h = Math.round(bm.height * k);
		const side = turn % 180 !== 0;
		const c = document.createElement('canvas');
		c.width = side ? h : w;
		c.height = side ? w : h;
		const g = c.getContext('2d');
		g.fillStyle = '#fff';
		g.fillRect(0, 0, c.width, c.height);
		g.translate(c.width / 2, c.height / 2);
		g.rotate((turn * Math.PI) / 180);
		g.drawImage(bm, -w / 2, -h / 2, w, h);
		return c.toDataURL('image/jpeg', q);
	}
	const tok = () => {
		const k = Object.keys(localStorage).find((x) => x.endsWith('auth-token'));
		return JSON.parse(localStorage.getItem(k)).access_token;
	};

	/** Run: cases (default all), turns (default [0]), reps (default 1), label. */
	window.ntRun = async ({ cases, turns = [0], reps = 1, label = 'run' } = {}) => {
		if (!window.__ntCases) return msg('Choose the test set zip first.');
		if (window.__nt.running) return 'already running';
		window.__nt = { state: '', res: [], label, running: true, started: Date.now() };
		const exp = window.__ntExp ?? {};
		const ids = (cases ?? Object.keys(window.__ntCases)).filter((id) => id in exp || id in GT).sort();
		const jobs = [];
		for (const id of ids) for (const t of turns) for (let r = 0; r < reps; r++) jobs.push([id, t]);
		window.__nt.total = jobs.length;
		let ok = 0, done = 0;
		for (const [id, t] of jobs) {
			const c = window.__ntCases[id];
			const cj = JSON.parse(await c['case.json'].text());
			const want = ((((exp[id] ?? GT[id]) - t) % 360) + 360) % 360;
			const body = {
				floorPlan: await enc(c['2_floor-plan-3room.jpg'], 1536, 0.8, t),
				others: [await enc(c['1_site-plan.jpg'], 1400, 0.75)],
				context: { address: `Blk ${cj.block} ${cj.project}, ${cj.town}, Singapore`, unitNo: '#' + cj.unit_no, level: 7, propertyType: 'hdb' },
				debug: true
			};
			msg(`${label}: ${id}${t ? ' +' + t + '°' : ''} (${done + 1}/${jobs.length}) · ${ok} passed`);
			const t0 = Date.now();
			let r;
			try {
				const resp = await fetch(B + '/functions/v1/detect-north', { method: 'POST', headers: { apikey: PK, Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
				r = await resp.json();
			} catch (e) {
				r = { err: String(e) };
			}
			const a = r.angle;
			const good = a != null && r.found && Math.min(Math.abs(a - want), 360 - Math.abs(a - want)) <= 15;
			ok += good;
			done++;
			const d = r.debug || {};
			window.__nt.res.push({ id, turn: t, good, a, want, s: Math.round((Date.now() - t0) / 1000), method: r.method, conf: r.confidence, stack: d.find?.stack_found, chose: d.chose, err: String(r.detail || r.error || r.err || '').slice(0, 120) });
			localStorage.setItem('nt-results-' + label, JSON.stringify(window.__nt.res));
			// Brief pause without setTimeout: Chrome throttles timers in a covered window, which stalled runs for minutes.
			await new Promise((z) => { const ch = new MessageChannel(); ch.port1.onmessage = () => z(); ch.port2.postMessage(0); });
		}
		window.__nt.running = false;
		window.__nt.done = true;
		msg(`${label} done: ${ok}/${jobs.length} passed.`);
		return `${ok}/${jobs.length}`;
	};

	document.getElementById('nt-zip').addEventListener('change', async (ev) => {
		try {
			msg('Reading the zip…');
			const files = await unzip(await ev.target.files[0].arrayBuffer());
			const cases = {};
			for (const [name, blob] of Object.entries(files)) {
				const m = name.match(/(?:^|\/)(\d\d)_[^/]*\/(1_site-plan\.jpg|2_floor-plan-3room\.jpg|case\.json)$/);
				if (!m) continue;
				(cases[m[1]] ??= {})[m[2]] = blob;
			}
			// New sets carry the answer in case.json (expected_cw); set 1 uses the GT table above.
			const exp = {};
			for (const [id, c] of Object.entries(cases)) {
				if (!c['case.json']) continue;
				const e = JSON.parse(await c['case.json'].text()).expected_cw;
				if (typeof e === 'number') exp[id] = e;
			}
			window.__ntExp = exp;
			window.__ntCases = cases;
			document.getElementById('nt-pick').style.display = 'none';
			msg(`Loaded ${Object.keys(cases).length} cases. Starting…`);
			window.ntRun(window.__ntNext ?? {});
		} catch (e) {
			msg('Error: ' + e);
		}
	});
	return 'panel ready';
})();
