# AgeMobile — Research Reference (AoE2 DE data + portrait mobile RTS UX)

Scope: numbers to seed `src/data/*` and guide HUD/touch design. Values are **generic civ, AoE2 DE current patch (2026)**, no civ bonuses.
Units: speed = tiles/second, range/LOS = tiles, time = game seconds (AoE2 "Normal" speed = 1.0; the DE default lobby speed is 1.7x real-time).

**Primary sources**
- [S1] aoe2techtree data (SiegeEngineers) — `https://raw.githubusercontent.com/SiegeEngineers/aoe2techtree/master/data/data.json` (costs, HP, armor, attack bonuses, train/research times)
- [S2] Age of Empires Fandom wiki (Villager, Farm, Tree, Sheep, Deer, Wild Boar, Gold/Stone Mine, House, Town Center, each building page, Feudal/Castle/Imperial Age) — `https://ageofempires.fandom.com/wiki/<Page>_(Age_of_Empires_II)`
- [S3] AoEZone RMS thread (starting resources) — `https://aoezone.net/threads/random-map-scripting-regicide-inconsistency-adjusting-starting-resources-enabling-custom-gamemode-selection-and-more.144894/`
- [S4] Map sizes — Steam discussion `https://steamcommunity.com/app/221380/discussions/0/35219681616765718`, DEscape issue `https://github.com/Combinebobnt/DEscape/issues/94`
- [S5] Terrain tile 97x49 — `https://github.com/gszep/age-of-empires/issues/42`
- [S6] Fonts In Use, AoE logos (Trajan / Castellar) — `https://fontsinuse.com/uses/18331/age-of-empires-logos`
- [S7] Mobile UX: Apple HIG (44x44 pt min target), Material (48x48 dp), WANDR "Mobile Game UI Design" `https://www.wandr.studio/blog/mobile-game-ui-design`, Hoober thumb study (49% one-handed use)
- [S8] Northgard mobile (gamepressure / Android Police), Rusted Warfare (Google Play listing), Warcraft Rumble (Wikipedia: portrait, ~3 min missions), AoE Mobile (Fandom, TiMi/Level Infinite, Oct 2024)

---

## 1. Game start & population

| Item | Value | Notes |
|---|---|---|
| Starting resources ("Standard") | **200 Food, 200 Wood, 100 Gold, 200 Stone** | [S3]. Low = same; Medium 500/500/300/400; High 1000/1000/700/800 (F/W/G/S) |
| Starting units | **1 Town Center, 3 Villagers, 1 Scout Cavalry** | [S2] Chinese 6 vils, Maya 4 |
| Starting pop display | 4 / 5 | TC gives 5 pop, so you must build a House almost immediately |
| House pop | +5 | 25 wood, 25 s, 2x2 |
| Town Center pop | +5 | |
| Castle pop | +20 | |
| Max population | **200** (standard lobby; DE allows 25–500) | Mobile suggestion: 50–75 for a 48x48 map |
| Villager share (rule of thumb) | ~50% of pop in competitive play | [S2] |

**Typical Arabia-style start (per player, for our map generator)**: 8 sheep (4 at TC + 2 pairs scouted), 6 forage bushes (one cluster), 2 wild boar, 3–4 deer, main gold 7 tiles + 2 secondary gold clusters of 4, stone 5 + 4 tiles, forest line within ~8–10 tiles of TC, a few straggler trees near TC.

## 2. Villager

| Stat | Value | Stat | Value |
|---|---|---|---|
| Cost | 50 F | Train time | 25 s (Town Center) |
| HP | 25 (+15 with Loom) | Attack | 3 melee (+3 vs buildings, +6 vs stone defense) |
| Armor (M/P) | 0/0 (Loom +1/+2) | Speed | **0.8** (+10% Wheelbarrow, +10% Hand Cart) |
| LOS | 4 | Carry capacity | **10** (hunters 35; pasture 3) |
| Build rate | 1 construction-second per second | Multi-builder time | **t_total = 3t / (n + 2)** (first vil 3x as effective as each extra) |
| Repair | 750 HP/min first vil, +375/min each extra; costs 50% of build cost for 1→full HP | Siege/ships repair at 25% rate |

