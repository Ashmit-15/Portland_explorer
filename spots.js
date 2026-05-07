// spots.js — Portland Explorer: Spot Data & Player Sprite

// ── Category colors and emoji ────────────────────────────────────────────────
const CATEGORY_COLORS = {
  food:         '#D35400',
  nature:       '#2ECC71',
  art:          '#9B59B6',
  nightlife:    '#3498DB',
  'hidden gem': '#F39C12',
  view:         '#E74C3C',
  custom:       '#E8DCC8',
  entity:       '#AED6F1'
};
const CATEGORY_EMOJI = {
  food: '🍴', nature: '🌿', art: '🎨', nightlife: '🍺',
  'hidden gem': '💎', view: '👁', custom: '⭐', entity: '💬'
};

// ── 18 Official Portland spots with REAL GPS coordinates ────────────────────
const BASE_SPOTS = [
  {
    id: 0, name: "Duckfat", neighborhood: "Old Port", category: "food",
    lat: 43.6580, lng: -70.2565,
    description: "The city's most beloved poutine and Belgian fry spot on Middle Street. Belgian-style fries cooked in duck fat with rotating dipping sauces have made this a Portland institution.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 1, name: "Novare Res Bier Cafe", neighborhood: "Old Port", category: "nightlife",
    lat: 43.6572, lng: -70.2548,
    description: "A hidden courtyard beer garden with over 500 bottle selections and 30 rotating taps. Duck through an unmarked alley door — locals know the courtyard in back feels like a secret European biergarten.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 2, name: "East End Beach", neighborhood: "Munjoy Hill", category: "nature",
    lat: 43.6545, lng: -70.2437,
    description: "A small, gritty urban beach at the foot of the Eastern Promenade with sweeping views of Casco Bay islands. Locals come here at sunset with wine in paper cups to watch the ferry traffic pass.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 3, name: "Fort Allen Park", neighborhood: "Eastern Promenade", category: "view",
    lat: 43.6569, lng: -70.2437,
    description: "Civil War-era cannon emplacements overlooking Casco Bay from the promenade's highest point. The panoramic view — islands, ocean, harbor cranes — is the best free vista in the city.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 4, name: "Portland Observatory", neighborhood: "Munjoy Hill", category: "hidden gem",
    lat: 43.6608, lng: -70.2518,
    description: "The last surviving maritime signal tower in the US, built in 1807, at the top of Munjoy Hill. Climb 103 steps to the lantern room for a 360-degree view once used to spot incoming merchant ships.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 5, name: "Back Cove Trail", neighborhood: "Back Cove", category: "nature",
    lat: 43.6698, lng: -70.2649,
    description: "A beloved 3.5-mile loop trail encircling a tidal basin where the city comes to run, cycle, and decompress. At low tide the mudflats attract shorebirds; at high tide the cove mirrors the downtown skyline.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 6, name: "Longfellow House", neighborhood: "West End", category: "hidden gem",
    lat: 43.6570, lng: -70.2641,
    description: "Birthplace of poet Henry Wadsworth Longfellow, preserved exactly as it was in the 1800s. The garden behind the Federal-style mansion is a quiet, walled escape most visitors walk right past.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 7, name: "Portland Museum of Art", neighborhood: "Arts District", category: "art",
    lat: 43.6566, lng: -70.2634,
    description: "The oldest public art museum in New England, housing Winslow Homer's Maine seascapes and a Renoir collection in a postmodern I.M. Pei-designed building. Friday evenings draw a young wine-and-art crowd.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 8, name: "Oxbow Brewing", neighborhood: "East Bayside", category: "food",
    lat: 43.6603, lng: -70.2571,
    description: "The Portland outpost of Oxbow's farmhouse brewery, serving wild ales and sours in a renovated warehouse. The bottle shop has releases that never leave Maine — a pilgrimage for beer nerds.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 9, name: "Congress Square Park", neighborhood: "Arts District", category: "art",
    lat: 43.6566, lng: -70.2636,
    description: "A small urban plaza that functions as Portland's outdoor living room and impromptu performance venue. Food trucks, protest poetry, chalk murals, and free concerts coexist in this two-block stretch.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 10, name: "Bramhall Square", neighborhood: "West End", category: "hidden gem",
    lat: 43.6560, lng: -70.2706,
    description: "A cluster of Victorian townhouses and indie shops that feels untouched since 1975. The record shop and vintage clothing store next door share a courtyard with a rotating community mural.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 11, name: "Rosemont Market", neighborhood: "Bayside", category: "food",
    lat: 43.6620, lng: -70.2620,
    description: "A neighborhood market with a wood-fired bakery producing sourdoughs and croissants that sell out by 9am. The wine selection skews natural and biodynamic, curated by staff who actually drink what they sell.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 12, name: "Eastern Promenade Trail", neighborhood: "Eastern Promenade", category: "nature",
    lat: 43.6589, lng: -70.2455,
    description: "A paved multi-use path running the full length of the Eastern Promenade bluff above Casco Bay. The trail passes through meadow grass and urban forest before descending to East End Beach.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 13, name: "Lure Oyster Bar", neighborhood: "Old Port", category: "food",
    lat: 43.6560, lng: -70.2544,
    description: "A narrow slip of a raw bar on the waterfront that sources oysters daily from Damariscotta and the Harraseeket. Standing room only most nights — order the happy hour before 6pm.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 14, name: "Space Gallery", neighborhood: "Arts District", category: "art",
    lat: 43.6565, lng: -70.2631,
    description: "A multi-disciplinary arts venue in a converted warehouse hosting rotating visual art, experimental music, and film. The gallery walls are repainted entirely for each show — no beige, ever.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 15, name: "Casco Bay Ferry Terminal", neighborhood: "Old Port", category: "hidden gem",
    lat: 43.6573, lng: -70.2525,
    description: "The working ferry terminal connecting Portland to its calendar islands — Peaks, Great Diamond, Long Island. Buy a day pass for Peaks Island for $7 each way; locals do it just for the harbor crossing.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 16, name: "India Street Food Carts", neighborhood: "East Bayside", category: "food",
    lat: 43.6601, lng: -70.2568,
    description: "A seasonal cluster of food carts serving everything from Somali sambusas to Korean-Maine fusion lobster rolls. This block reflects Portland's growing immigrant food scene more honestly than any restaurant.",
    photo: '', pick: '',
    discovered: false, visible: false
  },
  {
    id: 17, name: "Munjoy Hill Overlook", neighborhood: "Munjoy Hill", category: "view",
    lat: 43.6614, lng: -70.2514,
    description: "An unmarked overlook at the crest of Munjoy Hill where locals park to watch thunderstorms roll in off the ocean. Bring coffee — the view east over the harbor and islands is completely unobstructed.",
    photo: '', pick: '',
    discovered: false, visible: false
  }
];

