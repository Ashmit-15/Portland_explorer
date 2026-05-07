// game.js — Portland Explorer: Complete Game Engine

// ── Constants ────────────────────────────────────────────────────────────────
const PORTLAND_CENTER  = [43.6591, -70.2568]; // Congress St center
const DEFAULT_ZOOM     = 16;
const MIN_ZOOM         = 15;
const MAX_ZOOM         = 19;
const STEP_METERS      = 12;      // meters per key press
const MOVE_DURATION    = 160;     // ms per step
const INTERACT_DIST    = 60;      // meters — show SPACE prompt
const VISIBLE_DIST     = 250;     // meters — spot becomes visible (radar range)
const STREET_THRESHOLD_M = 22;    // max distance from a street centerline to walk
const BASE_SPOT_COUNT  = 18;

// Admin key — change this string and only share URLs with ?admin=THIS-VALUE
// to enable editing/photo-upload UI. Anyone else opening the site sees a read-only view.
const ADMIN_KEY = 'ash-portland-keeper-2026';
let isAdmin = false;

// Portland peninsula ONLY (excludes South Portland, Falmouth, etc.)
// Tightened to just the peninsula proper.
const BOUNDS = L.latLngBounds(
  L.latLng(43.6510, -70.2950),  // SW: Fore River edge
  L.latLng(43.6845, -70.2360)   // NE: Back Cove / Eastern Prom edge
);

// Polygon outline of the Portland peninsula — used as a dim-mask hole
const PORTLAND_PENINSULA = [
  [43.6820, -70.2900],  // Libbytown / Back Cove NW
  [43.6840, -70.2750],  // Back Cove N
  [43.6840, -70.2580],  // Back Cove NE
  [43.6800, -70.2470],  // East Bayside N
  [43.6720, -70.2380],  // Munjoy Hill NE
  [43.6630, -70.2335],  // Eastern Prom mid
  [43.6580, -70.2360],  // Fort Allen Park
  [43.6540, -70.2410],  // East End Beach / waterfront
  [43.6520, -70.2510],  // Commercial St mid
  [43.6520, -70.2620],  // Old Port S
  [43.6530, -70.2745],  // Commercial St SW
  [43.6555, -70.2820],  // Lower West End
  [43.6610, -70.2895],  // Bramhall Sq
  [43.6700, -70.2920],  // West End N
  [43.6770, -70.2925],  // Libbytown
  [43.6820, -70.2900]   // close ring
];

// ── State ────────────────────────────────────────────────────────────────────
let map;
let playerPos     = [...PORTLAND_CENTER];
let playerDir     = 'down';
let playerFrame   = 0;
let playerMoving  = false;
let moveTimer     = null;
let activeCard    = null;
let dialogueActive = false;
let dialoguePendingId = null;
let dialogueTyping  = false;
let keysDown      = new Set();
let lastNeighborhood = '';
let explorerScore = 0;
let muted         = false;
let audioCtx      = null;
let ambientTimeout = null;
let editorMode    = false;
let editorPendingLat = null;
let editorPendingLng = null;
let toastHideTimer = null;
let confettiParticles = [];
let leafletMarkers = {}; // L.marker instances

// ── Street network (loaded from Overpass API) ────────────────────────────────
let streetSegments = []; // [{a:[lat,lng], b:[lat,lng], minLat,maxLat,minLng,maxLng}, ...]
let streetsLoaded  = false;
let streetIndex    = null; // spatial bucket index for fast lookup

// ── Map initialization ───────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: PORTLAND_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    attributionControl: true,
    dragging: true,             // drag map with cursor / touch
    scrollWheelZoom: true,      // mouse wheel zooms
    doubleClickZoom: true,
    keyboard: false,            // we handle WASD/arrows ourselves
    touchZoom: true,            // pinch-zoom on mobile
    inertia: true,
    maxBounds: BOUNDS,
    maxBoundsViscosity: 1.0
  });

  // CartoDB Voyager tiles — free, no API key, beautiful
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    bounds: BOUNDS
  }).addTo(map);

  // Dim-mask: gray out everything outside the Portland peninsula
  addPortlandMask();

  // Editor: click on map to place spot (when in editor mode)
  map.on('click', handleMapClick);

  // Right-click anywhere on the map: instant editor placement (admin only)
  map.on('contextmenu', e => {
    L.DomEvent.preventDefault(e);
    if (!isAdmin) return;
    if (!editorMode) toggleEditor();
    handleMapClick(e);
  });

  // Keep the player sprite anchored to player's lat/lng on the map
  map.on('move zoom', syncPlayerScreenPos);
  window.addEventListener('resize', syncPlayerScreenPos);
}

// Position the fixed-position player sprite at the player's lat/lng on screen
function syncPlayerScreenPos() {
  if (!map) return;
  const wrapper = document.getElementById('player-wrapper');
  if (!wrapper) return;
  const pt = map.latLngToContainerPoint(L.latLng(playerPos[0], playerPos[1]));
  const mapEl = document.getElementById('map');
  const rect = mapEl.getBoundingClientRect();
  wrapper.style.left = (rect.left + pt.x) + 'px';
  wrapper.style.top  = (rect.top  + pt.y) + 'px';
}

// Recenter map on player (button + keyboard shortcut R)
function recenterMap() {
  if (!map) return;
  map.panTo(playerPos, { animate: true, duration: 0.35 });
}

// ── LIVE GEOLOCATION — track real GPS position as you walk ──────────────────
let liveMode    = false;
let liveWatchId = null;
let lastLiveFix = 0;

function toggleLiveLocation() {
  if (liveMode) stopLiveLocation();
  else startLiveLocation();
}

function startLiveLocation() {
  if (!navigator.geolocation) {
    flashHud('⚠ Geolocation not supported');
    return;
  }
  flashHud('📡 Getting your location…');

  liveWatchId = navigator.geolocation.watchPosition(
    onLivePosition,
    onLiveError,
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
  );
  liveMode = true;
  document.getElementById('live-btn')?.classList.add('active');
}

function stopLiveLocation() {
  if (liveWatchId !== null) {
    navigator.geolocation.clearWatch(liveWatchId);
    liveWatchId = null;
  }
  liveMode = false;
  document.getElementById('live-btn')?.classList.remove('active');
  flashHud('📡 Live tracking off');
}

function onLivePosition(pos) {
  const { latitude, longitude } = pos.coords;

  // Outside Portland peninsula? Notify and pause
  if (!BOUNDS.contains(L.latLng(latitude, longitude))) {
    flashHud('⚠ Outside Portland — live paused');
    stopLiveLocation();
    return;
  }

  const isFirstFix = lastLiveFix === 0;
  lastLiveFix = Date.now();

  // Determine direction of travel for sprite facing
  if (!isFirstFix) {
    const dLat = latitude  - playerPos[0];
    const dLng = longitude - playerPos[1];
    if (Math.abs(dLat) > 1e-6 || Math.abs(dLng) > 1e-6) {
      if (Math.abs(dLat) > Math.abs(dLng)) {
        playerDir = dLat > 0 ? 'up' : 'down';
      } else {
        playerDir = dLng > 0 ? 'right' : 'left';
      }
      playerFrame = (playerFrame + 1) % 2;
      renderPlayer();
    }
  }

  // Update player position
  playerPos = [latitude, longitude];

  // Re-render player at new lat/lng
  syncPlayerScreenPos();

  // Pan map to follow (smooth)
  map.panTo(playerPos, { animate: true, duration: 0.5 });

  // Check spot proximity (auto-reveal nearby spots)
  checkProximity();

  // Update neighborhood
  const hood = getNeighborhood(latitude, longitude);
  if (hood && hood !== lastNeighborhood) {
    lastNeighborhood = hood;
    showNeighborhoodToast(hood);
    document.getElementById('hud-neighborhood').textContent = hood;
  }

  saveState();

  if (isFirstFix) flashHud('📡 LIVE — tracking your walk');
}

