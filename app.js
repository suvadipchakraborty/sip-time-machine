'use strict';
const API = 'https://api.mfapi.in/mf';
const SITE = 'https://sip-time-machine.suvadipchakraborty.workers.dev/';
const RD_RATE = 0.07;
const $ = s => document.querySelector(s);
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
let picked = null, timer, last = null, deferred = null;

/* ---------- tabs ---------- */
document.querySelectorAll('.bottom button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.bottom button').forEach(x => x.classList.toggle('on', x === b));
  $('#tab-machine').hidden = b.dataset.tab !== 'machine';
  $('#tab-about').hidden = b.dataset.tab !== 'about';
  scrollTo(0, 0);
});

/* ---------- inputs ---------- */
const amt = $('#amt'), amtR = $('#amtRange'), yrs = $('#yrs');
amtR.oninput = () => amt.value = amtR.value;
amt.oninput = () => amtR.value = Math.min(amt.value, amtR.max);
yrs.oninput = () => $('#yrsOut').textContent = yrs.value + (yrs.value == 1 ? ' year' : ' years');

/* ---------- search + Direct/Regular pairing ---------- */
const isGrowth = n => /growth/i.test(n) && !/idcw|dividend|bonus|payout|reinvest/i.test(n);
const planOf = n => /direct|\bdir\b/i.test(n) ? 'direct' : 'regular';
const keyOf = n => n.toLowerCase().replace(/\(?\b(direct|regular|dir|reg)\b\)?/g, '').replace(/\b(plan|option|growth)\b/g, '').replace(/[^a-z0-9]+/g, '');
const cleanName = n => n.replace(/\s*-?\s*\(?(direct|regular)(\s*plan)?\)?\s*-?\s*(growth( option| plan)?)?/i, '').replace(/\s*-\s*growth.*$/i, '').replace(/\s+-\s*$/, '').trim();

function group(list) {
  const g = new Map();
  for (const f of list.filter(f => isGrowth(f.schemeName))) {
    const k = keyOf(f.schemeName);
    const e = g.get(k) || { name: cleanName(f.schemeName), key: k };
    e[planOf(f.schemeName)] = e[planOf(f.schemeName)] || f.schemeCode;
    g.set(k, e);
  }
  return [...g.values()].sort((a, b) => (!!(b.direct && b.regular)) - (!!(a.direct && a.regular)));
}

let seq = 0;
$('#q').addEventListener('input', e => {
  clearTimeout(timer); picked = null; $('#picked').hidden = true; seq++;
  const q = e.target.value.trim();
  if (q.length < 3) return showList(null);
  timer = setTimeout(() => search(q), 300);
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) showList(null); });

async function search(q) {
  const my = ++seq;
  try {
    const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw 0;
    const data = await r.json();
    if (my === seq) showList(group(data));
  } catch { if (my === seq) showList([], 'Search failed. Check your connection and try again.'); }
}

function showList(items, msg) {
  const ul = $('#results');
  ul.innerHTML = '';
  if (items === null) { ul.hidden = true; return; }
  if (!items.length) ul.innerHTML = `<li class="none">${msg || 'No growth-plan funds found. Try a different spelling.'}</li>`;
  items.slice(0, 15).forEach(f => {
    const li = document.createElement('li');
    li.textContent = f.name; li.tabIndex = 0; li.setAttribute('role', 'option');
    const choose = async () => {
      picked = f; $('#q').value = f.name; ul.hidden = true; seq++;
      const p = $('#picked'); p.hidden = false; p.style.color = ''; p.textContent = 'Matching Direct and Regular plans...';
      if (!(f.direct && f.regular)) { // counterpart missing from the search results: look it up by full name
        try {
          const r = await fetch(`${API}/search?q=${encodeURIComponent(f.name)}`);
          const m = group(await r.json()).find(g => g.key === f.key);
          if (m) { f.direct = f.direct || m.direct; f.regular = f.regular || m.regular; }
        } catch { /* handled below */ }
      }
      if (picked !== f) return;
      const both = f.direct && f.regular;
      p.style.color = both ? '' : 'var(--red)';
      p.textContent = both ? 'Direct and Regular plans matched' : `Only the ${f.direct ? 'Direct' : 'Regular'} plan was found, so the commission comparison is not available for this fund.`;
    };
    li.onclick = choose; li.onkeydown = e => e.key === 'Enter' && choose();
    ul.appendChild(li);
  });
  ul.hidden = false;
}

/* ---------- data + math engine ---------- */
async function loadNav(code) {
  const r = await fetch(`${API}/${code}`);
  if (!r.ok) throw new Error('Could not load NAV history.');
  const j = await r.json();
  if (!j.data || !j.data.length) throw new Error('No NAV history for this fund.');
  return j.data.map(x => { const [d, m, y] = x.date.split('-'); return { t: new Date(+y, m - 1, +d).getTime(), v: parseFloat(x.nav) }; })
    .filter(x => x.v > 0).reverse(); // oldest first
}
const firstOnOrAfter = (s, t) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; s[m].t < t ? lo = m + 1 : hi = m; } return s[lo]; };
const near = (s, t) => { const p = firstOnOrAfter(s, t); return p && p.t - t <= 7 * 864e5 ? p : null; };

