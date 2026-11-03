// ES-DE mode (the Mac mini's game launcher: tools/esde/ starts Chrome in kiosk mode on the site with ?esde=1 and watches
// it): EXIT GAME on the title and pause menus, the SELECT + START hold (or a 2 s Esc) to leave from anywhere, no full
// screen button or Home Screen tip, no mouse pointer, the music without waiting for a tap.  Remembered for the session.
// Leaving: window.close() -- and, should the page still be here 400 ms later, about:blank#dodongo-exit, which the
// launcher watches for.
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const ESDE = (() => {
  let on = Q.get('esde') === '1';
  try {
    if (on) sessionStorage.setItem('dq.esde', '1');
    else on = sessionStorage.getItem('dq.esde') === '1';
  } catch { /* (no storage: the query alone) */ }
  return on;
})();
/** the address the launcher watches for (should the window not close) */
export const EXIT_URL = 'about:blank#dodongo-exit';
let leaving = false;
/** leave the game for the ES-DE menu (the progress is saved already: at the waystones, the stages, the duel's phases) */
export function exitToLauncher() {
  if (leaving) return;
  leaving = true;
  try { window.close(); } catch { /* */ }
  setTimeout(() => { try { location.replace(EXIT_URL); } catch { /* */ } }, 400);
}
