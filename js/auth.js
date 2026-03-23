'use strict';

// ============================================================
// auth.js — Authenticatie voor KlantKeur
//
// Volgorde in index.html:
//   config.js → auth.js → branding.js → data.js → ui.js → app.js
//
// Dit bestand:
//   - declareert de globale staat (_userId, _klantId, etc.)
//   - detecteert invite-links bij laden
//   - regelt login, wachtwoord instellen, wachtwoord vergeten, uitloggen
//   - haalt het klantrecord op na inloggen
//
// Twee wachtwoord-flows gebruiken hetzelfde scherm:
//   'invite' — nieuwe klant activeert account via e-maillink
//   'reset'  — bestaande klant kiest nieuw wachtwoord via e-maillink
// ============================================================


// ============================================================
// GLOBALE STAAT
// Gelezen door app.js, data.js en ui.js
// ============================================================
let _userId    = null;   // Supabase auth user id
let _klantId   = null;   // id in de klanten tabel
let _klantNaam = '';     // weergavenaam voor in de header
let _bedrijfId = null;   // bedrijf_id (voor branding en RLS)

// Flow-staat
let _inviteMode = false;  // true zolang invite-activering bezig is
let _inviteHash = null;   // token_hash uit de invite-URL
let _wwFlow     = null;   // 'invite' | 'reset' | null


// ============================================================
// INVITE DETECTIE
// Loopt direct bij laden, vóór onAuthStateChange.
// Als er een invite-link is, tonen we meteen het wachtwoord-scherm.
// ============================================================
(function detecteerInvite() {
  const params = new URLSearchParams(window.location.hash.substring(1));

  if (params.get('token_hash') && params.get('type') === 'invite') {
    _inviteHash = params.get('token_hash');
    _inviteMode = true;
    _wwFlow     = 'invite';

    // Hash nog niet wissen — Supabase heeft hem nog nodig bij verifyOtp
    console.log('Invite-mode gedetecteerd');
    toonWwScherm('invite');
  }
})();


// ============================================================
// WACHTWOORD-SCHERM
// Eén scherm, twee flows. Teksten worden aangepast op basis van flow.
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

  // Reset foutmelding en velden
  if (foutEl)   { foutEl.textContent = ''; foutEl.style.display = 'none'; }
  const ww1 = document.getElementById('wwNieuw');
  const ww2 = document.getElementById('wwHerhaal');
  if (ww1) ww1.value = '';
  if (ww2) ww2.value = '';

  // Teksten per flow
  if (flow === 'invite') {
    if (titel)    titel.textContent    = 'Welkom!';
    if (sub)      sub.textContent      = 'Kies een wachtwoord om je account te activeren.';
    if (btnTekst) btnTekst.textContent = 'Account activeren';
  } else {
    if (titel)    titel.textContent    = 'Nieuw wachtwoord kiezen';
    if (sub)      sub.textContent      = 'Kies een nieuw wachtwoord voor je account.';
    if (btnTekst) btnTekst.textContent = 'Wachtwoord opslaan';
  }

  // E-mailadres tonen als we het kennen
  if (email && emailBox && emailEl) {
    emailEl.textContent    = email;
    emailBox.style.display = 'block';
  } else if (emailBox) {
    emailBox.style.display = 'none';
  }

  if (overlay) overlay.style.display = 'flex';
  if (authOvl) authOvl.style.display = 'none';
  if (ww1) setTimeout(() => ww1.focus(), 100);
}


// ============================================================
// E-MAILADRES OP WACHTWOORD-SCHERM
// Wordt aangeroepen vanuit app.js als Supabase al een sessie
// heeft aangemaakt (invite-token automatisch verwerkt).
// ============================================================
async function toonEmailOpWwScherm() {
  const emailBox = document.getElementById('wwEmailInfo');
  const emailEl  = document.getElementById('wwEmailAdres');
  if (!emailBox || !emailEl) return;

  try {
    const { data } = await sb.auth.getSession();
    const email = data?.session?.user?.email;
    if (email) {
      emailEl.textContent    = email;
      emailBox.style.display = 'block';
    }
  } catch (err) {
    console.warn('Kon e-mailadres niet ophalen:', err);
  }
}


// ============================================================
// LOGIN
// Na succesvolle login roept onAuthStateChange in app.js
// verwerkInlog aan. We doen dat hier NIET zelf om dubbele
// aanroepen te voorkomen.
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

  btn.disabled    = true;
  btn.textContent = 'Bezig...';
  foutEl.style.display = 'none';

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });

    if (error) {
      const foutmeldingen = {
        'Invalid login credentials': 'E-mail of wachtwoord is onjuist.',
        'Email not confirmed':       'Bevestig eerst je e-mailadres via de ontvangen mail.',
        'Too many requests':         'Te veel pogingen. Wacht even en probeer opnieuw.',
      };
      toonAuthFout(foutmeldingen[error.message] || error.message);
    }
    // Bij succes: onAuthStateChange (SIGNED_IN) neemt het over
  } catch (err) {
    console.error('Onverwachte login fout:', err);
    toonAuthFout('Er is iets misgegaan. Probeer het opnieuw.');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Inloggen';
  }
}