function onLiveError(err) {
  console.warn('Geolocation error:', err);
  let msg = '⚠ Location unavailable';
  if (err.code === 1) msg = '⚠ Location permission denied';
  else if (err.code === 2) msg = '⚠ Location unavailable';
  else if (err.code === 3) msg = '⚠ Location timeout';
  flashHud(msg);
  stopLiveLocation();
}

// Auto-enable live tracking via ?live=1 URL param
function checkLiveURLParam() {
  const params = new URLSearchParams(window.location.search);
  if (['1','true','yes'].includes((params.get('live') || '').toLowerCase())) {
    setTimeout(startLiveLocation, 1500); // wait for map + streets to load
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PHOTO UPLOAD — works for ANY spot (built-in or custom)
// ══════════════════════════════════════════════════════════════════════════════

const PHOTO_LS_KEY = 'portland_spot_photos';

function loadPhotos() {
  try {
    const stored = JSON.parse(localStorage.getItem(PHOTO_LS_KEY) || '{}');
    ALL_SPOTS.forEach(s => {
      if (stored[s.id]) s.photo = stored[s.id];
    });
  } catch(e) {}
}

function savePhotoForSpot(id, dataUrl) {
  try {
    const stored = JSON.parse(localStorage.getItem(PHOTO_LS_KEY) || '{}');
    if (dataUrl) stored[id] = dataUrl;
    else delete stored[id];
    localStorage.setItem(PHOTO_LS_KEY, JSON.stringify(stored));
  } catch(e) {
    flashHud('⚠ Photo too large — try a smaller image');
  }
}

// Trigger the hidden file input from the card's photo button
function triggerPhotoUpload() {
  if (!isAdmin) return;
  const input = document.getElementById('card-photo-upload');
  if (input) input.click();
}

async function handleCardPhotoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || activeCard === null) return;
  if (!file.type.startsWith('image/')) {
    flashHud('⚠ Not an image file');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    flashHud('⚠ Image too large (max 12 MB)');
    return;
  }
  flashHud('📷 Processing photo…');
  try {
    const raw = await readFileAsDataURL(file);
    const compressed = await compressImage(raw, 1000, 0.78);
    const spot = ALL_SPOTS.find(s => s.id === activeCard);
    if (!spot) return;
    spot.photo = compressed;
    savePhotoForSpot(spot.id, compressed);
    if (spot.isCustom) saveCustomSpots();
    openCard(spot.id); // re-render with new photo
    flashHud('✓ Photo added');
  } catch (err) {
    console.warn('Photo upload error:', err);
    flashHud('⚠ Upload failed');
  } finally {
    e.target.value = ''; // allow re-uploading same file
  }
}

function removePhotoFromSpot() {
  if (!isAdmin) return;
  if (activeCard === null) return;
  if (!confirm('Remove this photo?')) return;
  const spot = ALL_SPOTS.find(s => s.id === activeCard);
  if (!spot) return;
  spot.photo = '';
  savePhotoForSpot(spot.id, '');
  if (spot.isCustom) saveCustomSpots();
  openCard(spot.id);
}

// Download the current spot's photo as a real .jpg file you can drop into
// the repo's images/ folder. Also copies the matching spots.js snippet to clipboard.
async function downloadPhotoForRepo() {
  if (!isAdmin) return;
  const spot = ALL_SPOTS.find(s => s.id === activeCard);
  if (!spot || !spot.photo) {
    flashHud('⚠ No photo on this spot');
    return;
  }
  const slug = spot.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || ('spot-' + spot.id);
  const filename = slug + '.jpg';

  try {
    const res = await fetch(spot.photo);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // Copy a paste-ready snippet to clipboard
    const snippet = `photo: 'images/${filename}',`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(snippet); } catch(e) {}
    }
    flashHud(`✓ Saved ${filename} — snippet copied`);
  } catch (e) {
    console.warn('Download failed:', e);
    flashHud('⚠ Download failed');
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width  * ratio);
      const h = Math.round(img.height * ratio);
      const c = document.createElement('canvas');
      c.width  = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try {
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUrl;
  });
}

// ── Live weather (Open-Meteo API, no key required) ──────────────────────────
let weather = { code: 0, temp: 0, wind: 0, isDay: true, label: 'Loading' };
let weatherCanvas, weatherCtx;
let weatherParticles = [];
let weatherAnimId = null;

async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=43.6591&longitude=-70.2568'
      + '&current=temperature_2m,weather_code,wind_speed_10m,is_day'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API ' + res.status);
    const data = await res.json();
    if (!data.current) throw new Error('No current weather in response');
    weather.code  = data.current.weather_code;
    weather.temp  = Math.round(data.current.temperature_2m);
    weather.wind  = Math.round(data.current.wind_speed_10m);
    weather.isDay = data.current.is_day === 1;
    weather.label = wmoToLabel(weather.code);
    updateWeatherHUD();
    applyWeatherEffects();
  } catch (e) {
    console.warn('Weather fetch failed:', e);
    const el = document.getElementById('hud-weather');
    if (el) el.textContent = '';
  }
}

