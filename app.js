let autoNextLock = false;
let currentEpisodeKey = null;
let currentItem = null;
let initialSeasonLoad = true;
let manualEpisodeChange = false;
let lastAutoNextKey = "";

// CONTENT MODE
let currentContentMode = "home";
let currentSearchQuery = "";

// MOVIE PAGINATION
let moviePage = 1;
let movieTotalPages = 1;
let allMovieData = [];
let movieVisibleCount = 10;

// TV / ANIME PAGINATION
let tvPage = 1;
let tvTotalPages = 1;
let allTVData = [];
let tvVisibleCount = 10;

let animePage = 1;
let animeTotalPages = 1;
let allAnimeData = [];
let animeVisibleCount = 10;

// SEARCH PAGINATION
let searchMoviePage = 1;
let searchMovieTotalPages = 1;

let searchTVPage = 1;
let searchTVTotalPages = 1;

let searchAnimePage = 1;
let searchAnimeTotalPages = 1;

let searchMovieData = [];
let searchTVData = [];
let searchAnimeData = [];

let searchMovieVisibleCount = 0;
let searchTVVisibleCount = 0;
let searchAnimeVisibleCount = 0;

let searchMovieExhausted = false;
let searchTVExhausted = false;
let searchAnimeExhausted = false;

let loadingMoreMovies = false;

const TMDB_API_KEY = "7124d4e6e0feb015f07fc9a57bc27227";

// Debounced search
let searchDebounce;
const searchInput = document.getElementById("searchInput");

searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") {
        return;
    }
    clearTimeout(searchDebounce);
    searchAll();
});

searchInput.addEventListener("input", () => {

    clearTimeout(searchDebounce);

    searchDebounce = setTimeout(() => {
        searchAll();
    }, 300);
});

// Category Titles Helper
function setCategoryTitles(isHome){
  document.querySelector("#movieCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-film"></i> ${isHome ? "Popular Movies" : "Movies"}`;
  document.querySelector("#tvCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-clapperboard"></i> ${isHome ? "Popular TV Series" : "TV Series"}`;
  document.querySelector("#animeCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-tv"></i> ${isHome ? "Popular Anime" : "Anime"}`;
}


// Load top content (Home)
async function loadHome() {
    
    // HOME MODE
    currentContentMode = "home";
    currentSearchQuery = "";

    // Reset search pages
    searchMoviePage = 1;
    searchMovieTotalPages = 1;

    searchTVPage = 1;
    searchTVTotalPages = 1;

    searchAnimePage = 1;
    searchAnimeTotalPages = 1;

    searchMovieData = [];
    searchTVData = [];
    searchAnimeData = [];

    searchMovieVisibleCount = 0;
    searchTVVisibleCount = 0;
    searchAnimeVisibleCount = 0;
    
    const movieRow = document.getElementById("movieResults");
    const tvRow = document.getElementById("tvResults");
    const animeRow = document.getElementById("animeResults");
    document.getElementById("emptySearch").style.display = "none";

    if (!movieRow.children.length) showSkeleton("movieResults");
    if (!tvRow.children.length) showSkeleton("tvResults");
    if (!animeRow.children.length) showSkeleton("animeResults");

    setCategoryTitles(true);

    try {
        const [m, t] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
            fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`)
        ]);

        if (!m.ok) throw new Error(`Movies API ${m.status}`);
        if (!t.ok) throw new Error(`TV API ${t.status}`);

        const md = await m.json();
        const td = await t.json();

        // Movies
        moviePage = md.page || 1;
        movieTotalPages = md.total_pages || 1;

        console.log(
            "TMDB MOVIES:",
            "page", moviePage,
            "/",
            movieTotalPages
        );

        allMovieData = (md.results || []).map(i => ({
            type: "movie",
            id: i.id,
            title: i.title,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",
            videasyUrl: `https://player.videasy.net/movie/${i.id}`
        }));

        movieVisibleCount = 10;

        // TV + Anime
        tvPage = td.page || 1;
        tvTotalPages = td.total_pages || 1;

        animePage = td.page || 1;
        animeTotalPages = td.total_pages || 1;

        const tvResults = td.results || [];

        const animeItems = tvResults.filter(i =>
            i.original_language === "ja" &&
            (i.genre_ids || []).includes(16)
        );

        const normalTVItems = tvResults.filter(i =>
            !(
                i.original_language === "ja" &&
                (i.genre_ids || []).includes(16)
            )
        );
        
        allTVData = normalTVItems.map(i => ({
            type: "tv",
            id: i.id,
            title: i.name,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",
            videasyUrl:
                `https://player.videasy.net/tv/${i.id}/1/1`
        }));
        

        allAnimeData = animeItems.map(i => ({
            type: "tv",
            id: i.id,
            title: i.name,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",
            videasyUrl: `https://player.videasy.net/tv/${i.id}/1/1`
        }));
        
        // Preload Anime until 10 cards
        while (
            allAnimeData.length < 10 &&
            animePage < animeTotalPages
        ) {
            const loaded = await loadMoreAnimePage();
            if (!loaded) break;
        }
        
        tvVisibleCount = 10;
        animeVisibleCount = 10;

        console.log(
            "TMDB TV:",
            "page", tvPage,
            "/",
            tvTotalPages
        );

        console.log(
            "TV LOADED:",
            allTVData.length,
            "| ANIME:",
            allAnimeData.length
        );

        // Render
        render(
            "movieCategory",
            "movieResults",
            allMovieData.slice(0, movieVisibleCount)
        );

        render(
            "tvCategory",
            "tvResults",
            allTVData.slice(0, tvVisibleCount)
        );

        render(
            "animeCategory",
            "animeResults",
            allAnimeData.slice(0, animeVisibleCount)
        );

        document.getElementById("animeCategory").style.display =
            allAnimeData.length ? "block" : "none";

    } catch (e) {
        console.error(e);
    }
}


async function loadMoreMovies() {

    // =====================================
    // STILL HAVE HIDDEN LOADED MOVIES
    // =====================================
    if (movieVisibleCount < allMovieData.length) {

        movieVisibleCount = Math.min(
            movieVisibleCount + 10,
            allMovieData.length
        );

        render(
            "movieCategory",
            "movieResults",
            allMovieData.slice(0, movieVisibleCount)
        );

        console.log(
            "MOVIES VISIBLE:",
            movieVisibleCount,
            "/",
            allMovieData.length
        );

        return;
    }

    // =====================================
    // LOADED MOVIES ARE ALL VISIBLE
    // GET NEXT TMDB PAGE
    // =====================================
    console.log(
        "LOADED MOVIES EXHAUSTED — GETTING NEXT PAGE"
    );

    const loaded = await loadMoreMoviePage();

    if (!loaded) {
        console.log("NO MORE MOVIES AVAILABLE");
        return;
    }

    // =====================================
    // REVEAL 10 FROM NEWLY LOADED DATA
    // =====================================
    movieVisibleCount = Math.min(
        movieVisibleCount + 10,
        allMovieData.length
    );

    render(
        "movieCategory",
        "movieResults",
        allMovieData.slice(0, movieVisibleCount)
    );

    console.log(
        "MOVIES VISIBLE:",
        movieVisibleCount,
        "/",
        allMovieData.length
    );
}