### Gather rates (base, per second) [S2]

| Task | Rate/s | Rate/min | Carry | Main upgrades |
|---|---|---|---|---|
| Fisherman (fish) | 0.43 | 25.8 | 10 | Gillnets (dock) |
| Hunter (deer, boar) | 0.41 | 24.6 | **35** | — |
| Lumberjack | 0.39 | 23.4 | 10 | Double-Bit Axe +20%, Bow Saw +20%, Two-Man Saw +10% |
| Gold miner | 0.38 | 22.8 | 10 | Gold Mining +15%, Gold Shaft Mining +15% |
| Stone miner | 0.36 | 21.6 | 10 | Stone Mining +15%, Stone Shaft Mining +15% |
| Shepherd (sheep) | 0.33 | 19.8 | 10 | — |
| Farmer | 0.32 effective (0.53 raw) | 19.2 | 10 (+1 Heavy Plow) | Horse Collar / Heavy Plow / Crop Rotation add food to farms |
| Forager (berries) | 0.31 | 18.6 | 10 | — |

Farm quirk: a farm "grows" 0.4 F/s into an invisible buffer (cap 15); a fully upgraded farmer is capped at ~0.4 F/s. For a mobile clone, model farmer as flat 0.32–0.4 F/s.
Carry-capacity techs: Wheelbarrow +25% capacity, Hand Cart +50% capacity (both also +10% move speed).

## 3. Resource node amounts [S2]

| Node | Amount | HP / notes |
|---|---|---|
| Tree (forest) | **100 wood** | 20 HP (vils fell with 2 hits). Straggler tree 125; Acacia 150; Baobab 200 |
| Forage (berry) bush | **125 food** | Clusters of 6 near TC |
| Sheep (herdable) | **100 food** | 7 HP; converts to whoever has LOS; no decay until killed |
| Deer (huntable) | **140 food** | 5 HP; flees; herds of 2–4; decays 0.25 F/s once killed |
| Wild Boar | **340 food** | 75 HP, 7 attack, fights back; lure to TC; decays 0.4 F/s |
| Gold mine (per tile) | **800 gold** | 1x1 tiles in clumps (7 main, 4 secondary) |
| Stone mine (per tile) | **350 stone** | clumps of 3–10 |
| Farm | **175 food** base | +75 Horse Collar, +125 Heavy Plow, +175 Crop Rotation → 550 max; 60 wood, 15 s, 3x3, reseedable |

## 4. Buildings [S1][S2]

HP shown at the age of availability (most +Feudal/Castle/Imperial HP/armor bumps via age-up & Masonry/Architecture). Armor = melee/pierce.

