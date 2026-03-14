(() => {
  let allCommits = [];
  let filteredCommits = [];
  let currentIndex = -1;
  let isPlaying = false;
  let playInterval = null;
  let speed = 1000;

  const $ = (sel) => document.querySelector(sel);

  async function init() {
    const res = await fetch("/api/timeline");
    const data = await res.json();

    allCommits = data.commits;
    renderProjectInfo(data.project, data.stats);
    applyFilter();
    bindControls();
  }

  function renderProjectInfo(project, stats) {
    $("#project-info").textContent = `${project.owner}/${project.repo}`;
    $("#stats").innerHTML = `
      <span>Commits: <span class="stat-value">${stats.totalCommits}</span></span>
      <span>Frontend: <span class="stat-value">${stats.frontendCommits}</span></span>
      <span>Captured: <span class="stat-value">${stats.capturedScreenshots}</span></span>
    `;
  }

  function applyFilter() {
    const frontendOnly = $("#filter-frontend").checked;
    filteredCommits = frontendOnly
      ? allCommits.filter((c) => c.hasFrontendChanges)
      : allCommits;

    // Reverse so oldest is first (timeline reads left to right)
    filteredCommits = [...filteredCommits].reverse();

    renderTimeline();
    updateScrubber();

    if (filteredCommits.length > 0) {
      selectCommit(filteredCommits.length - 1); // Start at most recent
    }
  }

  function renderTimeline() {
    const track = $("#timeline-track");
    track.innerHTML = "";

    filteredCommits.forEach((commit, i) => {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.classList.add(commit.hasFrontendChanges ? "frontend" : "non-frontend");
      if (commit.hasScreenshot) tick.classList.add("captured");
      if (i === currentIndex) tick.classList.add("active");

      tick.innerHTML = `<div class="tooltip"><strong>${commit.shortSha}</strong> ${escapeHtml(commit.message.substring(0, 60))}</div>`;
      tick.addEventListener("click", () => selectCommit(i));
      track.appendChild(tick);
    });
  }

  function selectCommit(index) {
    if (index < 0 || index >= filteredCommits.length) return;

    currentIndex = index;
    const commit = filteredCommits[index];

    // Update active tick
    document.querySelectorAll(".tick").forEach((t, i) => {
      t.classList.toggle("active", i === index);
    });

    // Update scrubber
    $("#scrubber").value = index;

    // Update screenshot
    const img = $("#screenshot");
    const placeholder = $("#placeholder");

    if (commit.hasScreenshot && commit.screenshotUrl) {
      img.src = commit.screenshotUrl;
      img.style.display = "block";
      placeholder.style.display = "none";
    } else {
      img.style.display = "none";
      placeholder.style.display = "block";
      placeholder.innerHTML = commit.hasFrontendChanges
        ? `<p>Screenshot not yet captured for <strong>${commit.shortSha}</strong></p><p style="margin-top:8px;font-size:12px">Run <code>devviewer capture</code> to generate screenshots</p>`
        : `<p>No frontend changes in <strong>${commit.shortSha}</strong></p>`;
    }

    // Update detail panel
    const detail = $("#commit-detail");
    detail.style.display = "flex";
    $("#detail-sha").textContent = commit.sha;
    $("#detail-message").textContent = commit.message;
    $("#detail-author").textContent = `By ${commit.author}`;
    $("#detail-date").textContent = formatDate(commit.date);

    const filesDiv = $("#detail-files");
    filesDiv.innerHTML = commit.filesChanged
      .map((f) => {
        const isFe = isFrontendFile(f);
        return `<div class="file ${isFe ? "frontend" : ""}">${escapeHtml(f)}</div>`;
      })
      .join("");

    // Scroll active tick into view
    const activeTick = document.querySelector(".tick.active");
    if (activeTick) activeTick.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function bindControls() {
    $("#btn-prev").addEventListener("click", () => selectCommit(currentIndex - 1));
    $("#btn-next").addEventListener("click", () => selectCommit(currentIndex + 1));
    $("#btn-play").addEventListener("click", togglePlay);
    $("#filter-frontend").addEventListener("change", applyFilter);

    $("#scrubber").addEventListener("input", (e) => {
      selectCommit(parseInt(e.target.value));
    });

    $("#speed").addEventListener("input", (e) => {
      speed = parseInt(e.target.value);
      $("#speed-val").textContent = (speed / 1000).toFixed(1) + "s";
      if (isPlaying) {
        clearInterval(playInterval);
        playInterval = setInterval(playStep, speed);
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") selectCommit(currentIndex - 1);
      if (e.key === "ArrowRight") selectCommit(currentIndex + 1);
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
    });
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    $("#btn-play").innerHTML = isPlaying ? "&#9646;&#9646;" : "&#9654;";

    if (isPlaying) {
      if (currentIndex >= filteredCommits.length - 1) currentIndex = -1;
      playInterval = setInterval(playStep, speed);
    } else {
      clearInterval(playInterval);
    }
  }

  function playStep() {
    if (currentIndex >= filteredCommits.length - 1) {
      togglePlay();
      return;
    }
    selectCommit(currentIndex + 1);
  }

  function updateScrubber() {
    const scrubber = $("#scrubber");
    scrubber.max = Math.max(0, filteredCommits.length - 1);
    scrubber.value = currentIndex >= 0 ? currentIndex : 0;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function isFrontendFile(f) {
    return /\.(tsx?|jsx?|vue|svelte|html|css|scss|sass|less)$/.test(f)
      || /\.(png|jpg|jpeg|gif|svg|webp)$/.test(f)
      || /package\.json$/.test(f);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
