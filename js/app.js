'use strict';

// ============================================================
// app.js — Initialisatie en onAuthStateChange
// Dit bestand wordt als laatste geladen en knoopt alles samen:
// config.js → auth.js → branding.js → data.js → ui.js → app.js
// ============================================================

let _appGeladen   = false;  // true zodra verwerkInlog succesvol is afgerond
let _verwerkBezig = false;  // true zolang verwerkInlog draait

// ============================================================
// onAuthStateChange
//
// BELANGRIJK: geen async Supabase-aanroepen in deze callback!
// Supabase houdt intern een lock vast zolang de callback draait.
// Als je vanuit de callback weer iets aan Supabase vraagt,
// wacht die aanroep op datzelfde slot → impasse (deadlock).
// Oplossing: setTimeout(0) breekt uit de lock.
// ============================================================
sb.auth.onAuthStateChange((event, sessie) => {
  console.log('Auth event:', event);
  setTimeout(() => afhandelenAuthEvent(event, sessie), 0);
});

// ============================================================
// AUTH EVENT AFHANDELEN (buiten de Supabase-lock)
// ============================================================
async function afhandelenAuthEvent(event, sessie) {

  // ── PASSWORD RECOVERY ──
  if (event === 'PASSWORD_RECOVERY') {
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  // ── INGELOGD ──
  if (sessie?.user) {

    // Invite-flow: wacht tot activeerAccount() klaar is
    if (_inviteMode) {
      toonEmailOpWwScherm();
      return;
    }

    // Reset-flow: klant is bezig met wachtwoord kiezen
    if (_wwFlow === 'reset') {
      return;
    }

    // App is al geladen (bijv. TOKEN_REFRESHED)
    if (_appGeladen) {
      return;
    }

    // Voorkom dubbele uitvoering
    if (_verwerkBezig) {
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
    if (_inviteMode) return;
    verwerkUitlog();
  }
}

// ============================================================
// VERWERK INLOG
// Laad klantrecord, branding, artikelen en keuringen
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  const klant = await laadKlantRecord(_userId);

  if (!klant) {
    toonFoutScherm('Je account is nog niet gekoppeld aan een klantrecord. Neem contact op met Safety Green.');
    return;
  }

  _klantId   = klant.id;
  _klantNaam = klant.contactpersoon || klant.bedrijf || '';
  _bedrijfId = klant.bedrijf_id || null;

  const headerSub = document.getElementById('headerSub');
  if (headerSub && _klantNaam) headerSub.textContent = _klantNaam;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'flex';

  await laadBranding(_bedrijfId);

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  setBadge('ok', '✓ Verbonden');

  await laadArtikelen();
  await laadKeuringen();
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
}

// ============================================================
// FOUTSCHERM
// ============================================================
function toonFoutScherm(bericht) {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';
  toast(bericht, 'error', 8000);
  setBadge('err', '✗ Fout');
  console.error('Fout bij inloggen:', bericht);
}

// ============================================================
// BADGE (verbindingsstatus)
// =====================================
