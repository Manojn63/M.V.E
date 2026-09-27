const appShell = document.querySelector(".app-shell");
const editorView = document.querySelector('[data-panel="editor"]');
const dynamicView = document.querySelector('[data-panel="dynamic"]');
const video = document.querySelector("#video-preview");
const fileInput = document.querySelector("#video-input");
const previewFrame = document.querySelector("#preview-frame");
const clipButton = document.querySelector("#video-clip");
const playhead = document.querySelector("#playhead");
let currentRole = null;
const state = { view: "editor", duration: 60, currentTime: 0, zoom: 100, playing: false, fileUrl: "", undo: [], redo: [], title: "Untitled project", audioJob: null };
const viewInfo = {
  editor: ["Editor", "Creative workspace", "Build and refine your video."],
  dashboard: ["Overview", "Your studio, at a glance", "A clear view of the work in motion."],
  generate: ["Generate video", "Start with an idea", "Draft a video brief for a connected generation service."],
  shorts: ["Shorts studio", "Make the moment vertical", "Shape long-form footage into platform-ready short edits."],
  audio: ["Audio lab", "Sound that sets the scene", "Build an original music brief and audition a local preview."],
  avatar: ["Avatar studio", "A familiar face, on camera", "Prepare an avatar-led video with your script and voice direction."],
  dna: ["Creator DNA", "Your style, made legible", "Build an editing profile from reference footage you’re authorized to use."],
  analytics: ["Analytics", "Understand what holds attention", "Track publishing performance from connected, authorized accounts."],
  settings: ["Settings", "Studio preferences", "Set the defaults for your creative workspace."],
  profile: ["Profile", "Your creator profile", "Manage your identity and workspace access."],
  admin: ["Admin", "Workspace operations", "Review project activity, storage and connected-service readiness."]
};
const navNames = Object.fromEntries(Object.entries(viewInfo).map(([key, value]) => [key, value[0]]));
const toastRegion = document.querySelector("#toast-region");

function toast(message, detail = "", type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    item.append(small);
  }
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

