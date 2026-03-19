'use strict';

// ============================================================
// auth.js — Authenticatie: login, invite-flow, reset-flow, uitloggen
//
// Dit bestand wordt geladen NA config.js (die sb aanmaakt)
// en VOOR app.js (die onAuthStateChange registreert).
//
// Twee wachtwoord-flows delen hetzelfde scherm maar met
// verschillende teksten, knoptekst en logica:
//   1. INVITE  — nieuwe klant activeert account
//   2. RESET   — bestaande klant kiest nieuw wachtwoord
// De variabele _wwFlow houdt bij welke flow actief is.
// ============================================================

// Globale staat voor authenticatie
// (worden ook gelezen door app.js, data.js, ui.js)
let _userId    = null;   // Supabase auth user id
let _klantId   = null;   // klant record id in de klanten tabel
let _klantNaam = '';     // weergavenaam voor in de header
let _bedrijfId = null;   // bedrijf_id van de klant (voor branding + RLS)

// Flow-staat
let _inviteMode = false;  // true zolang invite-activering bezig is
let _inviteHash = null;   // token_hash uit de invite-URL
let _wwFlow     = null;   // 'invite' | 'reset' | null

// ============================================================
// STAP 1: Detecteer invite-link direct bij laden
// Dit moet als eerste lopen, voordat onAuthStateChange vuurt.
// Script staat onderaan body, dus DOM is hier al klaar.
// ============================================================
(function detecteerInvite() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);

  if (params.get('token_hash') && params.get('type') === 'invite') {
    _inviteHash = params.get('token_hash');
    _inviteMode = true;
    _wwFlow = 'invite';

    // Toon wachtwoord-scherm met invite-teksten
    toonWwScherm('invite');

    // Hash NIET wissen — Supabase moet hem nog verwerken
    // Wordt pas gewist na succesvolle activering
    console.log('Invite-mode gedetecteerd');
  }
})();


// ============================================================
// WACHTWOORD-SCHERM CONFIGUREREN
// Eén scherm, twee flows. Deze functie past de teksten aan.
// ============================================================
function toonWwScherm(flow, email) {
  _wwFlow = flow;

  const overlay  = document.getElementById('wwOverlay');
  const authOvl  = document.getElementById('authOverlay');
  const titel    = document.getElementById('wwTitel');
  const sub      = document.getElementById('wwSub');
  const btnTekst = document.getElementById('wwBtnTekst');
  const emailBox = document.getElementById('wwEmailInfo');
  const emailEl  = document.getElementById('wwEmailAdres');
  const foutEl   = document.getElementById('wwError');

  // Reset foutmelding en wachtwoord-velden
  if (foutEl) { foutEl.textContent = ''; foutEl.style.display = 'none'; }
  const ww1 = document.getElementById('wwNieuw');
  const ww2 = document.getElementById('wwHerhaal');
  if (ww1) ww1.value = '';
  if (ww2) ww2.value = '';

  // Teksten per flow
  if (flow === 'invite') {
    if (titel)    titel.textContent    = 'Welkom!';
    if (sub)      sub.textContent      = 'Kies een wachtwoord om je account te activeren';
    if (btnTekst) btnTekst.textContent = 'Account activeren';
  } else if (flow === 'reset') {
    if (titel)    titel.textContent    = 'Nieuw wachtwoord kiezen';
    if (sub)      sub.textContent      = 'Kies een nieuw wachtwoord voor je account';
    if (btnTekst) btnTekst.textContent = 'Wachtwoord opslaan';
  }

  // E-mailadres tonen als we het kennen
  if (email && emailBox && emailEl) {
    emailEl.textContent = email;
    emailBox.style.display = 'block';
  } else if (emailBox) {
    emailBox.style.display = 'none';
  }

  // Overlays wisselen
  if (overlay)  overlay.style.display = 'flex';
  if (authOvl)  authOvl.style.display = 'none';

  // Focus op eerste wachtwoord-veld
  if (ww1) setTimeout(() => ww1.focus(), 100);
}


