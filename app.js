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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
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
    btnText.innerText = "Installed";
    btn.disabled = true;
    btn.classList.add("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.remove("hover:text-secondary", "hover:bg-zinc-900");
  } else {
    btnText.innerText = "Install App";
    btn.disabled = false;
    btn.classList.remove("opacity-40", "cursor-not-allowed", "pointer-events-none");
    btn.classList.add("hover:text-secondary", "hover:bg-zinc-900");
  }
}

function handleInstallAppClick() {
  if (isInstalled) return;

  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        isInstalled = true;
        updateInstallButtonState();
      }
      deferredPrompt = null;
    });
  } else {
    alert("To install PopcornHUB, use your browser menu and select 'Add to Home Screen' or 'Install'.");
  }
}

/* ==========================================================================
   PERSISTENT MINI PLAYER
   The same iframe node is moved between hosts; it is never cloned/reloaded.
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
  const host = document.getElementById(hostId);
  if (!iframe || !host || iframe.parentElement === host) return;
  host.appendChild(iframe);
  iframe.style.width = "100%";
  iframe.style.height = "100%";
}

function showMiniPlayer() {
  const mini = document.getElementById("miniPlayer");
  if (!mini || !activePlayerKind || !activePlayerItem) return;
  const pageIsPlayer = ["moviePlayerView", "tvPlayerView"].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
  if (pageIsPlayer || miniPlayerWasDismissed) return;
  movePlayerToHost("miniPlayerHost");
  const title = document.getElementById("miniPlayerTitle");
  if (title) title.textContent = activePlayerItem.title || activePlayerItem.name || "Now playing";
  mini.classList.remove("hidden");
}

function returnToFullPlayer() {
  if (!activePlayerKind || !activePlayerItem) return;
  const pageId = activePlayerKind === "movie" ? "moviePlayer" : "tvPlayer";
  const viewId = pageId + "View";
  const mini = document.getElementById("miniPlayer");
  if (mini) mini.classList.add("hidden");
  miniPlayerWasDismissed = false;
  switchPage(pageId);
  movePlayerToHost(activePlayerKind === "movie" ? "moviePlayerHost" : "tvPlayerHost");
  // Do not call setupMoviePlayer/setupTvPlayer here: that would reload the iframe.
  const titleEl = document.getElementById(activePlayerKind === "movie" ? "moviePlayerTitle" : "tvPlayerTitle");
  if (titleEl) titleEl.textContent = activePlayerItem.title || activePlayerItem.name || "";
  if (viewId) window.scrollTo({ top: 0, behavior: "auto" });
}

function closeMiniPlayer() {
  const iframe = getActivePlayerIframe();
  if (iframe) iframe.src = "about:blank";
  const mini = document.getElementById("miniPlayer");
  if (mini) mini.classList.add("hidden");
  activePlayerKind = null;
  activePlayerItem = null;
  miniPlayerWasDismissed = true;
}

function initMiniPlayerControls() {
  const returnButton = document.getElementById("miniPlayerReturn");
  const closeButton = document.getElementById("miniPlayerClose");
  if (returnButton) returnButton.addEventListener("click", returnToFullPlayer);
  if (closeButton) closeButton.addEventListener("click", closeMiniPlayer);
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
    searchInputValue: searchVisible && input ? input.value : ""
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
        if (button.closest("#searchView")) backFromSearchResults();
        else navigateBackInApp();
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
function updateDynamicGenreOptions(selectElementId, rawItems) {
  const selectEl = document.getElementById(selectElementId);
  if (!selectEl) return;

  const currentSelected = selectEl.value;
  const presentGenreIds = new Set();

  if (Array.isArray(rawItems)) {
    rawItems.forEach(item => {
      if (Array.isArray(item.genre_ids)) {
        item.genre_ids.forEach(id => presentGenreIds.add(Number(id)));
      }
    });
  }

  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "ALL GENRES";
  selectEl.appendChild(defaultOption);

  const sortedGenreIds = Array.from(presentGenreIds)
    .filter(id => GENRE_MAP[id])
    .sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b]));

  let selectedStillExists = false;

  sortedGenreIds.forEach(id => {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = GENRE_MAP[id];

    if (String(id) === String(currentSelected)) {
      option.selected = true;
      selectedStillExists = true;
    }

    selectEl.appendChild(option);
  });

  // Keep a selected genre available even when it is absent from the first
  // discovery page. Otherwise assigning the shared filter value to this
  // page-specific select silently resets it to an empty string.
  if (currentSelected && !selectedStillExists && GENRE_MAP[Number(currentSelected)]) {
    const option = document.createElement("option");
    option.value = String(currentSelected);
    option.textContent = GENRE_MAP[Number(currentSelected)];
    option.selected = true;
    selectEl.appendChild(option);
    selectedStillExists = true;
  }

  if (selectedStillExists) {
    selectEl.value = currentSelected;
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
  switchPage("platformCatalog", true);
  if (!isBackEvent) {
    pushSpaState("platformCatalog", platformId);
  }

  document.getElementById("platformCatalogTitle").innerText = selectedPlatform.name;
  const platformSearchInput = document.getElementById("platformSearchFilter");
  if (platformSearchInput) platformSearchInput.value = "";
  const mediaTypeSelect = document.getElementById("platformMediaTypeSelect");
  if (mediaTypeSelect) mediaTypeSelect.value = "all";
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

  updatePlatformTypeButtonsUI();
  fetchPlatformCatalog(1);
}

function setPlatformTypeFilter(type) {
  platformMediaType = ["all", "movie", "tv"].includes(type) ? type : "all";
  const select = document.getElementById("platformMediaTypeSelect");
  if (select) select.value = platformMediaType;
  updatePlatformTypeButtonsUI();
  fetchPlatformCatalog(1);
}

function updatePlatformTypeButtonsUI() {
  const typeSelect = document.getElementById("platformMediaTypeSelect");
  if (typeSelect) typeSelect.value = platformMediaType;
  const allBtn = document.getElementById("platformTypeAll");
  const movieBtn = document.getElementById("platformTypeMovies");
  const tvBtn = document.getElementById("platformTypeTv");

  [allBtn, movieBtn, tvBtn].forEach(btn => {
    if (btn) {
      btn.className = "px-3 py-1 text-xs font-bold rounded-md text-zinc-400 hover:text-white transition";
    }
  });

  if (platformMediaType === "all" && allBtn) {
    allBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  } else if (platformMediaType === "movie" && movieBtn) {
    movieBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  } else if (platformMediaType === "tv" && tvBtn) {
    tvBtn.className = "px-3 py-1 text-xs font-bold rounded-md bg-brand text-black transition";
  }
}

async function fetchPlatformCatalog(page = 1) {
  if (!selectedPlatform) return;
  
  const currentReqId = ++latestPlatformRequestId;

  if (page === 1) {
    renderGridLoading("platformCatalogGrid");
    removeLoadMoreButton("platformLoadMoreContainer");
    platformCurrentPage = 1;
    platformTotalPages = 1;
    displayedPlatformIds.clear();
  }

  const sort = document.getElementById("platformSortFilter")?.value || "popularity.desc";
  const platformSearchInput = document.getElementById("platformSearchFilter");
  const query = platformSearchInput ? platformSearchInput.value.trim() : "";
  const status = document.getElementById("platformCatalogStatus");
  if (status) { status.classList.add("hidden"); status.textContent = ""; }

  // 1. Search Mode Inside Platform
  if (query) {
    const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(query)}&page=${page}`);
    if (currentReqId !== latestPlatformRequestId) return;

    if (data && data.results && data.results.length > 0) {
      platformTotalPages = data.total_pages || 1;
      let filtered = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv");
      if (platformMediaType !== "all") {
        filtered = filtered.filter(r => r.media_type === platformMediaType);
      }

      if (page === 1) {
        updateDynamicGenreOptions("platformGenreFilter", filtered);
      }

      const activeGenreAfterUpdate = document.getElementById("platformGenreFilter").value;
      if (activeGenreAfterUpdate) {
        filtered = filtered.filter(r => {
          const ids = Array.isArray(r.genre_ids) ? r.genre_ids : (Array.isArray(r.genres) ? r.genres.map(g => g.id) : []);
          return ids.includes(Number(activeGenreAfterUpdate));
        });
      }

      const formatted = formatTMDB(filtered);
      const uniqueItems = formatted.filter(item => {
        const itemKey = `${item.type}_${item.id}`;
        if (displayedPlatformIds.has(itemKey)) return false;
        displayedPlatformIds.add(itemKey);
        return true;
      });

      renderGrid("platformCatalogGrid", uniqueItems, page > 1);

      if (page < platformTotalPages && uniqueItems.length > 0) {
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
      if (platformMediaType === "movie" || platformMediaType === "all") {
        const movieGenreEndpoint = isVivamaxCatalog
          ? `discover/movie?with_companies=${selectedPlatform.companyId || 149142}&sort_by=popularity.desc&page=1`
          : `discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`;
        const mBase = await fetchTMDB(movieGenreEndpoint);
        if (mBase && mBase.results) rawGenreSourceList = rawGenreSourceList.concat(mBase.results);
      }
      if (platformMediaType === "tv" || platformMediaType === "all") {
        const tvGenreEndpoint = isVivamaxCatalog
          ? `discover/tv?with_networks=${vivamaxNetworks}&sort_by=popularity.desc&page=1`
          : `discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=popularity.desc&page=1`;
        const tBase = await fetchTMDB(tvGenreEndpoint);
        if (tBase && tBase.results) rawGenreSourceList = rawGenreSourceList.concat(tBase.results);
      }
      updateDynamicGenreOptions("platformGenreFilter", rawGenreSourceList);
    }

    const activeGenreFilter = document.getElementById("platformGenreFilter").value;

    if (platformMediaType === "movie" || platformMediaType === "all") {
      let movieEndpoint = isVivamaxCatalog
        ? `discover/movie?with_companies=${selectedPlatform.companyId || 149142}&sort_by=${sort}&page=${page}`
        : `discover/movie?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      if (activeGenreFilter) movieEndpoint += `&with_genres=${activeGenreFilter}`;
      let mData = await fetchTMDB(movieEndpoint);
      // Watch-provider catalogs are region-specific. Production-company catalogs like VivaMax
      // must use company IDs and must not be retried as watch providers in other regions.
      if (!isVivamaxCatalog && (!mData || !Array.isArray(mData.results) || mData.results.length === 0)) {
        for (const region of ["US", "GB", "CA", "AU", "IN"]) {
          const regionalData = await fetchTMDB(movieEndpoint.replace("watch_region=PH", `watch_region=${region}`));
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

    if (platformMediaType === "tv" || platformMediaType === "all") {
      let tvEndpoint = isVivamaxCatalog
        ? `discover/tv?with_networks=${vivamaxNetworks}&sort_by=${sort}&page=${page}`
        : `discover/tv?with_watch_providers=${pId}&watch_region=PH&sort_by=${sort}&page=${page}`;
      if (activeGenreFilter) tvEndpoint += `&with_genres=${activeGenreFilter}`;
      let tData = await fetchTMDB(tvEndpoint);
      if (!isVivamaxCatalog && (!tData || !Array.isArray(tData.results) || tData.results.length === 0)) {
        for (const region of ["US", "GB", "CA", "AU", "IN"]) {
          const regionalData = await fetchTMDB(tvEndpoint.replace("watch_region=PH", `watch_region=${region}`));
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
    const uniqueItems = rawItems.filter(item => {
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
      status.textContent = `TMDB returned no titles for ${selectedPlatform.name} in the selected catalog. Try another content type or platform.`;
      status.classList.remove("hidden");
    }

    if (page < platformTotalPages && uniqueItems.length > 0) {
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
  const typeSelect = document.getElementById("platformMediaTypeSelect");
  if (typeSelect) typeSelect.addEventListener("change", () => setPlatformTypeFilter(typeSelect.value));
  const btn = document.getElementById("platformFilterBtn");
  if (btn) btn.onclick = () => fetchPlatformCatalog(1);

  const genreSelect = document.getElementById("platformGenreFilter");
  if (genreSelect) {
    genreSelect.addEventListener("change", () => fetchPlatformCatalog(1));
  }

  const sortSelect = document.getElementById("platformSortFilter");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => fetchPlatformCatalog(1));
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

  const sort = document.getElementById("movieSortFilter") ? document.getElementById("movieSortFilter").value : "popularity.desc";
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

  const activeGenreFilter = document.getElementById("movieGenreFilter") ? document.getElementById("movieGenreFilter").value : "";

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

    if (page < moviesTotalPages && uniqueItems.length > 0) {
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

  const sort = document.getElementById("tvSortFilter") ? document.getElementById("tvSortFilter").value : "popularity.desc";
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

  const activeGenreFilter = document.getElementById("tvGenreFilter") ? document.getElementById("tvGenreFilter").value : "";

  let endpoint = `discover/tv?sort_by=${sort}&page=${page}`;
  if (activeGenreFilter) endpoint += `&with_genres=${activeGenreFilter}`;
  if (query) endpoint = `search/tv?query=${encodeURIComponent(query)}&page=${page}`;

  const data = await fetchTMDB(endpoint);
  if (requestId !== latestTvRequestId) return;

  if (data && data.results && data.results.length > 0) {
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

    if (page < tvTotalPages && uniqueItems.length > 0) {
      renderLoadMoreButton("tvSeeMoreContainer", handleSeeMoreTv, "SEE MORE");
    } else {
      removeLoadMoreButton("tvSeeMoreContainer");
    }
  } else {
    if (page === 1) {
      document.getElementById("tvCatalogGrid").innerHTML = `<p class="text-zinc-500 text-sm col-span-full py-8 text-center">Unable to load TV series catalog.</p>`;
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

function loadMovieIframe(id) {
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
  } else if (currentServer === "videasy") {
    url = `https://player.videasy.to/movie/${id}`;
  } else if (currentServer === "vidzee") {
    url = `https://player.vidzee.wtf/embed/movie/${id}`;
  }

  if (!url) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: no valid movie provider selected.");
    return;
  }
  iframe.src = url;
}

async function setupTvPlayer(item, isBackEvent = false) {
  activatePlayer("tv", item);
  movePlayerToHost("tvPlayerHost");
  switchPage("tvPlayer", isBackEvent);
  if (!isBackEvent) {
    pushSpaState("tvPlayer", item);
  }

  document.getElementById("tvPlayerTitle").innerText = item.title;

  currentSeason = 1;
  currentEpisode = 1;

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
    btn.onclick = () => {
      currentSeason = s.season_number;
      currentEpisode = 1;

      if (tvContextDetail) {
        tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
      }
      
      document.querySelectorAll("#seasonTabs button").forEach(b => {
        b.className = "px-4 py-2 rounded-lg font-bold text-xs transition bg-zinc-800 text-zinc-300 hover:bg-zinc-700";
      });
      btn.className = "px-4 py-2 rounded-lg font-bold text-xs transition bg-brand text-black";

      renderTvEpisodes(item.id, s.episode_count);
      loadTvIframe(item.id);
    };
    seasonTabs.appendChild(btn);
  });

  renderTvEpisodes(item.id, seasons[0].episode_count);
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
  if (requestedSeason !== currentSeason || requestedTvId !== String(activeItem && activeItem.id)) return;
  const episodes = seasonData && Array.isArray(seasonData.episodes) ? seasonData.episodes : [];
  const count = episodeCount || episodes.length || 10;
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
    epBtn.onclick = () => {
      currentEpisode = e;
      const tvContextDetail = document.getElementById("tvPlayerContextDetail");
      if (tvContextDetail) {
        tvContextDetail.innerText = `Season ${currentSeason} Episode ${currentEpisode}`;
      }
      document.querySelectorAll("#episodesGrid button").forEach(b => {
        b.className = "bg-zinc-900 border border-zinc-800 hover:border-brand/50 p-3 rounded-xl text-left flex items-center gap-3 transition";
      });
      epBtn.className = "bg-zinc-800 border border-brand p-3 rounded-xl text-left flex items-center gap-3 transition";
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
}

function loadTvIframe(id) {
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
  } else if (currentServer === "videasy") {
    url = `https://player.videasy.to/tv/${id}/${currentSeason}/${currentEpisode}`;
  } else if (currentServer === "vidzee") {
    url = `https://player.vidzee.wtf/embed/tv/${id}/${currentSeason}/${currentEpisode}`;
  }
  if (!url) {
    iframe.removeAttribute("src");
    console.warn("PopcornHUB: no valid TV provider selected.");
    return;
  }
  iframe.src = url;
}

function renderServers(containerId, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const servers = [
  { id: "vidcore", name: "KERNEL" },
  { id: "vidlink", name: "BUTTER" },
  { id: "vidsrc", name: "CARAMEL" },
  { id: "videasy", name: "CHEESE" },
  { id: "vidzee", name: "PREMIUM" }
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
  removeLoadMoreButton("movieRelatedLoadMoreContainer");

  if (type === "movie") {
    currentMovieRelatedMovieId = id;
    movieRelatedCurrentPage = 1;
    movieRelatedTotalPages = 1;
    displayedMovieRelatedIds.clear();

    const data = await fetchTMDB(`movie/${id}/recommendations?page=1`);
    if (data && data.results && data.results.length > 0) {
      movieRelatedTotalPages = data.total_pages || 1;
      const filtered = formatTMDB(data.results.filter(i => i.id !== id), "movie");
      filtered.forEach(item => displayedMovieRelatedIds.add(item.id));

      renderGrid(targetId, filtered);

      if (movieRelatedCurrentPage < movieRelatedTotalPages && filtered.length > 0) {
        renderLoadMoreButton("movieRelatedLoadMoreContainer", handleLoadMoreMovieRelated, "LOAD MORE");
      } else {
        removeLoadMoreButton("movieRelatedLoadMoreContainer");
      }
    } else {
      const fallback = await fetchTMDB(`movie/${id}/similar?page=1`);
      if (fallback && fallback.results && fallback.results.length > 0) {
        movieRelatedTotalPages = fallback.total_pages || 1;
        const filtered = formatTMDB(fallback.results.filter(i => i.id !== id), "movie");
        filtered.forEach(item => displayedMovieRelatedIds.add(item.id));

        renderGrid(targetId, filtered);

        if (movieRelatedCurrentPage < movieRelatedTotalPages && filtered.length > 0) {
          renderLoadMoreButton("movieRelatedLoadMoreContainer", handleLoadMoreMovieRelated, "LOAD MORE");
        } else {
          removeLoadMoreButton("movieRelatedLoadMoreContainer");
        }
      } else {
        renderGrid(targetId, []);
        removeLoadMoreButton("movieRelatedLoadMoreContainer");
      }
    }
  } else {
    const data = await fetchTMDB(`tv/${id}/recommendations?page=1`);
    if (data && data.results && data.results.length > 0) {
      renderGrid(targetId, formatTMDB(data.results.filter(i => i.id !== id), "tv"));
    } else {
      const fallback = await fetchTMDB(`tv/${id}/similar?page=1`);
      if (fallback && fallback.results) {
        renderGrid(targetId, formatTMDB(fallback.results.filter(i => i.id !== id), "tv"));
      } else {
        renderGrid(targetId, []);
      }
    }
  }
}

async function handleLoadMoreMovieRelated() {
  if (isMovieRelatedLoadingMore || movieRelatedCurrentPage >= movieRelatedTotalPages || !currentMovieRelatedMovieId) return;

  isMovieRelatedLoadingMore = true;
  setLoadMoreState("movieRelatedLoadMoreContainer", true, "LOAD MORE");

  const nextPage = movieRelatedCurrentPage + 1;
  const data = await fetchTMDB(`movie/${currentMovieRelatedMovieId}/recommendations?page=${nextPage}`);

  if (data && data.results && data.results.length > 0) {
    movieRelatedCurrentPage = nextPage;
    const formatted = formatTMDB(data.results.filter(i => i.id !== currentMovieRelatedMovieId), "movie");
    const uniqueItems = formatted.filter(item => !displayedMovieRelatedIds.has(item.id));
    uniqueItems.forEach(item => displayedMovieRelatedIds.add(item.id));

    renderGrid("movieRelatedGrid", uniqueItems, true);

    if (movieRelatedCurrentPage < movieRelatedTotalPages && uniqueItems.length > 0) {
      setLoadMoreState("movieRelatedLoadMoreContainer", false, "LOAD MORE");
    } else {
      removeLoadMoreButton("movieRelatedLoadMoreContainer");
    }
  } else {
    removeLoadMoreButton("movieRelatedLoadMoreContainer");
  }

  isMovieRelatedLoadingMore = false;
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

function updateSearchContextUI() {
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
    const hideTypeFilter = ["movies", "tv"].includes(searchOriginPage);
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
    currentSearchGenre = genreFilter.value;
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
    const genre = document.getElementById("tvGenreFilter");
    const sort = document.getElementById("tvSortFilter");
    if (genre) genre.value = currentSearchGenre;
    if (sort) sort.value = ({ relevance: "popularity.desc", rating: "vote_average.desc", newest: "first_air_date.desc", title: "name.asc" })[currentSearchSort] || "popularity.desc";
    fetchTvCatalog(1);
  } else if (page === "platformCatalog") {
    platformMediaType = currentSearchType;
    const type = document.getElementById("platformMediaTypeSelect");
    const genre = document.getElementById("platformGenreFilter");
    const sort = document.getElementById("platformSortFilter");
    if (type) type.value = platformMediaType;
    if (genre) genre.value = currentSearchGenre;
    if (sort) {
      const platformSortMap = {
        relevance: "popularity.desc",
        rating: "vote_average.desc",
        newest: platformMediaType === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
        title: platformMediaType === "tv" ? "name.asc" : "title.asc"
      };
      sort.value = platformSortMap[currentSearchSort] || "popularity.desc";
    }
    updatePlatformTypeButtonsUI();
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
}

async function performSearch(query, page = 1) {
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 2) return;
  const currentReqId = ++latestSearchRequestId;
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

  // Platform catalog searches remain scoped to the selected provider.
  if (searchOriginPage === "platformCatalog") {
    const platformQuery = document.getElementById("platformSearchFilter");
    if (platformQuery) platformQuery.value = normalizedQuery;
    await fetchPlatformCatalog(1);
    return;
  }

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

  const data = await fetchTMDB(`search/multi?query=${encodeURIComponent(normalizedQuery)}&page=${page}`);
  if (currentReqId !== latestSearchRequestId) return;
  if (data && Array.isArray(data.results)) {
    searchTotalPages = data.total_pages || 1;
    searchCurrentPage = page;
    const existing = new Set(searchRawItems.map(item => `${item.media_type}_${item.id}`));
    data.results.forEach(item => {
      if ((item.media_type === "movie" || item.media_type === "tv") && !existing.has(`${item.media_type}_${item.id}`)) {
        searchRawItems.push(item);
        existing.add(`${item.media_type}_${item.id}`);
      }
    });
    renderFilteredSearchResults(page > 1);
    const resultsGrid = document.getElementById("searchResultsGrid");
    const hasVisibleResults = Boolean(resultsGrid && resultsGrid.querySelector(".group"));
    if (hasVisibleResults && page < searchTotalPages) {
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
  if (!hasVisibleResults) removeLoadMoreButton("searchLoadMoreContainer");
  else if (searchCurrentPage < searchTotalPages && !document.querySelector("#searchLoadMoreContainer .load-more-btn")) {
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