function setAssistant(message, mode = "ready") {
  document.querySelector("#assistant-message").textContent = message;
  appShell.dataset.state = mode;
  const status = document.querySelector(".assistant-head small");
  if (status) status.innerHTML = `<i></i> ${mode === "ready" ? "Ready when you are" : mode[0].toUpperCase() + mode.slice(1)}`;
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(Math.max(seconds, 0));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function syncTime() {
  const current = video.src ? video.currentTime : state.currentTime;
  const duration = video.src && Number.isFinite(video.duration) ? video.duration : state.duration;
  state.currentTime = current;
  state.duration = duration || 60;
  const stamp = formatTime(current);
  document.querySelector("#transport-time").textContent = stamp;
  document.querySelector("#preview-time").textContent = `${stamp}:00`;
  document.querySelector("#duration-time").textContent = formatTime(state.duration);
  const lane = document.querySelector(".track-lane");
  const labelWidth = 122;
  const progressWidth = Math.max(0, lane.clientWidth) * Math.min(current / state.duration, 1);
  playhead.style.left = `${labelWidth + progressWidth}px`;
  clipButton.style.width = `${Math.max(32, Math.min(progressWidth || 80, lane.clientWidth))}px`;
}

function saveHistory() {
  state.undo.push({ title: state.title, currentTime: state.currentTime, zoom: state.zoom, duration: state.duration });
  if (state.undo.length > 40) state.undo.shift();
  state.redo = [];
  syncHistoryButtons();
  document.querySelector("#save-label").textContent = "Saving changes…";
  window.setTimeout(() => { document.querySelector("#save-label").textContent = "All changes saved"; }, 500);
}

function syncHistoryButtons() {
  document.querySelector("#undo-button").disabled = state.undo.length === 0;
  document.querySelector("#redo-button").disabled = state.redo.length === 0;
}

function togglePlayback() {
  if (!video.src) {
    toast("Preview is ready", "Import a video clip to start playback.");
    return;
  }
  if (video.paused) video.play().catch(() => toast("Playback needs a user gesture", "Press play once more to continue."));
  else video.pause();
}

function loadFile(file) {
  if (!file || !file.type.startsWith("video/")) {
    toast("Choose a video file", "Supported formats depend on your browser.", "error");
    return;
  }
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.fileUrl = URL.createObjectURL(file);
  video.src = state.fileUrl;
  video.load();
  video.hidden = false;
  document.querySelector("#preview-placeholder").hidden = true;
  clipButton.classList.add("has-media");
  document.querySelector("#clip-label").textContent = file.name;
  document.querySelector(".asset-heading span").textContent = "1 asset";
  document.querySelector(".media-empty").innerHTML = `<span class="asset-thumb">▶</span><b>${escapeHtml(file.name)}</b><small>${(file.size / 1024 / 1024).toFixed(1)} MB · Local preview</small>`;
  document.querySelector(".workflow-step").classList.add("done");
  setAssistant("Clip loaded. I can help analyze the pacing and shape a first cut.");
  toast("Clip added to your project", "Preview stays on this device until you connect storage.");
  saveHistory();
  syncTime();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function projectAction(action) {
  if (action === "rename") {
    const title = window.prompt("Project name", state.title);
    if (title?.trim()) {
      saveHistory();
      state.title = title.trim();
      document.querySelector(".project-heading h1").childNodes[0].textContent = state.title + " ";
      toast("Project renamed", state.title);
    }
  } else if (action === "undo" && state.undo.length) {
    state.redo.push({ title: state.title, currentTime: state.currentTime, zoom: state.zoom, duration: state.duration });
    Object.assign(state, state.undo.pop());
    syncHistoryButtons(); syncTime(); toast("Last change undone");
  } else if (action === "redo" && state.redo.length) {
    state.undo.push({ title: state.title, currentTime: state.currentTime, zoom: state.zoom, duration: state.duration });
    Object.assign(state, state.redo.pop());
    syncHistoryButtons(); syncTime(); toast("Change restored");
  } else if (action === "split") {
    if (!video.src) return toast("Add a clip before splitting", "Import a video to enable timeline edits.");
    saveHistory();
    const marker = document.createElement("span");
    marker.className = "split-marker";
    marker.style.cssText = `position:absolute;left:${Math.max(4, (state.currentTime / state.duration) * 100)}%;height:100%;border-left:2px solid #f3a276;z-index:2`;
    document.querySelector(".track-lane[data-track='Video']").append(marker);
    toast("Split marker added", `At ${formatTime(state.currentTime)}. Export and frame-accurate edits require a render worker.`);
  }
}

function renderDynamic(view) {
  if (view === "admin" && currentRole !== "admin") {
    toast("Administrator access required", "Your account can’t open this workspace area.", "error");
    view = "dashboard";
  }
  const [title, subtitle, description] = viewInfo[view] || viewInfo.editor;
  document.querySelector("#breadcrumb-current").textContent = navNames[view] || "Editor";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.viewLink === view));
  editorView.hidden = view !== "editor";
  dynamicView.hidden = view === "editor";
  appShell.dataset.view = view;
  state.view = view;
  if (view === "editor") return;
  const actions = view === "dashboard" ? '<button class="primary-action" data-action="new-project">＋ New project</button>' : `<button class="secondary-action" data-action="view-editor">Open editor ↗</button>`;
  let body = "";
  if (view === "dashboard") body = dashboardMarkup();
  if (view === "generate") body = generateMarkup();
  if (view === "audio") body = audioMarkup();
  if (view === "shorts") body = shortsMarkup();
  if (view === "dna") body = dnaMarkup();
  if (view === "avatar") body = avatarMarkup();
  if (view === "analytics") body = analyticsMarkup();
  if (view === "settings") body = settingsMarkup();
  if (view === "profile") body = profileMarkup();
  if (view === "admin") body = adminMarkup();
  dynamicView.innerHTML = `<div class="dynamic-head"><div><div class="eyebrow"><span class="eyebrow-line"></span>MASTER VIDEO EDITOR</div><h1>${title}</h1><p>${description}</p></div><div class="dynamic-actions">${actions}</div></div>${body}`;
  if (view === "audio") renderWaveform(dynamicView.querySelector(".waveform"));
  if (view === "admin") loadAdminOverview();
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action, button)));
}

function dashboardMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Projects this month</small><strong>12</strong><em>↑ 3 from last month</em></div><div class="stat-block"><small>Published views</small><strong>84.2k</strong><em>↑ 18.4% this month</em></div><div class="stat-block"><small>Time in studio</small><strong>26.5h</strong><em>Across 8 active projects</em></div><div class="stat-block"><small>Exports ready</small><strong>04</strong><em>2 waiting for review</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Recent projects</h2><span>View all →</span></div><div class="asset-list"><div class="asset-row"><span class="asset-thumb">▶</span><strong>Summer field notes</strong><small>Edited 18 min ago</small><small>16:9 · 04:28</small><span class="asset-status">In progress</span></div><div class="asset-row"><span class="asset-thumb">▶</span><strong>Weekend in the hills</strong><small>Edited yesterday</small><small>9:16 · 00:42</small><span class="asset-status">Ready</span></div><div class="asset-row"><span class="asset-thumb">▶</span><strong>Studio conversation #12</strong><small>Edited Sep 21</small><small>16:9 · 28:16</small><span class="asset-status">Review</span></div></div></section><section class="workspace-section"><div class="section-heading"><h2>Start something new</h2><span>Choose a workflow</span></div><div class="feature-grid"><button class="feature-item" data-action="view-editor"><span class="feature-icon">▤</span><h3>Video project</h3><p>Build a cut from your footage in the editor.</p></button><button class="feature-item" data-action="view-shorts"><span class="feature-icon">▯</span><h3>Short-form edit</h3><p>Reframe a story for a vertical feed.</p></button><button class="feature-item" data-action="view-audio"><span class="feature-icon">∿</span><h3>Music brief</h3><p>Describe the sound your story needs.</p></button></div></section>`;
}

function audioMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Draft prompts</small><strong>03</strong><em>Saved in this workspace</em></div><div class="stat-block"><small>Recent previews</small><strong>08</strong><em>Local demo waveforms</em></div><div class="stat-block"><small>Default format</small><strong>WAV</strong><em>48 kHz · Stereo</em></div><div class="stat-block"><small>Generation</small><strong>Ready</strong><em>Provider connection required</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Compose a music brief</h2><span>Audio generation runs as an async job when connected</span></div><label class="field-label" for="audio-prompt">Describe the sound</label><textarea class="prompt-field" id="audio-prompt" placeholder="Warm analog synths, a steady pulse, and a hopeful lift in the final bars…"></textarea><div class="preset-row"><button class="preset-chip active" data-preset="Massive Techno Beat">Massive Techno Beat</button><button class="preset-chip" data-preset="Ambient Lo-Fi">Ambient Lo-Fi</button><button class="preset-chip" data-preset="Cinematic Orange">Cinematic Orange</button><button class="preset-chip" data-preset="Tamil Cyber-Pop">Tamil Cyber-Pop</button></div><div class="control-row"><div><label class="field-label" for="audio-genre">Genre</label><select class="select-field" id="audio-genre"><option>Electronic</option><option>Ambient</option><option>Cinematic</option><option>Indie pop</option><option>Acoustic</option></select></div><div><label class="field-label" for="audio-mood">Mood</label><select class="select-field" id="audio-mood"><option>Hopeful</option><option>Focused</option><option>Tense</option><option>Dreamy</option><option>Playful</option></select></div><div><label class="field-label" for="audio-bpm">BPM</label><input class="text-field" id="audio-bpm" type="number" value="112" min="40" max="240" /></div></div><div class="control-row"><div><label class="field-label" for="audio-duration">Duration</label><select class="select-field" id="audio-duration"><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option></select></div><div><label class="field-label" for="audio-energy">Energy <span id="energy-value">65%</span></label><input class="range-field" id="audio-energy" type="range" min="0" max="100" value="65" /></div><div><label class="field-label" for="audio-instruments">Instruments</label><input class="text-field" id="audio-instruments" value="Synth, soft drums" /></div></div><div class="waveform" aria-label="Illustrative local waveform"></div><div class="dynamic-actions" style="margin-top:14px"><button class="primary-action" data-action="generate-audio">✳ Generate music</button><button class="secondary-action" data-action="preview-audio">▶ Preview</button><button class="secondary-action" data-action="replace-audio">Replace on timeline</button></div><p class="modal-note" id="audio-status">Demo preview only. Connect an authorized generation provider and background worker to produce audio files.</p>`;
}

function generateMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Format</small><strong>16:9</strong><em>Landscape or vertical</em></div><div class="stat-block"><small>Output</small><strong>Draft</strong><em>Review before export</em></div><div class="stat-block"><small>Provider</small><strong>Offline</strong><em>Connection required</em></div><div class="stat-block"><small>Workflow</small><strong>Prompt</strong><em>Describe the scene</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Describe the video</h2><span>No media is sent until a provider is configured</span></div><label class="field-label" for="video-prompt">Creative direction</label><textarea class="prompt-field" id="video-prompt" placeholder="A quiet morning in a glasshouse. Sunlight moves across broad leaves as the camera slowly tracks forward…"></textarea><div class="control-row"><div><label class="field-label" for="video-format">Frame</label><select class="select-field" id="video-format"><option>16:9 · Landscape</option><option>9:16 · Vertical</option><option>1:1 · Square</option></select></div><div><label class="field-label" for="video-duration">Duration</label><select class="select-field" id="video-duration"><option>5 seconds</option><option>10 seconds</option><option>15 seconds</option></select></div><div><label class="field-label" for="video-look">Visual treatment</label><select class="select-field" id="video-look"><option>Cinematic natural</option><option>Soft documentary</option><option>Graphic motion</option><option>Studio product</option></select></div></div><button class="primary-action" style="margin-top:14px" data-action="generate-video">✳ Prepare generation</button><p class="modal-note" style="margin-top:13px">A video provider, moderation checks, and background render worker are required. This brief remains in the browser.</p></section>`;
}

function adminMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Configured accounts</small><strong id="admin-account-count">—</strong><em>Environment-configured</em></div><div class="stat-block"><small>Audio jobs in memory</small><strong id="admin-audio-jobs">—</strong><em>Ephemeral process state</em></div><div class="stat-block"><small>Persistence</small><strong id="admin-persistence">—</strong><em>Database status</em></div><div class="stat-block"><small>Access role</small><strong>Admin</strong><em>Server-verified session</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Service readiness</h2><span>Live API status</span></div><p class="modal-note" id="admin-status">Loading protected administration data…</p></section>`;
}

async function loadAdminOverview() {
  const response = await fetch("/api/admin/overview", { credentials: "same-origin" }).catch(() => null);
  if (!response || !response.ok) {
    const status = document.querySelector("#admin-status");
    if (status) status.textContent = response?.status === 403
      ? "Administrator access is required for this view."
      : "Admin service status is unavailable.";
    return;
  }
  const overview = await response.json();
  document.querySelector("#admin-account-count").textContent = overview.configured_accounts;
  document.querySelector("#admin-audio-jobs").textContent = overview.audio_jobs_in_memory;
  document.querySelector("#admin-persistence").textContent = overview.persistence;
  document.querySelector("#admin-status").textContent = "Admin API connected. User and session data are persisted in SQLite; media workers and storage providers are not configured.";
}

function shortsMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Frame</small><strong>9:16</strong><em>Vertical delivery</em></div><div class="stat-block"><small>Target duration</small><strong>00:45</strong><em>Adjustable per platform</em></div><div class="stat-block"><small>Reframe</small><strong>Smart</strong><em>Face / subject tracking</em></div><div class="stat-block"><small>Captions</small><strong>Dynamic</strong><em>Editable after analysis</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Short-form workflow</h2><span>Source media stays in your project</span></div><div class="feature-grid"><div class="feature-item"><span class="feature-icon">◎</span><h3>Find the hook</h3><p>Surface candidate opening moments for review.</p></div><div class="feature-item"><span class="feature-icon">⌗</span><h3>Reframe the shot</h3><p>Choose a subject-led vertical crop and inspect keyframes.</p></div><div class="feature-item"><span class="feature-icon">CC</span><h3>Style captions</h3><p>Generate an editable subtitle pass with safe margins.</p></div></div><div class="workspace-section"><label class="field-label" for="short-platform">Destination</label><select class="select-field" id="short-platform"><option>YouTube Shorts</option><option>Instagram Reels</option><option>Facebook Reels</option></select><label class="field-label" for="short-duration">Target length</label><input class="text-field" id="short-duration" type="number" value="45" min="10" max="180"/><div class="dynamic-actions" style="margin-top:14px"><button class="primary-action" data-action="shorts-analyze">Find highlight moments</button><button class="secondary-action" data-action="view-editor">Open timeline</button></div></div></section>`;
}

function dnaMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Style profile</small><strong>Draft</strong><em>Built from authorized references</em></div><div class="stat-block"><small>Editing signals</small><strong>18</strong><em>Pacing, framing, sound and more</em></div><div class="stat-block"><small>Style strength</small><strong id="dna-strength-label">75%</strong><em>Adjustable on each edit</em></div><div class="stat-block"><small>Connected accounts</small><strong>00</strong><em>OAuth only</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Editing DNA profile</h2><span>Reference media must be yours or authorized</span></div><div class="feature-grid"><div class="feature-item"><span class="feature-icon">⌁</span><h3>Pace & rhythm</h3><p>Cut frequency, average shot duration, beat alignment.</p></div><div class="feature-item"><span class="feature-icon">◧</span><h3>Look & framing</h3><p>Color palette, captions, typography, camera movement.</p></div><div class="feature-item"><span class="feature-icon">♫</span><h3>Sound signature</h3><p>Music patterns, sound effects, voice and transitions.</p></div></div><div class="workspace-section"><button class="secondary-action" data-action="reference-upload">＋ Add a reference video</button><label class="field-label" for="dna-strength">Style strength <span id="dna-range-value">75%</span></label><input class="range-field" id="dna-strength" type="range" min="25" max="100" step="25" value="75"/><div class="preset-row"><span class="preset-chip">25%</span><span class="preset-chip">50%</span><span class="preset-chip active">75%</span><span class="preset-chip">100%</span></div><button class="primary-action" style="margin-top:14px" data-action="apply-dna">Edit my video in my style</button><p class="modal-note" style="margin-top:13px">Social accounts connect through official OAuth. M.V.E. never asks for social passwords; disconnect and data removal belong in account controls.</p></div></section>`;
}

function avatarMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Avatar scenes</small><strong>02</strong><em>Workspace drafts</em></div><div class="stat-block"><small>Voice profiles</small><strong>01</strong><em>Consent verified</em></div><div class="stat-block"><small>Aspect ratio</small><strong>16:9</strong><em>Can also render vertical</em></div><div class="stat-block"><small>Render queue</small><strong>Idle</strong><em>Provider not connected</em></div></div><section class="workspace-section"><div class="section-heading"><h2>New avatar scene</h2><span>Bring authorized likeness and voice assets</span></div><div class="feature-grid"><div class="feature-item"><span class="feature-icon">◎</span><h3>Choose a presenter</h3><p>Use a licensed avatar or a verified, consenting creator.</p></div><div class="feature-item"><span class="feature-icon">✎</span><h3>Write a script</h3><p>Draft a natural read with clear pacing and emphasis.</p></div><div class="feature-item"><span class="feature-icon">◖</span><h3>Direct the voice</h3><p>Set language, delivery and pronunciation guidance.</p></div></div><label class="field-label" for="avatar-script">Scene script</label><textarea class="prompt-field" id="avatar-script" placeholder="Write the lines for your presenter…"></textarea><button class="primary-action" style="margin-top:13px" data-action="avatar-preview">Prepare scene</button></section>`;
}

function analyticsMarkup() {
  return `<div class="stat-grid"><div class="stat-block"><small>Views</small><strong>84.2k</strong><em>+18.4% vs last month</em></div><div class="stat-block"><small>Average watch</small><strong>00:38</strong><em>+4 seconds</em></div><div class="stat-block"><small>Published pieces</small><strong>16</strong><em>Across 3 channels</em></div><div class="stat-block"><small>Top channel</small><strong>YouTube</strong><em>Official insights only</em></div></div><section class="workspace-section"><div class="section-heading"><h2>Publishing pulse</h2><span>Last 30 days · connected accounts</span></div><div class="feature-grid"><div class="feature-item"><span class="feature-icon">↗</span><h3>Strongest opening</h3><p>Direct-to-camera hooks hold attention longer in recent edits.</p></div><div class="feature-item"><span class="feature-icon">◷</span><h3>Steady cadence</h3><p>Two to three posts each week is your recent rhythm.</p></div><div class="feature-item"><span class="feature-icon">▯</span><h3>Vertical lift</h3><p>Short-form edits reached more new viewers this month.</p></div></div><p class="modal-note" style="margin-top:15px">Sample workspace insights. Live engagement data requires an authorized account connection and supported platform permissions.</p></section>`;
}

function settingsMarkup() {
  return `<section class="workspace-section"><div class="section-heading"><h2>Editing defaults</h2><span>Applied to new projects</span></div><div class="control-row"><div><label class="field-label" for="default-ratio">Canvas ratio</label><select class="select-field" id="default-ratio"><option>16:9 · Landscape</option><option>9:16 · Vertical</option><option>1:1 · Square</option></select></div><div><label class="field-label" for="default-frame-rate">Frame rate</label><select class="select-field" id="default-frame-rate"><option>24 fps</option><option>30 fps</option><option>60 fps</option></select></div><div><label class="field-label" for="default-quality">Export quality</label><select class="select-field" id="default-quality"><option>High · 1080p</option><option>Standard · 720p</option><option>Ultra · 4K</option></select></div></div></section><section class="workspace-section"><div class="section-heading"><h2>Account security</h2><span>Connected providers</span></div><div class="asset-list"><div class="asset-row"><span class="asset-thumb">⌁</span><strong>Social connections</strong><small>OAuth authorization only</small><small>Not connected</small><button class="secondary-action" data-action="oauth-info">Manage</button></div><div class="asset-row"><span class="asset-thumb">⌑</span><strong>Storage location</strong><small>Object storage</small><small>Not configured</small><button class="secondary-action" data-action="storage-info">Manage</button></div></div></section>`;
}

