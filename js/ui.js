'use strict';

// ============================================================
// ui.js — Klantapp UI: gebruiker-keuze, artikelkaartjes,
//         klikbare statistieken, historie-modal, PDF
//
// Geen tabs meer — alles in één overzicht.
// ============================================================

// ── STAAT ────────────────────────────────────────────────────
let _certData          = null;   // voor PDF-generatie
let _actieveGebruiker  = null;   // null = alles, string = gekozen naam
let _statFilter        = 'alle'; // 'alle' | 'goedgekeurd' | 'keuring'
let _artSort           = { col: 'omschrijving', asc: true };
let _toonAfgevoerd     = false;
let _artZoek           = '';
let _historieArtikelId = null;   // itemId van het artikel in historie-modal
let _actieveFilter     = 'alle'; // legacy — gebruikt door PDF per gebruiker

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
// GEBRUIKER SELECTIE
//
// Na inloggen toont de app "Wie ben je?" met alle namen die
// op artikelen staan. Keuze wordt onthouden per apparaat.
// Vergelijking is case-insensitive, weergave is de mooiste versie.
// ============================================================
function _gebruikerKey() {
  return 'klimkeur_klant_gebruiker_' + (_bedrijfId || 'default');
}

function getUniekeGebruikers() {
  const tellingen = {};  // lowerName → { naam: 'Mooiste Versie', count: 0 }
  _artikelen.forEach(a => {
    if (!a.gebruiker) return;
    const lower = a.gebruiker.toLowerCase().trim();
    if (!lower) return;
    if (!tellingen[lower]) {
      tellingen[lower] = { naam: a.gebruiker.trim(), count: 0 };
    }
    tellingen[lower].count++;
    // Houd de versie met hoofdletters (meer specifiek) als "mooiste"
    const huidige = tellingen[lower].naam;
    if (a.gebruiker.trim() !== a.gebruiker.trim().toLowerCase() &&
        huidige === huidige.toLowerCase()) {
      tellingen[lower].naam = a.gebruiker.trim();
    }
  });
  return Object.values(tellingen)
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    .map(t => t.naam);
}

function gebruikerMatch(artikelGebruiker, filterNaam) {
  if (!filterNaam) return true;  // geen filter = alles tonen
  if (!artikelGebruiker) return false;
  return artikelGebruiker.toLowerCase().trim() === filterNaam.toLowerCase().trim();
}

function toonGebruikerKeuze() {
  const gebruikers = getUniekeGebruikers();
  const lijst = el('gebruikerLijst');
  const bedrijfLabel = el('gebruikerBedrijfNaam');
  if (bedrijfLabel) bedrijfLabel.textContent = _klantNaam || 'Mijn Materiaal';

  if (gebruikers.length === 0) {
    // Geen gebruikers → sla keuze over
    kiesGebruiker(null);
    return;
  }

  lijst.innerHTML =
    `<button onclick="kiesGebruiker(null)" style="padding:12px 16px;border:1.5px solid var(--green);border-radius:var(--r);background:rgba(91,154,47,0.08);color:var(--green);font-size:15px;font-weight:500;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Alles bekijken
    </button>` +
    gebruikers.map(naam =>
      `<button onclick="kiesGebruiker('${naam.replace(/'/g, "\\'")}')" style="padding:12px 16px;border:1.5px solid var(--border);border-radius:var(--r);background:var(--bg-card,#fff);color:var(--text);font-size:15px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${esc(naam)}
      </button>`
    ).join('');

  el('gebruikerOverlay').style.display = 'flex';
}

function kiesGebruiker(naam) {
  _actieveGebruiker = naam;
  try { localStorage.setItem(_gebruikerKey(), naam || ''); } catch(e) {}

  el('gebruikerOverlay').style.display = 'none';

  // Update knop in header
  const btn = el('gebruikerSwitchBtn');
  const naamSpan = el('gebruikerNaamBtn');
  if (btn) btn.style.cssText = 'display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:5px 12px;border-radius:20px;cursor:pointer;font-size:13px;';
  if (naamSpan) naamSpan.textContent = naam || 'Iedereen';

  // Auto-fill gebruiker bij toevoegen
  const fGebruiker = el('fGebruiker');
  if (fGebruiker && naam) fGebruiker.value = naam;

  renderArtikelen();
}

