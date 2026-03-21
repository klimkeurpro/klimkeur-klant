// ============================================================
// scanner.js — Camera scanner voor DataMatrix, QR en barcodes
// Gebruikt html5-qrcode library
// ============================================================

let _scannerActief = false;
let _html5QrCode = null;
let _scannerDoelVeld = null; // id van het input-veld waar het resultaat in moet

/**
 * Start de camera-scanner
 * @param {string} doelVeldId — id van het input-veld voor het resultaat
 */
function openScanner(doelVeldId) {
  if (_scannerActief) return;
  _scannerDoelVeld = doelVeldId;

  // Maak overlay aan
  const overlay = document.createElement('div');
  overlay.id = 'scannerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;';

  overlay.innerHTML = `
    <div style="color:#fff;text-align:center;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px;">Scanner</div>
      <div style="font-size:13px;opacity:.7;">Richt de camera op een barcode, DataMatrix of QR-code</div>
    </div>
    <div id="scannerReader" style="width:100%;max-width:500px;border-radius:12px;overflow:hidden;"></div>
    <div id="scannerResultaat" style="color:#8BC53F;font-size:16px;font-weight:600;margin-top:16px;min-height:24px;text-align:center;"></div>
    <button onclick="sluitScanner()" style="
      margin-top:20px;padding:10px 32px;background:none;border:2px solid rgba(255,255,255,.4);
      color:#fff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;
    ">Sluiten</button>
  `;

  document.body.appendChild(overlay);

  // Start de scanner
  _html5QrCode = new Html5Qrcode('scannerReader');
  _scannerActief = true;

  _html5QrCode.start(
    { facingMode: 'environment' }, // achter-camera
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
      // Succes — code gescand
      onScanResultaat(decodedText);
    },
    (errorMessage) => {
      // Geen code gevonden in dit frame — negeren
    }
  ).catch(err => {
    console.error('Scanner starten mislukt:', err);
    const resultEl = document.getElementById('scannerResultaat');
    if (resultEl) {
      resultEl.style.color = '#E74C3C';
      resultEl.textContent = 'Camera niet beschikbaar. Controleer de machtigingen.';
    }
  });
}

/**
 * Verwerk het scan-resultaat
 */
function onScanResultaat(tekst) {
  // Toon het resultaat
  const resultEl = document.getElementById('scannerResultaat');
  if (resultEl) resultEl.textContent = '✓ ' + tekst;

  // Vul het doelveld in
  if (_scannerDoelVeld) {
    const veld = document.getElementById(_scannerDoelVeld);
    if (veld) {
      veld.value = tekst;
      // Trigger change event zodat eventuele listeners meedraaien
      veld.dispatchEvent(new Event('input', { bubbles: true }));
      veld.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Korte pauze zodat de gebruiker het resultaat ziet, dan sluiten
  setTimeout(() => sluitScanner(), 800);
}

/**
 * Sluit de scanner en ruim op
 */
function sluitScanner() {
  if (_html5QrCode && _scannerActief) {
    _html5QrCode.stop().then(() => {
      _html5QrCode.clear();
    }).catch(err => {
      console.warn('Scanner stoppen fout:', err);
    });
  }
  _scannerActief = false;
  _html5QrCode = null;
  _scannerDoelVeld = null;

  const overlay = document.getElementById('scannerOverlay');
  if (overlay) overlay.remove();
}
