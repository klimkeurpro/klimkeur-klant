// ============================================================
// scanner.js — Camera scanner voor DataMatrix, QR en barcodes
// Gebruikt html5-qrcode library
//
// Focus & zoom: na het starten van de camera worden de capabilities
// van de video-track uitgelezen. Op basis daarvan:
//   - focusMode → 'continuous' (continu autofocus, beste voor scannen)
//   - zoom      → slider in de overlay (digitaal inzoomen op kleine codes)
//   - torch     → zaklamp-knop (betere belichting bij kleine codes)
//   - macro     → knop die focusMode op 'manual' zet + minimale
//                 focusDistance (dichtbij scherp, voor mini-codes)
//
// Alles is graceful: als de camera een feature niet ondersteunt,
// wordt de bijbehorende UI niet getoond. Geen crashes.
// ============================================================

let _scannerActief = false;
let _html5QrCode = null;
let _scannerDoelVeld = null;
let _macroActief = false;
let _torchAan = false;

/**
 * Start de camera-scanner
 * @param {string} doelVeldId — id van het input-veld voor het resultaat
 */
function openScanner(doelVeldId) {
  if (_scannerActief) return;
  _scannerDoelVeld = doelVeldId;
  _macroActief = false;
  _torchAan = false;

  // Verberg alle actieve modals zodat ze de scanner niet blokkeren
  document.querySelectorAll('.modal-overlay.active').forEach(m => {
    m.classList.add('scanner-verborgen');
    m.classList.remove('active');
  });

  // Maak overlay aan
  const overlay = document.createElement('div');
  overlay.id = 'scannerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) sluitScanner(); });

  overlay.innerHTML = `
    <div style="color:#fff;text-align:center;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px;">Scanner</div>
      <div style="font-size:13px;opacity:.7;">Richt de camera op een barcode, DataMatrix of QR-code</div>
    </div>
    <div id="scannerReader" style="width:100%;max-width:500px;border-radius:12px;overflow:hidden;"></div>

    <!-- Camera controls — worden dynamisch getoond op basis van capabilities -->
    <div id="scannerControls" style="display:none;width:100%;max-width:500px;margin-top:12px;">

      <!-- Zoom slider -->
      <div id="scannerZoomWrap" style="display:none;margin-bottom:8px;">
        <label style="color:rgba(255,255,255,.6);font-size:12px;display:flex;align-items:center;gap:8px;">
          <span>🔍</span>
          <input type="range" id="scannerZoom" style="flex:1;accent-color:#8BC53F;" value="1" step="0.1">
          <span id="scannerZoomVal" style="min-width:32px;text-align:right;font-variant-numeric:tabular-nums;">1×</span>
        </label>
      </div>

      <!-- Macro + Torch knoppen -->
      <div style="display:flex;gap:8px;justify-content:center;">
        <button type="button" id="scannerMacroBtn" onclick="_toggleMacro()" style="display:none;
          padding:8px 16px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.3);
          color:#fff;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;
          align-items:center;gap:4px;">
          🌱 Macro (dichtbij)
        </button>
        <button type="button" id="scannerTorchBtn" onclick="_toggleTorch()" style="display:none;
          padding:8px 16px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.3);
          color:#fff;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;
          align-items:center;gap:4px;">
          🔦 Zaklamp
        </button>
      </div>
    </div>

    <div id="scannerResultaat" style="color:#8BC53F;font-size:16px;font-weight:600;margin-top:16px;min-height:44px;width:100%;max-width:500px;text-align:center;display:flex;align-items:center;justify-content:center;"></div>
    <button onclick="sluitScanner()" style="
      margin-top:20px;padding:10px 32px;background:none;border:2px solid rgba(255,255,255,.4);
      color:#fff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;
    ">Sluiten</button>
  `;

  // Klik op de donkere achtergrond = sluiten
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) sluitScanner();
  });

  document.body.appendChild(overlay);

  // Start de scanner
  _html5QrCode = new Html5Qrcode('scannerReader');
  _scannerActief = true;

  _html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 280, height: 280 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
      ],
    },
    (decodedText) => {
      onScanResultaat(decodedText);
    },
    (errorMessage) => {
      // Geen code gevonden in dit frame — negeren
    }
  ).then(() => {
    // Camera draait — activeer geavanceerde controls
    _initCameraControls();
  }).catch(err => {
    console.error('Scanner starten mislukt:', err);
    // Camera niet beschikbaar — sluit scanner direct en meld het
    _html5QrCode = null;
    sluitScanner();
    alert('Camera niet beschikbaar. Controleer de machtigingen.');
  });
}

