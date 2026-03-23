'use strict';

// ============================================================
// app.js — Initialisatie en onAuthStateChange
// Dit bestand wordt als laatste geladen en knoopt alles samen:
// config.js → auth.js → branding.js → data.js → ui.js → app.js
// ============================================================

// Vlag om te voorkomen dat verwerkInlog dubbel loopt
// (Supabase vuurt SIGNED_IN soms meerdere keren achter elkaar)
let _verwerkInlogBezig = false;

// ============================================================
// START: onAuthStateChange
// Supabase roept dit aan zodra de inlogstatus verandert:
// - bij laden van de pagina (sessie check)
// - na inloggen
// - na uitloggen
// - na account activeren via invite-link
// - na klikken op wachtwoord-reset-link in e-mail
// ============================================================
sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  // ── PASSWORD RECOVERY ──
  // Klant heeft op reset-link in e-mail geklikt.
  // Supabase maakt automatisch een sessie aan.
  // We tonen het wachtwoord-scherm met de juiste teksten.
  if (event === 'PASSWORD_RECOVERY') {
    console.log('Password recovery flow gedetecteerd');
    const email = sessie?.user?.email || null;
    toonWwScherm('reset', email);
    return;
  }

  // ── INGELOGD ──
  if (sessie?.user) {

    // Bekende valkuil: tijdens invite-flow vuurt SIGNED_IN al
    // terwijl activeerAccount() nog bezig is. We wachten tot
    // _inviteMode false is voordat we verder gaan.
    if (_inviteMode) {
      console.log('SIGNED_IN tijdens invite-flow — wachten op activering');

      // Wel alvast het e-mailadres tonen op het wachtwoord-scherm
      // zodat de klant ziet voor welk account ze bezig zijn
      toonEmailOpWwScherm();
      return;
    }

    // Reset-flow: als _wwFlow === 'reset' is de klant bezig
    // met wachtwoord kiezen. Niet doorsturen naar de app.
    if (_wwFlow === 'reset') {
      console.log('Sessie-event tijdens reset-flow — wachten op wachtwoord keuze');
      return;
    }

    // Bescherming: als verwerkInlog al bezig is, niet opnieuw starten
    if (_verwerkInlogBezig) {
      console.log('verwerkInlog al bezig — overgeslagen');
      return;
    }

    try {
      _verwerkInlogBezig = true;
      await verwerkInlog(sessie.user);
    } catch (err) {
      console.error('Fout in verwerkInlog:', err);
      toonFoutScherm('Er is iets misgegaan bij het inloggen. Probeer het opnieuw.');
    } finally {
      _verwerkInlogBezig = false;
    }
  } else {
    // ── UITGELOGD ──
    if (_inviteMode) {
      // Invite-flow actief — toon wachtwoordscherm, niet het loginscherm
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
  toast('verwerkInlog gestart voor: ' + user.email, 'ok', 5000);
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

  // Klantnaam tonen in header (welkomsttekst)
  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = 'Welkom, ' + (_klantNaam || '');

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

  // UI resetten
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  // Welkomsttekst wissen
  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = '';

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
// BADGE (verbindingsstatus linksboven in toevoegformulier)
// ============================================================
function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className  = 'status-badge ' + type;
  b.textContent = tekst;
}
