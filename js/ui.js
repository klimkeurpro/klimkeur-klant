'use strict';

// ============================================================
// ui.js — Alle weergave: tabs, artikelen, certificaat, historie
// ============================================================

// Huidig actief certificaat (voor filter + zoek)
let _certData      = null;
let _actieveFilter = 'alle';

// ============================================================
// HELPERS
// ============================================================
function el(id) { return document.getElementById(id); }

function toast(bericht, type = 'success', ms = 3000) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = bericht;
  el('toastBox').appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// ============================================================
// TABS WISSELEN
// ============================================================
function switchTab(naam, knop) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el('page-' + naam).classList.add('active');
  knop.classList.add('active');
}

// ============================================================
// ARTIKELEN RENDEREN
// ============================================================
function renderArtikelen() {
  const lijst  = el('artLijst');
  const totaal = _artikelen.length;
  const goed   = _artikelen.filter(a => a.status === 'goedgekeurd').length;
  const nodig  = _artikelen.filter(a => keuringStatus(a.inGebruik) === 'overdue').length;

  el('artTeller').textContent  = totaal;
  el('statTotaal').textContent = totaal;
  el('statGoed').textContent   = goed;
  el('statKeuring').textContent = nodig;

  if (totaal === 0) {
    lijst.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
      <h3>Nog geen artikelen</h3>
      <p>Voeg je klimmateriaal toe via het formulier hierboven.</p>
    </div>`;
    return;
  }

  // Sorteer: keuring nodig bovenaan
  const prio = { overdue: 0, soon: 1, ok: 2 };
  const gesorteerd = [..._artikelen].sort((a, b) => {
    const ka = keuringStatus(a.inGebruik) || 'ok';
    const kb = keuringStatus(b.inGebruik) || 'ok';
    if ((prio[ka] || 2) !== (prio[kb] || 2)) return (prio[ka] || 2) - (prio[kb] || 2);
    return (b.toegevoegd || '').localeCompare(a.toegevoegd || '');
  });

  lijst.innerHTML = gesorteerd.map(art => {
    const idx = _artikelen.indexOf(art);
    const ks  = keuringStatus(art.inGebruik);
    const kt  = keuringTekst(ks, art.inGebruik);

    const statusBadge = art.status === 'goedgekeurd'
      ? '<span class="badge badge-green" style="font-size:11px;padding:2px 8px;">✓ Goed</span>'
      : art.status === 'afgekeurd'
      ? '<span class="badge badge-red" style="font-size:11px;padding:2px 8px;">✗ Afgekeurd</span>'
      : '';

    return `<div class="mat-item">
      <div class="mat-item-top">
        <div style="flex:1;min-width:0">
          <div class="mat-naam">${esc(art.omschrijving)} ${statusBadge}</div>
          ${art.merk ? `<div class="mat-merk">${esc(art.merk)}</div>` : ''}
          <div class="mat-meta">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="16" width="20" height="4" rx="1"/></svg>
              <span class="mat-sn">${esc(art.serienummer)}</span>
            </span>
            ${art.inGebruik ? `<span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Sinds: ${formatDatum(art.inGebruik)}
            </span>` : ''}
            ${art.fabrJaar ? `<span style="color:var(--text-muted)">Prod: ${art.fabrJaar}${art.fabrMaand ? '-' + art.fabrMaand : ''}</span>` : ''}
            ${art.gebruiker ? `<span style="color:var(--text-muted)">👤 ${esc(art.gebruiker)}</span>` : ''}
          </div>
          ${art.opmerking ? `<div class="mat-opmerking">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ${esc(art.opmerking)}
          </div>` : ''}
          ${kt ? `<div style="margin-top:6px"><span class="keur-badge ${ks}">${kt}</span></div>` : ''}
        </div>
        <div class="item-actions">
          ${!art.keuringId ? `<button class="icon-btn" title="Bewerken" onclick="openEdit(${idx})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>` : ''}
          ${!art.keuringId ? `<button class="icon-btn danger" title="Verwijderen" onclick="verwijder(${idx})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// ARTIKEL TOEVOEGEN
// ============================================================
async function voegToe() {
  if (!_userId || !_klantId) { toast('Je bent niet ingelogd', 'error'); return; }

  const omschr = el('fOmschr').value.trim();
  const sn     = el('fSN').value.trim();
  if (!omschr) { toast('Vul een omschrijving in', 'error'); el('fOmschr').focus(); return; }
  if (!sn)     { toast('Vul een serienummer in', 'error'); el('fSN').focus(); return; }

  if (_artikelen.some(a => a.serienummer.toLowerCase() === sn.toLowerCase())) {
    if (!confirm(`Serienummer "${sn}" staat al in je lijst. Toch toevoegen?`)) return;
  }

  const jaar  = el('fJaar').value.trim();
  const maand = el('fMaand').value;
  const art   = {
    id:            genId(),
    omschrijving:  omschr,
    merk:          el('fMerk').value.trim(),
    materiaal:     el('fOmschr').dataset.materiaal || '',
    serienummer:   sn,
    fabrJaar:      jaar ? parseInt(jaar) : '',
    fabrMaand:     (jaar && maand) ? maand : '',
    productieDatum: jaar ? (maand ? jaar + '-' + maand : String(jaar)) : '',
    inGebruik:     el('fInGebruik').value,
    gebruiker:     el('fGebruiker').value.trim(),
    opmerking:     el('fOpmerking').value.trim(),
    toegevoegd:    new Date().toISOString(),
    status:        'nieuw',
    keuringId:     null,
  };

  const btn = el('toevoegBtn');
  btn.disabled = true;
  btn.textContent = 'Opslaan...';

  const ok = await slaArtikelOp(art);

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Toevoegen`;

  if (!ok) return;

  _artikelen.unshift(art);

  // Formulier resetten (bewaar gebruiker-veld)
  const gebruiker = el('fGebruiker').value;
  el('fOmschr').value = '';
  el('fMerk').value = '';
  el('fMerk').className = 'form-input';
  el('merkLabel').style.display = 'none';
  el('fSN').value = '';
  el('fJaar').value = '';
  el('fMaand').value = '';
  el('fInGebruik').value = '';
  el('fOpmerking').value = '';
  el('fOmschr').dataset.materiaal = '';
  el('fGebruiker').value = gebruiker;
  el('fOmschr').focus();

  renderArtikelen();
  toast('Artikel toegevoegd');
}

// ============================================================
// ARTIKEL BEWERKEN
// ============================================================
function openEdit(idx) {
  const a = _artikelen[idx];
  if (!a) return;

  el('editIdx').value    = idx;
  el('eOmschr').value    = a.omschrijving || '';
  el('eMerk').value      = a.merk || '';
  el('eMerk').className  = 'form-input';
  el('eMerkLabel').style.display = 'none';
  el('eSN').value        = a.serienummer || '';
  el('eJaar').value      = a.fabrJaar || '';
  el('eMaand').value     = a.fabrMaand || '';
  el('eInGebruik').value = a.inGebruik || '';
  el('eGebruiker').value = a.gebruiker || '';
  el('eOpmerking').value = a.opmerking || '';

  el('editModal').classList.add('active');
}

function sluitModal() {
  el('editModal').classList.remove('active');
}

async function slaEditOp() {
  const idx    = parseInt(el('editIdx').value);
  const omschr = el('eOmschr').value.trim();
  const sn     = el('eSN').value.trim();

  if (!omschr || !sn) {
    toast('Omschrijving en serienummer zijn verplicht', 'error');
    return;
  }

  const jaar  = el('eJaar').value.trim();
  const maand = el('eMaand').value;

  const bijgewerkt = {
    ..._artikelen[idx],
    omschrijving:   omschr,
    merk:           el('eMerk').value.trim(),
    serienummer:    sn,
    fabrJaar:       jaar ? parseInt(jaar) : '',
    fabrMaand:      (jaar && maand) ? maand : '',
    productieDatum: jaar ? (maand ? jaar + '-' + maand : String(jaar)) : '',
    inGebruik:      el('eInGebruik').value,
    gebruiker:      el('eGebruiker').value.trim(),
    opmerking:      el('eOpmerking').value.trim(),
  };

  const ok = await slaArtikelOp(bijgewerkt);
  if (!ok) return;

  _artikelen[idx] = bijgewerkt;
  sluitModal();
  renderArtikelen();
  toast('Artikel bijgewerkt');
}

async function verwijder(idx) {
  const a = _artikelen[idx];
  if (a.keuringId) {
    toast('Dit artikel is gekoppeld aan een keuring en kan niet worden verwijderd', 'error');
    return;
  }
  if (!confirm(`"${a.omschrijving}" (${a.serienummer}) verwijderen?`)) return;

  const ok = await verwijderArtikelDb(a.id);
  if (!ok) return;

  _artikelen.splice(idx, 1);
  renderArtikelen();
  toast('Artikel verwijderd');
}

// ============================================================
// CERTIFICAAT RENDEREN
// Toont de meest recente keuring
// ============================================================
function renderCertificaat() {
  if (_keuringen.length === 0) {
    el('certLeeg').style.display = 'block';
    el('certView').style.display = 'none';
    return;
  }
  toonCertificaat(_keuringen[0]);
}

function toonCertificaat(keuring) {
  if (!keuring) return;

  _certData = {
    certificaat: {
      nr:          keuring.certificaat_nr || '—',
      datum:       keuring.datum || '',
      keurmeester: keuring.keurmeester || '',
      bedrijf:     keuring.bedrijf_keurmeester || '',
      afgerond:    keuring.afgerond || false,
    },
    items: keuring._items || [],
  };
  _actieveFilter = 'alle';

  el('certLeeg').style.display = 'none';
  el('certView').style.display = 'block';

  const c     = _certData.certificaat;
  const items = _certData.items;

  el('certInfo').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Certificaatnummer</div>
        <div class="cert-nr">${esc(c.nr)}</div>
        <div class="cert-meta">
          ${_klantNaam ? esc(_klantNaam) + ' · ' : ''}Keuringsdatum: ${c.datum ? formatDatum(c.datum) : '—'}<br>
          Keurmeester: ${esc(c.keurmeester || '—')}${c.bedrijf ? ' · ' + esc(c.bedrijf) : ''}
        </div>
      </div>
      <span class="badge" style="background:rgba(255,255,255,.2);color:#fff">${c.afgerond ? '✓ Afgerond' : 'Concept'}</span>
    </div>`;

  const goed = items.filter(i => i.status === 'goedgekeurd').length;
  const afk  = items.filter(i => i.status === 'afgekeurd').length;

  el('certStats').innerHTML = `
    <div class="stat-box"><div class="stat-nr">${items.length}</div><div class="stat-lbl">Totaal</div></div>
    <div class="stat-box"><div class="stat-nr" style="color:var(--green)">${goed}</div><div class="stat-lbl">Goedgekeurd</div></div>
    <div class="stat-box"><div class="stat-nr" style="color:var(--danger)">${afk}</div><div class="stat-lbl">Afgekeurd</div></div>`;

  // Filter op gebruiker (alleen tonen als er meerdere gebruikers zijn)
  const gebruikers = [...new Set(items.map(i => i.gebruiker || ''))];
  const filterEl   = el('certFilter');
  if (gebruikers.length > 1) {
    filterEl.style.display = 'block';
    el('certFilterBtns').innerHTML =
      `<button class="filter-btn active" onclick="setCertFilter('alle',this)">Alle</button>` +
      gebruikers.map(g => `<button class="filter-btn" onclick="setCertFilter('${escAttr(g)}',this)">${esc(g || 'Algemeen')}</button>`).join('');
  } else {
    filterEl.style.display = 'none';
  }

  el('certZoek').value = '';
  renderCertItems(items);
}

function setCertFilter(waarde, knop) {
  _actieveFilter = waarde;
  document.querySelectorAll('#certFilterBtns .filter-btn').forEach(b => b.classList.remove('active'));
  knop.classList.add('active');
  filterCert();
}

function filterCert() {
  if (!_certData) return;
  const q     = (el('certZoek').value || '').toLowerCase().trim();
  let items   = _certData.items;
  if (_actieveFilter !== 'alle') items = items.filter(i => (i.gebruiker || '') === _actieveFilter);
  if (q) items = items.filter(i =>
    [i.omschrijving, i.serienummer, i.merk, i.materiaal].some(v => (v || '').toLowerCase().includes(q))
  );
  renderCertItems(items, q);
}

function renderCertItems(items, zoek) {
  const hl = (s) => {
    if (!zoek || !s) return esc(s || '');
    return esc(s).replace(new RegExp('(' + escRx(zoek) + ')', 'gi'), '<mark style="background:#d4edda;border-radius:2px">$1</mark>');
  };

  if (items.length === 0) {
    el('certItems').innerHTML = '<div class="geen-res">Geen items gevonden</div>';
    return;
  }

  // Groepeer per gebruiker
  const groepen = {};
  items.forEach(i => {
    const g = i.gebruiker || 'Algemeen';
    if (!groepen[g]) groepen[g] = [];
    groepen[g].push(i);
  });

  el('certItems').innerHTML = Object.entries(groepen).map(([gebruiker, lijst]) => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <div class="card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${esc(gebruiker)} <span class="count-badge">${lijst.length}</span>
        </div>
      </div>
      <div class="card-body" style="padding:8px 16px">
        ${lijst.map(i => {
          const badge = i.status === 'goedgekeurd'
            ? '<span class="badge badge-green">✓ Goed</span>'
            : i.status === 'afgekeurd'
            ? `<span class="badge badge-red">✗ Afgekeurd${i.afkeurcode ? ' — ' + esc(i.afkeurcode) : ''}</span>`
            : '<span class="badge badge-gray">Niet beoordeeld</span>';
          return `<div class="cert-item">
            <div class="cert-item-info">
              <div class="cert-item-omschr">${hl(i.omschrijving || '—')}</div>
              <div class="cert-item-sn">
                ${i.serienummer ? 'SN: ' + hl(i.serienummer) : ''}
                ${i.merk ? ' · ' + hl(i.merk) : ''}
                ${i.materiaal ? ' · ' + hl(i.materiaal) : ''}
                ${i.in_gebruik ? ' · Sinds: ' + formatDatum(i.in_gebruik) : ''}
              </div>
              ${i.opmerking ? `<div style="font-size:12px;color:var(--warning);margin-top:3px">⚠ ${esc(i.opmerking)}</div>` : ''}
            </div>
            <div style="flex-shrink:0">${badge}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

// ============================================================
// HISTORIE RENDEREN
// ============================================================
function renderHistorie() {
  if (_keuringen.length === 0) {
    el('histLeeg').style.display = 'block';
    el('histView').style.display = 'none';
    return;
  }
  el('histLeeg').style.display = 'none';
  el('histView').style.display = 'block';
  el('histZoek').value = '';
  renderHistorieLijst(_keuringen);
}

function filterHist() {
  const q = (el('histZoek').value || '').toLowerCase().trim();
  renderHistorieLijst(_keuringen, q);
}

function renderHistorieLijst(keuringen, zoek) {
  const hl = (s) => {
    if (!zoek || !s) return esc(s || '');
    return esc(s).replace(new RegExp('(' + escRx(zoek) + ')', 'gi'), '<mark style="background:#d4edda;border-radius:2px">$1</mark>');
  };

  const html = keuringen.map((k, idx) => {
    let items = k._items || [];
    if (zoek) items = items.filter(i =>
      [i.omschrijving, i.serienummer, i.merk, i.materiaal].some(v => (v || '').toLowerCase().includes(zoek))
    );
    if (zoek && items.length === 0) return '';

    const goed = items.filter(i => i.status === 'goedgekeurd').length;
    const afk  = items.filter(i => i.status === 'afgekeurd').length;

    return `<div class="hist-item">
      <div class="hist-header" onclick="toggleHist(${idx})">
        <div class="hist-left">
          <div class="hist-nr">${esc(k.certificaat_nr || '—')}</div>
          <div class="hist-datum">
            ${k.datum ? formatDatum(k.datum) : '—'} · ${esc(k.keurmeester || '')} · ${items.length} items ·
            <span style="color:var(--green)">${goed} goed</span>
            ${afk > 0 ? ` · <span style="color:var(--danger)">${afk} afgekeurd</span>` : ''}
          </div>
        </div>
        <svg class="hist-chev" id="hchev-${idx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="hist-body" id="hbody-${idx}">
        ${items.map(i => {
          const badge = i.status === 'goedgekeurd'
            ? '<span class="badge badge-green">✓ Goed</span>'
            : i.status === 'afgekeurd'
            ? `<span class="badge badge-red">✗ Afgekeurd${i.afkeurcode ? ' — ' + esc(i.afkeurcode) : ''}</span>`
            : '<span class="badge badge-gray">—</span>';
          return `<div class="cert-item">
            <div class="cert-item-info">
              <div class="cert-item-omschr">${hl(i.omschrijving || '—')}</div>
              <div class="cert-item-sn">
                ${i.serienummer ? 'SN: ' + hl(i.serienummer) : ''}
                ${i.merk ? ' · ' + hl(i.merk) : ''}
              </div>
            </div>
            <div style="flex-shrink:0">${badge}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  el('histLijst').innerHTML = html.trim() || '<div class="geen-res">Geen items gevonden</div>';

  // Bij zoeken: klap alle resultaten automatisch open
  if (zoek) {
    keuringen.forEach((_, idx) => {
      const body = el(`hbody-${idx}`);
      const chev = el(`hchev-${idx}`);
      if (body) body.classList.add('open');
      if (chev) chev.classList.add('open');
    });
  }
}

function toggleHist(idx) {
  const body = el(`hbody-${idx}`);
  const chev = el(`hchev-${idx}`);
  if (body) body.classList.toggle('open');
  if (chev) chev.classList.toggle('open');
}

// ============================================================
// OFFLINE DETECTIE
// ============================================================
window.addEventListener('offline', () => {
  el('offlineBar').classList.add('show');
});
window.addEventListener('online', () => {
  el('offlineBar').classList.remove('show');
  toast('Verbinding hersteld', 'success');
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') sluitModal();
});