function wmoToLabel(c) {
  if (c === 0) return 'Clear';
  if (c === 1) return 'Mostly clear';
  if (c === 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Showers';
  if (c === 95) return 'Thunderstorm';
  if (c >= 96) return 'Hail';
  return 'Weather';
}

function wmoToEmoji(c, isDay) {
  if (c === 0) return isDay ? '☀️' : '🌙';
  if (c === 1) return isDay ? '🌤️' : '🌙';
  if (c === 2) return '⛅';
  if (c === 3) return '☁️';
  if (c === 45 || c === 48) return '🌫️';
  if (c >= 51 && c <= 57) return '🌦️';
  if (c >= 61 && c <= 67) return '🌧️';
  if (c >= 71 && c <= 77) return '🌨️';
  if (c >= 80 && c <= 82) return '🌧️';
  if (c === 95) return '⛈️';
  return '🌥️';
}

function updateWeatherHUD() {
  const el = document.getElementById('hud-weather');
  if (!el) return;
  el.textContent = `${wmoToEmoji(weather.code, weather.isDay)} ${weather.temp}°F`;
  el.title = `${weather.label} · Wind ${weather.wind} mph (live Portland weather)`;
}

function initWeatherCanvas() {
  weatherCanvas = document.createElement('canvas');
  weatherCanvas.id = 'weather-canvas';
  weatherCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:550;';
  document.body.appendChild(weatherCanvas);
  weatherCtx = weatherCanvas.getContext('2d');
  resizeWeatherCanvas();
  window.addEventListener('resize', resizeWeatherCanvas);
}

function resizeWeatherCanvas() {
  if (!weatherCanvas) return;
  weatherCanvas.width  = window.innerWidth;
  weatherCanvas.height = window.innerHeight;
}

function applyWeatherEffects() {
  weatherParticles = [];
  const c = weather.code;
  const isStorm = (c === 95 || c >= 96);
  const isRain  = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || isStorm;
  const isSnow  = (c >= 71 && c <= 77);
  const isFog   = (c === 45 || c === 48);

  if (isRain) spawnRain(isStorm ? 220 : 90);
  else if (isSnow) spawnSnow(70);

  // Fog overlay (subtle)
  document.body.classList.toggle('weather-fog', isFog);
  document.body.classList.toggle('weather-storm', isStorm);

  if (weatherParticles.length > 0) {
    if (!weatherAnimId) animateWeather();
  } else if (weatherAnimId) {
    cancelAnimationFrame(weatherAnimId);
    weatherAnimId = null;
    if (weatherCtx) weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
  }
}

function spawnRain(n) {
  for (let i = 0; i < n; i++) {
    weatherParticles.push({
      type: 'rain',
      x: Math.random() * weatherCanvas.width,
      y: Math.random() * weatherCanvas.height,
      vx: -1.5 - Math.random(),
      vy: 11 + Math.random() * 6,
      length: 7 + Math.random() * 6
    });
  }
}

function spawnSnow(n) {
  for (let i = 0; i < n; i++) {
    weatherParticles.push({
      type: 'snow',
      x: Math.random() * weatherCanvas.width,
      y: Math.random() * weatherCanvas.height,
      vx: -0.4 + Math.random() * 0.8,
      vy: 0.8 + Math.random() * 1.6,
      size: 2 + Math.random() * 2.5,
      sway: Math.random() * Math.PI * 2
    });
  }
}

function animateWeather() {
  if (!weatherCtx) return;
  weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);

  weatherParticles.forEach(p => {
    if (p.type === 'rain') {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y > weatherCanvas.height) {
        p.y = -p.length;
        p.x = Math.random() * (weatherCanvas.width + 200);
      }
      weatherCtx.strokeStyle = 'rgba(174, 214, 241, 0.55)';
      weatherCtx.lineWidth = 1;
      weatherCtx.beginPath();
      weatherCtx.moveTo(p.x, p.y);
      weatherCtx.lineTo(p.x + p.vx * 0.6, p.y + p.length);
      weatherCtx.stroke();
    } else if (p.type === 'snow') {
      p.sway += 0.02;
      p.x += p.vx + Math.sin(p.sway) * 0.4;
      p.y += p.vy;
      if (p.y > weatherCanvas.height) {
        p.y = -p.size;
        p.x = Math.random() * weatherCanvas.width;
      }
      weatherCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      weatherCtx.beginPath();
      weatherCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      weatherCtx.fill();
    }
  });

  weatherAnimId = requestAnimationFrame(animateWeather);
}

// Polygon-with-hole that covers the world EXCEPT the Portland peninsula.
// This visually focuses attention on Portland without hiding orientation.
let _maskPolygon = null;
let _outlineLines = [];

function addPortlandMask(rings) {
  rings = rings || [PORTLAND_PENINSULA];

  // Remove previous layers if any (called again after real boundary loads)
  if (_maskPolygon) { map.removeLayer(_maskPolygon); _maskPolygon = null; }
  _outlineLines.forEach(l => map.removeLayer(l));
  _outlineLines = [];

  const worldRing = [
    [-89.99, -179.99], [-89.99, 179.99],
    [ 89.99, 179.99], [ 89.99, -179.99],
    [-89.99, -179.99]
  ];
  // Each peninsula ring becomes a hole in the world rectangle (reversed for hole semantics)
  const holes = rings.map(r => r.slice().reverse());

  _maskPolygon = L.polygon([worldRing, ...holes], {
    stroke: false,
    fillColor: '#0A0F1E',
    fillOpacity: 0.55,
    interactive: false,
    pane: 'overlayPane'
  }).addTo(map);

  // Gold dashed outline traced around each ring
  rings.forEach(ring => {
    const line = L.polyline(ring, {
      color: '#F6C90E',
      weight: 2,
      opacity: 0.6,
      dashArray: '4,4',
      interactive: false
    }).addTo(map);
    _outlineLines.push(line);
  });
}

// ── Fetch the REAL Portland city boundary from OpenStreetMap (Nominatim) ────
// Uses relation/132501 (City of Portland, Maine), clipped to the peninsula bbox
// so the offshore islands (Peaks, Long, Great Diamond, etc.) are filtered out.
async function fetchPortlandBoundary() {
  const CACHE_KEY = 'portland_boundary_v2';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Cache hit → use it
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.rings && (Date.now() - cached.ts) < CACHE_TTL) {
      return cached.rings;
    }
  } catch (e) {}

  try {
    const url = 'https://nominatim.openstreetmap.org/details?osmtype=R&osmid=132501&polygon_geojson=1&format=json';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Nominatim status ' + res.status);
    const data = await res.json();
    const geo = data.geometry;
    if (!geo) throw new Error('No geometry in response');

    // Flatten into a list of rings — both Polygon and MultiPolygon shapes
    let rawRings = [];
    if (geo.type === 'Polygon') {
      rawRings = geo.coordinates;
    } else if (geo.type === 'MultiPolygon') {
      geo.coordinates.forEach(poly => poly.forEach(r => rawRings.push(r)));
    } else {
      throw new Error('Unsupported geometry type: ' + geo.type);
    }

    // Peninsula bounding box — keeps mainland Portland, drops the islands
    const PB = { minLat: 43.648, maxLat: 43.690, minLng: -70.300, maxLng: -70.230 };

    const peninsulaRings = rawRings
      // GeoJSON is [lng,lat]; Leaflet wants [lat,lng]
      .map(ring => ring.map(c => [c[1], c[0]]))
      .filter(ring => {
        if (ring.length < 4) return false;
        // Keep ring if its centroid sits inside the peninsula bbox
        let sLat = 0, sLng = 0;
        ring.forEach(p => { sLat += p[0]; sLng += p[1]; });
        const cLat = sLat / ring.length;
        const cLng = sLng / ring.length;
        return cLat >= PB.minLat && cLat <= PB.maxLat
            && cLng >= PB.minLng && cLng <= PB.maxLng;
      });

    if (peninsulaRings.length === 0) throw new Error('No peninsula rings after bbox clip');

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rings: peninsulaRings }));
    } catch (e) {} // localStorage might be full — fine

    return peninsulaRings;
  } catch (e) {
    console.warn('Portland boundary fetch failed, using hand-drawn fallback:', e);
    return null;
  }
}

// Replace the hand-drawn outline with the real OSM boundary, if fetch succeeds
async function loadRealBoundary() {
  const rings = await fetchPortlandBoundary();
  if (rings && rings.length > 0) {
    addPortlandMask(rings);
    const totalPoints = rings.reduce((s, r) => s + r.length, 0);
    console.log(`Portland boundary loaded from OSM: ${rings.length} ring(s), ${totalPoints} points`);
  }
}

// ── Zoom controls ────────────────────────────────────────────────────────────
function zoomIn()  { if (map) map.setZoom(Math.min(MAX_ZOOM, map.getZoom() + 1)); }
function zoomOut() { if (map) map.setZoom(Math.max(MIN_ZOOM, map.getZoom() - 1)); }

