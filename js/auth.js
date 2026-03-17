'use strict';

// ============================================================
// auth.js — Authenticatie: login, invite-flow, uitloggen
// ============================================================

// Globale staat voor authenticatie
let _userId    = null;   // Supabase auth user id
let _klantId   = null;   // klant record id in de klanten tabel
let _klantNaam = '';     // weergavenaam voor in de header
let _bedrijfId = null;   // bedrijf_id van de klant (voor branding + RLS)

// Invite-flow staat
let _inviteMode = false;
let _inviteHash = null;

// ============================================================
// STAP 1: Detecteer invite-link direct bij laden
// Dit moet als eerste lopen, voordat onAuthStateChange vuur
// ============================================================
(function detecteerInvite() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);

  if (params.get('token_hash') && params.get('type') === 'invite') {
    _inviteHash = params.get('token_hash');
    _inviteMode = true;

    // Toon wachtwoord-scherm, verberg login-scherm
    // Script staat onderaan body, DOM is hier al klaar
    const wwOverlay = document.getElementById('wwOverlay');
    const authOverlay = document.getElementById('authOverlay');
    if (wwOverlay) wwOverlay.style.display = 'flex';
    if (authOverlay) authOverlay.style.display = 'none';

    // Hash NIET wissen — Supabase moet hem nog verwerken
    // Wordt pas gewist na succesvolle activering (zie activeerAccount)
    console.log('Invite-mode gedetecteerd');
  }
})();

