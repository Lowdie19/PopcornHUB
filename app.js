/* ==========================================================================
   CONFIG & GLOBAL STATE
   ========================================================================== */
const TMDB_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";

let activeItem = null;
let detailTrailerKey = "";
let detailTrailerRequestId = 0;
let currentServer = "vidzee";
let currentSeason = 1;
let currentEpisode = 1;
let activeTvSeasons = [];
// Prevent duplicate ended messages from the previous iframe document from
// completing/skipping the newly selected episode during auto-advance.
let tvIgnoreEndedUntilFreshStart = false;
let tvEndedSessionKey = null;
let tvLastEndedPlaybackTime = 0;
let pendingTvContinueSave = null;
let skipNextTvContinueSave = false;
let continuePlaybackSession = null;
let continuePageState = null; // Resume card eligibility and hide latch for the current player page.
const TV_CONTINUE_STORAGE_KEY = "popcornContinueWatchingTV";
const MOVIE_CONTINUE_STORAGE_KEY = "popcornContinueWatchingMovies";
const CONTINUE_PROGRESS_KEY = "popcornContinuePlaybackProgress";
const PLAYBACK_COMPLETION_KEY = "popcornPlaybackCompletions";
const ACTIVE_SERVER_IDS = ["vidcore", "vidlink", "vidsrc", "vidzee"];
function normalizeServerId(server) {
  const id = String(server || "").toLowerCase();
  // CHEESE now points to VidZee. Migrate the retired legacy CHEESE provider.
  if (id === "videasy" || id === "premium") return "vidzee";
  return ACTIVE_SERVER_IDS.includes(id) ? id : "vidzee";
}

// STREAMING PLATFORMS STATE & PROVIDER MAPPINGS (Region: PH)
const PLATFORMS_CONFIG = [
  { id: "netflix", name: "Netflix", providerId: 8, color: "#000000", iconImg: "assets/netflix.png" },
  { id: "disney", name: "Disney+", providerId: 337, color: "#113CCF", iconImg: "assets/disney.png" },
  { id: "prime", name: "Prime Video", providerId: 119, color: "#00A8E1", iconImg: "assets/primevideo.png" },
  { id: "hbo", name: "HBO Max", providerId: 1899, color: "#9e86ff", iconImg: "assets/hbomax.png" },
  { id: "viu", name: "Viu", providerId: 158, color: "#F5B919", iconImg: "assets/viu.png" },
  { id: "crunchyroll", name: "Crunchyroll", providerId: 283, color: "#F47521", iconImg: "assets/crunchyroll.png" },
  { id: "vivamax", name: "VivaMax", providerId: 1618, companyId: 149142, networkIds: [4569, 5844], color: "#000000", iconImg: "assets/vivamax.png" }
];

let selectedPlatform = null;
let platformMediaType = "all"; // 'all', 'movie', 'tv'
let platformCurrentPage = 1;
let platformTotalPages = 1;
let isPlatformLoadingMore = false;
let displayedPlatformIds = new Set();
let latestPlatformRequestId = 0;
let latestMoviesRequestId = 0;
let latestTvRequestId = 0;

// HERO CAROUSEL STATE
let heroItems = [];
let currentHeroIndex = 0;
let heroTimer = null;
let heroTransitionLock = false;

// WATCHLIST STATE
let watchlist = [];
try {
  const savedWatchlist = JSON.parse(localStorage.getItem("popcornWatchlist")) || [];
  watchlist = Array.isArray(savedWatchlist) ? savedWatchlist.filter(item => item && item.id != null).map(item => ({
    ...item,
    id: Number(item.id),
    type: String(item.type || (item.title ? "movie" : "tv")).toLowerCase() === "tv" ? "tv" : "movie",
    title: item.title || item.name || "Untitled",
    genres: Array.isArray(item.genres) ? item.genres : [],
    genre_ids: Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : []
  })) : [];
} catch (e) {
  watchlist = [];
}

// REQUEST CACHING & RACE CONDITION CONTROL
const apiCache = new Map();
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const API_CACHE_MAX_ENTRIES = 100;
let latestSearchRequestId = 0;

// PAGINATION / LOAD MORE / SEE MORE STATE
let currentSearchQuery = "";
let searchOriginPage = "home"; // Restore the same browsing section when search is cleared.
let currentSearchType = "all"; // context-aware: all, movie, tv
let currentSearchGenre = "";
let currentSearchSort = "relevance";
let searchRawItems = [];
let searchCurrentPage = 1;
let searchTotalPages = 1;
let isSearchLoadingMore = false;
let displayedMovieSearchIds = new Set();

let movieRelatedCurrentPage = 1;
let movieRelatedTotalPages = 1;
let isMovieRelatedLoadingMore = false;
let displayedMovieRelatedIds = new Set();
let currentMovieRelatedMovieId = null;
let movieRelatedEndpoint = "recommendations";

let tvRelatedCurrentPage = 1;
let tvRelatedTotalPages = 1;
let isTvRelatedLoadingMore = false;
let displayedTvRelatedIds = new Set();
let currentTvRelatedTvId = null;
let tvRelatedEndpoint = "recommendations";

// MOVIES PAGE PAGINATION STATE
let moviesCurrentPage = 1;
let moviesTotalPages = 1;
let isMoviesLoadingMore = false;
let displayedMoviesIds = new Set();

// TV SERIES PAGE PAGINATION STATE
let tvCurrentPage = 1;
let tvTotalPages = 1;
let isTvLoadingMore = false;
let displayedTvIds = new Set();

// PWA INSTALL STATE
let deferredPrompt = null;
let isInstalled = false;
let smartInstallMode = "install";

// SPA HISTORY STATE LOCK
let isNavigatingHistory = false;
let isBackNavigationPending = false;
let backNavigationWatchdog = null;

// TMDB GENRE MAP
const GENRE_MAP = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics"
};

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  syncMainNavbarHeight();
  fetchHomeData();
  setupSearch();
  setupCatalogFilters();
  setupPlatformFilters();
  updateWatchlistBadge();
  setupWatchlistRemovalConfirmation();
  setupMobileDrawerEvents();
  setupHeroSwipe();
  initMiniPlayerControls();
  initNavigationLoadingFeedback();
  initPWA();
  initSpaNavigation();
  initBackToTopButton();
});


/* Keep sticky catalog headings aligned with the real navbar height on phones, tablets and desktop. */
function syncMainNavbarHeight() {
  const navbar = document.getElementById("mainNavbar");
  if (!navbar) return;
  let lastHeight = 0;
  const updateHeight = () => {
    const height = Math.ceil(navbar.getBoundingClientRect().height);
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      document.documentElement.style.setProperty("--main-navbar-height", `${height}px`);
    }
  };
  updateHeight();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(updateHeight);
    observer.observe(navbar);
  }
  window.addEventListener("resize", updateHeight, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(updateHeight, 80), { passive: true });
}

/* ==========================================================================
   MOBILE FLOATING BACK-TO-TOP BUTTON (INSIDE BOTTOM NAV)
   ========================================================================== */
function initBackToTopButton() {
  const navContainer = document.getElementById("mobileBottomNav");
  const btn = document.getElementById("mobileBackToTop");
  if (!navContainer || !btn) return;

  let ticking = false;

  const checkScrollPosition = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    
    // Lumitaw kapag umabot sa 45% ng page o lumampas ng 500px scroll
    const shouldShow = docHeight > 0 && (scrollTop / docHeight >= 0.45 || scrollTop > 500);

    if (shouldShow) {
      navContainer.classList.add("has-top-btn");
    } else {
      navContainer.classList.remove("has-top-btn");
    }
    
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(checkScrollPosition);
      ticking = true;
    }
  }, { passive: true });

  btn.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}

/* ==========================================================================
   PWA SERVICE WORKER & INSTALLATION
   ========================================================================== */
function initPWA() {
  initSmartInstallSelector();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch(err => console.error('ServiceWorker registration failed: ', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtonState();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    isInstalled = true;
    updateInstallButtonState();
  });

  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    isInstalled = true;
  }
  updateInstallButtonState();
}

function updateInstallButtonState() {
  const btn = document.getElementById("drawer-nav-install");
  const btnText = document.getElementById("installBtnText");
  if (!btn || !btnText) return;

  if (isInstalled) {
    // Keep this entry available so users who installed the PWA earlier can
    // still view browser options and add a second shortcut in another browser.
    btnText.innerText = "Installed";
    btn.disabled = false;
    btn.title = "View browser options";
    btn.classList.remove("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.add("hover:text-secondary", "hover:bg-zinc-900");
  } else {
    btnText.innerText = "Install App";
    btn.disabled = false;
    btn.title = "Install PopcornHUB";
    btn.classList.remove("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.add("hover:text-secondary", "hover:bg-zinc-900");
  }
}

function handleInstallAppClick() {
  // Keep the native install prompt available, but let users see browser choices first.
  // The prompt is offered from the selected current-browser detail screen.
  openSmartInstallModal(getSmartInstallPlatform(), "install");
}

function getDesktopAdBlockerUrl() {
  const ua = navigator.userAgent || "";

  // Use the official extension listing that matches the current desktop browser.
  // Chrome no longer offers the full MV2 uBlock Origin listing, so Chromium
  // browsers use uBlock Origin Lite instead.
  if (/Firefox\//i.test(ua)) {
    return "https://addons.mozilla.org/firefox/addon/ublock-origin/";
  }
  if (/Edg\//i.test(ua)) {
    return "https://microsoftedge.microsoft.com/addons/detail/cimighlppcgcoapaliogpjjdehbnofhn";
  }
  if (/OPR\//i.test(ua)) {
    return "https://addons.opera.com/extensions/details/ublock/";
  }
  if (/Safari\//i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Brave)/i.test(ua)) {
    return "https://apps.apple.com/app/ublock-origin-lite/id6745342698";
  }
  if (/(Chrome|Chromium|CriOS|Brave)/i.test(ua)) {
    return "https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh";
  }

  // Unknown desktop browsers can choose the matching official store from the
  // uBlock Origin Lite project's maintained browser links.
  return "https://github.com/uBlockOrigin/uBOL-home#readme";
}

function openAdBlockerGuide() {
  const platform = getSmartInstallPlatform();
  if (platform === "desktop") {
    const installUrl = getDesktopAdBlockerUrl();
    // Open synchronously from the user's click so browser popup protection
    // does not block the extension-store navigation.
    window.open(installUrl, "_blank", "noopener,noreferrer");
    return;
  }
  openSmartInstallModal(platform, "adblock");
}

function closeSmartInstallModal() {
  const modal = document.getElementById("smartInstallModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("smart-install-open");
  document.getElementById("drawer-nav-add-blocker")?.classList.remove("is-active");
}

function getSmartInstallPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function openSmartInstallModal(platform, mode = "install") {
  const modal = document.getElementById("smartInstallModal");
  const options = document.getElementById("smartInstallOptions");
  const details = document.getElementById("smartInstallDetails");
  const desktopHelp = document.getElementById("smartInstallDesktopHelp");
  const title = document.getElementById("smartInstallTitle");
  const description = document.getElementById("smartInstallDescription");
  const back = document.getElementById("smartInstallBack");
  if (!modal || !options || !details || !desktopHelp || !back) return;

  smartInstallMode = mode;
  const drawerAdBlockerButton = document.getElementById("drawer-nav-add-blocker");
  drawerAdBlockerButton?.classList.toggle("is-active", mode === "adblock");
  options.classList.add("hidden");
  details.classList.add("hidden");
  desktopHelp.classList.add("hidden");
  back.classList.add("hidden");

  const browserButtons = options.querySelectorAll("[data-install-browser]");
  browserButtons.forEach((button) => {
    const browser = button.dataset.installBrowser;
    let visible = true;
    if (platform === "android") {
      visible = mode === "adblock"
        ? browser === "firefox"
        : ["firefox", "chrome"].includes(browser);
    } else if (platform === "ios") {
      visible = browser === "safari";
    } else if (mode === "adblock") {
      visible = ["firefox", "chrome", "edge"].includes(browser);
    } else {
      visible = ["firefox", "chrome", "edge"].includes(browser);
    }
    button.classList.toggle("hidden", !visible);
    const small = button.querySelector("small");
    const strong = button.querySelector("strong");
    if (strong && browser === "firefox") {
      strong.textContent = platform === "android" ? "Firefox + Ads Free" : "Firefox";
    }
    if (small) {
      const labels = {
        firefox: platform === "android"
          ? "Recommended · Install Firefox and uBlock Origin"
          : "Desktop · uBlock Origin extension",
        chrome: platform === "android"
          ? "Install PopcornHUB directly in Chrome"
          : "Desktop · Standard installation",
        edge: "Desktop · Standard installation"
      };
      small.textContent = labels[browser] || small.textContent;
    }
  });

  if (platform === "ios") {
    title.textContent = mode === "adblock" ? "Ad blocker for iPhone / iPad" : (isInstalled ? "Use Safari for PopcornHUB" : "Install on iPhone or iPad");
    description.textContent = mode === "adblock"
      ? "Safari supports content-blocking extensions. Follow the steps to install and enable a compatible blocker."
      : "Use Safari to add PopcornHUB to your Home Screen.";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("smart-install-open");
    showSmartInstallDetails("safari", true);
  } else if (platform === "android" && mode === "adblock") {
    title.textContent = "Get uBlock Origin";
    description.textContent = "uBlock Origin works as an add-on in Firefox for Android. It does not install in Chrome.";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("smart-install-open");
    showSmartInstallDetails("firefox");
  } else {
    title.textContent = mode === "adblock"
      ? "Choose an ad blocker"
      : (isInstalled ? "Use PopcornHUB in another browser" : "Choose where to install PopcornHUB");
    if (platform === "android") {
      description.textContent = isInstalled
        ? "Choose Firefox for uBlock Origin, or Chrome to add another PopcornHUB shortcut."
        : "Choose Firefox for uBlock Origin, or install PopcornHUB directly in Chrome.";
    } else {
      description.textContent = mode === "adblock"
        ? "Choose a browser to see its compatible ad-blocking option."
        : (isInstalled
          ? "PopcornHUB is already installed here. You can also add a separate shortcut in another browser."
          : "Choose a browser. We’ll show the correct installation steps.");
    }
    options.classList.remove("hidden");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("smart-install-open");
  }

  const closeButton = document.getElementById("smartInstallClose");
  if (closeButton) closeButton.focus();
}

function getSmartInstallCurrentBrowser() {
  const ua = navigator.userAgent || "";
  if (/FxiOS|Firefox/i.test(ua)) return "firefox";
  if (/EdgA|EdgiOS|Edg\//i.test(ua)) return "edge";
  if (/CriOS|Chrome/i.test(ua) && !/OPR|SamsungBrowser/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR/i.test(ua)) return "safari";
  return "other";
}

async function isSmartInstallBrowserCurrent(browser) {
  if (browser === "brave") {
    try {
      return Boolean(navigator.brave && await navigator.brave.isBrave());
    } catch (_) {
      return false;
    }
  }
  return getSmartInstallCurrentBrowser() === browser;
}

async function showSmartInstallDetails(browser, isIOS = false) {
  const options = document.getElementById("smartInstallOptions");
  const details = document.getElementById("smartInstallDetails");
  const title = document.getElementById("smartInstallDetailTitle");
  const subtitle = document.getElementById("smartInstallDetailSubtitle");
  const message = document.getElementById("smartInstallDetailMessage");
  const steps = document.getElementById("smartInstallSteps");
  const icon = document.getElementById("smartInstallDetailIcon");
  const getBrowser = document.getElementById("smartInstallGetBrowser");
  const addon = document.getElementById("smartInstallAddonLink");
  const nativePromptButton = document.getElementById("smartInstallNativePrompt");
  const copyLinkButton = document.getElementById("smartInstallCopyLink");
  const back = document.getElementById("smartInstallBack");
  if (!options || !details || !title || !subtitle || !message || !steps || !icon) return;

  const current = await isSmartInstallBrowserCurrent(browser);
  const android = getSmartInstallPlatform() === "android";
  const config = {
    firefox: {
      name: "Firefox",
      subtitle: android ? "Android · uBlock Origin extension support" : "Desktop · uBlock Origin extension support",
      icon: "fa-brands fa-firefox-browser",
      iconClass: "firefox",
      store: android ? "https://play.google.com/store/apps/details?id=org.mozilla.firefox" : "https://www.mozilla.org/firefox/new/",
      addonUrl: android ? "https://addons.mozilla.org/android/addon/ublock-origin/" : "https://addons.mozilla.org/firefox/addon/ublock-origin/"
    },
    brave: {
      name: "Brave",
      subtitle: android ? "Android · built-in Shields ad and tracker blocking" : "Desktop · built-in Shields ad and tracker blocking",
      icon: "fa-brands fa-brave",
      iconClass: "brave",
      store: android ? "https://play.google.com/store/apps/details?id=com.brave.browser" : "https://brave.com/download/"
    },
    chrome: {
      name: "Chrome",
      subtitle: "Standard browser installation",
      icon: "fa-brands fa-chrome",
      iconClass: "chrome",
      store: android ? "https://play.google.com/store/apps/details?id=com.android.chrome" : "https://www.google.com/chrome/",
      addonUrl: android ? "" : "https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh"
    },
    edge: {
      name: "Microsoft Edge",
      subtitle: "Desktop · browser installation",
      icon: "fa-brands fa-edge",
      iconClass: "edge",
      store: "https://www.microsoft.com/edge/download",
      addonUrl: "https://microsoftedge.microsoft.com/addons/detail/ublock-origin-lite/cimighlppcgcoapaliogpjjdehbnofhn"
    },
    safari: {
      name: "Safari",
      subtitle: "iPhone / iPad · Safari content-blocking support",
      icon: "fa-brands fa-safari",
      iconClass: "",
      store: "",
      addonUrl: "https://apps.apple.com/app/ublock-origin-lite/id6745342698"
    }
  }[browser];
  if (!config) return;

  let detailSteps;
  if (smartInstallMode === "adblock") {
    if (browser === "firefox") {
      detailSteps = current
        ? ["Tap Get uBlock Origin below.", "On the Firefox Add-ons page, tap Add to Firefox and confirm.", "Return to PopcornHUB and reload the page."]
        : ["uBlock Origin for Android works only as an add-on in Firefox, not Chrome.", "Install Firefox, then open PopcornHUB in Firefox.", "In Firefox, tap + Ad blocker again and choose Get uBlock Origin."];
    } else if (browser === "brave") {
      detailSteps = current
        ? ["Look for the Brave Shields (lion) icon beside the address bar.", "Make sure Shields are turned on for this website.", "Reload PopcornHUB. Brave blocks many ads and trackers automatically; no extension is needed."]
        : ["Install Brave using the button below, if you do not have it yet.", "Tap Copy website link, then open Brave and paste the link in its address bar.", "Brave Shields is on by default. Tap the lion icon to check that protection is enabled, then reload PopcornHUB."];
    } else if (browser === "chrome" || browser === "edge") {
      detailSteps = current
        ? ["Tap the uBlock Origin Lite button below.", `Install uBlock Origin Lite from the ${config.name} extension store.`, "Follow the browser prompts, then reload PopcornHUB."]
        : [`Install or open ${config.name} using the button below.`, "Tap Copy website link, then open the link in that browser.", "Open the browser's extension store, install uBlock Origin Lite, and reload PopcornHUB."];
    } else if (browser === "safari") {
      detailSteps = current
        ? ["Tap the App Store button below and install uBlock Origin Lite.", "On your iPhone/iPad, open Settings → Apps → Safari → Extensions.", "Turn on uBlock Origin Lite, allow website access, then return to Safari and reload PopcornHUB."]
        : ["Open Safari on your iPhone or iPad.", "Visit PopcornHUB in Safari, then return here if needed.", "Install uBlock Origin Lite from the App Store and enable it in Settings → Apps → Safari → Extensions."];
    }
  } else {
    if (browser === "safari") {
      detailSteps = current
        ? ["In Safari, tap the Share button (square with an arrow).", "Scroll down and tap Add to Home Screen.", "Tap Add. The PopcornHUB icon will appear on your Home Screen."]
        : ["Open Safari on your iPhone or iPad.", "Tap Copy website link here, then paste it into Safari's address bar.", "Tap Share → Add to Home Screen → Add."];
    } else {
      const installSteps = {
        firefox: ["Tap the Firefox menu (⋮) beside the address bar.", "Choose Install (or Add to Home screen, depending on your Firefox version).", "Tap Add/Install to finish. PopcornHUB will appear on your Home Screen."],
        brave: ["Tap the Brave menu (⋮).", "Choose Install app or Add to Home screen.", "Confirm Add/Install. PopcornHUB will appear on your Home Screen."],
        chrome: ["Tap the Chrome menu (⋮) in the top corner.", "Choose Install app or Add to Home screen.", "Tap Install or Add to finish. PopcornHUB will appear on your Home Screen."],
        edge: ["Tap the Edge menu (⋯).", "Choose Add to phone or Add to Home screen, if available.", "Follow the prompt to add PopcornHUB to your Home Screen."]
      };
      detailSteps = current
        ? (installSteps[browser] || ["Open the browser menu.", "Choose Install or Add to Home screen.", "Follow the confirmation prompt."])
        : [`Install or open ${config.name} using the button below, if needed.`, "Tap Copy website link, then open that browser and paste the link in its address bar.", ...(installSteps[browser] || ["Open the browser menu.", "Choose Install or Add to Home screen.", "Confirm the installation."])];
    }
  }

  title.textContent = smartInstallMode === "adblock"
    ? (browser === "firefox" && android
        ? (current ? "Add uBlock Origin" : "Firefox is required")
        : (current ? `Protect browsing in ${config.name}` : `Use ${config.name} for protection`))
    : (current ? `Continue in ${config.name}` : `Use ${config.name}`);
  subtitle.textContent = config.subtitle;
  if (current) {
    if (smartInstallMode === "adblock") {
      message.textContent = browser === "brave"
        ? "Good choice. Brave already includes ad and tracker protection. Just check that Shields are on, then reload the page. No extension is needed."
        : browser === "safari"
          ? "Install the content blocker, enable it in your iPhone/iPad settings, then return to Safari."
          : browser === "firefox" && android
            ? "uBlock Origin is a Firefox add-on. Add it once, then reload PopcornHUB."
            : "Follow the short steps below. You only need to install the blocker once in this browser.";
    } else {
      message.textContent = "You're already using this browser. Follow the steps below to add PopcornHUB to this device's Home Screen.";
    }
  } else {
    message.textContent = smartInstallMode === "adblock"
      ? (browser === "firefox" && android
          ? "uBlock Origin for Android works only in Firefox. Install Firefox, open PopcornHUB there, then tap + Ad blocker again to add it."
          : `You selected ${config.name}. First open PopcornHUB in that browser; this page cannot switch apps for you automatically.`)
      : `You selected ${config.name}. First open PopcornHUB in that browser; then follow the steps to add its Home Screen icon.`;
  }
  icon.className = `smart-install-option-icon ${config.iconClass}`.trim();
  icon.innerHTML = `<i class="${config.icon}" aria-hidden="true"></i>`;
  steps.innerHTML = (detailSteps || []).map((step) => `<li>${step}</li>`).join("");

  getBrowser.classList.toggle("hidden", !config.store || current);
  getBrowser.href = config.store || "#";
  const browserActionLabel = browser === "safari"
    ? "Open Safari"
    : (android && browser === "firefox" ? "Install Firefox" : `Get ${config.name}`);
  getBrowser.textContent = browserActionLabel;
  if (config.store) getBrowser.innerHTML = `${browserActionLabel} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`;

  // On Android, show the official uBlock Origin add-on link even before Firefox
  // is the current browser. The instructions clearly tell users to open it in Firefox.
  const showAddon = smartInstallMode === "adblock" && Boolean(config.addonUrl) &&
    (android ? (browser === "firefox" && current) : (current || browser !== "firefox"));
  addon.classList.toggle("hidden", !showAddon);
  if (showAddon) {
    addon.href = config.addonUrl;
    const addonLabel = android && browser === "firefox"
      ? "Get uBlock Origin"
      : (["chrome", "edge", "safari"].includes(browser) ? "Get uBlock Origin Lite" : "Get uBlock Origin");
    addon.textContent = addonLabel;
    addon.innerHTML = `${addonLabel} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`;
  }
  nativePromptButton.classList.toggle("hidden", !(smartInstallMode === "install" && current && Boolean(deferredPrompt)));
  // The Ad blocker guide is a focused flow: hide install-selector navigation
  // and website-link copying, which are not needed in this modal.
  copyLinkButton.classList.toggle("hidden", current || smartInstallMode === "adblock");
  if (!current) copyLinkButton.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i> Copy website link';
  back.classList.toggle("hidden", isIOS || smartInstallMode === "adblock");
  options.classList.add("hidden");
  details.classList.remove("hidden");
}

async function copySmartInstallLink() {
  const siteUrl = window.location.origin + window.location.pathname;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(siteUrl);
    } else {
      window.prompt("Copy this PopcornHUB link and open it in your selected browser:", siteUrl);
      return;
    }
    const button = document.getElementById("smartInstallCopyLink");
    if (button) {
      const original = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Link copied';
      window.setTimeout(() => { button.innerHTML = original; }, 1800);
    }
  } catch (_) {
    window.prompt("Copy this PopcornHUB link and open it in your selected browser:", siteUrl);
  }
}

function initSmartInstallSelector() {
  const modal = document.getElementById("smartInstallModal");
  if (!modal) return;
  modal.querySelectorAll("[data-install-browser]").forEach((button) => {
    button.addEventListener("click", async () => {
      const browser = button.dataset.installBrowser;
      const platform = getSmartInstallPlatform();
      if (smartInstallMode === "install" && platform === "android" &&
          browser === "chrome" && getSmartInstallCurrentBrowser() === "chrome" &&
          deferredPrompt && !isInstalled) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice?.outcome === "accepted") {
          isInstalled = true;
          updateInstallButtonState();
          closeSmartInstallModal();
        }
        return;
      }
      showSmartInstallDetails(browser);
    });
  });
  document.getElementById("smartInstallClose")?.addEventListener("click", closeSmartInstallModal);
  document.getElementById("smartInstallBack")?.addEventListener("click", () => {
    document.getElementById("smartInstallDetails")?.classList.add("hidden");
    document.getElementById("smartInstallOptions")?.classList.remove("hidden");
    document.getElementById("smartInstallBack")?.classList.add("hidden");
  });
  document.getElementById("smartInstallCopyLink")?.addEventListener("click", copySmartInstallLink);
  document.getElementById("smartInstallNativePrompt")?.addEventListener("click", () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        isInstalled = true;
        updateInstallButtonState();
        closeSmartInstallModal();
      }
      deferredPrompt = null;
    });
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeSmartInstallModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeSmartInstallModal();
  });
}

