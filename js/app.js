'use strict';

// ============================================================
// app.js — Initialisatie en onAuthStateChange
// Dit bestand wordt als laatste geladen en knoopt alles samen:
// config.js → auth.js → branding.js → data.js → ui.js → app.js
// ============================================================

// Bescherming tegen dubbele uitvoering
let _appGeladen   = false;  // true zodra verwerkInlog succesvol is afgerond
let _verwerkBezig = false;  // true zolang verwerkInlog draait

// ============================================================
// START: onAuthStateChange
// Supabase roept dit aan zodra de inlogstatus verandert:
// - bij laden van de pagina (INITIAL_SESSION)
// - na inloggen (SIGNED_IN)
// - na uitloggen (SIGNED_OUT)
// - bij token verversing (TOKEN_REFRESHED)
// - na account activeren via invite-link
// - na klikken op wachtwoord-reset-link in e-mail
// ============================================================
sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  // ── PASSWORD RECOVERY ──
  if (event === 'PASSWORD_RECOVERY') {
    console.log('Password recovery flow gedetecteerd');
    const email = sessie?.user?.email || null;
    toonWwScherm('reset', email);
    return;
  }

  // ── INGELOGD ──
  if (sessie?.user) {

    // Invite-flow: wacht tot activeerAccount() klaar is
    if (_inviteMode) {
      console.log('SIGNED_IN tijdens invite-flow — wachten op activering');
      toonEmailOpWwScherm();
      return;
    }

    // Reset-flow: klant is bezig met wachtwoord kiezen
    if (_wwFlow === 'reset') {
      console.log('Sessie-event tijdens reset-flow — wachten op wachtwoord keuze');
      return;
    }

    // App is al geladen (bijv. TOKEN_REFRESHED na page load)
    // → geen actie nodig, sessie is automatisch ververst
    if (_appGeladen) {
      console.log('App al geladen, token ververst — geen actie nodig');
      return;
    }

    // Voorkom dubbele uitvoering als twee events snel na elkaar komen
    if (_verwerkBezig) {
      console.log('verwerkInlog is al bezig — overgeslagen');
      return;
    }

    try {
      _verwerkBezig = true;
      await verwerkInlog(sessie.user);
      _appGeladen = true;
    } catch (err) {
      console.error('Fout in verwerkInlog:', err);
      toonFoutScherm('Er ging iets mis bij het laden. Probeer de pagina te vernieuwen.');
    } finally {
      _verwerkBezig = false;
    }

  } else {
    // ── UITGELOGD ──
    if (_inviteMode) {
      return;
    }
    verwerkUitlog();
  }
});

// ============================================================
// VERWERK INLOG
// Laad klantrecord, branding, artikelen en keuringen
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  // Klantrecord ophalen (gedefinieerd in auth.js)
  const klant = await laadKlantRecord(_userId);

  if (!klant) {
    // Geen klantrecord gevonden — toon foutmelding
    toonFoutScherm('Je account is nog niet gekoppeld aan een klantrecord. Neem contact op met Safety Green.');
    return;
  }

  // Globale staat instellen (gebruikt door data.js en ui.js)
  _klantId   = klant.id;
  _klantNaam = klant.contactpersoon || klant.bedrijf || '';
  _bedrijfId = klant.bedrijf_id || null;

  // Naam tonen in header
  const headerSub = document.getElementById('headerSub');
  if (headerSub && _klantNaam) headerSub.textContent = _klantNaam;

  // Uitlogknop tonen
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'flex';

  // Branding laden (gedefinieerd in branding.js)
  await laadBranding(_bedrijfId);

  // Alle overlays verbergen
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  // Verbindingsstatus tonen
  setBadge('ok', '✓ Verbonden');

  // Data laden (gedefinieerd in data.js)
  await laadArtikelen();
  await laadKeuringen();
}

// ============================================================
// VERWERK UITLOG
// Reset UI naar beginstand
// ============================================================
function verwerkUitlog() {
  // Globale staat wissen
  _userId    = null;
  _klantId   = null;
  _klantNaam = '';
  _bedrijfId = null;
  _artikelen = [];
  _keuringen = [];
  _certData  = null;

  // Vlaggen resetten zodat opnieuw inloggen weer werkt
  _appGeladen   = false;
  _verwerkBezig = false;

  // UI resetten
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  // Loginscherm tonen
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('wwOverlay').style.display   = 'none';

  // Standaard kleuren herstellen
  const root = document.documentElement;
  root.style.setProperty('--green',       '#5B9A2F');
  root.style.setProperty('--green-dark',  '#3D7A1A');
  root.style.setProperty('--green-light', '#8BC53F');

  // Formulieren leegmaken
  const authEmail = document.getElementById('authEmail');
  const authPass  = document.getElementById('authPassword');
  if (authEmail) authEmail.value = '';
  if (authPass)  authPass.value  = '';

  // Reset-bevestiging verbergen (als die zichtbaar was)
  const bevestiging = document.getElementById('wwVergetenBevestiging');
  if (bevestiging) bevestiging.style.display = 'none';
}

// ============================================================
// FOUTSCHERM (als klantrecord niet gevonden wordt)
// ============================================================
function toonFoutScherm(bericht) {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  // Toon fout als toast én in de UI
  toast(bericht, 'error', 8000);
  setBadge('err', '✗ Fout');
  console.error('Fout bij inloggen:', bericht);
}

// ============================================================
// BADGE (verbindingsstatus)
// ============================================================
function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className  = 'status-badge ' + type;
  b.textContent = tekst;
}