// ============================================================
// E-MAILADRES TONEN OP WACHTWOORD-SCHERM
// Probeert het e-mailadres op te halen als het nog niet
// getoond is. Wordt aangeroepen vanuit detecteerInvite en
// vanuit app.js bij PASSWORD_RECOVERY.
// ============================================================
async function toonEmailOpWwScherm() {
  const emailBox = document.getElementById('wwEmailInfo');
  const emailEl  = document.getElementById('wwEmailAdres');
  if (!emailBox || !emailEl) return;

  // Misschien heeft Supabase de token al automatisch verwerkt
  // en is er al een sessie met het e-mailadres
  try {
    const { data } = await sb.auth.getSession();
    const email = data?.session?.user?.email;
    if (email) {
      emailEl.textContent = email;
      emailBox.style.display = 'block';
    }
  } catch (err) {
    console.warn('Kon e-mailadres niet ophalen:', err);
  }
}


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
// ACCOUNT ACTIVEREN / WACHTWOORD RESETTEN
//
// Eén functie voor beide flows. De variabele _wwFlow bepaalt
// welke stappen nodig zijn:
//   - 'invite': verifyOtp + updateUser + koppel auth_user_id
//   - 'reset':  alleen updateUser (sessie bestaat al)
// ============================================================
async function activeerAccount() {
  const ww1    = document.getElementById('wwNieuw').value;
  const ww2    = document.getElementById('wwHerhaal').value;
  const foutEl = document.getElementById('wwError');
  const btn    = document.getElementById('wwBtn');

  foutEl.textContent = '';
  foutEl.style.display = 'none';

  // Validatie
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
  btn.querySelector('#wwBtnTekst').textContent = 'Bezig...';

  try {
    // ── INVITE-FLOW: verifieer de token als er nog geen sessie is ──
    if (_wwFlow === 'invite') {
      const { data: sessieData } = await sb.auth.getSession();
      const heeftAlSessie = !!sessieData?.session;

      if (!heeftAlSessie && _inviteHash) {
        // Geen sessie — handmatig verifiëren via OTP
        const { error: verifyFout } = await sb.auth.verifyOtp({
          token_hash: _inviteHash,
          type: 'invite',
        });

        if (verifyFout) {
          console.error('verifyOtp fout:', verifyFout);
          foutEl.textContent = 'Activatielink is verlopen of al gebruikt. Vraag een nieuwe aan bij je keurmeester.';
          foutEl.style.display = 'block';
          resetWwKnop();
          return;
        }
      }
    }

    // ── WACHTWOORD INSTELLEN (beide flows) ──
    const { error: updateFout } = await sb.auth.updateUser({ password: ww1 });

    if (updateFout) {
      console.error('updateUser fout:', updateFout);
      foutEl.textContent = 'Fout bij instellen wachtwoord: ' + updateFout.message;
      foutEl.style.display = 'block';
      resetWwKnop();
      return;
    }

    // ── INVITE-FLOW: koppel auth_user_id aan klantrecord ──
    if (_wwFlow === 'invite') {
      const { data: sessieNu } = await sb.auth.getSession();
      const user = sessieNu?.session?.user;

      if (user?.email) {
        try {
          const { error: koppelFout } = await sb
            .from('klanten')
            .update({ auth_user_id: user.id })
            .eq('email', user.email.toLowerCase())
            .is('auth_user_id', null);

          if (koppelFout) {
            console.error('Koppelen klant fout:', koppelFout);
            // Niet fataal — klant is ingelogd, koppeling kan later
          }
        } catch (koppelErr) {
          console.error('Onverwachte fout bij koppelen:', koppelErr);
        }
      }
    }

    // ── OPRUIMEN ──
    // Hash wissen uit de URL (na succesvolle verwerking)
    history.replaceState(null, '', window.location.pathname);
    _inviteHash = null;
    _inviteMode = false;
    _wwFlow = null;

    // Overlays verbergen
    document.getElementById('wwOverlay').style.display = 'none';

    // ── APP STARTEN ──
    // onAuthStateChange sloeg verwerkInlog over omdat _inviteMode
    // actief was (invite) of omdat het een token-refresh was (reset).
    // We roepen verwerkInlog nu zelf aan.
    const { data: sessieFinal } = await sb.auth.getSession();
    if (sessieFinal?.session?.user) {
      await verwerkInlog(sessieFinal.session.user);
    }

  } catch (err) {
    console.error('Onverwachte fout bij activeren:', err);
    foutEl.textContent = 'Er is iets misgegaan. Probeer het opnieuw.';
    foutEl.style.display = 'block';
    resetWwKnop();
  }
}

// Helper: zet de knoptekst terug naar de juiste waarde
function resetWwKnop() {
  const btn = document.getElementById('wwBtn');
  const btnTekst = document.getElementById('wwBtnTekst');
  if (btn) btn.disabled = false;
  if (btnTekst) {
    btnTekst.textContent = _wwFlow === 'reset' ? 'Wachtwoord opslaan' : 'Account activeren';
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
    foutEl.textContent = 'Vul eerst je e-mailadres in hierboven.';
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
