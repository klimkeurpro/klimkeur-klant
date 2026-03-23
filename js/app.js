'use strict';

// ============================================================
// app.js — Startpunt van de KlantKeur app
//
// Dit bestand wordt als laatste geladen. Het registreert
// onAuthStateChange en bevat de centrale inlog/uitlog-logica.
//
// Volgorde events bij normaal inloggen:
//   1. authLogin() in auth.js stuurt credentials naar Supabase
//   2. Supabase vuurt SIGNED_IN via onAuthStateChange
//   3. verwerkInlog() laadt klantrecord, branding, data
//
// Volgorde events bij refresh (sessie-herstel):
//   1. Supabase vuurt INITIAL_SESSION — negeren (sessie nog niet klaar)
//   2. Supabase vuurt TOKEN_REFRESHED of SIGNED_IN
//   3. verwerkInlog() laadt klantrecord, branding, data
//
// Invite en reset-flow worden afgehandeld in auth.js.
// onAuthStateChange herkent die flows en laat ze met rust.
// ============================================================

// Vlag om te voorkomen dat verwerkInlog gelijktijdig twee keer loopt
let _verwerkInlogBezig = false;


// ============================================================
// AUTH STATE CHANGE
// Supabase roept dit aan bij elke wijziging in inlogstatus
// ============================================================
sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  // ── PASSWORD RECOVERY ──
  // Klant heeft op reset-link in e-mail geklikt.
  // Supabase maakt automatisch een sessie — we tonen het wachtwoord-scherm.
  if (event === 'PASSWORD_RECOVERY') {
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  // ── INITIAL_SESSION ──
  // Dit event vuurt bij laden van de pagina, ook als er een sessie is.
  // Op dit moment is de auth-token nog niet actief voor database-queries.
  // We wachten op SIGNED_IN of TOKEN_REFRESHED.
  if (event === 'INITIAL_SESSION') return;

  // ── INGELOGD ──
  if (sessie?.user) {

    // Tijdens invite-flow is _inviteMode true.
    // activeerAccount() in auth.js roept verwerkInlog zelf aan na afronding.
    if (_inviteMode) {
      toonEmailOpWwScherm();
      return;
    }

    // Tijdens reset-flow wacht de klant nog op wachtwoord-invoer.
    if (_wwFlow === 'reset') return;

    // Voorkom dubbele aanroep (bijv. als TOKEN_REFRESHED en SIGNED_IN snel
    // na elkaar vuren)
    if (_verwerkInlogBezig) return;

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
    if (_inviteMode) return; // Invite-flow actief — loginscherm niet tonen
    verwerkUitlog();
  }
});


// ============================================================
// VERWERK INLOG
// Wordt aangeroepen na een succesvolle SIGNED_IN of TOKEN_REFRESHED,
// en direct vanuit activeerAccount() na invite/reset-flow.
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  // Klantrecord ophalen (gooit een fout als de query mislukt)
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

  // Branding laden (kleuren, logo — gedefinieerd in branding.js)
  await laadBranding(_bedrijfId);

  // Overlays verbergen
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  setBadge('ok', '✓ Verbonden');

  // Data laden (gedefinieerd in data.js)
  await laadArtikelen();
  await laadKeuringen();
}


// ============================================================
// VERWERK UITLOG
// Reset alle staat en toont het loginscherm
// ============================================================
function verwerkUitlog() {
  _userId    = null;
  _klantId   = null;
  _klantNaam = '';
  _bedrijfId = null;

  // Data-staat resetten (gedefinieerd in data.js)
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

  // Branding resetten naar standaard Safety Green kleuren
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
// Toont een foutmelding en verbergt alle overlays
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