function laadOpgeslagenGebruiker() {
  try {
    const opgeslagen = localStorage.getItem(_gebruikerKey());
    if (opgeslagen !== null && opgeslagen !== '') {
      // Controleer of deze gebruiker nog bestaat in de huidige data
      const gebruikers = getUniekeGebruikers();
      const match = gebruikers.find(g => g.toLowerCase().trim() === opgeslagen.toLowerCase().trim());
      if (match) {
        kiesGebruiker(match);
        return;
      }
    }
    if (opgeslagen === '') {
      // Expliciet "Alles bekijken" gekozen
      kiesGebruiker(null);
      return;
    }
  } catch(e) {}
  // Geen opgeslagen keuze → toon keuzescherm
  toonGebruikerKeuze();
}

// ============================================================
// STATISTIEK FILTER — klikbare blokjes
// ============================================================
function setStatFilter(filter) {
  _statFilter = filter;
  // Highlicht actief blokje
  ['statBoxTotaal', 'statBoxGoed', 'statBoxKeuring'].forEach(id => {
    const box = el(id);
    if (box) box.style.outline = 'none';
  });
  const activeId = filter === 'goedgekeurd' ? 'statBoxGoed'
                 : filter === 'keuring'     ? 'statBoxKeuring'
                 : 'statBoxTotaal';
  const activeBox = el(activeId);
  if (activeBox) activeBox.style.outline = '2px solid var(--green)';

  renderArtikelen();
}