function profileMarkup() {
  return `<section class="workspace-section"><div class="profile-summary"><span class="profile-avatar">SJ</span><span><b>Sanjay J.</b><small>Pro creator · Studio North</small></span></div><label class="field-label" for="profile-name">Display name</label><input class="text-field" id="profile-name" value="Sanjay J."/><label class="field-label" for="profile-email">Email address</label><input class="text-field" id="profile-email" value="creator@example.com" type="email"/><div class="dynamic-actions" style="margin-top:14px"><button class="primary-action" data-action="save-profile">Save profile</button><button class="secondary-action" data-action="delete-data">Data & privacy</button></div></section>`;
}

function renderWaveform(container) {
  if (!container) return;
  let seed = 29;
  container.replaceChildren(...Array.from({ length: 94 }, () => {
    seed = (seed * 9301 + 49297) % 233280;
    const bar = document.createElement("i");
    bar.style.height = `${12 + Math.floor((seed / 233280) * 75)}%`;
    return bar;
  }));
}

function modal(title, content) {
  document.querySelector("#modal-content").innerHTML = `<h2>${title}</h2>${content}`;
  document.querySelector("#modal").showModal();
}

async function startAudioJob() {
  const prompt = document.querySelector("#audio-prompt").value.trim();
  if (!prompt) return toast("Add a music direction first", "A short mood and instrument description is plenty.", "error");
  const button = dynamicView.querySelector('[data-action="generate-audio"]');
  button.disabled = true;
  button.textContent = "Queuing brief…";
  setAssistant("Putting your music brief together. This workspace preview is local-only.", "processing");
  try {
    const response = await fetch("/api/generate-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, genre: document.querySelector("#audio-genre").value, mood: document.querySelector("#audio-mood").value, bpm: Number(document.querySelector("#audio-bpm").value), duration_seconds: Number(document.querySelector("#audio-duration").value), energy: Number(document.querySelector("#audio-energy").value) / 100, instruments: document.querySelector("#audio-instruments").value.split(",").map((item) => item.trim()).filter(Boolean) }) });
    if (!response.ok) throw new Error(`Service returned ${response.status}`);
    const job = await response.json();
    state.audioJob = job.id;
    document.querySelector("#audio-status").textContent = `Job ${job.id} · ${job.status}. A connected generation worker will process this brief.`;
    toast("Music brief queued", "Check job status while the audio worker runs.");
    pollAudioJob(job.id);
  } catch {
    document.querySelector("#audio-status").textContent = "The API is not connected. This screen can preview the brief locally; no audio has been generated.";
    toast("Audio service is not connected", "Run the FastAPI service to submit an async job.", "error");
    setAssistant("The brief is ready, but the generation service is offline. Your work is still here.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "✳ Generate music";
  }
}

async function pollAudioJob(jobId) {
  try {
    const response = await fetch(`/api/generate-audio/${encodeURIComponent(jobId)}`);
    if (!response.ok) return;
    const job = await response.json();
    document.querySelector("#audio-status").textContent = `Job ${job.id} · ${job.status}${job.message ? ` · ${job.message}` : ""}`;
    if (job.status === "queued" || job.status === "processing") window.setTimeout(() => pollAudioJob(jobId), 1400);
    else if (job.status === "failed") setAssistant("The music provider is not configured yet. Your brief can be retried when the worker is connected.", "error");
  } catch { /* The API may be stopped while a local demo is open. */ }
}

function handleAction(action, button) {
  if (action === "view-editor") renderDynamic("editor");
  else if (action.startsWith("view-")) renderDynamic(action.slice(5));
  else if (action === "new-project") { renderDynamic("editor"); toast("New project ready", "Add media to begin your next edit."); }
  else if (action === "generate-audio") startAudioJob();
  else if (action === "generate-video") { const prompt = document.querySelector("#video-prompt").value.trim(); if (!prompt) toast("Add a creative direction first", "Describe the scene you want to create.", "error"); else toast("Generation provider is not connected", "Your brief stays in this browser and has not been submitted.", "error"); }
  else if (action === "preview-audio") { toast("Local waveform preview", "Illustrative only; no generated sound is attached."); }
  else if (action === "replace-audio") toast("Add a track first", "A real audio asset is needed to replace a timeline layer.");
  else if (action === "shorts-analyze") modal("Find a vertical highlight", '<p>Highlight suggestions are ready once analysis services are configured and footage has been imported.</p><div class="modal-note">The app will not upload media without your action.</div>');
  else if (action === "reference-upload") document.querySelector("#reference-input").click();
  else if (action === "apply-dna") toast("Style profile needed", "Add an authorized reference and connect the analysis worker first.");
  else if (action === "avatar-preview") toast("Scene draft saved", "A licensed avatar renderer is required to produce video.");
  else if (action === "oauth-info") modal("Official account connections", '<p>Creator insights use official OAuth authorization only. Passwords are never requested. Connected accounts can be revoked and their associated data deleted.</p><div class="modal-note">No social provider is connected in this workspace.</div>');
  else if (action === "storage-info") modal("Media storage", '<p>Large media files should use private object storage with short-lived signed URLs and region-specific retention controls.</p><div class="modal-note">Object storage is not configured in this workspace.</div>');
  else if (action === "save-profile") toast("Profile saved", "Profile data remains local in this prototype.");
  else if (action === "delete-data") modal("Data & privacy", '<p>Review connected accounts, revoke access, and remove associated data from this workspace.</p><div class="modal-buttons"><button class="secondary-action" data-action="close-modal">Close</button></div>');
  else if (action === "close-modal") document.querySelector("#modal").close();
  else if (action === "export-project") exportProject();
  if (button?.classList.contains("preset-chip")) {
    dynamicView.querySelectorAll(".preset-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    const prompt = document.querySelector("#audio-prompt");
    if (prompt) prompt.value = `${button.dataset.preset} — original instrumental, no vocals, made to sit beneath dialogue.`;
  }
}

function exportProject() {
  const data = { product: "M.R-V.E.", title: state.title, duration_seconds: state.duration, source_file_name: video.src ? document.querySelector("#clip-label").textContent : null, note: "Project metadata only. Video rendering requires a configured export worker." };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `${state.title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "mve-project"}.json`; link.click();
  URL.revokeObjectURL(url);
  toast("Project metadata exported", "Video rendering requires a connected FFmpeg worker.");
}

document.querySelectorAll("[data-view-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); renderDynamic(link.dataset.viewLink); }));
document.querySelector("#import-card").addEventListener("click", () => fileInput.click());
document.querySelector("#add-media").addEventListener("click", () => fileInput.click());
document.querySelector("#reference-input").addEventListener("change", () => { const file = document.querySelector("#reference-input").files[0]; if (file) toast("Reference selected", `${file.name} stays local until analysis is configured.`); });
clipButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
document.querySelector("#play-button").addEventListener("click", togglePlayback);
document.querySelector("#transport-play").addEventListener("click", togglePlayback);
video.addEventListener("timeupdate", syncTime);
video.addEventListener("loadedmetadata", syncTime);
video.addEventListener("play", () => { state.playing = true; document.querySelector("#play-button").textContent = "Ⅱ"; document.querySelector("#transport-play").textContent = "Ⅱ"; });
video.addEventListener("pause", () => { state.playing = false; document.querySelector("#play-button").textContent = "▶"; document.querySelector("#transport-play").textContent = "▶"; });
document.querySelector("#step-back").addEventListener("click", () => { if (video.src) video.currentTime = Math.max(0, video.currentTime - 1 / 24); });
document.querySelector("#step-forward").addEventListener("click", () => { if (video.src) video.currentTime = Math.min(video.duration, video.currentTime + 1 / 24); });
document.querySelector("#timeline-body").addEventListener("click", (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 122) / Math.max(1, rect.width - 122)));
  state.currentTime = state.duration * fraction;
  if (video.src) video.currentTime = state.currentTime;
  syncTime();
});
document.querySelector("#zoom-in").addEventListener("click", () => { state.zoom = Math.min(400, state.zoom + 25); document.querySelector("#zoom-label").textContent = `${state.zoom}%`; document.querySelector("#timeline-body").style.minWidth = `${Math.max(0, state.zoom - 100) * 5 + 0}px`; });
document.querySelector("#zoom-out").addEventListener("click", () => { state.zoom = Math.max(50, state.zoom - 25); document.querySelector("#zoom-label").textContent = `${state.zoom}%`; document.querySelector("#timeline-body").style.minWidth = `${Math.max(0, state.zoom - 100) * 5}px`; });
document.querySelector("#undo-button").addEventListener("click", () => projectAction("undo"));
document.querySelector("#redo-button").addEventListener("click", () => projectAction("redo"));
document.querySelector("#rename-project").addEventListener("click", () => projectAction("rename"));
document.querySelector("#add-track").addEventListener("click", () => { const name = window.prompt("Track name", "B-roll"); if (!name?.trim()) return; saveHistory(); const row = document.createElement("div"); row.className = "track-row"; row.innerHTML = `<div class="track-label"><span class="track-type">＋</span><span>${escapeHtml(name.trim())}</span><button>⌄</button></div><div class="track-lane"><div class="empty-lane-hint">+ Add ${escapeHtml(name.trim().toLowerCase())}</div></div>`; document.querySelector("#timeline-body").append(row); toast("Track added", name.trim()); });
document.querySelector("#analyze-button").addEventListener("click", () => { setAssistant("Analyzing the clip for scene changes, speech, pacing and possible highlights…", "thinking"); window.setTimeout(() => setAssistant(video.src ? "Analysis services are not connected yet. Your footage remains local; no upload was made." : "Add a clip first, then I can prepare the analysis brief."), 1500); });
document.querySelector("#voice-greeting").addEventListener("click", () => {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return toast("Voice greeting unavailable", "Your browser does not provide speech synthesis.");
  const greeting = new SpeechSynthesisUtterance("M.R-V.E. Master Video Editor-க்கு உங்களை அன்போடு வரவேற்கிறோம்!");
  greeting.lang = "ta-IN";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(greeting);
});
document.querySelector("#export-project").addEventListener("click", exportProject);
document.querySelector("#share-project").addEventListener("click", () => modal("Share project", '<p>Invite collaborators after a workspace service is connected. This project is currently stored in this browser session.</p><div class="modal-note">Sharing links require server-side permissions and expiring access tokens.</div>'));
document.querySelector("#fullscreen-button").addEventListener("click", () => previewFrame.requestFullscreen?.());
document.querySelector("#modal-close").addEventListener("click", () => document.querySelector("#modal").close());
document.querySelector(".panel-tabs").addEventListener("click", (event) => { const tab = event.target.closest("[data-tool-tab]"); if (!tab) return; document.querySelectorAll(".panel-tab").forEach((item) => item.classList.toggle("active", item === tab)); if (tab.dataset.toolTab === "edit") toast("Select a timeline clip", "Clip-level controls appear after media is added."); if (tab.dataset.toolTab === "ai") toast("AI tools", "Analysis and rendering workers are not connected yet."); });
previewFrame.addEventListener("dragover", (event) => { event.preventDefault(); previewFrame.classList.add("dragging"); });
previewFrame.addEventListener("dragleave", (event) => { if (!previewFrame.contains(event.relatedTarget)) previewFrame.classList.remove("dragging"); });
previewFrame.addEventListener("drop", (event) => { event.preventDefault(); previewFrame.classList.remove("dragging"); loadFile(event.dataTransfer.files[0]); });
document.body.addEventListener("dragover", (event) => event.preventDefault());
document.body.addEventListener("drop", (event) => { event.preventDefault(); if (event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]); });
document.addEventListener("click", (event) => { const preset = event.target.closest("[data-preset]"); if (preset) handleAction("preset", preset); const action = event.target.closest('[data-action="close-modal"]'); if (action) document.querySelector("#modal").close(); });
document.addEventListener("input", (event) => { if (event.target.id === "audio-energy") document.querySelector("#energy-value").textContent = `${event.target.value}%`; if (event.target.id === "dna-strength") { document.querySelector("#dna-range-value").textContent = `${event.target.value}%`; document.querySelector("#dna-strength-label").textContent = `${event.target.value}%`; } });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); projectAction(event.shiftKey ? "redo" : "undo"); }
  if (event.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && state.view === "editor") { event.preventDefault(); togglePlayback(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); projectAction("split"); }
  if (event.key === "Escape" && document.querySelector("#modal").open) document.querySelector("#modal").close();
});
window.addEventListener("resize", syncTime);
video.hidden = true;
syncTime();

document.querySelector("#logout-button").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  window.location.assign("/");
});

async function initializeWorkspace() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) {
      window.location.replace("/");
      return;
    }
    const user = await response.json();
    if (!user?.username || !["admin", "user"].includes(user.role)) {
      window.location.replace("/");
      return;
    }
    currentRole = user.role;
    document.querySelectorAll("[data-admin-only]").forEach((item) => {
      item.hidden = currentRole !== "admin";
    });
    const profileRow = document.querySelector(".profile-row");
    const avatar = profileRow.querySelector(".profile-avatar");
    const boldName = profileRow.querySelector("b");
    const roleText = profileRow.querySelector("small");
    if (avatar) avatar.textContent = user.username.slice(0, 2).toUpperCase();
    if (boldName) boldName.textContent = user.username;
    if (roleText) roleText.textContent = currentRole === "admin" ? "Administrator" : "Studio Member";
    appShell.hidden = false;
    renderDynamic("editor");
    syncTime();
  } catch {
    window.location.replace("/");
  }
}
initializeWorkspace();

