(function () {
  'use strict';

  function emptyFilters() {
    return {
      q: '', minArea: '', maxArea: '', remarks: '',
      titleNumber: '', arbName: '', barangay: '', sequenceNumber: '', documents: ''
    };
  }

  var state = {
    theme: 'light',
    loggedIn: false,
    username: '',
    role: 'user',
    loginError: '',
    loginBusy: false,
    booted: false,

    authView: 'login', // login | register
    registerError: '',
    registerBusy: false,
    registerMsg: '',

    users: [],
    usersLoading: false,
    userActionBusy: null,

    view: 'home', // home | cluster | municipality | folder | admin-users
    clusters: [],
    categories: [],
    currentClusterSlug: null,
    currentMunicipalitySlug: null,
    currentFolderId: null,

    homeSearch: '',
    folderListSearch: '',
    fileListSearch: '',

    // Global search (home page)
    globalResults: [],
    globalSearching: false,
    globalSearched: false,

    // Scoped search + filters (cluster / municipality pages)
    filters: emptyFilters(),
    filterResults: [],
    filterActive: false,
    filterSearching: false,
    filterPanelOpen: false,

    // Admin-configurable filter set
    availableFilters: [],
    enabledFilters: [],
    filterSettingsBusy: false,

    activity: [],
    activityLoading: false,
    activityHasMore: false,
    activityBefore: null,
    activityUsers: [],
    activityLabels: {},
    activityTotal: 0,
    activityFilters: { user: '', action: '' },

    remarksOptions: [],
    remarksPresets: [],
    remarksUsage: {},
    removingRemark: null,
    remarksBusy: false,
    deletingFolder: false,
    addingRemarkFor: null,
    newRemarkValue: '',
    newRemarkBusy: false,
    pendingRemarkValue: '',
    libraryOpen: true,

    // Map / Google Earth
    mapTab: 'satellite',
    pinEditing: false,
    pinDraft: { lat: null, lng: null },
    pinBusy: false,
    leafletMap: null,
    leafletMarker: null,
    mapCenter: null,
    placeQuery: '',
    placeResults: [],
    placeSearching: false,
    placeSearched: false,

    folders: [],
    foldersLoading: false,
    folderDetail: null,
    folderDetailLoading: false,

    showFolderForm: false,
    folderForm: { titleNumber: '', sequenceNumber: '', name: '', location: '', totalArea: '', remarks: '' },
    folderFormBusy: false,

    pendingFiles: [], // [{ id, file, previewUrl, category, status, error }]
    uploadMsg: null,
    uploadBusy: false,
    selectedCategory: null,

    previewModal: null // { id, name, mime }
  };

  /* ===== BOOT ===== */
  function boot() {
    applyTheme(loadTheme());
    Api.getSession().then(function (data) {
      state.booted = true;
      if (data.loggedIn) {
        state.loggedIn = true;
        state.username = data.username;
        state.role = data.role || 'user';
        loadClustersThenRender();
      } else {
        render();
      }
    }).catch(function () {
      state.booted = true;
      render();
    });
  }

  function loadClustersThenRender() {
    Api.getClusters().then(function (data) {
      state.clusters = data.clusters;
      state.categories = data.categories;
      state.remarksOptions = data.remarksOptions || [];
      state.view = 'home';
      replaceHistory(); // first in-app entry: Back from here won't hit login
      render();
      if (state.role === 'admin') refreshUsers();
      loadFilterSettings();
      loadRemarks();
    }).catch(function (err) {
      toast(err.message || 'Could not load cluster data.', 'err');
      render();
    });
  }

  function applyRemarksPayload(data) {
    if (!data) return;
    if (data.options) state.remarksOptions = data.options;
    if (data.presets) state.remarksPresets = data.presets;
    if (data.usage) state.remarksUsage = data.usage;
  }

  function loadRemarks() {
    Api.getRemarks().then(applyRemarksPayload).catch(function () {});
  }

  function loadFilterSettings() {
    Api.getFilterSettings().then(function (data) {
      state.availableFilters = data.available || [];
      state.enabledFilters = data.enabled || [];
      render();
    }).catch(function () { /* filters just fall back to none */ });
  }

  function refreshUsers() {
    state.usersLoading = true;
    Api.getUsers().then(function (data) {
      state.users = data.users;
      state.usersLoading = false;
      render();
    }).catch(function (err) {
      state.usersLoading = false;
      toast(err.message || 'Could not load users.', 'err');
      render();
    });
  }

  /* ===== BROWSER HISTORY =====
     Each view change pushes an entry so the browser Back button walks back
     through the app (folder -> municipality -> cluster -> home) instead of
     leaving the site or landing on the login screen. */
  var suppressHistory = false;

  function snapshot() {
    return {
      view: state.view,
      cluster: state.currentClusterSlug,
      municipality: state.currentMunicipalitySlug,
      folder: state.currentFolderId
    };
  }

  function pushHistory() {
    if (suppressHistory) return;
    try { window.history.pushState(snapshot(), '', ''); } catch (e) {}
  }

  function replaceHistory() {
    try { window.history.replaceState(snapshot(), '', ''); } catch (e) {}
  }

  // Navigate to a view and record it in browser history.
  function go(view, opts) {
    opts = opts || {};
    state.view = view;
    if (opts.cluster !== undefined) state.currentClusterSlug = opts.cluster;
    if (opts.municipality !== undefined) state.currentMunicipalitySlug = opts.municipality;
    if (opts.folder !== undefined) state.currentFolderId = opts.folder;
    pushHistory();
    render();
    if (opts.after) opts.after();
  }

  window.addEventListener('popstate', function (e) {
    if (!state.loggedIn) return;
    var s = e.state;
    suppressHistory = true;
    if (!s || !s.view) {
      // Reached the entry before the app's first view — stay on home.
      state.view = 'home';
      replaceHistory();
      render();
    } else {
      // Files queued for one folder must never carry over into another, or
      // they could be uploaded to the wrong client's record.
      if (s.folder !== state.currentFolderId) clearPendingFiles();
      state.view = s.view;
      state.currentClusterSlug = s.cluster;
      state.currentMunicipalitySlug = s.municipality;
      state.currentFolderId = s.folder;
      resetFilters();
      render();
      if (s.view === 'municipality') loadFolders();
      if (s.view === 'folder') loadFolderDetail();
      if (s.view === 'admin-users') refreshUsers();
      if (s.view === 'activity') loadActivity(false);
    }
    suppressHistory = false;
  });

  /* ===== THEME =====
     Remembered per browser; falls back to the OS preference the first time. */
  function loadTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem('ildf-theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') return saved;
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('ildf-theme', theme); } catch (e) {}
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    render();
  }

  /* ===== ICONS =====
     Inline SVG instead of emoji: consistent weight, inherits the text
     colour, and renders identically on every OS. */
  var ICON_PATHS = {
    folder:   '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3.4a1.5 1.5 0 0 1 1.06.44L9.2 4.7h7.3A1.5 1.5 0 0 1 18 6.2v9.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15.5z"/>',
    pin:      '<path d="M10 1.8a5.7 5.7 0 0 0-5.7 5.7c0 4.2 5.7 10.7 5.7 10.7s5.7-6.5 5.7-10.7A5.7 5.7 0 0 0 10 1.8zm0 7.9a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4z"/>',
    library:  '<path d="M3 3h3v14H3zM7.5 3h3v14h-3zM12.4 3.4l2.9.8-3.6 13.5-2.9-.8z"/>',
    upload:   '<path d="M10 2.5l4.2 4.2-1.4 1.4-1.8-1.8V13h-2V6.3L7.2 8.1 5.8 6.7zM3.5 14.5h13V17h-13z"/>',
    clip:     '<path d="M13.6 5.2 7.1 11.7a1.6 1.6 0 0 0 2.3 2.3l6.9-6.9a3.2 3.2 0 0 0-4.6-4.6L4.4 10a4.8 4.8 0 0 0 6.8 6.8l6.2-6.2-1.4-1.4-6.2 6.2a2.8 2.8 0 0 1-4-4l7.3-7.3a1.2 1.2 0 0 1 1.8 1.8z"/>',
    filter:   '<path d="M2.5 4h15l-5.8 6.7v5.1l-3.4 1.7v-6.8z"/>',
    globe:    '<path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6zm5.9 7.5h-2.4a12.6 12.6 0 0 0-1.2-4.8 6.6 6.6 0 0 1 3.6 4.8zM10 3.5c.7 1 1.5 2.9 1.7 5.7H8.3C8.5 6.4 9.3 4.5 10 3.5zM4.1 9.2a6.6 6.6 0 0 1 3.6-4.8 12.6 12.6 0 0 0-1.2 4.8zm0 1.6h2.4a12.6 12.6 0 0 0 1.2 4.8 6.6 6.6 0 0 1-3.6-4.8zm5.9 5.7c-.7-1-1.5-2.9-1.7-5.7h3.4c-.2 2.8-1 4.7-1.7 5.7zm2.3-.9a12.6 12.6 0 0 0 1.2-4.8h2.4a6.6 6.6 0 0 1-3.6 4.8z"/>',
    map:      '<path d="M7.3 2.3 2.5 4.1v13.6l4.8-1.8 5.4 1.8 4.8-1.8V2.3l-4.8 1.8zm0 1.9 5.4 1.8v9.8L7.3 14z"/>',
    eye:      '<path d="M10 4.2c-4 0-7.2 2.8-8.3 5.8 1.1 3 4.3 5.8 8.3 5.8s7.2-2.8 8.3-5.8c-1.1-3-4.3-5.8-8.3-5.8zm0 9.6a3.8 3.8 0 1 1 0-7.6 3.8 3.8 0 0 1 0 7.6zm0-1.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z"/>',
    download: '<path d="M9 2.5h2v7.2l2.4-2.4 1.4 1.4L10 13.5 5.2 8.7l1.4-1.4L9 9.7zM3.5 14.5h13V17h-13z"/>',
    search:   '<path d="M8.8 2.2a6.6 6.6 0 1 0 4 11.9l3.7 3.7 1.5-1.5-3.7-3.7A6.6 6.6 0 0 0 8.8 2.2zm0 2a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2z"/>',
    file:     '<path d="M4.5 2h7l4 4v12h-11zm7 1.4V6.5h3.1z"/>',
    image:    '<path d="M2.5 3.5h15v13h-15zm2 9.5 3.2-3.9 2.3 2.7 2.4-3.1 3.6 4.3zM6.6 7.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z"/>',
    pdf:      '<path d="M4.5 2h7l4 4v12h-11zm7 1.4V6.5h3.1zM6.3 9h7.4v1.5H6.3zm0 3h7.4v1.5H6.3z"/>',
    sheet:    '<path d="M3 3.5h14v13H3zm2 2v2.5h4V5.5zm6 0v2.5h4V5.5zm-6 4v2h4v-2zm6 0v2h4v-2zm-6 3.5V15h4v-2zm6 0V15h4v-2z"/>',
    check:    '<path d="M8.1 14.3 3.5 9.7l1.5-1.5 3.1 3.1 7-7 1.5 1.5z"/>',
    circle:   '<path d="M10 3.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2zm0 1.6a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
    close:    '<path d="M15.3 6.1 11.4 10l3.9 3.9-1.4 1.4L10 11.4l-3.9 3.9-1.4-1.4L8.6 10 4.7 6.1l1.4-1.4L10 8.6l3.9-3.9z"/>',
    sun:      '<path d="M10 6.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zM9 1.5h2v3H9zm0 14h2v3H9zM1.5 9h3v2h-3zm14 0h3v2h-3zM3.6 5 5 3.6l2.1 2.1L5.7 7.2zm9.3 9.3 1.4-1.4 2.1 2.1-1.4 1.4zM14.3 5.7 16.4 3.6 17.8 5l-2.1 2.1zM3.6 15l2.1-2.1 1.4 1.4L5 15.7z"/>',
    moon:     '<path d="M16.6 12.3A7.1 7.1 0 0 1 7.7 3.4a7.3 7.3 0 1 0 8.9 8.9z"/>'
  };

  function icon(name, cls) {
    var p = ICON_PATHS[name];
    if (!p) return '';
    return '<svg class="ico-svg' + (cls ? ' ' + cls : '') + '" viewBox="0 0 20 20" ' +
      'fill="currentColor" aria-hidden="true" focusable="false">' + p + '</svg>';
  }

  /* ===== TOASTS ===== */
  function toast(message, kind) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.textContent = message;
    region.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 220);
    }, 3200);
  }

  /* ===== RENDER DISPATCH ===== */
  function render() {
    var root = document.getElementById('root');
    // Leaflet holds references to DOM nodes we are about to discard.
    if (state.leafletMap) destroyMap();
    if (!state.booted) {
      root.innerHTML = bootLoaderHtml();
      return;
    }
    if (!state.loggedIn) {
      root.innerHTML = renderLogin();
      bindLogin();
      return;
    }
    var html = renderLetterhead() + '<div class="shell">';    if (state.view === 'activity') html += renderActivity();
    else if (state.view === 'admin-users') html += renderAdminUsers();
    else if (state.view === 'folder') html += renderFolder();
    else if (state.view === 'municipality') html += renderMunicipality();
    else if (state.view === 'cluster') html += renderCluster();
    else html += renderHome();
    html += '</div>' + renderFooter();
    if (state.previewModal) html += renderPreviewModal();
    root.innerHTML = html;

    bindGlobal();
    if (state.view === 'activity') bindActivity();
    if (state.view === 'admin-users') bindAdminUsers();
    if (state.view === 'folder') bindFolder();
    if (state.view === 'municipality') bindMunicipality();
    if (state.view === 'cluster') bindCluster();
    if (state.view === 'home') bindHome();
    if (state.previewModal) bindPreviewModal();
  }

  function bootLoaderHtml() {
    return '<div class="boot-loader"><img src="/assets/logo.webp" class="boot-logo" alt="" />' +
      '<span>Loading ILDF DAR Batangas…</span></div>';
  }

  /* ===== LOGIN / REGISTER ===== */
  function renderLogin() {
    var isRegister = state.authView === 'register';
    return '' +
    '<div class="login-wrap">' +
      '<div class="login-card">' +
        '<div class="login-seal"><img src="/assets/logo.webp" alt="ILDF DAR Batangas logo" /></div>' +
        '<h1>ILDF DAR Batangas</h1>' +
        (isRegister ? renderRegisterForm() : renderLoginForm()) +
        '<div class="auth-switch">' +
          (isRegister
            ? 'Already have an account? <a href="#" id="show-login">Sign in</a>'
            : 'Need access? <a href="#" id="show-register">Request an account</a>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderLoginForm() {
    return '' +
      (state.registerMsg ? '<div class="login-success">' + escapeHtml(state.registerMsg) + '</div>' : '') +
      '<div class="field"><label for="username">Username</label>' +
        '<input id="username" type="text" autocomplete="username" placeholder="Enter username" /></div>' +
      '<div class="field"><label for="password">Password</label>' +
        '<input id="password" type="password" autocomplete="current-password" placeholder="Enter password" /></div>' +
      (state.loginError ? '<div class="login-error">' + escapeHtml(state.loginError) + '</div>' : '') +
      '<button class="btn-primary" id="login-btn" ' + (state.loginBusy ? 'disabled' : '') + '>' +
        (state.loginBusy ? 'Signing in…' : 'Sign in') +
      '</button>';
  }

  function renderRegisterForm() {
    return '' +
      '<div class="field"><label for="reg-username">Choose a username</label>' +
        '<input id="reg-username" type="text" autocomplete="username" placeholder="3-32 characters" /></div>' +
      '<div class="field"><label for="reg-password">Choose a password</label>' +
        '<input id="reg-password" type="password" autocomplete="new-password" placeholder="At least 6 characters" /></div>' +
      '<div class="field"><label for="reg-password2">Confirm password</label>' +
        '<input id="reg-password2" type="password" autocomplete="new-password" placeholder="Re-enter password" /></div>' +
      (state.registerError ? '<div class="login-error">' + escapeHtml(state.registerError) + '</div>' : '') +
      (state.registerMsg ? '<div class="login-success">' + escapeHtml(state.registerMsg) + '</div>' : '') +
      '<button class="btn-primary" id="register-btn" ' + (state.registerBusy ? 'disabled' : '') + '>' +
        (state.registerBusy ? 'Submitting…' : 'Request account') +
      '</button>' +
      '<p class="auth-note">An administrator must approve your account before you can sign in.</p>';
  }

  function bindLogin() {
    var showRegister = document.getElementById('show-register');
    if (showRegister) showRegister.addEventListener('click', function (e) {
      e.preventDefault();
      state.authView = 'register';
      state.registerError = '';
      state.registerMsg = '';
      render();
    });
    var showLogin = document.getElementById('show-login');
    if (showLogin) showLogin.addEventListener('click', function (e) {
      e.preventDefault();
      state.authView = 'login';
      state.loginError = '';
      render();
    });

    var btn = document.getElementById('login-btn');
    if (btn) {
      function attempt() {
        var u = document.getElementById('username').value.trim();
        var p = document.getElementById('password').value;
        if (!u || !p) {
          state.loginError = 'Please enter both a username and password.';
          render();
          return;
        }
        state.loginBusy = true;
        state.loginError = '';
        render();
        Api.login(u, p).then(function (data) {
          state.loggedIn = true;
          state.username = data.username;
          state.role = data.role || 'user';
          state.loginBusy = false;
          state.registerMsg = '';
          loadClustersThenRender();
        }).catch(function (err) {
          state.loginBusy = false;
          state.loginError = err.message || 'Incorrect username or password.';
          render();
        });
      }
      btn.addEventListener('click', attempt);
      document.getElementById('password').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') attempt();
      });
    }

    var regBtn = document.getElementById('register-btn');
    if (regBtn) {
      function attemptRegister() {
        var u = document.getElementById('reg-username').value.trim();
        var p = document.getElementById('reg-password').value;
        var p2 = document.getElementById('reg-password2').value;
        if (!u || !p || !p2) {
          state.registerError = 'Please fill in all fields.';
          state.registerMsg = '';
          render();
          return;
        }
        if (p !== p2) {
          state.registerError = 'Passwords do not match.';
          state.registerMsg = '';
          render();
          return;
        }
        state.registerBusy = true;
        state.registerError = '';
        state.registerMsg = '';
        render();
        Api.register(u, p).then(function (data) {
          state.registerBusy = false;
          state.registerMsg = data.message || 'Registration submitted. Await admin approval.';
          state.authView = 'login';
          render();
        }).catch(function (err) {
          state.registerBusy = false;
          state.registerError = err.message || 'Could not register.';
          render();
        });
      }
      regBtn.addEventListener('click', attemptRegister);
    }
  }

  /* ===== ADMIN: USER MANAGEMENT ===== */
  function renderAdminUsers() {
    var html = '<div class="breadcrumb"><button id="back-home-users">&larr; Back to records</button></div>';
    html += '<div class="hero"><div class="hero-eyebrow">Administration</div>' +
      '<h2>User Accounts</h2>' +
      '<p>Approve new registrations before they can sign in. Only admins can see this page.</p></div>';

    if (state.usersLoading) {
      html += '<div class="empty-state">Loading users…</div>';
      return html;
    }

    var pending = state.users.filter(function (u) { return u.status === 'pending'; });
    var others = state.users.filter(function (u) { return u.status !== 'pending'; });

    html += '<h3 class="admin-subhead">Pending approval (' + pending.length + ')</h3>';
    html += renderUserTable(pending, true);
    html += '<h3 class="admin-subhead">All other accounts</h3>';
    html += renderUserTable(others, false);
    html += '<h3 class="admin-subhead">' + icon('library') + ' Audit Trail</h3>' +
      '<div class="filter-settings">' +
        '<p class="fs-note">Every action in the portal is recorded permanently: who created each ' +
        'folder, who uploaded or deleted each document, and every sign-in.</p>' +
        '<div class="backup-actions">' +
          '<button class="btn-add" id="open-activity-btn">' + icon('library') + ' Open Activity Log</button>' +
          '<a class="btn-ghost" href="' + Api.activityCsvUrl() + '">' + icon('download') + ' Export CSV</a>' +
        '</div>' +
      '</div>';
    html += renderFilterSettings();
    html += renderBackupSection();
    return html;
  }

  /* Admin: download a complete copy of the system. */
  function renderBackupSection() {
    return '<h3 class="admin-subhead">' + icon('download') + ' Backup &amp; Export</h3>' +
      '<div class="filter-settings">' +
        '<p class="fs-note">Download a complete copy of the portal. Keep a recent backup somewhere outside Railway &mdash; ' +
        'on an office computer or a shared drive.</p>' +
        '<div class="backup-actions">' +
          '<a class="btn-add" href="/api/admin/backup">' + icon('download') + ' Download Full Backup</a>' +
          '<a class="btn-ghost" href="/api/admin/export.json">' + icon('file') + ' Records only (JSON)</a>' +
        '</div>' +
        '<div class="backup-note">' +
          '<b>Full Backup</b> is a <code>.tar.gz</code> containing the database, every uploaded document, and a manifest. ' +
          'Windows 11, 7-Zip and macOS all open it. Large libraries may take a minute to download.<br/>' +
          '<b>Records only</b> is a readable JSON file of all records &mdash; no documents, no passwords.' +
        '</div>' +
      '</div>';
  }

  /* Admin: choose which search filters every user sees. */
  function renderFilterSettings() {
    var html = '<h3 class="admin-subhead">' + icon('filter') + ' Search Filters</h3>' +
      '<div class="filter-settings">' +
        '<p class="fs-note">Tick a filter to make it available in every search bar across the portal, for all users.</p>' +
        '<div class="fs-grid">';
    (state.availableFilters || []).forEach(function (f) {
      var on = state.enabledFilters.indexOf(f.key) !== -1;
      html += '<label class="fs-item' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" class="fs-check" data-filter="' + escapeHtml(f.key) + '" ' + (on ? 'checked' : '') + ' />' +
        '<span class="fs-body"><span class="fs-label">' + escapeHtml(f.label) + '</span>' +
        '<span class="fs-help">' + escapeHtml(f.help || '') + '</span></span>' +
      '</label>';
    });
    html += '</div>' +
      '<div class="fs-actions">' +
        '<button class="btn-add" id="save-filters-btn" ' + (state.filterSettingsBusy ? 'disabled' : '') + '>' +
          (state.filterSettingsBusy ? 'Saving…' : 'Save Filter Settings') + '</button>' +
        '<span class="fs-count">' + state.enabledFilters.length + ' of ' + (state.availableFilters || []).length + ' enabled</span>' +
      '</div>' +
    '</div>';
    return html;
  }

  function renderUserTable(users, isPending) {
    if (users.length === 0) {
      return '<div class="empty-state small">' + (isPending ? 'No pending requests.' : 'No other accounts yet.') + '</div>';
    }
    var html = '<table class="admin-table"><thead><tr>' +
      '<th>Username</th><th>Role</th><th>Status</th><th>Requested</th><th></th>' +
      '</tr></thead><tbody>';
    users.forEach(function (u) {
      var busy = state.userActionBusy === u.id;
      html += '<tr data-uid="' + u.id + '">' +
        '<td>' + escapeHtml(u.username) + '</td>' +
        '<td>' + escapeHtml(u.role) + '</td>' +
        '<td><span class="status-pill status-' + escapeHtml(u.status) + '">' + escapeHtml(u.status) + '</span></td>' +
        '<td>' + escapeHtml((u.created_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
        '<td class="admin-actions">';
      if (u.status === 'pending') {
        html += '<button class="btn-small btn-approve" data-action="approve" ' + (busy ? 'disabled' : '') + '>Approve</button>' +
          '<button class="btn-small btn-reject" data-action="reject" ' + (busy ? 'disabled' : '') + '>Reject</button>';
      } else {
        html += '<button class="btn-small btn-danger" data-action="delete" ' + (busy ? 'disabled' : '') + '>Delete</button>';
      }
      html += '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function bindAdminUsers() {
    var openAct = document.getElementById('open-activity-btn');
    if (openAct) openAct.addEventListener('click', function () {
      go('activity', { after: function () { loadActivity(false); } });
    });

    var back = document.getElementById('back-home-users');
    if (back) back.addEventListener('click', function () { go('home'); });

    document.querySelectorAll('.fs-check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-filter');
        var i = state.enabledFilters.indexOf(key);
        if (cb.checked && i === -1) state.enabledFilters.push(key);
        if (!cb.checked && i !== -1) state.enabledFilters.splice(i, 1);
        render();
      });
    });

    var saveBtn = document.getElementById('save-filters-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      state.filterSettingsBusy = true;
      render();
      Api.saveFilterSettings(state.enabledFilters).then(function (data) {
        state.enabledFilters = data.enabled || [];
        state.filterSettingsBusy = false;
        toast('Filter settings saved for all users.');
        render();
      }).catch(function (err) {
        state.filterSettingsBusy = false;
        toast(err.message || 'Could not save filter settings.', 'err');
        render();
      });
    });

    document.querySelectorAll('.admin-table [data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('tr');
        var uid = parseInt(row.getAttribute('data-uid'), 10);
        var action = btn.getAttribute('data-action');
        var confirmMsg = action === 'delete' ? 'Permanently delete this account?' : null;
        if (confirmMsg && !window.confirm(confirmMsg)) return;

        state.userActionBusy = uid;
        render();

        var call = action === 'approve' ? Api.approveUser(uid)
          : action === 'reject' ? Api.rejectUser(uid)
          : Api.deleteUser(uid);

        call.then(function () {
          toast(action === 'approve' ? 'Account approved.' : action === 'reject' ? 'Account rejected.' : 'Account deleted.');
          state.userActionBusy = null;
          refreshUsers();
        }).catch(function (err) {
          state.userActionBusy = null;
          toast(err.message || 'Action failed.', 'err');
          render();
        });
      });
    });
  }

  /* ===== ADMIN: ACTIVITY LOG ===== */
  function renderActivity() {
    var html = '<div class="breadcrumb"><button id="back-home-activity">&larr; Back to records</button></div>';
    html += '<div class="hero"><div class="hero-eyebrow">Administration</div>' +
      '<h2>Activity Log</h2>' +
      '<p>A permanent record of every action taken in the portal. ' +
      (state.activityTotal ? state.activityTotal.toLocaleString() + ' entries recorded.' : '') + '</p>' +
      '<div class="search-row activity-controls">' +
        '<select id="activity-user">' +
          '<option value="">All users</option>' +
          (state.activityUsers || []).map(function (u) {
            return '<option value="' + escapeHtml(u) + '"' +
              (state.activityFilters.user === u ? ' selected' : '') + '>' + escapeHtml(u) + '</option>';
          }).join('') +
        '</select>' +
        '<select id="activity-action">' +
          '<option value="">All activity</option>' +
          [['folder', 'Folders'], ['file', 'Documents'], ['user', 'Accounts'],
           ['auth', 'Sign-ins'], ['settings', 'Settings'], ['admin', 'Backups']
          ].map(function (p) {
            return '<option value="' + p[0] + '"' +
              (state.activityFilters.action === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
          }).join('') +
        '</select>' +
        '<a class="btn-filter" href="' + Api.activityCsvUrl() + '">' + icon('download') + ' Export CSV</a>' +
      '</div>' +
    '</div>';

    html += '<div class="panel">';
    if (state.activityLoading && !state.activity.length) {
      html += '<div class="loading-note">Loading activity…</div>';
    } else if (!state.activity.length) {
      html += '<div class="empty-state"><span class="big">No activity yet</span>' +
        'Actions appear here as staff use the portal.</div>';
    } else {
      html += '<table class="admin-table activity-table"><thead><tr>' +
        '<th>When</th><th>User</th><th>Action</th><th>Details</th><th>IP</th>' +
        '</tr></thead><tbody>';
      state.activity.forEach(function (e) {
        var label = (state.activityLabels && state.activityLabels[e.action]) || e.action;
        html += '<tr>' +
          '<td class="act-when">' + escapeHtml(formatDateTime(e.created_at)) + '</td>' +
          '<td class="act-user">' + escapeHtml(e.username) + '</td>' +
          '<td><span class="act-pill act-' + escapeHtml(String(e.action).split('.')[0]) + '">' +
            escapeHtml(label) + '</span></td>' +
          '<td class="act-summary">' + escapeHtml(e.summary) + '</td>' +
          '<td class="act-ip">' + escapeHtml(e.ip || '') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      if (state.activityHasMore) {
        html += '<div class="activity-more">' +
          '<button class="btn-ghost" id="activity-more-btn" ' + (state.activityLoading ? 'disabled' : '') + '>' +
          (state.activityLoading ? 'Loading…' : 'Load older entries') + '</button></div>';
      }
    }
    return html + '</div>';
  }

  function formatDateTime(value) {
    if (!value) return '';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(value); }
  }

  function loadActivity(append) {
    state.activityLoading = true;
    if (!append) { state.activity = []; state.activityBefore = null; }
    render();
    Api.getActivity({
      user: state.activityFilters.user,
      action: state.activityFilters.action,
      before: append ? state.activityBefore : null,
      limit: 50
    }).then(function (data) {
      state.activity = append ? state.activity.concat(data.entries) : data.entries;
      state.activityHasMore = data.hasMore;
      state.activityBefore = data.nextBefore;
      state.activityUsers = data.users;
      state.activityLabels = data.labels;
      state.activityTotal = data.total;
      state.activityLoading = false;
      render();
    }).catch(function (err) {
      state.activityLoading = false;
      toast(err.message || 'Could not load the activity log.', 'err');
      render();
    });
  }

  function bindActivity() {
    var back = document.getElementById('back-home-activity');
    if (back) back.addEventListener('click', function () { go('home'); });

    var u = document.getElementById('activity-user');
    if (u) u.addEventListener('change', function (e) {
      state.activityFilters.user = e.target.value;
      loadActivity(false);
    });
    var a = document.getElementById('activity-action');
    if (a) a.addEventListener('change', function (e) {
      state.activityFilters.action = e.target.value;
      loadActivity(false);
    });
    var more = document.getElementById('activity-more-btn');
    if (more) more.addEventListener('click', function () { loadActivity(true); });
  }

  /* ===== LETTERHEAD / FOOTER ===== */
  function renderLetterhead() {
    return '' +
    '<div class="letterhead"><div class="letterhead-inner">' +
      '<div class="letterhead-logo"><img src="/assets/logo.webp" alt="ILDF DAR Batangas logo" /></div>' +
      '<div class="letterhead-text">' +
        '<p class="agency">Republic of the Philippines &middot; Department of Agrarian Reform</p>' +
        '<h1>ILDF DAR Batangas</h1>' +
      '</div>' +
      '<div class="letterhead-right">' +
        '<button class="btn-header" id="theme-btn" title="Switch between light and dark">' +
          icon(state.theme === 'dark' ? 'sun' : 'moon') +
          '<span>' + (state.theme === 'dark' ? 'Light' : 'Dark') + '</span>' +
        '</button>' +
        (state.role === 'admin' ? (
          '<button class="btn-header" id="manage-users-btn">Manage Users' +
            (pendingUserCount() > 0 ? ' <span class="badge-pending">' + pendingUserCount() + '</span>' : '') +
          '</button>'
        ) : '') +
        '<span class="who">Signed in as <b>' + escapeHtml(state.username) + '</b>' + (state.role === 'admin' ? ' (admin)' : '') + '</span>' +
        '<button class="btn-header" id="logout-btn">Log out</button>' +
      '</div>' +
    '</div></div>';
  }

  function pendingUserCount() {
    return state.users.filter(function (u) { return u.status === 'pending'; }).length;
  }

  function renderFooter() {
    return '<footer class="site-footer">ILDF DAR Batangas &middot; Department of Agrarian Reform — Batangas Provincial Office &middot; Internal municipal records system</footer>';
  }

  function bindGlobal() {
    var tb = document.getElementById('theme-btn');
    if (tb) tb.addEventListener('click', toggleTheme);
    var lb = document.getElementById('logout-btn');
    if (lb) lb.addEventListener('click', function () {
      Api.logout().then(function () {
        state.loggedIn = false;
        state.view = 'home';
        render();
      });
    });
    var mu = document.getElementById('manage-users-btn');
    if (mu) mu.addEventListener('click', function () {
      go('admin-users', { after: refreshUsers });
    });
  }

  /* ===== HOME (clusters + global search) ===== */
  function renderHome() {
    var html = '<div class="hero">' +
      '<div class="hero-eyebrow">DARMO Clusters</div>' +
      '<h2>Provincial Cluster Directory</h2>' +
      '<p>Search every record in the province, or select a cluster to browse.</p>' +
      '<div class="search-row global-search">' +
        '<input id="home-search" type="text" class="caps-input" data-ftype="text" placeholder="SEARCH ALL RECORDS — TITLE NO., ARB NAME, BARANGAY…" value="' + escapeHtml(state.homeSearch) + '" />' +
        '<button class="btn-search" id="global-search-btn">' + (state.globalSearching ? 'Searching…' : 'Search') + '</button>' +
        '<button class="btn-filter' + (state.filterPanelOpen ? ' active' : '') + '" id="toggle-filter-btn">' +
          icon('filter') + ' Filters' + (activeFilterCount() ? ' <span class="filter-count">' + activeFilterCount() + '</span>' : '') +
        '</button>' +
        (state.globalSearched ? '<button class="btn-clear" id="global-clear-btn">Clear</button>' : '') +
      '</div>' +
      (state.filterPanelOpen ? renderFilterPanel('global') : '') +
      '<div class="search-meta">Searches every cluster and municipality at once</div>' +
    '</div>';

    // Global search results take over the page when active.
    if (state.globalSearched) {
      html += '<div class="panel"><div class="panel-header"><h3>Search Results (' + state.globalResults.length + ')</h3></div>';
      if (state.globalSearching) {
        html += '<div class="loading-note">Searching…</div>';
      } else if (state.globalResults.length === 0) {
        html += '<div class="empty-state"><span class="big">No matching records</span>Try a different title number, name, or barangay.</div>';
      } else {
        html += renderResultList(state.globalResults, true);
      }
      html += '</div>';
      return html;
    }

    html += '<div class="cluster-grid">';
    state.clusters.forEach(function (c) {
      html += '<div class="cluster-card" data-cluster="' + c.slug + '">' +
        '<div class="cluster-num">Cluster ' + c.id + '</div>' +
        '<div class="cluster-count">' + c.municipalities.length + ' municipalities</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function activeFilterCount() {
    var f = state.filters, n = 0;
    ['titleNumber', 'arbName', 'barangay', 'sequenceNumber', 'remarks', 'documents'].forEach(function (k) {
      if (f[k]) n++;
    });
    if (f.minArea || f.maxArea) n++;
    return n;
  }

  // Shared result row renderer for global + filtered searches.
  function renderResultList(rows, showScope) {
    var html = '<div class="folder-list">';
    rows.forEach(function (f) {
      html += '<div class="folder-row" data-result="' + f.id + '" data-cluster="' + escapeHtml(f.cluster_slug) + '" data-municipality="' + escapeHtml(f.municipality_slug) + '">' +
        '<span class="folder-icon">' + icon('folder') + '</span>' +
        '<div class="folder-main">' +
          '<div class="folder-title">' + escapeHtml(f.title_number) + ' — ' + escapeHtml(f.name) +
            (f.remarks ? ' <span class="remark-pill remark-' + slugifyRemark(f.remarks) + '">' + escapeHtml(f.remarks) + '</span>' : '') +
          '</div>' +
          '<div class="folder-meta">' +
            (showScope && f.municipality_name ? escapeHtml(f.municipality_name) + ' &middot; Cluster ' + f.cluster_id + ' &middot; ' : '') +
            escapeHtml(f.location) + ' &middot; ' + escapeHtml(groupDigits(f.total_area)) + ' sqm &middot; ' + f.file_count + ' file(s)' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    return html + '</div>';
  }

  function slugifyRemark(r) {
    return String(r || '').toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function runGlobalSearch() {
    state.filters.q = state.homeSearch.trim();
    if (!hasAnyFilter()) {
      toast('Type something to search for, or choose a filter.', 'err');
      return;
    }
    state.globalSearching = true;
    state.globalSearched = true;
    render();
    Api.searchFolders(buildSearchParams()).then(function (data) {
      state.globalResults = data.folders;
      state.globalSearching = false;
      render();
    }).catch(function (err) {
      state.globalSearching = false;
      toast(err.message || 'Search failed.', 'err');
      render();
    });
  }

  function bindHome() {
    var search = document.getElementById('home-search');
    if (search) {
      attachFieldBehaviour(search, function (v) { state.homeSearch = v; });
      search.addEventListener('keypress', function (e) { if (e.key === 'Enter') runGlobalSearch(); });
    }
    var gbtn = document.getElementById('global-search-btn');
    if (gbtn) gbtn.addEventListener('click', runGlobalSearch);

    var tbtn = document.getElementById('toggle-filter-btn');
    if (tbtn) tbtn.addEventListener('click', function () {
      state.filterPanelOpen = !state.filterPanelOpen;
      render();
    });

    var cbtn = document.getElementById('global-clear-btn');
    if (cbtn) cbtn.addEventListener('click', function () {
      state.homeSearch = '';
      state.filters = emptyFilters();
      state.globalResults = [];
      state.globalSearched = false;
      render();
    });

    bindFilterPanel('global');

    document.querySelectorAll('.cluster-card').forEach(function (card) {
      card.addEventListener('click', function () {
        resetFilters();
        go('cluster', { cluster: card.getAttribute('data-cluster') });
      });
    });

    bindResultRows();
  }

  // Clicking any search result jumps straight into that folder.
  function bindResultRows() {
    document.querySelectorAll('[data-result]').forEach(function (row) {
      row.addEventListener('click', function () {
        state.fileListSearch = '';
        clearPendingFiles();
        state.uploadMsg = null;
        go('folder', {
          cluster: row.getAttribute('data-cluster'),
          municipality: row.getAttribute('data-municipality'),
          folder: row.getAttribute('data-result'),
          after: loadFolderDetail
        });
      });
    });
  }

  function resetFilters() {
    state.filters = emptyFilters();
    state.filterResults = [];
    state.filterActive = false;
  }

  /* ===== CLUSTER (municipalities + filtered search) ===== */
  function renderCluster() {
    var cluster = findCluster(state.currentClusterSlug);
    if (!cluster) return '<div class="empty-state">Cluster not found.</div>';

    var html = '<div class="breadcrumb"><button id="back-home">&larr; Back to clusters</button></div>';
    html += '<div class="hero">' +
      '<div class="hero-eyebrow">DARMO Office</div>' +
      '<h2>Cluster ' + cluster.id + ' &middot; ' + escapeHtml(cluster.office) + '</h2>' +
      '<p>' + cluster.municipalities.length + ' municipalities in this cluster.</p>' +
      '<div class="search-row global-search">' +
        '<input id="filter-q" class="caps-input" data-ftype="text" placeholder="SEARCH RECORDS IN THIS CLUSTER…" value="' + escapeHtml(state.filters.q) + '" />' +
        '<button class="btn-search" id="apply-filter-btn">' + (state.filterSearching ? 'Searching…' : 'Search') + '</button>' +
        '<button class="btn-filter' + (state.filterPanelOpen ? ' active' : '') + '" id="toggle-filter-btn">' +
          icon('filter') + ' Filters' + (activeFilterCount() ? ' <span class="filter-count">' + activeFilterCount() + '</span>' : '') +
        '</button>' +
      '</div>' +
      (state.filterPanelOpen ? renderFilterPanel('cluster') : '') +
    '</div>';

    if (state.filterActive) {
      html += '<div class="panel"><div class="panel-header"><h3>Results (' + state.filterResults.length + ')</h3>' +
        '<button class="btn-ghost small" id="clear-results-btn">Clear</button></div>';
      if (state.filterSearching) html += '<div class="loading-note">Searching…</div>';
      else if (state.filterResults.length === 0) html += '<div class="empty-state"><span class="big">No matching records</span>Adjust your filters and try again.</div>';
      else html += renderResultList(state.filterResults, true);
      html += '</div>';
    }

    html += '<div class="panel"><div class="panel-header"><h3>Select a Municipality</h3></div>' +
      '<div class="municipality-grid">';
    cluster.municipalities.forEach(function (m) {
      html += '<button class="municipality-btn" data-municipality="' + m.slug + '">' + icon('folder', 'ico') + '<span>' + escapeHtml(m.name) + '</span></button>';
    });
    html += '</div></div>';
    return html;
  }

  // Search + filter panel. Only renders the filters an admin has switched on.
  function renderFilterPanel(scope) {
    var enabled = state.enabledFilters || [];
    if (enabled.length === 0) {
      return '<div class="filter-panel"><div class="filter-empty">' +
        'No search filters are switched on.' +
        (state.role === 'admin' ? ' Use <b>Manage Users &rarr; Search Filters</b> to enable some.' : ' Ask an administrator to enable them.') +
        '</div></div>';
    }

    var fields = '';
    enabled.forEach(function (key) {
      var def = (state.availableFilters || []).find(function (f) { return f.key === key; });
      if (!def) return;
      if (key === 'keyword') {
        fields += '<div class="field span-2"><label for="filter-q">Keyword</label>' +
          '<input id="filter-q" class="caps-input" data-ftype="text" placeholder="TITLE NO., ARB NAME, BARANGAY…" value="' + escapeHtml(state.filters.q) + '" /></div>';
      } else if (key === 'area') {
        fields += '<div class="field"><label for="filter-min">Min Area (sqm)</label>' +
            '<input id="filter-min" data-ftype="amount" inputmode="numeric" placeholder="0" value="' + escapeHtml(state.filters.minArea) + '" /></div>' +
          '<div class="field"><label for="filter-max">Max Area (sqm)</label>' +
            '<input id="filter-max" data-ftype="amount" inputmode="numeric" placeholder="Any" value="' + escapeHtml(state.filters.maxArea) + '" /></div>';
      } else if (key === 'remarks') {
        fields += selectField('filter-remarks', 'Remarks', state.filters.remarks, state.remarksOptions, 'ANY REMARK');
      } else if (key === 'documents') {
        fields += '<div class="field"><label for="filter-documents">Document Status</label>' +
          '<select id="filter-documents">' +
            '<option value="">ANY</option>' +
            '<option value="with"' + (state.filters.documents === 'with' ? ' selected' : '') + '>WITH DOCUMENTS</option>' +
            '<option value="without"' + (state.filters.documents === 'without' ? ' selected' : '') + '>WITHOUT DOCUMENTS</option>' +
          '</select></div>';
      } else {
        var type = def.type === 'digits' ? 'digits' : 'text';
        fields += '<div class="field"><label for="filter-' + key + '">' + escapeHtml(def.label) + '</label>' +
          '<input id="filter-' + key + '" data-fkey="' + key + '"' +
            (type === 'text' ? ' class="caps-input"' : ' inputmode="numeric"') +
            ' data-ftype="' + type + '" placeholder="' + escapeHtml((def.help || '').toUpperCase()) + '" value="' + escapeHtml(state.filters[key] || '') + '" /></div>';
      }
    });

    return '<div class="filter-panel" data-scope="' + scope + '">' +
      '<div class="filter-grid">' + fields + '</div>' +
      '<div class="filter-actions">' +
        '<button class="btn-add" id="apply-filter-btn">' + (state.filterSearching ? 'Searching…' : 'Apply Filters') + '</button>' +
        '<button class="btn-ghost" id="reset-filter-btn">Reset</button>' +
      '</div>' +
    '</div>';
  }

  function bindFilterPanel(scope) {
    attachFieldBehaviour(document.getElementById('filter-q'), function (v) { state.filters.q = v; });
    attachFieldBehaviour(document.getElementById('filter-min'), function (v) { state.filters.minArea = v; });
    attachFieldBehaviour(document.getElementById('filter-max'), function (v) { state.filters.maxArea = v; });

    // Field-specific text filters (title number, ARB name, barangay, sequence).
    document.querySelectorAll('[data-fkey]').forEach(function (el) {
      var key = el.getAttribute('data-fkey');
      attachFieldBehaviour(el, function (v) { state.filters[key] = v; });
    });

    var rem = document.getElementById('filter-remarks');
    if (rem) rem.addEventListener('change', function (e) { state.filters.remarks = e.target.value; });
    var docs = document.getElementById('filter-documents');
    if (docs) docs.addEventListener('change', function (e) { state.filters.documents = e.target.value; });

    var apply = document.getElementById('apply-filter-btn');
    if (apply) apply.addEventListener('click', function () { runFilterSearch(scope); });
    var reset = document.getElementById('reset-filter-btn');
    if (reset) reset.addEventListener('click', function () {
      state.filters = emptyFilters();
      state.filterResults = [];
      state.filterActive = false;
      render();
    });

    var q = document.getElementById('filter-q');
    if (q) q.addEventListener('keypress', function (e) { if (e.key === 'Enter') runFilterSearch(scope); });
  }

  function buildSearchParams() {
    var f = state.filters;
    return {
      q: f.q,
      minArea: stripCommas(f.minArea),
      maxArea: stripCommas(f.maxArea),
      remarks: f.remarks,
      titleNumber: f.titleNumber,
      arbName: f.arbName,
      barangay: f.barangay,
      sequenceNumber: f.sequenceNumber,
      documents: f.documents
    };
  }

  function hasAnyFilter() {
    var p = buildSearchParams();
    return Object.keys(p).some(function (k) { return p[k]; });
  }

  function runFilterSearch(scope) {
    if (scope === 'global') { runGlobalSearch(); return; }
    if (!hasAnyFilter()) {
      toast('Enter a keyword or choose at least one filter.', 'err');
      return;
    }
    var params = buildSearchParams();
    params.cluster = state.currentClusterSlug;
    if (scope === 'municipality') params.municipality = state.currentMunicipalitySlug;

    state.filterSearching = true;
    state.filterActive = true;
    render();
    Api.searchFolders(params).then(function (data) {
      state.filterResults = data.folders;
      state.filterSearching = false;
      render();
    }).catch(function (err) {
      state.filterSearching = false;
      toast(err.message || 'Search failed.', 'err');
      render();
    });
  }

  function bindCluster() {
    var back = document.getElementById('back-home');
    if (back) back.addEventListener('click', function () { resetFilters(); go('home'); });

    var tbtn = document.getElementById('toggle-filter-btn');
    if (tbtn) tbtn.addEventListener('click', function () {
      state.filterPanelOpen = !state.filterPanelOpen;
      render();
    });
    var clr = document.getElementById('clear-results-btn');
    if (clr) clr.addEventListener('click', function () { resetFilters(); render(); });

    bindFilterPanel('cluster');
    bindResultRows();

    document.querySelectorAll('.municipality-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.folderListSearch = '';
        state.showFolderForm = false;
        resetFilters();
        go('municipality', {
          municipality: btn.getAttribute('data-municipality'),
          after: loadFolders
        });
      });
    });
  }

  /* ===== MUNICIPALITY (folders) ===== */
  function loadFolders() {
    state.foldersLoading = true;
    render();
    Api.getFolders(state.currentClusterSlug, state.currentMunicipalitySlug).then(function (data) {
      state.folders = data.folders;
      state.foldersLoading = false;
      render();
    }).catch(function (err) {
      state.foldersLoading = false;
      toast(err.message || 'Could not load folders.', 'err');
      render();
    });
  }

  function renderMunicipality() {
    var cluster = findCluster(state.currentClusterSlug);
    if (!cluster) return '<div class="empty-state">Cluster not found.</div>';
    var muni = cluster.municipalities.find(function (m) { return m.slug === state.currentMunicipalitySlug; });
    if (!muni) return '<div class="empty-state">Municipality not found.</div>';

    var html = '<div class="breadcrumb"><button id="back-cluster">&larr; Back to Cluster ' + cluster.id + '</button></div>';
    html += '<div class="hero"><h2>' + escapeHtml(muni.name) + '</h2></div>';

    html += '<div class="cluster-details-panel">' +
      '<div class="detail-header">Municipal Office Information</div>' +
      '<div class="detail-row"><span class="detail-label">Cluster</span><span class="detail-value">Cluster ' + cluster.id + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">DARMO Office</span><span class="detail-value">' + escapeHtml(muni.office) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Email Address</span><span class="detail-value">' + escapeHtml(muni.email) + '</span></div>' +
      '<div class="detail-row last"><span class="detail-label">Address</span><span class="detail-value">' + escapeHtml(muni.address) + '</span></div>' +
    '</div>';

    html += '<div class="upload-section">' +
      '<div class="upload-title">' + icon('folder') + ' Create New Title Folder</div>' +
      '<div class="grid-2">' +
        field('title-number', 'Title Number', state.folderForm.titleNumber, '', 'text') +
        field('seq-number', 'Sequence Number', state.folderForm.sequenceNumber, '', 'digits') +
        field('folder-name', 'ARB / Landholder Name', state.folderForm.name, '', 'text') +
        field('folder-location', 'Barangay', state.folderForm.location, '', 'text') +
        field('folder-area', 'Total Area (sqm)', state.folderForm.totalArea, '', 'amount') +
        remarksSelect('folder-remarks', 'Remarks', state.folderForm.remarks, '— NO REMARKS —', 'form') +
      '</div>' +
      '<div class="form-actions">' +
        '<button class="btn-add" id="create-folder-btn" ' + (state.folderFormBusy ? 'disabled' : '') + '>' + (state.folderFormBusy ? 'Creating…' : 'Create Folder') + '</button>' +
      '</div>' +
    '</div>';

    // When a filter is applied, the list below IS the filtered set — the
    // unfiltered folders are hidden so results aren't shown twice.
    var listRows = state.filterActive ? state.filterResults : state.folders;
    var listLabel = state.filterActive
      ? 'Filtered Results (' + state.filterResults.length + ' of ' + state.folders.length + ')'
      : 'Title Folders (' + state.folders.length + ')';

    html += '<div class="panel"><div class="panel-header"><h3>' + icon('folder') + ' ' + listLabel + '</h3>' +
      (state.filterActive ? '<button class="btn-ghost small" id="clear-results-btn">' + icon('close') + ' Clear filters</button>' : '') +
      '<div class="local-search">' +
        '<input id="folder-search" class="caps-input" data-ftype="text" placeholder="SEARCH FOLDERS…" value="' + escapeHtml(state.folderListSearch) + '" />' +
        '<button class="btn-filter small' + (state.filterPanelOpen ? ' active' : '') + '" id="toggle-filter-btn">' +
          icon('filter') + ' Filters' + (activeFilterCount() ? ' <span class="filter-count">' + activeFilterCount() + '</span>' : '') +
        '</button>' +
        '<a class="btn-filter small" href="' + Api.batchKmlUrl(state.currentClusterSlug, state.currentMunicipalitySlug) + '" title="Download all pinned parcels in this municipality for Google Earth">' + icon('globe') + ' KML</a>' +
      '</div>' +
    '</div>';

    if (state.filterPanelOpen) html += renderFilterPanel('municipality');

    if (state.foldersLoading || state.filterSearching) {
      html += '<div class="loading-note">' + (state.filterSearching ? 'Searching…' : 'Loading folders…') + '</div>';
    } else {
      var q = state.folderListSearch.toLowerCase();
      var filtered = listRows.filter(function (f) {
        return (f.title_number + ' ' + f.name + ' ' + f.location).toLowerCase().includes(q);
      });
      if (filtered.length === 0) {
        html += state.filterActive
          ? '<div class="empty-state"><span class="big">No matching records</span>No folder here matches those filters. Adjust them or clear the filters.</div>'
          : '<div class="empty-state"><span class="big">No folders yet</span>Create the first title folder above.</div>';
      } else {
        html += '<div class="folder-list">';
        filtered.forEach(function (f) {
          html += '<div class="folder-row" data-folder="' + f.id + '">' +
            '<span class="folder-icon">' + icon('folder') + '</span>' +
            '<div class="folder-main">' +
              '<div class="folder-title">' + escapeHtml(f.title_number) + ' — ' + escapeHtml(f.name) +
                (f.remarks ? ' <span class="remark-pill remark-' + slugifyRemark(f.remarks) + '">' + escapeHtml(f.remarks) + '</span>' : '') +
              '</div>' +
              '<div class="folder-meta">' + escapeHtml(f.location) + ' &middot; ' + escapeHtml(groupDigits(f.total_area)) + ' sqm &middot; ' + f.file_count + ' file(s)</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  /* ===== FORM FIELD HELPERS =====
     type: 'text'   -> auto-uppercases as you type
           'digits' -> numbers only
           'amount' -> numbers only, live comma grouping (1000 -> 1,000) */
  function field(id, label, value, placeholder, type) {
    type = type || 'text';
    return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<input id="' + id + '" data-ftype="' + type + '"' +
        (type === 'text' ? ' class="caps-input"' : '') +
        (type !== 'text' ? ' inputmode="numeric"' : '') +
        ' placeholder="' + escapeHtml(placeholder || '') + '" value="' + escapeHtml(value) + '" /></div>';
  }

  /* A remarks dropdown plus an "+ Add new remark…" choice. Choosing that
     reveals a small inline box; whatever is added is saved to the shared
     list so it appears in the dropdown for every user from then on. */
  function remarksSelect(id, label, value, placeholder, ctx) {
    var html = '<div class="field remarks-field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<select id="' + id + '" data-remarkctx="' + ctx + '">' +
        '<option value="">' + escapeHtml(placeholder || '— NO REMARKS —') + '</option>' +
        state.remarksOptions.map(function (o) {
          return '<option value="' + escapeHtml(o) + '"' + (value === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>';
        }).join('') +
        '<option value="__new__">+ Add or delete remarks…</option>' +
      '</select>';

    if (state.addingRemarkFor === ctx) {
      html += '<div class="remark-manage">' +
        '<div class="rm-head">Manage remarks</div>' +
        renderRemarkManageList() +
        '<div class="new-remark-box">' +
          '<input id="new-remark-input" class="caps-input" data-ftype="text" autocomplete="off" ' +
            'placeholder="NAME OF THE NEW REMARK" value="' + escapeHtml(state.newRemarkValue || '') + '" ' +
            (state.newRemarkBusy ? 'disabled' : '') + ' />' +
          '<button class="btn-mini gold" id="confirm-new-remark" ' + (state.newRemarkBusy ? 'disabled' : '') + '>' +
            (state.newRemarkBusy ? 'Saving…' : 'Add') + '</button>' +
          '<button class="btn-mini" id="cancel-new-remark">Close</button>' +
        '</div>' +
        '<div class="new-remark-note">Anything added here appears in the remarks list for every user.</div>' +
      '</div>';
    }
    return html + '</div>';
  }

  /* The list of existing remarks inside the manage panel, each with a
     delete button. Built-in remarks and ones already in use are protected. */
  function renderRemarkManageList() {
    if (!state.remarksOptions.length) return '';
    var isAdmin = state.role === 'admin';
    var html = '<div class="rm-list">';
    state.remarksOptions.forEach(function (o) {
      var isPreset = (state.remarksPresets || []).indexOf(o) !== -1;
      var used = (state.remarksUsage || {})[o] || 0;
      var busy = state.removingRemark === o;
      var reason = isPreset ? 'Built-in remark — cannot be deleted'
        : used ? 'Used by ' + used + ' record(s)'
        : !isAdmin ? 'Only an administrator can delete remarks'
        : '';

      html += '<div class="rm-item">' +
        '<span class="rm-name">' + escapeHtml(o) + '</span>' +
        (used ? '<span class="rm-used">' + used + ' in use</span>' : '') +
        (isPreset ? '<span class="rm-tag">built-in</span>' : '') +
        (reason
          ? '<span class="rm-lock" title="' + escapeHtml(reason) + '">&mdash;</span>'
          : '<button class="rm-del" data-delremark="' + escapeHtml(o) + '" ' + (busy ? 'disabled' : '') +
            ' title="Delete this remark">' + (busy ? '…' : icon('close')) + '</button>') +
      '</div>';
    });
    return html + '</div>';
  }

  /* Wires a remarks dropdown. onPick receives the chosen value. */
  function bindRemarksSelect(id, ctx, onPick) {
    var sel = document.getElementById(id);
    if (sel) sel.addEventListener('change', function (e) {
      if (e.target.value === '__new__') {
        state.addingRemarkFor = ctx;
        state.newRemarkValue = '';
        e.target.value = state.pendingRemarkValue || '';
        render();
        return;
      }
      state.pendingRemarkValue = e.target.value;
      onPick(e.target.value);
    });

    if (state.addingRemarkFor !== ctx) return;

    var input = document.getElementById('new-remark-input');
    attachFieldBehaviour(input, function (v) { state.newRemarkValue = v; });

    function confirmAdd() {
      var val = (state.newRemarkValue || '').toUpperCase().trim();
      if (!val) { toast('Type a name for the new remark.', 'err'); return; }
      state.newRemarkBusy = true;
      render();
      Api.addRemarkOption(val).then(function (data) {
        applyRemarksPayload(data);
        state.newRemarkBusy = false;
        state.newRemarkValue = '';
        state.pendingRemarkValue = data.value;
        onPick(data.value); // select the new remark straight away
        toast('"' + data.value + '" added to the remarks list.');
        render();
      }).catch(function (err) {
        state.newRemarkBusy = false;
        toast(err.message || 'Could not add that remark.', 'err');
        render();
      });
    }

    var ok = document.getElementById('confirm-new-remark');
    if (ok) ok.addEventListener('click', confirmAdd);
    if (input) input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); }
    });
    var cancel = document.getElementById('cancel-new-remark');
    if (cancel) cancel.addEventListener('click', function () {
      state.addingRemarkFor = null;
      state.newRemarkValue = '';
      render();
    });

    document.querySelectorAll('[data-delremark]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-delremark');
        if (!window.confirm('Delete the remark "' + val + '" from the list?')) return;
        state.removingRemark = val;
        render();
        Api.deleteRemarkOption(val).then(function (data) {
          applyRemarksPayload(data);
          state.removingRemark = null;
          // If the deleted remark was selected here, clear the selection.
          if (state.pendingRemarkValue === val) {
            state.pendingRemarkValue = '';
            onPick('');
          }
          toast('"' + val + '" removed from the remarks list.');
          render();
        }).catch(function (err) {
          state.removingRemark = null;
          toast(err.message || 'Could not delete that remark.', 'err');
          render();
        });
      });
    });
  }

  function selectField(id, label, value, options, placeholder) {
    var html = '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<select id="' + id + '">' +
      '<option value="">' + escapeHtml(placeholder || '— None —') + '</option>';
    options.forEach(function (o) {
      html += '<option value="' + escapeHtml(o) + '"' + (value === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>';
    });
    return html + '</select></div>';
  }

  // Digits only, with thousands separators. "1000" -> "1,000"
  function groupDigits(raw) {
    var digits = String(raw).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function stripCommas(v) {
    return String(v || '').replace(/,/g, '');
  }

  // Attaches the caps / digits / comma behaviour to an input and keeps the
  // caret in a sensible place while reformatting.
  function attachFieldBehaviour(el, onValue) {
    if (!el) return;
    var type = el.getAttribute('data-ftype') || 'text';
    el.addEventListener('input', function (e) {
      var v = e.target.value;
      if (type === 'text') {
        var caret = e.target.selectionStart;
        v = v.toUpperCase();
        e.target.value = v;
        try { e.target.setSelectionRange(caret, caret); } catch (_) {}
      } else if (type === 'digits') {
        v = v.replace(/[^0-9]/g, '');
        e.target.value = v;
      } else if (type === 'amount') {
        var before = e.target.value;
        var caretPos = e.target.selectionStart;
        var digitsBeforeCaret = before.slice(0, caretPos).replace(/[^0-9]/g, '').length;
        v = groupDigits(before);
        e.target.value = v;
        // Re-place the caret after the same number of digits.
        var seen = 0, newPos = v.length;
        for (var i = 0; i < v.length; i++) {
          if (/[0-9]/.test(v[i])) seen++;
          if (seen === digitsBeforeCaret) { newPos = i + 1; break; }
        }
        if (digitsBeforeCaret === 0) newPos = 0;
        try { e.target.setSelectionRange(newPos, newPos); } catch (_) {}
      }
      if (onValue) onValue(v);
    });
  }

  function bindMunicipality() {
    var back = document.getElementById('back-cluster');
    if (back) back.addEventListener('click', function () { resetFilters(); go('cluster'); });

    var tbtn = document.getElementById('toggle-filter-btn');
    if (tbtn) tbtn.addEventListener('click', function () {
      state.filterPanelOpen = !state.filterPanelOpen;
      render();
    });
    var clr = document.getElementById('clear-results-btn');
    if (clr) clr.addEventListener('click', function () { resetFilters(); render(); });

    bindFilterPanel('municipality');
    bindResultRows();

    var inputs = [
      { id: 'title-number', key: 'titleNumber' },
      { id: 'seq-number', key: 'sequenceNumber' },
      { id: 'folder-name', key: 'name' },
      { id: 'folder-location', key: 'location' },
      { id: 'folder-area', key: 'totalArea' }
    ];
    inputs.forEach(function (inp) {
      var el = document.getElementById(inp.id);
      attachFieldBehaviour(el, function (v) { state.folderForm[inp.key] = v; });
    });

    bindRemarksSelect('folder-remarks', 'form', function (v) {
      state.folderForm.remarks = v;
    });

    var createBtn = document.getElementById('create-folder-btn');
    if (createBtn) createBtn.addEventListener('click', function () {
      var f = state.folderForm;
      if (!f.titleNumber || !f.sequenceNumber || !f.name || !f.location || !f.totalArea) {
        toast('Please fill in all folder details.', 'err');
        return;
      }
      state.folderFormBusy = true;
      render();
      Api.createFolder({
        clusterSlug: state.currentClusterSlug,
        municipalitySlug: state.currentMunicipalitySlug,
        titleNumber: f.titleNumber,
        sequenceNumber: f.sequenceNumber,
        name: f.name,
        location: f.location,
        totalArea: stripCommas(f.totalArea),
        remarks: f.remarks
      }).then(function () {
        state.folderFormBusy = false;
        state.folderForm = { titleNumber: '', sequenceNumber: '', name: '', location: '', totalArea: '', remarks: '' };
        toast('Folder created.');
        loadFolders();
      }).catch(function (err) {
        state.folderFormBusy = false;
        toast(err.message || 'Could not create folder.', 'err');
        render();
      });
    });

    var search = document.getElementById('folder-search');
    if (search) {
      attachFieldBehaviour(search);
      search.addEventListener('input', function (e) { state.folderListSearch = e.target.value; render(); });
    }

    document.querySelectorAll('.folder-row[data-folder]').forEach(function (row) {
      row.addEventListener('click', function () {
        state.fileListSearch = '';
        clearPendingFiles();
        state.uploadMsg = null;
        go('folder', { folder: row.getAttribute('data-folder'), after: loadFolderDetail });
      });
    });
  }

  /* ===== FOLDER (files) ===== */
  function loadFolderDetail() {
    state.folderDetailLoading = true;
    render();
    Api.getFolder(state.currentFolderId).then(function (data) {
      state.folderDetail = data;
      state.folderDetailLoading = false;
      render();
    }).catch(function (err) {
      state.folderDetailLoading = false;
      toast(err.message || 'Could not load folder.', 'err');
      render();
    });
  }

  function renderFolder() {
    if (state.folderDetailLoading || !state.folderDetail) {
      return '<div class="loading-note">Loading folder…</div>';
    }
    var d = state.folderDetail;
    var folder = d.folder, files = d.files || [], muni = d.municipality;
    var backText = muni ? escapeHtml(muni.name) : 'municipality';

    var html = '<div class="breadcrumb"><button id="back-municipality">&larr; Back to ' + backText + '</button></div>';
    html += '<div class="hero"><h2>' + escapeHtml(folder.title_number) + '</h2>' +
      '<p>' + escapeHtml(folder.name) + ' &middot; ' + escapeHtml(folder.location) + ' &middot; ' + escapeHtml(groupDigits(folder.total_area)) + ' sqm</p></div>';

    // ---- Record details + remarks editor ----
    html += '<div class="cluster-details-panel">' +
      '<div class="detail-header">Record Details</div>' +
      '<div class="detail-row"><span class="detail-label">Sequence No.</span><span class="detail-value">' + escapeHtml(folder.sequence_number) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Barangay</span><span class="detail-value">' + escapeHtml(folder.location) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Total Area</span><span class="detail-value">' + escapeHtml(groupDigits(folder.total_area)) + ' sqm</span></div>' +
      '<div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">' +
        escapeHtml(formatDate(folder.created_at)) +
        (folder.created_by_name ? ' by <b>' + escapeHtml(folder.created_by_name) + '</b>' : '') +
      '</span></div>' +
      '<div class="detail-row last"><span class="detail-label">Remarks</span><span class="detail-value">' +
        '<span class="remarks-edit' + (state.remarksBusy ? ' busy' : '') + '">' +
          remarksSelect('folder-remarks-edit', '', folder.remarks || '', '— NO REMARKS —', 'detail') +
        '</span>' +
        (folder.remarks ? ' <span class="remark-pill remark-' + slugifyRemark(folder.remarks) + '">' + escapeHtml(folder.remarks) + '</span>' : '') +
      '</span></div>' +
    '</div>';

    // ---- Location / map ----
    html += renderMapPanel(folder);

    // ---- Upload / document form ----
    var selectedCat = state.selectedCategory || '';
    var queue = state.pendingFiles;
    var busy = state.uploadBusy;

    html += '<div class="upload-section doc-form">' +
      '<div class="upload-title">' + icon('upload') + ' Add Documents</div>' +
      '<div class="doc-form-grid">' +
        '<div class="doc-form-col">' +
          '<div class="step-label"><span class="step-num">1</span> Choose the document form</div>' +
          '<div class="field"><select id="doc-category" class="doc-select" size="1" ' + (busy ? 'disabled' : '') + '>' +
            '<option value="">— SELECT DOCUMENT FORM —</option>' +
            state.categories.map(function (c) {
              return '<option value="' + escapeHtml(c) + '"' + (selectedCat === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
            }).join('') +
          '</select></div>' +
          (selectedCat
            ? '<div class="selected-cat">New files will be filed under: <b>' + escapeHtml(selectedCat) + '</b></div>'
            : '<div class="selected-cat muted">Pick a form first — every file you add will be filed under it. You can change each one below.</div>') +
        '</div>' +
        '<div class="doc-form-col">' +
          '<div class="step-label"><span class="step-num">2</span> Attach files</div>' +
          '<div class="file-input-wrap' + (busy ? ' is-busy' : '') + '" id="drop-zone">' +
            '<div class="drop-ico">' + icon('clip') + '</div>' +
            '<div class="drop-main">Click to browse, or drop several files here</div>' +
            '<input type="file" id="file-input" multiple ' + (busy ? 'disabled' : '') + ' />' +
            '<div class="file-chosen">Select as many as you need &middot; ' + MAX_BATCH + ' per batch &middot; 25MB each</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      renderUploadQueue(queue, busy) +
      (state.uploadMsg ? ('<div class="inline-msg ' + state.uploadMsg.type + '">' + escapeHtml(state.uploadMsg.text) + '</div>') : '') +
    '</div>';

    // ---- Document library ----
    html += renderLibrary(files);

    // ---- Admin: delete this folder ----
    if (state.role === 'admin') {
      html += '<div class="danger-zone">' +
        '<div class="dz-text">' +
          '<div class="dz-title">Delete this folder</div>' +
          '<div class="dz-sub">Removes ' + escapeHtml(folder.title_number) +
            ' and its ' + files.length + ' document(s) permanently. This cannot be undone.</div>' +
        '</div>' +
        '<button class="btn-danger-solid" id="delete-folder-btn" ' + (state.deletingFolder ? 'disabled' : '') + '>' +
          (state.deletingFolder ? 'Deleting…' : 'Delete folder') +
        '</button>' +
      '</div>';
    }

    return html;
  }

  /* ===== MULTI-FILE UPLOAD QUEUE =====
     Files are staged here first, each with its own document form, then
     uploaded one at a time. Sequential rather than one giant request so that:
     each file keeps its own 25MB limit, progress is visible, and a single
     failure leaves the rest of the batch intact and retryable. */
  var MAX_BATCH = 30;

  function renderUploadQueue(queue, busy) {
    if (!queue.length) return '';

    var waiting = queue.filter(function (q) { return q.status !== 'done'; });
    var missingForm = waiting.filter(function (q) { return !q.category; }).length;
    var doneCount = queue.filter(function (q) { return q.status === 'done'; }).length;
    var current = queue.filter(function (q) { return q.status === 'uploading'; })[0];

    var html = '<div class="uq">' +
      '<div class="uq-head">' +
        '<span class="uq-title">' + queue.length + ' file' + (queue.length === 1 ? '' : 's') + ' ready</span>' +
        (!busy && state.selectedCategory && waiting.length > 1
          ? '<button class="uq-link" id="uq-apply-all">Apply the selected form to all</button>' : '') +
        (!busy ? '<button class="uq-link danger" id="uq-clear">Clear list</button>' : '') +
      '</div>';

    if (busy) {
      var pct = Math.round((doneCount / queue.length) * 100);
      html += '<div class="uq-progress"><div class="uq-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="uq-progress-text">Uploading ' + Math.min(doneCount + 1, queue.length) + ' of ' + queue.length +
        (current ? ' &middot; ' + escapeHtml(current.file.name) : '') + '</div>';
    }

    html += '<div class="uq-list">';
    queue.forEach(function (q) {
      var thumb = q.previewUrl
        ? '<img class="uq-thumb" src="' + q.previewUrl + '" alt="" />'
        : '<span class="uq-thumb uq-icon">' + fileIcon(q.file.type) + '</span>';

      var statusHtml = '';
      if (q.status === 'uploading') statusHtml = '<span class="uq-status up">Uploading…</span>';
      else if (q.status === 'done') statusHtml = '<span class="uq-status ok">' + icon('check') + ' Uploaded</span>';
      else if (q.status === 'error') statusHtml = '<span class="uq-status err" title="' + escapeHtml(q.error || '') + '">Failed</span>';

      var locked = busy || q.status === 'done';

      html += '<div class="uq-row uq-' + q.status + '">' +
        thumb +
        '<div class="uq-main">' +
          '<div class="uq-name">' + escapeHtml(q.file.name) + '</div>' +
          '<div class="uq-meta">' + formatSize(q.file.size) +
            (q.status === 'error' && q.error ? ' &middot; <span class="uq-err-text">' + escapeHtml(q.error) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<select class="uq-cat' + (!q.category && q.status !== 'done' ? ' needs' : '') + '" data-uqcat="' + q.id + '" ' + (locked ? 'disabled' : '') + '>' +
          '<option value="">— CHOOSE FORM —</option>' +
          state.categories.map(function (c) {
            return '<option value="' + escapeHtml(c) + '"' + (q.category === c ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
          }).join('') +
        '</select>' +
        statusHtml +
        (!locked ? '<button class="uq-remove" data-uqremove="' + q.id + '" title="Remove from list">' + icon('close') + '</button>' : '') +
      '</div>';
    });
    html += '</div>';

    var label = busy ? 'Uploading…'
      : waiting.length === 0 ? 'All uploaded'
      : 'Upload ' + waiting.length + ' file' + (waiting.length === 1 ? '' : 's');

    html += '<div class="uq-foot">' +
      (missingForm && !busy
        ? '<span class="uq-warn">' + missingForm + ' file' + (missingForm === 1 ? ' needs' : 's need') + ' a document form</span>'
        : '<span></span>') +
      '<button class="btn-add" id="upload-all-btn" ' + (busy || waiting.length === 0 ? 'disabled' : '') + '>' + label + '</button>' +
    '</div>';

    return html + '</div>';
  }

  /* ===== DOCUMENT LIBRARY =====
     Groups this folder's files under every document form, so staff can see
     at a glance which requirements are on file and which are still missing. */
  function renderLibrary(files) {
    var q = state.fileListSearch.toLowerCase();
    var filtered = files.filter(function (f) {
      return (f.title + ' ' + (f.category || '') + ' ' + (f.description || '')).toLowerCase().includes(q);
    });

    // Bucket files by category.
    var byCat = {};
    filtered.forEach(function (f) {
      var key = f.category || 'UNCATEGORIZED';
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(f);
    });

    var onFile = state.categories.filter(function (c) {
      return files.some(function (f) { return f.category === c; });
    }).length;

    var html = '<div class="panel library-panel">' +
      '<div class="panel-header">' +
        '<h3>' + icon('library') + ' Document Library</h3>' +
        '<div class="library-progress">' + onFile + ' of ' + state.categories.length + ' forms on file &middot; ' + files.length + ' document(s)</div>' +
      '</div>' +
      (files.length ? (
        '<div class="bundle-bar">' +
          '<span class="bundle-label">Download this client\u2019s whole folder:</span>' +
          '<a class="btn-mini gold" href="' + Api.bundlePdfUrl(state.currentFolderId) + '">' +
            icon('pdf') + ' Merge to one PDF</a>' +
          '<a class="btn-mini" href="' + Api.bundleZipUrl(state.currentFolderId) + '">' +
            icon('download') + ' All files (ZIP)</a>' +
        '</div>'
      ) : '') +
      '<div class="library-toolbar">' +
        '<input id="file-search" class="caps-input" data-ftype="text" placeholder="SEARCH THIS LIBRARY…" value="' + escapeHtml(state.fileListSearch) + '" />' +
        '<label class="toggle-missing"><input type="checkbox" id="toggle-missing" ' + (state.libraryOpen ? 'checked' : '') + ' /> Show missing forms</label>' +
      '</div>';

    var shown = 0;
    state.categories.forEach(function (cat) {
      var rows = byCat[cat] || [];
      if (rows.length === 0 && !state.libraryOpen) return;
      if (rows.length === 0 && q) return; // don't show empty forms while searching
      shown++;
      html += '<div class="lib-group' + (rows.length ? '' : ' empty') + '">' +
        '<div class="lib-group-head">' +
          '<span class="lib-status ' + (rows.length ? 'on' : 'off') + '">' + (rows.length ? icon('check') : icon('circle')) + '</span>' +
          '<span class="lib-cat">' + escapeHtml(cat) + '</span>' +
          '<span class="lib-count">' + (rows.length ? rows.length + ' file(s)' : 'Not yet submitted') + '</span>' +
        '</div>';
      if (rows.length) html += renderFileRows(rows);
      html += '</div>';
    });

    // Anything with a category not in the master list (e.g. legacy uploads).
    Object.keys(byCat).forEach(function (cat) {
      if (state.categories.indexOf(cat) !== -1) return;
      shown++;
      html += '<div class="lib-group"><div class="lib-group-head">' +
        '<span class="lib-status on">' + icon('check') + '</span>' +
        '<span class="lib-cat">' + escapeHtml(cat) + '</span>' +
        '<span class="lib-count">' + byCat[cat].length + ' file(s)</span>' +
      '</div>' + renderFileRows(byCat[cat]) + '</div>';
    });

    if (shown === 0) {
      html += '<div class="empty-state"><span class="big">No documents yet</span>Add the first document using the form above.</div>';
    }
    return html + '</div>';
  }

  function renderFileRows(rows) {
    var html = '<div class="record-list">';
    rows.forEach(function (f) {
      html += '<div class="record-row">' +
        '<span class="record-icon">' + fileIcon(f.mime_type) + '</span>' +
        '<div class="record-main">' +
          '<div class="record-title-row"><span class="record-title">' + escapeHtml(f.title) + '</span></div>' +
          '<div class="record-meta">' +
            '<span>' + formatSize(f.file_size) + '</span>' +
            '<span>Added ' + escapeHtml(formatDate(f.created_at)) + '</span>' +
            (f.created_by_name ? '<span>by <b>' + escapeHtml(f.created_by_name) + '</b></span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="record-actions">' +
          '<button class="btn-mini" data-preview="' + f.id + '" data-name="' + escapeHtml(f.title) + '" data-mime="' + escapeHtml(f.mime_type || '') + '">Preview</button>' +
          '<a class="btn-mini gold" href="' + Api.downloadUrl(f.id) + '">Download</a>' +
          '<button class="btn-mini danger" data-delete="' + f.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    });
    return html + '</div>';
  }

  /* ===== LOCATION / MAP =====
     Pin the parcel on a satellite map, view it in Street View, jump to
     Google Earth, or download a KML to open in Google Earth Pro. */

  function renderMapPanel(folder) {
    var pinned = folder.latitude !== null && folder.latitude !== undefined &&
                 folder.longitude !== null && folder.longitude !== undefined;

    var html = '<div class="panel map-panel">' +
      '<div class="panel-header"><h3>' + icon('pin') + ' Location &amp; Map</h3>' +
        (pinned ? '<span class="coord-readout">' + folder.latitude.toFixed(6) + ', ' + folder.longitude.toFixed(6) + '</span>' : '') +
      '</div>';

    if (!pinned && !state.pinEditing) {
      html += '<div class="map-empty">' +
        '<div class="map-empty-ico">' + icon('map') + '</div>' +
        '<div class="map-empty-title">This parcel has no map pin yet</div>' +
        '<div class="map-empty-sub">Pin it once, then anyone can open it in satellite view, Street View, or Google Earth.</div>' +
        '<button class="btn-add" id="start-pin-btn">' + icon('pin') + ' Pin this parcel</button>' +
      '</div></div>';
      return html;
    }

    // ---- Pin editor ----
    if (state.pinEditing) {
      var draft = state.pinDraft;
      html += '<div class="pin-editor">' +
        '<div class="place-search">' +
          '<input id="place-search" class="caps-input" data-ftype="text" autocomplete="off" ' +
            'placeholder="SEARCH A PLACE — E.G. BARANGAY, TOWN, LANDMARK" value="' + escapeHtml(state.placeQuery || '') + '" />' +
          '<button class="btn-search" id="place-search-btn">' + (state.placeSearching ? 'Searching…' : 'Search') + '</button>' +
          renderPlaceResults() +
        '</div>' +
        '<div class="pin-help">Search for the area above, then <b>click the map</b> to drop the pin exactly on the parcel. You can drag the pin to adjust it.</div>' +
        '<div id="pin-map" class="pin-map"></div>' +
        '<div class="pin-status">' +
          (draft.lat !== null
            ? '<span class="pin-set">' + icon('pin') + ' Pin placed at ' + draft.lat.toFixed(6) + ', ' + draft.lng.toFixed(6) + '</span>'
            : '<span class="pin-unset">No pin placed yet — click anywhere on the map.</span>') +
        '</div>' +
        '<div class="pin-actions">' +
          '<button class="btn-add" id="save-pin-btn" ' + (state.pinBusy || draft.lat === null ? 'disabled' : '') + '>' +
            (state.pinBusy ? 'Saving…' : 'Save Pin') + '</button>' +
          '<button class="btn-ghost" id="cancel-pin-btn">Cancel</button>' +
          (pinned ? '<button class="btn-ghost danger-text" id="remove-pin-btn">Remove pin</button>' : '') +
        '</div>' +
      '</div></div>';
      return html;
    }

    // ---- Pinned view ----
    var lat = folder.latitude, lng = folder.longitude;
    var tab = state.mapTab || 'satellite';

    html += '<div class="map-tabs">' +
      '<button class="map-tab' + (tab === 'satellite' ? ' active' : '') + '" data-maptab="satellite">Satellite</button>' +
      '<button class="map-tab' + (tab === 'street' ? ' active' : '') + '" data-maptab="street">Street View</button>' +
    '</div>';

    if (tab === 'satellite') {
      html += '<iframe class="map-frame" loading="lazy" allowfullscreen ' +
        'src="https://maps.google.com/maps?q=' + lat + ',' + lng + '&t=k&z=18&output=embed"></iframe>';
    } else {
      html += '<iframe class="map-frame" loading="lazy" allowfullscreen ' +
        'src="https://maps.google.com/maps?q=&layer=c&cbll=' + lat + ',' + lng + '&cbp=11,0,0,0,0&output=svembed"></iframe>' +
        '<div class="map-note">If the view is blank, Google has no Street View imagery for this exact spot. ' +
        'Try opening it in Google Maps and dragging to the nearest road.</div>';
    }

    html += '<div class="map-links">' +
      '<a class="btn-mini" target="_blank" rel="noopener" href="https://earth.google.com/web/@' + lat + ',' + lng + ',0a,600d,35y,0h,45t,0r">' + icon('globe') + ' Google Earth</a>' +
      '<a class="btn-mini" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng + '">' + icon('map') + ' Google Maps</a>' +
      '<a class="btn-mini" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng + '">' + icon('eye') + ' Street View</a>' +
      '<a class="btn-mini gold" href="' + Api.kmlUrl(folder.id) + '">' + icon('download') + ' Download KML</a>' +
      '<button class="btn-mini" id="edit-pin-btn">Edit pin</button>' +
    '</div>';

    return html + '</div>';
  }

  // Pull coordinates out of a pasted Google Maps URL or a plain "lat, lng".
  function parseCoords(text) {
    if (!text) return null;
    var s = String(text).trim();
    var m;

    // .../@14.0796,120.6319,17z
    m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // ...!3d14.0796!4d120.6319
    m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // ?q=14.0796,120.6319  /  &query=...  /  &cbll=...
    m = s.match(/[?&](?:q|query|ll|cbll|viewpoint)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // Plain "14.0796, 120.6319"
    m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    return null;
  }

  function validCoords(c) {
    return c && !isNaN(c.lat) && !isNaN(c.lng) &&
      c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180;
  }

  function renderPlaceResults() {
    if (!state.placeResults || state.placeResults.length === 0) {
      return state.placeSearched && !state.placeSearching
        ? '<div class="place-results"><div class="place-none">No place found. Try a nearby barangay or town name.</div></div>'
        : '';
    }
    return '<div class="place-results">' +
      state.placeResults.map(function (r, i) {
        return '<button class="place-item" data-place="' + i + '">' +
          '<span class="place-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="place-sub">' + escapeHtml(r.detail) + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  // Free place lookup via OpenStreetMap's Nominatim — no API key needed.
  // Biased to the Philippines so local barangay names resolve properly.
  function searchPlace(query) {
    if (!query || !query.trim()) return;
    state.placeSearching = true;
    state.placeSearched = true;
    render();

    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ph&q=' +
      encodeURIComponent(query.trim());

    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        state.placeResults = (rows || []).map(function (r) {
          var parts = String(r.display_name || '').split(',');
          return {
            name: (parts.shift() || '').trim(),
            detail: parts.join(',').trim(),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon)
          };
        });
        state.placeSearching = false;
        render();
      })
      .catch(function () {
        state.placeSearching = false;
        state.placeResults = [];
        toast('Place search is unavailable right now. You can still click the map directly.', 'err');
        render();
      });
  }

  // Batangas province, used when a record has no pin yet.
  var DEFAULT_CENTER = { lat: 13.9374, lng: 121.0000, zoom: 10 };

  function bindMapPanel(folder) {
    var startBtn = document.getElementById('start-pin-btn');
    if (startBtn) startBtn.addEventListener('click', function () {
      state.pinEditing = true;
      state.pinDraft = {
        lat: folder.latitude !== null && folder.latitude !== undefined ? folder.latitude : null,
        lng: folder.longitude !== null && folder.longitude !== undefined ? folder.longitude : null
      };
      // Pre-fill the search with this parcel's own barangay + municipality.
      var muni = state.folderDetail && state.folderDetail.municipality;
      state.placeQuery = [folder.location, muni ? muni.name : '', 'BATANGAS']
        .filter(Boolean).join(', ').toUpperCase();
      state.placeResults = [];
      state.placeSearched = false;
      render();
    });

    var editBtn = document.getElementById('edit-pin-btn');
    if (editBtn) editBtn.addEventListener('click', function () {
      state.pinEditing = true;
      state.pinDraft = { lat: folder.latitude, lng: folder.longitude };
      render();
    });

    document.querySelectorAll('[data-maptab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mapTab = b.getAttribute('data-maptab');
        render();
      });
    });

    if (state.pinEditing) bindPinEditor(folder);
  }

  function bindPinEditor(folder) {
    // Updates the status line and Save button without a full re-render,
    // so the map keeps its zoom and position while the user works.
    function refreshPinStatus() {
      var d = state.pinDraft;
      var status = document.querySelector('.pin-status');
      if (status) {
        status.innerHTML = d.lat !== null
          ? '<span class="pin-set">' + icon('pin') + ' Pin placed at ' + d.lat.toFixed(6) + ', ' + d.lng.toFixed(6) + '</span>'
          : '<span class="pin-unset">No pin placed yet — click anywhere on the map.</span>';
      }
      var save = document.getElementById('save-pin-btn');
      if (save) save.disabled = (d.lat === null || state.pinBusy);
    }

    function placeMarker(lat, lng) {
      if (!state.leafletMap) return;
      if (state.leafletMarker) state.leafletMap.removeLayer(state.leafletMarker);
      state.leafletMarker = L.marker([lat, lng], { draggable: true }).addTo(state.leafletMap);
      state.leafletMarker.on('dragend', function (e) {
        var p = e.target.getLatLng();
        state.pinDraft = { lat: round6(p.lat), lng: round6(p.lng) };
        refreshPinStatus();
      });
    }

    // Build the Leaflet map. Satellite imagery from Esri needs no API key.
    var mapEl = document.getElementById('pin-map');
    if (mapEl && typeof L !== 'undefined') {
      var d = state.pinDraft;
      var start = state.mapCenter
        || (d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng, zoom: 17 } : DEFAULT_CENTER);

      var map = L.map(mapEl).setView([start.lat, start.lng], start.zoom || 17);
      state.leafletMap = map;

      var sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imagery &copy; Esri' }
      ).addTo(map);
      var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
      });
      L.control.layers({ 'Satellite': sat, 'Street map': street }).addTo(map);

      if (d.lat !== null && d.lng !== null) placeMarker(d.lat, d.lng);

      map.on('click', function (e) {
        state.pinDraft = { lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) };
        placeMarker(e.latlng.lat, e.latlng.lng);
        refreshPinStatus();
      });

      // Remember where the user left the map so a re-render returns here.
      map.on('moveend', function () {
        var c = map.getCenter();
        state.mapCenter = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      });

      // The container is sized by CSS after render; nudge Leaflet to re-measure.
      setTimeout(function () { map.invalidateSize(); }, 80);
    } else if (mapEl) {
      mapEl.innerHTML = '<div class="map-fallback">The interactive map could not load. ' +
        'Check your internet connection and try again.</div>';
    }

    // ---- Place search ----
    var placeInput = document.getElementById('place-search');
    attachFieldBehaviour(placeInput, function (v) { state.placeQuery = v; });
    if (placeInput) placeInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); searchPlace(state.placeQuery); }
    });
    var placeBtn = document.getElementById('place-search-btn');
    if (placeBtn) placeBtn.addEventListener('click', function () { searchPlace(state.placeQuery); });

    document.querySelectorAll('[data-place]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = state.placeResults[parseInt(btn.getAttribute('data-place'), 10)];
        if (!r) return;
        // Move the map to the place; the user still clicks to set the exact pin.
        state.mapCenter = { lat: r.lat, lng: r.lng, zoom: 16 };
        state.placeResults = [];
        state.placeSearched = false;
        render();
        toast('Moved to ' + r.name + '. Click the map to drop the pin.');
      });
    });

    var cancel = document.getElementById('cancel-pin-btn');
    if (cancel) cancel.addEventListener('click', function () {
      destroyMap();
      resetPinEditor();
      render();
    });

    var save = document.getElementById('save-pin-btn');
    if (save) save.addEventListener('click', function () {
      var dd = state.pinDraft;
      if (!validCoords(dd)) { toast('Click the map to drop a pin first.', 'err'); return; }
      state.pinBusy = true;
      render();
      Api.updateFolderPin(state.currentFolderId, dd.lat, dd.lng).then(function (data) {
        destroyMap();
        state.pinBusy = false;
        resetPinEditor();
        if (state.folderDetail) state.folderDetail.folder = data.folder;
        toast('Map pin saved.');
        render();
      }).catch(function (err) {
        state.pinBusy = false;
        toast(err.message || 'Could not save the pin.', 'err');
        render();
      });
    });

    var removeBtn = document.getElementById('remove-pin-btn');
    if (removeBtn) removeBtn.addEventListener('click', function () {
      if (!window.confirm('Remove the map pin from this record?')) return;
      state.pinBusy = true;
      render();
      Api.updateFolderPin(state.currentFolderId, null, null).then(function (data) {
        destroyMap();
        state.pinBusy = false;
        resetPinEditor();
        if (state.folderDetail) state.folderDetail.folder = data.folder;
        toast('Map pin removed.');
        render();
      }).catch(function (err) {
        state.pinBusy = false;
        toast(err.message || 'Could not remove the pin.', 'err');
        render();
      });
    });
  }

  function resetPinEditor() {
    state.pinEditing = false;
    state.mapCenter = null;
    state.placeQuery = '';
    state.placeResults = [];
    state.placeSearched = false;
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  // Leaflet keeps listeners on the old DOM node, so tear it down before re-render.
  function destroyMap() {
    if (state.leafletMap) {
      try { state.leafletMap.remove(); } catch (e) {}
      state.leafletMap = null;
      state.leafletMarker = null;
    }
  }

  function bindFolder() {
    var back = document.getElementById('back-municipality');
    if (back) back.addEventListener('click', function () {
      if (state.uploadBusy) {
        if (!window.confirm('Files are still uploading. Leave anyway? Remaining files will not be uploaded.')) return;
      }
      clearPendingFiles();
      destroyMap();
      state.pinEditing = false;
      state.folderDetail = null;
      go('municipality', { after: loadFolders });
    });

    if (state.folderDetail && state.folderDetail.folder) bindMapPanel(state.folderDetail.folder);

    var fileInput = document.getElementById('file-input');
    var dropZone = document.getElementById('drop-zone');
    if (fileInput) fileInput.addEventListener('change', function (e) {
      addFilesToQueue(e.target.files);
      e.target.value = ''; // allow re-selecting the same file after removing it
    });
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.remove('drag-over'); });
      });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        if (state.uploadBusy) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
      });
    }

    bindUploadQueue();

    var catSelect = document.getElementById('doc-category');
    if (catSelect) catSelect.addEventListener('change', function (e) {
      state.selectedCategory = e.target.value;
      render();
    });

    bindRemarksSelect('folder-remarks-edit', 'detail', function (val) {
      state.remarksBusy = true;
      render();
      Api.updateFolderRemarks(state.currentFolderId, val).then(function (data) {
        state.remarksBusy = false;
        if (state.folderDetail) state.folderDetail.folder = data.folder;
        toast(val ? ('Remarks set to ' + val + '.') : 'Remarks cleared.');
        render();
      }).catch(function (err) {
        state.remarksBusy = false;
        toast(err.message || 'Could not update remarks.', 'err');
        render();
      });
    });

    var delFolderBtn = document.getElementById('delete-folder-btn');
    if (delFolderBtn) delFolderBtn.addEventListener('click', function () {
      var d = state.folderDetail;
      if (!d) return;
      var f = d.folder;
      var count = (d.files || []).length;

      // An empty folder is a cheap mistake to undo; one holding documents is
      // not, so that case asks for the title number to be typed out.
      if (count === 0) {
        if (!window.confirm('Delete folder ' + f.title_number + ' (' + f.name + ')?\n\nThis cannot be undone.')) return;
      } else {
        var typed = window.prompt(
          'This folder holds ' + count + ' document(s), which will also be deleted permanently.\n\n' +
          'To confirm, type the title number exactly:\n' + f.title_number
        );
        if (typed === null) return;
        if (typed.trim().toUpperCase() !== String(f.title_number).toUpperCase()) {
          toast('That did not match the title number. Nothing was deleted.', 'err');
          return;
        }
      }

      state.deletingFolder = true;
      render();
      Api.deleteFolder(state.currentFolderId).then(function () {
        state.deletingFolder = false;
        state.folderDetail = null;
        toast('Folder ' + f.title_number + ' deleted.');
        go('municipality', { after: loadFolders });
      }).catch(function (err) {
        state.deletingFolder = false;
        toast(err.message || 'Could not delete the folder.', 'err');
        render();
      });
    });
    var toggleMissing = document.getElementById('toggle-missing');
    if (toggleMissing) toggleMissing.addEventListener('change', function (e) {
      state.libraryOpen = e.target.checked;
      render();
    });

    var search = document.getElementById('file-search');
    if (search) {
      attachFieldBehaviour(search);
      search.addEventListener('input', function (e) { state.fileListSearch = e.target.value; render(); });
    }

    document.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-delete');
        if (!confirm('Delete this file? This cannot be undone.')) return;
        Api.deleteFile(id).then(function () {
          toast('File deleted.');
          loadFolderDetail();
        }).catch(function (err) {
          toast(err.message || 'Could not delete the file.', 'err');
        });
      });
    });

    document.querySelectorAll('[data-preview]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.previewModal = {
          id: btn.getAttribute('data-preview'),
          name: btn.getAttribute('data-name'),
          mime: btn.getAttribute('data-mime')
        };
        render();
      });
    });
  }

  var uqSeq = 0;

  /* Stage chosen files. Oversized files and duplicates are skipped with a
     message rather than silently, so nobody wonders where a file went. */
  function addFilesToQueue(fileList) {
    if (state.uploadBusy) return;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    var tooBig = [], dupes = [], added = 0, overCap = 0;

    files.forEach(function (file) {
      if (file.size > 25 * 1024 * 1024) { tooBig.push(file.name); return; }
      var isDupe = state.pendingFiles.some(function (q) {
        return q.status !== 'done' && q.file.name === file.name && q.file.size === file.size;
      });
      if (isDupe) { dupes.push(file.name); return; }
      if (state.pendingFiles.filter(function (q) { return q.status !== 'done'; }).length >= MAX_BATCH) {
        overCap++; return;
      }
      state.pendingFiles.push({
        id: ++uqSeq,
        file: file,
        previewUrl: isImageFile(file.type) ? URL.createObjectURL(file) : null,
        category: state.selectedCategory || '',
        status: 'queued',
        error: ''
      });
      added++;
    });

    var notes = [];
    if (tooBig.length) notes.push(tooBig.length + ' over 25MB (' + tooBig.slice(0, 3).join(', ') + (tooBig.length > 3 ? '…' : '') + ')');
    if (dupes.length) notes.push(dupes.length + ' already in the list');
    if (overCap) notes.push(overCap + ' over the ' + MAX_BATCH + '-file batch limit');

    state.uploadMsg = notes.length
      ? { type: 'err', text: (added ? added + ' added. ' : 'Nothing added. ') + 'Skipped: ' + notes.join('; ') + '.' }
      : null;
    render();
  }

  function releasePreview(q) {
    if (q && q.previewUrl) { URL.revokeObjectURL(q.previewUrl); q.previewUrl = null; }
  }

  // Frees every thumbnail's memory; called when leaving a folder.
  function clearPendingFiles() {
    state.pendingFiles.forEach(releasePreview);
    state.pendingFiles = [];
  }

  function bindUploadQueue() {
    document.querySelectorAll('[data-uqcat]').forEach(function (sel) {
      sel.addEventListener('change', function (e) {
        var id = parseInt(sel.getAttribute('data-uqcat'), 10);
        var q = state.pendingFiles.filter(function (x) { return x.id === id; })[0];
        if (q) q.category = e.target.value;
        render();
      });
    });

    document.querySelectorAll('[data-uqremove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-uqremove'), 10);
        state.pendingFiles = state.pendingFiles.filter(function (q) {
          if (q.id === id) { releasePreview(q); return false; }
          return true;
        });
        render();
      });
    });

    var applyAll = document.getElementById('uq-apply-all');
    if (applyAll) applyAll.addEventListener('click', function () {
      state.pendingFiles.forEach(function (q) {
        if (q.status !== 'done') q.category = state.selectedCategory;
      });
      render();
    });

    var clear = document.getElementById('uq-clear');
    if (clear) clear.addEventListener('click', function () {
      clearPendingFiles();
      state.uploadMsg = null;
      render();
    });

    var go_ = document.getElementById('upload-all-btn');
    if (go_) go_.addEventListener('click', uploadQueue);
  }

  /* Upload everything still waiting, one file at a time. */
  function uploadQueue() {
    var waiting = state.pendingFiles.filter(function (q) { return q.status !== 'done'; });
    if (!waiting.length) return;

    var missing = waiting.filter(function (q) { return !q.category; });
    if (missing.length) {
      toast('Choose a document form for every file first (' + missing.length + ' missing).', 'err');
      return;
    }

    // Retrying clears earlier failures.
    waiting.forEach(function (q) { q.status = 'queued'; q.error = ''; });
    state.uploadBusy = true;
    state.uploadMsg = null;
    var folderId = state.currentFolderId;

    var i = 0, ok = 0, failed = 0;

    function next() {
      // Stop quietly if the user navigated to a different folder mid-batch.
      if (state.currentFolderId !== folderId) { state.uploadBusy = false; return; }

      if (i >= waiting.length) {
        state.uploadBusy = false;
        if (failed === 0) {
          state.uploadMsg = { type: 'ok', text: ok + ' file' + (ok === 1 ? '' : 's') + ' uploaded.' };
          toast(ok + ' file' + (ok === 1 ? '' : 's') + ' uploaded.');
          clearPendingFiles();
        } else {
          // Keep only the failures so they can be retried.
          state.pendingFiles = state.pendingFiles.filter(function (q) {
            if (q.status === 'done') { releasePreview(q); return false; }
            return true;
          });
          state.uploadMsg = { type: 'err',
            text: ok + ' uploaded, ' + failed + ' failed. The failed files are still listed \u2014 click Upload to retry them.' };
        }
        loadFolderDetail();
        return;
      }

      var q = waiting[i++];
      q.status = 'uploading';
      render();

      var formData = new FormData();
      formData.append('file', q.file);
      formData.append('category', q.category);

      Api.uploadFile(folderId, formData).then(function () {
        q.status = 'done';
        ok++;
        next();
      }).catch(function (err) {
        q.status = 'error';
        q.error = (err && err.message) || 'Upload failed';
        failed++;
        next();
      });
    }

    next();
  }

  /* ===== PREVIEW MODAL ===== */
  function renderPreviewModal() {
    var m = state.previewModal;
    var url = Api.previewUrl(m.id);
    var body;
    if (m.mime && m.mime.indexOf('image/') === 0) {
      body = '<img src="' + url + '" alt="' + escapeHtml(m.name) + '" />';
    } else if (m.mime === 'application/pdf') {
      body = '<iframe src="' + url + '" title="' + escapeHtml(m.name) + '"></iframe>';
    } else if (m.mime && m.mime.indexOf('text/') === 0) {
      body = '<iframe src="' + url + '" title="' + escapeHtml(m.name) + '"></iframe>';
    } else {
      body = '<div class="modal-fallback"><span class="ico">' + fileIcon(m.mime) + '</span>' +
        'A preview isn\'t available for this file type in-browser.<br/>Use Download or Open in new tab instead.</div>';
    }
    return '<div class="modal-overlay" id="preview-overlay">' +
      '<div class="modal-card">' +
        '<div class="modal-header"><h3>' + escapeHtml(m.name) + '</h3><button class="modal-close" id="preview-close">&times;</button></div>' +
        '<div class="modal-body">' + body + '</div>' +
        '<div class="modal-footer">' +
          '<a class="btn-mini gold" href="' + url + '" target="_blank" rel="noopener">Open in new tab</a>' +
          '<a class="btn-mini" href="' + Api.downloadUrl(m.id) + '">Download</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function bindPreviewModal() {
    var overlay = document.getElementById('preview-overlay');
    var close = document.getElementById('preview-close');
    function dismiss() { state.previewModal = null; render(); }
    if (close) close.addEventListener('click', dismiss);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc); }
    });
  }

  /* ===== HELPERS ===== */
  function findCluster(slug) {
    return state.clusters.find(function (c) { return c.slug === slug; }) || null;
  }
  function formatSize(bytes) {
    bytes = Number(bytes);
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function formatDate(value) {
    if (!value) return '';
    try {
      // Postgres sends ISO timestamps ("2026-09-17T01:00:00.000Z").
      var d = new Date(value);
      if (isNaN(d.getTime())) {
        // Fallback for "YYYY-MM-DD HH:MM:SS" style values.
        d = new Date(String(value).replace(' ', 'T') + 'Z');
      }
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return String(value); }
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isImageFile(mimeType) { return !!mimeType && mimeType.indexOf('image/') === 0; }
  function fileIcon(mimeType) {
    if (!mimeType) return icon('file');
    if (mimeType.indexOf('image/') === 0) return icon('image');
    if (mimeType === 'application/pdf') return icon('pdf');
    if (mimeType.indexOf('sheet') !== -1 || mimeType.indexOf('excel') !== -1 || mimeType === 'text/csv') return icon('sheet');
    return icon('file');
  }

  boot();
})();
