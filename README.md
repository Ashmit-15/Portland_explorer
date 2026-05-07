# Portland Explorer

A pixel-art exploration game layered over the real map of Portland, Maine. Walk a tiny pixel character around the actual city to discover hand-picked food spots, hidden gems, scenic overlooks, and neighborhood favorites.

> **Live demo:** _coming soon (GitHub Pages)_

![Portland Explorer screenshot placeholder](images/screenshot.png)

## What it does

- Real Portland map (CartoDB Voyager tiles via Leaflet.js)
- Pixel character you steer with WASD / arrow keys / on-screen D-pad
- Walking is constrained to actual streets — fetched live from OpenStreetMap's Overpass API
- 18 hand-curated Portland spots with descriptions and personal "Ash's pick" notes
- Pokemon-style typewriter dialogue when you discover a spot
- Live GPS tracking mode — open the page on your phone in Portland and your real location becomes the player; walking IRL builds a trail on the map
- Live local weather (Open-Meteo API) with rain/snow/fog visual effects
- Custom spot editor — click anywhere to drop your own marker
- Photo upload per spot (compressed and stored in localStorage, optionally exported as JPEG for the repo)
- Open in Google Maps for real walking directions
- "Surprise me" random spot picker
- List view with category filters and distance sort
- Trail polyline drawing wherever you've walked

## Try it locally

No build step, no dependencies, no server required.

```bash
git clone https://github.com/YOUR-USERNAME/portland-explorer.git
cd portland-explorer
open index.html      # macOS
# or just double-click index.html in Finder
```

For HTTPS-required features (geolocation), serve over a quick local server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## File structure

```
.
├── index.html      # markup + UI elements
├── style.css       # all styling, mobile-responsive
├── spots.js        # the 18 curated spots + sprite drawing function
└── game.js         # game engine, map logic, geolocation, weather, editor
```

## Controls

| Key | Action |
|---|---|
| `W` / `A` / `S` / `D` or arrows | Walk |
| `Space` | Interact with nearby spot |
| `E` | Toggle editor |
| `L` | Toggle list panel |
| `R` | Recenter map on player |
| `G` | Toggle live GPS tracking |
| `T` | Toggle trail visibility |
| `+` / `−` | Zoom in/out |
| `M` | Mute / unmute |
| Right-click on map | Quick-place a custom spot |

## Tech

- Vanilla JavaScript — no framework, no bundler, no build step
- [Leaflet.js](https://leafletjs.com) for the map
- [CartoDB Voyager](https://carto.com/basemaps) tiles (built from OpenStreetMap data)
- [Overpass API](https://overpass-api.de) for the street network
- [Open-Meteo](https://open-meteo.com) for live weather (no API key)
- [Nominatim](https://nominatim.org) for the official Portland city boundary
- HTML5 Geolocation API for live tracking
- Canvas 2D for the pixel-art player sprite, trail, and weather particles
- localStorage for all persistence (discoveries, photos, custom spots, trail)

## License

MIT — feel free to fork and turn this into a guide for your own city.
