'use strict';

// ============================================================
// app.js — Startpunt van de KlantKeur app
//
// Volgorde in index.html:
//   config.js → auth.js → branding.js → data.js → ui.js → app.js
//
// Hoe de app start:
//
//   Bij handmatig inloggen:
//     authLogin() → signInWithPassword → SIGNED_IN event → verwerkInlog
//
//   Bij page refresh (sessie-herstel):
//     refreshSession() onderaan dit bestand → TOKEN_REFRESHED event → verwerkInlog
//     (INITIAL_SESSION wordt genegeerd: token is daar mogelijk verlopen)
//
//   Na invite of wachtwoord-reset:
//     activeerAccount() in auth.js roept verwerkInlog zelf aan
// ============================================================

// Voorkomt dat verwerkInlog gelijktijdig twee keer loopt
let _verwerkInlogBezig = false;

// Voorkomt dat TOKEN_REFRESHED de app opnieuw laadt als SIGNED_IN al klaar is
let _appGestart = false;


// ============================================================
// AUTH STATE CHANGE
// ============================================================
sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  // ── PASSWORD RECOVERY ──
  // Klant heeft op de reset-link geklikt. Supabase maakt een sessie aan.
  // We tonen het wachtwoord-scherm — de app start hier nog niet.
  if (event === 'PASSWORD_RECOVERY') {
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  // ── INITIAL_SESSION ──
  // Vuurt direct bij laden vanuit localStorage, zonder netwerkverzoek.
  // Het access token kan op dit moment verlopen zijn.
  // De sessie wordt opgestart via refreshSession() onderaan dit bestand,
  // wat TOKEN_REFRESHED vuurt zodra het netwerk reageert.
  if (event === 'INITIAL_SESSION') return;

  // ── INGELOGD (SIGNED_IN of TOKEN_REFRESHED) ──
  if (sessie?.user) {

    // Invite-flow: activeerAccount() in auth.js roept verwerkInlog zelf aan
    if (_inviteMode) {
      toonEmailOpWwScherm();
      return;
    }

    // Reset-flow: klant is bezig met wachtwoord kiezen
    if (_wwFlow === 'reset') return;

    // Voorkom dubbele aanroep
    if (_verwerkInlogBezig || _appGestart) return;

    _verwerkInlogBezig = true;
    try {
      await verwerkInlog(sessie.user);
    } catch (err) {
      console.error('Fout in verwerkInlog:', err);
      toonFoutScherm('Er is iets misgegaan bij het inloggen. Probeer het opnieuw.');
    } finally {
      _verwerkInlogBezig = false;
    }

  } else {
    // ── UITGELOGD ──
    if (_inviteMode) return;
    verwerkUitlog();
  }
});


// ============================================================
// SESSIE HERSTELLEN BIJ LADEN
// refreshSession() maakt een netwerkverzoek en vuurt TOKEN_REFRESHED
// als er een geldige sessie is — ongeacht of de token al verlopen was.
// Als er geen sessie is, geeft het een fout die we stilletjes negeren.
// ============================================================
sb.auth.refreshSession().catch(() => {
  // Geen actieve sessie — loginscherm is al zichtbaar
});


// ============================================================
// VERWERK INLOG
// Laad klantrecord, branding, artikelen en keuringen.
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  // Klantrecord ophalen — gooit een fout als de query mislukt
  let klant;
  try {
    klant = await laadKlantRecord(_userId);
  } catch (err) {
    toonFoutScherm('Fout bij ophalen van je gegevens. Probeer de pagina te herladen.');
    return;
  }

  if (!klant) {
    toonFoutScherm('Je account is nog niet gekoppeld aan een klantrecord. Neem contact op met Safety Green.');
    return;
  }

  _klantId   = klant.id;
  _klantNaam = klant.contactpersoon || klant.bedrijf || '';
  _bedrijfId = klant.bedrijf_id || null;

  // Header bijwerken
  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = 'Welkom, ' + _klantNaam;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'flex';

  // Branding laden (gedefinieerd in branding.js)
  await laadBranding(_bedrijfId);

  // Overlays verbergen en app markeren als gestart
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';
  _appGestart = true;

  setBadge('ok', '✓ Verbonden');

  // Data laden (gedefinieerd in data.js)
  await laadArtikelen();
  await laadKeuringen();
}


// ============================================================
// VERWERK UITLOG
// Reset alle staat en toont het loginscherm.
// ============================================================
function verwerkUitlog() {
  _userId     = null;
  _klantId    = null;
  _klantNaam  = '';
  _bedrijfId  = null;
  _appGestart = false;

  if (typeof _artikelen !== 'undefined') _artikelen = [];
  if (typeof _keuringen !== 'undefined') _keuringen = [];
  if (typeof _certData  !== 'undefined') _certData  = null;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = '';

  // Loginscherm tonen
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('wwOverlay').style.display   = 'none';

  // Branding resetten naar Safety Green standaard
  const root = document.documentElement;
  root.style.setProperty('--green',       '#5B9A2F');
  root.style.setProperty('--green-dark',  '#3D7A1A');
  root.style.setProperty('--green-light', '#8BC53F');

  // Loginvelden leegmaken
  const authEmail = document.getElementById('authEmail');
  const authPass  = document.getElementById('authPassword');
  if (authEmail) authEmail.value = '';
  if (authPass)  authPass.value  = '';

  // Wachtwoord-vergeten bevestiging verbergen
  const bevestiging = document.getElementById('wwVergetenBevestiging');
  if (bevestiging) bevestiging.style.display = 'none';
}


// ============================================================
// FOUTSCHERM
// ============================================================
function toonFoutScherm(bericht) {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';
  toast(bericht, 'error', 8000);
  setBadge('err', '✗ Fout');
  console.error('Inlogfout:', bericht);
}


// ============================================================
// STATUS BADGE
// ============================================================
function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className   = 'status-badge ' + type;
  b.textContent = tekst;
}