// ============================================================
// LOGIN (bestaande klant)
// ============================================================
async function authLogin() {
  const emailInput = document.getElementById('authEmail');
  const passInput  = document.getElementById('authPassword');
  const btn        = document.getElementById('authBtn');
  const foutEl     = document.getElementById('authError');

  const email = emailInput.value.trim();
  const pass  = passInput.value;

  if (!email || !pass) {
    toonAuthFout('Vul e-mail en wachtwoord in.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig...';
  foutEl.style.display = 'none';

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
      console.error('Login fout:', error);
      const foutmeldingen = {
        'Invalid login credentials': 'E-mail of wachtwoord is onjuist.',
        'Email not confirmed':       'Bevestig eerst je e-mailadres via de ontvangen mail.',
        'Too many requests':         'Te veel pogingen. Wacht even en probeer opnieuw.',
      };
      toonAuthFout(foutmeldingen[error.message] || error.message);
    }
    // Bij succes: onAuthStateChange in app.js neemt het over
  } catch (err) {
    console.error('Onverwachte login fout:', err);
    toonAuthFout('Er is iets misgegaan. Probeer het opnieuw.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Inloggen';
  }
}

function toonAuthFout(tekst) {
  const foutEl = document.getElementById('authError');
  foutEl.textContent = tekst;
  foutEl.style.display = 'block';
}

// ============================================================
// ACCOUNT ACTIVEREN (nieuwe klant via invite-link)
//
// Bekende valkuil: Supabase verwerkt de token_hash soms
// automatisch bij createClient(). Daardoor is er al een sessie
// voordat wij verifyOtp aanroepen. We checken dit eerst.
// ============================================================
async function activeerAccount() {
  const ww1   = document.getElementById('wwNieuw').value;
  const ww2   = document.getElementById('wwHerhaal').value;
  const foutEl = document.getElementById('wwError');
  const btn   = document.getElementById('wwBtn');

  foutEl.textContent = '';
  foutEl.style.display = 'none';

  if (!ww1 || ww1.length < 8) {
    foutEl.textContent = 'Wachtwoord moet minimaal 8 tekens zijn';
    foutEl.style.display = 'block';
    return;
  }
  if (ww1 !== ww2) {
    foutEl.textContent = 'Wachtwoorden komen niet overeen';
    foutEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bezig...';

  try {
    // STAP A: Check of Supabase de token al automatisch verwerkt heeft
    const { data: sessieData } = await sb.auth.getSession();
    const heeftAl = !!sessieData?.session;

    if (!heeftAl && _inviteHash) {
      // Geen sessie — handmatig verifiëren via OTP
      const { error: verifyFout } = await sb.auth.verifyOtp({
        token_hash: _inviteHash,
        type: 'invite',
      });

      if (verifyFout) {
        console.error('verifyOtp fout:', verifyFout);
        foutEl.textContent = 'Activatielink is verlopen of al gebruikt. Vraag een nieuwe link aan.';
        foutEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Account activeren';
        return;
      }
    }

    // STAP B: Wachtwoord instellen
    const { error: updateFout } = await sb.auth.updateUser({ password: ww1 });

    if (updateFout) {
      console.error('updateUser fout:', updateFout);
      foutEl.textContent = 'Fout bij instellen wachtwoord: ' + updateFout.message;
      foutEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Account activeren';
      return;
    }

    // STAP C: Haal de nu-actieve sessie op en koppel auth_user_id aan klant
    const { data: nieuweSessie } = await sb.auth.getSession();
    const user = nieuweSessie?.session?.user;

    if (user?.email) {
      // Koppel auth_user_id aan het klant-record via e-mail
      // Gebruik try/catch — NIET .catch() op de Supabase query builder
      try {
        const { error: koppelFout } = await sb
          .from('klanten')
          .update({ auth_user_id: user.id })
          .eq('email', user.email)
          .is('auth_user_id', null);

        if (koppelFout) {
          console.error('Koppelen klant fout:', koppelFout);
          // Niet fataal — de klant is ingelogd, koppeling kan ook later
        }
      } catch (koppelErr) {
        console.error('Onverwachte fout bij koppelen:', koppelErr);
      }
    }

    // STAP D: Pas nu de hash wissen (na succesvolle verwerking)
    history.replaceState(null, '', window.location.pathname);
    _inviteMode = false;
    _inviteHash = null;

    // STAP E: Overlays verbergen
    document.getElementById('wwOverlay').style.display = 'none';

    // STAP F: Zelf verwerkInlog aanroepen
    // onAuthStateChange sloeg dit over omdat _inviteMode actief was
    const { data: sessieFinal } = await sb.auth.getSession();
    if (sessieFinal?.session?.user) {
      await verwerkInlog(sessieFinal.session.user);
    }

  } catch (err) {
    console.error('Onverwachte fout bij activeren:', err);
    foutEl.textContent = 'Er is iets misgegaan. Probeer het opnieuw.';
    foutEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Account activeren';
  }
}

// ============================================================
// UITLOGGEN
// ============================================================
async function uitloggen() {
  try {
    await sb.auth.signOut();
  } catch (err) {
    console.error('Uitloggen fout:', err);
  }
  // onAuthStateChange in app.js handelt de UI-reset af
}


// ============================================================
// WACHTWOORD VERGETEN
// Stuurt een reset-mail via Supabase
// ============================================================
async function wachtwoordVergeten() {
  const emailEl = document.getElementById('authEmail');
  const foutEl  = document.getElementById('authError');
  const link    = document.getElementById('wwVergetenLink');

  const email = emailEl.value.trim();

  if (!email) {
    foutEl.textContent = 'Vul eerst je e-mailadres in.';
    foutEl.style.display = 'block';
    emailEl.focus();
    return;
  }

  link.textContent = 'Bezig...';

  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://klimkeurpro.github.io/klimkeur-klant/',
    });

    if (error) {
      console.error('Wachtwoord reset fout:', error);
      foutEl.textContent = 'Fout bij versturen reset-mail. Probeer het opnieuw.';
      foutEl.style.display = 'block';
    } else {
      foutEl.style.display = 'none';
      // Toon bevestiging
      document.getElementById('wwVergetenBevestiging').style.display = 'block';
    }
  } catch (err) {
    console.error('Onverwachte fout bij wachtwoord reset:', err);
    foutEl.textContent = 'Er is iets misgegaan. Probeer het opnieuw.';
    foutEl.style.display = 'block';
  } finally {
    link.textContent = 'Wachtwoord vergeten?';
  }
}

// ============================================================
// KLANT RECORD OPHALEN na inloggen
// Geeft het klant-object terug, of null bij fout
// ============================================================
async function laadKlantRecord(userId) {
  try {
    const { data, error } = await sb
      .from('klanten')
      .select('id, bedrijf, contactpersoon, bedrijf_id, email')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Klant ophalen fout:', error);
      return null;
    }

    if (!data) {
      console.warn('Geen klant-record gevonden voor user:', userId);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Onverwachte fout bij klant ophalen:', err);
    return null;
  }
}
