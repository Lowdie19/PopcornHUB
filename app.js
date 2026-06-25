
let currentEpisodeKey = null;
let currentItem = null;
const TMDB_API_KEY = "7124d4e6e0feb015f07fc9a57bc27227";

const loading = document.getElementById("loading");

// Loading / Copy Modal
function showLoading(){ loading.style.display="flex"; }
function hideLoading(){ loading.style.display="none"; }

// ======================
// Debounced search
// ======================
let timeout;
const searchInput = document.getElementById("searchInput");
searchInput.addEventListener("keydown", e => { if(e.key==="Enter") searchAll(); });
searchInput.addEventListener("input", () => { clearTimeout(timeout); timeout = setTimeout(searchAll, 600); });

// ======================
// Category Titles Helper
// ======================
function setCategoryTitles(isHome){
  document.querySelector("#movieCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-film"></i> ${isHome ? "Popular Movies" : "Movies"}`;
  document.querySelector("#tvCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-clapperboard"></i> ${isHome ? "Popular TV Shows" : "TV Shows"}`;
  document.querySelector("#animeCategory h2").innerHTML =
    `<i style="color: darkgray" class="fa-solid fa-tv"></i> ${isHome ? "Popular Anime" : "Anime"}`;
}

// ======================
// Load top content (Home)
// ======================
async function loadHome(){
  setCategoryTitles(true); // Home: Popular titles
  showLoading();
  try{
    const [m,t,a] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
      fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
      fetch("https://graphql.anilist.co",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          query:`query { Page(perPage:10){ media(type:ANIME, sort:POPULARITY_DESC){ id title{romaji} coverImage{large} } } }`
        })
      })
    ]);

    if (!m.ok) throw new Error(`Movies API ${m.status}`);
    if (!t.ok) throw new Error(`TV API ${t.status}`);
    if (!a.ok) throw new Error(`AniList API ${a.status}`);

    const md = await m.json();
    const td = await t.json();
    const ad = await a.json();

    const movies = (md.results||[]).map(i=>({
      type:"movie", id:i.id, title:i.title,
      poster:i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : "",
      videasyUrl:`https://player.videasy.net/movie/${i.id}`
    }));

    const tv = (td.results||[]).map(i=>({
      type:"tv", id:i.id, title:i.name,
      poster:i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : "",
      videasyUrl:`https://player.videasy.net/tv/${i.id}/1/1`
    }));

    const anime = (ad?.data?.Page?.media||[]).map(i=>({
      type:"anime", id:i.id, title:i.title.romaji,
      poster:i.coverImage.large,
      videasyUrl:`https://player.videasy.net/anime/${i.id}`
    }));

    render("movieCategory","movieResults",movies);
    render("tvCategory","tvResults",tv);
    render("animeCategory","animeResults",anime);

  }catch(e){ console.error(e); }
  hideLoading();
}

// ======================
// Search
// ======================
async function searchAll(){
  const query = searchInput.value.trim();
  if(!query){ 
    document.getElementById("stats").innerHTML = ""; 
    loadHome(); 
    return; 
  }

  setCategoryTitles(false); // Search results: remove "Popular"

  showLoading();
  try{
    const [m,t,a] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`),
      fetch("https://graphql.anilist.co",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          query:`query ($search:String){ Page(perPage:10){ media(search:$search,type:ANIME){ id title{romaji} coverImage{large} } } }`,
          variables:{search:query}
        })
      })
    ]);

    if (!m.ok) throw new Error(`Movies API ${m.status}`);
    if (!t.ok) throw new Error(`TV API ${t.status}`);
    if (!a.ok) throw new Error(`AniList API ${a.status}`);

    const md = await m.json();
    const td = await t.json();
const ad = await a.json();

    const movies = (md.results||[]).map(i=>({
      type:"movie", id:i.id, title:i.title,
      poster:i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : "",
      videasyUrl:`https://player.videasy.net/movie/${i.id}`
    }));
    const tv = (td.results||[]).map(i=>({
      type:"tv", id:i.id, title:i.name,
      poster:i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : "",
      videasyUrl:`https://player.videasy.net/tv/${i.id}/1/1`
    }));
    const anime = (ad?.data?.Page?.media||[]).map(i=>({
      type:"anime", id:i.id, title:i.title.romaji,
      poster:i.coverImage.large,
      videasyUrl:`https://player.videasy.net/anime/${i.id}`
    }));

    document.getElementById("stats").innerHTML =
      `<span class="statLink" onclick="scrollToCategory('movieCategory')"><i class="fa-solid fa-film"></i> ${movies.length} Movies</span>
       &nbsp;|&nbsp;
       <span class="statLink" onclick="scrollToCategory('tvCategory')"><i class="fa-solid fa-clapperboard"></i> ${tv.length} TV Shows</span>
       &nbsp;|&nbsp;
       <span class="statLink" onclick="scrollToCategory('animeCategory')"><i class="fa-solid fa-tv"></i> ${anime.length} Anime</span>`;

    render("movieCategory","movieResults",movies);
    render("tvCategory","tvResults",tv);
    render("animeCategory","animeResults",anime);

  }catch(e){ console.error(e); }
  hideLoading();
}