// ── Street network (OpenStreetMap via Overpass API) ──────────────────────────
async function fetchStreets() {
  setLoadingMsg('Loading Portland streets...');
  // Walkable highways. Excludes motorways/trunk to keep player on city streets.
  const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|living_street|footway|pedestrian|path|track|cycleway|steps)$"]
        (43.6510,-70.2950,43.6845,-70.2360);
    );
    out geom;
  `;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      });
      if (!res.ok) continue;
      const data = await res.json();
      processStreetData(data);
      streetsLoaded = true;
      setLoadingMsg('');
      console.log(`Loaded ${streetSegments.length} street segments from ${url}`);
      return;
    } catch (e) {
      console.warn('Overpass endpoint failed:', url, e);
    }
  }
  // All endpoints failed — fall back to permissive (allow all walking)
  streetsLoaded = false;
  setLoadingMsg('Streets offline — free walking enabled');
  setTimeout(() => setLoadingMsg(''), 3000);
}

function processStreetData(data) {
  streetSegments = [];
  data.elements.forEach(way => {
    if (!way.geometry || way.geometry.length < 2) return;
    for (let i = 0; i < way.geometry.length - 1; i++) {
      const a = way.geometry[i], b = way.geometry[i + 1];
      streetSegments.push({
        a: [a.lat, a.lon],
        b: [b.lat, b.lon],
        minLat: Math.min(a.lat, b.lat),
        maxLat: Math.max(a.lat, b.lat),
        minLng: Math.min(a.lon, b.lon),
        maxLng: Math.max(a.lon, b.lon)
      });
    }
  });
  buildStreetIndex();
}

// Spatial bucketing: group street segments by ~0.002 degree cells (~220m)
function buildStreetIndex() {
  streetIndex = new Map();
  const CELL = 0.002;
  streetSegments.forEach(seg => {
    const i0 = Math.floor(seg.minLat / CELL), i1 = Math.floor(seg.maxLat / CELL);
    const j0 = Math.floor(seg.minLng / CELL), j1 = Math.floor(seg.maxLng / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = i + ',' + j;
        if (!streetIndex.has(key)) streetIndex.set(key, []);
        streetIndex.get(key).push(seg);
      }
    }
  });
}

function getNearbyStreetSegments(lat, lng) {
  if (!streetIndex) return streetSegments;
  const CELL = 0.002;
  const i = Math.floor(lat / CELL), j = Math.floor(lng / CELL);
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const key = (i + di) + ',' + (j + dj);
      const bucket = streetIndex.get(key);
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

// Equirectangular point-to-segment distance in meters
function distPointToSegmentM(plat, plng, alat, alng, blat, blng) {
  const cosLat = Math.cos(plat * Math.PI / 180);
  const px = plng * 111320 * cosLat, py = plat * 111320;
  const ax = alng * 111320 * cosLat, ay = alat * 111320;
  const bx = blng * 111320 * cosLat, by = blat * 111320;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function isOnStreet(lat, lng) {
  if (!streetsLoaded) return true; // fallback when streets failed to load
  const TH_DEG = STREET_THRESHOLD_M / 111000;
  const segs = getNearbyStreetSegments(lat, lng);
  for (const seg of segs) {
    if (lat < seg.minLat - TH_DEG || lat > seg.maxLat + TH_DEG) continue;
    if (lng < seg.minLng - TH_DEG || lng > seg.maxLng + TH_DEG) continue;
    if (distPointToSegmentM(lat, lng, seg.a[0], seg.a[1], seg.b[0], seg.b[1]) < STREET_THRESHOLD_M) {
      return true;
    }
  }
  return false;
}

// Snap player to nearest street point if not on a street (used at startup)
function snapToNearestStreet(lat, lng) {
  if (!streetsLoaded) return [lat, lng];
  let best = [lat, lng], bestDist = Infinity;
  const segs = getNearbyStreetSegments(lat, lng);
  const cosLat = Math.cos(lat * Math.PI / 180);
  for (const seg of segs) {
    const ax = seg.a[1] * 111320 * cosLat, ay = seg.a[0] * 111320;
    const bx = seg.b[1] * 111320 * cosLat, by = seg.b[0] * 111320;
    const px = lng * 111320 * cosLat, py = lat * 111320;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = [cy / 111320, cx / (111320 * cosLat)];
    }
  }
  return best;
}

// ── Loading message helper ───────────────────────────────────────────────────
function setLoadingMsg(msg) {
  const el = document.getElementById('hud-loading');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'inline' : 'none';
}

// ── Haversine distance calculation ───────────────────────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Player movement ───────────────────────────────────────────────────────────
function metersToLatDeg(m) { return m / 111320; }
function metersToLngDeg(m, lat) { return m / (111320 * Math.cos(lat * Math.PI / 180)); }

function tryMove(dir) {
  if (playerMoving) return;
  if (dialogueActive || activeCard !== null) return;
  if (editorMode && editorPendingLat !== null) return;
  if (liveMode) return; // keyboard movement disabled while GPS tracks you

  const latStep = metersToLatDeg(STEP_METERS);
  const lngStep = metersToLngDeg(STEP_METERS, playerPos[0]);

  let newLat = playerPos[0], newLng = playerPos[1];
  playerDir = dir;

  if (dir === 'up')    newLat += latStep;
  if (dir === 'down')  newLat -= latStep;
  if (dir === 'left')  newLng -= lngStep;
  if (dir === 'right') newLng += lngStep;

  // Clamp to Portland bounds
  if (!BOUNDS.contains(L.latLng(newLat, newLng))) return;

  // STREET RESTRICTION: only walk where streets exist
  if (!isOnStreet(newLat, newLng)) {
    // Bump feedback (brief shake-style flash on prompt)
    flashOffStreet();
    return;
  }

  playerMoving = true;
  playerPos = [newLat, newLng];

  // Smooth pan to new position
  map.panTo(playerPos, { animate: true, duration: MOVE_DURATION / 1000, easeLinearity: 1 });

  // Play footstep sound
  playFootstep();

  // After move completes
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    playerMoving = false;
    playerFrame = (playerFrame + 1) % 2;

    // Check proximity to spots
    checkProximity();

    // Update neighborhood
    const hood = getNeighborhood(newLat, newLng);
    if (hood && hood !== lastNeighborhood) {
      lastNeighborhood = hood;
      showNeighborhoodToast(hood);
      document.getElementById('hud-neighborhood').textContent = hood;
    }

    saveState();
  }, MOVE_DURATION);
}

// Brief visual nudge when player tries to walk off a street
let _offStreetTimer = null;
function flashOffStreet() {
  const wrap = document.getElementById('player-wrapper');
  if (!wrap) return;
  wrap.classList.add('bump');
  clearTimeout(_offStreetTimer);
  _offStreetTimer = setTimeout(() => wrap.classList.remove('bump'), 220);
}

// ── Input processing ─────────────────────────────────────────────────────────
let moveInterval = null;
function startMoving(dir) {
  tryMove(dir);
  if (moveInterval) clearInterval(moveInterval);
  moveInterval = setInterval(() => tryMove(dir), MOVE_DURATION + 20);
}
function stopMoving() {
  clearInterval(moveInterval);
  moveInterval = null;
  // Show idle frame
  playerFrame = 0;
  renderPlayer();
}

document.addEventListener('keydown', e => {
  const dirs = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };
  if (dirs[e.key]) {
    e.preventDefault();
    initAudio();
    if (!keysDown.has(e.key)) {
      keysDown.add(e.key);
      startMoving(dirs[e.key]);
    }
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    initAudio();
    handleSpacePress();
  }
  if (e.key === 'Escape') {
    if (dialogueActive) closeDialogue();
    else if (activeCard !== null) closeCard();
    else if (editorMode) toggleEditor();
  }
  if ((e.key === 'e' || e.key === 'E') && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
    toggleEditor();
  }
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn();  }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
  if (e.key === 'r' || e.key === 'R') {
    if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) recenterMap();
  }
  if (e.key === 'l' || e.key === 'L') {
    if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) toggleList();
  }
  if (e.key === 'g' || e.key === 'G') {
    if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) toggleLiveLocation();
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key);
  const dirKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','s','a','d','W','S','A','D'];
  if (dirKeys.includes(e.key) && !dirKeys.some(k => keysDown.has(k))) {
    stopMoving();
  }
});

// ── D-pad ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const dir = btn.dataset.dir;
  btn.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); startMoving(dir); }, { passive: false });
  btn.addEventListener('touchend',   e => { e.preventDefault(); stopMoving(); }, { passive: false });
  btn.addEventListener('mousedown',  e => { initAudio(); startMoving(dir); });
  btn.addEventListener('mouseup',    () => stopMoving());
  btn.addEventListener('mouseleave', () => stopMoving());
});

// ── Spot markers on Leaflet map ───────────────────────────────────────────────
function createSpotMarker(spot) {
  if (!spot.visible) return;

  const isNpc      = spot.markerType === 'entity';
  const color      = CATEGORY_COLORS[spot.category] || '#E8DCC8';
  const discovered = spot.discovered;
  const wasNew     = !leafletMarkers[spot.id];

  // Remove existing marker if any
  if (leafletMarkers[spot.id]) {
    map.removeLayer(leafletMarkers[spot.id]);
    delete leafletMarkers[spot.id];
  }

  let iconHtml;
  if (isNpc) {
    // NPC entities — square-ish badge with a character emoji and a clear "talk" indicator
    const emoji = spot.npcEmoji || '🧑';
    iconHtml = `
      <div class="spot-marker npc ${discovered ? 'discovered' : 'undiscovered'}">
        <span class="npc-face">${emoji}</span>
        <span class="npc-bubble">!</span>
      </div>`;
  } else if (discovered) {
    iconHtml = `<div class="spot-marker discovered" style="background:${color}">
                  <span>${CATEGORY_EMOJI[spot.category] || '★'}</span>
                </div>`;
  } else {
    iconHtml = `<div class="spot-marker undiscovered">?</div>`;
  }

  const icon = L.divIcon({
    html: iconHtml,
    className: wasNew ? 'spot-marker-fresh' : '',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
  const marker = L.marker([spot.lat, spot.lng], { icon, zIndexOffset: discovered ? 200 : 100 });

  marker.on('click', () => {
    if (spot.visible) showDialogue(spot.id);
  });

  if (discovered && spot.name) {
    marker.bindTooltip(spot.name, {
      permanent: true, direction: 'bottom', offset: [0, 10],
      className: 'spot-tooltip'
    });
  }

  marker.addTo(map);
  leafletMarkers[spot.id] = marker;

  // Trigger a one-shot "pop-in" animation when the marker first appears on the map
  if (wasNew) {
    requestAnimationFrame(() => {
      const el = marker.getElement();
      if (el) el.classList.add('reveal');
      setTimeout(() => { if (el) el.classList.remove('reveal'); }, 600);
    });
  }
}

function refreshAllMarkers() {
  ALL_SPOTS.forEach(spot => {
    if (spot.visible) createSpotMarker(spot);
  });
}

// ── Proximity checking ────────────────────────────────────────────────────────
function checkProximity() {
  let nearestInteractable = null;
  let nearestDist = Infinity;

  ALL_SPOTS.forEach(spot => {
    const dist = haversineMeters(playerPos[0], playerPos[1], spot.lat, spot.lng);

    // Make visible
    if (!spot.visible && dist <= VISIBLE_DIST) {
      spot.visible = true;
      createSpotMarker(spot);
    }

    // Track nearest interactable (visible, not discovered — or custom spots always interactable)
    if (spot.visible && (!spot.discovered || spot.isCustom) && dist <= INTERACT_DIST) {
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestInteractable = spot;
      }
    }
  });

  const prompt = document.getElementById('interact-prompt');
  if (nearestInteractable) {
    prompt.classList.remove('hidden');
    prompt.style.opacity = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 400));
  } else {
    prompt.classList.add('hidden');
  }
}

// ── Dialogue system (Pokemon style) ──────────────────────────────────────────
let dialogueTypeTimer = null;
let dialogueFullText  = '';
let dialoguePhase     = 0; // 0=typing, 1=waiting, 2=open card

function showDialogue(spotId) {
  const spot = ALL_SPOTS.find(s => s.id === spotId);
  if (!spot) return;
  dialogueActive = true;
  dialoguePendingId = spotId;
  dialoguePhase = 0;

  const isNpc = spot.markerType === 'entity';
  const headerEmoji = isNpc ? (spot.npcEmoji || '🧑') : (CATEGORY_EMOJI[spot.category] || '★');
  const firstSentence = spot.description.split('.')[0] + '.';
  dialogueFullText = isNpc
    ? `${spot.name}:\n"${firstSentence}"`
    : `${headerEmoji} ${spot.name}!\n${firstSentence}`;

  const box  = document.getElementById('dialogue-box');
  const text = document.getElementById('dialogue-text');
  const hint = document.getElementById('dialogue-hint');
  const avatar = document.getElementById('dialogue-avatar');

  // Avatar (only for NPCs) — animated emoji at left of dialogue
  if (avatar) {
    if (isNpc) {
      avatar.textContent = spot.npcEmoji || '🧑';
      avatar.style.display = 'flex';
    } else {
      avatar.style.display = 'none';
    }
  }

  text.textContent = '';
  hint.classList.add('hidden');
  box.classList.remove('hidden');
  box.classList.toggle('npc-dialogue', isNpc);

  // Typewriter
  dialogueTyping = true;
  let i = 0;
  clearInterval(dialogueTypeTimer);
  dialogueTypeTimer = setInterval(() => {
    text.textContent = dialogueFullText.slice(0, ++i);
    if (i >= dialogueFullText.length) {
      clearInterval(dialogueTypeTimer);
      dialogueTyping = false;
      hint.classList.remove('hidden');
      dialoguePhase = 1;
    }
  }, 30);
}

function closeDialogue() {
  clearInterval(dialogueTypeTimer);
  dialogueActive = false;
  dialoguePendingId = null;
  dialogueTyping = false;
  dialoguePhase = 0;
  document.getElementById('dialogue-box').classList.add('hidden');
}

function handleSpacePress() {
  if (dialogueActive) {
    if (dialogueTyping) {
      // Skip to end of typing
      clearInterval(dialogueTypeTimer);
      document.getElementById('dialogue-text').textContent = dialogueFullText;
      dialogueTyping = false;
      document.getElementById('dialogue-hint').classList.remove('hidden');
      dialoguePhase = 1;
    } else if (dialoguePhase === 1) {
      const id = dialoguePendingId;
      closeDialogue();
      openCard(id);
    }
  } else if (activeCard !== null) {
    closeCard();
  } else {
    // Find nearest interactable
    let nearest = null, nearestDist = Infinity;
    ALL_SPOTS.forEach(spot => {
      const dist = haversineMeters(playerPos[0], playerPos[1], spot.lat, spot.lng);
      if (spot.visible && dist <= INTERACT_DIST && dist < nearestDist) {
        nearest = spot;
        nearestDist = dist;
      }
    });
    if (nearest) showDialogue(nearest.id);
  }
}

document.getElementById('dialogue-box').addEventListener('click', () => {
  handleSpacePress();
});

// ── Card system ───────────────────────────────────────────────────────────────
function openCard(id) {
  const spot = ALL_SPOTS.find(s => s.id === id);
  if (!spot) return;
  activeCard = id;

  if (!spot.discovered) {
    spot.discovered = true;
    if (!spot.isCustom) {
      explorerScore = ALL_SPOTS.slice(0, BASE_SPOT_COUNT).filter(s => s.discovered).length;
      document.getElementById('hud-score').textContent = explorerScore + ' / ' + BASE_SPOT_COUNT;
      if (explorerScore >= BASE_SPOT_COUNT) setTimeout(showCompletion, 600);
    }
    spawnDiscoveryBurst();
    createSpotMarker(spot);
    saveState();
  }

  document.getElementById('card-icon').textContent         = CATEGORY_EMOJI[spot.category] || '★';
  document.getElementById('card-name').textContent         = spot.name;
  document.getElementById('card-neighborhood').textContent = spot.neighborhood || getNeighborhood(spot.lat, spot.lng) || 'Portland';
  document.getElementById('card-category').textContent     = (spot.category || 'custom').toUpperCase();
  document.getElementById('card-description').textContent  = spot.description;
  document.getElementById('card-status').textContent       = spot.isCustom ? '★ CUSTOM SPOT' : '✓ DISCOVERED';

  // Distance from player (real walking distance)
  const distM = haversineMeters(playerPos[0], playerPos[1], spot.lat, spot.lng);
  document.getElementById('card-distance').textContent = formatDistance(distM);

  // Photo (only show if URL is set)
  const photoEl   = document.getElementById('card-photo');
  const photoWrap = document.getElementById('card-photo-wrap');
  if (spot.photo && spot.photo.trim()) {
    photoEl.src = spot.photo;
    photoEl.alt = spot.name;
    photoEl.style.display = 'block';
    if (photoWrap) photoWrap.style.display = '';
  } else {
    photoEl.removeAttribute('src');
    photoEl.style.display = 'none';
    // Non-admins shouldn't see the empty upload area at all
    if (photoWrap) photoWrap.style.display = isAdmin ? '' : 'none';
  }

  // Personal "Ash's pick" italic note
  const pickEl = document.getElementById('card-pick');
  if (spot.pick && spot.pick.trim()) {
    pickEl.textContent = '— ' + spot.pick;
    pickEl.style.display = 'block';
  } else {
    pickEl.textContent = '';
    pickEl.style.display = 'none';
  }

  // Remove button only for custom spots
  document.getElementById('card-remove-btn').style.display = spot.isCustom ? 'inline-block' : 'none';

  const card = document.getElementById('card');
  card.classList.remove('hidden');
  // Force reflow before adding visible class for animation
  void card.offsetWidth;
  card.classList.add('visible');
}

// Format meters as "120 m" or "0.4 mi"
function formatDistance(m) {
  if (m < 100) return Math.round(m / 5) * 5 + ' m';
  if (m < 1000) return Math.round(m / 10) * 10 + ' m';
  return (m / 1609.34).toFixed(1) + ' mi';
}

// ── Card actions: directions, link share, remove custom ──────────────────────
function openDirections() {
  const spot = ALL_SPOTS.find(s => s.id === activeCard);
  if (!spot) return;
  // origin = current player, destination = spot. Travelmode walking.
  const url = `https://www.google.com/maps/dir/?api=1`
    + `&origin=${playerPos[0]},${playerPos[1]}`
    + `&destination=${spot.lat},${spot.lng}`
    + `&travelmode=walking`;
  window.open(url, '_blank', 'noopener');
}

