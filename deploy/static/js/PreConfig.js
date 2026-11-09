/* Deployment overrides. Never put credentials in this file. */
window.DRAWIO_PUBLIC_BUILD = true;
window.EXPORT_URL = null;
window.DRAWIO_BASE_URL = window.location.origin;
window.DRAWIO_LIGHTBOX_URL = window.location.origin;
window.DRAWIO_VIEWER_URL = window.location.origin + '/js/viewer-static.min.js';
window.DRAW_MATH_URL = 'math4/es5';
window.DRAWIO_CONFIG = { defaultFonts: ['Helvetica', 'Arial', 'Verdana', 'Times New Roman', 'Courier New'], enableAi: false };
// Enforce local storage modes even when a visitor supplies conflicting parameters.
Object.assign(urlParams, {
  lockdown: '1', sync: 'manual', gapi: '0', picker: '0', db: '0', od: '0',
  gh: '0', gl: '0', tr: '0', ms365: '0', plugins: '0', pwa: '0',
  enableSW: '0', dev: '0', channel: 'beta'
});
// Configure messages belong to hosted integrations, not this standalone editor.
delete urlParams.configure;