| Building | Cost | HP | Build (s) | Size | Age | Trains / Researches / Role |
|---|---|---|---|---|---|---|
| Town Center | 275 W, 100 S | 2400 | **150** | 4x4 | Dark (1 only until Castle) | Villager; Loom, Wheelbarrow (Feudal), Hand Cart (Castle), Town Watch, age-ups. +5 pop, drop-off all, garrison 15, fires arrows (5 atk, range 6) |
| House | 25 W | 550 | 25 | 2x2 | Dark | +5 pop |
| Lumber Camp | 100 W | 600 | 35 | 2x2 | Dark | Wood drop-off; Double-Bit Axe, Bow Saw, Two-Man Saw |
| Mill | 100 W | 600 | 35 | 2x2 | Dark | Food drop-off (berries, hunt, farms); Horse Collar, Heavy Plow, Crop Rotation |
| Mining Camp | 100 W | 600 | 35 | 2x2 | Dark | Gold/stone drop-off; Gold/Stone Mining, Shaft Mining |
| Farm | 60 W | 480 | 15 | 3x3 | Dark | 175 food, infinite reseed |
| Barracks | 175 W | 1200 | 50 | 3x3 | Dark | Militia line, Spearman (Feudal); garrison 10 |
| Dock | 150 W | 1800 | 35 | 3x3 (water) | Dark | Fishing Ship, Transport, Galley, Trade Cog |
| Palisade Wall | 3 W / tile | 150 (250 Feudal) | 7 | 1x1 | Dark | Drag-to-build line; Palisade Gate 30 W |
| Archery Range | 175 W | 1500 | 50 | 3x3 | Feudal | Archer, Skirmisher (Cav Archer in Castle) |
| Stable | 175 W | 1500 | 50 | 3x3 | Feudal | Scout Cavalry, Knight (Castle); Bloodlines, Husbandry |
| Blacksmith | 150 W | 1800 | 40 | 3x3 | Feudal | Attack/armor upgrades (Forging, Fletching, Scale Mail, Padded Archer...) |
| Market | 175 W | 1800 | 60 | 4x4 | Feudal | Buy/sell resources, Trade Cart |
| Watch Tower | 35 W, 125 S | 850 | 80 | 1x1 | Feudal | 5 pierce atk, range 8, LOS 10, garrison 5 |
| Stone Wall | 5 S / tile | 1080 | 10 | 1x1 | Feudal | Gate 30 S (1650 HP) |
| Outpost | 25 W, 5 S | 500 | 15 | 1x1 | Dark | LOS only |
| Monastery | 175 W | 2100 | 40 | 3x3 | Castle | Monk; relic gold trickle |
| University | 200 W | 2100 | 60 | 4x4 | Castle | Masonry, Ballistics, Murder Holes... |
| Siege Workshop | 200 W | 1800 | 40 | 4x4 | Castle | Battering Ram, Mangonel |
| Castle | 650 S | 4800 | 200 | 4x4 | Castle | Unique unit, **Trebuchet** (Imperial), Petard; +20 pop, garrison 20, 11 atk range 8, armor 8/11 |

Base building armor: most economic/military buildings 0–1 melee / 7–8 pierce (so archers barely scratch them).

## 5. Age advancement [S1][S2]

