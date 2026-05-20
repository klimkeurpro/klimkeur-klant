'use strict';

// ============================================================
// app.js — Initialisatie en onAuthStateChange
// Dit bestand wordt als laatste geladen en knoopt alles samen:
// config.js → auth.js → branding.js → data.js → ui.js → app.js
// ============================================================

let _appGeladen   = false;
let _verwerkBezig = false;

// ============================================================
// onAuthStateChange
//
// BELANGRIJK: geen async Supabase-aanroepen in deze callback!
// Supabase houdt intern een lock vast zolang de callback draait.
// setTimeout(0) breekt uit die lock voordat we verdergaan.
// ============================================================
sb.auth.onAuthStateChange((event, sessie) => {
  console.log('Auth event:', event);
  setTimeout(() => afhandelenAuthEvent(event, sessie), 0);
});

async function afhandelenAuthEvent(event, sessie) {
  console.log('afhandelenAuthEvent:', event);

  if (event === 'PASSWORD_RECOVERY') {
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  if (sessie?.user) {
    if (_inviteMode) { toonEmailOpWwScherm(); return; }
    if (_wwFlow === 'reset') { return; }
    if (_appGeladen) { console.log('App al geladen — skip'); return; }
    if (_verwerkBezig) { console.log('Al bezig — skip'); return; }

    try {
      _verwerkBezig = true;
      console.log('verwerkInlog START voor', sessie.user.email);
      await verwerkInlog(sessie.user);
      _appGeladen = true;
      console.log('verwerkInlog KLAAR');
    } catch (err) {
      console.error('Fout in verwerkInlog:', err);
      toonFoutScherm('Er ging iets mis bij het laden. Probeer de pagina te vernieuwen.');
    } finally {
      _verwerkBezig = false;
    }

  } else {
    if (_inviteMode) return;
    console.log('Geen sessie — verwerkUitlog');
    verwerkUitlog();
  }
}

// ============================================================
// VERWERK INLOG
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  console.log('laadKlantRecord...');
  const klant = await laadKlantRecord(_userId);
  console.log('klant:', klant ? klant.bedrijf : 'NULL');

  if (!klant) {
    toonFoutScherm('Je account is nog niet gekoppeld aan een klantrecord. Neem contact op met Safety Green.');
    return;
  }

  _klantId   = klant.id;
  _klantNaam    =klant.contactpersoon || klant.bedrijf || '';
  _bedrijfId = klant.bedrijf_id || null;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'flex';

  console.log('laadBranding...');
  await laadBranding(_bedrijfId);

  // Naam NA branding zetten, want laadBranding overschrijft headerSub
  // met de bedrijfsnaam. De klantnaam is belangrijker hier.
  const headerSub = document.getElementById('headerSub');
  if (headerSub && _klantNaam) headerSub.textContent = _klantNaam;

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  setBadge('ok', '✓ Verbonden');

  console.log('laadArtikelen...');
  await laadArtikelen();
  console.log('laadKeuringen...');
  await laadKeuringen();

  // ── GEBRUIKER KEUZESCHERM ─────────────────────────────────
  // Toon "Wie ben je?" of laad opgeslagen keuze.
  // Moet NA laadArtikelen zodat de gebruikersnamen beschikbaar zijn.
  // ──────────────────────────────────────────────────────────
  laadOpgeslagenGebruiker();

  console.log('ALLES GELADEN');
}

// ============================================================
// VERWERK UITLOG
// ============================================================
function verwerkUitlog() {
  _userId    = null;
  _klantId   = null;
  _klantNaam = '';
  _bedrijfId = null;
  _artikelen = [];
  _keuringen = [];
  _certData  = null;
  _appGeladen   = false;
  _verwerkBezig = false;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('wwOverlay').style.display   = 'none';

  const root = document.documentElement;
  root.style.setProperty('--green',       '#5B9A2F');
  root.style.setProperty('--green-dark',  '#3D7A1A');
  root.style.setProperty('--green-light', '#8BC53F');

  const authEmail = document.getElementById('authEmail');
  const authPass  = document.getElementById('authPassword');
  if (authEmail) authEmail.value = '';
  if (authPass)  authPass.value  = '';

  const bevestiging = document.getElementById('wwVergetenBevestiging');
  if (bevestiging) bevestiging.style.display = 'none';

  // Gebruiker-keuze resetten
  const gebruikerBtn = document.getElementById('gebruikerSwitchBtn');
  if (gebruikerBtn) gebruikerBtn.style.display = 'none';
}

function toonFoutScherm(bericht) {
  // Sessie opruimen — er is geen klantrecord, dus de app kan niet laden.
  // Door uit te loggen keert het loginscherm terug en kan de gebruiker
  // het opnieuw proberen met een ander e-mailadres.
  toast(bericht, 'error', 8000);
  console.error('Fout bij inloggen:', bericht);
  sb.auth.signOut().then(() => verwerkUitlog());
}

function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className  = 'status-badge ' + type;
  b.textContent = tekst;
}
