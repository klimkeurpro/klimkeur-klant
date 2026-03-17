'use strict';

// ============================================================
// app.js — Initialisatie en onAuthStateChange
// Dit bestand wordt als laatste geladen en knoopt alles samen:
// config.js → auth.js → branding.js → data.js → ui.js → app.js
// ============================================================

// ============================================================
// START: onAuthStateChange
// Supabase roept dit aan zodra de inlogstatus verandert:
// - bij laden van de pagina (sessie check)
// - na inloggen
// - na uitloggen
// - na account activeren via invite-link
// ============================================================
sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  if (sessie?.user) {
    // --- INGELOGD ---

    // Bekende valkuil: tijdens invite-flow vuurt SIGNED_IN al
    // terwijl activeerAccount() nog bezig is met wachtwoord instellen.
    // We wachten tot _inviteMode false is (wordt gezet in auth.js
    // na succesvolle activering) voordat we verder gaan.
    if (_inviteMode) {
      console.log('SIGNED_IN tijdens invite-flow — wachten op activering');
      return;
    }

    await verwerkInlog(sessie.user);
  } else {
    // --- UITGELOGD ---
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

  // Login overlay verbergen
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

  // Loginscherm tonen
  document.getElementById('authOverlay').style.display = 'flex';

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