// Load More TV
async function loadMoreTV() {
    if (tvVisibleCount < allTVData.length) {
        tvVisibleCount = Math.min(
            tvVisibleCount + 10,
            allTVData.length
        );

        render(
            "tvCategory",
            "tvResults",
            allTVData.slice(0, tvVisibleCount)
        );

        console.log(
            "TV VISIBLE:",
            tvVisibleCount,
            "/",
            allTVData.length
        );

        return;
    }

    if (tvPage >= tvTotalPages) {
        console.log("NO MORE TV AVAILABLE");
        return;
    }

    console.log(
        "LOADED TV EXHAUSTED — GETTING NEXT PAGE"
    );

    const loaded = await loadMoreTVPage();

    if (!loaded) {
        console.log("NO MORE TV AVAILABLE");
        return;
    }

    tvVisibleCount = Math.min(
        tvVisibleCount + 10,
        allTVData.length
    );

    render(
        "tvCategory",
        "tvResults",
        allTVData.slice(0, tvVisibleCount)
    );

    console.log(
        "TV VISIBLE:",
        tvVisibleCount,
        "/",
        allTVData.length
    );
}
// Load TV Page
async function loadMoreTVPage() {
    if (tvPage >= tvTotalPages) return false;

    const nextPage = tvPage + 1;

    console.log(
        "LOADING TMDB TV PAGE:",
        nextPage,
        "/",
        tvTotalPages
    );

    const response = await fetch(
        `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=${nextPage}`
    );

    if (!response.ok) {
        console.error("TV API ERROR:", response.status);
        return false;
    }

    const data = await response.json();

    tvPage = data.page || nextPage;
    tvTotalPages = data.total_pages || tvTotalPages;

    const results = data.results || [];

    const newTV = results
        .filter(i =>
            !(
                i.original_language === "ja" &&
                (i.genre_ids || []).includes(16)
            )
        )
        .map(i => ({
            type: "tv",
            id: i.id,
            title: i.name,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",
            videasyUrl: `https://player.videasy.net/tv/${i.id}/1/1`
        }));

    allTVData.push(...newTV);

    console.log(
        "TV LOADED:",
        newTV.length,
        "| TOTAL:",
        allTVData.length
    );

    return true;
}

// Load More Anime
async function loadMoreAnime() {
    if (animeVisibleCount < allAnimeData.length) {
        animeVisibleCount = Math.min(
            animeVisibleCount + 10,
            allAnimeData.length
        );

        render(
            "animeCategory",
            "animeResults",
            allAnimeData.slice(0, animeVisibleCount)
        );

        console.log(
            "ANIME VISIBLE:",
            animeVisibleCount,
            "/",
            allAnimeData.length
        );

        return;
    }

    if (animePage >= animeTotalPages) {
        console.log("NO MORE ANIME AVAILABLE");
        return;
    }

    console.log(
        "LOADED ANIME EXHAUSTED — GETTING NEXT PAGE"
    );

    const loaded = await loadMoreAnimePage();

    if (!loaded) {
        console.log("NO MORE ANIME AVAILABLE");
        return;
    }

    animeVisibleCount = Math.min(
        animeVisibleCount + 10,
        allAnimeData.length
    );

    render(
        "animeCategory",
        "animeResults",
        allAnimeData.slice(0, animeVisibleCount)
    );

    console.log(
        "ANIME VISIBLE:",
        animeVisibleCount,
        "/",
        allAnimeData.length
    );
}

// Load Anime Page
async function loadMoreAnimePage() {
    if (animePage >= animeTotalPages) return false;

    let added = 0;

    while (animePage < animeTotalPages && allAnimeData.length < animeVisibleCount + 10) {
        const nextPage = animePage + 1;

        console.log(
            "LOADING TMDB ANIME PAGE:",
            nextPage,
            "/",
            animeTotalPages
        );

        const response = await fetch(
            `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=${nextPage}`
        );

        if (!response.ok) {
            console.error("ANIME API ERROR:", response.status);
            return added > 0;
        }

        const data = await response.json();

        animePage = data.page || nextPage;
        animeTotalPages = data.total_pages || animeTotalPages;

        const results = data.results || [];

        const newAnime = results
            .filter(i =>
                i.original_language === "ja" &&
                (i.genre_ids || []).includes(16)
            )
            .map(i => ({
                type: "tv",
                id: i.id,
                title: i.name,
                poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                    : "",
                videasyUrl: `https://player.videasy.net/tv/${i.id}/1/1`
            }));

        allAnimeData.push(...newAnime);
        added += newAnime.length;

        console.log(
            "ANIME FOUND:",
            newAnime.length,
            "| TOTAL:",
            allAnimeData.length
        );
    }

    return added > 0;
}

async function loadMoreMoviePage() {

    if (loadingMoreMovies) return false;

    if (moviePage >= movieTotalPages) {
        console.log("NO MORE TMDB MOVIE PAGES");
        return false;
    }

    loadingMoreMovies = true;

    const nextPage = moviePage + 1;

    console.log(
        "LOADING TMDB MOVIE PAGE:",
        nextPage,
        "/",
        movieTotalPages
    );

    try {

        const response = await fetch(
            `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=${nextPage}`
        );

        if (!response.ok) {
            throw new Error(
                `Movies API ${response.status}`
            );
        }

        const data = await response.json();

        const newMovies = (data.results || []).map(i => ({
            type: "movie",
            id: i.id,
            title: i.title,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",
            videasyUrl:
                `https://player.videasy.net/movie/${i.id}`
        }));

        allMovieData.push(...newMovies);

        moviePage = data.page || nextPage;
        movieTotalPages = data.total_pages || movieTotalPages;

        console.log(
            "MOVIES LOADED:",
            newMovies.length,
            "| TOTAL:",
            allMovieData.length
        );

        return newMovies.length > 0;

    } catch (error) {

        console.error(
            "Failed to load more movies:",
            error
        );

        return false;

    } finally {

        loadingMoreMovies = false;

    }
}


// =========================
// SEARCH LOAD MORE MOVIES
// =========================
async function loadMoreSearchMovies() {
    if (searchMovieExhausted) return false;
    
    if (currentContentMode !== "search" || !currentSearchQuery) {
        return false;
    }

    if (searchMoviePage >= searchMovieTotalPages) {
        searchMovieExhausted = true;
        console.log("NO MORE SEARCH MOVIES");
        return false;
    }

    const nextPage = searchMoviePage + 1;

    console.log(
        "LOADING SEARCH MOVIES:",
        currentSearchQuery,
        "page",
        nextPage,
        "/",
        searchMovieTotalPages
    );

    const res = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(currentSearchQuery)}&page=${nextPage}`
    );

    if (!res.ok) {
        throw new Error(`Search Movies API ${res.status}`);
    }

    const data = await res.json();

    searchMoviePage = data.page || nextPage;
    searchMovieTotalPages = data.total_pages || searchMovieTotalPages;

    const newMovies = (data.results || []).map(i => ({
        type: "movie",
        id: i.id,
        title: i.title,
        poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
            : "",
        videasyUrl: `https://player.videasy.net/movie/${i.id}`
    }));

    // Prevent duplicates
    const existingIds = new Set(
        searchMovieData.map(i => i.id)
    );

    const uniqueMovies = newMovies.filter(
        i => !existingIds.has(i.id)
    );

    searchMovieData.push(...uniqueMovies);

    searchMovieVisibleCount = Math.min(
        searchMovieVisibleCount + uniqueMovies.length,
        searchMovieData.length
    );

    render(
        "movieCategory",
        "movieResults",
        searchMovieData.slice(0, searchMovieVisibleCount)
    );

    console.log(
        "SEARCH MOVIES:",
        searchMovieData.length,
        "| PAGE:",
        searchMoviePage,
        "/",
        searchMovieTotalPages
    );

    return uniqueMovies.length > 0;
}