// Runtime array — custom spots get appended here
let ALL_SPOTS = BASE_SPOTS.map(s => Object.assign({}, s));
let CUSTOM_SPOTS = [];

// ── Neighborhood bounding boxes ──────────────────────────────────────────────
const NEIGHBORHOODS = [
  { name: "Old Port",            minLat: 43.654, maxLat: 43.660, minLng: -70.261, maxLng: -70.246 },
  { name: "Arts District",       minLat: 43.654, maxLat: 43.660, minLng: -70.269, maxLng: -70.260 },
  { name: "East Bayside",        minLat: 43.658, maxLat: 43.665, minLng: -70.264, maxLng: -70.253 },
  { name: "Munjoy Hill",         minLat: 43.658, maxLat: 43.667, minLng: -70.256, maxLng: -70.240 },
  { name: "West End",            minLat: 43.654, maxLat: 43.663, minLng: -70.284, maxLng: -70.267 },
  { name: "Bayside",             minLat: 43.660, maxLat: 43.668, minLng: -70.272, maxLng: -70.260 },
  { name: "Back Cove",           minLat: 43.665, maxLat: 43.680, minLng: -70.280, maxLng: -70.248 },
  { name: "Eastern Promenade",   minLat: 43.654, maxLat: 43.664, minLng: -70.250, maxLng: -70.238 },
  { name: "Congress St",         minLat: 43.657, maxLat: 43.663, minLng: -70.278, maxLng: -70.257 },
  { name: "Portland Harbor",     minLat: 43.648, maxLat: 43.656, minLng: -70.264, maxLng: -70.238 }
];

function getNeighborhood(lat, lng) {
  for (let i = NEIGHBORHOODS.length - 1; i >= 0; i--) {
    const n = NEIGHBORHOODS[i];
    if (lat >= n.minLat && lat <= n.maxLat && lng >= n.minLng && lng <= n.maxLng) return n.name;
  }
  return '';
}

