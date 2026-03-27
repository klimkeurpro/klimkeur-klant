'use strict';

// ============================================================
// ui.js — Alle weergave: tabs, artikelen, certificaat, historie
// ============================================================

let _certData        = null;
let _actieveFilter   = 'alle';
let _artSort         = { col: 'omschrijving', asc: true };
let _toonAfgevoerd   = false;
let _gebruikerFilter = '';
let _artZoek         = ''; // zoekterm artikelenlijst

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
// TOEVOEGFORMULIER IN/UITKLAPPEN
// ============================================================
function toggleToevoegForm() {
  const form = el('toevoegForm');
  const chev = el('toevoegChev');
  const open = form.style.display !== 'none';
  form.style.display = open ? 'none' : 'block';
  chev.style.transform = open ? 'rotate(-90deg)' : 'rotate(0deg)';
  if (!open) setTimeout(() => el('fOmschr')?.focus(), 50);
}

// ============================================================
// ARTIKELEN RENDEREN — sorteerbare tabel met zoeken en gebruikersfilter
// ============================================================
function sortArtikelen(col) {
  if (_artSort.col === col) _artSort.asc = !_artSort.asc;
  else { _artSort.col = col; _artSort.asc = true; }
  renderArtikelen();
}

function toggleAfgevoerd() {
  _toonAfgevoerd = !_toonAfgevoerd;
  renderArtikelen();
}

function setGebruikerFilter(gebruiker) {
  _gebruikerFilter = gebruiker;
  renderArtikelen();
}

function zoekArtikelen(waarde) {
  _artZoek = waarde.toLowerCase().trim();
  renderArtikelen();
}