// =========================
// SEARCH LOAD MORE TV
// =========================
async function loadMoreSearchTV() {
    if (searchTVExhausted) return false;
    
    if (currentContentMode !== "search" || !currentSearchQuery) {
        return false;
    }

    if (searchTVPage >= searchTVTotalPages) {
        searchTVExhausted = true;
        console.log("NO MORE SEARCH TV");
        return false;
    }

    const nextPage = searchTVPage + 1;

    console.log(
        "LOADING SEARCH TV:",
        currentSearchQuery,
        "page",
        nextPage,
        "/",
        searchTVTotalPages
    );

    const res = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(currentSearchQuery)}&page=${nextPage}`
    );

    if (!res.ok) {
        throw new Error(`Search TV API ${res.status}`);
    }

    const data = await res.json();

    searchTVPage = data.page || nextPage;
    searchTVTotalPages = data.total_pages || searchTVTotalPages;

    const tvResults = data.results || [];

    const animeItems = tvResults.filter(i =>
        i.original_language === "ja" &&
        (i.genre_ids || []).includes(16)
    );

    const normalTVItems = tvResults.filter(i =>
        !(
            i.original_language === "ja" &&
            (i.genre_ids || []).includes(16)
        )
    );

    const newTV = normalTVItems.map(i => ({
        type: "tv",
        id: i.id,
        title: i.name,
        poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
            : "",
        videasyUrl: `https://player.videasy.net/tv/${i.id}/1/1`
    }));

    const newAnime = animeItems.map(i => ({
        type: "tv",
        id: i.id,
        title: i.name,
        poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
            : "",
        videasyUrl: `https://player.videasy.net/tv/${i.id}/1/1`
    }));

    // Prevent duplicate TV
    const existingTVIds = new Set(
        searchTVData.map(i => i.id)
    );

    const uniqueTV = newTV.filter(
        i => !existingTVIds.has(i.id)
    );

    searchTVData.push(...uniqueTV);

    // Prevent duplicate Anime
    const existingAnimeIds = new Set(
        searchAnimeData.map(i => i.id)
    );

    const uniqueAnime = newAnime.filter(
        i => !existingAnimeIds.has(i.id)
    );

    searchAnimeData.push(...uniqueAnime);

    searchTVVisibleCount = Math.min(
        searchTVVisibleCount + uniqueTV.length,
        searchTVData.length
    );

    searchAnimeVisibleCount = Math.min(
        searchAnimeVisibleCount + uniqueAnime.length,
        searchAnimeData.length
    );

    render(
        "tvCategory",
        "tvResults",
        searchTVData.slice(0, searchTVVisibleCount)
    );

    render(
        "animeCategory",
        "animeResults",
        searchAnimeData.slice(0, searchAnimeVisibleCount)
    );

    document.getElementById("animeCategory").style.display =
        searchAnimeData.length ? "block" : "none";

    console.log(
        "SEARCH TV:",
        searchTVData.length,
        "| ANIME:",
        searchAnimeData.length,
        "| PAGE:",
        searchTVPage,
        "/",
        searchTVTotalPages
    );

    return uniqueTV.length > 0 || uniqueAnime.length > 0;
}


// =========================
// SEARCH LOAD MORE ANIME
// =========================
async function loadMoreSearchAnime() {
    // Anime comes from the same TMDB TV search endpoint.
    // TV pagination controls both TV and Anime results.

    if (currentContentMode !== "search" || !currentSearchQuery) {
        return false;
    }

    return loadMoreSearchTV();
}


// SEARCH
async function searchAll() {

    showSkeleton("movieResults");
    showSkeleton("tvResults");
    showSkeleton("animeResults");

    moveContinueWatching(false);

    const query = searchInput.value.trim();

    // =====================================
    // EMPTY SEARCH → RETURN TO HOME
    // =====================================
    if (!query) {

        currentContentMode = "home";
        currentSearchQuery = "";

        // Clear search state
        searchMovieData = [];
        searchTVData = [];
        searchAnimeData = [];

        searchMoviePage = 1;
        searchMovieTotalPages = 1;

        searchTVPage = 1;
        searchTVTotalPages = 1;

        searchAnimePage = 1;
        searchAnimeTotalPages = 1;

        searchMovieVisibleCount = 0;
        searchTVVisibleCount = 0;
        searchAnimeVisibleCount = 0;

        document.getElementById("stats").innerHTML = "";
        document.getElementById("stats").style.display = "block";
        document.getElementById("emptySearch").style.display = "none";

        await loadHome();

        moveContinueWatching(true);
        loadContinueWatching();

        return;
    }

    // =====================================
    // SEARCH MODE
    // =====================================
    currentContentMode = "search";
    currentSearchQuery = query;

    searchMovieExhausted = false;
    searchTVExhausted = false;
    searchAnimeExhausted = false;

    setCategoryTitles(false);

    // =====================================
    // RESET PREVIOUS SEARCH STATE
    // =====================================
    searchMovieData = [];
    searchTVData = [];
    searchAnimeData = [];

    searchMoviePage = 1;
    searchMovieTotalPages = 1;

    searchTVPage = 1;
    searchTVTotalPages = 1;

    searchAnimePage = 1;
    searchAnimeTotalPages = 1;

    searchMovieVisibleCount = 0;
    searchTVVisibleCount = 0;
    searchAnimeVisibleCount = 0;

    try {

        // =====================================
        // LOAD SEARCH PAGE 1
        // =====================================
        const [m, t] = await Promise.all([

            fetch(
                `https://api.themoviedb.org/3/search/movie` +
                `?api_key=${TMDB_API_KEY}` +
                `&query=${encodeURIComponent(query)}` +
                `&page=1`
            ),

            fetch(
                `https://api.themoviedb.org/3/search/tv` +
                `?api_key=${TMDB_API_KEY}` +
                `&query=${encodeURIComponent(query)}` +
                `&page=1`
            )

        ]);

        if (!m.ok) {
            throw new Error(`Movies Search API ${m.status}`);
        }

        if (!t.ok) {
            throw new Error(`TV Search API ${t.status}`);
        }

        const md = await m.json();
        const td = await t.json();

        // =====================================
        // SAVE PAGINATION STATE
        // =====================================
        searchMoviePage = md.page || 1;
        searchMovieTotalPages = md.total_pages || 1;

        searchTVPage = td.page || 1;
        searchTVTotalPages = td.total_pages || 1;

        // =====================================
        // MOVIES
        // =====================================
        searchMovieData = (md.results || []).map(i => ({
            type: "movie",
            id: i.id,
            title: i.title,

            poster: i.poster_path
                ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",

            videasyUrl:
                `https://player.videasy.net/movie/${i.id}`
        }));

        // =====================================
        // TV RESULTS
        // =====================================
        const tvResults = td.results || [];

        // =====================================
        // SPLIT TV / ANIME
        // =====================================
        const animeItems = tvResults.filter(i =>
            i.original_language === "ja" &&
            (i.genre_ids || []).includes(16)
        );

        const normalTVItems = tvResults.filter(i =>
            !(
                i.original_language === "ja" &&
                (i.genre_ids || []).includes(16)
            )
        );

        // =====================================
        // NORMAL TV
        // =====================================
        searchTVData = normalTVItems.map(i => ({
            type: "tv",
            id: i.id,
            title: i.name,

            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",

            videasyUrl:
                `https://player.videasy.net/tv/${i.id}/1/1`
        }));

        // =====================================
        // ANIME
        // =====================================
        searchAnimeData = animeItems.map(i => ({
            type: "tv",
            id: i.id,
            title: i.name,

            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
                : "",

            videasyUrl:
                `https://player.videasy.net/tv/${i.id}/1/1`
        }));

        // =====================================
        // INITIAL VISIBLE COUNTS
        // =====================================
        searchMovieVisibleCount = searchMovieData.length;
        searchTVVisibleCount = searchTVData.length;
        searchAnimeVisibleCount = searchAnimeData.length;

        // =====================================
        // STATS
        // =====================================
        document.getElementById("stats").innerHTML =
            `<span class="statLink"
                onclick="scrollToCategory('movieCategory')">
                <i class="fa-solid fa-film"></i>
                ${searchMovieData.length} Movies
            </span>
            &nbsp;|&nbsp;
            <span class="statLink"
                onclick="scrollToCategory('tvCategory')">
                <i class="fa-solid fa-clapperboard"></i>
                ${searchTVData.length} TV Series
            </span>
            &nbsp;|&nbsp;
            <span class="statLink"
                onclick="scrollToCategory('animeCategory')">
                <i class="fa-solid fa-tv"></i>
                ${searchAnimeData.length} Anime
            </span>`;

        // =====================================
        // RENDER PAGE 1
        // =====================================
        render(
            "movieCategory",
            "movieResults",
            searchMovieData
        );

        render(
            "tvCategory",
            "tvResults",
            searchTVData
        );

        render(
            "animeCategory",
            "animeResults",
            searchAnimeData
        );

        // =====================================
        // ANIME CATEGORY VISIBILITY
        // =====================================
        document.getElementById("animeCategory").style.display =
            searchAnimeData.length ? "block"
                : "none";

        // =====================================
        // NO RESULTS
        // =====================================
        const noResults =
            searchMovieData.length === 0 &&
            searchTVData.length === 0 &&
            searchAnimeData.length === 0;

        document.getElementById("emptySearch").style.display =
            noResults ? "flex"
                : "none";

        document.getElementById("stats").style.display =
            noResults ? "none"
                : "block";

        // =====================================
        // DEBUG
        // =====================================
        console.log(
            "SEARCH:",
            query
        );

        console.log(
            "SEARCH MOVIES:",
            searchMoviePage,
            "/",
            searchMovieTotalPages,
            "|",
            searchMovieData.length
        );

        console.log(
            "SEARCH TV:",
            searchTVPage,
            "/",
            searchTVTotalPages,
            "|",
            searchTVData.length
        );

        console.log(
            "SEARCH ANIME:",
            searchTVPage,
            "/",
            searchTVTotalPages,
            "|",
            searchAnimeData.length
        );

    } catch (error) {

        console.error(
            "SEARCH ERROR:",
            error
        );

    }
}