// ============================================================
// ARTIKEL DEDUPLICATIE
//
// _artikelen bevat alle keuring_items rijen — dus hetzelfde
// fysieke artikel kan meerdere keren voorkomen (eenmaal per keuring).
// We groeperen op itemId en tonen alleen de meest recente versie.
// Items zonder keuringId (door klant toegevoegd) tellen als apart.
// ============================================================
function getUniekeArtikelenLijst() {
  const groepen = {};

  // Groepeer alle rijen op itemId (persistent artikel-ID)
  _artikelen.forEach(a => {
    const key = a.itemId || a.id;
    if (!groepen[key]) groepen[key] = [];
    groepen[key].push(a);
  });

  // Voor elke groep: bepaal effectieve status en keuringsdatum
  return Object.values(groepen).map(rijen => {
    // Sorteer op datum (nieuwste eerst)
    const gesorteerd = [...rijen].sort((a, b) => {
      const da = a.keuringId ? (_keuringen.find(k => k.id === a.keuringId)?.datum || '') : (a.toegevoegd || '');
      const db = b.keuringId ? (_keuringen.find(k => k.id === b.keuringId)?.datum || '') : (b.toegevoegd || '');
      return (db || '').localeCompare(da || '');
    });

    const basis = gesorteerd[0];

    // Laatste echte beoordeling — 'nieuw' telt niet als beoordeling
    const laatsteBeoordeling = gesorteerd.find(r =>
      r.status === 'goedgekeurd' || r.status === 'afgekeurd'
    );

    // Laatste goedkeuring — bepaalt de 12-maanden teller
    const laatsteGoedkeuring = gesorteerd.find(r => r.status === 'goedgekeurd');

    // Bepaal effectieve status
    let effectieveStatus = '';
    if (laatsteBeoordeling) {
      effectieveStatus = laatsteBeoordeling.status;
    } else if (basis.inGebruik) {
      // Nog nooit gekeurd, maar wel ingebruikname datum
      const maanden = (Date.now() - new Date(basis.inGebruik + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      if (maanden < 12) effectieveStatus = 'nieuw';
    }

    // Bepaal effectieve keuringsdatum (voor de 12-mnd teller)
    let effectieveKeuringDatum = null;
    if (laatsteGoedkeuring && laatsteGoedkeuring.keuringId) {
      effectieveKeuringDatum = _keuringen.find(k => k.id === laatsteGoedkeuring.keuringId)?.datum || null;
    }

    return {
      ...basis,
      _effectieveStatus:       effectieveStatus,
      _effectieveKeuringDatum: effectieveKeuringDatum,
    };
  });
}

// ============================================================
// ARTIKELEN RENDEREN — kaartjes voor mobiel
// ============================================================

// Vindt de index in _artikelen van de representatieve rij voor een itemId.
// _artikelen bevat meerdere rijen per uniek artikel (één per keuring).
// Voor bewerken/afvoeren hebben we de MEEST RECENTE rij nodig — dat is
// dezelfde rij die getUniekeArtikelenLijst() als basis pakt.
function _vindArtikelIndexOpItemId(itemId) {
  if (!itemId) return -1;
  let besteIdx = -1;
  let besteDatum = '';
  for (let i = 0; i < _artikelen.length; i++) {
    const a = _artikelen[i];
    const key = a.itemId || a.id;
    if (key !== itemId) continue;
    const datum = a.keuringId
      ? (_keuringen.find(k => k.id === a.keuringId)?.datum || '')
      : (a.toegevoegd || '');
    if (datum >= besteDatum) {
      besteDatum = datum;
      besteIdx = i;
    }
  }
  return besteIdx;
}

// Eén delegated click-listener op #artLijst. Elke kaart en elke actieknop
// draagt een data-action attribuut; closest() kiest het specifiekste.
// Zo is er geen stopPropagation-dans meer nodig en kan de DOM vrij
// vervangen worden door innerHTML zonder listeners te verliezen.
function _artLijstClickHandler(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const itemId = target.dataset.itemId;
  if (!itemId) return;

  if (action === 'historie')      openHistorie(itemId);
  else if (action === 'edit')     openEdit(itemId);
  else if (action === 'afvoer')   openAfvoerDialog(itemId);
}

// Registreer de listener één keer, zodra #artLijst bestaat.
(function _initArtLijstDelegation() {
  const bind = () => {
    const lijst = document.getElementById('artLijst');
    if (lijst && !lijst.dataset.delegationBound) {
      lijst.addEventListener('click', _artLijstClickHandler);
      lijst.dataset.delegationBound = '1';
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

function zoekArtikelen(waarde) {
  _artZoek = waarde.toLowerCase().trim();
  renderArtikelen();
}

function toggleAfgevoerd() {
  _toonAfgevoerd = !_toonAfgevoerd;
  renderArtikelen();
}

function renderArtikelen() {
  const alleUniek = getUniekeArtikelenLijst();
  const actief    = alleUniek.filter(a => !a.afgevoerd);
  const afgevoerd = alleUniek.filter(a => a.afgevoerd);

  // ── Gebruikersfilter toepassen ────────────────────────────
  const gefilterdOpGebruiker = _actieveGebruiker
    ? actief.filter(a => gebruikerMatch(a.gebruiker, _actieveGebruiker))
    : actief;

  // ── Statistieken berekenen (na gebruikersfilter) ──────────
  const totaal = gefilterdOpGebruiker.length;
  const goed   = gefilterdOpGebruiker.filter(a => a._effectieveStatus === 'goedgekeurd').length;
  const nodig  = gefilterdOpGebruiker.filter(a => {
    if (a._effectieveStatus === 'afgekeurd') return false;
    const ks = keuringStatus(a.inGebruik, a._effectieveKeuringDatum);
    return ks === 'overdue' || ks === 'soon';
  }).length;

  el('statTotaal').textContent  = totaal;
  el('statGoed').textContent    = goed;
  el('statKeuring').textContent = nodig;

  // ── Stat-filter toepassen ─────────────────────────────────
  let teTonenLijst = _toonAfgevoerd ? afgevoerd : gefilterdOpGebruiker;

 if (_statFilter === 'goedgekeurd') {
    teTonenLijst = teTonenLijst.filter(a => a._effectieveStatus === 'goedgekeurd');
  } else if (_statFilter === 'keuring') {
    teTonenLijst = teTonenLijst.filter(a => {
      if (a._effectieveStatus === 'afgekeurd') return false;
      const ks = keuringStatus(a.inGebruik, a._effectieveKeuringDatum);
      return ks === 'overdue' || ks === 'soon';
    });
  }

  // ── Zoekfilter ────────────────────────────────────────────
  if (_artZoek) {
    teTonenLijst = teTonenLijst.filter(a =>
      [a.omschrijving, a.merk, a.materiaal, a.serienummer, a.gebruiker].some(v =>
        (v || '').toLowerCase().includes(_artZoek)
      )
    );
  }

  // ── Sorteer ───────────────────────────────────────────────
  const gesorteerd = [...teTonenLijst].sort((a, b) => {
    const va = String(a[_artSort.col] || '').toLowerCase();
    const vb = String(b[_artSort.col] || '').toLowerCase();
    return _artSort.asc ? va.localeCompare(vb, 'nl') : vb.localeCompare(va, 'nl');
  });

  const lijst = el('artLijst');

  if (totaal === 0 && afgevoerd.length === 0) {
    lijst.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
      <h3>Nog geen artikelen</h3>
      <p>Voeg je eerste artikel toe via de knop hieronder.</p>
    </div>`;
    _updateAfgevoerdToggle(afgevoerd.length);
    return;
  }

  if (gesorteerd.length === 0) {
    const hint = _artZoek ? `Geen resultaten voor "${esc(_artZoek)}"` :
                 _statFilter === 'keuring' ? 'Geen artikelen die keuring nodig hebben' :
                 _statFilter === 'goedgekeurd' ? 'Geen goedgekeurde artikelen' :
                 'Geen artikelen';
    lijst.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-muted)">
      <div style="font-size:14px">${hint}</div>
      ${_statFilter !== 'alle' ? '<div style="margin-top:8px"><button onclick="setStatFilter(\'alle\')" style="background:none;border:none;color:var(--green);cursor:pointer;text-decoration:underline;font-size:13px">Toon alle artikelen</button></div>' : ''}
    </div>`;
    _updateAfgevoerdToggle(afgevoerd.length);
    return;
  }

  // ── Kaartjes renderen ─────────────────────────────────────
  // Identity via itemId, NIET via array-index. _artikelen bevat meerdere
  // rijen per uniek artikel (één per keuring); indexOf op een object uit
  // getUniekeArtikelenLijst() geeft altijd -1 omdat dat een nieuw object
  // is (spread-copy). Acties worden via event-delegation op #artLijst
  // afgehandeld — zie _artLijstClickHandler.
  lijst.innerHTML = gesorteerd.map(art => {
    const itemId = art.itemId || art.id || '';
    const kd  = art._effectieveKeuringDatum;
    const ks  = art._effectieveStatus === 'afgekeurd' ? null : keuringStatus(art.inGebruik, kd);
    const kt  = ks ? keuringTekst(ks, art.inGebruik, kd) : null;

    // Status badge — op basis van effectieve status
    let statusHtml = '';
    if (art._effectieveStatus === 'goedgekeurd') {
      statusHtml = '<span style="background:#EAF3DE;color:#3B6D11;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500;white-space:nowrap">Goed</span>';
    } else if (art._effectieveStatus === 'afgekeurd') {
      statusHtml = '<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500;white-space:nowrap">Afgekeurd</span>';
    } else if (art._effectieveStatus === 'nieuw') {
      statusHtml = '<span style="background:#E6F1FB;color:#185FA5;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500;white-space:nowrap">Nieuw</span>';
    }

    // Keuring regel
    let keuringHtml = '';
    if (kt) {
      const kleur = ks === 'overdue' ? 'var(--danger,#c0392b)' :
                    ks === 'soon'    ? 'var(--warning,#e67e22)' :
                    'var(--green,#5B9A2F)';
      keuringHtml = `<div style="font-size:12px;color:${kleur};margin-top:4px">${kt}</div>`;
    }

    // Opmerking
    const opmHtml = art.opmerking
      ? `<div style="font-size:11px;color:var(--warning,#e67e22);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚠ ${esc(art.opmerking)}</div>`
      : '';

    // Detail regel
    const details = [
      art.merk || '',
      art.serienummer ? 'SN: ' + art.serienummer : '',
    ].filter(Boolean).join(' · ');

    // Gebruiker (alleen tonen in "alles bekijken" modus)
    const gebruikerHtml = !_actieveGebruiker && art.gebruiker
      ? `<div style="font-size:11px;color:var(--text-muted,#999);margin-top:2px">👤 ${esc(art.gebruiker)}</div>`
      : '';

    const opacity = art.afgevoerd ? 'opacity:0.5;' : '';

    // Card + knoppen zijn puur declaratief: data-action + data-item-id.
    // De enige click-listener zit op #artLijst (event-delegation) en
    // routeert op basis van closest('[data-action]'). Knopklikken hoeven
    // dus niet stopPropagation te doen — delegatie kiest het specifiekste
    // data-action element, niet de card eromheen.
    const itemIdAttr = esc(itemId);
    return `<div class="art-card" data-action="historie" data-item-id="${itemIdAttr}"
      style="background:var(--bg-card,#fff);border:1px solid var(--border,#e0e0e0);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;${opacity}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500;color:var(--text,#333)">${esc(art.omschrijving)}</div>
          ${details ? `<div style="font-size:12px;color:var(--text-secondary,#666);margin-top:2px">${esc(details)}</div>` : ''}
          ${gebruikerHtml}
        </div>
        <div style="flex-shrink:0">${statusHtml}</div>
      </div>
      ${keuringHtml}
      ${opmHtml}
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
        ${art.afgevoerd
          ? '<span style="font-size:11px;color:var(--text-muted);font-style:italic">Afgevoerd</span>'
          : `<button type="button" data-action="edit" data-item-id="${itemIdAttr}" style="background:none;border:1px solid var(--border,#ddd);padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-secondary,#666)">Bewerken</button>
             <button type="button" data-action="afvoer" data-item-id="${itemIdAttr}" style="background:rgba(243,156,18,0.1);border:1px solid var(--warning,#e67e22);padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--warning,#e67e22)">Afvoeren</button>`
        }
      </div>
    </div>`;
  }).join('');

  _updateAfgevoerdToggle(afgevoerd.length);

  // Highlight actief stat-blokje
  // (NIET setStatFilter aanroepen — dat veroorzaakt een lus)
  ['statBoxTotaal', 'statBoxGoed', 'statBoxKeuring'].forEach(id => {
    const box = el(id);
    if (box) box.style.outline = 'none';
  });
  const _activeId = _statFilter === 'goedgekeurd' ? 'statBoxGoed'
                  : _statFilter === 'keuring'     ? 'statBoxKeuring'
                  : 'statBoxTotaal';
  const _activeBox = el(_activeId);
  if (_activeBox) _activeBox.style.outline = '2px solid var(--green)';
}

function _keuringDatumVoorArtikel(art) {
  if (!art.keuringId) return null;
  const keuring = _keuringen.find(k => k.id === art.keuringId);
  return keuring?.datum || null;
}

function _updateAfgevoerdToggle(aantalAfgevoerd) {
  const toggle = el('afgevoerdToggle');
  const btn    = el('afgevoerdBtn');
  if (!toggle || !btn) return;
  if (aantalAfgevoerd > 0) {
    toggle.style.display = 'block';
    btn.textContent = _toonAfgevoerd
      ? '← Terug naar actieve artikelen'
      : `Toon ${aantalAfgevoerd} afgevoerd artikel${aantalAfgevoerd !== 1 ? 'en' : ''}`;
  } else {
    toggle.style.display = 'none';
  }
}

// ============================================================
// TOEVOEG MODAL
// ============================================================
function toggleToevoegForm() {
  el('toevoegModal').classList.add('active');
  // Auto-fill gebruiker als er een actieve gebruiker is
  const fGebruiker = el('fGebruiker');
  if (fGebruiker && _actieveGebruiker && !fGebruiker.value) {
    fGebruiker.value = _actieveGebruiker;
  }
  setTimeout(() => el('fOmschr')?.focus(), 100);
}

function sluitToevoegModal() {
  el('toevoegModal').classList.remove('active');
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

  const uniek = getUniekeArtikelenLijst();
  if (sn && uniek.some(a => a.serienummer && a.serienummer.toLowerCase() === sn.toLowerCase())) {
    if (!confirm(`Serienummer "${sn}" staat al in je lijst. Toch toevoegen?`)) return;
  }

  const jaar      = el('fJaar').value.trim();
  const maand     = el('fMaand').value;
  const opmerking = el('fOpmerking').value.trim();

  const art = {
    id:             genId(),
    itemId:         genId(),  // ── ARTIKEL_ID FIX ── persistent artikel-ID
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
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Toevoegen`;

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

  sluitToevoegModal();
  renderArtikelen();
  toast('Artikel toegevoegd');
}

// ============================================================
// ARTIKEL BEWERKEN
// ============================================================
function openEdit(itemId) {
  const idx = _vindArtikelIndexOpItemId(itemId);
  const a = _artikelen[idx];
  if (!a) return;

  // We bewaren itemId — NIET de array-index — in het formulier. Zo blijft
  // de referentie stabiel als _artikelen tussendoor muteert (nieuwe rij
  // via keuring, afvoer, herlaad vanuit DB).
  el('editItemId').value = itemId;
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

  const naam = _klantNaam || 'Klant';
  const opmZonderPrefix = (a.opmerking || '').startsWith(naam + ': ')
    ? a.opmerking.slice((naam + ': ').length)
    : (a.opmerking || '');
  el('eOpmerking').value = opmZonderPrefix;

  const gekoppeld = !!a.keuringId;
  ['eOmschr', 'eMerk', 'eMateriaal', 'eSN', 'eJaar', 'eMaand', 'eInGebruik'].forEach(id => {
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
  const itemId = el('editItemId').value;
  const idx    = _vindArtikelIndexOpItemId(itemId);
  const omschr = el('eOmschr').value.trim();
  const sn     = el('eSN').value.trim();
  if (!omschr) { toast('Omschrijving is verplicht', 'error'); return; }

  const a = _artikelen[idx];
  if (!a) { toast('Artikel niet gevonden', 'error'); return; }

  const jaar      = el('eJaar').value.trim();
  const maand     = el('eMaand').value;
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
// AFVOER DIALOG
// ============================================================
function openAfvoerDialog(itemId) {
  const idx = _vindArtikelIndexOpItemId(itemId);
  const art = _artikelen[idx];
  if (!art) return;

  const overlay = document.createElement('div');
  overlay.id = 'afvoerOverlay';
  overlay.className = 'modal-overlay active';
  // itemId is veilig als attribuut (UUID-achtig); toch escapen we het voor
  // de inline onclick om geen enkele ruimte te laten voor quote-injectie.
  const itemIdJs = itemId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
        <button class="btn" style="background:var(--warning);color:#fff;width:auto;flex:1" onclick="bevestigAfvoer('${itemIdJs}')">Afvoeren</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function bevestigAfvoer(itemId) {
  const idx    = _vindArtikelIndexOpItemId(itemId);
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
// HISTORIE MODAL — keuringsgeschiedenis per artikel
// ============================================================
async function openHistorie(artikelId) {
  if (!artikelId) return;
  _historieArtikelId = artikelId;

  const modal  = el('historieModal');
  const inhoud = el('historieInhoud');
  const titel  = el('historieTitel');
  const opmVeld = el('historieOpmerking');

  // Zoek het artikel voor de titel
  const art = _artikelen.find(a => a.itemId === artikelId);
  if (titel) titel.textContent = art ? art.omschrijving : 'Keuringshistorie';

  // Huidige opmerking invullen (zonder prefix)
  if (opmVeld && art) {
    const naam = _klantNaam || 'Klant';
    const opmZonder = (art.opmerking || '').startsWith(naam + ': ')
      ? art.opmerking.slice((naam + ': ').length)
      : (art.opmerking || '');
    opmVeld.value = opmZonder;
  }

  modal.classList.add('active');
  inhoud.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Historie laden...</div>';

  // Laad historie uit database
  const historie = await laadArtikelHistorie(artikelId);

  if (historie.length === 0) {
    inhoud.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted)">
      <div style="font-size:14px">Nog geen keuringshistorie</div>
      <div style="font-size:12px;margin-top:4px">Dit artikel is nog niet gekeurd.</div>
    </div>`;
    return;
  }

  inhoud.innerHTML = historie.map((r, idx) => {
    let statusHtml = '';
    if (r.status === 'goedgekeurd') {
      statusHtml = '<span style="background:#EAF3DE;color:#3B6D11;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500">Goedgekeurd</span>';
    } else if (r.status === 'afgekeurd') {
      statusHtml = `<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500">Afgekeurd${r.afkeurcode ? ' — ' + esc(r.afkeurcode) : ''}</span>`;
    } else {
      statusHtml = '<span style="background:#FAEEDA;color:#854F0B;font-size:11px;padding:3px 8px;border-radius:12px;font-weight:500">Onbeoordeeld</span>';
    }

    const laatsteBadge = idx === 0
      ? '<span style="background:var(--green,#5B9A2F);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-right:6px">Laatste</span>'
      : '';

    return `<div style="background:var(--bg-card,#f8f8f8);border:1px solid var(--border,#e0e0e0);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="display:flex;align-items:center">
          ${laatsteBadge}
          <strong style="font-size:13px">${formatDatum(r.datum)}</strong>
          <span style="font-size:12px;color:var(--text-muted,#999);margin-left:8px">${esc(r.certificaatNr)}</span>
        </div>
        ${statusHtml}
      </div>
      <div style="font-size:12px;color:var(--text-secondary,#666)">
        Keurmeester: ${esc(r.keurmeester)}${r.gebruiker ? ' · Gebruiker: ' + esc(r.gebruiker) : ''}
      </div>
      ${r.opmerking ? `<div style="font-size:12px;color:var(--warning,#e67e22);margin-top:4px">⚠ ${esc(r.opmerking)}</div>` : ''}
    </div>`;
  }).join('');
}

function sluitHistorieModal() {
  el('historieModal').classList.remove('active');
  _historieArtikelId = null;
}

async function slaHistorieOpmerkingOp() {
  if (!_historieArtikelId) return;
  const opmerking = el('historieOpmerking')?.value?.trim() || '';

  if (opmerking.length > 200) {
    toast('Opmerking mag maximaal 200 tekens zijn', 'error');
    return;
  }

  const volledig = voegOpmerkingPrefix(opmerking);
  const ok = await slaOpmerkingOp(_historieArtikelId, volledig);
  if (!ok) return;

  // Update lokaal
  const art = _artikelen.find(a => a.itemId === _historieArtikelId);
  if (art) art.opmerking = volledig;

  toast('Opmerking opgeslagen');
  renderArtikelen();
}

// ============================================================
// CERTIFICAAT DATA BOUWEN — voor PDF generatie
// Wordt aangeroepen vanuit laadKeuringen() via renderCertificaat()
// ============================================================
function renderCertificaat() {
  bouwCertData();
}

function renderHistorie() {
  // Niet meer nodig — historie zit nu in de artikel-modal
}

function bouwCertData() {
  if (_keuringen.length === 0) {
    _certData = null;
    return;
  }
  const k = _keuringen[0];
  _certData = {
    certificaat: {
      nr:          k.certificaat_nr || '—',
      datum:       k.datum || '',
      keurmeester: k.keurmeester || '',
      bedrijf:     k.bedrijf_keurmeester || '',
      afgerond:    k.afgerond || false,
    },
    items: k._items || [],
  };
}

// ============================================================
// TABS — stub voor backwards compatibility
// switchTab werd aangeroepen in de oude index.html
// ============================================================
function switchTab() { /* niet meer nodig */ }

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
    omschr:    40,
    merk:      22,
    materiaal: 20,
    sn:        28,
    status:    20,
    keuring:   25,
    opmerking: 0,
  };
  colW.opmerking = contentW - colW.nr - colW.omschr - colW.merk - colW.materiaal - colW.sn - colW.status - colW.keuring;

  doc.setFillColor(...groen);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);

  let x = margin + 2;
  doc.text('#',               x, y + 4.5); x += colW.nr;
  doc.text('Omschrijving',    x, y + 4.5); x += colW.omschr;
  doc.text('Merk',            x, y + 4.5); x += colW.merk;
  doc.text('Materiaal',       x, y + 4.5); x += colW.materiaal;
  doc.text('Serienummer',     x, y + 4.5); x += colW.sn;
  doc.text('Status',          x, y + 4.5); x += colW.status;
  doc.text('Volgende keuring', x, y + 4.5); x += colW.keuring;
  doc.text('Opmerking',       x, y + 4.5);
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

    const keuringDatum = item.keuring_datum || null;
    const inGebruik    = item.in_gebruik || null;
    const ks           = keuringStatus(inGebruik, keuringDatum);
    const kt           = keuringTekst(ks, inGebruik, keuringDatum);

    const statusTekst = item.status === 'goedgekeurd' ? 'Goedgekeurd'
      : item.status === 'afgekeurd' ? 'Afgekeurd'
      : '—';

    doc.setTextColor(...donker);
    x = margin + 2;

    doc.setFontSize(7);
    doc.text(String(i + 1), x, y + 4.5); x += colW.nr;

    doc.setFont('helvetica', 'bold');
    doc.text((item.omschrijving || '').substring(0, 22), x, y + 4.5);
    doc.setFont('helvetica', 'normal');
    x += colW.omschr;

    doc.text((item.merk || '').substring(0, 14), x, y + 4.5);
    x += colW.merk;

    doc.text((item.materiaal || '').substring(0, 12), x, y + 4.5);
    x += colW.materiaal;

    doc.setFont('courier', 'normal');
    doc.setFontSize(6);
    doc.text((item.serienummer || '—').substring(0, 16), x, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    x += colW.sn;

    if (item.status === 'goedgekeurd')    doc.setTextColor(...groen);
    else if (item.status === 'afgekeurd') doc.setTextColor(...rood);
    else                                  doc.setTextColor(...grijs);
    doc.text(statusTekst, x, y + 4.5);
    doc.setTextColor(...donker);
    x += colW.status;

    if (kt) {
      if (ks === 'overdue')    doc.setTextColor(...rood);
      else if (ks === 'soon')  doc.setTextColor(...oranje);
      else                     doc.setTextColor(...groen);
      doc.setFontSize(6);
      doc.text(kt.substring(0, 18), x, y + 4.5);
      doc.setTextColor(...donker);
      doc.setFontSize(7);
    } else {
      doc.setTextColor(...grijs);
      doc.text('—', x, y + 4.5);
      doc.setTextColor(...donker);
    }
    x += colW.keuring;

    if (item.opmerking) {
      doc.setFontSize(6);
      doc.setTextColor(...oranje);
      doc.text((item.opmerking || '').substring(0, 20), x, y + 4.5);
      doc.setTextColor(...donker);
      doc.setFontSize(7);
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
// PDF DOWNLOAD
// ============================================================
function downloadCertPDF() {
  if (!_certData) {
    bouwCertData();
    if (!_certData) { toast('Geen keuringsdata beschikbaar', 'error'); return; }
  }
  if (typeof window.jspdf === 'undefined') { toast('PDF-bibliotheek nog niet geladen', 'error'); return; }
  const items = _certData.items;
  const doc = _bouwPDF(items, _actieveGebruiker || null);
  const c   = _certData.certificaat;
  const safeNaam = (_klantBedrijf || _klantNaam || 'overzicht').replace(/[^a-zA-Z0-9]/g, '_');
  const suffix = _actieveGebruiker ? '_' + _actieveGebruiker.replace(/[^a-zA-Z0-9]/g, '_') : '';
  doc.save(`Materiaaloverzicht_${safeNaam}${suffix}_${c.datum || ''}.pdf`);
  toast('Overzicht gedownload');
}

function downloadCertPDFPerGebruiker() {
  if (!_certData) { toast('Geen keuringsdata beschikbaar', 'error'); return; }
  if (typeof window.jspdf === 'undefined') { toast('PDF-bibliotheek nog niet geladen', 'error'); return; }

  const groepen = {};
  _certData.items.forEach(i => {
    const g = i.gebruiker || 'Algemeen';
    if (!groepen[g]) groepen[g] = [];
    groepen[g].push(i);
  });

  const gebruikers = Object.keys(groepen);
  const safeNaam = (_klantBedrijf || _klantNaam || 'overzicht').replace(/[^a-zA-Z0-9]/g, '_');
  const c        = _certData.certificaat;

  if (gebruikers.length <= 1) {
    const gebruiker = gebruikers[0] || 'Algemeen';
    const doc  = _bouwPDF(_certData.items, gebruiker);
    const safeG = gebruiker.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Materiaaloverzicht_${safeNaam}_${safeG}_${c.datum || ''}.pdf`);
    toast('Overzicht gedownload');
    return;
  }

  gebruikers.forEach(gebruiker => {
    const doc  = _bouwPDF(groepen[gebruiker], gebruiker);
    const safeG = gebruiker.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Materiaaloverzicht_${safeNaam}_${safeG}_${c.datum || ''}.pdf`);
  });
  toast(`${gebruikers.length} overzichten gedownload`);
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
  if (e.key === 'Escape') {
    sluitModal();
    sluitToevoegModal();
    sluitHistorieModal();
  }
});
