'use strict';

// ============================================================
// autocomplete.js — Productendatabase zoeken
// Zoekt in de producten tabel op omschrijving, merk, materiaal
// Filtert op bedrijf_id van de ingelogde klant
// Als merk én/of materiaal ingevuld zijn, wordt de dropdown
// automatisch beperkt tot die combinatie
// Vrije invoer blijft altijd mogelijk
// ============================================================

const _acStaat = {
  main: { resultaten: [], selectie: -1, timer: null },
  edit: { resultaten: [], selectie: -1, timer: null },
};

// ============================================================
// HULPFUNCTIES om huidige veldwaarden op te halen
// ============================================================
function _getMerk(context) {
  const id = context === 'main' ? 'fMerk' : 'eMerk';
  return (document.getElementById(id)?.value || '').trim();
}

function _getMateriaal(context) {
  const id = context === 'main' ? 'fMateriaal' : 'eMateriaal';
  return (document.getElementById(id)?.value || '').trim();
}

function _getOmschrijving(context) {
  const id = context === 'main' ? 'fOmschr' : 'eOmschr';
  return (document.getElementById(id)?.value || '').trim();
}

// ============================================================
// ZOEKEN VANUIT OMSCHRIJVING
// ============================================================
function acZoeken(waarde, context) {
  const staat = _acStaat[context];
  if (!staat) return;
  clearTimeout(staat.timer);
  if (waarde.trim().length < 2) { acSluit(context); return; }
  staat.timer = setTimeout(() => acVoerZoekopdrachUit(waarde.trim(), context), 250);
}

// ============================================================
// ZOEKEN VANUIT MERK OF MATERIAAL VELD
// ============================================================
function acZoekenOpVeld(context) {
  const staat = _acStaat[context];
  if (!staat) return;
  clearTimeout(staat.timer);
  const merk      = _getMerk(context);
  const materiaal = _getMateriaal(context);
  const omschr    = _getOmschrijving(context);
  if (!merk && !materiaal && !omschr) return;
  staat.timer = setTimeout(() => acVoerZoekopdrachUit(omschr || '', context), 250);
}

// ============================================================
// QUERY UITVOEREN
// ============================================================
async function acVoerZoekopdrachUit(zoekterm, context) {
  if (!_bedrijfId) return;

  const merk      = _getMerk(context);
  const materiaal = _getMateriaal(context);

  try {
    let query = sb
      .from('producten')
      .select('omschrijving, merk, materiaal, categorie')
      .eq('bedrijf_id', _bedrijfId);

    if (merk)      query = query.ilike('merk',      `%${merk}%`);
    if (materiaal) query = query.ilike('materiaal', `%${materiaal}%`);

    if (zoekterm) {
      if (!merk && !materiaal) {
        query = query.or(`omschrijving.ilike.%${zoekterm}%,merk.ilike.%${zoekterm}%,materiaal.ilike.%${zoekterm}%`);
      } else {
        query = query.ilike('omschrijving', `%${zoekterm}%`);
      }
    }

    query = query.limit(15);

    const { data, error } = await query;

    if (error) { console.error('Autocomplete fout:', error); return; }

    const lz = zoekterm.toLowerCase();
    const gesorteerd = (data || []).sort((a, b) => {
      const aBegin = (a.omschrijving || '').toLowerCase().startsWith(lz);
      const bBegin = (b.omschrijving || '').toLowerCase().startsWith(lz);
      if (aBegin && !bBegin) return -1;
      if (!aBegin && bBegin) return 1;
      return 0;
    });

    _acStaat[context].resultaten = gesorteerd;
    _acStaat[context].selectie   = -1;
    acToonResultaten(zoekterm, context);

  } catch (err) {
    console.error('Onverwachte fout bij autocomplete:', err);
  }
}

// ============================================================
// RESULTATEN TONEN
// ============================================================
function acToonResultaten(zoekterm, context) {
  const ddId = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd   = document.getElementById(ddId);
  if (!dd) return;

  const resultaten = _acStaat[context].resultaten;

  if (resultaten.length === 0) {
    dd.innerHTML = `<div class="ac-item" onmousedown="acKiesVrij('${context}')">
      <div class="ac-vrij">↵ Vrij invoeren — geen treffer in productendatabase</div>
    </div>`;
    dd.classList.add('open');
    return;
  }

  const rx = zoekterm ? new RegExp(`(${escRx(zoekterm)})`, 'gi') : null;

  dd.innerHTML = resultaten.map((product, i) => {
    const omschrHl = rx
      ? esc(product.omschrijving).replace(rx, '<span class="ac-match">$1</span>')
      : esc(product.omschrijving);
    const sub = [product.merk, product.materiaal, product.categorie].filter(Boolean).join(' · ');
    return `<div class="ac-item${_acStaat[context].selectie === i ? ' selected' : ''}"
      onmousedown="acKies(${i}, '${context}')">
      <div class="ac-omschr">${omschrHl}</div>
      ${sub ? `<div class="ac-sub">${esc(sub)}</div>` : ''}
    </div>`;
  }).join('') + `<div class="ac-item" onmousedown="acKiesVrij('${context}')">
    <div class="ac-vrij">↵ Vrij invoeren</div>
  </div>`;

  dd.classList.add('open');
}

// ============================================================
// TOETSENBORD NAVIGATIE
// ============================================================
function acKey(event, context) {
  const staat = _acStaat[context];
  const ddId  = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd    = document.getElementById(ddId);
  if (!dd || !dd.classList.contains('open')) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    staat.selectie = Math.min(staat.selectie + 1, staat.resultaten.length - 1);
    acToonResultaten(_getOmschrijving(context), context);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    staat.selectie = Math.max(staat.selectie - 1, -1);
    acToonResultaten(_getOmschrijving(context), context);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (staat.selectie >= 0) acKies(staat.selectie, context);
    else acSluit(context);
  } else if (event.key === 'Escape') {
    acSluit(context);
  }
}

// ============================================================
// PRODUCT KIEZEN — vult alle velden in
// ============================================================
function acKies(index, context) {
  const product = _acStaat[context].resultaten[index];
  if (!product) return;

  const prefix = context === 'main' ? 'f' : 'e';

  const omschrEl    = document.getElementById(prefix + 'Omschr');
  const merkEl      = document.getElementById(prefix + 'Merk');
  const materiaalEl = document.getElementById(prefix + 'Materiaal');
  const merkLbl     = document.getElementById(context === 'main' ? 'merkLabel' : 'eMerkLabel');

  if (omschrEl) omschrEl.value = product.omschrijving;

  if (merkEl) {
    merkEl.value     = product.merk || '';
    merkEl.className = product.merk ? 'form-input merk-auto' : 'form-input';
    if (merkLbl) merkLbl.style.display = product.merk ? 'flex' : 'none';
  }

  if (materiaalEl) materiaalEl.value = product.materiaal || '';

  acSluit(context);

  // Focus naar serienummer na kiezen
  const snEl = document.getElementById(prefix === 'f' ? 'fSN' : 'eSN');
  if (snEl) snEl.focus();
}

// ============================================================
// VRIJ INVOEREN
// ============================================================
function acKiesVrij(context) {
  acSluit(context);
}

// ============================================================
// DROPDOWN SLUITEN
// ============================================================
function acSluit(context) {
  const ddId = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd   = document.getElementById(ddId);
  if (dd) dd.classList.remove('open');
  if (_acStaat[context]) _acStaat[context].selectie = -1;
}

// ============================================================
// HELPERS
// ============================================================
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