// Skeleton Loading
function showSkeleton(rowId, count = 10) {
    const row = document.getElementById(rowId);

    row.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement("div");
        skeleton.className = "skeletonCard";
        skeleton.style.setProperty(
            "--delay",
            (i * 0.25) + "s"
        );
        skeleton.innerHTML = `
            <div class="skeletonPoster"></div>

            <div class="skeletonInfo">
                <div class="skeletonLine skeletonTitle"></div>
                <div class="skeletonLine skeletonSub"></div>
            </div>
        `;
        
        const title = skeleton.querySelector(".skeletonTitle");
        const sub = skeleton.querySelector(".skeletonSub");

        title.style.width = (55 + Math.random() * 30) + "%";
        sub.style.width = (35 + Math.random() * 30) + "%";
        
        row.appendChild(skeleton);
    }
}

// Update Arrow State
function updateArrowState(row) {
    if (!row) return;

    const leftBtn = document.querySelector(
        `.arrow.left[data-target="${row.id}"]`
    );

    const rightBtn = document.querySelector(
        `.arrow.right[data-target="${row.id}"]`
    );

    if (!leftBtn || !rightBtn) return;

    leftBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
    leftBtn.classList.remove("startMode");

    rightBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
    rightBtn.classList.remove("seeMoreMode");
}

// Render
function render(catId, rowId, data) {
    const cat = document.getElementById(catId);
    const row = document.getElementById(rowId);

    if (!data.length) {
        row.innerHTML = "";
        cat.style.display = "none";
        return;
    }

    cat.style.display = "block";

    const skeletons = row.querySelectorAll(".skeletonCard");
    skeletons.forEach(card => card.classList.add("fadeOut"));

    setTimeout(() => {
        const existingCards = row.querySelectorAll(".movie").length;

        if (!existingCards) {
            row.innerHTML = "";
        }

        data.slice(existingCards).forEach(item => {
            const div = document.createElement("div");
            div.className = "movie";

            const genre = catId === "animeCategory" ? "Anime" :
                item.type === "movie" ? "Movie" : "TV Series";

            div.innerHTML = `
                <img loading="lazy"
                    src="${item.poster || "https://via.placeholder.com/300x450?text=No+Image"}"
                    alt="${item.title}">

                <div class="movieInfo">
                    <strong>${item.title}</strong>
                    <div class="genre">${genre}</div>
                </div>
            `;

            div.onclick = () => {
                openModal(item);
            };

            row.appendChild(div);
        });

        // Update Arrow State
        updateArrowState(row);

    }, 200);
}

// Modals
function closeModal() {
  const closeBtn = document.querySelector(".closeBtn");
  closeBtn.classList.add("flash-red");

  setTimeout(() => {
    document.getElementById("detailModal").classList.remove("show");
    document.getElementById("videoContainer").innerHTML = "";
    currentItem = null;
    closeBtn.classList.remove("flash-red");
    document.body.style.overflow = "";
    loadContinueWatching();
        const noResults =
            document.getElementById("emptySearch").style.display === "flex";
        if (
            noResults &&
            searchInput.value.trim()
        ) {
            searchInput.value = "";
            document.getElementById("emptySearch").style.display = "none";
            document.getElementById("stats").innerHTML = "";
            document.getElementById("stats").style.display = "block";
            moveContinueWatching(true);
            loadHome();
            return;
        }
  }, 300);
}

function openModal(item) {
    currentItem = item;
    document.getElementById("modalTitle").textContent = item.title;
    document.getElementById("detailModal").classList.add("show");
    document.body.style.overflow = "hidden";

    if (item.type === "movie") {

        currentEpisodeKey = `${item.id}-1-1`;
        const saved = getProgress(currentEpisodeKey);
        const savedProgress = saved?.watched ?? 0;

        updateVideo(
            item.videasyUrl,
            {
                overlay: true,
                color: "#bbf523",
                progress: savedProgress
            }
        );
    }

    loadDetails(item);
}


async function loadDetails(item){
  const box = document.getElementById("episodeControls");
  box.innerHTML = "";

  try {

    // ================= MOVIE =================
    if(item.type === "movie"){
      box.style.display = "none";

      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${item.id}?api_key=${TMDB_API_KEY}`
      );

      if (!res.ok) {
          throw new Error(`Movie Details Error ${res.status}`);
        }

        const data = await res.json();
      setDescription(data.overview);
      return;
    }

    // ================= TV Series/Anime =================
    box.style.display = "block";

    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${item.id}?api_key=${TMDB_API_KEY}`
    );

    if (!res.ok) {
      throw new Error(`TV Details Error ${res.status}`);
    }

    const data = await res.json();
    setDescription(data.overview);
    renderTVControls(item.id);
      
    } catch (e){
      console.error(e);
      setDescription("Failed to load description.");
      box.style.display = "none";
    }
}


function convertToVidlink(url) {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);

        // Movie
        if (parts[0] === "movie" && parts[1]) {
            return `https://vidlink.pro/movie/${parts[1]}`;
        }

        // TV / Anime using TV-style TMDB IDs
        if (
            parts[0] === "tv" &&
            parts[1] &&
            parts[2] &&
            parts[3]
        ) {
            return `https://vidlink.pro/tv/${parts[1]}/${parts[2]}/${parts[3]}`;
        }

        return null;

    } catch (e) {
        console.error("Vidlink conversion error:", e);
        return null;
    }
}

// Update video
function updateVideo(url, options = {}) {
    console.log("UPDATE VIDEO:", url);

    autoNextLock = false;

    const container = document.getElementById("videoContainer");
    container.innerHTML = "";

    const params = new URLSearchParams();

    // Core features
    if (options.progress != null) {
        params.set("progress", options.progress);
    }

    if (options.autoplayNextEpisode) {
        params.set("autoplayNextEpisode", "true");
    }

    if (options.nextEpisode) {
        params.set("nextEpisode", "true");
    }

    if (options.episodeSelector) {
        params.set("episodeSelector", "true");
    }

    if (options.overlay) {
        params.set("overlay", "true");
    }

    if (options.color) {
        params.set("color", options.color);
    }

    const separator = url.includes("?") ? "&" : "?";

    const iframe = document.createElement("iframe");
    iframe.id = "videoFrame";
    iframe.allowFullscreen = true;

    iframe.setAttribute(
        "allow",
        "autoplay; encrypted-media"
    );

    iframe.src =
        params.toString() ? url + separator + params.toString()
            : url;

    container.appendChild(iframe);

    addPlayerSwitchButton(url, options);
}