/* ==========================================================================
   PERSISTENT MINI PLAYER
   The live iframe stays mounted in one permanent host; only its shell is repositioned.
   ========================================================================== */
let activePlayerKind = null;
let activePlayerItem = null;
let miniPlayerWasDismissed = false;

function activatePlayer(kind, item) {
  const nextId = String(item && item.id || "");
  const currentId = String(activePlayerItem && activePlayerItem.id || "");
  if (activePlayerKind && (activePlayerKind !== kind || currentId !== nextId)) {
    const previousIframe = activePlayerKind === "movie"
      ? document.getElementById("movieIframe")
      : document.getElementById("tvIframe");
    if (previousIframe) {
      previousIframe.src = "about:blank";
      previousIframe.remove();
    }
  }
  activePlayerKind = kind;
  activePlayerItem = item;
  miniPlayerWasDismissed = false;
  const mini = document.getElementById("miniPlayer");
  if (mini) mini.classList.add("hidden");
  // Mount the iframe in its permanent root host before its source is loaded.
  // It must never be reparented during playback: moving a live cross-origin
  // iframe can interrupt the provider session or require another Play click.
  movePlayerToHost("miniPlayerHost");
}

function getActivePlayerIframe() {
  return activePlayerKind === "movie"
    ? document.getElementById("movieIframe")
    : activePlayerKind === "tv"
      ? document.getElementById("tvIframe")
      : null;
}

function movePlayerToHost(hostId) {
  const iframe = getActivePlayerIframe();
  const host = document.getElementById("miniPlayerHost");
  if (!iframe || !host) return;

  // The iframe has one permanent DOM parent for its entire playback session.
  // hostId remains accepted for compatibility with existing call sites.
  if (iframe.parentElement !== host) host.appendChild(iframe);
  iframe.style.width = "100%";
  iframe.style.height = "100%";
}

function positionFullPlayerOverlay() {
  const mini = document.getElementById("miniPlayer");
  const placeholderId = activePlayerKind === "movie" ? "moviePlayerHost" : "tvPlayerHost";
  const placeholder = document.getElementById(placeholderId);
  if (!mini || !placeholder || !activePlayerKind) return;
  const rect = placeholder.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  mini.classList.remove("is-mini-player");
  mini.classList.add("is-full-player");
  mini.style.left = `${Math.round(rect.left)}px`;
  mini.style.top = `${Math.round(rect.top)}px`;
  mini.style.right = "auto";
  mini.style.bottom = "auto";
  mini.style.width = `${Math.round(rect.width)}px`;
  mini.style.height = `${Math.round(rect.height)}px`;
  mini.classList.remove("hidden");
}

function showFullPlayerOverlay() {
  const mini = document.getElementById("miniPlayer");
  if (!mini) return;
  miniPlayerWasDismissed = false;
  positionFullPlayerOverlay();
}

function showMiniPlayer() {
  const mini = document.getElementById("miniPlayer");
  const miniHost = document.getElementById("miniPlayerHost");
  if (!mini || !miniHost || !activePlayerKind || !activePlayerItem) return;
  const pageIsPlayer = ["moviePlayerView", "tvPlayerView"].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
  if (pageIsPlayer || miniPlayerWasDismissed) return;

  // The iframe remains in its permanent host; only the shell changes layout.
  mini.classList.remove("is-full-player");
  mini.classList.add("is-mini-player");
  mini.style.left = "";
  mini.style.top = "";
  mini.style.right = "";
  mini.style.bottom = "";
  mini.style.width = "";
  mini.style.height = "";
  const activeIframe = getActivePlayerIframe();
  if (activeIframe && activeIframe.parentElement === miniHost) {
    Array.from(miniHost.children).forEach((child) => {
      if (child !== activeIframe) child.remove();
    });
  }
  const title = document.getElementById("miniPlayerTitle");
  if (title) title.textContent = activePlayerItem.title || activePlayerItem.name || "Now playing";
  mini.classList.remove("hidden");
}

function returnToFullPlayer() {
  if (!activePlayerKind || !activePlayerItem) return;
  const pageId = activePlayerKind === "movie" ? "moviePlayer" : "tvPlayer";
  const viewId = pageId + "View";
  const mini = document.getElementById("miniPlayer");
  const currentState = window.history.state;
  if (mini) mini.classList.add("hidden");
  miniPlayerWasDismissed = false;

  // Returning from the mini player should create exactly one Player route whose
  // returnState is the current Details route. This prevents Back from stepping
  // through an older player/source route.
  switchPage(pageId, true);
  if (currentState?.pageId === "detail" && currentState.item) {
    history.pushState({
      pageId,
      item: activePlayerItem,
      scrollY: 0,
      returnState: { ...currentState }
    }, "", `#${pageId}`);
  } else {
    history.replaceState({
      ...(currentState || {}),
      pageId,
      item: activePlayerItem
    }, "", `#${pageId}`);
  }

  // Keep the same iframe mounted; overlay it on the player page's reserved frame.
  // Do not call setupMoviePlayer/setupTvPlayer here: that would reload the iframe.
  showFullPlayerOverlay();
  const titleEl = document.getElementById(activePlayerKind === "movie" ? "moviePlayerTitle" : "tvPlayerTitle");
  if (titleEl) titleEl.textContent = activePlayerItem.title || activePlayerItem.name || "";
  if (viewId) window.scrollTo({ top: 0, behavior: "auto" });
}

function closeMiniPlayer() {
  const iframe = getActivePlayerIframe();
  if (iframe) iframe.src = "about:blank";
  const mini = document.getElementById("miniPlayer");
  if (mini) {
    mini.classList.add("hidden");
    mini.classList.remove("is-mini-player", "is-full-player");
    mini.removeAttribute("style");
  }
  activePlayerKind = null;
  activePlayerItem = null;
  miniPlayerWasDismissed = true;
}

function initMiniPlayerControls() {
  const returnButton = document.getElementById("miniPlayerReturn");
  const closeButton = document.getElementById("miniPlayerClose");
  if (returnButton) returnButton.addEventListener("click", returnToFullPlayer);
  if (closeButton) closeButton.addEventListener("click", closeMiniPlayer);
  let overlayFrame = 0;
  const syncOverlay = () => {
    const mini = document.getElementById("miniPlayer");
    if (!mini || !mini.classList.contains("is-full-player") || overlayFrame) return;
    overlayFrame = requestAnimationFrame(() => {
      overlayFrame = 0;
      positionFullPlayerOverlay();
    });
  };
  window.addEventListener("scroll", syncOverlay, { passive: true });
  window.addEventListener("resize", syncOverlay);
}

/* ==========================================================================
   SPA HISTORY & PHYSICAL BACK BUTTON HANDLING
   ========================================================================== */
function captureHistoryViewState() {
  const currentState = window.history.state;
  if (!currentState || !currentState.pageId || isNavigatingHistory) return;
  const searchView = document.getElementById("searchView");
  const searchVisible = Boolean(searchView && !searchView.classList.contains("hidden") && currentSearchQuery);
  const input = document.getElementById("searchInput");
  const nextState = {
    ...currentState,
    scrollY: window.scrollY,
    searchVisible,
    searchQuery: searchVisible ? currentSearchQuery : "",
    searchOriginPage: searchVisible ? searchOriginPage : currentState.searchOriginPage,
    searchType: currentSearchType,
    searchGenre: currentSearchGenre,
    searchSort: currentSearchSort,
    searchPage: searchVisible ? searchCurrentPage : 1,
    searchInputValue: searchVisible && input ? input.value : "",
    catalogPage: currentState.pageId === "movies" ? moviesCurrentPage
      : currentState.pageId === "tv" ? tvCurrentPage
      : currentState.pageId === "platformCatalog" ? platformCurrentPage : 1,
    catalogType: currentState.pageId === "platformCatalog" ? "all" : currentState.pageId === "movies" ? "movie" : currentState.pageId === "tv" ? "tv" : "all",
    catalogGenre: currentState.pageId === "platformCatalog"
      ? (document.getElementById("platformGenreFilter")?.value || "")
      : currentState.pageId === "movies"
        ? (document.getElementById("movieGenreFilter")?.value || "")
        : currentState.pageId === "tv"
          ? (document.getElementById("tvGenreFilter")?.value || "") : "",
    catalogSort: currentState.pageId === "platformCatalog"
      ? (document.getElementById("platformSortFilter")?.value || "popularity.desc")
      : currentState.pageId === "movies"
        ? (document.getElementById("movieSortFilter")?.value || "popularity.desc")
        : currentState.pageId === "tv"
          ? (document.getElementById("tvSortFilter")?.value || "popularity.desc") : "popularity.desc",
    catalogQuery: currentState.pageId === "platformCatalog"
      ? (document.getElementById("platformSearchFilter")?.value || "")
      : currentState.pageId === "movies"
        ? (document.getElementById("movieSearchFilter")?.value || "")
        : currentState.pageId === "tv"
          ? (document.getElementById("tvSearchFilter")?.value || "") : "",
    relatedPage: currentState.pageId === "moviePlayer" ? movieRelatedCurrentPage
      : currentState.pageId === "tvPlayer" ? tvRelatedCurrentPage : 1,
    relatedItemId: currentState.pageId === "moviePlayer" ? currentMovieRelatedMovieId
      : currentState.pageId === "tvPlayer" ? currentTvRelatedTvId : null,
    relatedType: currentState.pageId === "moviePlayer" ? "movie"
      : currentState.pageId === "tvPlayer" ? "tv" : ""
  };
  window.history.replaceState(nextState, "", window.location.href);
}

async function restoreHistoryViewState(state) {
  if (!state) return;
  // Rebuild the search overlay from its saved context instead of returning to a blank catalog.
  if (state.searchVisible && state.searchQuery) {
    currentSearchQuery = state.searchQuery;
    searchOriginPage = state.searchOriginPage || state.pageId || "home";
    currentSearchType = state.searchType || "all";
    currentSearchGenre = state.searchGenre || "";
    currentSearchSort = state.searchSort || "relevance";
    const input = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearch");
    const typeFilter = document.getElementById("searchTypeFilter");
    const genreFilter = document.getElementById("searchGenreFilter");
    const sortFilter = document.getElementById("searchSortFilter");
    if (input) input.value = state.searchInputValue || state.searchQuery;
    if (clearBtn) clearBtn.classList.remove("hidden");
    if (typeFilter) typeFilter.value = currentSearchType;
    if (genreFilter) genreFilter.value = currentSearchGenre;
    if (sortFilter) sortFilter.value = currentSearchSort;
    updateSearchContextUI();
    await performSearch(state.searchQuery, 1);
    const targetPage = Math.max(1, Number(state.searchPage) || 1);
    for (let page = 2; page <= targetPage && page <= searchTotalPages; page++) {
      await performSearch(state.searchQuery, page);
    }
  }
  // Restore the exact catalog context, including pages already loaded with See More.
  // This prevents returning from a card on page 3 to a freshly reset page 1.
  const targetCatalogPage = Math.max(1, Number(state.catalogPage) || 1);
  if (state.pageId === "platformCatalog" && state.platform) {
    platformMediaType = "all";
    currentSearchType = platformMediaType;
    currentSearchGenre = state.catalogGenre || "";
    currentSearchSort = state.catalogSort === "vote_average.desc" ? "rating"
      : state.catalogSort === "primary_release_date.desc" ? "newest"
      : state.catalogSort === "title.asc" ? "title" : "relevance";
    const sortSelect = document.getElementById("platformSortFilter");
    const queryInput = document.getElementById("platformSearchFilter");
    if (sortSelect) sortSelect.value = state.catalogSort || "popularity.desc";
    if (queryInput) queryInput.value = state.catalogQuery || "";
    updateDynamicGenreOptions("platformGenreFilter", []);
    const genreSelect = document.getElementById("platformGenreFilter");
    if (genreSelect) genreSelect.value = currentSearchGenre;
    await fetchPlatformCatalog(1);
    for (let page = 2; page <= targetCatalogPage && page <= platformTotalPages; page++) {
      await fetchPlatformCatalog(page);
      platformCurrentPage = page;
    }
  } else if (state.pageId === "movies" || state.pageId === "tv") {
    const isMoviesPage = state.pageId === "movies";
    currentSearchType = isMoviesPage ? "movie" : "tv";
    currentSearchGenre = state.catalogGenre || "";
    currentSearchSort = state.catalogSort === "vote_average.desc" ? "rating"
      : (state.catalogSort === "primary_release_date.desc" || state.catalogSort === "first_air_date.desc") ? "newest"
      : (state.catalogSort === "title.asc" || state.catalogSort === "name.asc") ? "title" : "relevance";
    const genreSelect = document.getElementById(isMoviesPage ? "movieGenreFilter" : "tvGenreFilter");
    const sortSelect = document.getElementById(isMoviesPage ? "movieSortFilter" : "tvSortFilter");
    const queryInput = document.getElementById(isMoviesPage ? "movieSearchFilter" : "tvSearchFilter");
    if (genreSelect) genreSelect.value = currentSearchGenre;
    if (sortSelect) sortSelect.value = state.catalogSort || "popularity.desc";
    if (queryInput) queryInput.value = state.catalogQuery || "";
    if (isMoviesPage) {
      await fetchMoviesCatalog(1);
      for (let page = 2; page <= targetCatalogPage && page <= moviesTotalPages; page++) {
        await fetchMoviesCatalog(page);
        moviesCurrentPage = page;
      }
    } else {
      await fetchTvCatalog(1);
      for (let page = 2; page <= targetCatalogPage && page <= tvTotalPages; page++) {
        await fetchTvCatalog(page);
        tvCurrentPage = page;
      }
    }
  }

  // Restore the You Might Also Like list when returning from a card opened
  // inside the player page, including every page previously loaded with See More.
  if ((state.pageId === "moviePlayer" || state.pageId === "tvPlayer") && state.relatedItemId) {
    const relatedType = state.relatedType === "tv" ? "tv" : "movie";
    const targetGrid = relatedType === "movie" ? "movieRelatedGrid" : "tvRelatedGrid";
    await fetchRelated(relatedType, state.relatedItemId, targetGrid);
    const targetRelatedPage = Math.max(1, Number(state.relatedPage) || 1);
    for (let page = 2; page <= targetRelatedPage; page++) {
      if (relatedType === "movie") await handleLoadMoreMovieRelated();
      else await handleLoadMoreTvRelated();
    }
  }

  // Restore only after the destination/results are rendered, preventing smooth-scroll
  // animations or async catalog rendering from overriding the saved position.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: Math.max(0, Number(state.scrollY) || 0), behavior: "auto" });
  }));
}

function initSpaNavigation() {
  history.replaceState({ pageId: "home", scrollY: 0 }, "", "#home");

  window.addEventListener("popstate", async (event) => {
    // A real history transition has occurred; release the Back-button lock immediately,
    // even if restoring Details/search results needs asynchronous network work.
    isBackNavigationPending = false;
    if (backNavigationWatchdog) {
      clearTimeout(backNavigationWatchdog);
      backNavigationWatchdog = null;
    }
    isNavigatingHistory = true;
    const restoredState = event.state;
    // Set the saved search context before rendering the route, so page-specific
    // initialization does not accidentally replace it with the default context.
    if (restoredState) {
      searchOriginPage = restoredState.searchOriginPage || searchOriginPage;
      currentSearchQuery = restoredState.searchVisible ? (restoredState.searchQuery || "") : "";
      currentSearchType = restoredState.searchType || "all";
      currentSearchGenre = restoredState.searchGenre || "";
      currentSearchSort = restoredState.searchSort || "relevance";
    }
    if (restoredState && restoredState.pageId) {
      if (restoredState.pageId === "detail" && restoredState.item) {
        await openCardDetail(restoredState.item, true);
      } else if (restoredState.pageId === "moviePlayer" && restoredState.item) {
        setupMoviePlayer(restoredState.item, true);
      } else if (restoredState.pageId === "tvPlayer" && restoredState.item) {
        await setupTvPlayer(restoredState.item, true);
      } else if (restoredState.pageId === "platformCatalog" && restoredState.platform) {
        openPlatformCatalog(restoredState.platform, true);
      } else {
        switchPage(restoredState.pageId, true);
      }
    } else {
      switchPage("home", true);
    }
    isNavigatingHistory = false;
    resetNavigationLoadingFeedback();
    await restoreHistoryViewState(restoredState);
    // When browser Back leaves the full player, keep the same iframe alive as a mini player.
    setTimeout(() => showMiniPlayer(), 0);
  });
}

function backFromSearchResults() {
  // Search results are an overlay on the current section, not a separate route.
  // Return to that section and clear the query without accidentally leaving the app.
  const destination = searchOriginPage || "home";
  clearSearch();
  // clearSearch already restores the origin page; avoid browser-history changes here.
  return destination;
}

async function navigateBackFromPlayer() {
  if (isBackNavigationPending) return;
  isBackNavigationPending = true;
  const playerState = window.history.state;
  const returnState = playerState?.returnState;

  // Return directly to the exact Details entry that launched playback.
  // Replacing this player entry prevents extra navigation steps.
  if (returnState?.pageId === "detail" && returnState.item) {
    isNavigatingHistory = true;
    try {
      history.replaceState(returnState, "", "#detail");
      await openCardDetail(returnState.item, true);
      await restoreHistoryViewState(returnState);
    } finally {
      isNavigatingHistory = false;
      isBackNavigationPending = false;
      resetNavigationLoadingFeedback();
      setTimeout(() => showMiniPlayer(), 0);
    }
    return;
  }

  isBackNavigationPending = false;
  navigateBackInApp();
}

async function navigateBackFromDetail() {
  if (isBackNavigationPending) return;
  isBackNavigationPending = true;
  const detailState = window.history.state;
  const returnState = detailState?.returnState;
  if (!returnState || !returnState.pageId) {
    isBackNavigationPending = false;
    navigateBackInApp();
    return;
  }

  // Restore a platform catalog directly from the Details return state.
  // Browser history can contain older entries from prior catalog visits; using
  // history.back() here may make the user press Back repeatedly. Replace the
  // current Details entry with its exact catalog state, then render that catalog.
  if (returnState.pageId === "platformCatalog" && returnState.platform) {
    isNavigatingHistory = true;
    try {
      history.replaceState(returnState, "", "#platformCatalog");
      openPlatformCatalog(returnState.platform, true);
      await restoreHistoryViewState(returnState);
    } finally {
      isNavigatingHistory = false;
      isBackNavigationPending = false;
      resetNavigationLoadingFeedback();
      setTimeout(() => showMiniPlayer(), 0);
    }
    return;
  }

  // Restore the originating entry directly instead of depending on a possibly
  // duplicated browser-history entry. This makes Details Back a one-click action.
  isNavigatingHistory = true;
  try {
    history.replaceState(returnState, "", `#${returnState.pageId}`);
    if (returnState.searchVisible) {
      searchOriginPage = returnState.searchOriginPage || returnState.pageId;
      currentSearchQuery = returnState.searchQuery || "";
      currentSearchType = returnState.searchType || "all";
      currentSearchGenre = returnState.searchGenre || "";
      currentSearchSort = returnState.searchSort || "relevance";
    }
    if (returnState.pageId === "detail" && returnState.item) {
      await openCardDetail(returnState.item, true);
    } else if (returnState.pageId === "moviePlayer" && returnState.item) {
      setupMoviePlayer(returnState.item, true);
    } else if (returnState.pageId === "tvPlayer" && returnState.item) {
      await setupTvPlayer(returnState.item, true);
    } else if (returnState.pageId === "platformCatalog" && returnState.platform) {
      openPlatformCatalog(returnState.platform, true);
    } else {
      switchPage(returnState.pageId, true);
    }
    await restoreHistoryViewState(returnState);
  } finally {
    isNavigatingHistory = false;
    isBackNavigationPending = false;
    resetNavigationLoadingFeedback();
    setTimeout(() => showMiniPlayer(), 0);
  }
}

