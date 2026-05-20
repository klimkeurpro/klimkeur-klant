'use strict';

// ============================================================
// branding.js — Bedrijfsbranding laden en toepassen
// Laadt kleuren, logo en contactgegevens uit de bedrijven tabel
// in Supabase en past ze toe via CSS custom properties.
//
// _keurBedrijfEmail en _keurBedrijfNaam worden gebruikt door de
// "Keuring aanvragen" functie in ui.js.
// ============================================================

// Standaard kleuren (Safety Green) als fallback
const STANDAARD_KLEUREN = {
  kleur_primair:       '#5B9A2F',
  kleur_primair_donker:'#3D7A1A',
  kleur_accent:        '#8BC53F',
};

// Contactgegevens van het keuringsbedrijf — gevuld door laadBranding()
let _keurBedrijfEmail = '';
let _keurBedrijfNaam  = '';

// ============================================================
// Laad bedrijfsbranding op basis van bedrijf_id
// Roep aan na inloggen, zodra bedrijf_id bekend is
// ============================================================
async function laadBranding(bedrijfId) {
  if (!bedrijfId) {
    pasKleurenToe(STANDAARD_KLEUREN);
    return;
  }

  try {
    const { data, error } = await sb
      .from('bedrijven')
      .select('naam, logo_url, kleur_primair, kleur_primair_donker, kleur_accent, email')
      .eq('id', bedrijfId)
      .maybeSingle();

    if (error) {
      console.error('Branding laden fout:', error);
      pasKleurenToe(STANDAARD_KLEUREN);
      return;
    }

    if (!data) {
      console.warn('Geen bedrijfsrecord gevonden voor:', bedrijfId);
      pasKleurenToe(STANDAARD_KLEUREN);
      return;
    }

    // Kleuren toepassen
    pasKleurenToe(data);

    // Logo toepassen in header (als aanwezig)
    if (data.logo_url) {
      pasLogoToe(data.logo_url);
    }

    // Bedrijfsnaam tonen in header
    if (data.naam) {
      const headerSub = document.getElementById('headerSub');
      if (headerSub) headerSub.textContent = data.naam;
    }

    // Contactgegevens bewaren voor "Keuring aanvragen"
    _keurBedrijfEmail = data.email || '';
    _keurBedrijfNaam  = data.naam  || '';

  } catch (err) {
    console.error('Onverwachte fout bij branding laden:', err);
    pasKleurenToe(STANDAARD_KLEUREN);
  }
}

// ============================================================
// Pas kleuren toe via CSS custom properties
// ============================================================
function pasKleurenToe(bedrijf) {
  const root = document.documentElement;
  root.style.setProperty('--green',      bedrijf.kleur_primair        || STANDAARD_KLEUREN.kleur_primair);
  root.style.setProperty('--green-dark', bedrijf.kleur_primair_donker || STANDAARD_KLEUREN.kleur_primair_donker);
  root.style.setProperty('--green-light',bedrijf.kleur_accent         || STANDAARD_KLEUREN.kleur_accent);
}

// ============================================================
// Vervang SVG-logo in header door bedrijfslogo
// ============================================================
function pasLogoToe(logoUrl) {
  const logoWrap = document.querySelector('.header-logo');
  if (!logoWrap) return;

  const svgEl = logoWrap.querySelector('svg');
  if (svgEl) {
    const img = document.createElement('img');
    img.src = logoUrl;
    img.alt = 'Bedrijfslogo';
    logoWrap.replaceChild(img, svgEl);
  }
}