function addPlayerSwitchButton(currentUrl, currentOptions = {}) {

    const container =
        document.getElementById("videoContainer");

    const oldButton =
        document.getElementById("playerSwitchBtn");

    if (oldButton) {
        oldButton.remove();
    }


    // ==========================================
    // DETERMINE CURRENT PLAYER
    // ==========================================

    const isVidlink =
        currentUrl.includes("vidlink.pro");


    const button =
        document.createElement("button");

    button.id =
        "playerSwitchBtn";

    button.className =
        "playerSwitchBtn";


    // ==========================================
    // BUTTON TEXT
    // ==========================================

    if (isVidlink) {
        button.innerHTML =
            '<i class="fa-solid fa-bolt"></i> Switch Player';
    } else {
        button.innerHTML =
            '<i class="fa-solid fa-bolt"></i> Switch Player';
    }


    // ==========================================
    // SWITCH
    // ==========================================

    button.onclick = () => {

        let targetUrl;


        // ======================================
        // GET CURRENT SAVED PROGRESS
        // ======================================

        const saved =
            currentEpisodeKey ? getProgress(currentEpisodeKey)
                : null;

        const watched =
            saved?.watched ?? 0;


        console.log(
            "SWITCH PLAYER:",
            isVidlink ? "Vidlink → Videasy"
                : "Videasy → Vidlink"
        );

        console.log(
            "CURRENT PROGRESS:",
            watched
        );


        // ======================================
        // VIDEASY → VIDLINK
        // ======================================

        if (!isVidlink) {

            targetUrl =
                convertToVidlink(currentUrl);

            if (!targetUrl) {

                console.warn(
                    "No Vidlink URL available."
                );

                return;
            }


            // ======================================
            // VIDLINK THEME
            // ======================================

            const vidlinkParams = new URLSearchParams({
                primaryColor: "bbf523",
                secondaryColor: "bbf523",
                iconColor: "#e5e7eb"
            });

            targetUrl +=
                (targetUrl.includes("?") ? "&" : "?") +
                vidlinkParams.toString();


            // ======================================
            // RESUME AT SAVED POSITION
            // ======================================

            if (watched > 0) {

                targetUrl +=
                    `&startAt=${Math.floor(watched)}`;

                console.log(
                    "Vidlink startAt:",
                    Math.floor(watched)
                );
            }
        }


        // ======================================
        // VIDLINK → VIDEASY
        // ======================================

        else {

            targetUrl =
                currentUrl.replace(
                    "https://vidlink.pro",
                    "https://player.videasy.net"
                );


            console.log(
                "Switching back to Videasy"
            );


            // IMPORTANT:
            // Pass saved progress to Videasy

            if (watched > 0) {

                currentOptions = {
                    ...currentOptions,
                    progress: watched
                };

                console.log(
                    "Videasy progress:",
                    watched
                );
            }
        }


        // ======================================
        // LOAD NEW PLAYER
        // ======================================

        updateVideo(
            targetUrl,
            {
                ...currentOptions
            }
        );
    };


    container.appendChild(button);

    // ================================
    // PLAYER SWITCH AUTO-HIDE
    // ================================
    button.classList.add("playerSwitchHidden");

    let hideTimer = null;

    function showPlayerSwitch() {
        button.classList.remove("playerSwitchHidden");

        clearTimeout(hideTimer);

        hideTimer = setTimeout(() => {
            button.classList.add("playerSwitchHidden");
        }, 2500);
    }

    function hidePlayerSwitch() {
        clearTimeout(hideTimer);
        button.classList.add("playerSwitchHidden");
    }

    // PC: mouse enters player
    container.addEventListener("mouseenter", showPlayerSwitch);

    // PC: mouse moves inside player
    container.addEventListener("mousemove", showPlayerSwitch);

    // PC: click inside player
    container.addEventListener("click", showPlayerSwitch);

    // Mobile: tap
    container.addEventListener("touchstart", showPlayerSwitch, {
        passive: true
    });

    // Mouse leaves player
    container.addEventListener("mouseleave", hidePlayerSwitch);
}

setTimeout(() => {
    manualEpisodeChange = false;
}, 1500);

function setActiveEpisode(season, episode) {
    document
        .querySelectorAll(".episodeItem")
        .forEach(el => el.classList.remove("active"));

    const target = document.querySelector(
        `[data-season="${season}"][data-ep="${episode}"]`
    );

    if (target) {
        target.classList.add("active");
        target.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }
    console.log(
        "HIGHLIGHT:",
        `S${season}E${episode}`
    );
}


function centerSeasonPill(pill) {

    if (!pill) {
        return;
    }
    const row = pill.parentElement;

    // Kung kasya lahat ng season, huwag nang gumalaw
    if (row.scrollWidth <= row.clientWidth) {
        return;
    }
    pill.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest"
    });
}


function playNextEpisode(season, episode) {
    
    // Next episode sa current season
    let next = document.querySelector(
        `[data-season="${season}"][data-ep="${episode + 1}"]`
    );
    if (next) {
        console.log("NEXT EP:", season, episode + 1);
        next.click();
        return;
    }
    
    // Next season
    const nextSeason = [...document.querySelectorAll(".seasonPill")]
        .find(btn => btn.textContent === `Season ${season + 1}`);

    if (!nextSeason) {
        console.log("SERIES FINISHED");
        return;
    }

    console.log("NEXT SEASON:", season + 1);
    nextSeason.click();
    
    setTimeout(() => {
    const firstEpisode = document.querySelector(
        `.episodeItem[data-season="${season + 1}"]`
    );
        
    console.log("FIRST EP:", firstEpisode);
    if (firstEpisode) {
        firstEpisode.click();
    }
    }, 500);
}

window.addEventListener("message", (event) => {

    console.log(
        "MESSAGE FROM:",
        event.origin,
        event.data
    );

    if (event.origin !== "https://vidlink.pro") {
        return;
    }

    const message = event.data;

    if (!message) {
        return;
    }

    console.log(
        "VIDLINK MESSAGE:",
        message
    );

    if (message.type === "PLAYER_EVENT") {

        const data = message.data;

        if (!data) {
            return;
        }

        const {
            event: eventType,
            currentTime,
            duration,
            mediaType,
            season,
            episode
        } = data;


        console.log(
            "VIDLINK PLAYER EVENT:",
            eventType,
            currentTime,
            duration,
            mediaType,
            season,
            episode
        );


        // ======================================
        // NO CURRENT ITEM
        // ======================================

        if (!currentItem) {
            console.warn(
                "VidLink event received but no currentItem."
            );
            return;
        }


        // ======================================
        // MOVIE
        // ======================================

        if (mediaType === "movie") {

            const contentId =
                `${currentItem.id}-1-1`;

            saveProgress(
                contentId,
                currentTime,
                duration || 0
            );

            return;
        }


        // ======================================
        // TV
        // ======================================

        if (mediaType === "tv") {

            const s =
                Number(season) || 1;

            const e =
                Number(episode) || 1;

            const contentId =
                `${currentItem.id}-${s}-${e}`;


            // Remember last watched episode
            localStorage.setItem(
                `tv_${currentItem.id}_last`,
                JSON.stringify({
                    season: s,
                    episode: e
                })
            );


            saveProgress(
                contentId,
                currentTime,
                duration || 0
            );
        }
    }
});

function saveProgress(contentId, watched, duration = 0) {
    if (duration > 0 && watched >= duration * 0.95) {
        //console.log("AUTO REMOVE:", contentId);
        localStorage.removeItem("progress_" + contentId);
        loadContinueWatching();
        return;
    }
    const progress = {
        watched,
        duration,
        type: currentItem?.type || "tv",
        lastUpdated: Date.now()
    };
    
    //console.log("SAVING:", contentId, progress);
    
    localStorage.setItem(
        "progress_" + contentId,
        JSON.stringify(progress)
    );
}

function getProgress(contentId) {
    const saved = localStorage.getItem("progress_" + contentId);
    return saved ? JSON.parse(saved) : null;
}

let lastEpisodeKey = "";
let lastProgressSave = {};

