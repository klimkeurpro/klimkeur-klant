'use strict';

// ============================================================
// app.js — DEBUG-VERSIE v3 — setTimeout fix
// ============================================================

let _appGeladen   = false;
let _verwerkBezig = false;

function dbg(tekst) {
  console.log('[DBG]', tekst);
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

(function checkStorage() {
  try {
    const raw = localStorage.getItem('klimkeur-klant-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      const email = parsed?.user?.email || parsed?.session?.user?.email || '?';
      dbg('localStorage GEVONDEN: ' + email);
    } else {
      dbg('localStorage LEEG');
    }
  } catch (e) {
    dbg('localStorage FOUT: ' + e.message);
  }
})();

// ── onAuthStateChange ──
// BELANGRIJK: geen async werk hier! Alleen setTimeout.
sb.auth.onAuthStateChange((event, sessie) => {
  dbg('Auth event: ' + event + ' | sessie: ' + (sessie?.user?.email || 'null'));

  // setTimeout(0) breekt uit de Supabase-lock.
  // Zonder dit hangt elke Supabase-aanroep op mobiel.
  setTimeout(() => afhandelenAuthEvent(event, sessie), 0);
});

// ── De echte afhandeling, buiten de lock ──
async function afhandelenAuthEvent(event, sessie) {
  dbg('afhandelenAuthEvent: ' + event);

  if (event === 'PASSWORD_RECOVERY') {
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  if (sessie?.user) {
    if (_inviteMode) { toonEmailOpWwScherm(); return; }
    if (_wwFlow === 'reset') { return; }
    if (_appGeladen) { dbg('→ app al geladen — skip'); return; }
    if (_verwerkBezig) { dbg('→ al bezig — skip'); return; }

    try {
      _verwerkBezig = true;
      dbg('→ verwerkInlog START voor ' + sessie.user.email);
      await verwerkInlog(sessie.user);
      _appGeladen = true;
      dbg('→ verwerkInlog KLAAR ✓');
    } catch (err) {
      dbg('→ FOUT: ' + err.message);
      toonFoutScherm('Er ging iets mis bij het laden. Probeer te vernieuwen.');
    } finally {
      _verwerkBezig = false;
    }

  } else {
    if (_inviteMode) return;
    dbg('→ verwerkUitlog');
    verwerkUitlog();
  }
}

// ============================================================
// VERWERK INLOG
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  dbg('laadKlantRecord...');
  const klant = await laadKlantRecord(_userId);
  dbg('klant: ' + (klant ? klant.bedrijf : 'NULL'));

  if (!klant) {
    toonFoutScherm('Account niet gekoppeld aan klantrecord. Neem contact op met Safety Green.');
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