function renderArtikelen() {
  const actief    = _artikelen.filter(a => !a.afgevoerd);
  const afgevoerd = _artikelen.filter(a => a.afgevoerd);

  const totaal = actief.length;
  const goed   = actief.filter(a => a.status === 'goedgekeurd').length;
  const nodig  = actief.filter(a => {
    const kd = a.keuringId ? (_keuringen.find(k => k.id === a.keuringId)?.datum || null) : null;
    return keuringStatus(a.inGebruik, kd) === 'overdue';
  }).length;

  el('artTeller').textContent   = totaal;
  el('statTotaal').textContent  = totaal;
  el('statGoed').textContent    = goed;
  el('statKeuring').textContent = nodig;

  const lijst = el('artLijst');

  if (totaal === 0 && afgevoerd.length === 0) {
    lijst.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
      <h3>Nog geen artikelen</h3>
      <p>Klik op "Artikel toevoegen" hierboven om te beginnen.</p>
    </div>`;
    return;
  }

  // Unieke gebruikers voor filterknopjes
  const gebruikers = [...new Set(actief.map(a => a.gebruiker || '').filter(Boolean))].sort();

  // Pas gebruikersfilter toe
  let teTonenLijst = _toonAfgevoerd ? afgevoerd : actief;
  if (_gebruikerFilter && !_toonAfgevoerd) {
    teTonenLijst = teTonenLijst.filter(a => (a.gebruiker || '') === _gebruikerFilter);
  }

  // Pas zoekfilter toe
  if (_artZoek) {
    teTonenLijst = teTonenLijst.filter(a =>
      [a.omschrijving, a.merk, a.materiaal, a.serienummer, a.gebruiker].some(v =>
        (v || '').toLowerCase().includes(_artZoek)
      )
    );
  }

  // Sorteer
  const gesorteerd = [...teTonenLijst].sort((a, b) => {
    if (_artSort.col === 'status') {
      const rang = { goedgekeurd: 0, afgekeurd: 1 };
      const va = rang[a.status] !== undefined ? rang[a.status] : 2;
      const vb = rang[b.status] !== undefined ? rang[b.status] : 2;
      return _artSort.asc ? va - vb : vb - va;
    }
    const va = String(a[_artSort.col] || '').toLowerCase();
    const vb = String(b[_artSort.col] || '').toLowerCase();
    return _artSort.asc ? va.localeCompare(vb, 'nl') : vb.localeCompare(va, 'nl');
  });

  const kolommen = [
    { key: 'omschrijving', label: 'Omschrijving' },
    { key: 'merk',         label: 'Merk' },
    { key: 'materiaal',    label: 'Materiaal' },
    { key: 'serienummer',  label: 'Serienummer' },
    { key: 'status',       label: 'Status' },
  ];

  const thHtml = kolommen.map(k => {
    const actief = _artSort.col === k.key;
    const pijl   = actief ? (_artSort.asc ? ' ▲' : ' ▼') : ' ▲';
    return `<th onclick="sortArtikelen('${k.key}')" style="cursor:pointer;user-select:none;white-space:nowrap;${actief ? 'color:var(--green)' : ''}">${k.label}<span style="font-size:10px;opacity:${actief ? '1' : '0.3'}">${pijl}</span></th>`;
  }).join('') + '<th style="width:100px"></th>';

  const rijen = gesorteerd.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">${_artZoek ? 'Geen resultaten voor "' + esc(_artZoek) + '"' : 'Geen artikelen'}</td></tr>`
    : gesorteerd.map(art => {
        const idx = _artikelen.indexOf(art);
        const keuringDatum = art.keuringId
          ? (_keuringen.find(k => k.id === art.keuringId)?.datum || null)
          : null;
        const ks = keuringStatus(art.inGebruik, keuringDatum);
        const kt = keuringTekst(ks, art.inGebruik, keuringDatum);

        const statusBadge = art.status === 'goedgekeurd'
          ? '<span class="badge badge-green" style="font-size:11px;padding:2px 8px;white-space:nowrap">✓ Goed</span>'
          : art.status === 'afgekeurd'
          ? '<span class="badge badge-red" style="font-size:11px;padding:2px 8px;white-space:nowrap">✗ Afgekeurd</span>'
          : '<span style="font-size:11px;color:var(--text-muted)">—</span>';

        const keurBadge = kt
          ? `<div style="margin-top:3px"><span class="keur-badge ${ks}" style="font-size:10px">${kt}</span></div>`
          : '';

        const acties = art.afgevoerd
          ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic">Afgevoerd</span>`
          : `<div style="display:flex;gap:4px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">
              <button class="icon-btn" title="Bewerken" onclick="openEdit(${idx})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button onclick="openAfvoerDialog(${idx})" style="background:rgba(243,156,18,0.15);border:1px solid var(--warning);color:var(--warning);padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap;">Afvoeren</button>
            </div>`;

        return `<tr style="${art.afgevoerd ? 'opacity:0.5' : ''}">
          <td>
            <div style="font-weight:500">${esc(art.omschrijving)}</div>
            ${art.gebruiker ? `<div style="font-size:11px;color:var(--text-muted)">👤 ${esc(art.gebruiker)}</div>` : ''}
            ${keurBadge}
          </td>
          <td style="color:var(--text-secondary)">${esc(art.merk || '—')}</td>
          <td style="color:var(--text-secondary)">${esc(art.materiaal || '—')}</td>
          <td style="font-family:monospace;font-size:12px">${esc(art.serienummer || '—')}</td>
          <td>${statusBadge}</td>
          <td>${acties}</td>
        </tr>`;
      }).join('');

  // Gebruikersfilter knopjes
  const filterBtns = gebruikers.length > 1
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button onclick="setGebruikerFilter('')" style="padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:${!_gebruikerFilter ? 'var(--green)' : 'transparent'};color:${!_gebruikerFilter ? '#fff' : 'var(--text-secondary)'};font-size:12px;cursor:pointer;">
          Alle (${actief.length})
        </button>
        ${gebruikers.map(g => {
          const aantal = actief.filter(a => (a.gebruiker || '') === g).length;
          const actf = _gebruikerFilter === g;
          return `<button onclick="setGebruikerFilter('${escAttr(g)}')" style="padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:${actf ? 'var(--green)' : 'transparent'};color:${actf ? '#fff' : 'var(--text-secondary)'};font-size:12px;cursor:pointer;">
            ${esc(g)} (${aantal})
          </button>`;
        }).join('')}
      </div>`
    : '';

  const afgevoerdToggle = afgevoerd.length > 0
    ? `<div style="text-align:center;margin-top:12px">
        <button onclick="toggleAfgevoerd()" style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;text-decoration:underline">
          ${_toonAfgevoerd ? '← Terug naar actieve artikelen' : `Toon ${afgevoerd.length} afgevoerd artikel${afgevoerd.length !== 1 ? 'en' : ''}`}
        </button>
      </div>`
    : '';

  lijst.innerHTML = `
    ${filterBtns}
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
      <table style="min-width:600px;width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--border)">${thHtml}</tr></thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>
    ${afgevoerdToggle}`;
}

// ============================================================
// AFVOER DIALOG
// ============================================================
function openAfvoerDialog(idx) {
  const art = _artikelen[idx];
  if (!art) return;

  const overlay = document.createElement('div');
  overlay.id = 'afvoerOverlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">Artikel afvoeren</div>
      <p style="font-size:14px;margin-bottom:16px">
        <strong>${esc(art.omschrijving)}</strong> wordt uit je actieve lijst verwijderd.<br>
        Het artikel blijft zichtbaar in je keuringshistorie.
      </p>
      <div class="form-group">
        <label class="form-label">Reden</label>
        <select class="form-input" id="afvoerReden">
          <option value="Kapot / onherstelbaar beschadigd">Kapot / onherstelbaar beschadigd</option>
          <option value="Gestolen">Gestolen</option>
          <option value="Weggegooid / afgedankt">Weggegooid / afgedankt</option>
          <option value="Verkocht / overgedragen">Verkocht / overgedragen</option>
          <option value="Anders">Anders</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="document.getElementById('afvoerOverlay').remove()">Annuleren</button>
        <button class="btn" style="background:var(--warning);color:#fff;width:auto;flex:1" onclick="bevestigAfvoer(${idx})">Afvoeren</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function bevestigAfvoer(idx) {
  const art    = _artikelen[idx];
  const reden  = document.getElementById('afvoerReden')?.value || 'Afgevoerd';
  const overlay = document.getElementById('afvoerOverlay');
  if (!art) return;

  const ok = await voerArtikelAf(art.id, reden);
  if (!ok) return;

  _artikelen[idx].afgevoerd = true;
  _artikelen[idx].opmerking = reden;
  if (overlay) overlay.remove();
  renderArtikelen();
  toast(`"${art.omschrijving}" afgevoerd`);
}

// ============================================================
// OPMERKING ATTRIBUTIE
// ============================================================
function voegOpmerkingPrefix(opmerking) {
  if (!opmerking) return '';
  const naam = _klantNaam || 'Klant';
  if (opmerking.startsWith(naam + ': ')) return opmerking;
  return naam + ': ' + opmerking;
}

// ============================================================
// ARTIKEL TOEVOEGEN
// ============================================================
async function voegToe() {
  if (!_userId || !_klantId) { toast('Je bent niet ingelogd', 'error'); return; }

  const omschr = el('fOmschr').value.trim();
  const sn     = el('fSN').value.trim();
  if (!omschr) { toast('Vul een omschrijving in', 'error'); el('fOmschr').focus(); return; }

  if (_artikelen.some(a => a.serienummer.toLowerCase() === sn.toLowerCase())) {
    if (!confirm(`Serienummer "${sn}" staat al in je lijst. Toch toevoegen?`)) return;
  }

  const jaar      = el('fJaar').value.trim();
  const maand     = el('fMaand').value;
  const opmerking = el('fOpmerking').value.trim();

  const art = {
    id:             genId(),
    omschrijving:   omschr,
    merk:           el('fMerk').value.trim(),
    materiaal:      el('fMateriaal').value.trim() || el('fOmschr').dataset.materiaal || '',
    serienummer:    sn,
    fabrJaar:       jaar ? parseInt(jaar) : '',
    fabrMaand:      (jaar && maand) ? maand : '',
    productieDatum: jaar ? (maand ? jaar + '-' + maand : String(jaar)) : '',
    inGebruik:      el('fInGebruik').value,
    gebruiker:      el('fGebruiker').value.trim(),
    opmerking:      voegOpmerkingPrefix(opmerking),
    toegevoegd:     new Date().toISOString(),
    status:         'nieuw',
    keuringId:      null,
    afgevoerd:      false,
  };

  const btn = el('toevoegBtn');
  btn.disabled = true;
  btn.textContent = 'Opslaan...';

  const ok = await slaArtikelOp(art);

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Toevoegen`;

  if (!ok) return;

  _artikelen.unshift(art);

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
  el('fMateriaal').value = '';
  el('fOmschr').dataset.materiaal = '';
  el('fGebruiker').value = gebruiker;
  el('fOmschr').focus();

  renderArtikelen();
  toast('Artikel toegevoegd');
}

// ============================================================
// ARTIKEL BEWERKEN
// Gebruiker altijd bewerkbaar — ook op gekeurde artikelen
// ============================================================
function openEdit(idx) {
  const a = _artikelen[idx];
  if (!a) return;

  el('editIdx').value    = idx;
  el('eOmschr').value    = a.omschrijving || '';
  el('eMerk').value      = a.merk || '';
  el('eMerk').className  = 'form-input';
  el('eMateriaal').value = a.materiaal || '';
  el('eMerkLabel').style.display = 'none';
  el('eSN').value        = a.serienummer || '';
  el('eJaar').value      = a.fabrJaar || '';
  el('eMaand').value     = a.fabrMaand || '';
  el('eInGebruik').value = a.inGebruik || '';
  el('eGebruiker').value = a.gebruiker || '';

  // Opmerking tonen zonder prefix
  const naam = _klantNaam || 'Klant';
  const opmZonderPrefix = (a.opmerking || '').startsWith(naam + ': ')
    ? a.opmerking.slice((naam + ': ').length)
    : (a.opmerking || '');
  el('eOpmerking').value = opmZonderPrefix;

  const gekoppeld = !!a.keuringId;
  const velden = ['eOmschr', 'eMerk', 'eMateriaal', 'eSN', 'eJaar', 'eMaand', 'eInGebruik'];
  velden.forEach(id => {
    const inp = el(id);
    if (inp) inp.disabled = gekoppeld;
  });

  const melding = el('editGekoppeldMelding');
  if (melding) melding.style.display = gekoppeld ? 'block' : 'none';

  el('editModal').classList.add('active');
}

function sluitModal() {
  el('editModal').classList.remove('active');
  ['eOmschr', 'eMerk', 'eMateriaal', 'eSN', 'eJaar', 'eMaand', 'eInGebruik'].forEach(id => {
    const inp = el(id);
    if (inp) inp.disabled = false;
  });
}

async function slaEditOp() {
  const idx    = parseInt(el('editIdx').value);
  const omschr = el('eOmschr').value.trim();
  const sn     = el('eSN').value.trim();

  if (!omschr) { toast('Omschrijving is verplicht', 'error'); return; }

  const jaar      = el('eJaar').value.trim();
  const maand     = el('eMaand').value;
  const a         = _artikelen[idx];
  const gekoppeld = !!a.keuringId;
  const opmerking = el('eOpmerking').value.trim();

  const bijgewerkt = {
    ...a,
    omschrijving:   gekoppeld ? a.omschrijving   : omschr,
    merk:           gekoppeld ? a.merk           : el('eMerk').value.trim(),
    serienummer:    gekoppeld ? a.serienummer    : sn,
    fabrJaar:       gekoppeld ? a.fabrJaar       : (jaar ? parseInt(jaar) : ''),
    fabrMaand:      gekoppeld ? a.fabrMaand      : ((jaar && maand) ? maand : ''),
    productieDatum: gekoppeld ? a.productieDatum : (jaar ? (maand ? jaar + '-' + maand : String(jaar)) : ''),
    inGebruik:      gekoppeld ? a.inGebruik      : el('eInGebruik').value,
    gebruiker:      el('eGebruiker').value.trim(),
    opmerking:      voegOpmerkingPrefix(opmerking),
  };

  const ok = await slaArtikelOp(bijgewerkt);
  if (!ok) return;

  _artikelen[idx] = bijgewerkt;
  sluitModal();
  renderArtikelen();
  toast('Artikel bijgewerkt');
}

// ============================================================
// CERTIFICAAT RENDEREN
// ============================================================
function renderCertificaat() {
  if (_keuringen.length === 0) {
    el('certLeeg').style.display = 'block';
    el('certView').style.display = 'none';
    return;
  }
  el('certLeeg').style.display = 'none';
  el('certView').style.display = 'block';
  toonCertificaat(_keuringen[0]);
  renderHistorie();
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

  const c     = _certData.certificaat;
  const items = _certData.items;

  el('certInfo').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Meest recente keuring</div>
        <div class="cert-nr">${esc(c.nr)}</div>
        <div class="cert-meta">
          ${_klantNaam ? esc(_klantNaam) + ' · ' : ''}Keuringsdatum: ${c.datum ? formatDatum(c.datum) : '—'}<br>
          Keurmeester: ${esc(c.keurmeester || '—')}${c.bedrijf ? ' · ' + esc(c.bedrijf) : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="badge" style="background:rgba(255,255,255,.2);color:#fff">${c.afgerond ? '✓ Afgerond' : 'Concept'}</span>
        <button onclick="downloadCertPDF()" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Overzicht PDF
        </button>
        <button onclick="downloadCertPDFPerGebruiker()" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          PDF per gebruiker
        </button>
      </div>
    </div>`;

  const goed = items.filter(i => i.status === 'goedgekeurd').length;
  const afk  = items.filter(i => i.status === 'afgekeurd').length;

  el('certStats').innerHTML = `
    <div class="stat-box"><div class="stat-nr">${items.length}</div><div class="stat-lbl">Totaal</div></div>
    <div class="stat-box"><div class="stat-nr" style="color:var(--green)">${goed}</div><div class="stat-lbl">Goedgekeurd</div></div>
    <div class="stat-box"><div class="stat-nr" style="color:var(--danger)">${afk}</div><div class="stat-lbl">Afgekeurd</div></div>`;

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
  let items = _certData.items;
  if (_actieveFilter !== 'alle') items = items.filter(i => (i.gebruiker || '') === _actieveFilter);
  renderCertItems(items);
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
                ${i.fabr_jaar ? ' · Prod: ' + i.fabr_jaar + (i.fabr_maand ? '-' + String(i.fabr_maand).padStart(2,'0') : '') : ''}
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
// PDF GENERATIE — MATERIAALOVERZICHT
//
// Dit is nadrukkelijk GEEN officieel certificaat.
// - Geen handtekening van de keurmeester
// - Geen juridische status
// - Wél: keuringsstatus, vervaldatum, opmerkingen
// - Duidelijk gelabeld als "Materiaaloverzicht"
// - Verwijzing naar het officiële certificaatnummer
//
// Het officiële certificaat wordt door de keurmeester
// verstuurd per e-mail vanuit KlimKeur Pro.
// ============================================================
function _bouwPDF(items, ondertitel) {
  const { jsPDF } = window.jspdf;
  const c          = _certData.certificaat;
  const vandaag    = new Date().toLocaleDateString('nl-NL');
  const doc        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW      = doc.internal.pageSize.getWidth();
  const pageH      = doc.internal.pageSize.getHeight();
  const margin     = 14;
  const contentW   = pageW - margin * 2;
  const groen      = [91, 154, 47];
  const donker     = [30, 30, 30];
  const grijs      = [100, 100, 100];
  const lichtgrijs = [220, 220, 220];
  const oranje     = [200, 100, 0];
  const rood       = [192, 57, 43];
  let y            = margin;

  // ---- HEADER ----
  doc.setFillColor(...groen);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('MATERIAALOVERZICHT', margin, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(c.bedrijf || '', pageW - margin, 14, { align: 'right' });

  y = 30;

  // ---- INFO BLOK ----
  const infoRijen = [
    ['Eigenaar:',       _klantNaam || '—'],
    ['Keuringsdatum:',  c.datum ? formatDatum(c.datum) : '—'],
    ['Keurmeester:',    c.keurmeester || '—'],
    ['Op certificaat:', c.nr || '—'],
    ['Gegenereerd op:', vandaag],
  ];
  if (ondertitel) infoRijen.push(['Gebruiker:', ondertitel]);

  doc.setFontSize(9);
  doc.setTextColor(...donker);
  infoRijen.forEach(([label, waarde]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(waarde, margin + 38, y);
    y += 5.5;
  });

  y += 2;
  doc.setDrawColor(...groen);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // ---- DISCLAIMER ----
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...grijs);
  const disclaimer = 'Dit is een persoonlijk materiaaloverzicht, geen officieel keuringscertificaat. ' +
    'Het officiële certificaat is per e-mail verstuurd door uw keurmeester.';
  const discLines = doc.splitTextToSize(disclaimer, contentW);
  doc.text(discLines, margin, y);
  y += discLines.length * 3.2 + 5;

  // ---- TABEL HEADER ----
  const rowH   = 6.5;
  const colW   = {
    nr:        8,
    omschr:    55,
    sn:        30,
    status:    22,
    keuring:   35,
    opmerking: 0, // vult de rest
  };
  // Bereken opmerking breedte
  colW.opmerking = contentW - colW.nr - colW.omschr - colW.sn - colW.status - colW.keuring;

  doc.setFillColor(...groen);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);

  let x = margin + 2;
  doc.text('#',            x, y + 4.5); x += colW.nr;
  doc.text('Omschrijving', x, y + 4.5); x += colW.omschr;
  doc.text('Serienummer',  x, y + 4.5); x += colW.sn;
  doc.text('Status',       x, y + 4.5); x += colW.status;
  doc.text('Volgende keuring', x, y + 4.5); x += colW.keuring;
  doc.text('Opmerking',    x, y + 4.5);
  y += rowH;

  // ---- TABEL RIJEN ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  items.forEach((item, i) => {
    if (y + rowH > pageH - 14) {
      doc.addPage();
      y = margin;
    }

    if (i % 2 === 0) {
      doc.setFillColor(245, 248, 242);
      doc.rect(margin, y, contentW, rowH, 'F');
    }

    // Bereken keuringsstatus voor dit item
    const keuringDatum = item.keuring_datum || null;
    const inGebruik    = item.in_gebruik || null;
    const ks           = keuringStatus(inGebruik, keuringDatum);
    const kt           = keuringTekst(ks, inGebruik, keuringDatum);

    const statusTekst = item.status === 'goedgekeurd' ? 'Goedgekeurd'
      : item.status === 'afgekeurd' ? 'Afgekeurd'
      : '—';

    doc.setTextColor(...donker);
    x = margin + 2;

    // #
    doc.text(String(i + 1), x, y + 4.5); x += colW.nr;

    // Omschrijving + merk klein eronder
    doc.setFont('helvetica', 'bold');
    doc.text((item.omschrijving || '').substring(0, 28), x, y + 4.5);
    doc.setFont('helvetica', 'normal');
    x += colW.omschr;

    // Serienummer
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.text((item.serienummer || '—').substring(0, 18), x, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    x += colW.sn;

    // Status — kleur op basis van status
    if (item.status === 'goedgekeurd')    doc.setTextColor(...groen);
    else if (item.status === 'afgekeurd') doc.setTextColor(...rood);
    else                                  doc.setTextColor(...grijs);
    doc.text(statusTekst, x, y + 4.5);
    doc.setTextColor(...donker);
    x += colW.status;

    // Volgende keuring — kleur op basis van urgentie
    if (kt) {
      if (ks === 'overdue')    doc.setTextColor(...rood);
      else if (ks === 'soon')  doc.setTextColor(...oranje);
      else                     doc.setTextColor(...groen);
      doc.setFontSize(6.5);
      doc.text(kt.substring(0, 22), x, y + 4.5);
      doc.setTextColor(...donker);
      doc.setFontSize(7.5);
    } else {
      doc.setTextColor(...grijs);
      doc.text('—', x, y + 4.5);
      doc.setTextColor(...donker);
    }
    x += colW.keuring;

    // Opmerking
    if (item.opmerking) {
      doc.setFontSize(6.5);
      doc.setTextColor(...oranje);
      doc.text((item.opmerking || '').substring(0, 30), x, y + 4.5);
      doc.setTextColor(...donker);
      doc.setFontSize(7.5);
    }

    doc.setDrawColor(...lichtgrijs);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);
    y += rowH;
  });

  // ---- SAMENVATTING ----
  y += 4;
  const goed = items.filter(i => i.status === 'goedgekeurd').length;
  const afk  = items.filter(i => i.status === 'afgekeurd').length;
  const nodig = items.filter(i => {
    const ks = keuringStatus(i.in_gebruik || null, i.keuring_datum || null);
    return ks === 'overdue';
  }).length;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...donker);
  doc.text(`${items.length} artikelen`, margin, y);
  doc.setTextColor(...groen);
  doc.text(`${goed} goedgekeurd`, margin + 30, y);
  doc.setTextColor(...rood);
  doc.text(`${afk} afgekeurd`, margin + 65, y);
  if (nodig > 0) {
    doc.setTextColor(...oranje);
    doc.text(`${nodig} keuring nodig`, margin + 95, y);
  }

  // ---- FOOTER op alle pagina's ----
  const totaalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totaalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grijs);
    doc.text(
      `${_klantNaam || ''} · Materiaaloverzicht · Gegenereerd ${vandaag} · Pagina ${p}/${totaalPaginas}`,
      pageW / 2, pageH - 6, { align: 'center' }
    );
    doc.setDrawColor(...groen);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - 9, pageW - margin, pageH - 9);
  }

  return doc;
}

// ============================================================
// PDF DOWNLOAD — respecteert actief gebruikersfilter
// ============================================================
function downloadCertPDF() {
  if (!_certData) { toast('Geen overzicht beschikbaar', 'error'); return; }
  if (typeof window.jspdf === 'undefined') { toast('PDF-bibliotheek nog niet geladen', 'error'); return; }
  const items = _certData.items;
  const doc = _bouwPDF(items, null);
  const c   = _certData.certificaat;
  const safeNaam = (_klantNaam || 'overzicht').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Materiaaloverzicht_${safeNaam}_${c.datum || ''}.pdf`);
  toast('Overzicht gedownload');
}

// ============================================================
// PDF PER GEBRUIKER
// ============================================================
function downloadCertPDFPerGebruiker() {
  if (!_certData) { toast('Geen overzicht beschikbaar', 'error'); return; }
  if (typeof window.jspdf === 'undefined') { toast('PDF-bibliotheek nog niet geladen', 'error'); return; }

  // Filter actief → alleen die gebruiker
  if (_actieveFilter !== 'alle') {
    downloadCertPDF();
    return;
  }

  const groepen = {};
  _certData.items.forEach(i => {
    const g = i.gebruiker || 'Algemeen';
    if (!groepen[g]) groepen[g] = [];
    groepen[g].push(i);
  });

  const gebruikers = Object.keys(groepen);
  if (gebruikers.length <= 1) { downloadCertPDF(); return; }

  const safeNaam = (_klantNaam || 'overzicht').replace(/[^a-zA-Z0-9]/g, '_');
  const c        = _certData.certificaat;

  gebruikers.forEach(gebruiker => {
    const doc  = _bouwPDF(groepen[gebruiker], gebruiker);
    const safeG = gebruiker.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Materiaaloverzicht_${safeNaam}_${safeG}_${c.datum || ''}.pdf`);
  });
  toast(`${gebruikers.length} overzichten gedownload`);
}

// ============================================================
// HISTORIE RENDEREN
// ============================================================
function renderHistorie() {
  const ouder = _keuringen.slice(1);
  const histView = el('historieView');
  if (!histView) return;

  if (ouder.length === 0) {
    histView.style.display = 'none';
    return;
  }

  histView.style.display = 'block';
  el('histZoek').value = '';
  renderHistorieLijst(ouder);
}

function filterHist() {
  const q = (el('histZoek').value || '').toLowerCase().trim();
  renderHistorieLijst(_keuringen.slice(1), q);
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
window.addEventListener('offline', () => { el('offlineBar').classList.add('show'); });
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
