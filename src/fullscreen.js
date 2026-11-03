// Full screen: the corner button (#fsBtn) toggles the Fullscreen API on the page.  Where the API is missing (iPhone,
// Chrome on iPad) the button shows how to add the game to the Home Screen instead, which launches it full screen
// (assets/app/manifest.json).  Launched from the Home Screen it is full screen already, so the button hides.
import { ESDE } from './esde.js';
const doc = document, root = doc.documentElement;
const btn = doc.getElementById('fsBtn');
const enabled = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled || root.webkitRequestFullscreen);
const current = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
const launchedFull = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

function sync() { if (btn) btn.classList.toggle('on', !!current()); }

function enter() {
  try {
    // (no options for the webkit form: old WebKit reads its argument as a flags number)
    const r = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen();
    if (r && r.catch) r.catch(showTip);
  } catch (e) { showTip(); }
}
function exit() {
  const ex = doc.exitFullscreen || doc.webkitExitFullscreen;
  try { const r = ex.call(doc); if (r && r.catch) r.catch(() => {}); } catch (e) { /* already out */ }
}
export function toggleFullscreen() {
  if (!enabled()) { showTip(); return; }
  if (current()) exit(); else enter();
}

let tip = null;
function showTip() {
  if (ESDE) return;   // (ES-DE: kiosk full screen already -- no Home Screen tip)
  if (tip) { tip.remove(); tip = null; return; }
  tip = doc.createElement('div');
  tip.id = 'fsTip';
  tip.innerHTML = '<b>Full screen on iPad / iPhone</b><br>Tap <b>Share</b> &#x2B06;&#xFE0E;, then <b>Add to Home Screen</b>,<br>and open the game from its Dodongo icon.<div class="x">OK</div>';
  tip.addEventListener('pointerdown', (e) => { e.stopPropagation(); tip.remove(); tip = null; });
  doc.body.appendChild(tip);
}

if (btn) {
  if ((launchedFull() && !current()) || ESDE) btn.hidden = true;   // (ES-DE: the kiosk is full screen: no button)
  btn.addEventListener('click', (e) => { e.preventDefault(); toggleFullscreen(); });
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) doc.addEventListener(ev, () => { sync(); dispatchEvent(new Event('resize')); });
  sync();
}

// the mouse pointer hides after 2 s still while full screen (ES-DE: hidden at once, and stays hidden)
let idle = 0;
if (ESDE) root.classList.add('nocursor');
addEventListener('mousemove', () => {
  if (ESDE) return;
  root.classList.remove('nocursor');
  clearTimeout(idle);
  idle = setTimeout(() => { if (current()) root.classList.add('nocursor'); }, 2000);
});
