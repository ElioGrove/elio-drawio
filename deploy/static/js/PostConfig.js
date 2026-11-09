window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;
window.EXPORT_URL = null;
window.PROXY_URL = null;
window.NOTIFICATIONS_URL = null;
window.ALLOW_CUSTOM_PLUGINS = false;
Editor.enableAi = false;
Editor.enableServiceWorker = false;
Editor.prototype.appName = 'Elio Draw';

// Lockdown also hides the upstream template picker. Restore the local gallery
// without changing isOffline(), which protects all other network operations.
var elioMenusInit = Menus.prototype.init;
Menus.prototype.init = function() {
  elioMenusInit.apply(this, arguments);
  var ui = this.editorUi;
  ui.showNewDialog = function(onClose) {
    var dialog = new NewDialog(ui, false, true);
    ui.showDialog(dialog.container, 620, 460, true, true, function(cancel) {
      if (ui.sidebar != null) ui.sidebar.hideTooltip();
      if (onClose != null) onClose(cancel);
      if (cancel && ui.getCurrentFile() == null) ui.showSplash();
    });
    dialog.init();
  };
};