// Render
function render(catId,rowId,data){
  const cat = document.getElementById(catId);
  const row = document.getElementById(rowId);
  row.innerHTML = "";
  if(!data.length){ cat.style.display="none"; return; }
  cat.style.display="block";

  data.forEach(item=>{
    const div = document.createElement("div");
    div.className = "movie";
    div.innerHTML = `
      <img
        loading="lazy"
        src="${item.poster || 'https://via.placeholder.com/300x450?text=No+Image'}"
        alt="${item.title}">

      <div class="movieInfo">
        <strong>${item.title}</strong>
        <div class="genre">${item.type.toUpperCase()}</div>
      </div>
    `;
    div.onclick = ()=>openModal(item);
    row.appendChild(div);
  });
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

    document.body.style.overflow = ""; // 🔥 RESTORE SCROLL
  }, 300);
}

function openModal(item){
  currentItem = item;

  document.getElementById("modalTitle").textContent = item.title;

  const container = document.getElementById("videoContainer");
  container.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.allowFullscreen = true;
  iframe.setAttribute("allow", "autoplay; encrypted-media");
  iframe.src = item.videasyUrl;

  container.appendChild(iframe);

  document.getElementById("detailModal").classList.add("show");

  document.body.style.overflow = "hidden"; // 🔥 LOCK SCROLL

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

    // ================= ANIME =================
    if(item.type === "anime"){
      box.style.display = "block";

      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query ($id: Int) {
              Media(id: $id, type: ANIME) {
                description(asHtml: false)
              }
            }
          `,
          variables: { id: item.id }
        })
      });

      if (!res.ok) {
          throw new Error(`Anime Details Error ${res.status}`);
        }
    const json = await res.json();
    const media = json?.data?.Media;

      const clean = media?.description
        ? media.description
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/?i>/g, "")
            .replace(/<\/?b>/g, "")
            .replace(/<\/?em>/g, "")
            .replace(/<[^>]*>/g, "")
            .replace(/\n\s*\n/g, "\n\n")
        : "No description available.";

      setDescription(clean);

      renderAnimeControls(item.id);
      return;
    }

    // ================= TV =================
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

// Update video
function updateVideo(url, options = {}) {
    const container = document.getElementById("videoContainer");
    container.innerHTML = "";

    const params = new URLSearchParams();

    // core features
    if (options.progress != null) params.set("progress", options.progress);
    if (options.autoplayNextEpisode) params.set("autoplayNextEpisode", "true");
    if (options.nextEpisode) params.set("nextEpisode", "true");
    if (options.episodeSelector) params.set("episodeSelector", "true");
    if (options.overlay) params.set("overlay", "true");
    if (options.color) params.set("color", options.color);

    const iframe = document.createElement("iframe");
    iframe.id = "videoFrame";

    iframe.allowFullscreen = true;
    iframe.setAttribute("allow", "autoplay; encrypted-media");

    iframe.src = url + (params.toString() ? "?" + params.toString() : "");

    container.appendChild(iframe);
}

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

function saveProgress(contentId, progress) {
    localStorage.setItem("progress_" + contentId, progress);
}

function getProgress(contentId) {
    return localStorage.getItem("progress_" + contentId);
}

let lastEpisodeKey = "";

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
            typeof event.data === "string"
                ? JSON.parse(event.data)
                : event.data;
    } catch {
        return;
    }

    console.log("VIDEOASY MESSAGE:", message);

    if (message.type !== "PLAYER_EVENT") return;

    const data = message.data;

    const season =
        data.season ??
        data.season_number ??
        data.s;

    const episode =
        data.episode ??
        data.episode_number ??
        data.e;

    if (season == null || episode == null) {
        return;
    }

    const key = `S${season}E${episode}`;

    if (key === lastEpisodeKey) return;

    lastEpisodeKey = key;

    console.log("ACTIVE EPISODE:", key);

    setActiveEpisode(season, episode);

    if (currentItem?.type === "tv") {
        currentEpisodeKey =
            `${currentItem.id}-${season}-${episode}`;
    }
});

async function renderTVControls(tvId) {
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
            document.querySelectorAll(".seasonPill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            loadEpisodes(season.season_number);
        };
        seasonRow.appendChild(pill);
    });

    box.appendChild(seasonRowWrapper);
    box.appendChild(grid);

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

        let firstCard = null;

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
                      ? 'https://image.tmdb.org/t/p/w500' + ep.still_path
                      : 'https://via.placeholder.com/500x281'
                  }"
                  alt="${ep.name}">
                <div class="epMeta">
                    <div>${ep.episode_number}. ${ep.name}</div>
                    <p>${
                      ep.overview
                        ? ep.overview.substring(0, 60) + '...'
                        : 'No description'
                    }</p>
                </div>
            `;

            if (!firstCard) firstCard = card;

        card.onclick = () => {

            currentEpisodeKey = `${tvId}-${sNum}-${ep.episode_number}`;
            setActiveEpisode(sNum, ep.episode_number);

            const savedProgress = getProgress(currentEpisodeKey) || 0;

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

        // Auto-select first episode
        if (firstCard) {
            firstCard.classList.add("active");

            const firstEp = sData.episodes[0];

            currentEpisodeKey =
              `${tvId}-${sNum}-${firstEp.episode_number}`;

            const savedProgress =
              getProgress(currentEpisodeKey) || 0;

            updateVideo(
              `https://player.videasy.net/tv/${tvId}/${sNum}/${firstEp.episode_number}`,
              {
                autoplayNextEpisode: true,
                overlay: true,
                color: "#bbf523",
                progress: savedProgress
              }
            );
        }
    }

    // Automatically click first season pill
    if (seasonRow.firstChild) seasonRow.firstChild.click();
}

function scrollToCategory(id){ document.getElementById(id).scrollIntoView({ behavior:"smooth", block:"start" }); }

function goHome(){ searchInput.value=""; document.getElementById("stats").innerHTML=""; window.scrollTo({ top:0, behavior:"smooth" }); loadHome(); }

// ================================
// HORIZONTAL SCROLL + RUBBER + EDGE BOUNCE ONLY
// ================================
function setupRowScrolling() {
  const scrollAmount = 600;
  const rows = document.querySelectorAll(".row");

  function rubber(value, min, max, strength = 0.25) {
    if (value < min) return min + (value - min) * strength;
    if (value > max) return max + (value - max) * strength;
    return value;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  rows.forEach(row => {

    row._velocity = 0;
    row._isMouseDown = false;
    row._isTouchDown = false;

    const maxScroll = () => row.scrollWidth - row.clientWidth;

    // ======================
    // EDGE BOUNCE ONLY (SAFE)
    // ======================
    const bounceIfNeeded = () => {
      const max = maxScroll();
      if (row.scrollLeft <= 0 || row.scrollLeft >= max) {
        row.classList.remove("bounce");
        void row.offsetWidth;
        row.classList.add("bounce");
      }
    };

    // ======================
    // MOUSE DOWN
    // ======================
    row.addEventListener("mousedown", e => {
      row._isMouseDown = true;
      row._dragged = false;

      row._startX = e.pageX;
      row._scrollStart = row.scrollLeft;
      row.style.cursor = "grabbing";
    });

    // ======================
    // MOUSE MOVE
    // ======================
    row.addEventListener("mousemove", e => {
      if (!row._isMouseDown) return;
      e.preventDefault();

      const walk = e.pageX - row._startX;
      if (Math.abs(walk) > 5) {
        row._dragged = true;
      }
      const raw = row._scrollStart - walk;
      const max = maxScroll();

      row.scrollLeft = rubber(raw, 0, max, 0.35);
    });

    // ======================
    // MOUSE UP (INERTIA ONLY, NO BOUNCE)
    // ======================
    window.addEventListener("mouseup", () => {
      if (!row._isMouseDown) return;

      row._isMouseDown = false;
      row.style.cursor = "grab";

      if (!row._dragged) return;

      row._isMouseDown = false;
      row.style.cursor = "grab";

      if (
          row.scrollLeft <= 0 ||
          row.scrollLeft >= maxScroll()
      ) {
          bounceIfNeeded();
      }
    });

    // ======================
    // TOUCH START
    // ======================
    row.addEventListener("touchstart", e => {
      row._isTouchDown = true;
      row._dragged = false;

      row._startX = e.touches[0].pageX;
      row._scrollStart = row.scrollLeft;
    }, { passive: true });

    // ======================
    // TOUCH MOVE
    // ======================
    row.addEventListener("touchmove", e => {
      if (!row._isTouchDown) return;

      const x = e.touches[0].pageX;
      const walk = x - row._startX;

      if (Math.abs(walk) > 5) {
        row._dragged = true;
      }

      const raw = row._scrollStart - walk;
      const max = maxScroll();

      row.scrollLeft = rubber(raw, 0, max, 0.35);
    }, { passive: false });

    // ======================
    // TOUCH END (NO BOUNCE HERE)
    // ======================
    row.addEventListener("touchend", () => {
      if (!row._dragged) {
        row._isTouchDown = false;
        return;
      }
      row._isTouchDown = false;

      if (
          row.scrollLeft <= 0 ||
          row.scrollLeft >= maxScroll()
      ) {
          bounceIfNeeded();
      }
    });
  });

  // ======================
  // ARROWS (UNCHANGED)
  // ======================
  document.querySelectorAll(".arrow").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      const amount = btn.classList.contains("left") ? -scrollAmount : scrollAmount;

      const max = target.scrollWidth - target.clientWidth;
      const next = target.scrollLeft + amount;

      if (next < 0 || next > max) {
        target.scrollLeft = clamp(next, 0, max);

        target.classList.remove("bounce");
        void target.offsetWidth;
        target.classList.add("bounce");
        return;
      }

      target.scrollBy({ left: amount, behavior: "smooth" });
    });
  });
}

