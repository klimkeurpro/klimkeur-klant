'use strict';

// ============================================================
// app.js — DEBUG-VERSIE v2 — met getSession() fix
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
    toonWwScherm('reset', sessie?.user?.email || null);
    return;
  }

  if (sessie?.user) {
    if (_inviteMode) { toonEmailOpWwScherm(); return; }
    if (_wwFlow === 'reset') { return; }
    if (_appGeladen) { dbg('→ app al geladen — skip'); return; }
    if (_verwerkBezig) { dbg('→ verwerkInlog al bezig — skip'); return; }

    try {
      _verwerkBezig = true;

      // ── FIX: wacht tot Supabase intern klaar is ──
      // Op mobiel vuurt onAuthStateChange soms voordat de
      // token-refresh is afgerond. getSession() dwingt
      // Supabase om eerst de interne staat af te ronden.
      dbg('→ getSession() aanroepen om Supabase te laten stabiliseren...');
      const { data: gs, error: gsErr } = await sb.auth.getSession();
      if (gsErr) {
        dbg('→ getSession FOUT: ' + gsErr.message);
      }
      if (!gs?.session) {
        dbg('→ getSession gaf GEEN sessie terug — annuleren');
        _verwerkBezig = false;
        verwerkUitlog();
        return;
      }
      dbg('→ getSession OK: ' + gs.session.user.email);

      dbg('→ verwerkInlog START');
      await verwerkInlog(gs.session.user);
      _appGeladen = true;
      dbg('→ verwerkInlog KLAAR ✓');
    } catch (err) {
      dbg('→ verwerkInlog FOUT: ' + err.message);
      toonFoutScherm('Er ging iets mis bij het laden. Probeer de pagina te vernieuwen.');
    } finally {
      _verwerkBezig = false;
    }

  } else {
    if (_inviteMode) return;
    dbg('→ geen sessie — verwerkUitlog');
    verwerkUitlog();
  }
});

// ============================================================
// VERWERK INLOG
// ============================================================
async function verwerkInlog(user) {
  _userId = user.id;

  dbg('laadKlantRecord voor ' + user.email + '...');

  // Extra debug: tijdslimiet op de query
  const klantBelofte = laadKlantRecord(_userId);
  const timeoutBelofte = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT na 10 seconden')), 10000)
  );

  let klant;
  try {
    klant = await Promise.race([klantBelofte, timeoutBelofte]);
  } catch (err) {
    dbg('laadKlantRecord MISLUKT: ' + err.message);
    throw err;
  }

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