// ============================================================
// CAMERA CONTROLS — focus, zoom, torch
// ============================================================
function _initCameraControls() {
  if (!_html5QrCode) return;

  let caps;
  try {
    caps = _html5QrCode.getRunningTrackCapabilities();
  } catch (e) {
    console.warn('Camera capabilities niet beschikbaar:', e);
    return;
  }

  const controlsEl = document.getElementById('scannerControls');
  if (!controlsEl) return;

  let heeftControls = false;

  // ── Focus: zet continu-autofocus aan als dat kan ───────────
  if (caps.focusMode && caps.focusMode.includes('continuous')) {
    try {
      _html5QrCode.applyVideoConstraints({
        advanced: [{ focusMode: 'continuous' }]
      });
    } catch (e) {
      console.warn('Continuous autofocus instellen mislukt:', e);
    }
  }

  // ── Macro-knop: alleen tonen als focusDistance beschikbaar is
  if (caps.focusDistance) {
    const btn = document.getElementById('scannerMacroBtn');
    if (btn) {
      btn.style.display = 'inline-flex';
      heeftControls = true;
    }
  }

  // ── Zoom slider ─────────────────────────────────────────────
  if (caps.zoom) {
    const wrap   = document.getElementById('scannerZoomWrap');
    const slider = document.getElementById('scannerZoom');
    const valEl  = document.getElementById('scannerZoomVal');
    if (wrap && slider) {
      slider.min   = caps.zoom.min || 1;
      slider.max   = caps.zoom.max || 1;
      slider.step  = caps.zoom.step || 0.1;
      slider.value = caps.zoom.min || 1;

      slider.addEventListener('input', () => {
        const z = parseFloat(slider.value);
        if (valEl) valEl.textContent = z.toFixed(1) + '×';
        try {
          _html5QrCode.applyVideoConstraints({
            advanced: [{ zoom: z }]
          });
        } catch (e) {
          console.warn('Zoom instellen mislukt:', e);
        }
      });

      wrap.style.display = 'block';
      heeftControls = true;
    }
  }

  // ── Torch (zaklamp) ─────────────────────────────────────────
  if (caps.torch) {
    const btn = document.getElementById('scannerTorchBtn');
    if (btn) {
      btn.style.display = 'inline-flex';
      heeftControls = true;
    }
  }

  if (heeftControls) controlsEl.style.display = 'block';
}

// ============================================================
// MACRO TOGGLE
// ============================================================
function _toggleMacro() {
  if (!_html5QrCode) return;
  const btn = document.getElementById('scannerMacroBtn');

  let caps;
  try {
    caps = _html5QrCode.getRunningTrackCapabilities();
  } catch (e) { return; }

  if (!caps.focusDistance) return;

  _macroActief = !_macroActief;

  try {
    if (_macroActief) {
      _html5QrCode.applyVideoConstraints({
        advanced: [{
          focusMode: 'manual',
          focusDistance: caps.focusDistance.min
        }]
      });
      if (btn) {
        btn.style.background = 'rgba(139,197,63,.3)';
        btn.style.borderColor = '#8BC53F';
        btn.textContent = '🌱 Macro AAN';
      }
    } else {
      const mode = (caps.focusMode && caps.focusMode.includes('continuous'))
        ? 'continuous' : 'single-shot';
      _html5QrCode.applyVideoConstraints({
        advanced: [{ focusMode: mode }]
      });
      if (btn) {
        btn.style.background = 'rgba(255,255,255,.1)';
        btn.style.borderColor = 'rgba(255,255,255,.3)';
        btn.textContent = '🌱 Macro (dichtbij)';
      }
    }
  } catch (e) {
    console.warn('Focus mode wisselen mislukt:', e);
    _macroActief = !_macroActief; // rollback
  }
}

// ============================================================
// TORCH (ZAKLAMP) TOGGLE
// ============================================================
function _toggleTorch() {
  if (!_html5QrCode) return;
  const btn = document.getElementById('scannerTorchBtn');

  _torchAan = !_torchAan;

  try {
    _html5QrCode.applyVideoConstraints({
      advanced: [{ torch: _torchAan }]
    });
    if (btn) {
      btn.style.background = _torchAan ? 'rgba(255,200,50,.25)' : 'rgba(255,255,255,.1)';
      btn.style.borderColor = _torchAan ? '#FFD700' : 'rgba(255,255,255,.3)';
      btn.textContent = _torchAan ? '🔦 Zaklamp AAN' : '🔦 Zaklamp';
    }
  } catch (e) {
    console.warn('Torch schakelen mislukt:', e);
    _torchAan = !_torchAan; // rollback
  }
}

/**
 * Verwerk het scan-resultaat
 */
function onScanResultaat(tekst) {
  const resultEl = document.getElementById('scannerResultaat');
  if (resultEl) resultEl.textContent = '✓ ' + tekst;

  if (_scannerDoelVeld) {
    const veld = document.getElementById(_scannerDoelVeld);
    if (veld) {
      veld.value = tekst;
      veld.dispatchEvent(new Event('input', { bubbles: true }));
      veld.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  setTimeout(() => sluitScanner(), 800);
}

/**
 * Sluit de scanner en ruim op
 */
function sluitScanner() {
  try {
    if (_html5QrCode && _scannerActief) {
      _html5QrCode.stop().then(() => {
        _html5QrCode.clear();
      }).catch(() => {});
    }
  } catch (e) {
    // Negeer fouten — opruimen is belangrijker
  }

  _scannerActief = false;
  _html5QrCode = null;
  _scannerDoelVeld = null;
  _macroActief = false;
  _torchAan = false;

  const overlay = document.getElementById('scannerOverlay');
  if (overlay) overlay.remove();

  // Toon modals die we verborgen hadden weer
  document.querySelectorAll('.modal-overlay.scanner-verborgen').forEach(m => {
    m.classList.remove('scanner-verborgen');
    m.classList.add('active');
  });
}