function navigateBackInApp(fallbackPage = "home") {
  // Ignore repeated taps while the browser is already moving through history.
  if (isBackNavigationPending) return;
  const state = window.history.state;
  if (window.history.length > 1 && state && state.pageId) {
    isBackNavigationPending = true;
    window.history.back();
    // Safety valve: if the browser doesn't dispatch popstate (for example, an
    // unusual embedded preview history state), release the button so it never
    // remains locked. Do not force a route change while a legitimate transition runs.
    backNavigationWatchdog = window.setTimeout(() => {
      isBackNavigationPending = false;
      backNavigationWatchdog = null;
      resetNavigationLoadingFeedback();
    }, 1200);
    return;
  }
  switchPage(fallbackPage, false);
}

function pushSpaState(pageId, extraData = null) {
  if (isNavigatingHistory) return;
  const currentState = window.history.state;
  const sameRoute = currentState && currentState.pageId === pageId;
  const sameItem = !extraData || typeof extraData === "string"
    ? (!extraData || currentState?.platform === extraData)
    : (currentState?.item?.id === extraData.id && currentState?.item?.type === extraData.type);
  const stateData = typeof extraData === "string"
    ? { pageId, platform: extraData, scrollY: 0 }
    : { pageId, item: extraData, scrollY: 0 };
  // Preserve the exact browsing/search context before opening a Details page.
  if (pageId === "detail" && currentState && currentState.pageId !== "detail") {
    stateData.returnState = { ...currentState };
  }
  // Keep the originating Details state attached to the player route.
  if ((pageId === "moviePlayer" || pageId === "tvPlayer") && currentState?.pageId === "detail") {
    stateData.returnState = { ...currentState };
  }
  // Re-opening the exact same route should update its state, not create a
  // duplicate entry that makes users press Back more than once.
  if (sameRoute && sameItem) {
    history.replaceState({ ...currentState, ...stateData }, "", `#${pageId}`);
    return;
  }
  history.pushState(stateData, "", `#${pageId}`);
}

/* ==========================================================================
   MOBILE DRAWER & BOTTOM NAV HELPERS
   ========================================================================== */
function setupMobileDrawerEvents() {
  const overlay = document.getElementById("mobileDrawerOverlay");
  const closeBtn = document.getElementById("closeMobileDrawer");

  if (overlay) overlay.addEventListener("click", () => toggleMobileDrawer(false));
  if (closeBtn) closeBtn.addEventListener("click", () => toggleMobileDrawer(false));
}

function toggleMobileDrawer(open) {
  const drawer = document.getElementById("mobileDrawer");
  const overlay = document.getElementById("mobileDrawerOverlay");
  if (!drawer || !overlay) return;

  if (open) {
    drawer.classList.remove("-translate-x-full");
    overlay.classList.remove("opacity-0", "pointer-events-none");
    overlay.classList.add("opacity-100");
  } else {
    drawer.classList.add("-translate-x-full");
    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0", "pointer-events-none");
  }
}

function focusMobileSearch() {
  const input = document.getElementById("searchInput");
  if (input) {
    if (document.getElementById("searchView")?.classList.contains("hidden")) currentSearchType = getVisibleSearchContext();
    updateSearchContextUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // May kaunting delay para umabot sa mata mo ang click animation bago sumulpot ang keyboard
    setTimeout(() => {
      input.focus();
    }, 100);
  }
}


/* ==========================================================================
   SHARED NAVIGATION LOADING FEEDBACK
   ========================================================================== */
function resetNavigationLoadingFeedback() {
  document.querySelectorAll(".platform-back-btn.is-loading").forEach((button) => {
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    if (button.dataset.previousAriaLabel !== undefined) {
      if (button.dataset.previousAriaLabel) button.setAttribute("aria-label", button.dataset.previousAriaLabel);
      else button.removeAttribute("aria-label");
      delete button.dataset.previousAriaLabel;
    }
    const icon = button.querySelector(".platform-back-circle i");
    if (icon && button.dataset.previousIconClass) {
      icon.className = button.dataset.previousIconClass;
      delete button.dataset.previousIconClass;
    }
    const label = button.querySelector(".platform-back-text, .player-mobile-back-label");
    if (label && button.dataset.previousLabel !== undefined) {
      label.textContent = button.dataset.previousLabel;
      delete button.dataset.previousLabel;
    }
  });

  const playButton = document.getElementById("detailPlayNowBtn");
  if (playButton) {
    playButton.classList.remove("is-loading");
    playButton.removeAttribute("aria-busy");
    playButton.disabled = false;
    const icon = playButton.querySelector("i");
    if (icon) icon.className = "fa-solid fa-play";
    const label = document.getElementById("detailPlayNowLabel");
    if (label) label.textContent = "PLAY NOW";
  }
}

function initNavigationLoadingFeedback() {
  // Delegate Back-button feedback once. A failsafe clears the state if history cannot navigate.
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".platform-back-btn");
    if (!button || button.classList.contains("is-loading")) return;

    // Details has a dedicated, immediate Back path. The shared delayed loading
    // handler was adding a second layer of click timing to this one button.
    // Leave Player and all other Back buttons on their existing path.
    if (button.closest("#detailView")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Details Back uses its own route restoration; don't apply the spinner/pulse
      // animation here, which made the chevron appear to rotate.
      navigateBackFromDetail();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.dataset.previousAriaLabel = button.getAttribute("aria-label") || "";
    button.setAttribute("aria-label", "Loading previous page");
    const isMobilePlayerBack = button.classList.contains("player-mobile-back");
    const icon = button.querySelector(".platform-back-circle i");
    const label = button.querySelector(".platform-back-text, .player-mobile-back-label");
    if (!isMobilePlayerBack && icon) {
      button.dataset.previousIconClass = icon.className;
      icon.className = "fa-solid fa-spinner fa-spin text-xs";
    }
    if (!isMobilePlayerBack && label) {
      button.dataset.previousLabel = label.textContent;
      label.textContent = "Loading..";
    }
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        // Search results are a temporary overlay on the current section, not a
        // browser-history route. Their Back button should close the overlay only.
        if (button.closest("#searchView")) {
          backFromSearchResults();
        } else if (button.closest("#moviePlayerView, #tvPlayerView")) {
          // Player Back must use its saved originating Details state. The
          // generic history.back() path can step through earlier source entries.
          navigateBackFromPlayer();
        } else {
          // The shared click handler intercepts the inline Back action, so preserve
          // the platform catalog's explicit fallback to the platform-selection page.
          navigateBackInApp(button.closest("#platformCatalogView") ? "platforms" : "home");
        }
      }, 80);
    });
    window.setTimeout(() => {
      if (button.isConnected && button.classList.contains("is-loading")) resetNavigationLoadingFeedback();
    }, 1800);
  }, true);

  const playButton = document.getElementById("detailPlayNowBtn");
  if (playButton) {
    playButton.addEventListener("click", (event) => {
      if (playButton.classList.contains("is-loading")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Prevent the inline onclick from launching the player a second time.
      event.preventDefault();
      event.stopImmediatePropagation();
      playButton.classList.add("is-loading");
      playButton.setAttribute("aria-busy", "true");
      playButton.disabled = true;
      const icon = playButton.querySelector("i");
      if (icon) icon.className = "fa-solid fa-spinner fa-spin";
      const label = document.getElementById("detailPlayNowLabel");
      if (label) label.textContent = "Loading...";
      const item = activeItem;
      window.setTimeout(() => {
        if (item) launchPlayer(item);
        resetNavigationLoadingFeedback();
      }, 100);
    }, true);
  }
}

/* ==========================================================================
   ROUTING & NAVIGATION
   ========================================================================== */
function switchPage(pageId, isBackEvent = false) {
  // VivaMax is a temporary reveal: hide it when the user leaves Catalogs for a main section.
  // Keep it available while moving within Catalogs / the selected VivaMax catalog.
  if (["home", "movies", "tv", "watchlist"].includes(pageId)) {
    vivamaxUnlockedForCurrentVisit = false;
    const ageGateModal = document.getElementById("vivamaxAgeGateModal");
    if (ageGateModal) { ageGateModal.classList.add("hidden"); ageGateModal.setAttribute("aria-hidden", "true"); }
  }
  // Save the current route before this navigation hides it or scrolls to the top.
  if (!isBackEvent) captureHistoryViewState();
  // Loading feedback is transient UI state: always clear it when the user changes pages.
  resetNavigationLoadingFeedback();
  toggleMobileDrawer(false);
  // A new browsing tab starts clean; search must not leak from Home/Movies/etc.
  const browsingPages = ["home", "movies", "tv", "platforms", "platformCatalog", "watchlist"];
  if (browsingPages.includes(pageId) && document.getElementById("searchView") && !document.getElementById("searchView").classList.contains("hidden") && pageId !== searchOriginPage) {
    const input = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearch");
    if (input) input.value = "";
    if (clearBtn) clearBtn.classList.add("hidden");
    currentSearchQuery = "";
    latestSearchRequestId++;
    searchRawItems = [];
    searchCurrentPage = 1;
    searchTotalPages = 1;
    isSearchLoadingMore = false;
    displayedMovieSearchIds.clear();
    document.getElementById("searchView").classList.add("hidden");
  }
  // Remember the last real browsing section; detail/player views should not replace it.
  // Each browsing page starts with its own clean filter context so a genre selected
  // on Movies cannot silently hide every item in Watchlist or a platform catalog.
  if (["home", "movies", "tv", "platforms", "platformCatalog", "watchlist"].includes(pageId)) {
    const previousPage = searchOriginPage;
    if (pageId !== "platforms") searchOriginPage = pageId;
    if (previousPage !== pageId) {
      currentSearchGenre = "";
      currentSearchSort = "relevance";
      const sharedGenre = document.getElementById("searchGenreFilter");
      const sharedSort = document.getElementById("searchSortFilter");
      if (sharedGenre) sharedGenre.value = "";
      if (sharedSort) sharedSort.value = "relevance";
    }
  }
  // The shared search inherits the section the user is browsing.
  if (pageId === "movies") currentSearchType = "movie";
  else if (pageId === "tv") currentSearchType = "tv";
  else if (pageId === "platformCatalog") currentSearchType = platformMediaType || "all";
  else if (pageId !== "detail" && pageId !== "moviePlayer" && pageId !== "tvPlayer") currentSearchType = "all";
  updateSearchContextUI();

  document.querySelectorAll(".page-view").forEach(el => el.classList.add("hidden"));
  document.getElementById("searchView").classList.add("hidden");

  const targetView = document.getElementById(`${pageId}View`);
  if (targetView) targetView.classList.remove("hidden");

  // Detail, player, and platform-catalog routes push their richer state in their
  // own entry functions. Pushing here too created duplicate history entries and
  // made users press Back twice. Only top-level browsing navigation is pushed here.
  if (!isBackEvent && !["detail", "moviePlayer", "tvPlayer", "platformCatalog"].includes(pageId)) {
    pushSpaState(pageId);
  }

  // Reset Desktop Nav highlight
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("text-brand"));
  const activeNav = document.getElementById(`nav-${pageId}`);
  if (activeNav) activeNav.classList.add("text-brand");

  // Reset Drawer Nav highlight
  document.querySelectorAll(".drawer-nav-btn").forEach(btn => {
    btn.classList.remove("text-brand", "bg-zinc-900/80");
    btn.classList.add("text-zinc-300");
  });
  const activeDrawerNav = document.getElementById(`drawer-nav-${pageId}`);
  if (activeDrawerNav) {
    activeDrawerNav.classList.add("text-brand", "bg-zinc-900/80");
    activeDrawerNav.classList.remove("text-zinc-300");
  }

  // Reset Bottom Nav highlight
  document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
    btn.classList.remove("text-brand");
    btn.classList.add("text-zinc-400");
  });
  const activeBottomHome = document.getElementById("bottom-nav-home");
  if (pageId === "home" && activeBottomHome) {
    activeBottomHome.classList.add("text-brand");
    activeBottomHome.classList.remove("text-zinc-400");
  }

  window.scrollTo({ top: 0, behavior: isBackEvent ? "auto" : "smooth" });

  if (pageId === "movies") fetchMoviesCatalog(1);
  if (pageId === "tv") fetchTvCatalog(1);
  if (pageId === "platforms") renderPlatformsSelectionPage();
  if (pageId === "watchlist") renderWatchlistPage();

  // The player is persistent across every SPA destination, not only Back.
  if (activePlayerKind && activePlayerItem && !miniPlayerWasDismissed) {
    if (pageId === "moviePlayer" || pageId === "tvPlayer") {
      showFullPlayerOverlay();
    } else {
      showMiniPlayer();
    }
  }
}

/* ==========================================================================
   IMAGE & DATA HELPERS
   ========================================================================== */
// Escape untrusted text before placing it in HTML or SVG markup.
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeImageUrl(value) {
  const raw = String(value || "");
  if (raw.startsWith("data:image/svg+xml;charset=utf-8,")) return raw;
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === "https:" && parsed.hostname === "image.tmdb.org") return parsed.href;
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/")) return parsed.href;
  } catch (_) {}
  return createFallbackSVG("No Poster Available");
}

function createFallbackSVG(text) {
  const safeText = escapeHTML(text || "No Poster Available").slice(0, 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
    <rect width="100%" height="100%" fill="#18181b"/>
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#b5f818" font-family="sans-serif" font-size="28" font-weight="bold">PopcornHUB</text>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="16">${safeText}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getTMDBImage(path, size = "w500", fallbackText = "No Image") {
  if (!path || path === "null" || path === "undefined") {
    return createFallbackSVG(fallbackText);
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

async function fetchTMDB(endpoint) {
  // Cache only fresh successful responses and bound memory usage.
  const cached = apiCache.get(endpoint);
  if (cached && Date.now() - cached.savedAt < API_CACHE_TTL_MS) {
    apiCache.delete(endpoint);
    apiCache.set(endpoint, cached);
    return cached.data;
  }
  if (cached) apiCache.delete(endpoint);

  const safeEndpoint = String(endpoint || "").replace(/^\/+/, "");
  if (!safeEndpoint || safeEndpoint.includes("..") || /[\r\n]/.test(safeEndpoint)) {
    console.warn("PopcornHUB: rejected invalid TMDB endpoint.");
    return null;
  }
  const url = `https://api.themoviedb.org/3/${safeEndpoint}${safeEndpoint.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(TMDB_KEY)}`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;

  try {
    const res = await fetch(url, controller ? { signal: controller.signal, mode: "cors", credentials: "omit" } : { mode: "cors", credentials: "omit" });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errorBody = await res.json();
        if (errorBody && errorBody.status_message) detail += `: ${errorBody.status_message}`;
      } catch (_) {}
      throw new Error(`TMDB request failed (${detail})`);
    }
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("TMDB returned an unexpected response.");
    apiCache.set(safeEndpoint, { data, savedAt: Date.now() });
    while (apiCache.size > API_CACHE_MAX_ENTRIES) apiCache.delete(apiCache.keys().next().value);
    return data;
  } catch (err) {
    console.error("TMDB request failed:", safeEndpoint, err);
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

function formatTMDB(list, defaultType) {
  if (!Array.isArray(list)) return [];
  return list.map(i => {
    let resolvedType = i.media_type || defaultType || "movie";
    if (resolvedType !== "movie" && resolvedType !== "tv") {
      resolvedType = i.title ? "movie" : "tv";
    }

    let genreIds = Array.isArray(i.genre_ids) ? i.genre_ids : (Array.isArray(i.genres) ? i.genres.map(g => g.id) : []);

    let genreNames = [];
    if (Array.isArray(i.genre_ids)) {
      genreNames = i.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean);
    } else if (Array.isArray(i.genres)) {
      genreNames = i.genres.map(g => g.name).filter(Boolean);
    }

    return {
      id: i.id,
      title: i.title || i.name || "Untitled",
      poster: getTMDBImage(i.poster_path, "w500", i.title || i.name),
      backdrop: i.backdrop_path ? getTMDBImage(i.backdrop_path, "w1280", "Hero") : null,
      overview: i.overview || "No overview available.",
      type: resolvedType,
      rating: typeof i.vote_average === "number" && i.vote_average > 0 ? i.vote_average.toFixed(1) : "N/A",
      year: (i.release_date || i.first_air_date || "").split("-")[0] || "2026",
      genres: genreNames,
      genre_ids: genreIds
    };
  });
}

function getPlayNowGenreTypeString(item) {
  const typeLabel = item.type === "movie" ? "Movie" : "TV Series";
  if (item.genres && item.genres.length > 0) {
    return `${item.genres.join(" • ")} · ${typeLabel}`;
  }
  return typeLabel;
}

/* ==========================================================================
   DYNAMIC GENRE FILTER HELPER
   ========================================================================== */
const MOVIE_GENRE_IDS = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
const TV_GENRE_IDS = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 10770];

function getSupportedGenreIds(mediaType) {
  if (mediaType === "movie") return MOVIE_GENRE_IDS;
  if (mediaType === "tv") return TV_GENRE_IDS;
  return [...new Set([...MOVIE_GENRE_IDS, ...TV_GENRE_IDS])];
}

// TMDB uses separate Action (28) and Adventure (12) genres for movies,
// but one combined Action & Adventure (10759) genre for TV series.
function normalizeGenreForMediaType(genreId, mediaType) {
  const id = Number(genreId);
  if (mediaType === "tv" && (id === 28 || id === 12)) return "10759";
  return genreId ? String(id) : "";
}

// TV's Action and Adventure labels are intentionally separate in the UI,
// but both map to TMDB's combined TV genre ID 10759.
function getPlatformGenreIdForMediaType(value, mediaType) {
  const selected = String(value || "");
  if (!selected) return "";
  // TMDB uses separate Movie Action/Adventure IDs, but TV combines both
  // under Action & Adventure (10759). Keep the Catalog labels distinct.
  if (mediaType === "tv" && (selected === "28" || selected === "12" ||
      selected === "tv_action" || selected === "tv_adventure" || selected === "10759")) {
    return "10759";
  }
  const numericId = Number(selected);
  return getSupportedGenreIds(mediaType).includes(numericId) ? String(numericId) : "";
}

function getPlatformGenreQueryValue(value, mediaType = platformMediaType) {
  if (mediaType === "tv" && (value === "tv_action" || value === "tv_adventure")) return "10759";
  return normalizeGenreForMediaType(value, mediaType);
}

function getGenreOptionsForMediaType(mediaType) {
  if (mediaType === "tv") {
    return [
      ["tv_action", "Action"],
      ["tv_adventure", "Adventure"],
      ...TV_GENRE_IDS.filter(id => id !== 10759)
        .filter(id => GENRE_MAP[id])
        .map(id => [String(id), GENRE_MAP[id]])
    ].sort((a, b) => a[1].localeCompare(b[1]));
  }

  const ids = mediaType === "movie"
    ? MOVIE_GENRE_IDS
    : [...new Set([...MOVIE_GENRE_IDS, ...TV_GENRE_IDS.filter(id => id !== 10759)])];

  return ids.filter(id => id !== 10759 && GENRE_MAP[id])
    .map(id => [String(id), GENRE_MAP[id]])
    .sort((a, b) => a[1].localeCompare(b[1]));
}

function syncSharedGenreControl() {
  const genreFilter = document.getElementById("searchGenreFilter");
  const trigger = document.getElementById("searchGenreTrigger");
  const menu = document.getElementById("searchGenreMenu");
  if (!genreFilter) return;
  if (trigger) {
    const selected = genreFilter.options[genreFilter.selectedIndex];
    const label = selected ? selected.textContent : "All genres";
    trigger.innerHTML = `${label} <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;
  }
  if (menu) {
    menu.querySelectorAll("[role='option']").forEach(option => {
      option.setAttribute("aria-selected", option.dataset.value === genreFilter.value ? "true" : "false");
    });
  }
}

function updateDynamicGenreOptions(selectElementId, rawItems) {
  const selectEl = document.getElementById(selectElementId);
  if (!selectEl) return;

  let mediaType = "all";
  if (selectElementId === "movieGenreFilter") {
    mediaType = "movie";
  } else if (selectElementId === "tvGenreFilter") {
    mediaType = "tv";
  } else if (selectElementId === "platformGenreFilter") {
    mediaType = "all";
    platformMediaType = "all";
  }

  const currentSelected = selectEl.value;
  const options = getGenreOptionsForMediaType(mediaType);
  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "ALL GENRES";
  selectEl.appendChild(defaultOption);

  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
  });

  let selectedUiValue = currentSelected;
  if (mediaType === "tv" && currentSelected === "10759") {
    selectedUiValue = selectEl.dataset.lastTvGenre === "tv_adventure" ? "tv_adventure" : "tv_action";
  }
  if (Array.from(selectEl.options).some(option => option.value === selectedUiValue)) {
    selectEl.value = selectedUiValue;
  } else {
    selectEl.value = "";
  }
}

/* ==========================================================================
   GRID RENDERING & CARDS
   ========================================================================== */
function renderGrid(containerId, items, append = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!append) {
    container.innerHTML = "";
  }

  if (!items || items.length === 0) {
    if (!append) {
      const isWatchlist = containerId === "watchlistGrid";
      const isSearchResults = containerId === "searchResultsGrid";
      const isPlatformCatalog = containerId === "platformCatalogGrid";
      const isMovieCatalog = containerId === "moviesCatalogGrid";
      const isTvCatalog = containerId === "tvCatalogGrid";
      let title = "Nothing to show here yet";
      let hint = "Try exploring another section.";

      if (isWatchlist && watchlist.length === 0) {
        title = "Your watchlist is empty";
        hint = "Save a movie or TV series with the bookmark icon to find it here later.";
      } else if (isWatchlist) {
        title = "No matching saved titles";
        hint = "Try a different search or reset your filters to see your saved titles.";
      } else if (isSearchResults) {
        title = "No matches found";
        hint = "Try a different title or adjust your filters.";
      } else if (isPlatformCatalog) {
        title = "No titles available here yet";
        hint = "Try another streaming platform or check back later.";
      } else if (isMovieCatalog) {
        title = "No movies to display right now";
        hint = "Try changing your filters or explore another section.";
      } else if (isTvCatalog) {
        title = "No TV series to display right now";
        hint = "Try changing your filters or explore another section.";
      } else if (containerId.startsWith("home")) {
        title = "Nothing to show right now";
        hint = "Check another collection or come back a little later.";
      }

      container.innerHTML = `<div class="search-empty-state col-span-full py-12 px-4 text-center" role="status"><p class="text-zinc-400 text-base font-semibold">${title}</p><p class="text-zinc-500 text-sm mt-2">${hint}</p></div>`;
    }
    return;
  }

  const isWatchlistPage = containerId === "watchlistGrid";
  const isTrendingRow = containerId === "homeTrendingTodayGrid" || containerId === "homeTrendingWeekGrid";

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "group bg-zinc-900 rounded-xl overflow-hidden cursor-pointer hover:-translate-y-1.5 transition duration-300 border border-zinc-800/80 hover:border-brand/50 flex flex-col min-w-[140px] sm:min-w-0 amber-glow";
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${item.title} (${item.year})`);
    
    card.onclick = () => openCardDetail(item);
    card.onkeydown = (e) => { if (e.key === 'Enter') openCardDetail(item); };

    const isBookmarked = watchlist.some(i => i.id === item.id && i.type === item.type);

    let bookmarkIconClass = isBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    let bookmarkTitle = isBookmarked ? 'Remove from Watchlist' : 'Add to Watchlist';

    if (isWatchlistPage) {
      bookmarkIconClass = 'fa-solid fa-trash';
      bookmarkTitle = 'Remove from Watchlist';
    }

    card.innerHTML = `
      <div class="aspect-[2/3] w-full bg-zinc-800 relative overflow-hidden">
        <img loading="lazy"
             src="${escapeHTML(safeImageUrl(item.poster))}"
             alt="${escapeHTML(item.title)}"
             class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
        
        <!-- Attached Ribbon Bookmark at Upper-Left (Icon Only) -->
        <button class="bookmark-btn absolute card-bookmark-ribbon z-10 ${isBookmarked && !isWatchlistPage ? 'text-secondary' : ''}" 
                aria-label="${bookmarkTitle}"
                title="${bookmarkTitle}">
          <i class="${bookmarkIconClass}"></i>
        </button>

        <!-- Rating Star Badge at Upper-Right -->
        <div class="absolute top-2 right-2 z-10">
          <span class="bg-black/80 backdrop-blur-sm text-brand text-[10px] font-bold px-1.5 py-0.5 rounded border border-brand/30">★ ${escapeHTML(item.rating)}</span>
        </div>
      </div>
      <div class="p-2.5 flex flex-col justify-between flex-grow">
        <h3 class="font-semibold truncate group-hover:text-brand transition trending-card-title ${isTrendingRow ? 'text-sm' : 'text-xs'}" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h3>
        <p class="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider trending-card-info">${escapeHTML(item.year)} • ${escapeHTML(item.type)}</p>
      </div>
    `;
    const posterImage = card.querySelector("img");
    if (posterImage) {
      posterImage.addEventListener("error", () => {
        posterImage.onerror = null;
        posterImage.src = createFallbackSVG(item.title);
      }, { once: true });
    }

    const bookmarkBtn = card.querySelector(".bookmark-btn");
    if (bookmarkBtn) {
      bookmarkBtn.onclick = (e) => {
        e.stopPropagation();
        if (isWatchlistPage) {
          openWatchlistRemovalConfirmation(item);
        } else {
          toggleWatchlist(item);
          const nowBookmarked = watchlist.some(i => i.id === item.id && i.type === item.type);
          bookmarkBtn.innerHTML = `<i class="${nowBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i>`;
          bookmarkBtn.className = `bookmark-btn absolute card-bookmark-ribbon z-10 ${nowBookmarked ? 'text-secondary' : ''}`;
          bookmarkBtn.title = nowBookmarked ? 'Remove from Watchlist' : 'Add to Watchlist';
        }
      };
    }

    container.appendChild(card);
  });
}

function renderGridLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const dummy = document.createElement("div");
    dummy.className = "bg-zinc-900/60 rounded-xl overflow-hidden border border-zinc-800/50 animate-pulse-bg aspect-[2/3] min-w-[140px] sm:min-w-0";
    container.appendChild(dummy);
  }
}

/* ==========================================================================
   MINIMALIST "LOAD MORE" & "SEE MORE" BUTTON UI GENERATOR
   ========================================================================== */
function renderLoadMoreButton(containerId, onClickHandler, buttonText = "LOAD MORE") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <button type="button" class="load-more-btn" aria-label="${buttonText}">
      <div class="load-more-circle">
        <i class="fa-solid fa-chevron-down text-xs"></i>
      </div>
      <span class="load-more-text">${buttonText}</span>
    </button>
  `;

  const btn = container.querySelector(".load-more-btn");
  if (btn) {
    btn.onclick = onClickHandler;
  }
}

function removeLoadMoreButton(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = "";
  }
}

function setLoadMoreState(containerId, isLoading, defaultText = "LOAD MORE") {
  const container = document.getElementById(containerId);
  if (!container) return;
  const btn = container.querySelector(".load-more-btn");
  if (!btn) return;

  const icon = btn.querySelector(".load-more-circle i");
  const text = btn.querySelector(".load-more-text");

  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("is-loading");
    if (icon) icon.className = "fa-solid fa-spinner fa-spin text-xs";
    if (text) text.innerText = "Loading..";
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (icon) icon.className = "fa-solid fa-chevron-down text-xs";
    if (text) text.innerText = defaultText;
  }
}

/* ==========================================================================
   STREAMING PLATFORMS FEATURE
   ========================================================================== */
let vivamaxUnlockedForCurrentVisit = false;
let catalogSecretTapCount = 0;
let catalogSecretTapTimer = null;

function isVivamaxUnlocked() {
  // Temporary unlock only: a reload starts locked, and returning Home relocks it.
  return vivamaxUnlockedForCurrentVisit;
}

function setupVivamaxSecretGate() {
  const modal = document.getElementById("vivamaxAgeGateModal");
  const confirmBtn = document.getElementById("vivamaxAgeGateConfirm");
  const cancelBtn = document.getElementById("vivamaxAgeGateCancel");
  if (!modal || modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  const closeModal = () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  };
  cancelBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  confirmBtn?.addEventListener("click", () => {
    vivamaxUnlockedForCurrentVisit = true;
    closeModal();
    renderPlatformsSelectionPage();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}

function triggerCatalogSecretTap() {
  if (isVivamaxUnlocked()) return;
  catalogSecretTapCount += 1;
  if (catalogSecretTapTimer) clearTimeout(catalogSecretTapTimer);
  catalogSecretTapTimer = setTimeout(() => { catalogSecretTapCount = 0; }, 3000);
  if (catalogSecretTapCount >= 5) {
    catalogSecretTapCount = 0;
    clearTimeout(catalogSecretTapTimer);
    const modal = document.getElementById("vivamaxAgeGateModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.getElementById("vivamaxAgeGateConfirm")?.focus();
    }
  }
}

function renderPlatformsSelectionPage() {
  const container = document.getElementById("platformsSelectionGrid");
  if (!container) return;
  container.innerHTML = "";
  setupVivamaxSecretGate();
  const vivamaxUnlocked = isVivamaxUnlocked();

  PLATFORMS_CONFIG.forEach(platform => {
    if (platform.id === "vivamax" && !vivamaxUnlocked) return;
    const card = document.createElement("div");
    card.className = "bg-zinc-900/90 rounded-xl p-5 border border-zinc-800/80 hover:border-brand/60 cursor-pointer transition duration-300 flex flex-col items-center justify-center space-y-3 platform-card-glow group";
    card.onclick = () => openPlatformCatalog(platform.id);

    card.innerHTML = `
      <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg group-hover:scale-110 transition duration-300" style="background-color: ${platform.color}">
        <img src="${platform.iconImg}" alt="${platform.name}" class="w-full h-full object-contain p-2">
      </div>
      <div class="text-center">
        <h3 class="font-bold text-sm text-white group-hover:text-brand transition">${platform.name}</h3>
        <p class="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Catalog</p>
      </div>
    `;

    container.appendChild(card);
  });

  // Keep a discreet blank area after the visible catalog list as a five-tap reveal gesture.
  if (!vivamaxUnlocked) {
    const spacer = document.createElement("div");
    spacer.className = "catalog-secret-spacer";
    spacer.setAttribute("aria-hidden", "true");
    container.appendChild(spacer);

    const secretZone = document.createElement("button");
    secretZone.type = "button";
    secretZone.className = "catalog-secret-tap-zone";
    secretZone.setAttribute("aria-label", "Catalog unlock area. Activate five times to open the age confirmation.");
    secretZone.setAttribute("tabindex", "0");
    // A real button already emits a click for Enter/Space, so one handler supports mouse,
    // touch, and keyboard without accidentally counting a keyboard activation twice.
    secretZone.addEventListener("click", triggerCatalogSecretTap);
    container.appendChild(secretZone);
  }
}

function openPlatformCatalog(platformId, isBackEvent = false) {
  selectedPlatform = PLATFORMS_CONFIG.find(p => p.id === platformId) || PLATFORMS_CONFIG[0];
  platformMediaType = "all";
  platformCurrentPage = 1;
  platformTotalPages = 1;
  displayedPlatformIds.clear();

  if (!isBackEvent) captureHistoryViewState();
  // A newly selected streaming platform starts with a clean shared search.
  // Do not apply the previous platform's query to the newly opened catalog.
  // History restoration (e.g. Details -> Back) intentionally keeps its saved query.
  if (!isBackEvent) {
    const sharedSearchInput = document.getElementById("searchInput");
    const sharedClearButton = document.getElementById("clearSearch");
    if (sharedSearchInput) sharedSearchInput.value = "";
    if (sharedClearButton) sharedClearButton.classList.add("hidden");
    currentSearchQuery = "";
    latestSearchRequestId++;
    searchRawItems = [];
    searchCurrentPage = 1;
    searchTotalPages = 1;
    isSearchLoadingMore = false;
    displayedMovieSearchIds.clear();
  }
  switchPage("platformCatalog", true);
  if (!isBackEvent) {
    pushSpaState("platformCatalog", platformId);
  }

  document.getElementById("platformCatalogTitle").innerText = selectedPlatform.name;
  const platformSearchInput = document.getElementById("platformSearchFilter");
  if (platformSearchInput) platformSearchInput.value = "";
  document.getElementById("platformGenreFilter").value = "";
  document.getElementById("platformSortFilter").value = "popularity.desc";
  currentSearchType = "all";
  currentSearchGenre = "";
  currentSearchSort = "relevance";
  const sharedType = document.getElementById("searchTypeFilter");
  const sharedGenre = document.getElementById("searchGenreFilter");
  const sharedSort = document.getElementById("searchSortFilter");
  if (sharedType) sharedType.value = "all";
  if (sharedGenre) sharedGenre.value = "";
  if (sharedSort) sharedSort.value = "relevance";
  const status = document.getElementById("platformCatalogStatus");
  if (status) { status.classList.add("hidden"); status.textContent = ""; }
  updateSearchContextUI();

  fetchPlatformCatalog(1);
}

async function fetchPlatformCatalog(page = 1) {
  if (!selectedPlatform) return;
  
  const currentReqId = ++latestPlatformRequestId;
  // Catalogs always show both Movies and TV Series. The normal Home search
  // type selector remains independent and is not used by this page.
  const requestMediaType = "all";
  platformMediaType = "all";
  const requestGenre = String(
    document.getElementById("platformGenreFilter")?.value || currentSearchGenre || ""
  );

  if (page === 1) {
    renderGridLoading("platformCatalogGrid");
    removeLoadMoreButton("platformLoadMoreContainer");
    platformCurrentPage = 1;
    platformTotalPages = 1;
    displayedPlatformIds.clear();
  }

  const sort = document.getElementById("platformSortFilter")?.value || "popularity.desc";
  const platformSearchInput = document.getElementById("platformSearchFilter");
  // Platform Catalog uses the shared global search field (there is no separate
  // platformSearchFilter input in the current layout).
  const query = platformSearchInput
    ? platformSearchInput.value.trim()
    : (searchOriginPage === "platformCatalog"
        ? (document.getElementById("searchInput")?.value || "").trim()
        : "");
  const status = document.getElementById("platformCatalogStatus");
  if (status) { status.classList.add("hidden"); status.textContent = ""; }

  // 1. Search Mode Inside Platform
  if (query) {
    const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(query)}&page=${page}`);
    if (currentReqId !== latestPlatformRequestId) return;

    if (data && data.results && data.results.length > 0) {
      platformTotalPages = data.total_pages || 1;
      let filtered = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv");
      if (requestMediaType !== "all") {
        filtered = filtered.filter(r => r.media_type === requestMediaType);
      }

      if (page === 1) {
        updateDynamicGenreOptions("platformGenreFilter", filtered);
      }

      const activeGenreAfterUpdate = requestGenre;
      if (activeGenreAfterUpdate) {
        filtered = filtered.filter(r => {
          const mediaType = r.media_type === "tv" ? "tv" : "movie";
          const genreId = getPlatformGenreIdForMediaType(activeGenreAfterUpdate, mediaType);
          const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
          return genreId && ids.includes(Number(genreId));
        });
      }

      const formatted = formatTMDB(filtered).filter(item =>
        requestMediaType === "all" || item.type === requestMediaType
      );
      const uniqueItems = formatted.filter(item => {
        const itemKey = `${item.type}_${item.id}`;
        if (displayedPlatformIds.has(itemKey)) return false;
        displayedPlatformIds.add(itemKey);
        return true;
      });

      renderGrid("platformCatalogGrid", uniqueItems, page > 1);

      if (page < platformTotalPages) {
        renderLoadMoreButton("platformLoadMoreContainer", handleLoadMorePlatform, "LOAD MORE");
      } else {
        removeLoadMoreButton("platformLoadMoreContainer");
      }
    } else {
      if (page === 1) {
        updateDynamicGenreOptions("platformGenreFilter", []);
        renderGrid("platformCatalogGrid", []);
      }
      removeLoadMoreButton("platformLoadMoreContainer");
    }
    return;
  }

  // 2. Discover Mode (ALL / MOVIES / TV SERIES)
  const pId = selectedPlatform.providerId;
  let rawItems = [];
  let maxPages = 1;
  // PH is the primary region. If a provider has no PH catalog, retry US metadata as a fallback
  // so a platform page is not completely blank when TMDB has no PH provider listings.
  let catalogRegion = "PH";

  try {
    const isVivamaxCatalog = selectedPlatform.id === "vivamax";
    const vivamaxNetworks = (selectedPlatform.networkIds || [4569, 5844]).join("|");
    if (page === 1) {
      let rawGenreSourceList = [];
      if (requestMediaType === "movie" || requestMediaType === "all") {
        const movieGenreEndpoint = isVivamaxCatalog
          ? `discover/movie?with_companies=${selectedPlatform.companyId || 149142}&sort_by=popularity.desc&page=1`
          : `discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`;
        const mBase = await fetchTMDB(movieGenreEndpoint);
        if (currentReqId !== latestPlatformRequestId) return;
        if (mBase && mBase.results) rawGenreSourceList = rawGenreSourceList.concat(mBase.results);
      }
      if (requestMediaType === "tv" || requestMediaType === "all") {
        const tvGenreEndpoint = isVivamaxCatalog
          ? `discover/tv?with_networks=${vivamaxNetworks}&sort_by=popularity.desc&page=1`
          : `discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`;
        const tBase = await fetchTMDB(tvGenreEndpoint);
        if (currentReqId !== latestPlatformRequestId) return;
        if (tBase && tBase.results) rawGenreSourceList = rawGenreSourceList.concat(tBase.results);
      }
      updateDynamicGenreOptions("platformGenreFilter", rawGenreSourceList);
      const platformGenreSelect = document.getElementById("platformGenreFilter");
      if (platformGenreSelect && requestGenre) {
        const requestedGenre = requestMediaType === "tv" && requestGenre === "10759"
          ? (platformGenreSelect.value === "tv_adventure" ? "tv_adventure" : "tv_action")
          : requestGenre;
        if (Array.from(platformGenreSelect.options).some(option => option.value === requestedGenre)) {
          platformGenreSelect.value = requestedGenre;
        } else {
          platformGenreSelect.value = "";
        }
      }
    }

    const activeGenreFilter = requestGenre;

    if (requestMediaType === "movie" || requestMediaType === "all") {
      let movieEndpoint = isVivamaxCatalog
        ? `discover/movie?with_companies=${selectedPlatform.companyId || 149142}&sort_by=${sort}&page=${page}`
        : `discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      const movieGenreId = getPlatformGenreIdForMediaType(activeGenreFilter, "movie");
      if (movieGenreId) movieEndpoint += `&with_genres=${movieGenreId}`;
      let mData = await fetchTMDB(movieEndpoint);
      if (currentReqId !== latestPlatformRequestId) return;
      // Watch-provider catalogs are region-specific. Production-company catalogs like VivaMax
      // must use company IDs and must not be retried as watch providers in other regions.
      if (!isVivamaxCatalog && (!mData || !Array.isArray(mData.results) || mData.results.length === 0)) {
        for (const region of ["US", "GB", "CA", "AU", "IN"]) {
          const regionalData = await fetchTMDB(movieEndpoint.replace("watch_region=PH", `watch_region=${region}`));
          if (currentReqId !== latestPlatformRequestId) return;
          if (regionalData && Array.isArray(regionalData.results) && regionalData.results.length) {
            mData = regionalData;
            catalogRegion = region;
            break;
          }
        }
      }
      if (mData && mData.results) {
        if (mData.total_pages > maxPages) maxPages = mData.total_pages;
        rawItems = rawItems.concat(formatTMDB(mData.results, "movie"));
      }
    }

    if (requestMediaType === "tv" || requestMediaType === "all") {
      let tvEndpoint = isVivamaxCatalog
        ? `discover/tv?with_networks=${vivamaxNetworks}&sort_by=${sort}&page=${page}`
        : `discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      const tvGenreId = getPlatformGenreIdForMediaType(activeGenreFilter, "tv");
      if (tvGenreId) tvEndpoint += `&with_genres=${tvGenreId}`;
      let tData = await fetchTMDB(tvEndpoint);
      if (currentReqId !== latestPlatformRequestId) return;
      if (!isVivamaxCatalog && (!tData || !Array.isArray(tData.results) || tData.results.length === 0)) {
        for (const region of ["US", "GB", "CA", "AU", "IN"]) {
          const regionalData = await fetchTMDB(tvEndpoint.replace("watch_region=PH", `watch_region=${region}`));
          if (currentReqId !== latestPlatformRequestId) return;
          if (regionalData && Array.isArray(regionalData.results) && regionalData.results.length) {
            tData = regionalData;
            catalogRegion = region;
            break;
          }
        }
      }
      if (tData && tData.results) {
        if (tData.total_pages > maxPages) maxPages = tData.total_pages;
        rawItems = rawItems.concat(formatTMDB(tData.results, "tv"));
      }
    }

    if (currentReqId !== latestPlatformRequestId) return;

    platformTotalPages = maxPages;

    if (currentSearchSort === "title") rawItems.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")));
    else if (currentSearchSort === "newest") rawItems.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
    else if (currentSearchSort === "rating") rawItems.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    // Final guard: never render mixed Movies/TV cards when a single content
    // type is selected, even if a provider fallback or stale response is odd.
    const typeSafeItems = requestMediaType === "all"
      ? rawItems
      : rawItems.filter(item => item.type === requestMediaType);
    const uniqueItems = typeSafeItems.filter(item => {
      const itemKey = `${item.type}_${item.id}`;
      if (displayedPlatformIds.has(itemKey)) return false;
      displayedPlatformIds.add(itemKey);
      return true;
    });

    renderGrid("platformCatalogGrid", uniqueItems, page > 1);
    if (status && page === 1 && uniqueItems.length > 0 && catalogRegion === "US") {
      status.textContent = `Showing ${catalogRegion} catalog metadata because no titles were listed for the Philippines. Availability may vary by region.`;
      status.classList.remove("hidden");
    } else if (status && page === 1 && uniqueItems.length === 0) {
      status.textContent = `TMDB returned no titles for ${selectedPlatform.name}. Try another platform or adjust the filters.`;
      status.classList.remove("hidden");
    }

    if (page < platformTotalPages) {
      renderLoadMoreButton("platformLoadMoreContainer", handleLoadMorePlatform, "LOAD MORE");
    } else {
      removeLoadMoreButton("platformLoadMoreContainer");
    }
  } catch (e) {
    if (page === 1) renderGrid("platformCatalogGrid", []);
    removeLoadMoreButton("platformLoadMoreContainer");
  }
}

async function handleLoadMorePlatform() {
  if (isPlatformLoadingMore || platformCurrentPage >= platformTotalPages) return;

  isPlatformLoadingMore = true;
  setLoadMoreState("platformLoadMoreContainer", true, "LOAD MORE");

  const nextPage = platformCurrentPage + 1;
  await fetchPlatformCatalog(nextPage);
  platformCurrentPage = nextPage;

  isPlatformLoadingMore = false;
  if (platformCurrentPage < platformTotalPages) {
    setLoadMoreState("platformLoadMoreContainer", false, "LOAD MORE");
  }
}

function setupPlatformFilters() {
  const btn = document.getElementById("platformFilterBtn");
  if (btn) btn.onclick = () => fetchPlatformCatalog(1);

  const genreSelect = document.getElementById("platformGenreFilter");
  if (genreSelect) {
    genreSelect.addEventListener("change", () => {
      if (genreSelect.value === "tv_action" || genreSelect.value === "tv_adventure") {
        genreSelect.dataset.lastTvGenre = genreSelect.value;
      }
      currentSearchGenre = genreSelect.value;
      const sharedGenre = document.getElementById("searchGenreFilter");
      if (sharedGenre) {
        sharedGenre.value = platformMediaType === "tv" ? genreSelect.value : currentSearchGenre;
        if (platformMediaType === "tv") sharedGenre.dataset.lastTvGenre = genreSelect.value;
      }
      syncSharedGenreControl();
      fetchPlatformCatalog(1);
    });
  }

  const sortSelect = document.getElementById("platformSortFilter");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSearchSort = sortSelect.value === "vote_average.desc" ? "rating" : "relevance";
      const sharedSort = document.getElementById("searchSortFilter");
      if (sharedSort) sharedSort.value = currentSearchSort;
      fetchPlatformCatalog(1);
    });
  }

  const searchInput = document.getElementById("platformSearchFilter");
  if (searchInput) {
    let timer;
    searchInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchPlatformCatalog(1), 350);
    });
  }
}