function toonAuthFout(tekst) {
  const foutEl = document.getElementById('authError');
  if (!foutEl) return;
  foutEl.textContent   = tekst;
  foutEl.style.display = 'block';
}


// ============================================================
// ACCOUNT ACTIVEREN / WACHTWOORD RESETTEN
// Eén functie voor beide flows. _wwFlow bepaalt de stappen.
// ============================================================
async function activeerAccount() {
  const ww1    = document.getElementById('wwNieuw').value;
  const ww2    = document.getElementById('wwHerhaal').value;
  const foutEl = document.getElementById('wwError');
  const btn    = document.getElementById('wwBtn');

  foutEl.textContent   = '';
  foutEl.style.display = 'none';

  if (!ww1 || ww1.length < 8) {
    foutEl.textContent   = 'Wachtwoord moet minimaal 8 tekens zijn.';
    foutEl.style.display = 'block';
    return;
  }
  if (ww1 !== ww2) {
    foutEl.textContent   = 'Wachtwoorden komen niet overeen.';
    foutEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.querySelector('#wwBtnTekst').textContent = 'Bezig...';

  try {
    // ── INVITE: verifieer token als er nog geen sessie is ──
    if (_wwFlow === 'invite') {
      const { data: sessieData } = await sb.auth.getSession();

      if (!sessieData?.session && _inviteHash) {
        const { error: verifyFout } = await sb.auth.verifyOtp({
          token_hash: _inviteHash,
          type: 'invite',
        });

        if (verifyFout) {
          console.error('verifyOtp fout:', verifyFout);
          foutEl.textContent   = 'Activatielink is verlopen of al gebruikt. Vraag een nieuwe aan bij je keurmeester.';
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
      foutEl.textContent   = 'Fout bij instellen wachtwoord: ' + updateFout.message;
      foutEl.style.display = 'block';
      resetWwKnop();
      return;
    }

    // ── INVITE: koppel auth_user_id aan klantrecord ──
    if (_wwFlow === 'invite') {
      const { data: sessieNu } = await sb.auth.getSession();
      const user = sessieNu?.session?.user;

      if (user?.email) {
        const { error: koppelFout } = await sb
          .from('klanten')
          .update({ auth_user_id: user.id })
          .eq('email', user.email.toLowerCase())
          .is('auth_user_id', null);

        if (koppelFout) {
          // Niet fataal — klant is ingelogd, koppeling kan handmatig hersteld worden
          console.error('Koppelen klant mislukt:', koppelFout);
        }
      }
    }

    // ── OPRUIMEN ──
    history.replaceState(null, '', window.location.pathname);
    _inviteHash = null;
    _inviteMode = false;
    _wwFlow     = null;

    document.getElementById('wwOverlay').style.display = 'none';

    // ── APP STARTEN ──
    // onAuthStateChange sloeg verwerkInlog over tijdens de flow.
    // We roepen het nu zelf aan.
    const { data: sessieFinal } = await sb.auth.getSession();
    if (sessieFinal?.session?.user) {
      await verwerkInlog(sessieFinal.session.user);
    }

  } catch (err) {
    console.error('Onverwachte fout bij activeren:', err);
    foutEl.textContent   = 'Er is iets misgegaan. Probeer het opnieuw.';
    foutEl.style.display = 'block';
    resetWwKnop();
  }
}

function resetWwKnop() {
  const btn     = document.getElementById('wwBtn');
  const btnTekst = document.getElementById('wwBtnTekst');
  if (btn)      btn.disabled = false;
  if (btnTekst) btnTekst.textContent = _wwFlow === 'reset' ? 'Wachtwoord opslaan' : 'Account activeren';
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
  // onAuthStateChange (met sessie === null) handelt de UI-reset af
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
    foutEl.textContent   = 'Vul eerst je e-mailadres in hierboven.';
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
      foutEl.textContent   = 'Fout bij versturen reset-mail. Probeer het opnieuw.';
      foutEl.style.display = 'block';
    } else {
      foutEl.style.display = 'none';
      document.getElementById('wwVergetenBevestiging').style.display = 'block';
    }
  } catch (err) {
    console.error('Onverwachte fout bij wachtwoord reset:', err);
    foutEl.textContent   = 'Er is iets misgegaan. Probeer het opnieuw.';
    foutEl.style.display = 'block';
  } finally {
    link.textContent = 'Wachtwoord vergeten?';
  }
}


// ============================================================
// KLANTRECORD OPHALEN
// Zoekt op auth_user_id. Geeft het klant-object terug of null.
// ============================================================
async function laadKlantRecord(userId) {
  const { data, error } = await sb
    .from('klanten')
    .select('id, bedrijf, contactpersoon, bedrijf_id, email')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Klant ophalen fout:', error);
    throw new Error(error.message);
  }

  if (!data) {
    console.warn('Geen klantrecord gevonden voor user:', userId);
  }

  return data || null;
}