setupRowScrolling();
loadHome();


async function renderAnimeControls(animeId) {
  const box = document.getElementById("episodeControls");
  box.innerHTML = "Loading episodes...";

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            episodes
            nextAiringEpisode {
              episode
            }
          }
        }
      `,
      variables: { id: animeId }
    })
  });

  const data = await res.json();
  const media = data?.data?.Media;

  let episodeCount =
    media?.episodes ||
    (media?.nextAiringEpisode?.episode
      ? media.nextAiringEpisode.episode - 1
      : 12);

  box.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "episodeGrid";

  for (let i = 1; i <= episodeCount; i++) {
    const ep = document.createElement("div");
    ep.className = "episodeItem";

    ep.dataset.season = 1;
    ep.dataset.ep = i;

    ep.textContent = "Episode " + i;

    ep.onclick = () => {
      setActiveEpisode(1, i);

      updateVideo(
        `https://player.videasy.net/anime/${animeId}/${i}`,
        {
          autoplayNextEpisode: true,
          overlay: true,
          color: "#bbf523"
        }
      );
    };

    grid.appendChild(ep);
  }

  box.appendChild(grid);

  // highlight first episode
  setTimeout(() => {
    setActiveEpisode(1, 1);
  }, 0);

  // autoplay episode 1
  updateVideo(`https://player.videasy.net/anime/${animeId}/1`);
}


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