| Age | Cost | Research time | Requirement (any N buildings of the *current* age) |
|---|---|---|---|
| Dark → **Feudal** | **500 F** | **130 s** | 2 of: Barracks, Mill, Lumber Camp, Mining Camp, Dock (Houses, Farms, walls, outposts don't count) |
| Feudal → **Castle** | **800 F, 200 G** | **160 s** | 2 of: Archery Range, Stable, Blacksmith, Market |
| Castle → **Imperial** | **1000 F, 800 G** | **190 s** | 2 of: Monastery, University, Siege Workshop — **or 1 Castle** |

Researched at the Town Center; the TC cannot train Villagers during the research.

## 6. Units [S1][S2]

Armor = melee/pierce. "Bonus" = extra damage vs armor class.

| Unit | Building / Age | Cost | Train (s) | HP | Attack | Armor | Range | Speed | Key bonuses |
|---|---|---|---|---|---|---|---|---|---|
| Villager | TC / Dark | 50 F | 25 | 25 | 3 | 0/0 | 0 | 0.8 | +3 bldg |
| Militia | Barracks / Dark | 50 F, 20 G | 21 | 40 | 4 | 0/1 | 0 | 0.9 | — |
| Man-at-Arms (upgrade, Feudal) | Barracks / Feudal | 50 F, 20 G | 21 | 45 | 6 | 0/1 | 0 | 0.96 | +2 std buildings, +3 eagles |
| Spearman | Barracks / Feudal | 35 F, 25 W | 22 | 45 | 3 | 0/0 | 0 | 1.0 | **+15 cavalry**, +12 camels, +15 elephants |
| Archer | Archery Range / Feudal | 25 W, 45 G | 35 | 30 | 4 (pierce) | 0/0 | 4 | 0.96 | +3 spearmen; 80% accuracy; ROF 2 s |
| Skirmisher | Archery Range / Feudal | 25 F, 35 W | 26 | 30 | 2 (pierce) | 0/3 | 4 (min 1) | 0.96 | **+3 archers**, +3 spearmen |
| Scout Cavalry | Stable / Dark–Feudal | 80 F | 30 | 45 | 3 | 0/2 | 0 | 1.2 (1.55 from Feudal) | +6 monks; LOS 4 (+ scouting) |
| Knight | Stable / Castle | 60 F, 75 G | 30 | 100 | 10 | 2/2 | 0 | 1.35 | ROF 1.8 s |
| Monk | Monastery / Castle | 100 G | 51 | 30 | convert | 0/0 | 9 (heal 4) | 0.7 | Conversion; heals |
| Battering Ram | Siege Workshop / Castle | 160 W, 75 G | 36 | 175 | 2 | -3/**180** | 0 | 0.6 | **+150 buildings**, +40 siege; immune to arrows, weak to melee |
| Mangonel | Siege Workshop / Castle | 160 W, 135 G | 46 | 50 | 40 (area) | 0/6 | 7 (min 3) | 0.6 | +35 buildings, +12 siege; friendly fire; ROF 6 s |
| Trebuchet | Castle / Imperial | 200 W, 200 G | 50 | 150 | 200 | 1/150 | 16 (min 4) | 0.8 packed, 0 unpacked | +250 buildings; must unpack; 15% accuracy vs units |

Other useful: Fishing Ship 75 W/40 s/50 HP; Galley 90 W 30 G; Trade Cart 100 W 50 G; Cavalry Archer 40 W 60 G, 50 HP, range 4, speed 1.4.
Upgrade techs: Man-at-Arms 100 F 40 G (Feudal, Barracks); Loom 50 G 25 s (TC).

### Counter triangle (rock-paper-scissors) for the combat model

| Unit type | Strong vs | Weak vs |
|---|---|---|
| Spearman / Pikeman | Cavalry (Scout, Knight) — +15 bonus | Archers, Militia line |
| Cavalry (Knight, Scout) | Archers, Skirmishers, siege, monks (scout +6) | Spearmen, Monks (Knight), massed camels |
| Archer | Spearmen, infantry, slow melee | Skirmishers (+3 & 3 pierce armor), Cavalry, Mangonel |
| Skirmisher | Archers, Spearmen | Cavalry, Militia line (low melee dmg), anything melee |
| Militia / Man-at-Arms | Spearmen, Skirmishers, buildings (+2) | Archers, Cavalry |
| Battering Ram | Buildings (+150), mangonels (+40) | Any melee unit (-3 melee armor) |
| Mangonel | Massed archers/infantry (area), rams | Cavalry, Knights, other Mangonels |
| Trebuchet | Buildings (+250) from range 16 | Anything that closes in; Knights |
| Monk | Knights/expensive units (conversion) | Scouts/Light Cav (+6/+10), archers |
| Watch Tower / TC arrows | Villager raids, light units | Rams, Mangonels, Trebuchets |

Damage formula (AoE2): `damage = max(1, Σ over attack classes of max(0, attack_c − armor_c))`, then × accuracy/ROF. Base melee uses the melee armor class, projectiles use the pierce class; bonus classes only apply if the target has that armor class. Elevation ±25%.

## 7. Key economy techs [S1][S2]

| Tech | Where / Age | Cost | Time (s) | Effect |
|---|---|---|---|---|
| Loom | TC / Dark | 50 G | 25 | Vil +15 HP, +1/+2 armor |
| Wheelbarrow | TC / Feudal | 175 F, 50 W | 75 | Vil +10% speed, +25% carry |
| Hand Cart | TC / Castle | 300 F, 200 W | 55 | Vil +10% speed, +50% carry |
| Town Watch | TC / Feudal | 75 F | 25 | +4 LOS buildings |
| Double-Bit Axe | Lumber Camp / Feudal | 100 F, 50 W | 25 | Wood +20% |
| Bow Saw | Lumber Camp / Castle | 150 F, 100 W | 50 | Wood +20% |
| Two-Man Saw | Lumber Camp / Imperial | 300 F, 200 W | 100 | Wood +10% |
| Horse Collar | Mill / Feudal | 75 F, 75 W | 20 | Farms +75 food |
| Heavy Plow | Mill / Castle | 125 F, 125 W | 40 | Farms +125 food, farmer +1 carry |
| Crop Rotation | Mill / Imperial | 250 F, 250 W | 70 | Farms +175 food |
| Gold Mining | Mining Camp / Feudal | 100 F, 75 W | 30 | Gold +15% |
| Gold Shaft Mining | Mining Camp / Castle | 175 F, 75 W | 75 | Gold +15% |
| Stone Mining | Mining Camp / Feudal | 100 F, 75 W | 30 | Stone +15% |
| Stone Shaft Mining | Mining Camp / Castle | 175 F, 75 W | 75 | Stone +15% |

Military extras worth including: Fletching 100 F 50 G (Blacksmith, +1 atk/+1 range archers & towers), Forging 150 F (+1 melee atk), Scale Mail 100 F, Padded Archer Armor 100 F, Bloodlines 150 F 100 G (+20 cav HP), Ballistics 300 W 175 G, Masonry 150 F 175 W (+10% bldg HP), Murder Holes 200 F 100 S.

---

## 8. Isometric art & tech facts

| Fact | Value / Recommendation |
|---|---|
| AoE2 tile projection | Dimetric "2:1" diamond; classic terrain tile **97x49 px** (≈2:1) [S5]. DE ships a 4x UHD asset set |
| Our tile | **64x32 px** logical at zoom 1.0 (use 128x64 source art for @2x/@3x devices) |
| World→screen | `sx = (x − y) * TW/2`, `sy = (x + y) * TH/2` (TW=64, TH=32) |
| Screen→world | `x = (sx/(TW/2) + sy/(TH/2)) / 2`, `y = (sy/(TH/2) − sx/(TW/2)) / 2` (after removing camera offset/zoom) |
| Draw order | sort by `(x + y)` of the footprint's **front (bottom) corner**, then by `y`; buildings anchor at bottom vertex |
| Building footprint | 1x1 walls/towers, 2x2 house/camps, 3x3 barracks/farm/range/stable, 4x4 TC/castle/market (§4) |
| Unit size | AoE2 units ~0.2–0.5 tile radius (villager 0.2, sheep 0.3, boar 0.5) — use circles for collision |
| AoE2 map sizes [S4] | Tiny 120², Small 144², Medium 168², Normal 200², Large 220², Huge 240², Giant 255² (DE), LudiKRIS 480² |
| **Our map** | **48x48** (≈16% of Tiny's area). World = 3072x1536 px at zoom 1; a 390-pt-wide phone shows ~6 tiles across at 1.0x — allow zoom 0.5x–1.75x. Scale resource counts ~ (48/120)² ≈ 0.16, but keep per-player start resources near-original (they're local) |
| Game speed | Consider sim tick 10–20 Hz fixed-step with render interpolation; 1 game-sec = 1 real-sec at "Normal"; offer 1.5x/2x |

## 9. Mobile RTS portrait UI/UX

### 9.1 What reference games do [S7][S8]

| Game | Orientation | Relevant takeaways |
|---|---|---|
| Age of Empires Mobile (TiMi, 2024) | Landscape | Abstracted: armies are "marches" with hero skills; no per-villager micro; auto-gather. Shows the franchise's own mobile answer is *less micro* |
| Warcraft Rumble | **Portrait** | ~3 min matches, card-based deploy from a bottom hand, units auto-path/fight. Bottom = all input |
| Clash of Clans / Rise of Kingdoms | Landscape (CoC portrait-friendly bases) | Tap-to-select building → contextual action ribbon at bottom; build placement with ghost + ✓/✗ confirm; drag-move buildings |
| Whiteout Survival / Last War / Top War | **Portrait** 4X city builders | Top resource bar, bottom tab/command bar, floating quick buttons at right edge, minimap/world toggle bottom-left |
| Northgard mobile | Landscape | Low-micro design suits touch; double-tap selects all same type in tile; UI scale option (phones cramped) |
| Rusted Warfare | Landscape | Full RTS on touch: multi-touch box select, pinch zoom, "smart box-selection filters" (e.g., box ignores buildings/workers) |

Implication: a faithful AoE2 clone on a phone must **reduce micro** (auto-return to work, auto-reseed farms, auto-retarget next tree/sheep, "smart" contextual taps) and **surface idle/queue info aggressively**.

### 9.2 Touch control scheme (recommended)

| Gesture | Action |
|---|---|
| Tap own unit/building | Select (replace selection) |
| Tap anything else **with units selected** | Contextual command: ground → move; resource → gather; enemy → attack; foundation → build; own building → garrison/drop-off. Show a brief ring/flag marker + haptic |
| Tap empty ground with nothing selected | Deselect / no-op |
| **Double-tap** own unit | Select all of that type **on screen** (AoE2 double-click behavior) |
| 1-finger drag | Pan camera (with inertia) |
| 2-finger pinch | Zoom (clamp 0.5x–1.75x), zoom around pinch midpoint |
| **Long-press (≈300 ms) + drag** | Box selection (dimetric screen rectangle). Plus a toggle "Select" mode button for accessibility. Smart filter: box prefers military over villagers over buildings |
| Long-press on unit | Add/remove from selection (shift-click equivalent) |
| Tap minimap | Jump camera; drag on minimap scrubs |
| Idle villager button | Cycles idle villagers, centers camera, badge = count (AoE2 "." hotkey) |
| Build placement | Ghost foundation follows finger (offset ~60 pt above finger so it isn't occluded), green/red footprint tiles, explicit **✓ / ✗** buttons; walls: drag start→end |
| Control groups | 3–5 slots in a side rail; long-press slot = assign, tap = select, double-tap = select + center |

Hit-testing: sprites are small at 48x48 scale → use a **min 44 pt touch radius** per entity, prefer units over buildings over resources, and nearest-center wins. Never require pixel-perfect taps.

### 9.3 Sizes & ergonomics [S7]

| Rule | Value |
|---|---|
| Min touch target | **44x44 pt** (Apple HIG), 48x48 dp (Material); primary command buttons **56–64 pt** |
| Spacing between targets | ≥ 8 pt |
| One-handed use | ~49% of users hold one-handed; bottom third of the screen is the comfortable thumb zone; top corners are hardest to reach |
| Safe areas | Respect notch/Dynamic Island (top ~47–59 pt) and home indicator (bottom 34 pt) via `react-native-safe-area-context` |
| Text | ≥ 12 pt for labels, ≥ 15–17 pt for numbers the player scans (resources); tabular figures |
| Feedback | Haptic light impact on select, medium on command, pressed-state on every button, queue progress rings |

### 9.4 Concrete portrait layout (e.g., 390x844 pt iPhone; scale proportionally)

```
┌──────────────────────────────────────────┐  safe-area top
│ 🍖 200  🪵 200  🪙 100  🪨 200  👥 4/5  ☰  │  TOP BAR 40 pt  (resources, pop, age icon, menu/pause)
│ [Dark Age ▸ Feudal 34%]          [minimap]│  age-progress chip (left) · minimap overlay 112x56 pt (top-right, collapsible)
│                                          │
│                MAP VIEW                  │  ~60–65% of height; all gestures
│             (isometric 48x48)            │
│                                          │
│ [💤3 idle]                    [⚔][🏠][1][2][3] │  floating rail just above panel: idle-villager (bottom-left, thumb),
├──────────────────────────────────────────┤  select-all-military / go-to-TC / control groups (right edge)
│ [portrait] Villager  ❤ 25/25   ⚒ Lumberjack │  SELECTION STRIP 56–64 pt: icon, name, HP bar, task, carry;
│ queue: ◉◉○○○                          ✕  │  multi-select → unit-type chips with counts; production queue
├──────────────────────────────────────────┤
│ [Build Eco][Build Mil][ Repair ][ Stop ][Garrison]│  COMMAND GRID 5 cols x 2–3 rows, 64–72 pt cells
│ [  House ][  Mill   ][ Lumber ][ Mine ][  Farm  ]│  (≈ 72 pt wide on 390 pt). Paged/tabbed for >15 commands
└──────────────────────────────────────────┘  safe-area bottom 34 pt
```

Panel height ≈ 200–230 pt + safe area (~28–32% of screen). Rules:
- Command card is **contextual** (AoE2 style): villager → build menus; building → train/research with cost + time in each cell; long-press a cell = tooltip (parchment popover with cost/stats/counters).
- Disabled commands stay visible but desaturated with the missing requirement (e.g., "Needs Feudal Age", red cost number).
- Keep the resource bar **display-only** (top is hard to reach); put anything tapped often in the bottom 40%.
- Minimap: diamond (2:1) rendering, player-color dots, camera frustum trapezoid, tap-to-jump; collapsible to a button to free map space. (Alternative: swap minimap into the selection strip when nothing is selected.)
- Notifications (under attack, age reached, idle TC) as toasts under the top bar with a tap-to-jump.
- Pause/settings in ☰ (top-right, deliberate reach = fewer accidental taps).
- Landscape is not required; lock to portrait in `app.json` (`"orientation": "portrait"`).

---

## 10. AoE2 visual identity for UI

### Visual cues
- **Frames**: dark carved wood & stone panels, **gold/brass trim** with rivets/corner ornaments; DE uses darker, cleaner bevels than the 1999 UI (which had civ-specific panel art: stone, wood, marble).
- **Tooltips / dialogs**: parchment/vellum with deckled edges, dark sepia text.
- **Buttons**: square icon tiles with a thin gold bevel; pressed = inset shadow; disabled = greyscale.
- **Icons**: painterly, 3/4 view, strongly lit; resource glyphs = meat/berries (food), log pile (wood), gold nuggets, stone blocks.
- **Logo type**: series logo uses Trajan (and a Castellar variant earlier) [S6] — classical Roman capitals.

### Suggested palette (our design tokens — approximations, not extracted game values)

| Token | Hex | Use |
|---|---|---|
| panel-dark | `#2B1D14` | Bottom panel base (dark walnut) |
| panel-mid | `#4A3222` | Buttons / strips |
| stone | `#6E6A63` | Secondary panels, disabled frames |
| gold-trim | `#C9A24A` | Borders, highlights, selected state |
| gold-bright | `#F2D27A` | Text highlights, active icons |
| parchment | `#E9D8B0` | Tooltip/dialog background |
| ink | `#3B2A1A` | Text on parchment |
| food | `#D2553F` | Food counter accent |
| wood | `#8B5A2B` | Wood accent |
| gold-res | `#E3B53C` | Gold accent |
| stone-res | `#A7A39A` | Stone accent |
| hp-good / hp-bad | `#3FAE49` / `#C8322B` | Health bars |

Player colors (AoE2 order): Blue, Red, Green, Yellow, Cyan/Teal, Purple, Grey, Orange — e.g. `#2D5BD7 #D3282C #3EA842 #E6C22F #33B7C9 #9340B8 #8C8C8C #E88A2B`.

### Fonts (Google Fonts, free, OFL)

| Role | Recommendation | Why |
|---|---|---|
| Display / titles / age names / buttons | **Cinzel** (600–700) | Trajan-like Roman capitals → matches the AoE logo feel; legible at 14+ pt |
| Body / tooltips / numbers | **Alegreya Sans** (500–700) | Humanist, compact, readable at 12 pt, has tabular figures (`fontVariant: ['tabular-nums']`) |
| Optional flavor | IM Fell English (scenario intro/parchment quotes only) | Period feel but poor at small sizes |
| Avoid for UI text | MedievalSharp, UnifrakturMaguntia | Blackletter-ish, poor legibility on phones |

**Recommended pair: Cinzel + Alegreya Sans** (via `@expo-google-fonts/cinzel` and `@expo-google-fonts/alegreya-sans`).