/* ==========================================================================
   HERO CAROUSEL SYSTEM
   ========================================================================== */
function initHeroCarousel() {
  if (!heroItems || heroItems.length === 0) return;
  renderHeroDots();
  renderHeroThumbnails();
  setHeroSlide(0);
  startHeroTimer();
}

function startHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => {
    nextHeroSlide();
  }, 5000);
}

function nextHeroSlide() {
  if (!heroItems || heroItems.length === 0) return;
  const nextIdx = (currentHeroIndex + 1) % heroItems.length;
  setHeroSlide(nextIdx);
}

function previousHeroSlide() {
  if (!heroItems || heroItems.length === 0) return;
  const prevIdx = (currentHeroIndex - 1 + heroItems.length) % heroItems.length;
  setHeroSlide(prevIdx);
}

function setHeroSlide(index) {
  if (heroTransitionLock) return;
  heroTransitionLock = true;
  currentHeroIndex = index;
  const item = heroItems[index];

  const container = document.getElementById("heroContainer");
  const bg = document.getElementById("heroBg");

  container.classList.remove("hero-active");

  const backdropUrl = item.backdrop || item.poster || createFallbackSVG("PopcornHUB");
  const imgLoader = new Image();
  imgLoader.src = backdropUrl;

  const applySlide = () => {
    bg.classList.remove("loaded");
    setTimeout(() => {
      bg.style.backgroundImage = `url('${backdropUrl}')`;
      bg.classList.add("loaded");

      document.getElementById("heroTitle").innerText = item.title;
      document.getElementById("heroOverview").innerText = item.overview;
      document.getElementById("heroBadgeYear").innerText = `${item.type.toUpperCase()} • ${item.year}`;

      document.getElementById("heroPlayBtn").onclick = () => openCardDetail(item);

      updateHeroWatchlistBtn(item);
      document.getElementById("heroWatchlistBtn").onclick = () => {
        toggleWatchlist(item);
        updateHeroWatchlistBtn(item);
      };

      updateDotsUI();
      updateThumbnailsUI();

      container.classList.add("hero-active");
      heroTransitionLock = false;
    }, 150);
  };

  imgLoader.onload = applySlide;
  imgLoader.onerror = () => {
    bg.style.backgroundImage = `url('${createFallbackSVG("PopcornHUB")}')`;
    applySlide();
  };
}

function setupHeroSwipe() {
  const heroBanner = document.getElementById("heroBanner");
  if (!heroBanner) return;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  const minSwipeDistance = 40;

  heroBanner.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    deltaX = 0;
    deltaY = 0;
  }, { passive: true });

  heroBanner.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    deltaX = e.touches[0].clientX - startX;
    deltaY = e.touches[0].clientY - startY;
  }, { passive: true });

  heroBanner.addEventListener("touchend", (e) => {
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        nextHeroSlide();
      } else {
        previousHeroSlide();
      }
      startHeroTimer();
    }
    startX = 0;
    startY = 0;
    deltaX = 0;
    deltaY = 0;
  }, { passive: true });
}

function updateHeroWatchlistBtn(item) {
  const btn = document.getElementById("heroWatchlistBtn");
  if (!btn) return;
  const isSaved = watchlist.some(i => i.id === item.id && i.type === item.type);
  if (isSaved) {
    btn.innerHTML = `<i class="fa-solid fa-check text-secondary"></i> WATCHLIST`;
    btn.className = "bg-secondary/20 border border-secondary text-secondary font-extrabold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center gap-2 text-xs sm:text-sm transition active:scale-95";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus mr-1"></i> WATCHLIST`;
    btn.className = "glass-btn text-white font-extrabold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl flex items-center gap-2 text-xs sm:text-sm transition active:scale-95";
  }
}

function renderHeroDots() {
  const dotsContainer = document.getElementById("heroDots");
  if (!dotsContainer) return;
  dotsContainer.innerHTML = "";

  heroItems.forEach((_, idx) => {
    const dot = document.createElement("button");
    dot.setAttribute("aria-label", `Slide ${idx + 1}`);
    dot.className = `h-1.5 rounded-full transition-all duration-300 ${idx === currentHeroIndex ? 'w-8 bg-brand' : 'w-2 bg-white/30 hover:bg-white/60'}`;
    dot.onclick = () => {
      setHeroSlide(idx);
      startHeroTimer();
    };
    dotsContainer.appendChild(dot);
  });
}

function updateDotsUI() {
  const dots = document.querySelectorAll("#heroDots button");
  dots.forEach((dot, idx) => {
    dot.className = idx === currentHeroIndex 
      ? "h-1.5 w-8 bg-brand rounded-full transition-all duration-300"
      : "h-1.5 w-2 bg-white/30 hover:bg-white/60 rounded-full transition-all duration-300";
  });
}

function renderHeroThumbnails() {
  const thumbsContainer = document.getElementById("heroThumbnails");
  if (!thumbsContainer) return;
  thumbsContainer.innerHTML = "";

  heroItems.forEach((item, idx) => {
    const thumb = document.createElement("div");
    thumb.className = `w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-300 ${idx === currentHeroIndex ? 'border-brand scale-110 shadow-lg shadow-brand/20' : 'border-transparent opacity-50 hover:opacity-100'}`;
    thumb.onclick = () => {
      setHeroSlide(idx);
      startHeroTimer();
    };
    thumb.innerHTML = `<img src="${escapeHTML(safeImageUrl(item.poster))}" alt="${escapeHTML(item.title)}" class="w-full h-full object-cover">`;
    const image = thumb.querySelector("img");
    image.addEventListener("error", () => { image.src = createFallbackSVG(item.title); }, { once: true });
    thumbsContainer.appendChild(thumb);
  });
}

function updateThumbnailsUI() {
  const thumbs = document.querySelectorAll("#heroThumbnails > div");
  thumbs.forEach((thumb, idx) => {
    thumb.className = idx === currentHeroIndex
      ? "w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 border-brand scale-110 shadow-lg shadow-brand/20 transition-all duration-300"
      : "w-12 h-16 rounded-lg overflow-hidden cursor-pointer border-2 border-transparent opacity-50 hover:opacity-100 transition-all duration-300";
  });
}

/* ==========================================================================
   FETCH HOME & CATALOG DATA
   ========================================================================== */
async function fetchHomeData() {
  renderGridLoading("homeTrendingTodayGrid");
  renderGridLoading("homeTrendingWeekGrid");
  renderGridLoading("homePopularMoviesGrid");
  renderGridLoading("homePopularTvGrid");

  try {
    const dataToday = await fetchTMDB("trending/all/day");
    if (dataToday && dataToday.results) {
      const itemsToday = formatTMDB(dataToday.results);
      if (itemsToday.length > 0) {
        heroItems = itemsToday.slice(0, 5);
        initHeroCarousel();
      }
      renderGrid("homeTrendingTodayGrid", itemsToday);
    } else {
      renderRowError("homeTrendingTodayGrid", "Unable to load today's trending titles.");
    }
  } catch (err) {
    renderRowError("homeTrendingTodayGrid", "Unable to load today's trending titles.");
  }

  try {
    const dataWeek = await fetchTMDB("trending/all/week");
    if (dataWeek && dataWeek.results) {
      renderGrid("homeTrendingWeekGrid", formatTMDB(dataWeek.results));
    } else {
      renderRowError("homeTrendingWeekGrid", "Unable to load weekly trending titles.");
    }
  } catch (err) {
    renderRowError("homeTrendingWeekGrid", "Unable to load weekly trending titles.");
  }

  try {
    const dataPopM = await fetchTMDB("movie/popular");
    if (dataPopM && dataPopM.results) {
      renderGrid("homePopularMoviesGrid", formatTMDB(dataPopM.results, "movie"));
    } else {
      renderRowError("homePopularMoviesGrid", "Unable to load popular movies.");
    }
  } catch (err) {
    renderRowError("homePopularMoviesGrid", "Unable to load popular movies.");
  }

  try {
    const dataPopTv = await fetchTMDB("tv/popular");
    if (dataPopTv && dataPopTv.results) {
      renderGrid("homePopularTvGrid", formatTMDB(dataPopTv.results, "tv"));
    } else {
      renderRowError("homePopularTvGrid", "Unable to load popular TV series.");
    }
  } catch (err) {
    renderRowError("homePopularTvGrid", "Unable to load popular TV series.");
  }
}

function renderRowError(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">${escapeHTML(message)}</p>`;
  }
}

async function fetchMoviesCatalog(page = 1) {
  const requestId = ++latestMoviesRequestId;
  if (page === 1) {
    renderGridLoading("moviesCatalogGrid");
    moviesCurrentPage = 1;
    moviesTotalPages = 1;
    displayedMoviesIds.clear();
    removeLoadMoreButton("moviesSeeMoreContainer");
  }

  const movieSortSelect = document.getElementById("movieSortFilter");
  const sort = movieSortSelect
    ? movieSortSelect.value
    : ({ relevance: "popularity.desc", rating: "vote_average.desc", newest: "primary_release_date.desc", title: "title.asc" })[currentSearchSort] || "popularity.desc";
  const query = document.getElementById("movieSearchFilter") ? document.getElementById("movieSearchFilter").value.trim() : "";

  if (page === 1) {
    let rawGenreSourceEndpoint = `discover/movie?sort_by=popularity.desc&page=1`;
    if (query) rawGenreSourceEndpoint = `search/movie?query=${encodeURIComponent(query)}&page=1`;
    const genreSourceData = await fetchTMDB(rawGenreSourceEndpoint);
    if (requestId !== latestMoviesRequestId) return;
    if (genreSourceData && genreSourceData.results) {
      updateDynamicGenreOptions("movieGenreFilter", genreSourceData.results);
    }
  }

  const movieGenreSelect = document.getElementById("movieGenreFilter");
  const activeGenreFilter = movieGenreSelect ? movieGenreSelect.value : currentSearchGenre;

  let endpoint = `discover/movie?sort_by=${sort}&page=${page}`;
  if (activeGenreFilter) endpoint += `&with_genres=${activeGenreFilter}`;
  if (query) endpoint = `search/movie?query=${encodeURIComponent(query)}&page=${page}`;

  const data = await fetchTMDB(endpoint);
  if (requestId !== latestMoviesRequestId) return;

  if (data && data.results && data.results.length > 0) {
    moviesTotalPages = data.total_pages || 1;
    let resultsList = data.results;

    if (query && activeGenreFilter) {
      resultsList = resultsList.filter(r => {
        const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
        return ids.includes(Number(activeGenreFilter));
      });
    }

    const formatted = formatTMDB(resultsList, "movie");
    if (sort === "title.asc" || sort === "name.asc") formatted.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")));
    else if (sort === "vote_average.desc") formatted.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    else if (sort === "primary_release_date.desc") formatted.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
    const uniqueItems = formatted.filter(item => !displayedMoviesIds.has(item.id));
    uniqueItems.forEach(item => displayedMoviesIds.add(item.id));

    renderGrid("moviesCatalogGrid", uniqueItems, page > 1);

    if (page < moviesTotalPages) {
      renderLoadMoreButton("moviesSeeMoreContainer", handleSeeMoreMovies, "SEE MORE");
    } else {
      removeLoadMoreButton("moviesSeeMoreContainer");
    }
  } else {
    if (page === 1) {
      document.getElementById("moviesCatalogGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load movie catalog.</p>`;
    }
    removeLoadMoreButton("moviesSeeMoreContainer");
  }
}

async function handleSeeMoreMovies() {
  if (isMoviesLoadingMore || moviesCurrentPage >= moviesTotalPages) return;

  isMoviesLoadingMore = true;
  setLoadMoreState("moviesSeeMoreContainer", true, "SEE MORE");

  const nextPage = moviesCurrentPage + 1;
  await fetchMoviesCatalog(nextPage);
  moviesCurrentPage = nextPage;

  isMoviesLoadingMore = false;
  if (moviesCurrentPage < moviesTotalPages) {
    setLoadMoreState("moviesSeeMoreContainer", false, "SEE MORE");
  }
}

async function fetchTvCatalog(page = 1) {
  const requestId = ++latestTvRequestId;
  if (page === 1) {
    renderGridLoading("tvCatalogGrid");
    tvCurrentPage = 1;
    tvTotalPages = 1;
    displayedTvIds.clear();
    removeLoadMoreButton("tvSeeMoreContainer");
  }

  const tvSortSelect = document.getElementById("tvSortFilter");
  const sort = tvSortSelect
    ? tvSortSelect.value
    : ({ relevance: "popularity.desc", rating: "vote_average.desc", newest: "first_air_date.desc", title: "name.asc" })[currentSearchSort] || "popularity.desc";
  const query = document.getElementById("tvSearchFilter") ? document.getElementById("tvSearchFilter").value.trim() : "";

  if (page === 1) {
    let rawGenreSourceEndpoint = `discover/tv?sort_by=popularity.desc&page=1`;
    if (query) rawGenreSourceEndpoint = `search/tv?query=${encodeURIComponent(query)}&page=1`;
    const genreSourceData = await fetchTMDB(rawGenreSourceEndpoint);
    if (requestId !== latestTvRequestId) return;
    if (genreSourceData && genreSourceData.results) {
      updateDynamicGenreOptions("tvGenreFilter", genreSourceData.results);
    }
  }

  const tvGenreSelect = document.getElementById("tvGenreFilter");
  const activeGenreFilter = tvGenreSelect ? tvGenreSelect.value : currentSearchGenre;

  let endpoint = `discover/tv?sort_by=${sort}&page=${page}`;
  if (activeGenreFilter) endpoint += `&with_genres=${activeGenreFilter}`;
  if (query) endpoint = `search/tv?query=${encodeURIComponent(query)}&page=${page}`;

  const data = await fetchTMDB(endpoint);
  if (requestId !== latestTvRequestId) return;

  if (data && Array.isArray(data.results)) {
    tvTotalPages = data.total_pages || 1;
    let resultsList = data.results;

    if (query && activeGenreFilter) {
      resultsList = resultsList.filter(r => {
        const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
        return ids.includes(Number(activeGenreFilter));
      });
    }

    const formatted = formatTMDB(resultsList, "tv");
    if (sort === "name.asc" || sort === "title.asc") formatted.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")));
    else if (sort === "vote_average.desc") formatted.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    else if (sort === "first_air_date.desc") formatted.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
    const uniqueItems = formatted.filter(item => !displayedTvIds.has(item.id));
    uniqueItems.forEach(item => displayedTvIds.add(item.id));

    renderGrid("tvCatalogGrid", uniqueItems, page > 1);

    if (page < tvTotalPages) {
      renderLoadMoreButton("tvSeeMoreContainer", handleSeeMoreTv, "SEE MORE");
    } else {
      removeLoadMoreButton("tvSeeMoreContainer");
    }
  } else {
    if (page === 1) {
      if (data && Array.isArray(data.results)) {
        renderGrid("tvCatalogGrid", []);
      } else {
        document.getElementById("tvCatalogGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load TV series catalog. Please try again.</p>`;
      }
    }
    removeLoadMoreButton("tvSeeMoreContainer");
  }
}

async function handleSeeMoreTv() {
  if (isTvLoadingMore || tvCurrentPage >= tvTotalPages) return;

  isTvLoadingMore = true;
  setLoadMoreState("tvSeeMoreContainer", true, "SEE MORE");

  const nextPage = tvCurrentPage + 1;
  await fetchTvCatalog(nextPage);
  tvCurrentPage = nextPage;

  isTvLoadingMore = false;
  if (tvCurrentPage < tvTotalPages) {
    setLoadMoreState("tvSeeMoreContainer", false, "SEE MORE");
  }
}

function setupCatalogFilters() {
  const movieFilterBtn = document.getElementById("movieFilterBtn");
  if (movieFilterBtn) {
    movieFilterBtn.onclick = () => fetchMoviesCatalog(1);
  }

  const movieGenreSelect = document.getElementById("movieGenreFilter");
  if (movieGenreSelect) {
    movieGenreSelect.addEventListener("change", () => fetchMoviesCatalog(1));
  }

  const movieSortSelect = document.getElementById("movieSortFilter");
  if (movieSortSelect) {
    movieSortSelect.addEventListener("change", () => fetchMoviesCatalog(1));
  }

  const movieSearchFilter = document.getElementById("movieSearchFilter");
  if (movieSearchFilter) {
    let timer;
    movieSearchFilter.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchMoviesCatalog(1), 350);
    });
  }

  const tvFilterBtn = document.getElementById("tvFilterBtn");
  if (tvFilterBtn) {
    tvFilterBtn.onclick = () => fetchTvCatalog(1);
  }

  const tvGenreSelect = document.getElementById("tvGenreFilter");
  if (tvGenreSelect) {
    tvGenreSelect.addEventListener("change", () => fetchTvCatalog(1));
  }

  const tvSortSelect = document.getElementById("tvSortFilter");
  if (tvSortSelect) {
    tvSortSelect.addEventListener("change", () => fetchTvCatalog(1));
  }

  const tvSearchFilter = document.getElementById("tvSearchFilter");
  if (tvSearchFilter) {
    let timer;
    tvSearchFilter.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchTvCatalog(1), 350);
    });
  }
}

/* ==========================================================================
   DETAIL VIEW & TRAILERS
   ========================================================================== */
async function openCardDetail(item, isBackEvent = false) {
  // Capture the player recommendation pagination and scroll position at the
  // exact moment a card is opened (See More may not have triggered a scroll event).
  if (!isBackEvent) captureHistoryViewState();
  activeItem = item;
  switchPage("detail", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("detail", item);
  }

  document.getElementById("detailTitle").innerText = item.title;
  document.getElementById("detailOverview").innerText = item.overview;
  
  const detailPoster = document.getElementById("detailPoster");
  detailPoster.src = item.poster;
  detailPoster.onerror = () => { detailPoster.src = createFallbackSVG(item.title); };

  document.getElementById("detailBadgeType").innerText = item.type === "movie" ? "MOVIE" : "TV SERIES";
  document.getElementById("detailBadgeRating").innerText = `★ ${item.rating}`;
  document.getElementById("detailBadgeYear").innerText = item.year;

  const genresEl = document.getElementById("detailGenres");
  if (genresEl) {
    genresEl.innerText = (item.genres && item.genres.length > 0) ? item.genres.join(" • ") : "";
  }

  updateDetailWatchlistButton();
  document.getElementById("detailWatchlistBtn").onclick = () => toggleWatchlist(item);
  document.getElementById("detailPlayNowBtn").onclick = () => launchPlayer(item);

  const trailerFrame = document.getElementById("trailerFrame");
  const trailerFallback = document.getElementById("trailerFallback");
  const trailerKey = `${item.type}/${item.id}`;

  // Returning from the player to the same Details page must not restart the
  // YouTube iframe. Reloading it here can steal focus and makes Back feel flaky.
  if (detailTrailerKey === trailerKey && trailerFrame && trailerFrame.getAttribute("src")) {
    trailerFrame.classList.remove("hidden");
    trailerFallback.classList.add("hidden");
    return;
  }

  detailTrailerKey = trailerKey;
  const requestId = ++detailTrailerRequestId;
  trailerFrame.removeAttribute("src");
  trailerFrame.classList.add("hidden");
  trailerFallback.classList.remove("hidden");

  const videoData = await fetchTMDB(`${item.type}/${item.id}/videos`);
  // Ignore stale responses if the user has already opened another title.
  if (requestId !== detailTrailerRequestId || !videoData || !videoData.results) return;
  const trailer = videoData.results.find(v => (v.type === "Trailer" || v.type === "Teaser") && v.site === "YouTube");
  if (trailer) {
    trailerFrame.src = `https://www.youtube.com/embed/${trailer.key}`;
    trailerFrame.classList.remove("hidden");
    trailerFallback.classList.add("hidden");
  }
}

/* ==========================================================================
   WATCHLIST REMOVAL CONFIRMATION
   ========================================================================== */
let pendingWatchlistRemoval = null;

function setupWatchlistRemovalConfirmation() {
  const modal = document.getElementById("watchlistRemoveModal");
  const cancelBtn = document.getElementById("watchlistRemoveCancel");
  const confirmBtn = document.getElementById("watchlistRemoveConfirm");
  if (!modal || modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  const closeModal = () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    pendingWatchlistRemoval = null;
  };

  cancelBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
  });
  confirmBtn?.addEventListener("click", () => {
    const item = pendingWatchlistRemoval;
    closeModal();
    if (item) toggleWatchlist(item);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}

function openWatchlistRemovalConfirmation(item) {
  const modal = document.getElementById("watchlistRemoveModal");
  const description = document.getElementById("watchlistRemoveDescription");
  const cancelBtn = document.getElementById("watchlistRemoveCancel");
  if (!modal || !item) return;
  pendingWatchlistRemoval = item;
  if (description) {
    const title = item.title || item.name || "this title";
    description.textContent = `Are you sure you want to remove “${title}” from your watchlist?`;
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  cancelBtn?.focus();
}

/* ==========================================================================
   WATCHLIST MANAGEMENT
   ========================================================================== */
function toggleWatchlist(item) {
  const index = watchlist.findIndex(i => i.id === item.id && i.type === item.type);
  if (index > -1) {
    watchlist.splice(index, 1);
  } else {
    watchlist.push(item);
  }
  
  try {
    localStorage.setItem("popcornWatchlist", JSON.stringify(watchlist));
  } catch (e) {
    console.error("LocalStorage error:", e);
  }

  updateDetailWatchlistButton();
  updateWatchlistBadge();

  if (!document.getElementById("watchlistView").classList.contains("hidden")) {
    renderWatchlistPage();
  }
}

function updateDetailWatchlistButton() {
  const btn = document.getElementById("detailWatchlistBtn");
  if (!activeItem || !btn) return;

  const isSaved = watchlist.some(i => i.id === activeItem.id && i.type === activeItem.type);
  if (isSaved) {
    btn.innerHTML = `<i class="fa-solid fa-check text-secondary"></i> WATCHLIST`;
    btn.className = "bg-secondary/20 border border-secondary text-secondary font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm transition";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus mr-1"></i> WATCHLIST`;
    btn.className = "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 font-extrabold px-6 py-3 rounded-xl flex items-center gap-2 text-sm transition";
  }
}

function updateWatchlistBadge() {
  const badge = document.getElementById("watchlistBadgeCount");
  const drawerBadge = document.getElementById("drawerWatchlistBadgeCount");

  const count = watchlist.length;
  [badge, drawerBadge].forEach(b => {
    if (!b) return;
    if (count > 0) {
      b.innerText = count;
      b.classList.remove("hidden");
    } else {
      b.classList.add("hidden");
    }
  });
}

function renderWatchlistPage() {
  let items = [...watchlist];
  if (currentSearchType !== "all") items = items.filter(item => item.type === currentSearchType);
  if (currentSearchGenre) items = items.filter(item => {
    const ids = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number)
      : Array.isArray(item.genres) ? item.genres.map(g => Number(typeof g === "object" ? g.id : g)).filter(Number.isFinite)
      : [];
    return ids.includes(Number(currentSearchGenre));
  });
  if (currentSearchSort === "rating") items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  else if (currentSearchSort === "newest") items.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
  else if (currentSearchSort === "title") items.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")));
  renderGrid("watchlistGrid", items);
}

/* ==========================================================================
   CONTINUE WATCHING PLAYBACK POSITION
   Saves movie positions using the approved movie rules. TV positions are saved
   only after 1.5% of verified forward playback in the selected episode.
   ========================================================================== */
function formatContinueTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}
function getContinueProgress(type, id, season, episode) {
  try {
    const all = JSON.parse(localStorage.getItem(CONTINUE_PROGRESS_KEY) || "{}");
    const key = type === "tv" ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
    const record = all[key];
    return record && Number.isFinite(Number(record.currentTime)) && Number(record.currentTime) > 0 ? record : null;
  } catch (_) { return null; }
}
function resetContinuePlaybackSession(type, id, season, episode) {
  const key = type === "tv" ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
  continuePlaybackSession = { key, lastTime: null, lastWallTime: null, playedSeconds: 0 };
}

