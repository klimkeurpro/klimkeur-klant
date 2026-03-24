'use strict';

// ============================================================
// data.js — Artikelen en keuringen laden, opslaan, verwijderen
// ============================================================

// In-memory opslag (wordt gevuld na inloggen)
let _artikelen = [];   // alle keuring_items van deze klant
let _keuringen = [];   // alle keuringen van deze klant

// ============================================================
// ARTIKELEN LADEN
// Filter op klant_id — NIET op auth_user_id
// Items worden aangemaakt door de keurmeester, niet de klant
// ============================================================
async function laadArtikelen() {
  if (!_klantId) return;

  try {
    const { data, error } = await sb
      .from('keuring_items')
      .select('*')
      .eq('klant_id', _klantId)
      .order('aangemaakt_op', { ascending: false });

    if (error) {
      console.error('Artikelen laden fout:', error);
      toast('Fout bij laden van artikelen', 'error');
      return;
    }

    // Vertaal database-velden naar interne naamgeving
    _artikelen = (data || []).map(rij => ({
      id:           rij.id,
      omschrijving: rij.omschrijving || '',
      merk:         rij.merk || '',
      materiaal:    rij.materiaal || '',
      serienummer:  rij.serienummer || '',
      fabrJaar:     rij.fabr_jaar || '',
      fabrMaand:    rij.fabr_maand || '',
      productieDatum: rij.productie_datum || '',
      inGebruik:    rij.in_gebruik || '',
      gebruiker:    rij.gebruiker || '',
      opmerking:    rij.opmerking || '',
      status:       rij.status || 'nieuw',
      keuringId:    rij.keuring_id || null,
      toegevoegd:   rij.aangemaakt_op || '',
    }));

    renderArtikelen();

  } catch (err) {
    console.error('Onverwachte fout bij laden artikelen:', err);
    toast('Fout bij laden van artikelen', 'error');
  }
}

// ============================================================
// ARTIKEL OPSLAAN (nieuw of bewerkt)
// bedrijf_id meegeven — anders valt het buiten de RLS filter
// ============================================================
async function slaArtikelOp(art) {
  const rij = {
    id:              art.id,
    klant_id:        _klantId,
    bedrijf_id:      _bedrijfId,
    auth_user_id:    _userId,
    omschrijving:    art.omschrijving,
    merk:            art.merk || '',
    materiaal:       art.materiaal || '',
    serienummer:     art.serienummer,
    productie_datum: art.productieDatum || '',
    fabr_jaar:       art.fabrJaar ? parseInt(art.fabrJaar) : null,
    fabr_maand:      art.fabrMaand || null,
    in_gebruik:      art.inGebruik || null,
    gebruiker:       art.gebruiker || '',
    opmerking:       art.opmerking || '',
    status:          art.status || 'nieuw',
    keuring_id:      art.keuringId || null,
  };

  try {
    const { error } = await sb
      .from('keuring_items')
      .upsert(rij, { onConflict: 'id' });

    if (error) {
      console.error('Artikel opslaan fout:', error);
      toast('Fout bij opslaan', 'error');
      return false;
    }

    return true;

  } catch (err) {
    console.error('Onverwachte fout bij opslaan artikel:', err);
    toast('Fout bij opslaan', 'error');
    return false;
  }
}

// ============================================================
// ARTIKEL VERWIJDEREN
// ============================================================
async function verwijderArtikelDb(id) {
  try {
    const { error } = await sb
      .from('keuring_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Artikel verwijderen fout:', error);
      toast('Fout bij verwijderen', 'error');
      return false;
    }

    return true;

  } catch (err) {
    console.error('Onverwachte fout bij verwijderen artikel:', err);
    toast('Fout bij verwijderen', 'error');
    return false;
  }
}

// ============================================================
// KEURINGEN LADEN (2 queries, geen N+1 probleem)
// Query 1: alle keuringen van deze klant
// Query 2: alle keuring_items van die keuringen in één keer
// Koppeling gebeurt in JavaScript
// ============================================================
async function laadKeuringen() {
  if (!_klantId) return;

  try {
    // Query 1: keuringen
    const { data: keuringData, error: keuringFout } = await sb
      .from('keuringen')
      .select('*')
      .eq('klant_id', _klantId)
      .order('datum', { ascending: false });

    if (keuringFout) {
      console.error('Keuringen laden fout:', keuringFout);
      toast('Fout bij laden van keuringen', 'error');
      return;
    }

    if (!keuringData || keuringData.length === 0) {
      _keuringen = [];
      renderCertificaat();
      renderHistorie();
      return;
    }

    // Query 2: alle items van deze keuringen in één query
    const keuringIds = keuringData.map(k => k.id);

    const { data: itemData, error: itemFout } = await sb
      .from('keuring_items')
      .select('*')
      .in('keuring_id', keuringIds);

    if (itemFout) {
      console.error('Keuring items laden fout:', itemFout);
      // Niet fataal — toon keuringen zonder items
    }

    // Koppel items aan keuringen in JavaScript
    const itemsPerKeuring = {};
    (itemData || []).forEach(item => {
      if (!itemsPerKeuring[item.keuring_id]) {
        itemsPerKeuring[item.keuring_id] = [];
      }
      itemsPerKeuring[item.keuring_id].push(item);
    });

    _keuringen = keuringData.map(k => ({
      id:                  k.id,
      certificaat_nr:      k.certificaat_nr || '—',
      datum:               k.datum || '',
      keurmeester:         k.keurmeester || '',
      bedrijf_keurmeester: k.bedrijf_keurmeester || '',
      afgerond:            k.afgerond || false,
      _items:              itemsPerKeuring[k.id] || [],
    }));

    renderCertificaat();
    renderHistorie();

  } catch (err) {
    console.error('Onverwachte fout bij laden keuringen:', err);
    toast('Fout bij laden van keuringen', 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ============================================================
// KEURING STATUS BEREKENING
//
// De 12-maanden teller loopt vanaf de meest recente keuringdatum.
// Als een artikel gekeurd is (keuringDatum aanwezig), overschrijft
// die datum de inGebruik-datum als startpunt.
// Voorbeeld: in gebruik 8 maanden geleden, maar gisteren gekeurd
// → teller begint opnieuw → status 'ok', keuring over 12 maanden.
// ============================================================
function keuringStatus(inGebruik, keuringDatum) {
  // Startpunt = meest recente van inGebruik en keuringDatum
  const start = keuringDatum && keuringDatum > (inGebruik || '')
    ? keuringDatum
    : inGebruik;
  if (!start) return null;
  const maanden = (Date.now() - new Date(start + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (maanden >= 12) return 'overdue';
  if (maanden >= 10) return 'soon';
  return 'ok';
}

function keuringTekst(status, inGebruik, keuringDatum) {
  const start = keuringDatum && keuringDatum > (inGebruik || '')
    ? keuringDatum
    : inGebruik;
  if (!status || !start) return null;
  const maanden = Math.round((Date.now() - new Date(start + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (status === 'overdue') return `⚠ Keuring nodig (${maanden} mnd geleden gekeurd)`;
  if (status === 'soon')    return `⏰ Keuring over ~${12 - maanden} mnd`;
  return `✓ Keuring over ${12 - maanden} mnd`;
}

function formatDatum(d) {
  if (!d) return '';
  try {
    return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('nl-NL');
  } catch {
    return d;
  }
}
