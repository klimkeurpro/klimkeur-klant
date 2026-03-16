'use strict';

// ============================================================
// autocomplete.js — Productendatabase zoeken
// Zoekt in de producten tabel op omschrijving, merk, materiaal
// Filtert op bedrijf_id van de ingelogde klant
// ============================================================

// Bijhouden van zoekstatus per invoerveld
// 'main' = toevoegformulier, 'edit' = bewerkmodal
const _acStaat = {
  main: { resultaten: [], selectie: -1, timer: null },
  edit: { resultaten: [], selectie: -1, timer: null },
};

// ============================================================
// ZOEKEN — wordt aangeroepen bij elke toetsaanslag
// Wacht 250ms voordat de query uitgaat (debounce)
// ============================================================
function acZoeken(waarde, context) {
  const staat = _acStaat[context];
  if (!staat) return;

  clearTimeout(staat.timer);

  if (waarde.trim().length < 2) {
    acSluit(context);
    return;
  }

  staat.timer = setTimeout(() => acVoerZoekopdrachUit(waarde.trim(), context), 250);
}

async function acVoerZoekopdrachUit(zoekterm, context) {
  if (!_bedrijfId) return;

  try {
    const { data, error } = await sb
      .from('producten')
      .select('omschrijving, merk, materiaal, categorie')
      .eq('bedrijf_id', _bedrijfId)
      .or(`omschrijving.ilike.%${zoekterm}%,merk.ilike.%${zoekterm}%,materiaal.ilike.%${zoekterm}%`)
      .limit(15);

    if (error) {
      console.error('Autocomplete fout:', error);
      return;
    }

    // Sorteer: omschrijvingen die beginnen met zoekterm komen eerst
    const lz = zoekterm.toLowerCase();
    const gesorteerd = (data || []).sort((a, b) => {
      const aBegin = (a.omschrijving || '').toLowerCase().startsWith(lz);
      const bBegin = (b.omschrijving || '').toLowerCase().startsWith(lz);
      if (aBegin && !bBegin) return -1;
      if (!aBegin && bBegin) return 1;
      return 0;
    });

    _acStaat[context].resultaten = gesorteerd;
    _acStaat[context].selectie = -1;
    acToonResultaten(zoekterm, context);

  } catch (err) {
    console.error('Onverwachte fout bij autocomplete:', err);
  }
}

// ============================================================
// RESULTATEN TONEN in dropdown
// ============================================================
function acToonResultaten(zoekterm, context) {
  const ddId = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd = document.getElementById(ddId);
  if (!dd) return;

  const resultaten = _acStaat[context].resultaten;

  if (resultaten.length === 0) {
    // Geen resultaten — toon "vrij invoeren" optie
    dd.innerHTML = `<div class="ac-item" onclick="acKiesVrij('${context}')">
      <div class="ac-vrij">↵ Vrij invoeren — geen treffer in productendatabase</div>
    </div>`;
    dd.classList.add('open');
    return;
  }

  const rx = new RegExp(`(${escRx(zoekterm)})`, 'gi');

  dd.innerHTML = resultaten.map((product, i) => {
    const omschrHl = esc(product.omschrijving).replace(rx, '<span class="ac-match">$1</span>');
    const sub = [product.merk, product.materiaal, product.categorie].filter(Boolean).join(' · ');

    return `<div class="ac-item${_acStaat[context].selectie === i ? ' selected' : ''}"
      onmousedown="acKies(${i}, '${context}')">
      <div class="ac-omschr">${omschrHl}</div>
      ${sub ? `<div class="ac-sub">${esc(sub)}</div>` : ''}
    </div>`;
  }).join('');

  dd.classList.add('open');
}

// ============================================================
// TOETSENBORD NAVIGATIE (pijltjes + enter)
// ============================================================
function acKey(event, context) {
  const staat = _acStaat[context];
  const ddId = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd = document.getElementById(ddId);

  if (!dd || !dd.classList.contains('open')) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    staat.selectie = Math.min(staat.selectie + 1, staat.resultaten.length - 1);
    acToonResultaten(document.getElementById(context === 'main' ? 'fOmschr' : 'eOmschr').value, context);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    staat.selectie = Math.max(staat.selectie - 1, -1);
    acToonResultaten(document.getElementById(context === 'main' ? 'fOmschr' : 'eOmschr').value, context);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (staat.selectie >= 0) {
      acKies(staat.selectie, context);
    } else {
      acSluit(context);
    }
  } else if (event.key === 'Escape') {
    acSluit(context);
  }
}

// ============================================================
// PRODUCT KIEZEN uit dropdown
// ============================================================
function acKies(index, context) {
  const product = _acStaat[context].resultaten[index];
  if (!product) return;

  if (context === 'main') {
    const omschrEl = document.getElementById('fOmschr');
    const merkEl   = document.getElementById('fMerk');
    const merkLbl  = document.getElementById('merkLabel');

    omschrEl.value = product.omschrijving;
    omschrEl.dataset.materiaal = product.materiaal || '';

    if (product.merk) {
      merkEl.value = product.merk;
      merkEl.className = 'form-input merk-auto';
      if (merkLbl) merkLbl.style.display = 'flex';
    }
  } else {
    const omschrEl = document.getElementById('eOmschr');
    const merkEl   = document.getElementById('eMerk');
    const merkLbl  = document.getElementById('eMerkLabel');

    omschrEl.value = product.omschrijving;
    omschrEl.dataset.materiaal = product.materiaal || '';

    if (product.merk) {
      merkEl.value = product.merk;
      merkEl.className = 'form-input merk-auto';
      if (merkLbl) merkLbl.style.display = 'flex';
    }
  }

  acSluit(context);
}

// ============================================================
// VRIJ INVOEREN — geen product gekozen
// ============================================================
function acKiesVrij(context) {
  acSluit(context);
}

// ============================================================
// DROPDOWN SLUITEN
// ============================================================
function acSluit(context) {
  const ddId = context === 'main' ? 'acDd' : 'acDdEdit';
  const dd = document.getElementById(ddId);
  if (dd) dd.classList.remove('open');
  if (_acStaat[context]) {
    _acStaat[context].selectie = -1;
  }
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