function beginContinuePage(type, item) {
  if (!item || !item.id) { continuePageState = null; return; }
  const id = String(item.id);
  let hasSavedResume = false;
  let resumeTime = 0;
  if (type === "movie") {
    const record = getMovieContinueRecords()[id];
    const progress = getContinueProgress("movie", id);
    hasSavedResume = Boolean(record && progress && Number(progress.currentTime) > 0 && !isPlaybackCompleted("movie", id));
    // Freeze the Continue timestamp for this player-page visit. Live progress
    // may keep updating in storage, but the visible card must remain a snapshot.
    resumeTime = hasSavedResume ? Number(progress.currentTime) : 0;
  } else {
    const record = getTvContinueRecord(id);
    const progress = record && getContinueProgress("tv", id, record.season, record.episode);
    hasSavedResume = Boolean(record && progress && Number(progress.currentTime) > 0 && !isPlaybackCompleted("tv", id, record.season, record.episode));
  }
  continuePageState = { key: `${type}:${id}`, eligible: hasSavedResume, resumeTime, hiddenUntilExit: false, completed: false };
}

function isContinuePageVisible(type, item) {
  const key = item && item.id ? `${type}:${item.id}` : "";
  return Boolean(continuePageState && continuePageState.key === key && continuePageState.eligible && !continuePageState.hiddenUntilExit);
}

function hideContinueForCurrentPage(type, item) {
  const key = item && item.id ? `${type}:${item.id}` : "";
  if (continuePageState && continuePageState.key === key) continuePageState.hiddenUntilExit = true;
}

function scrollPlayerPageToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Keep the action tab mounted while fading so the transition is visible.
function hideContinueAction(button) {
  if (!button) return;
  button.setAttribute("aria-hidden", "true");
  button.classList.remove("hidden");
  button.classList.add("continue-progress-hidden");
  button.onclick = null;
  window.setTimeout(() => {
    if (button.classList.contains("continue-progress-hidden")) button.classList.add("hidden");
  }, 1150);
}

function showContinueAction(button) {
  if (!button) return;
  button.classList.remove("hidden", "continue-progress-hidden");
  button.setAttribute("aria-hidden", "false");
}

function getContinueSessionWatchedSeconds(type, id, season, episode) {
  const key = type === "tv" ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
  if (!continuePlaybackSession || continuePlaybackSession.key !== key) return 0;
  return Math.max(0, Number(continuePlaybackSession.playedSeconds) || 0);
}

function saveContinueProgress(type, id, currentTime, duration) {
  if (type === "movie" && continuePageState && continuePageState.key === `movie:${id}` && continuePageState.completed) return;
  const time = Number(currentTime);
  const total = Number(duration);
  if (!id || !Number.isFinite(time) || time <= 0) return;
  try {
    const all = JSON.parse(localStorage.getItem(CONTINUE_PROGRESS_KEY) || "{}");
    const season = Number(currentSeason) || 1;
    const episode = Number(currentEpisode) || 1;
    const key = type === "tv" ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
    const previous = all[key] || {};
    const validDuration = total > 0 ? total : Number(previous.duration) || 0;
    all[key] = { currentTime: time, duration: validDuration, percent: validDuration > 0 ? time / validDuration : 0, updatedAt: Date.now() };
    localStorage.setItem(CONTINUE_PROGRESS_KEY, JSON.stringify(all));

    // Save a resume record on any real playback progress. There is no 10% save threshold.
    if (type === "tv" && activePlayerKind === "tv" && activePlayerItem && String(activePlayerItem.id) === String(id)) {
      saveTvContinueRecord({
        id: Number(id), title: activePlayerItem.title || activePlayerItem.name || "Untitled",
        poster: activePlayerItem.poster || activePlayerItem.poster_path || "",
        season, episode, server: currentServer || "vidzee"
      });
      renderTvContinueWatching(activePlayerItem);
    }
    if (type === "movie" && activePlayerKind === "movie" && activePlayerItem && String(activePlayerItem.id) === String(id)) {
      const records = getMovieContinueRecords();
      records[String(id)] = { id: Number(id), title: String(activePlayerItem.title || "Untitled"), server: currentServer || "vidzee", updatedAt: Date.now() };
      localStorage.setItem(MOVIE_CONTINUE_STORAGE_KEY, JSON.stringify(records));
      renderMovieContinueWatching(activePlayerItem);
    }
  } catch (_) {}
}