window.addEventListener("message", (event) => {
    if (
        event.origin !== "https://player.videasy.net" &&
        event.origin !== "https://player.videasy.to"
    ) {
        return;
    }

    let message;

    try {
        message =
            typeof event.data === "string" ?
                JSON.parse(event.data)
                : event.data;
    } catch {
        return;
    }

    //console.log("VIDEOASY MESSAGE:", message);
    if (message.type !== "PLAYER_EVENT") return;
    const data = message.data;
    //console.log("PLAYER DATA:", data);
    
      // Save watch progress
    if (data.event === "timeupdate" && currentEpisodeKey) {
    const watched =
        data.timestamp ??
        data.currentTime ??
        0;
    const eventKey =
        `${currentItem.id}-${data.season}-${data.episode}`;
        
    const lastSaved = lastProgressSave[eventKey] ?? 0;

    if (
        watched - lastSaved >= 5 ||
        watched >= data.duration * 0.95
    ) {
        lastProgressSave[eventKey] = watched;

        saveProgress(
            eventKey,
            watched,
            data.duration
        );
    }

        const autoKey =
            `${data.season}-${data.episode}`;
        if (
            data.progress >= 99 &&
            lastAutoNextKey !== autoKey
        ) {
            lastAutoNextKey = autoKey;

            //console.log("AUTO NEXT");

            playNextEpisode(
                Number(data.season),
                Number(data.episode)
            );
        }
    }
    const season =
        data.season ??
        data.season_number ??
        data.s;
    const episode =
        data.episode ??
        data.episode_number ??
        data.e;
    if (
        currentItem?.type === "tv" &&
        season != null &&
        episode != null
    ) {
        localStorage.setItem(
            `tv_${currentItem.id}_last`,
            JSON.stringify({
                season,
                episode
            })
        );
    }
    if (season == null || episode == null) {
        return;
    }
    
    const key = `S${season}E${episode}`;
    if (key === lastEpisodeKey) return;
    lastEpisodeKey = key;
    //console.log("ACTIVE EPISODE:", key);
    setActiveEpisode(season, episode);

    if (currentItem?.type === "tv") {
        currentEpisodeKey =
            `${currentItem.id}-${season}-${episode}`;
    }
});

async function renderTVControls(tvId) {
    initialSeasonLoad = true;

    const box = document.getElementById("episodeControls");
    box.style.display = "block";
    box.innerHTML = "Loading...";

    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tvId}?api_key=${TMDB_API_KEY}`
    );
    if (!res.ok) {
      throw new Error(`TMDB Error: ${res.status}`);
    }

    const data = await res.json();
    box.innerHTML = "";

    const savedShow = JSON.parse(
        localStorage.getItem(`tv_${tvId}_last`) || "null"
    );
    
    const seasonRow = document.createElement("div");
    seasonRow.className = "seasonRow";
    const seasonRowWrapper = document.createElement("div");
    seasonRowWrapper.className = "seasonRowWrapper";
    seasonRowWrapper.appendChild(seasonRow);
    const grid = document.createElement("div");
    grid.className = "episodeGrid";
    
    data.seasons.forEach(season => {
        if (season.season_number === 0) return;
        const pill = document.createElement("button");
        pill.className = "seasonPill";
        pill.textContent = `Season ${season.season_number}`;
        pill.onclick = () => {

            document
                .querySelectorAll(".seasonPill")
                .forEach((p) => {
                    p.classList.remove("active");
                });

            pill.classList.add("active");

            centerSeasonPill(pill);

            loadEpisodes(season.season_number);

        };
        seasonRow.appendChild(pill);
    });

    box.appendChild(seasonRowWrapper);
    box.appendChild(grid);

// Load Episodes
async function loadEpisodes(sNum) {
    grid.innerHTML = "Loading episodes...";

    const res = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/season/${sNum}?api_key=${TMDB_API_KEY}`
    );

    if (!res.ok) {
        throw new Error(`Season Load Error: ${res.status}`);
    }

    const sData = await res.json();
    grid.innerHTML = "";

    sData.episodes.forEach(ep => {
        const card = document.createElement("div");
        card.className = "episodeItem";
        card.dataset.ep = ep.episode_number;
        card.dataset.season = sNum;

        card.innerHTML = `
            <img
                loading="lazy"
                src="${
                    ep.still_path
                        ? "https://image.tmdb.org/t/p/w500" + ep.still_path
                        : "https://via.placeholder.com/500x281"
                }"
                alt="${ep.name}">

            <div class="epMeta">
                <div>${ep.episode_number}. ${ep.name}</div>
                <p>${
                    ep.overview
                        ? ep.overview.substring(0, 60) + "..."
                        : "No description"
                }</p>
            </div>
        `;

        // Play Episode
        card.onclick = () => {
            lastAutoNextKey = "";
            manualEpisodeChange = true;

            currentEpisodeKey =
                `${tvId}-${sNum}-${ep.episode_number}`;

            setActiveEpisode(
                sNum,
                ep.episode_number
            );

            const saved =
                getProgress(currentEpisodeKey);

            console.log(
                "LOADED:",
                currentEpisodeKey,
                saved
            );

            const savedProgress =
                saved?.watched ?? 0;

            updateVideo(
                `https://player.videasy.net/tv/${tvId}/${sNum}/${ep.episode_number}`,
                {
                    autoplayNextEpisode: true,
                    overlay: true,
                    color: "#bbf523",
                    progress: savedProgress
                }
            );
        };

        grid.appendChild(card);
    });

    // Auto Select Last Watched
    let selectedEpisode = sData.episodes[0];

    if (
        initialSeasonLoad &&
        savedShow &&
        savedShow.season === sNum
    ) {
        const found = sData.episodes.find(
            ep => ep.episode_number === savedShow.episode
        );

        if (found) {
            selectedEpisode = found;
        }
    }

    initialSeasonLoad = false;

    currentEpisodeKey =
        `${tvId}-${sNum}-${selectedEpisode.episode_number}`;

    const saved =
        getProgress(currentEpisodeKey);

    const savedProgress =
        saved?.watched ?? 0;

    setActiveEpisode(
        sNum,
        selectedEpisode.episode_number
    );

    // Play Selected Episode
    updateVideo(
        `https://player.videasy.net/tv/${tvId}/${sNum}/${selectedEpisode.episode_number}`,
        {
            autoplayNextEpisode: true,
            overlay: true,
            color: "#bbf523",
            progress: savedProgress
        }
    );
}
    
    // Automatically click first season pill
    if (savedShow) {
        
      const btn = [...seasonRow.children].find(b =>
          b.textContent === `Season ${savedShow.season}`
      );
        
          if (btn) {
              btn.click();
          } else {
              seasonRow.firstChild.click();
          }
      } else {
          
      seasonRow.firstChild.click();
  }
}

function scrollToCategory(id){ document.getElementById(id).scrollIntoView({ behavior:"smooth", block:"start" }); }

function goHome(){ searchInput.value=""; document.getElementById("stats").innerHTML=""; window.scrollTo({ top:0, behavior:"smooth" }); loadHome(); loadContinueWatching(); moveContinueWatching(true);}