function simulate(dir, reg, sip, years) {
  const now = new Date(), months = years * 12;
  const dates = Array.from({ length: months }, (_, i) => new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1));
  const ok = dates.filter(d => near(dir, d.getTime()) && near(reg, d.getTime())); // same installments for both plans
  if (ok.length < 3) throw new Error('This fund has too little history for that period. Try a shorter time dial.');
  let ud = 0, ur = 0, rd = 0;
  const q = 1 + RD_RATE / 4;
  for (const d of ok) {
    ud += sip / near(dir, d.getTime()).v;
    ur += sip / near(reg, d.getTime()).v;
    const left = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() + 1;
    rd += sip * Math.pow(q, 4 * left / 12);
  }
  return { n: ok.length, invested: sip * ok.length, direct: ud * dir[dir.length - 1].v, regular: ur * reg[reg.length - 1].v, rd, actualYears: ok.length / 12, from: ok[0] };
}

/* ---------- run ---------- */
$('#go').onclick = async () => {
  const sip = +amt.value, years = +yrs.value, err = $('#err');
  err.hidden = true;
  if (!picked) return fail('Search and pick a fund first.');
  if (!picked.direct || !picked.regular) return fail('Pick a fund that has both a Direct and a Regular plan.');
  if (!(sip >= 500)) return fail('Enter a monthly amount of at least ₹500.');
  warp(true, years);
  try {
    const [d, r] = await Promise.all([loadNav(picked.direct), loadNav(picked.regular)]);
    await new Promise(res => setTimeout(res, 900));
    last = { ...simulate(d, r, sip, years), sip, years, name: picked.name };
    render(last);
  } catch (e) { fail(e.message || 'Something went wrong. Try again.'); }
  finally { warp(false); }
  function fail(m) { err.textContent = m; err.hidden = false; }
};

let warpTick;
function warp(on, years) {
  $('#warp').hidden = !on; clearInterval(warpTick);
  if (!on) return;
  const y0 = new Date().getFullYear(); let y = y0;
  warpTick = setInterval(() => { y = y > y0 - years ? y - 1 : y0; $('#warpText').textContent = 'Rewinding to ' + y + '…'; }, 160);
}

function render(r) {
  const leak = r.direct - r.regular, pct = r.direct ? leak / r.direct * 100 : 0;
  $('#fundName').textContent = `${r.name} · ${inr(r.sip)} a month`;
  $('#headline').textContent = `Your ${inr(r.invested)} investment is now worth ${inr(r.direct)}.`;
  $('#note').textContent = r.actualYears < r.years - 0.1 ? `This fund only has ${r.actualYears.toFixed(1)} years of history, so that is the period shown.` : `${r.n} monthly instalments, bought at each month's first available NAV.`;
  $('#leak').textContent = inr(leak);
  $('#leakSub').textContent = `${pct.toFixed(1)}% of your Direct plan wealth went to commissions in the Regular plan.`;
  $('#regVal').textContent = inr(r.regular); $('#dirVal').textContent = inr(r.direct);
  const max = Math.max(r.invested, r.rd, r.direct, r.regular);
  const rows = [['Total invested', r.invested, '#7f95a0'], ['7% bank RD', r.rd, '#ffb020'], ['Regular plan', r.regular, '#ff3b4e'], ['Direct plan', r.direct, '#19f0ff']];
  $('#bars').innerHTML = rows.map(([l, v, c]) => `<div><div class="bar-top"><span>${l}</span><b>${inr(v)}</b></div><div class="track"><i data-w="${(v / max * 100).toFixed(1)}" style="background:${c};box-shadow:0 0 12px ${c}"></i></div></div>`).join('');
  $('#out').hidden = false; $('#meterFill').style.width = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('#meterFill').style.width = Math.min(100, pct * 4) + '%';
    document.querySelectorAll('.track i').forEach(i => i.style.width = i.dataset.w + '%');
  }));
  $('#out').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- share ---------- */
$('#share').onclick = async () => {
  if (!last) return;
  const text = `If I invested ${inr(last.sip)}/month in ${last.name} ${last.years} years ago, I'd have ${inr(last.direct)} today! The Regular plan would have cost me ${inr(last.direct - last.regular)} in commissions.`;
  try {
    if (navigator.share) await navigator.share({ title: 'SIP Time Machine', text, url: SITE });
    else { await navigator.clipboard.writeText(text + ' ' + SITE); $('#share').textContent = 'Copied to clipboard'; setTimeout(() => $('#share').textContent = 'Share my result', 2000); }
  } catch { /* share cancelled */ }
};

/* ---------- PWA ---------- */
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
addEventListener('appinstalled', () => { $('#installHint').textContent = 'Installed. Open it from your home screen.'; });
$('#install').onclick = async () => {
  const h = $('#installHint');
  if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; }
  else if (matchMedia('(display-mode: standalone)').matches) h.textContent = 'You are already using the installed app.';
  else h.textContent = 'On iPhone: tap Share, then Add to Home Screen. On other browsers: open the browser menu and choose Install app.';
};
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