function findPlaybackField(root, keys, depth = 0) {
  if (!root || typeof root !== "object" || depth > 5) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(root, key)) {
      const value = root[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }
  for (const value of Object.values(root)) {
    if (value && typeof value === "object") {
      const found = findPlaybackField(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function parsePlaybackNumber(value) {
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.some(part => !Number.isFinite(part))) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  return Number(value);
}

function getPlaybackCompletions() {
  try {
    const value = JSON.parse(localStorage.getItem(PLAYBACK_COMPLETION_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}

function getPlaybackCompletionId(type, id, season, episode) {
  return type === "tv" ? `tv:${id}:${season}:${episode}` : `movie:${id}`;
}

function isPlaybackCompleted(type, id, season, episode) {
  return Boolean(getPlaybackCompletions()[getPlaybackCompletionId(type, id, season, episode)]);
}

function setPlaybackCompleted(type, id, season, episode, completed) {
  const all = getPlaybackCompletions();
  const key = getPlaybackCompletionId(type, id, season, episode);
  if (completed) all[key] = { completedAt: Date.now() };
  else delete all[key];
  try { localStorage.setItem(PLAYBACK_COMPLETION_KEY, JSON.stringify(all)); } catch (_) {}
}

function markMovieContinueCompleted(item) {
  if (!item || !item.id) return;
  const id = String(item.id);
  setPlaybackCompleted("movie", id, 1, 1, true);
  if (continuePageState && continuePageState.key === `movie:${id}`) {
    continuePageState.completed = true;
    continuePageState.hiddenUntilExit = true;
  }
  // Keep the last resume position and record. Completion only hides the shortcut.
  hideContinueAction(document.getElementById("movieContinueWatching"));
}

function markTvEpisodeCompleted(item, season, episode) {
  if (!item || !item.id) return;
  const id = String(item.id);
  setPlaybackCompleted("tv", id, season, episode, true);
  if (continuePageState && continuePageState.key === `tv:${id}` && Number(currentSeason) === Number(season) && Number(currentEpisode) === Number(episode)) {
    continuePageState.completed = true;
  }
  updateTvCompletionVisuals();
  renderTvContinueWatching(item);
}

// Advance only after the provider reports a genuine ended event. Seeking or
// dragging near the end never calls this function.
async function advanceToNextTvEpisode(item, completedSeason, completedEpisode) {
  if (!item || !Array.isArray(activeTvSeasons) || !activeTvSeasons.length) return;
  const seasons = [...activeTvSeasons].filter(s => Number(s.season_number) > 0)
    .sort((a, b) => Number(a.season_number) - Number(b.season_number));
  const seasonIndex = seasons.findIndex(s => Number(s.season_number) === Number(completedSeason));
  if (seasonIndex < 0) return;

  const currentSeasonInfo = seasons[seasonIndex];
  const knownCount = Number(currentSeasonInfo.knownEpisodeCount || currentSeasonInfo.episode_count);
  if (!(knownCount > 0)) return;

  let nextSeasonInfo = currentSeasonInfo;
  let nextEpisode = Number(completedEpisode) + 1;
  if (nextEpisode > knownCount) {
    nextSeasonInfo = seasons[seasonIndex + 1];
    if (!nextSeasonInfo) return; // Final known episode of the series.
    nextEpisode = 1;
  }

  currentSeason = Number(nextSeasonInfo.season_number);
  currentEpisode = nextEpisode;
  continuePlaybackSession = null;

  const context = document.getElementById("tvPlayerContextDetail");
  if (context) context.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;

  document.querySelectorAll("#seasonTabs button").forEach(button => {
    const active = Number(button.dataset.seasonNumber) === currentSeason;
    button.className = active
      ? "px-4 py-2 rounded-lg font-bold text-xs transition bg-brand text-black"
      : "px-4 py-2 rounded-lg font-bold text-xs transition bg-zinc-800 text-zinc-300 hover:bg-zinc-700";
  });

  // Switch the iframe immediately. Ignore trailing ended events from the old
  // document until the next episode reports playback near its beginning.
  tvIgnoreEndedUntilFreshStart = true;
  loadTvIframe(item.id, { autoAdvance: true });
  await renderTvEpisodes(item.id, nextSeasonInfo.episode_count);
  if (String(activePlayerItem && activePlayerItem.id) !== String(item.id) ||
      Number(currentSeason) !== Number(nextSeasonInfo.season_number) ||
      Number(currentEpisode) !== nextEpisode) return;
  syncTvActiveSelection();
  updateTvCompletionVisuals();
}

function updateTvPlayerEpisodeHeading(episodeTitle = "") {
  const context = document.getElementById("tvPlayerContextDetail");
  if (!context) return;
  const base = `Season ${currentSeason} Episode ${currentEpisode}`;
  context.innerText = episodeTitle ? `${base} · ${episodeTitle}` : base;
}

function syncTvActiveSelection() {
  document.querySelectorAll("#seasonTabs button[data-season-number]").forEach(button => {
    const active = Number(button.dataset.seasonNumber) === Number(currentSeason);
    button.classList.toggle("bg-brand", active);
    button.classList.toggle("text-black", active);
    button.classList.toggle("bg-zinc-800", !active);
    button.classList.toggle("text-zinc-300", !active);
    button.classList.toggle("hover:bg-zinc-700", !active);
  });
  document.querySelectorAll("#episodesGrid button[data-episode-number]").forEach(button => {
    const active = Number(button.dataset.seasonNumber) === Number(currentSeason) &&
      Number(button.dataset.episodeNumber) === Number(currentEpisode);
    button.classList.toggle("bg-zinc-800", active);
    button.classList.toggle("border-brand", active);
    button.classList.toggle("bg-zinc-900", !active);
    button.classList.toggle("border-zinc-800", !active);
    button.classList.toggle("hover:border-brand/50", !active);
  });
}

function updateTvCompletionVisuals() {
  const tvId = String(activePlayerItem && activePlayerItem.id || "");
  if (!tvId) return;
  document.querySelectorAll("#episodesGrid button[data-episode-number]").forEach(button => {
    const episode = Number(button.dataset.episodeNumber);
    const season = Number(button.dataset.seasonNumber);
    button.classList.toggle("tv-completed-dim", isPlaybackCompleted("tv", tvId, season, episode));
  });
  document.querySelectorAll("#seasonTabs button[data-season-number]").forEach(button => {
    const seasonNumber = Number(button.dataset.seasonNumber);
    const seasonInfo = activeTvSeasons.find(season => Number(season.season_number) === seasonNumber);
    const knownEpisodes = seasonInfo && Array.isArray(seasonInfo.knownEpisodeNumbers)
      ? seasonInfo.knownEpisodeNumbers
      : Array.from({ length: Math.max(0, Number(seasonInfo && (seasonInfo.knownEpisodeCount || seasonInfo.episode_count)) || 0) }, (_, index) => index + 1);
    const allKnownEpisodesCompleted = knownEpisodes.length > 0 &&
      knownEpisodes.every(episode => isPlaybackCompleted("tv", tvId, seasonNumber, episode));
    button.classList.toggle("tv-completed-dim", allKnownEpisodesCompleted);
  });
}

function isPlaybackEndedMessage(message) {
  // Providers may wrap the player event in several levels of `data`/`payload`.
  // Do not use findPlaybackField here: a generic `type: "video"` can appear
  // before the actual nested `event: "ended"` and mask the completion event.
  const eventKeys = new Set(["event", "eventtype", "event_type", "action", "status", "state", "type", "name", "method"]);
  const endedValues = new Set([
    "ended", "onended", "videoended", "onvideoended", "playbackended",
    "complete", "completed", "playbackcompleted", "finished", "videocomplete"
  ]);
  const visited = new Set();
  const scan = (value, depth = 0) => {
    if (depth > 7 || value == null) return false;
    if (typeof value === "string") {
      const trimmed = value.trim();
      const normalized = trimmed.toLowerCase().replace(/[\\s_-]+/g, "");
      if (endedValues.has(normalized)) return true;

      // VidZee may send player events as a plain query-string message
      // (for example: "event=ended"), not only as a JSON object.
      if (trimmed.includes("=") && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        try {
          const params = new URLSearchParams(trimmed.replace(/^[?#]/, ""));
          for (const [key, child] of params.entries()) {
            const normalizedKey = String(key).toLowerCase().replace(/[\\s_-]+/g, "");
            const normalizedValue = String(child).toLowerCase().replace(/[\\s_-]+/g, "");
            if (eventKeys.has(normalizedKey) && endedValues.has(normalizedValue)) return true;
          }
        } catch (_) {}
      }

      // Some providers send a JSON string nested inside their message.
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && depth < 7) {
        try { return scan(JSON.parse(trimmed), depth + 1); } catch (_) {}
      }
      return false;
    }
    if (typeof value !== "object" || visited.has(value)) return false;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase().replace(/[\s_-]+/g, "");
      if (eventKeys.has(normalizedKey) && typeof child === "string" &&
          endedValues.has(child.toLowerCase().replace(/[\s_-]+/g, ""))) return true;
      if (scan(child, depth + 1)) return true;
    }
    return false;
  };
  return scan(message);
}

function setupContinueProgressTracking(type) {
  const iframe = document.getElementById(type === "movie" ? "movieIframe" : "tvIframe");
  if (!iframe || iframe.dataset.progressTrackingBound === "true") return;
  iframe.dataset.progressTrackingBound = "true";

  window.addEventListener("message", event => {
    // Accept messages only from the currently selected provider iframe.
    // This keeps the source/origin check strict while allowing all four
    // configured servers instead of hard-coding VidZee only.
    if (event.source !== iframe.contentWindow) return;
    let expectedOrigin = "";
    try { expectedOrigin = new URL(iframe.src, window.location.href).origin; } catch (_) { return; }
    if (!expectedOrigin || event.origin !== expectedOrigin) return;

    let message = event.data;
    if (typeof message === "string") {
      const trimmed = message.trim();
      try { message = JSON.parse(trimmed); }
      catch (_) { message = trimmed; }
    }
    if (message == null || (typeof message !== "object" && typeof message !== "string")) return;
    if (!activePlayerItem || activePlayerKind !== type) return;
    const messageType = typeof message === "object" ? findPlaybackField(message, ["mediaType", "media_type"]) : null;
    if (messageType && String(messageType).toLowerCase() !== type) return;
    const messageId = typeof message === "object" ? findPlaybackField(message, ["tmdbId", "tmdb_id"]) : null;
    if (messageId != null && String(messageId) !== String(activePlayerItem.id)) return;
    if (isPlaybackEndedMessage(message)) {
      if (type === "movie") {
        markMovieContinueCompleted(activePlayerItem);
      } else {
        // An iframe can emit more than one ended message. After auto-next, ignore
        // any trailing messages from the previous episode until the new episode
        // reports a fresh near-start playback position.
        if (tvIgnoreEndedUntilFreshStart) return;
        const endedItem = activePlayerItem;
        const endedSeason = Number(currentSeason) || 1;
        const endedEpisode = Number(currentEpisode) || 1;
        const endedSessionKey = `tv:${endedItem.id}:${endedSeason}:${endedEpisode}`;
        if (tvEndedSessionKey === endedSessionKey) return;
        tvEndedSessionKey = endedSessionKey;
        tvLastEndedPlaybackTime = Number(continuePlaybackSession && continuePlaybackSession.lastTime) || 0;
        markTvEpisodeCompleted(endedItem, endedSeason, endedEpisode);
        advanceToNextTvEpisode(endedItem, endedSeason, endedEpisode);
      }
      return;
    }

    if (typeof message !== "object") return;
    const rawTime = findPlaybackField(message, ["currentTime", "current_time", "player_progress", "position", "playbackTime", "playback_time", "time"]);
    const rawDuration = findPlaybackField(message, ["duration", "totalDuration", "total_duration", "player_duration", "videoDuration", "video_duration"]);
    const time = parsePlaybackNumber(rawTime);
    const duration = parsePlaybackNumber(rawDuration);
    if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(duration) || duration <= 0) return;
    if (type === "tv" && tvIgnoreEndedUntilFreshStart &&
        (time <= 15 || (tvLastEndedPlaybackTime > 15 && time < tvLastEndedPlaybackTime - 15))) {
      tvIgnoreEndedUntilFreshStart = false;
      tvLastEndedPlaybackTime = 0;
    }
    const season = Number(currentSeason) || 1;
    const episode = Number(currentEpisode) || 1;
    const sessionKey = type === "tv" ? `tv:${activePlayerItem.id}:${season}:${episode}` : `movie:${activePlayerItem.id}`;
    const now = Date.now();
    if (!continuePlaybackSession || continuePlaybackSession.key !== sessionKey) {
      continuePlaybackSession = { key: sessionKey, lastTime: time, lastWallTime: now, playedSeconds: 0 };
    } else {
      const mediaDelta = time - Number(continuePlaybackSession.lastTime);
      const wallDelta = Math.max(0, (now - Number(continuePlaybackSession.lastWallTime)) / 1000);
      // Count only plausible forward playback. Slider seeks/drags are not watched time.
      // The tighter tolerance also prevents short manual seeks from satisfying TV's save threshold.
      if (mediaDelta > 0 && mediaDelta <= Math.max(2, wallDelta * 2 + 0.5)) {
        continuePlaybackSession.playedSeconds += mediaDelta;
      }
      continuePlaybackSession.lastTime = time;
      continuePlaybackSession.lastWallTime = now;
    }

    const watchedSeconds = getContinueSessionWatchedSeconds(type, activePlayerItem.id, season, episode);
    if (type === "movie") {
      // Fixed thresholds use accumulated real forward-playback time, not video duration.
      // A genuine replay clears completion only after 20 seconds; seeks do not count.
      if (watchedSeconds >= 20 && isPlaybackCompleted("movie", activePlayerItem.id)) {
        setPlaybackCompleted("movie", activePlayerItem.id, 1, 1, false);
        if (continuePageState && continuePageState.key === `movie:${activePlayerItem.id}`) continuePageState.completed = false;
      }
      saveContinueProgress(type, activePlayerItem.id, time, duration);
      if (watchedSeconds >= 15) hideContinueForCurrentPage(type, activePlayerItem);
      renderMovieContinueWatching(activePlayerItem);
    } else {
      // TV progress is committed only after 15 seconds of real forward playback in THIS episode.
      // Before that point, users can sample seasons/episodes without polluting Continue history.
      if (watchedSeconds >= 15) {
        // A real replay (not a seek) restores the episode's normal, uncompleted appearance.
        if (isPlaybackCompleted("tv", activePlayerItem.id, season, episode)) {
          setPlaybackCompleted("tv", activePlayerItem.id, season, episode, false);
          updateTvCompletionVisuals();
        }
        saveContinueProgress(type, activePlayerItem.id, time, duration);
      }
      if (watchedSeconds >= 20) hideContinueForCurrentPage(type, activePlayerItem);
      renderTvContinueWatching(activePlayerItem);
      // Keep the 2% hide latch authoritative even if another render just ran.
      if (watchedSeconds >= 20) hideContinueAction(document.getElementById("tvContinueWatching"));
    }
  });
}

function getMovieContinueRecords() {
  try { const value = JSON.parse(localStorage.getItem(MOVIE_CONTINUE_STORAGE_KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  catch (_) { return {}; }
}
function renderMovieContinueWatching(item) {
  const button = document.getElementById("movieContinueWatching");
  if (!button) return;
  const record = item && getMovieContinueRecords()[String(item.id)];
  const progress = item && getContinueProgress("movie", item.id);
  if (!record || !progress || isPlaybackCompleted("movie", item.id) || !isContinuePageVisible("movie", item)) {
    hideContinueAction(button);
    return;
  }
  const displayedResumeTime = continuePageState && continuePageState.key === `movie:${item.id}` &&
    Number(continuePageState.resumeTime) > 0 ? continuePageState.resumeTime : Number(progress.currentTime);
  button.innerHTML = `<span class="tv-continue-icon"><i class="fa-solid fa-play" aria-hidden="true"></i></span><span class="tv-continue-copy"><span class="tv-continue-label">CONTINUE</span><span class="tv-continue-meta">${formatContinueTime(displayedResumeTime)}</span></span>`;
  showContinueAction(button);
  button.onclick = () => continueWatchingMovie(item);
}

function continueWatchingMovie(item) {
  if (!item || !item.id) return;
  const record = getMovieContinueRecords()[String(item.id)];
  const progress = getContinueProgress("movie", item.id);
  const pageSnapshot = continuePageState && continuePageState.key === `movie:${item.id}`
    ? Number(continuePageState.resumeTime) : 0;
  const resumeTime = pageSnapshot > 0 ? pageSnapshot : Number(progress && progress.currentTime);
  if (!record || !Number.isFinite(resumeTime) || resumeTime <= 0) return;

  currentServer = normalizeServerId(record.server);
  hideContinueForCurrentPage("movie", item);
  hideContinueAction(document.getElementById("movieContinueWatching"));
  loadMovieIframe(item.id, resumeTime);
  scrollPlayerPageToTop();
}
function setupMovieContinueTracking() {
  // Movie Continue behavior remains unchanged; it is driven by verified playback progress.
}


/* ==========================================================================
   TV CONTINUE WATCHING
   Stores the last episode and verified playback position for resume.
   ========================================================================== */
function getTvContinueRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(TV_CONTINUE_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (_) {
    return {};
  }
}

function getTvContinueRecord(itemOrId) {
  const id = String(typeof itemOrId === "object" ? itemOrId && itemOrId.id : itemOrId || "");
  return id ? getTvContinueRecords()[id] || null : null;
}

function saveTvContinueRecord(record) {
  if (!record || !record.id) return;
  try {
    const records = getTvContinueRecords();
    records[String(record.id)] = {
      id: Number(record.id),
      title: String(record.title || "Untitled"),
      poster: String(record.poster || ""),
      season: Math.max(0, Number(record.season) || 0),
      episode: Math.max(1, Number(record.episode) || 1),
      server: String(record.server || "vidzee"),
      updatedAt: Date.now()
    };
    localStorage.setItem(TV_CONTINUE_STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("PopcornHUB: unable to save Continue Watching state.", error);
  }
}

function renderTvContinueWatching(item) {
  const button = document.getElementById("tvContinueWatching");
  if (!button) return;
  const record = getTvContinueRecord(item);
  const progress = record && getContinueProgress("tv", item.id, record.season, record.episode);
  if (!record || !progress || !Number.isFinite(Number(record.season)) || !Number.isFinite(Number(record.episode))) {
    hideContinueAction(button);
    return;
  }

  button.innerHTML = `
    <span class="tv-continue-icon"><i class="fa-solid fa-play" aria-hidden="true"></i></span>
    <span class="tv-continue-copy">
      <span class="tv-continue-label">CONTINUE</span>
      <span class="tv-continue-meta">S${record.season} · E${record.episode}</span>
    </span>
  `;
  const savedEpisodeIsSelected = Number(record.season) === Number(currentSeason) && Number(record.episode) === Number(currentEpisode);
  const savedEpisodeCompleted = isPlaybackCompleted("tv", item.id, record.season, record.episode);
  if (!isContinuePageVisible("tv", item) || savedEpisodeIsSelected || savedEpisodeCompleted) {
    hideContinueAction(button);
    return;
  }
  showContinueAction(button);
  button.onclick = () => continueWatchingTv(item);
}

async function continueWatchingTv(item) {
  const record = getTvContinueRecord(item);
  if (!item || !record) return;

  const season = activeTvSeasons.find(s => Number(s.season_number) === Number(record.season));
  if (!season) return;

  currentSeason = Number(season.season_number);
  currentEpisode = Math.max(1, Number(record.episode) || 1);
  renderTvContinueWatching(item);
  currentServer = normalizeServerId(record.server);

  const context = document.getElementById("tvPlayerContextDetail");
  if (context) context.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;

  document.querySelectorAll("#seasonTabs button").forEach(button => {
    const isActive = Number(button.dataset.seasonNumber) === currentSeason;
    button.className = `px-4 py-2 rounded-lg font-bold text-xs transition ${isActive ? 'bg-brand text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`;
  });

  renderServers("tvServerList", server => {
    currentServer = server;
    loadTvIframe(item.id);
  });
  await renderTvEpisodes(item.id, season.episode_count);
  loadTvIframe(item.id);
  scrollPlayerPageToTop();
}

/* ==========================================================================
   PLAYERS & SERVER SELECTION
   ========================================================================== */
function launchPlayer(item) {
  if (item.type === "movie") {
    setupMoviePlayer(item);
  } else {
    setupTvPlayer(item);
  }
}

function setupMoviePlayer(item, isBackEvent = false) {
  activatePlayer("movie", item);
  movePlayerToHost("moviePlayerHost");
  switchPage("moviePlayer", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("moviePlayer", item);
  }

  document.getElementById("moviePlayerTitle").innerText = item.title;
  beginContinuePage("movie", item);
  resetContinuePlaybackSession("movie", item.id, 1, 1);
  renderMovieContinueWatching(item);
  setupMovieContinueTracking();
  setupContinueProgressTracking("movie");
  
  const movieContextTitle = document.getElementById("moviePlayerContextTitle");
  if (movieContextTitle) {
    // Keep the Movie context line compact: show the release year, not the title.
    const movieYear = item.year || (item.release_date || "").split("-")[0] || "";
    movieContextTitle.innerText = movieYear;
  }

  renderServers("movieServerList", (srv) => {
    currentServer = srv;
    loadMovieIframe(item.id);
  });

  loadMovieIframe(item.id);
  fetchRelated(item.type, item.id, "movieRelatedGrid");
}

function loadMovieIframe(id, resumeAt = 0) {
  const safeId = Number.parseInt(id, 10);
  const iframe = document.getElementById("movieIframe");
  if (!iframe) return;
  if (!Number.isSafeInteger(safeId) || safeId <= 0) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: rejected invalid movie ID.");
    return;
  }
  id = safeId;
  let url;
  if (currentServer === "vidcore") {
    url = `https://vidcore.io/movie/${id}`;
  } else if (currentServer === "vidlink") {
    url = `https://vidlink.pro/movie/${id}`;
  } else if (currentServer === "vidsrc") {
    url = `https://vidsrc.sh/embed/movie/${id}`;
  } else if (currentServer === "vidzee") {
    url = `https://player.vidzee.wtf/embed/movie/${id}`;
  }

  if (!url) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: no valid movie provider selected.");
    return;
  }
  resetContinuePlaybackSession("movie", id, 1, 1);
  const resumeSeconds = Number(resumeAt);
  if (Number.isFinite(resumeSeconds) && resumeSeconds > 0) {
    const resumeUrl = new URL(url);
    resumeUrl.searchParams.set("startAt", String(Math.floor(resumeSeconds)));
    iframe.src = resumeUrl.toString();
  } else {
    iframe.src = url;
  }
}

async function setupTvPlayer(item, isBackEvent = false) {
  activatePlayer("tv", item);
  movePlayerToHost("tvPlayerHost");
  switchPage("tvPlayer", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("tvPlayer", item);
  }

  document.getElementById("tvPlayerTitle").innerText = item.title;

  activeTvSeasons = [];
  currentSeason = 1;
  currentEpisode = 1;
  tvIgnoreEndedUntilFreshStart = false;
  tvEndedSessionKey = null;
  tvLastEndedPlaybackTime = 0;
  beginContinuePage("tv", item);
  resetContinuePlaybackSession("tv", item.id, currentSeason, currentEpisode);
  renderTvContinueWatching(item);
  setupContinueProgressTracking("tv");

  const tvContextDetail = document.getElementById("tvPlayerContextDetail");
  if (tvContextDetail) {
    tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
  }

  renderServers("tvServerList", (srv) => {
    currentServer = srv;
    loadTvIframe(item.id);
  });

  const seasonTabs = document.getElementById("seasonTabs");
  const epGrid = document.getElementById("episodesGrid");
  const seasonsHeading = document.getElementById("seasonsHeading");
  const episodesHeading = document.getElementById("episodesHeading");
  if (seasonsHeading) seasonsHeading.textContent = "Seasons";
  if (episodesHeading) episodesHeading.textContent = "Episodes";
  seasonTabs.innerHTML = `<span class="text-xs text-zinc-500">Loading seasons...</span>`;
  epGrid.innerHTML = "";

  const tvData = await fetchTMDB(`tv/${item.id}`);
  const seasons = (tvData && tvData.seasons) ? tvData.seasons.filter(s => s.season_number > 0) : [];
  activeTvSeasons = seasons;

  seasonTabs.innerHTML = "";
  if (seasonsHeading) seasonsHeading.textContent = `Seasons · ${seasons.length}`;
  if (seasons.length === 0) {
    seasonTabs.innerHTML = `<span class="text-xs text-zinc-500">No season data available.</span>`;
    return;
  }

  seasons.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `px-4 py-2 rounded-lg font-bold text-xs transition ${s.season_number === currentSeason ? 'bg-brand text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`;
    btn.innerText = `Season ${s.season_number}`;
    btn.dataset.seasonNumber = String(s.season_number);
    btn.onclick = () => {
      currentSeason = s.season_number;
      currentEpisode = 1;
      renderTvContinueWatching(item);

      updateTvPlayerEpisodeHeading();
      
      document.querySelectorAll("#seasonTabs button").forEach(b => {
        b.className = "px-4 py-2 rounded-lg font-bold text-xs transition bg-zinc-800 text-zinc-300 hover:bg-zinc-700";
      });
      syncTvActiveSelection();
      updateTvCompletionVisuals();

      renderTvEpisodes(item.id, s.episode_count);
      loadTvIframe(item.id);
    };
    seasonTabs.appendChild(btn);
  });

  renderTvEpisodes(item.id, seasons[0].episode_count);
  updateTvCompletionVisuals();
  loadTvIframe(item.id);
  fetchRelated(item.type, item.id, "tvRelatedGrid");
}

async function renderTvEpisodes(tvId, episodeCount) {
  const epGrid = document.getElementById("episodesGrid");
  const episodesHeading = document.getElementById("episodesHeading");
  if (!epGrid) return;
  epGrid.innerHTML = `<span class="text-xs text-zinc-500">Loading episodes...</span>`;

  const requestedSeason = currentSeason;
  const requestedTvId = String(tvId);
  const seasonData = await fetchTMDB(`tv/${tvId}/season/${requestedSeason}`);
  // Ignore stale responses if another show/season was selected while loading.
  if (requestedSeason !== currentSeason || requestedTvId !== String(activePlayerItem && activePlayerItem.id)) return;
  const episodes = seasonData && Array.isArray(seasonData.episodes) ? seasonData.episodes : [];
  const seasonInfo = activeTvSeasons.find(season => Number(season.season_number) === Number(requestedSeason));
  if (seasonInfo && episodes.length) {
    seasonInfo.knownEpisodeCount = episodes.length;
    seasonInfo.knownEpisodeNumbers = episodes.map(ep => Number(ep.episode_number)).filter(n => Number.isInteger(n) && n > 0);
  }
  const count = episodes.length || episodeCount || 10;
  if (episodesHeading) episodesHeading.textContent = `Episodes · ${episodes.length || count}`;
  epGrid.innerHTML = "";
  for (let e = 1; e <= count; e++) {
    const episodeInfo = episodes.find(ep => Number(ep.episode_number) === e);
    const episodeTitle = episodeInfo && episodeInfo.name ? episodeInfo.name : `Episode ${e}`;
    const runtimeMinutes = Number(episodeInfo && episodeInfo.runtime);
    const episodeRuntime = Number.isFinite(runtimeMinutes) && runtimeMinutes > 0
      ? `${runtimeMinutes} min`
      : "Runtime unavailable";
    const epBtn = document.createElement("button");
    epBtn.className = `p-3 rounded-xl text-left flex items-center gap-3 transition border ${e === currentEpisode ? 'bg-zinc-800 border-brand' : 'bg-zinc-900 border-zinc-800 hover:border-brand/50'}`;
    epBtn.dataset.episodeNumber = String(e);
    epBtn.dataset.seasonNumber = String(requestedSeason);
    if (isPlaybackCompleted("tv", tvId, requestedSeason, e)) epBtn.classList.add("tv-completed-dim");
    epBtn.onclick = () => {
      currentEpisode = e;
      renderTvContinueWatching(activePlayerItem);
      const tvContextDetail = document.getElementById("tvPlayerContextDetail");
      updateTvPlayerEpisodeHeading();
      syncTvActiveSelection();
      updateTvCompletionVisuals();
      loadTvIframe(tvId);
    };

    epBtn.innerHTML = `
      <div class="bg-brand/20 text-brand p-2 rounded-lg font-extrabold text-xs">E${e}</div>
      <div>
        <p class="text-xs font-bold text-zinc-200">${escapeHTML(episodeTitle)}</p>
        <p class="text-[10px] text-zinc-600">${episodeRuntime}</p>
      </div>
    `;
    epGrid.appendChild(epBtn);
  }
  const selectedEpisodeInfo = episodes.find(ep => Number(ep.episode_number) === Number(currentEpisode));
  updateTvPlayerEpisodeHeading(selectedEpisodeInfo && selectedEpisodeInfo.name ? selectedEpisodeInfo.name : "");
  syncTvActiveSelection();
  updateTvCompletionVisuals();
}

function loadTvIframe(id, options = {}) {
  if (!options.autoAdvance) {
    tvIgnoreEndedUntilFreshStart = false;
    tvEndedSessionKey = null;
    tvLastEndedPlaybackTime = 0;
  }
  const safeId = Number.parseInt(id, 10);
  const iframe = document.getElementById("tvIframe");
  if (!iframe) return;
  if (!Number.isSafeInteger(safeId) || safeId <= 0 || !Number.isSafeInteger(currentSeason) || currentSeason < 0 || !Number.isSafeInteger(currentEpisode) || currentEpisode <= 0) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: rejected invalid TV playback parameters.");
    return;
  }
  id = safeId;
  let url = `https://player.vidzee.wtf/embed/tv/${id}/${currentSeason}/${currentEpisode}`;
  if (currentServer === "vidcore") {
    url = `https://vidcore.io/tv/${id}/${currentSeason}/${currentEpisode}`;
  } else if (currentServer === "vidlink") {
    url = `https://vidlink.pro/tv/${id}/${currentSeason}/${currentEpisode}`;
  } else if (currentServer === "vidsrc") {
    url = `https://vidsrc.sh/embed/tv/${id}/${currentSeason}/${currentEpisode}`;
  } else if (currentServer === "vidzee") {
    url = `https://player.vidzee.wtf/embed/tv/${id}/${currentSeason}/${currentEpisode}`;
  }
  if (!url) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: no valid TV provider selected.");
    return;
  }
  const item = activePlayerItem && String(activePlayerItem.id) === String(id) ? activePlayerItem : null;
  pendingTvContinueSave = null;
  skipNextTvContinueSave = false;
  resetContinuePlaybackSession("tv", id, currentSeason, currentEpisode);
  iframe.src = url;
}

function renderServers(containerId, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const servers = [
  { id: "vidcore", name: "KERNEL" },
  { id: "vidlink", name: "BUTTER" },
  { id: "vidsrc", name: "CARAMEL" },
  { id: "vidzee", name: "CHEESE" }
  ];

  container.innerHTML = "";
  servers.forEach(s => {
    const btn = document.createElement("button");
    btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition border ${currentServer === s.id ? 'bg-brand text-black border-brand' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'}`;
    btn.innerText = s.name;
    btn.onclick = () => {
      document.querySelectorAll(`#${containerId} button`).forEach(b => {
        b.className = "px-4 py-2 rounded-lg text-xs font-bold transition border bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700";
      });
      btn.className = "px-4 py-2 rounded-lg text-xs font-bold transition border bg-brand text-black border-brand";
      onClick(s.id);
    };
    container.appendChild(btn);
  });
}

/* ==========================================================================
   RELATED & SIMILAR CONTENT
   ========================================================================== */
async function fetchRelated(type, id, targetId) {
  renderGridLoading(targetId);
  const isMovie = type === "movie";
  const containerId = isMovie ? "movieRelatedLoadMoreContainer" : "tvRelatedLoadMoreContainer";
  removeLoadMoreButton(containerId);

  if (isMovie) {
    currentMovieRelatedMovieId = id;
    movieRelatedCurrentPage = 1;
    movieRelatedTotalPages = 1;
    movieRelatedEndpoint = "recommendations";
    displayedMovieRelatedIds.clear();
  } else {
    currentTvRelatedTvId = id;
    tvRelatedCurrentPage = 1;
    tvRelatedTotalPages = 1;
    tvRelatedEndpoint = "recommendations";
    displayedTvRelatedIds.clear();
  }

  let data = await fetchTMDB(`${type}/${id}/recommendations?page=1`);
  let endpoint = "recommendations";
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    data = await fetchTMDB(`${type}/${id}/similar?page=1`);
    endpoint = "similar";
  }

  if (!data || !Array.isArray(data.results)) {
    renderGrid(targetId, []);
    removeLoadMoreButton(containerId);
    return;
  }

  const formatted = formatTMDB(data.results.filter(item => Number(item.id) !== Number(id)), type);
  const displayedIds = isMovie ? displayedMovieRelatedIds : displayedTvRelatedIds;
  formatted.forEach(item => displayedIds.add(Number(item.id)));

  if (isMovie) {
    movieRelatedEndpoint = endpoint;
    movieRelatedTotalPages = Number(data.total_pages) || 1;
  } else {
    tvRelatedEndpoint = endpoint;
    tvRelatedTotalPages = Number(data.total_pages) || 1;
  }

  renderGrid(targetId, formatted);
  const currentPage = isMovie ? movieRelatedCurrentPage : tvRelatedCurrentPage;
  const totalPages = isMovie ? movieRelatedTotalPages : tvRelatedTotalPages;
  if (currentPage < totalPages && formatted.length > 0) {
    renderLoadMoreButton(containerId, isMovie ? handleLoadMoreMovieRelated : handleLoadMoreTvRelated, "SEE MORE");
  } else {
    removeLoadMoreButton(containerId);
  }
}

async function loadMoreRelated(type) {
  const isMovie = type === "movie";
  const containerId = isMovie ? "movieRelatedLoadMoreContainer" : "tvRelatedLoadMoreContainer";
  const isLoading = isMovie ? isMovieRelatedLoadingMore : isTvRelatedLoadingMore;
  const currentPage = isMovie ? movieRelatedCurrentPage : tvRelatedCurrentPage;
  const totalPages = isMovie ? movieRelatedTotalPages : tvRelatedTotalPages;
  const itemId = isMovie ? currentMovieRelatedMovieId : currentTvRelatedTvId;
  const endpoint = isMovie ? movieRelatedEndpoint : tvRelatedEndpoint;
  if (isLoading || currentPage >= totalPages || !itemId) return;

  if (isMovie) isMovieRelatedLoadingMore = true;
  else isTvRelatedLoadingMore = true;
  setLoadMoreState(containerId, true, "SEE MORE");

  try {
    const nextPage = currentPage + 1;
    const data = await fetchTMDB(`${type}/${itemId}/${endpoint}?page=${nextPage}`);
    if (data && Array.isArray(data.results)) {
      if (isMovie) movieRelatedCurrentPage = nextPage;
      else tvRelatedCurrentPage = nextPage;

      const displayedIds = isMovie ? displayedMovieRelatedIds : displayedTvRelatedIds;
      const formatted = formatTMDB(data.results.filter(item => Number(item.id) !== Number(itemId)), type);
      const uniqueItems = formatted.filter(item => !displayedIds.has(Number(item.id)));
      uniqueItems.forEach(item => displayedIds.add(Number(item.id)));
      renderGrid(isMovie ? "movieRelatedGrid" : "tvRelatedGrid", uniqueItems, true);

      const updatedPage = isMovie ? movieRelatedCurrentPage : tvRelatedCurrentPage;
      const updatedTotal = isMovie ? movieRelatedTotalPages : tvRelatedTotalPages;
      if (updatedPage < updatedTotal) setLoadMoreState(containerId, false, "SEE MORE");
      else removeLoadMoreButton(containerId);
    } else {
      removeLoadMoreButton(containerId);
    }
  } finally {
    if (isMovie) isMovieRelatedLoadingMore = false;
    else isTvRelatedLoadingMore = false;
  }
}

async function handleLoadMoreMovieRelated() {
  return loadMoreRelated("movie");
}

async function handleLoadMoreTvRelated() {
  return loadMoreRelated("tv");
}

/* ========================================================================
   UNIFIED GLOBAL SEARCH & PAGINATION
   One input in the navbar; the selected section sets the initial media type.
   ======================================================================== */
function getVisibleBrowsingPage() {
  if (!document.getElementById("moviesView")?.classList.contains("hidden")) return "movies";
  if (!document.getElementById("tvView")?.classList.contains("hidden")) return "tv";
  if (!document.getElementById("platformCatalogView")?.classList.contains("hidden")) return "platformCatalog";
  if (!document.getElementById("platformsView")?.classList.contains("hidden")) return "platforms";
  if (!document.getElementById("watchlistView")?.classList.contains("hidden")) return "watchlist";
  if (!document.getElementById("homeView")?.classList.contains("hidden")) return "home";
  return searchOriginPage || "home";
}

function getContextTypeForPage(page) {
  if (page === "movies") return "movie";
  if (page === "tv") return "tv";
  if (page === "platformCatalog") return platformMediaType || "all";
  return "all";
}

function getVisibleSearchContext() {
  return document.getElementById("searchView")?.classList.contains("hidden")
    ? getContextTypeForPage(getVisibleBrowsingPage())
    : getContextTypeForPage(searchOriginPage);
}

// Keep the shared genre menu aligned with the active media type.
// TMDB has separate Action and Adventure IDs for movies, but only the
// combined Action & Adventure ID for TV series.
function refreshSharedGenreOptions() {
  const genreFilter = document.getElementById("searchGenreFilter");
  const genreMenu = document.getElementById("searchGenreMenu");
  if (!genreFilter) return;

  const activePage = document.getElementById("searchView")?.classList.contains("hidden")
    ? getVisibleBrowsingPage()
    : searchOriginPage;

  let mediaType = currentSearchType || "all";
  if (activePage === "movies") mediaType = "movie";
  else if (activePage === "tv") mediaType = "tv";
  else if (activePage === "platformCatalog") mediaType = "all";

  let selectedGenre = currentSearchGenre || genreFilter.value || "";
  if (mediaType === "tv") {
    selectedGenre = normalizeGenreForMediaType(selectedGenre, "tv");
  }

  currentSearchGenre = selectedGenre;
  const options = getGenreOptionsForMediaType(mediaType);

  genreFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All genres";
  genreFilter.appendChild(allOption);

  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    genreFilter.appendChild(option);
  });

  const selectedUiValue = mediaType === "tv" && selectedGenre === "10759"
    ? (genreFilter.dataset.lastTvGenre === "tv_adventure" ? "tv_adventure" : "tv_action")
    : selectedGenre;
  genreFilter.value = selectedUiValue;
  if (genreFilter.value !== selectedGenre) {
    currentSearchGenre = "";
    genreFilter.value = "";
  }

  if (genreMenu) {
    genreMenu.innerHTML = "";
    Array.from(genreFilter.options).forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-genre-option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.addEventListener("click", () => {
        genreFilter.value = option.value;
        if (option.value === "tv_action" || option.value === "tv_adventure") {
          genreFilter.dataset.lastTvGenre = option.value;
        }
        genreFilter.dispatchEvent(new Event("change", { bubbles: true }));
      });
      genreMenu.appendChild(item);
    });
  }

  syncSharedGenreControl();
}