// ── Player sprite drawing ────────────────────────────────────────────────────
// Draws a Pokemon HG/SS-style overworld character on a 32x48 canvas
function drawPlayerSprite(ctx, direction, frame) {
  const W = 32, H = 48;
  ctx.clearRect(0, 0, W, H);

  // Shadow ellipse beneath character
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 3, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const isLeft  = direction === 'left';
  const isRight = direction === 'right';
  const isUp    = direction === 'up';
  const isDown  = direction === 'down' || (!isLeft && !isRight && !isUp);

  // --- DRAW BODY ---
  // Backpack (behind body when facing down/sides)
  if (!isUp) {
    ctx.fillStyle = '#C62828'; // red backpack
    const bx = isLeft ? 21 : isRight ? 7 : 7;
    ctx.fillRect(bx, 18, 5, 9);
  }

  // Jacket body
  ctx.fillStyle = '#1565C0'; // blue jacket
  ctx.fillRect(9, 18, 14, 12);

  // Belt / bottom of jacket
  ctx.fillStyle = '#0D47A1';
  ctx.fillRect(9, 28, 14, 3);

  // Jacket highlight
  ctx.fillStyle = '#1976D2';
  ctx.fillRect(10, 19, 5, 8);

  // Arms
  ctx.fillStyle = '#1565C0';
  if (isDown) {
    ctx.fillRect(6, 19, 4, 9);  // left arm
    ctx.fillRect(22, 19, 4, 9); // right arm
    // Hand
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(6, 27, 4, 3);
    ctx.fillRect(22, 27, 4, 3);
  } else if (isUp) {
    ctx.fillRect(6, 19, 4, 9);
    ctx.fillRect(22, 19, 4, 9);
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(6, 27, 4, 3);
    ctx.fillRect(22, 27, 4, 3);
  } else {
    // Side view - one arm
    const armX = isRight ? 22 : 6;
    const swingOffset = frame === 1 ? 3 : -3;
    ctx.fillRect(armX, 19 + swingOffset, 4, 9);
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(armX, 27 + swingOffset, 4, 3);
  }

  // --- LEGS ---
  ctx.fillStyle = '#37474F'; // dark grey pants
  if (isDown || isUp) {
    ctx.fillRect(11, 31, 5, 9); // left leg
    ctx.fillRect(16, 31, 5, 9); // right leg
    if (frame === 1) {
      ctx.clearRect(11, 31, 5, 9);
      ctx.clearRect(16, 31, 5, 9);
      ctx.fillRect(9,  31, 5, 9);
      ctx.fillRect(18, 31, 5, 9);
    }
  } else {
    // Side view — single leg visible, animated
    const legX = isRight ? 14 : 13;
    ctx.fillRect(legX, 31, 5, 9);
    if (frame === 1) {
      ctx.clearRect(legX, 31, 5, 9);
      ctx.fillRect(legX - 3, 31, 5, 9);
      ctx.fillRect(legX + 3, 31, 5, 9);
    }
  }

  // Shoes
  ctx.fillStyle = '#3E2723';
  if (isDown || isUp) {
    const lx = frame === 1 ? 9 : 11;
    const rx = frame === 1 ? 18 : 16;
    ctx.fillRect(lx, 38, 6, 4);
    ctx.fillRect(rx, 38, 6, 4);
  } else {
    const lx = frame === 1 ? 11 : 14;
    ctx.fillRect(lx, 38, 7, 4);
    if (frame === 1) ctx.fillRect(lx + 6, 38, 4, 4);
  }

  // --- HEAD ---
  // Hair base
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(8, 4, 16, 14);

  // Face (skin)
  ctx.fillStyle = '#F5CBA7';
  if (isDown) {
    ctx.fillRect(9, 7, 14, 11);
  } else if (isUp) {
    ctx.fillRect(9, 7, 14, 11);
    // back of head — no face features
    ctx.fillStyle = '#4E342E';
    ctx.fillRect(9, 7, 14, 11);
  } else {
    // Side face
    const fx = isRight ? 10 : 9;
    ctx.fillRect(fx, 7, 12, 11);
  }

  // Eyes
  ctx.fillStyle = '#1A1A2E';
  if (isDown) {
    ctx.fillRect(11, 12, 2, 2);
    ctx.fillRect(19, 12, 2, 2);
    // pupils glint
    ctx.fillStyle = '#fff';
    ctx.fillRect(12, 12, 1, 1);
    ctx.fillRect(20, 12, 1, 1);
  } else if (isRight) {
    ctx.fillRect(19, 12, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, 12, 1, 1);
  } else if (isLeft) {
    ctx.fillRect(11, 12, 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(12, 12, 1, 1);
  }

  // Hair detail — tuft / cap brim
  ctx.fillStyle = '#6D4C41';
  ctx.fillRect(8, 4, 16, 4); // lighter top band
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(7, 7, 3, 7);  // left hair hang
  ctx.fillRect(22, 7, 3, 7); // right hair hang
  ctx.fillRect(8,  4, 16, 2); // cap brim darker top

  // Cap brim (little visor)
  ctx.fillStyle = '#C62828';
  if (isDown)  ctx.fillRect(8,  4, 16, 3);
  if (isRight) ctx.fillRect(19, 4, 6,  3);
  if (isLeft)  ctx.fillRect(7,  4, 6,  3);
  if (isUp)    ctx.fillRect(8,  4, 16, 3);
}