function copySpotLink() {
  const spot = ALL_SPOTS.find(s => s.id === activeCard);
  if (!spot) return;
  const slug = spot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = `${window.location.origin}${window.location.pathname}?spot=${slug}`;
  const btn = document.getElementById('card-share-link');
  const orig = btn.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = '✓ COPIED';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    }).catch(() => { btn.textContent = '— ' + url.slice(-20); setTimeout(() => btn.textContent = orig, 2000); });
  }
}

function removeCustomSpotFromCard() {
  if (!isAdmin) return;
  const id = activeCard;
  const spot = ALL_SPOTS.find(s => s.id === id);
  if (!spot || !spot.isCustom) return;
  if (!confirm(`Remove "${spot.name}"? This can't be undone.`)) return;
  closeCard();
  deleteCustomSpot(id);
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST PANEL — browse all spots without walking
// ══════════════════════════════════════════════════════════════════════════════

let listOpen = false;

function toggleList() {
  listOpen = !listOpen;
  document.getElementById('list-panel').classList.toggle('open', listOpen);
  document.getElementById('list-toggle-btn').classList.toggle('active', listOpen);
  if (listOpen) renderList();
}

function renderList() {
  const filter = document.getElementById('list-filter').value;
  const sort   = document.getElementById('list-sort').value;
  const items  = document.getElementById('list-items');

  let spots = ALL_SPOTS.slice();
  if (filter !== 'all') spots = spots.filter(s => s.category === filter);

  if (sort === 'name') {
    spots.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'discovered') {
    spots.sort((a, b) => (b.discovered ? 1 : 0) - (a.discovered ? 1 : 0));
  } else {
    // distance
    spots.sort((a, b) => {
      const da = haversineMeters(playerPos[0], playerPos[1], a.lat, a.lng);
      const db = haversineMeters(playerPos[0], playerPos[1], b.lat, b.lng);
      return da - db;
    });
  }

  if (spots.length === 0) {
    items.innerHTML = '<div class="list-empty">No spots match this filter.</div>';
    return;
  }

  items.innerHTML = spots.map(s => {
    const dist = formatDistance(haversineMeters(playerPos[0], playerPos[1], s.lat, s.lng));
    const emoji = CATEGORY_EMOJI[s.category] || '★';
    const photoBlock = s.photo
      ? `<img class="list-item-photo" src="${escapeAttr(s.photo)}" alt="" loading="lazy">`
      : `<div class="list-item-photo placeholder">${emoji}</div>`;
    const status = s.discovered ? '<span class="list-item-status">✓</span>' : '';
    const customBadge = s.isCustom ? '<span class="list-item-custom">★ CUSTOM</span>' : '';
    return `
      <div class="list-item" onclick="goToSpot(${s.id})" data-id="${s.id}">
        ${photoBlock}
        <div class="list-item-body">
          <div class="list-item-name">${escapeHtml(s.name)} ${status}</div>
          <div class="list-item-meta">${escapeHtml(s.neighborhood || '')} &middot; ${escapeHtml(s.category)} &middot; ${dist} ${customBadge}</div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// Click a list item → fly the map to that spot and open its card
function goToSpot(id) {
  const spot = ALL_SPOTS.find(s => s.id === id);
  if (!spot) return;
  // Make it visible if not already, so the card can open
  if (!spot.visible) {
    spot.visible = true;
    createSpotMarker(spot);
  }
  map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
  setTimeout(() => openCard(id), 700);
}

// Re-render list when filters change
document.addEventListener('change', e => {
  if (e.target && (e.target.id === 'list-filter' || e.target.id === 'list-sort')) {
    if (listOpen) renderList();
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SURPRISE ME — pick a random undiscovered spot and pan to it
// ══════════════════════════════════════════════════════════════════════════════

function surpriseMe() {
  // Prefer undiscovered base spots; fall back to any base spot
  const undiscovered = ALL_SPOTS.slice(0, BASE_SPOT_COUNT).filter(s => !s.discovered);
  const pool = undiscovered.length > 0
    ? undiscovered
    : ALL_SPOTS.slice(0, BASE_SPOT_COUNT);
  if (pool.length === 0) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Make it visible so the marker shows up
  if (!pick.visible) {
    pick.visible = true;
    createSpotMarker(pick);
  }

  // Show a brief flash on the HUD
  flashHud(`🎲 ${pick.name}`);

  // Fly the map to the spot
  map.flyTo([pick.lat, pick.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });

  // Pulse the marker briefly
  setTimeout(() => pulseMarker(pick.id), 850);
}

let _hudFlashTimer = null;
function flashHud(msg) {
  let el = document.getElementById('hud-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-flash';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_hudFlashTimer);
  _hudFlashTimer = setTimeout(() => el.classList.remove('visible'), 2200);
}

function pulseMarker(id) {
  const m = leafletMarkers[id];
  if (!m) return;
  const el = m.getElement();
  if (!el) return;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 1200);
}

function closeCard() {
  const card = document.getElementById('card');
  card.classList.remove('visible');
  card.classList.add('hidden');
  activeCard = null;
}

// ── Player sprite rendering ───────────────────────────────────────────────────
const spriteCanvas = document.getElementById('player-sprite');
const spriteCtx    = spriteCanvas.getContext('2d');

function renderPlayer() {
  drawPlayerSprite(spriteCtx, playerDir, playerFrame);
}

// Continuously animate player while moving
let spriteAnimTimer = null;
function startSpriteAnim() {
  if (spriteAnimTimer) return;
  spriteAnimTimer = setInterval(() => {
    if (playerMoving) {
      playerFrame = (playerFrame + 1) % 2;
      renderPlayer();
    }
  }, MOVE_DURATION / 2);
}

// ── Discovery burst particles ─────────────────────────────────────────────────
const burstCanvas = document.createElement('canvas');
burstCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:500;';
document.body.appendChild(burstCanvas);
const burstCtx = burstCanvas.getContext('2d');
let burstParticles = [];
let burstAnimId = null;

function resizeBurst() {
  burstCanvas.width  = window.innerWidth;
  burstCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeBurst);
resizeBurst();

function spawnDiscoveryBurst() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const colors = ['#F6C90E','#C0392B','#2ECC71','#5DADE2','#F39C12'];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    burstParticles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * (3 + Math.random() * 4),
      vy: Math.sin(angle) * (3 + Math.random() * 4),
      color: colors[i % colors.length],
      life: 1.0,
      size: 5 + Math.random() * 4
    });
  }
  if (!burstAnimId) animateBurst();
}

function animateBurst() {
  burstCtx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);
  burstParticles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= 0.03;
    burstCtx.globalAlpha = Math.max(0, p.life);
    burstCtx.fillStyle = p.color;
    burstCtx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  });
  burstCtx.globalAlpha = 1;
  burstParticles = burstParticles.filter(p => p.life > 0);
  if (burstParticles.length > 0) {
    burstAnimId = requestAnimationFrame(animateBurst);
  } else {
    burstAnimId = null;
    burstCtx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);
  }
}

// ── Neighborhood toast ────────────────────────────────────────────────────────
function showNeighborhoodToast(name) {
  clearTimeout(toastHideTimer);
  const el = document.getElementById('neighborhood-toast');
  el.textContent = name;
  el.classList.add('visible');
  toastHideTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  startAmbient();
}

function playFootstep() {
  if (muted || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.value = 200 + Math.random() * 40;
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.06);
  } catch(e) {}
}

function startAmbient() {
  if (muted || !audioCtx || ambientTimeout) return;
  const notes = [220, 261.6, 329.6, 392, 440];
  let idx = 0;
  function playNote() {
    if (muted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = notes[idx % notes.length];
    idx++;
    const t = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.3);
    gain.gain.linearRampToValueAtTime(0, t + 0.7);
    osc.start(t);
    osc.stop(t + 0.8);
    ambientTimeout = setTimeout(playNote, 900);
  }
  playNote();
}

function toggleMute() {
  muted = !muted;
  document.getElementById('mute-btn').textContent = muted ? '✕' : '♪';
  if (muted) {
    clearTimeout(ambientTimeout);
    ambientTimeout = null;
  } else if (audioCtx) {
    startAmbient();
  }
  localStorage.setItem('portland_muted', muted ? '1' : '0');
}

// ── localStorage persistence ──────────────────────────────────────────────────
function saveState() {
  localStorage.setItem('portland_discoveries', JSON.stringify(ALL_SPOTS.slice(0, BASE_SPOT_COUNT).map(s => s.discovered)));
  localStorage.setItem('portland_visible',     JSON.stringify(ALL_SPOTS.slice(0, BASE_SPOT_COUNT).map(s => s.visible)));
  localStorage.setItem('portland_pos',         JSON.stringify(playerPos));
  localStorage.setItem('portland_score',       explorerScore);
}

function loadState() {
  try {
    const disc  = JSON.parse(localStorage.getItem('portland_discoveries') || '[]');
    const vis   = JSON.parse(localStorage.getItem('portland_visible')     || '[]');
    const pos   = JSON.parse(localStorage.getItem('portland_pos')         || 'null');
    const score = parseInt(localStorage.getItem('portland_score')          || '0', 10);
    const mut   = localStorage.getItem('portland_muted');

    disc.forEach((v, i) => { if (ALL_SPOTS[i]) ALL_SPOTS[i].discovered = !!v; });
    vis.forEach((v,  i) => { if (ALL_SPOTS[i]) ALL_SPOTS[i].visible    = !!v; });

    if (pos && Array.isArray(pos) && pos.length === 2 && BOUNDS.contains(L.latLng(pos[0], pos[1]))) {
      playerPos = pos;
    }
    explorerScore = isNaN(score) ? 0 : score;
    if (mut !== null) muted = mut === '1';

    // Clean up old trail data from previous versions
    localStorage.removeItem('portland_trail');
    document.getElementById('mute-btn').textContent = muted ? '✕' : '♪';
    document.getElementById('hud-score').textContent = explorerScore + ' / ' + BASE_SPOT_COUNT;
  } catch(e) { console.warn('State load error:', e); }
}

// ── Custom spots (editor) ─────────────────────────────────────────────────────
const LS_CUSTOM = 'portland_custom_spots';

function saveCustomSpots() {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(CUSTOM_SPOTS.map(s => ({
    name: s.name, category: s.category, description: s.description,
    lat: s.lat, lng: s.lng, markerType: s.markerType, discovered: s.discovered,
    npcEmoji: s.npcEmoji || ''
  }))));
}

function loadCustomSpots() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]');
    data.forEach(d => addCustomSpotToGame(d.lat, d.lng, d.name, d.category, d.description, d.markerType, d.discovered, d.npcEmoji));
  } catch(e) {}
  renderEditorList();
}

function addCustomSpotToGame(lat, lng, name, category, description, markerType, discovered, npcEmoji) {
  const id = ALL_SPOTS.length;
  const spot = {
    id, lat, lng, name,
    neighborhood: getNeighborhood(lat, lng) || 'Portland',
    category: category || 'custom',
    description: description || 'A custom spot.',
    markerType: markerType || 'spot',
    npcEmoji: (markerType === 'entity') ? (npcEmoji || '🧑') : '',
    discovered: !!discovered,
    visible: true,
    isCustom: true
  };
  ALL_SPOTS.push(spot);
  CUSTOM_SPOTS.push(spot);
  createSpotMarker(spot);
  return spot;
}

function toggleEditor() {
  if (!isAdmin) return;
  editorMode = !editorMode;
  document.getElementById('editor-panel').classList.toggle('open', editorMode);
  document.getElementById('editor-toggle-btn').classList.toggle('active', editorMode);
  if (!editorMode) cancelEditorPlacement();
}

function handleMapClick(e) {
  if (!editorMode) return;
  editorPendingLat = e.latlng.lat;
  editorPendingLng = e.latlng.lng;
  const hood = getNeighborhood(editorPendingLat, editorPendingLng);
  document.getElementById('editor-crosshair-info').textContent =
    `${editorPendingLat.toFixed(5)}, ${editorPendingLng.toFixed(5)}`;
  document.getElementById('editor-pos-display').textContent =
    `${hood || 'Open area'} · lat ${editorPendingLat.toFixed(4)}, lng ${editorPendingLng.toFixed(4)}`;
  document.getElementById('editor-form').classList.add('visible');
  document.getElementById('editor-place-btn').disabled = false;
  document.getElementById('editor-name').focus();
}

function placeCustomSpot() {
  const name = document.getElementById('editor-name').value.trim();
  if (!name) { document.getElementById('editor-name').focus(); return; }
  if (editorPendingLat === null) return;
  const category   = document.getElementById('editor-category').value;
  const markerType = document.getElementById('editor-type').value;
  const npcEmoji   = document.getElementById('editor-npc-emoji').value || '🧑';
  const desc       = document.getElementById('editor-description').value.trim() ||
                     (markerType === 'entity'
                       ? 'Hello, traveler! Welcome to Portland.'
                       : 'A custom spot in Portland.');
  addCustomSpotToGame(editorPendingLat, editorPendingLng, name, category, desc, markerType, false, npcEmoji);
  saveCustomSpots();
  renderEditorList();
  cancelEditorPlacement();
}

function cancelEditorPlacement() {
  editorPendingLat = null; editorPendingLng = null;
  document.getElementById('editor-form').classList.remove('visible');
  document.getElementById('editor-place-btn').disabled = true;
  document.getElementById('editor-name').value = '';
  document.getElementById('editor-description').value = '';
  document.getElementById('editor-crosshair-info').textContent = '';
  document.getElementById('editor-pos-display').textContent = 'Click map to set position';
  // Reset emoji picker
  const typeSel = document.getElementById('editor-type');
  if (typeSel) typeSel.value = 'spot';
  const emojiInput = document.getElementById('editor-npc-emoji');
  if (emojiInput) emojiInput.value = '🧑';
  toggleNpcEmojiPicker();
  document.querySelectorAll('.npc-emoji-pick.active').forEach(b => b.classList.remove('active'));
  const firstPick = document.querySelector('.npc-emoji-pick[data-emoji="🧑"]');
  if (firstPick) firstPick.classList.add('active');
}

// Show/hide the emoji picker based on whether NPC type is selected
function toggleNpcEmojiPicker() {
  const isNpc = document.getElementById('editor-type').value === 'entity';
  const row = document.getElementById('editor-npc-emoji-row');
  if (row) row.style.display = isNpc ? 'block' : 'none';
}

// Wire up emoji-pick clicks (delegate)
document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.npc-emoji-pick');
  if (!btn) return;
  document.querySelectorAll('.npc-emoji-pick').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('editor-npc-emoji').value = btn.dataset.emoji;
});

function deleteCustomSpot(id) {
  const idx = CUSTOM_SPOTS.findIndex(s => s.id === id);
  if (idx === -1) return;
  const spot = CUSTOM_SPOTS[idx];
  if (leafletMarkers[id]) { map.removeLayer(leafletMarkers[id]); delete leafletMarkers[id]; }
  const ai = ALL_SPOTS.indexOf(spot);
  if (ai !== -1) ALL_SPOTS.splice(ai, 1);
  ALL_SPOTS.forEach((s, i) => s.id = i);
  CUSTOM_SPOTS.splice(idx, 1);
  saveCustomSpots();
  renderEditorList();
}

function renderEditorList() {
  const count = CUSTOM_SPOTS.length;
  document.getElementById('editor-list-title').textContent = `CUSTOM SPOTS (${count})`;
  const items = document.getElementById('editor-list-items');
  if (count === 0) {
    items.innerHTML = '<div id="editor-list-empty">No custom spots yet.<br>Click the map to add one.</div>';
    return;
  }
  items.innerHTML = CUSTOM_SPOTS.map(s => `
    <div class="editor-list-item">
      <div class="editor-item-info">
        <div class="editor-item-name">${s.name}</div>
        <div class="editor-item-meta">${s.markerType === 'entity' ? 'NPC' : 'Spot'} · ${s.category}</div>
      </div>
      <button class="editor-item-delete" onclick="deleteCustomSpot(${s.id})">&#10005;</button>
    </div>`).join('');
}

// ── Completion + reset ────────────────────────────────────────────────────────
function showCompletion() {
  document.getElementById('completion').style.display = 'flex';
  startConfetti();
}

function resetGame() {
  ALL_SPOTS.forEach((s, i) => { if (i < BASE_SPOT_COUNT) { s.discovered = false; s.visible = false; } });
  explorerScore = 0;
  playerPos = [...PORTLAND_CENTER];
  Object.keys(leafletMarkers).forEach(id => {
    map.removeLayer(leafletMarkers[id]); delete leafletMarkers[id];
  });
  ['portland_discoveries','portland_visible','portland_pos','portland_score','portland_trail'].forEach(k => localStorage.removeItem(k));
  document.getElementById('completion').style.display = 'none';
  document.getElementById('hud-score').textContent = '0 / ' + BASE_SPOT_COUNT;
  document.getElementById('hud-neighborhood').textContent = '';
  lastNeighborhood = '';
  map.setView(PORTLAND_CENTER, DEFAULT_ZOOM);
  closeCard();
  closeDialogue();
}

function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx    = canvas.getContext('2d');
  const colors = ['#F6C90E','#C0392B','#2ECC71','#5DADE2','#F39C12','#9B59B6'];
  confettiParticles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1,
    size: Math.floor(Math.random() * 6) + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2
  }));
  function anim() {
    if (!confettiParticles.length) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
    });
    requestAnimationFrame(anim);
  }
  anim();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Detect admin mode from URL: ?admin=ADMIN_KEY
  // Adds body.is-admin so CSS reveals editor / photo upload UI for the owner only
  const urlParams = new URLSearchParams(window.location.search);
  isAdmin = urlParams.get('admin') === ADMIN_KEY;
  if (isAdmin) {
    document.body.classList.add('is-admin');
    console.log('Portland Explorer: admin mode enabled');
  }

  loadState();
  loadCustomSpots();
  loadPhotos();
  initMap();

  // Center map on player
  map.setView(playerPos, DEFAULT_ZOOM);

  // Fetch street network from Overpass — required for street-restricted walking
  await fetchStreets();

  // After streets load, snap the player onto the nearest street if necessary
  if (streetsLoaded) {
    const snapped = snapToNearestStreet(playerPos[0], playerPos[1]);
    playerPos = snapped;
    map.setView(playerPos, map.getZoom());
  }

  // Render all visible spots
  refreshAllMarkers();
  checkProximity();

  // Sprite + HUD
  startSpriteAnim();
  renderPlayer();
  syncPlayerScreenPos();

  // Weather (live Portland conditions, refresh every 10 min)
  initWeatherCanvas();
  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000);

  // Auto-enable live GPS tracking via ?live=1 URL param
  checkLiveURLParam();

  // Replace hand-drawn outline with the real OSM boundary (cached 7 days)
  loadRealBoundary();

  const hood = getNeighborhood(playerPos[0], playerPos[1]);
  if (hood) {
    document.getElementById('hud-neighborhood').textContent = hood;
    lastNeighborhood = hood;
  }
}

window.addEventListener('load', init);