function updateSearchContextUI() {
  refreshSharedGenreOptions();
  const input = document.getElementById("searchInput");
  const label = document.getElementById("searchContextLabel");
  const names = { all: "movies and TV shows", movie: "movies", tv: "TV shows" };
  if (input) input.placeholder = `Search ${names[currentSearchType] || names.all}...`;
  const filterScope = document.getElementById("searchFilterScope");
  if (filterScope) filterScope.textContent = `Searching ${names[currentSearchType] || names.all}`;
  const contextNames = { home: "Discover", movies: "Movies", tv: "TV Series", platformCatalog: "Catalogs", platforms: "Catalogs", watchlist: "Watchlist" };
  const context = contextNames[searchOriginPage] || "Discover";
  if (label) {
    // Keep the same compact subtitle style as each catalog page; only its text changes during search.
    label.textContent = currentSearchQuery
      ? `Search matching result for “${currentSearchQuery}”`
      : (searchOriginPage === "platforms"
          ? "Select a streaming service to explore its catalog."
          : searchOriginPage === "watchlist"
            ? "Search your saved movies and TV series."
            : `Search ${names[currentSearchType] || names.all}`);
    label.classList.toggle("text-brand", Boolean(currentSearchQuery));
    label.classList.toggle("text-zinc-400", !currentSearchQuery);
    label.classList.remove("pl-4", "mt-2");
    label.classList.add("mt-1");
  }
  const heading = document.getElementById("searchContextHeading");
  if (heading) {
    const headings = { home: "Discover", movies: "Movies", tv: "TV Series", platformCatalog: "", platforms: "Catalogs", watchlist: "My Watchlist" };
    const platformTitle = document.getElementById("platformCatalogTitle")?.textContent?.trim();
    const headingText = searchOriginPage === "platformCatalog" && platformTitle
      ? platformTitle
      : (headings[searchOriginPage] || "Discover");
    // Home and the platform-selection screen have no catalog heading above their
    // cards; keep that same clean layout during search. Catalog pages retain theirs.
    const hideHeading = searchOriginPage === "home" || searchOriginPage === "platforms";
    heading.textContent = headingText;
    heading.classList.toggle("hidden", hideHeading);
  }
  const typeFilter = document.getElementById("searchTypeFilter");
  if (typeFilter) {
    typeFilter.value = currentSearchType;
    const typeWrap = typeFilter.closest("label") || typeFilter;
    const hideTypeFilter = ["movies", "tv", "platformCatalog"].includes(searchOriginPage);
    typeWrap.classList.toggle("hidden", hideTypeFilter);
    typeFilter.classList.toggle("hidden", hideTypeFilter);
  }
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  const genreFilter = document.getElementById("searchGenreFilter");
  const sortFilter = document.getElementById("searchSortFilter");
  const typeFilter = document.getElementById("searchTypeFilter");
  const filterPanel = document.getElementById("searchFilterPanel");
  const filterToggle = document.getElementById("toggleSearchFilters");
  const genreControl = document.getElementById("searchGenreControl");
  const genreTrigger = document.getElementById("searchGenreTrigger");
  const genreMenu = document.getElementById("searchGenreMenu");
  if (!input) return;
  let timer;

  const syncGenreMenu = () => {
    if (!genreFilter || !genreTrigger || !genreMenu) return;
    const selected = genreFilter.options[genreFilter.selectedIndex];
    genreTrigger.firstChild.textContent = `${selected ? selected.textContent : "All genres"} `;
    genreMenu.querySelectorAll("[role='option']").forEach(option => {
      option.setAttribute("aria-selected", option.dataset.value === genreFilter.value ? "true" : "false");
    });
  };
  const closeGenreMenu = () => {
    if (!genreMenu || !genreTrigger) return;
    genreMenu.classList.add("hidden");
    genreTrigger.setAttribute("aria-expanded", "false");
  };
  const positionGenreMenu = () => {
    if (!genreMenu || !genreTrigger || genreMenu.classList.contains("hidden")) return;
    const rect = genreTrigger.getBoundingClientRect();
    const pad = 8;
    const availableBelow = window.innerHeight - rect.bottom - pad;
    const availableAbove = rect.top - pad;
    const openAbove = availableBelow < 150 && availableAbove > availableBelow;
    const available = Math.max(100, (openAbove ? availableAbove : availableBelow));
    const menuHeight = Math.min(320, available);
    genreMenu.style.left = `${Math.max(pad, Math.min(rect.left, window.innerWidth - rect.width - pad))}px`;
    genreMenu.style.width = `${Math.min(rect.width, window.innerWidth - pad * 2)}px`;
    genreMenu.style.maxHeight = `${menuHeight}px`;
    genreMenu.style.top = `${openAbove ? Math.max(pad, rect.top - menuHeight - 4) : rect.bottom + 4}px`;
  };
  if (genreFilter && genreMenu && genreTrigger && !genreMenu.dataset.initialized) {
    // Keep the menu under <body> so fixed viewport positioning is not affected by the panel's backdrop-filter.
    document.body.appendChild(genreMenu);
    Array.from(genreFilter.options).forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-genre-option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.addEventListener("click", () => {
        genreFilter.value = option.value;
        genreFilter.dispatchEvent(new Event("change", { bubbles: true }));
        syncGenreMenu();
        closeGenreMenu();
      });
      genreMenu.appendChild(item);
    });
    genreMenu.dataset.initialized = "true";
    syncGenreMenu();
    genreTrigger.addEventListener("click", () => {
      const opening = genreMenu.classList.contains("hidden");
      if (!opening) { closeGenreMenu(); return; }
      genreMenu.classList.remove("hidden");
      genreTrigger.setAttribute("aria-expanded", "true");
      positionGenreMenu();
    });
    window.addEventListener("resize", positionGenreMenu, { passive: true });
    window.addEventListener("scroll", positionGenreMenu, { passive: true, capture: true });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !genreMenu.classList.contains("hidden")) {
        closeGenreMenu(); genreTrigger.focus();
      }
    });
    document.addEventListener("click", event => {
      if (genreControl && !genreControl.contains(event.target) && !genreMenu.contains(event.target)) closeGenreMenu();
    });
  }

  const positionSearchFilterPanel = () => {
    if (!filterPanel || !filterToggle || filterPanel.classList.contains("hidden")) return;
    const shell = document.getElementById("globalSearchShell");
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const viewportPadding = 12;
    const maxWidth = window.matchMedia("(max-width: 767px)").matches ? 420 : 520;
    const panelWidth = Math.min(maxWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - panelWidth - viewportPadding));
    filterPanel.style.left = `${left}px`;
    filterPanel.style.width = `${panelWidth}px`;
    const availableHeight = Math.max(120, window.innerHeight - viewportPadding * 2);
    filterPanel.style.maxHeight = `${availableHeight}px`;
    const measuredHeight = Math.min(filterPanel.scrollHeight, availableHeight);
    const maxTop = Math.max(viewportPadding, window.innerHeight - measuredHeight - viewportPadding);
    filterPanel.style.top = `${Math.max(viewportPadding, Math.min(rect.bottom + 10, maxTop))}px`;
  };

  const setFilterPanelOpen = (open) => {
    if (!filterPanel || !filterToggle) return;
    filterPanel.classList.toggle("hidden", !open);
    filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    filterToggle.setAttribute("aria-label", open ? "Hide search filters" : "Show search filters");
    if (open) {
      updateSearchContextUI();
      positionSearchFilterPanel();
    } else {
      filterPanel.style.left = "";
      filterPanel.style.top = "";
      filterPanel.style.width = "";
    }
  };
  window.addEventListener("resize", positionSearchFilterPanel, { passive: true });
  window.addEventListener("scroll", positionSearchFilterPanel, { passive: true });
  if (filterToggle) filterToggle.addEventListener("click", () => {
    setFilterPanelOpen(filterToggle.getAttribute("aria-expanded") !== "true");
  });
  const submitSearch = document.getElementById("submitSearch");
  if (submitSearch) submitSearch.addEventListener("click", () => {
    const query = input.value.trim();
    if (query.length >= 2) {
      clearTimeout(timer);
      if (document.getElementById("searchView")?.classList.contains("hidden")) {
        searchOriginPage = getVisibleBrowsingPage();
        currentSearchType = getContextTypeForPage(searchOriginPage);
      }
      currentSearchQuery = query;
      performSearch(query, 1);
    } else {
      input.focus();
    }
  });
  document.addEventListener("click", (event) => {
    const shell = document.getElementById("globalSearchShell");
    if (filterPanel && !filterPanel.classList.contains("hidden") && shell && !shell.contains(event.target) && !genreMenu?.contains(event.target)) setFilterPanelOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filterPanel && !filterPanel.classList.contains("hidden")) {
      setFilterPanelOpen(false);
      filterToggle?.focus();
    }
  });

  // Search type is initialized when the user changes section (switchPage), not
  // on input focus/keystrokes. Re-inferring it here caused a selected Movies/TV
  // filter to reset before the first query had produced a results view.
  input.addEventListener("focus", () => {
    updateSearchContextUI();
  });
  input.addEventListener("input", (event) => {
    const query = event.target.value.trim();
    if (clearBtn) clearBtn.classList.toggle("hidden", query.length === 0);
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (query.length >= 2) {
        if (document.getElementById("searchView")?.classList.contains("hidden")) {
          searchOriginPage = getVisibleBrowsingPage();
          currentSearchType = getContextTypeForPage(searchOriginPage);
        }
        currentSearchQuery = query;
        performSearch(query, 1);
      } else if (query.length === 0) {
        clearSearch();
      }
    }, 350);
  });
  if (typeFilter) typeFilter.addEventListener("change", () => setSearchTypeFilter(typeFilter.value));
  if (genreFilter) genreFilter.addEventListener("change", () => {
    const page = getVisibleBrowsingPage();
    const mediaType = page === "platformCatalog" ? platformMediaType
      : page === "tv" ? "tv"
      : page === "movies" ? "movie"
      : currentSearchType;
    if (genreFilter.value === "tv_action" || genreFilter.value === "tv_adventure") {
      genreFilter.dataset.lastTvGenre = genreFilter.value;
    }
    currentSearchGenre = getPlatformGenreQueryValue(genreFilter.value, mediaType);
    syncGenreMenu();
    applySharedFiltersToActivePage();
  });
  if (sortFilter) sortFilter.addEventListener("change", () => {
    currentSearchSort = sortFilter.value;
    applySharedFiltersToActivePage();
  });
  updateSearchContextUI();
}

function setSearchTypeFilter(type) {
  if (!["all", "movie", "tv"].includes(type)) return;
  currentSearchType = type;
  if (type === "tv") {
    currentSearchGenre = normalizeGenreForMediaType(currentSearchGenre, "tv");
  } else if (type === "movie" && currentSearchGenre === "10759") {
    currentSearchGenre = "";
  }
  updateSearchContextUI();
  applySharedFiltersToActivePage();
}

// One shared filter panel controls the currently active browsing context.
// Existing catalog functions remain the source of truth for their own data and pagination.
function applySharedFiltersToActivePage() {
  const page = getVisibleBrowsingPage();
  if (currentSearchQuery) {
    performSearch(currentSearchQuery, 1);
    return;
  }
  if (page === "movies") {
    const genre = document.getElementById("movieGenreFilter");
    const sort = document.getElementById("movieSortFilter");
    if (genre) genre.value = currentSearchGenre;
    if (sort) sort.value = ({ relevance: "popularity.desc", rating: "vote_average.desc", newest: "primary_release_date.desc", title: "title.asc" })[currentSearchSort] || "popularity.desc";
    fetchMoviesCatalog(1);
  } else if (page === "tv") {
    currentSearchGenre = normalizeGenreForMediaType(currentSearchGenre, "tv");
    const sharedGenre = document.getElementById("searchGenreFilter");
    if (sharedGenre) sharedGenre.value = currentSearchGenre;
    syncSharedGenreControl();
    const genre = document.getElementById("tvGenreFilter");
    const sort = document.getElementById("tvSortFilter");
    if (genre) genre.value = currentSearchGenre;
    if (sort) sort.value = ({ relevance: "popularity.desc", rating: "vote_average.desc", newest: "first_air_date.desc", title: "name.asc" })[currentSearchSort] || "popularity.desc";
    fetchTvCatalog(1);
  } else if (page === "platformCatalog") {
    platformMediaType = "all";
    const genre = document.getElementById("platformGenreFilter");
    const sort = document.getElementById("platformSortFilter");
    if (genre) {
      updateDynamicGenreOptions("platformGenreFilter", []);
      genre.value = currentSearchGenre || "";
    }
    if (sort) {
      const platformSortMap = {
        relevance: "popularity.desc",
        rating: "vote_average.desc",
        newest: "primary_release_date.desc",
        title: "title.asc"
      };
      sort.value = platformSortMap[currentSearchSort] || "popularity.desc";
    }
    fetchPlatformCatalog(1);
  } else if (page === "watchlist") {
    renderWatchlistPage();
  } else if (page === "platforms") {
    applyPlatformSelectionFilters();
  } else if (page === "home") {
    // Home has multiple discovery rows rather than one catalog. The shared filters
    // apply to Home search results when a query is entered; don't redirect or replace its layout.
    fetchHomeData();
  }
}

function applyPlatformSelectionFilters() {
  const container = document.getElementById("platformsSelectionGrid");
  if (!container) return;
  const cards = Array.from(container.children);
  cards.forEach(card => {
    const name = card.querySelector("h3")?.textContent || "";
    const matchesType = currentSearchType === "all";
    const matchesGenre = !currentSearchGenre;
    const matchesQuery = !currentSearchQuery || name.toLowerCase().includes(currentSearchQuery.toLowerCase());
    card.classList.toggle("hidden", !(matchesType && matchesGenre && matchesQuery));
  });
  if (currentSearchSort === "title") {
    cards.sort((a, b) => (a.querySelector("h3")?.textContent || "").localeCompare(b.querySelector("h3")?.textContent || ""));
    cards.forEach(card => container.appendChild(card));
  }
}

function clearSearchFilters() {
  // Reset every unified-search filter to the current page's natural context.
  // Keep the user's query intact; reset means reset filters, not erase search text.
  currentSearchType = getVisibleSearchContext();
  currentSearchGenre = "";
  currentSearchSort = "relevance";

  const typeFilter = document.getElementById("searchTypeFilter");
  const genreFilter = document.getElementById("searchGenreFilter");
  const sortFilter = document.getElementById("searchSortFilter");
  if (typeFilter) typeFilter.value = currentSearchType;
  if (genreFilter) genreFilter.value = "";
  const genreTrigger = document.getElementById("searchGenreTrigger");
  const genreMenu = document.getElementById("searchGenreMenu");
  if (genreTrigger?.firstChild) genreTrigger.firstChild.textContent = "All genres ";
  genreMenu?.querySelectorAll("[role='option']").forEach(option => option.setAttribute("aria-selected", option.dataset.value === "" ? "true" : "false"));
  if (sortFilter) sortFilter.value = "relevance";
  currentSearchGenre = "";

  updateSearchContextUI();
  applySharedFiltersToActivePage();
}

function clearSearch() {
  // Clearing text is not a navigation command: return to the same section and
  // leave its selected filters intact. Reset Filters is a separate action.
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("hidden");
  currentSearchQuery = "";
  const platformQuery = document.getElementById("platformSearchFilter");
  if (platformQuery) platformQuery.value = "";
  latestSearchRequestId++; // Ignore any pending response for the cleared query.
  searchRawItems = [];
  searchCurrentPage = 1;
  searchTotalPages = 1;
  isSearchLoadingMore = false;
  displayedMovieSearchIds.clear();
  document.getElementById("searchView")?.classList.add("hidden");
  updateSearchContextUI();
  const destination = searchOriginPage || "home";
  // Search results are an overlay, not a separate history entry. Restore the
  // origin page without pushing a duplicate route onto browser history.
  switchPage(destination, true);
  // Platform catalog search is rendered inside its own catalog grid. Reload the
  // unfiltered provider catalog when the shared search field is cleared.
  if (destination === "platformCatalog") fetchPlatformCatalog(1);
}

async function performSearch(query, page = 1) {
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 2) return;
  const currentReqId = ++latestSearchRequestId;
  // Keep platform searches on the selected platform page instead of opening the
  // generic Search Results overlay (which hid the catalog grid being populated).
  if (searchOriginPage === "platformCatalog") {
    await fetchPlatformCatalog(page);
    return;
  }
  if (page === 1) {
    document.querySelectorAll(".page-view").forEach(el => el.classList.add("hidden"));
    document.getElementById("searchView").classList.remove("hidden");
    renderGridLoading("searchResultsGrid");
    removeLoadMoreButton("searchLoadMoreContainer");
    searchCurrentPage = 1;
    searchTotalPages = 1;
    searchRawItems = [];
    displayedMovieSearchIds.clear();
  }
  updateSearchContextUI();

  // Watchlist search is intentionally local: only titles the user has saved are searched.
  // It never fetches unrelated TMDB results and has no pagination.
  if (searchOriginPage === "watchlist") {
    const queryLower = normalizedQuery.toLocaleLowerCase();
    let matches = watchlist.filter(item => String(item.title || item.name || "").toLocaleLowerCase().includes(queryLower));
    if (currentSearchType !== "all") matches = matches.filter(item => item.type === currentSearchType);
    const genreFilter = document.getElementById("searchGenreFilter");
    const sortFilter = document.getElementById("searchSortFilter");
    const genreId = genreFilter ? genreFilter.value : currentSearchGenre;
    const sortMode = sortFilter ? sortFilter.value : currentSearchSort;
    if (genreId) matches = matches.filter(item => {
      const ids = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number)
        : Array.isArray(item.genres) ? item.genres.map(g => Number(typeof g === "object" ? g.id : g)).filter(Number.isFinite)
        : [];
      return ids.includes(Number(genreId));
    });
    if (sortMode === "rating") matches.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    else if (sortMode === "newest") matches.sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
    else if (sortMode === "title") matches.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    searchRawItems = [];
    renderGrid("searchResultsGrid", matches);
    removeLoadMoreButton("searchLoadMoreContainer");
    searchCurrentPage = 1;
    searchTotalPages = 1;
    updateSearchContextUI();
    return;
  }

  // Keep Movies and TV Series searches scoped to their own TMDB endpoints.
  // This ensures every Load More page continues the same result set instead of
  // mixing media types from search/multi.
  const scopedMediaType = searchOriginPage === "movies"
    ? "movie"
    : searchOriginPage === "tv"
      ? "tv"
      : (currentSearchType === "movie" || currentSearchType === "tv" ? currentSearchType : "all");
  const searchEndpoint = scopedMediaType === "all" ? "search/multi" : `search/${scopedMediaType}`;
  const data = await fetchTMDB(`${searchEndpoint}?query=${encodeURIComponent(normalizedQuery)}&page=${page}`);
  if (currentReqId !== latestSearchRequestId) return;
  if (data && Array.isArray(data.results)) {
    searchTotalPages = data.total_pages || 1;
    searchCurrentPage = page;
    const existing = new Set(searchRawItems.map(item => `${item.media_type}_${item.id}`));
    data.results.forEach(item => {
      const mediaType = item.media_type || scopedMediaType;
      if ((mediaType === "movie" || mediaType === "tv") && !existing.has(`${mediaType}_${item.id}`)) {
        searchRawItems.push(item.media_type ? item : { ...item, media_type: mediaType });
        existing.add(`${mediaType}_${item.id}`);
      }
    });
    renderFilteredSearchResults(page > 1);
    const resultsGrid = document.getElementById("searchResultsGrid");
    const hasVisibleResults = Boolean(resultsGrid && resultsGrid.querySelector(".group"));
    if (page < searchTotalPages) {
      renderLoadMoreButton("searchLoadMoreContainer", handleLoadMoreSearch, "LOAD MORE RESULTS");
    } else {
      removeLoadMoreButton("searchLoadMoreContainer");
    }
  } else {
    if (page === 1) renderGrid("searchResultsGrid", []);
    removeLoadMoreButton("searchLoadMoreContainer");
  }
}

function renderFilteredSearchResults(append = false) {
  const genreFilter = document.getElementById("searchGenreFilter");
  const sortFilter = document.getElementById("searchSortFilter");
  currentSearchGenre = genreFilter ? genreFilter.value : currentSearchGenre;
  currentSearchSort = sortFilter ? sortFilter.value : currentSearchSort;

  let filtered = searchRawItems.filter(item => {
    if (currentSearchType !== "all" && item.media_type !== currentSearchType) return false;
    if (currentSearchGenre) {
      const ids = Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : [];
      if (!ids.includes(Number(currentSearchGenre))) return false;
    }
    return true;
  });

  if (currentSearchSort === "rating") {
    filtered.sort((a, b) => (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0));
  } else if (currentSearchSort === "newest") {
    filtered.sort((a, b) => String(b.release_date || b.first_air_date || "").localeCompare(String(a.release_date || a.first_air_date || "")));
  } else if (currentSearchSort === "title") {
    filtered.sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")));
  }

  const formatted = formatTMDB(filtered);
  if (append) {
    const alreadyRendered = new Set(displayedMovieSearchIds);
    const uniqueItems = formatted.filter(item => {
      const key = `${item.type}_${item.id}`;
      if (alreadyRendered.has(key)) return false;
      alreadyRendered.add(key);
      return true;
    });
    uniqueItems.forEach(item => displayedMovieSearchIds.add(`${item.type}_${item.id}`));
    renderGrid("searchResultsGrid", uniqueItems, true);
  } else {
    displayedMovieSearchIds = new Set(formatted.map(item => `${item.type}_${item.id}`));
    renderGrid("searchResultsGrid", formatted);
  }
  updateSearchContextUI();
  const resultsGrid = document.getElementById("searchResultsGrid");
  const hasVisibleResults = Boolean(resultsGrid && resultsGrid.querySelector(".group"));
  if (searchCurrentPage < searchTotalPages && !document.querySelector("#searchLoadMoreContainer .load-more-btn")) {
    renderLoadMoreButton("searchLoadMoreContainer", handleLoadMoreSearch, "LOAD MORE RESULTS");
  }
}

async function handleLoadMoreSearch() {
  if (isSearchLoadingMore || searchCurrentPage >= searchTotalPages || !currentSearchQuery) return;
  isSearchLoadingMore = true;
  setLoadMoreState("searchLoadMoreContainer", true, "LOAD MORE RESULTS");
  const nextPage = searchCurrentPage + 1;
  await performSearch(currentSearchQuery, nextPage);
  isSearchLoadingMore = false;
  if (searchCurrentPage < searchTotalPages) {
    setLoadMoreState("searchLoadMoreContainer", false, "LOAD MORE RESULTS");
  }
}