// CAROUSEL SYSTEM
function setupRowScrolling() {
    const preloadRatio = 0.75;
    const rows = document.querySelectorAll(".row");

    // LOADERS
    function getCarouselLoader(rowId) {
        if (currentContentMode === "search") {
            if (rowId === "movieResults") {
                return loadMoreSearchMovies;
            }

            if (rowId === "tvResults") {
                return loadMoreSearchTV;
            }

            if (rowId === "animeResults") {
                return loadMoreSearchAnime;
            }
        }

        if (rowId === "movieResults") {
            return loadMoreMovies;
        }

        if (rowId === "tvResults") {
            return loadMoreTV;
        }

        if (rowId === "animeResults") {
            return loadMoreAnime;
        }

        return null;
    }

    // HELPERS
    function rubber(value, min, max, strength = 0.35) {
        if (value < min) return min + (value - min) * strength;
        if (value > max) return max + (value - max) * strength;
        return value;
    }

    function getMaxScroll(row) {
        return Math.max(0, row.scrollWidth - row.clientWidth);
    }

    // DYNAMIC PAGE SIZE
    function getPageScroll(row) {
        const firstCard =
            row.querySelector(".movie, .skeletonCard");

        if (!firstCard) {
            return row.clientWidth;
        }

        const cardWidth =
            firstCard.getBoundingClientRect().width;

        const styles = getComputedStyle(row);
        const gap =
            parseFloat(styles.columnGap || styles.gap) || 0;

        const visibleCards = Math.max(
            1,
            Math.floor(
                (row.clientWidth + gap) /
                (cardWidth + gap)
            )
        );

        return visibleCards * (cardWidth + gap);
    }

    // ARROW STATE
    function updateArrowState(row) {
        if (!row) return;

        const leftBtn = document.querySelector(
            `.arrow.left[data-target="${row.id}"]`
        );

        const rightBtn = document.querySelector(
            `.arrow.right[data-target="${row.id}"]`
        );

        if (!leftBtn || !rightBtn) return;

        const max = getMaxScroll(row);
        const atStart = row.scrollLeft <= 5;
        const atEnd = row.scrollLeft >= max - 5;

        leftBtn.style.display = atStart ? "none" : "";
        rightBtn.style.display = atEnd ? "none" : "";

        leftBtn.innerHTML =
            `<i class="fa-solid fa-chevron-left"></i>`;

        rightBtn.innerHTML =
            `<i class="fa-solid fa-chevron-right"></i>`;

        leftBtn.classList.remove(
            "startMode",
            "seeMoreMode"
        );

        rightBtn.classList.remove(
            "startMode",
            "seeMoreMode"
        );
    }

    // AUTO PRELOAD
    async function preloadIfNeeded(row) {
        if (
            !row ||
            row.dataset.loading === "true"
        ) {
            return;
        }

        const loader = getCarouselLoader(row.id);
        if (!loader) return;

        const max = getMaxScroll(row);
        if (max <= 0) return;

        const progress =
            row.scrollLeft / max;

        if (progress < preloadRatio) return;

        row.dataset.loading = "true";

        try {
            await loader();
        } catch (error) {
            console.error(
                `CAROUSEL LOAD ERROR: ${row.id}`,
                error
            );
        } finally {
            row.dataset.loading = "false";
            updateArrowState(row);
        }
    }

    // EDGE BOUNCE
    function bounceIfNeeded(row) {
        const max = getMaxScroll(row);

        if (
            row.scrollLeft <= 0 ||
            row.scrollLeft >= max
        ) {
            row.classList.remove("bounce");
            void row.offsetWidth;
            row.classList.add("bounce");
        }
    }

    // SETUP ROWS
    rows.forEach(row => {
        row._isMouseDown = false;
        row._isTouchDown = false;
        row._dragged = false;
        row._gestureDirection = null;

        // DESKTOP DRAG
        row.addEventListener("mousedown", e => {
            row._isMouseDown = true;
            row._dragged = false;

            row._startX = e.pageX;
            row._scrollStart = row.scrollLeft;

            row.style.cursor = "grabbing";
        });

        row.addEventListener("mousemove", e => {
            if (!row._isMouseDown) return;

            e.preventDefault();

            const walk =
                e.pageX - row._startX;

            if (Math.abs(walk) > 5) {
                row._dragged = true;
            }

            const raw =
                row._scrollStart - walk;

            const max =
                getMaxScroll(row);

            row.scrollLeft =
                rubber(raw, 0, max);
        });

        window.addEventListener("mouseup", () => {
            if (!row._isMouseDown) return;

            row._isMouseDown = false;
            row.style.cursor = "grab";

            if (!row._dragged) return;

            bounceIfNeeded(row);
        });

        // MOBILE TOUCH START
        row.addEventListener(
            "touchstart",
            e => {
                if (!e.touches.length) return;

                row._isTouchDown = true;
                row._dragged = false;
                row._gestureDirection = null;

                row._startX =
                    e.touches[0].pageX;

                row._startY =
                    e.touches[0].pageY;

                row._scrollStart =
                    row.scrollLeft;
            },
            { passive: true }
        );

        // TOUCH
        row.addEventListener("touchstart", e => {
            if (!e.touches.length) return;

            row._isTouchDown = true;
            row._dragged = false;
            row._touchLocked = false;
            row._touchDirection = null;

            row._startX = e.touches[0].clientX;
            row._startY = e.touches[0].clientY;
            row._scrollStart = row.scrollLeft;
            row._lastX = row._startX;
            row._lastTime = performance.now();
            row._velocity = 0;
        }, { passive: true });

        row.addEventListener("touchmove", e => {
            if (!row._isTouchDown || !e.touches.length) return;

            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;

            const dx = x - row._startX;
            const dy = y - row._startY;

            // DIRECTION LOCK
            if (!row._touchDirection) {
                const distance = Math.hypot(dx, dy);

                if (distance < 8) return;

                row._touchDirection =
                    Math.abs(dx) > Math.abs(dy) ? "horizontal"
                        : "vertical";
            }

            // VERTICAL = PAGE SCROLL
            if (row._touchDirection === "vertical") {
                return;
            }

            // HORIZONTAL = CAROUSEL
            e.preventDefault();

            if (Math.abs(dx) > 5) {
                row._dragged = true;
            }

            // VELOCITY
            const now = performance.now();
            const dt = Math.max(1, now - row._lastTime);

            const moveX = x - row._lastX;

            row._velocity =
                moveX / dt;

            row._lastX = x;
            row._lastTime = now;

            // DIRECT DRAG
            const max = getMaxScroll(row);

            const raw =
                row._scrollStart - dx;

            row.scrollLeft =
                rubber(
                    raw,
                    0,
                    max,
                    0.45
                );
        }, { passive: false });

        row.addEventListener("touchend", () => {
            if (!row._isTouchDown) return;

            row._isTouchDown = false;

            if (
                row._touchDirection === "horizontal" &&
                row._dragged
            ) {
                const max = getMaxScroll(row);

                // MOMENTUM
                const velocity = row._velocity || 0;

                const momentum =
                    velocity * 280;

                const target =
                    Math.max(
                        0,
                        Math.min(
                            row.scrollLeft - momentum,
                            max
                        )
                    );

                row.scrollTo({
                    left: target,
                    behavior: "smooth"
                });
            }

            row._touchDirection = null;
            row._velocity = 0;
        }, { passive: true });

        row.addEventListener("touchcancel", () => {
            row._isTouchDown = false;
            row._touchDirection = null;
            row._touchLocked = false;
        }, { passive: true });

        // SCROLL
        row.addEventListener("scroll", () => {
            updateArrowState(row);
            preloadIfNeeded(row);
        });

        // INITIAL ARROW STATE
        requestAnimationFrame(() => {
            updateArrowState(row);
        });
    });

    // ARROWS
    document.querySelectorAll(".arrow").forEach(btn => {
        btn.addEventListener("click", async () => {
            const target =
                document.getElementById(
                    btn.dataset.target
                );

            if (!target) return;

            const max =
                getMaxScroll(target);

            const pageScroll =
                getPageScroll(target);

            // LEFT
            if (
                btn.classList.contains("left")
            ) {
                target.scrollBy({
                    left: -pageScroll,
                    behavior: "smooth"
                });

                return;
            }

            // RIGHT AT END
            if (
                target.scrollLeft >= max - 5
            ) {
                await preloadIfNeeded(target);

                setTimeout(() => {
                    const newMax =
                        getMaxScroll(target);

                    target.scrollTo({
                        left: Math.min(
                            target.scrollLeft +
                                pageScroll,
                            newMax
                        ),
                        behavior: "smooth"
                    });

                    updateArrowState(target);
                }, 100);

                return;
            }

            // NORMAL RIGHT
            target.scrollBy({
                left: pageScroll,
                behavior: "smooth"
            });

            setTimeout(() => {
                updateArrowState(target);
                preloadIfNeeded(target);
            }, 150);
        });
    });
}

setupRowScrolling();
loadHome();
loadContinueWatching();

