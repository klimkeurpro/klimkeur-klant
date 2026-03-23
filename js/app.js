'use strict';

// Vlag om te voorkomen dat verwerkInlog dubbel loopt
let _verwerkInlogBezig = false;

sb.auth.onAuthStateChange(async (event, sessie) => {
  console.log('Auth event:', event);

  if (event === 'PASSWORD_RECOVERY') {
    const email = sessie?.user?.email || null;
    toonWwScherm('reset', email);
    return;
  }

  if (sessie?.user) {
    if (_inviteMode) {
      toonEmailOpWwScherm();
      return;
    }
    if (_wwFlow === 'reset') return;
    if (_verwerkInlogBezig) return;

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
    if (_inviteMode) return;
    verwerkUitlog();
  }
});

async function verwerkInlog(user) {
  _userId = user.id;
  toast('verwerkInlog gestart voor: ' + user.email, 'ok', 5000);

 let klant = null;
  try {
    klant = await laadKlantRecord(_userId);
    toast('klant: ' + (klant ? klant.bedrijf : 'NIET GEVONDEN'), 'ok', 5000);
  } catch(e) {
    toast('CRASH laadKlantRecord: ' + e.message, 'error', 8000);
    return;
  }
  if (!klant) {
    toonFoutScherm('Je account is nog niet gekoppeld aan een klantrecord. Neem contact op met Safety Green.');
    return;
  }

  _klantId   = klant.id;
  _klantNaam = klant.contactpersoon || klant.bedrijf || '';
  _bedrijfId = klant.bedrijf_id || null;
  toast('staat ingesteld: ' + _klantNaam, 'ok', 5000);

  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = 'Welkom, ' + (_klantNaam || '');

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'flex';

  toast('branding laden...', 'ok', 5000);
  await laadBranding(_bedrijfId);
  toast('branding geladen', 'ok', 5000);

  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';

  setBadge('ok', '✓ Verbonden');

  toast('artikelen laden...', 'ok', 5000);
  await laadArtikelen();
  toast('keuringen laden...', 'ok', 5000);
  await laadKeuringen();
  toast('klaar!', 'ok', 5000);
}

function verwerkUitlog() {
  _userId    = null;
  _klantId   = null;
  _klantNaam = '';
  _bedrijfId = null;
  _artikelen = [];
  _keuringen = [];
  _certData  = null;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  const welkomEl = document.getElementById('headerWelkom');
  if (welkomEl) welkomEl.textContent = '';

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
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('wwOverlay').style.display   = 'none';
  toast(bericht, 'error', 8000);
  setBadge('err', '✗ Fout');
  console.error('Fout bij inloggen:', bericht);
}

function setBadge(type, tekst) {
  const b = document.getElementById('statusBadge');
  if (!b) return;
  b.className   = 'status-badge ' + type;
  b.textContent = tekst;
}
