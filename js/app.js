'use strict';

// ============================================================
// app.js — TIJDELIJKE DEBUG-VERSIE
// Na het vinden van het probleem vervangen we dit weer
// ============================================================

let _appGeladen   = false;
let _verwerkBezig = false;

// Debug helper — toont meldingen op het scherm
function dbg(tekst) {
  console.log('[DBG]', tekst);
  // Maak een zichtbaar debug-paneel als dat er nog niet is
  let panel = document.getElementById('dbgPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dbgPanel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow-y:auto;background:#111;color:#0f0;font:11px/1.4 monospace;padding:8px;z-index:99999;';
    document.body.appendChild(panel);
  }
  const regel = document.createElement('div');
  regel.textContent = new Date().toLocaleTimeString() + ' — ' + tekst;
  panel.appendChild(regel);
  panel.scrollTop = panel.scrollHeight;
}

// ── Check localStorage bij laden ──
(function checkStorage() {
  try {
    const raw = localStorage.getItem('klimkeur-klant-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      const email = parsed?.user?.email || parsed?.session?.user?.email || '?';
      const exp = parsed?.expires_at || parsed?.session?.expires_at || '?';
      dbg('localStorage GEVONDEN: ' + email + ', exp=' + exp);
    } else {
      dbg('localStorage LEEG — geen sessie opgeslagen');
    }
  } catch (e) {
    dbg('localStorage FOUT: ' + e.message);
  }
})();

// ── onAuthStateChange ──
sb.auth.onAuthStateChange(async (event, sessie) => {
  dbg('Auth event: ' + event + ' | sessie: ' + (sessie?.user?.email || 'null'));

  if (event === 'PASSWORD_RECOVERY') {
    dbg('→ PASSWORD_RECOVERY — toon ww-scherm');
    const email = sessie?.user?.email || null;
    toonWwScherm('reset', email);
    return;
  }

  if (sessie?.user) {
    if (_inviteMode) {
      dbg('→ invite-mode actief — skip');
      toonEmailOpWwScherm();
      return;
    }
    if (_wwFlow === 'reset') {
      dbg('→ reset-flow actief — skip');
      return;
    }
    if (_appGeladen) {
      dbg('→ app al geladen — skip');
      return;
    }
    if (_verwerkBezig) {
      dbg('→ verwerkInlog al bezig — skip');
      return;
    }

    try {
      _verwerkBezig = true;
      dbg('→ verwerkInlog START voor ' + sessie.user.email);
      await verwerkInlog(sessie.user);
      _appGeladen = true;
      dbg('→ verwerkInlog KLAAR ✓');
    } catch (err) {
      dbg('→ verwerkInlog FOUT: ' + err.message);
      toonFoutScherm('Er ging iets mis bij het laden. Probeer de pagina te vernieuwen.');
    } finally {
      _verwerkBezig = false;
    }

  } else {
    dbg('→ geen sessie — ' + (_inviteMode ? 'invite-mode, skip' : 'verwerkUitlog'));
    if (_inviteMode) return;
    verwerkUitlog();
  }
});

// ============================================================
// VERWERK INLOG
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  dbg('laadKlantRecord voor userId=' + _userId.substring(0, 8) + '...');
  const klant = await laadKlantRecord(_userId);
  dbg('klant resultaat: ' + (klant ? klant.bedrijf : 'NULL'));

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

  dbg('laadBranding...');
  await laadBranding(_bedrijfId);

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  setBadge('ok', '✓ Verbonden');

  dbg('laadArtikelen...');
  await laadArtikelen();
  dbg('laadKeuringen...');
  await laadKeuringen();
  dbg('ALLES GELADEN ✓');
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

function toonFoutScherm(bericht) {
  dbg('FOUTSCHERM: ' + bericht);
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';
  toast(bericht, 'error', 8000);
  setBadge('err', '✗ Fout');
}

function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className  = 'status-badge ' + type;
  b.textContent = tekst;
}