function setDescription(text) {
  const overviewEl = document.getElementById("modalOverview");
  const isMovie = currentItem?.type === "movie";
  overviewEl.className = "description";
  overviewEl.classList.remove("hasFade");
  overviewEl.textContent = text || "No description available.";

  // remove old button if exists
  const oldBtn = document.getElementById("readMoreBtn");
  if (oldBtn) oldBtn.remove();

  // ✅ MOVIES: always show full description (NO read more)
  if (isMovie) {
    overviewEl.classList.add("expanded"); // disables line clamp
    return;
  }

  // ❌ TV / ANIME: apply Read More
  let expanded = false;
  const btn = document.createElement("button");
  btn.id = "readMoreBtn";
  btn.className = "readMoreBtn";
  btn.textContent = "Read more ⌄";

  btn.onclick = () => {
    expanded = !expanded;

    if (expanded) {
      overviewEl.classList.add("expanded");
      btn.textContent = "Read less ^";
    } else {
      overviewEl.classList.remove("expanded");
      btn.textContent = "Read more ⌄";
    }
  };
  
    if (text && text.length > 180) {
      overviewEl.classList.add("hasFade"); // enable fade only if needed
      overviewEl.after(btn);
    }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("detailModal");
    if (modal.classList.contains("show")) {
      closeModal();
    }
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => console.log("PWA Service Worker Registered"))
      .catch(err => console.log("SW failed:", err));
  });
}

async function loadContinueWatching() {
    const continueItems = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Progress lang ang kukunin
        if (!key.startsWith("progress_")) continue;
        const progress = JSON.parse(
            localStorage.getItem(key)
        );

        if (!progress || progress.watched <= 0) continue;

        continueItems.push({
            key,
            watched: progress.watched,
            duration: progress.duration ?? 0,
            type: progress.type,
            lastUpdated: progress.lastUpdated
        });
    }
    continueItems.sort((a, b) =>
        b.lastUpdated - a.lastUpdated
    );
    const uniqueItems = [];
    const seen = new Set();

    for (const item of continueItems) {
        // progress_37854-2-62
        const id = item.key.replace("progress_", "").split("-")[0];
        if (seen.has(id)) continue;
        seen.add(id);
        uniqueItems.push(item);
    }

    //console.log("UNIQUE CONTINUE WATCHING:");
    //console.table(uniqueItems);
    
    const row = document.getElementById("continueResults");

row.innerHTML = "";

if (uniqueItems.length === 0) {
    document.getElementById("continueCategory").style.display = "none";
    return;
}

document.getElementById("continueCategory").style.display = "block";
for (const item of uniqueItems) {

    const parts = item.key.replace("progress_", "").split("-");
    //console.log("ITEM TYPE:", item.type);

    const id = parts[0];
    const season = parts[1] || 1;
    const episode = parts[2] || 1;

    try {

        const endpoint = item.type === "movie" ? "movie" : "tv";
        //console.log("ENDPOINT:", endpoint);
        //console.log("FETCHING:", `https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}`);

        const res = await fetch(
            `https://api.themoviedb.org/3/${endpoint}/${id}?api_key=${TMDB_API_KEY}`
        );

        const show = await res.json();

        const title =
            item.type === "movie" ?
              show.title
                : show.name;

        const subtitle =
            item.type === "movie" ?
              "Movie"
                : `Season ${season} • Episode ${episode}`;
        
        const percent =
            item.duration > 0 ?
                Math.min(
                      100,
                      (item.watched / item.duration) * 100
                  )
                : 0;

        const card = document.createElement("div");
        card.className = "movie continueCard";

        card.innerHTML = `
            <img
                loading="lazy"
                src="${
                    show.poster_path ? 
                        "https://image.tmdb.org/t/p/w500" + show.poster_path
                        : "https://via.placeholder.com/300x450"
                }"
                alt="${title}">

            <div class="movieInfo">
                <strong>${title}</strong>

                <div class="genre">
                    ${subtitle}
                </div>
            </div>

            <div class="progressBar">
                <div
                    class="progressFill"
                    style="width:${percent}%">
                </div>
            </div>
        `;

        const removeBtn = document.createElement("button");
        removeBtn.className = "removeBtn";
        removeBtn.textContent = "Remove";

        card.appendChild(removeBtn);

        removeBtn.onclick = (e) => {

            e.stopPropagation();

            localStorage.removeItem(item.key);

            card.classList.add("removing");

            setTimeout(() => {

                card.remove();

                if (!row.children.length) {
                    document.getElementById("continueCategory").style.display = "none";
                }

            }, 250);

        };
        
        
        
        let holdTimer;

        // Desktop (Right Click)
        card.addEventListener("contextmenu", (e) => {
            e.preventDefault();

            document
                .querySelectorAll(".continueCard.showMenu")
                .forEach(c => c.classList.remove("showMenu"));

            card.classList.add("showMenu");
        });

        // Mobile (Long Press)
        card.addEventListener("touchstart", () => {

            holdTimer = setTimeout(() => {

                document
                    .querySelectorAll(".continueCard.showMenu")
                    .forEach(c => c.classList.remove("showMenu"));

                card.classList.add("showMenu");

            }, 600);

        }, { passive: true });

        card.addEventListener("touchend", () => {
            clearTimeout(holdTimer);
        });

        card.addEventListener("touchcancel", () => {
            clearTimeout(holdTimer);
        });

        card.onclick = () => {
            if (card.classList.contains("showMenu"))
                return;

            if (item.type === "movie") {
                currentItem = {
                    id: Number(id),
                    type: "movie",
                    title: show.title,
                    poster: show.poster_path ?
                        "https://image.tmdb.org/t/p/w500" + show.poster_path
                        : "",
                    backdrop: show.backdrop_path ?
                        "https://image.tmdb.org/t/p/original" + show.backdrop_path
                        : "",
                    overview: show.overview,
                    videasyUrl: `https://player.videasy.net/movie/${id}`
                };

            } else {

                localStorage.setItem(
                    `tv_${id}_last`,
                    JSON.stringify({
                        season: Number(season),
                        episode: Number(episode)
                    })
                );

                currentItem = {
                    id: Number(id),
                    type: "tv",
                    title: show.name,
                    poster: show.poster_path ?
                        "https://image.tmdb.org/t/p/w500" + show.poster_path
                        : "",
                    backdrop: show.backdrop_path ?
                        "https://image.tmdb.org/t/p/original" + show.backdrop_path
                        : "",
                    overview: show.overview
                };
            }
            openModal(currentItem);
        };

        row.appendChild(card);

    } catch (err) {
        console.error(err);
    }

}
}

document.addEventListener("click", (e) => {

    if (e.target.closest(".cwOverlay")) return;

    document
        .querySelectorAll(".continueCard.showMenu")
        .forEach(c => c.classList.remove("showMenu"));

});


function moveContinueWatching(homeMode = true) {

    const continueSection =
        document.getElementById("continueCategory");

    if (homeMode) {

        continueSection.classList.add("homeFirst");
        continueSection.classList.remove("searchLast");

    } else {

        continueSection.classList.remove("homeFirst");
        continueSection.classList.add("searchLast");

    }
}

function appendMovieCards() {

    const row =
        document.getElementById("movieResults");

    const data =
        movieData.slice(
            movieVisibleCount - 10,
            movieVisibleCount
        );

    data.forEach(item => {

        const div =
            document.createElement("div");

        div.className = "movie";

        div.innerHTML = `
            <img
                loading="lazy"
                src="${
                    item.poster ||
                    "https://via.placeholder.com/300x450?text=No+Image"
                }"
                alt="${item.title}">

            <div class="movieInfo">

                <strong>${item.title}</strong>

                <div class="genre">
                    ${
                        item.type === "movie" ? "Movie"
                            : "TV Series"
                    }
                </div>

            </div>
        `;

        div.onclick = () => {
            openModal(item);
        };

        row.appendChild(div);

    });

    console.log(
        "MOVIES VISIBLE:",
        Math.min(movieVisibleCount, movieData.length),
        "/",
        movieData.length
    );
}
