"""Builds Codex image-generation batch prompts and runs them in parallel.
Usage: python scripts/gen_images.py [batch ...]   (skips files that already exist)"""
import subprocess, sys, os, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP = os.environ.get("SP", os.path.join(ROOT, ".gen"))
os.makedirs(SP, exist_ok=True)

STYLE = ("Painterly hand-painted game art in the style of Age of Empires II Definitive Edition. "
         "Isometric 3/4 top-down view (camera pitched about 35 degrees, classic 2:1 isometric RTS angle), "
         "light from top-left, soft ambient occlusion, rich natural medieval colors, crisp readable silhouette at small size. "
         "Fully transparent background (PNG alpha). No ground plane beyond what is described, no text, no border, no watermark. "
         "Centered with a small margin.")
UNIT = (STYLE + " Single full-body character game sprite, standing idle ready pose, facing south-east (toward the viewer's bottom-right). "
        "Player team color is ROYAL BLUE: show it clearly on a sash, tabard, shield or banner. ")
BLD = (STYLE + " Single medieval building game sprite for an isometric RTS, seen from the south corner so two walls are visible "
       "(left wall faces south-west, right wall faces south-east). The building sits on a thin patch of trampled earth shaped exactly "
       "like a 2:1 isometric diamond footprint; outside that diamond everything is transparent. Include small ROYAL BLUE team-colored "
       "flags/banners/cloth. ")
NAT = STYLE + " Single nature object game sprite for an isometric RTS map, no ground patch (just a tiny contact shadow directly beneath). "
TEX = ("Seamless tileable square texture for a video game terrain tile, perfectly top-down orthographic view, fills the whole frame edge to edge, "
       "no perspective, no objects, no border, no text, even lighting, painterly Age of Empires II Definitive Edition terrain style. ")
ICON = ("Game UI icon, painterly Age of Empires II Definitive Edition style, single object centered, strong silhouette, rich colors, "
        "subtle dark outline, fully transparent background (PNG alpha), no text, no frame, square composition. ")

BATCHES = {
 "units": [
  ("unit_villager_f", UNIT + "Medieval peasant woman villager in a simple brown and cream dress with a blue apron/headscarf, carrying a wicker basket, holding a small sickle."),
  ("unit_militia", UNIT + "Dark age militia infantryman: padded gambeson, simple iron kettle helmet, short sword and small round wooden shield painted blue."),
  ("unit_manatarms", UNIT + "Man-at-arms: mail hauberk, nasal helmet, longsword, blue heater shield, blue tabard."),
  ("unit_spearman", UNIT + "Medieval spearman: leather armor, open helmet, long pike held upright, blue tabard."),
  ("unit_archer", UNIT + "Medieval archer: hooded green-brown cloak with blue trim, longbow in hand, quiver of arrows on back."),
  ("unit_skirmisher", UNIT + "Medieval skirmisher javelin thrower: light leather armor, bundle of javelins, small blue shield."),
  ("unit_scout", UNIT + "Scout cavalry: light horseman on a brown horse, leather armor, short spear, blue saddle cloth. Horse and rider fully visible."),
  ("unit_knight", UNIT + "Heavy knight on armored warhorse, full plate armor, great helm, lance, horse caparison in royal blue with gold trim. Horse and rider fully visible."),
  ("unit_monk", UNIT + "Medieval monk: brown hooded robe with blue rope belt, holding a wooden staff topped with a small round golden emblem."),
  ("unit_villager_carry", UNIT + "Medieval peasant man carrying a big bundle of chopped logs on his shoulder, brown tunic, blue sash."),
 ],
 "bld1": [
  ("bld_town_center", BLD + "Large Dark Age TOWN CENTER: big timber-and-stone hall with a tall central tower, thatched and wooden-shingle roofs, surrounding smaller annex rooms, large blue banner. Footprint 4x4 tiles, imposing."),
  ("bld_house", BLD + "Small medieval peasant HOUSE: timber-frame walls with white wattle and daub, thatched roof, small chimney. Footprint 2x2 tiles."),
  ("bld_lumber_camp", BLD + "LUMBER CAMP: open-sided wooden shed with slanted roof, stacks of cut logs, sawhorse and axe in a stump. Footprint 2x2 tiles."),
  ("bld_mill", BLD + "Medieval MILL: small wooden windmill with four sails, sacks of grain at the door. Footprint 2x2 tiles."),
  ("bld_mining_camp", BLD + "MINING CAMP: small wooden storage shed with a mine cart, pickaxes, piles of ore and stone. Footprint 2x2 tiles."),
  ("bld_farm", STYLE + " Isometric FARM field for an RTS: a plowed field plot shaped exactly like a flat 2:1 isometric diamond, rows of golden ripe wheat, low wooden fence posts at the corners, no buildings. Outside the diamond fully transparent."),
  ("bld_foundation", STYLE + " Isometric CONSTRUCTION SITE for an RTS: wooden scaffolding frame, stacked planks, stones and ropes on a flat 2:1 isometric diamond of bare dirt. Outside the diamond fully transparent."),
  ("bld_rubble", STYLE + " Isometric destroyed building RUBBLE: charred beams, broken stones and ash on a flat 2:1 isometric diamond of scorched dirt. Outside the diamond fully transparent."),
 ],
 "bld2": [
  ("bld_barracks", BLD + "Medieval BARRACKS: sturdy timber-and-stone military hall, weapon racks with swords and spears, training dummy, blue banners. Footprint 3x3 tiles."),
  ("bld_archery_range", BLD + "ARCHERY RANGE: wooden hall with an open practice yard, straw archery targets, bows on racks, blue banners. Footprint 3x3 tiles."),
  ("bld_stable", BLD + "STABLE: long wooden stable with open stalls, hay bales, a horse head visible, water trough, blue banners. Footprint 3x3 tiles."),
  ("bld_blacksmith", BLD + "BLACKSMITH forge: stone forge with glowing orange fire, anvil, chimney smoke, tools. Footprint 3x3 tiles."),
  ("bld_market", BLD + "MARKET: several colorful market stalls with cloth awnings (blue dominant), crates, barrels, goods. Footprint 4x4 tiles."),
  ("bld_monastery", BLD + "MONASTERY: stone chapel-like building with a bell tower, round rose window, small garden (no religious symbols). Footprint 3x3 tiles."),
  ("bld_castle", BLD + "Large stone CASTLE: square keep with four corner towers, crenellated walls, gatehouse, big royal blue banners. Footprint 4x4 tiles, very imposing."),
  ("bld_watch_tower", BLD + "Stone WATCH TOWER: tall slender round stone tower with wooden roof and blue flag. Footprint 1x1 tile."),
  ("bld_palisade", BLD + "Short straight segment of wooden PALISADE wall: sharpened vertical logs bound together, running diagonally from bottom-left to top-right. Footprint 1x1 tile."),
 ],
 "nature": [
  ("nat_tree_oak", NAT + "Large leafy deciduous OAK tree, full rounded canopy, thick trunk."),
  ("nat_tree_oak2", NAT + "Medium leafy deciduous tree with slightly lighter green canopy, different shape than a typical oak."),
  ("nat_tree_pine", NAT + "Tall dark green PINE / fir conifer tree."),
  ("nat_tree_birch", NAT + "BIRCH tree with white bark and light yellow-green leaves."),
  ("nat_stump", NAT + "Chopped TREE STUMP with a few wood chips."),
  ("nat_berry_bush", NAT + "FORAGE BERRY BUSH: round green bush full of red berries."),
  ("nat_gold_mine", NAT + "GOLD MINE resource pile: cluster of rocks with shiny gold nuggets and veins glittering, low and wide."),
  ("nat_stone_mine", NAT + "STONE MINE resource pile: cluster of grey quarry stone blocks and boulders, low and wide."),
  ("nat_sheep", NAT + "Fluffy white SHEEP, standing, facing south-east."),
  ("nat_deer", NAT + "Brown DEER stag with antlers, standing, facing south-east."),
  ("nat_boar", NAT + "Wild BOAR with tusks, dark bristly fur, facing south-east."),
  ("nat_rock", NAT + "Small decorative mossy ROCKS and a few grass tufts."),
 ],
 "terrain": [
  ("tex_grass", TEX + "Lush green meadow GRASS with subtle variation and tiny flowers, medium green."),
  ("tex_grass2", TEX + "Slightly drier yellow-green GRASS with small clover patches."),
  ("tex_dirt", TEX + "Brown DIRT / packed earth with small pebbles."),
  ("tex_sand", TEX + "Pale golden beach SAND with gentle ripples."),
  ("tex_water", TEX + "Shallow clear blue-green WATER surface with gentle ripples and light caustics."),
  ("tex_water_deep", TEX + "Deep dark blue WATER surface with small wave highlights."),
  ("tex_forest", TEX + "FOREST FLOOR: dark green grass mixed with fallen leaves, moss and needles."),
  ("ui_menu_bg", "Epic painterly portrait-orientation (vertical 2:3) key art for a medieval real-time strategy game main menu, in the style of Age of Empires II Definitive Edition cover art: a knight on horseback with a royal blue banner on a hill overlooking a medieval valley with a castle, villagers, farms and forests at golden hour, dramatic sky. Leave the top third calmer (sky) for a title and the bottom third darker for buttons. No text, no logos."),
 ],
 "icons": [
  ("icon_food", ICON + "FOOD resource icon: a red apple, a piece of meat and a bundle of wheat together."),
  ("icon_wood", ICON + "WOOD resource icon: a small stack of three chopped logs."),
  ("icon_gold", ICON + "GOLD resource icon: a small pile of shiny gold coins and a nugget."),
  ("icon_stone", ICON + "STONE resource icon: a few grey cut stone blocks."),
  ("icon_pop", ICON + "POPULATION icon: a simple peasant head-and-shoulders silhouette with a small house behind."),
  ("icon_age1", ICON + "DARK AGE emblem: round bronze medallion with a simple wooden club and straw, earthy colors."),
  ("icon_age2", ICON + "FEUDAL AGE emblem: round silver medallion with a crossed sword and spear, blue accents."),
  ("icon_age3", ICON + "CASTLE AGE emblem: round gold medallion with a small castle keep."),
  ("icon_age4", ICON + "IMPERIAL AGE emblem: ornate gold and jeweled medallion with a royal crown."),
  ("icon_hammer", ICON + "BUILD icon: a wooden mallet/hammer crossed with a saw."),
  ("icon_sword", ICON + "MILITARY BUILD icon: a sword crossed with a war banner."),
  ("icon_research", ICON + "RESEARCH / technology icon: an old scroll with a quill and a small gear."),
 ],
}

VIL = (UNIT + "SAME CHARACTER as the attached reference villager (peasant man, brown hair and short beard, brown tunic with rolled sleeves, ROYAL BLUE sash, brown trousers and boots), same painterly style and scale. ")
VILF = (UNIT + "SAME CHARACTER as the attached reference villager woman (blue headscarf, brown and cream dress, blue apron), same painterly style and scale. ")
TECH = ICON + "Technology research icon, drawn inside a round bronze medallion frame. "

BATCHES2 = {
 "vilposes": [
  ("unit_vil_lumberjack", VIL + "Action pose: mid-swing chopping with a woodcutter axe raised over his shoulder, body twisted, facing south-east."),
  ("unit_vil_miner", VIL + "Action pose: swinging a heavy iron pickaxe downward, leaning forward, facing south-east."),
  ("unit_vil_builder", VIL + "Action pose: hammering with a wooden mallet, kneeling on one knee, a wooden plank in front of him, facing south-east."),
  ("unit_vil_farmer", VIL + "Action pose: working the soil with a long wooden hoe, facing south-east."),
  ("unit_vil_carry_gold", VIL + "Walking pose carrying a heavy sack with gold ore over his shoulder, facing south-east."),
  ("unit_vil_carry_stone", VIL + "Walking pose carrying a grey stone block in both arms, facing south-east."),
  ("unit_vil_carry_food", VIL + "Walking pose carrying a wicker basket full of wheat, berries and meat, facing south-east."),
  ("unit_vil_hunter", VIL + "Action pose: thrusting a hunting spear forward, facing south-east."),
 ],
 "vilf": [
  ("unit_vilf_forager", VILF + "Action pose: bending down picking red berries into her wicker basket, facing south-east."),
  ("unit_vilf_farmer", VILF + "Action pose: cutting wheat with a sickle, a small bundle of wheat in the other hand, facing south-east."),
  ("unit_vilf_builder", VILF + "Action pose: hammering with a wooden mallet, facing south-east."),
  ("unit_vilf_lumberjack", VILF + "Action pose: chopping with an axe raised, facing south-east."),
  ("unit_vilf_miner", VILF + "Action pose: swinging a pickaxe, facing south-east."),
  ("unit_vilf_walk", VILF + "Walking pose, mid-stride, carrying an empty basket on her hip, facing south-east."),
 ],
 "combat": [
  ("unit_militia_atk", UNIT + "Same dark age militia infantryman (padded gambeson, iron kettle helmet, round blue shield): attacking pose, sword slashing mid-swing, lunging forward, facing south-east."),
  ("unit_manatarms_atk", UNIT + "Same man-at-arms (mail hauberk, nasal helmet, blue heater shield with golden fleur-de-lis, blue tabard): attacking pose, longsword overhead strike, facing south-east."),
  ("unit_spearman_atk", UNIT + "Same medieval spearman (leather armor, open helmet, blue tabard): attacking pose, thrusting the long pike forward low, facing south-east."),
  ("unit_archer_atk", UNIT + "Same medieval archer (hooded green-brown cloak with blue trim): attacking pose, bow fully drawn aiming forward, facing south-east."),
  ("unit_skirmisher_atk", UNIT + "Same skirmisher javelin thrower: attacking pose, arm back about to throw a javelin, facing south-east."),
  ("unit_knight_atk", UNIT + "Same heavy knight on armored warhorse with royal blue and gold caparison: charging attack pose, horse rearing slightly, knight swinging a longsword, facing south-east."),
  ("unit_scout_atk", UNIT + "Same scout cavalry light horseman on brown horse with blue saddle cloth: attacking pose, galloping and thrusting short spear, facing south-east."),
 ],
 "techs": [
  ("tech_loom", TECH + "A small wooden weaving loom with blue thread."),
  ("tech_wheelbarrow", TECH + "A wooden wheelbarrow."),
  ("tech_hand_cart", TECH + "A two-wheeled wooden hand cart loaded with goods."),
  ("tech_double_bit_axe", TECH + "A double-bladed woodcutter axe."),
  ("tech_bow_saw", TECH + "A wooden frame bow saw."),
  ("tech_horse_collar", TECH + "A leather horse collar harness."),
  ("tech_gold_mining", TECH + "A pickaxe with glittering gold nuggets."),
  ("tech_stone_mining", TECH + "A pickaxe with grey stone blocks."),
  ("tech_forging", TECH + "A glowing hot sword blade on an anvil with a hammer."),
  ("tech_fletching", TECH + "Three arrows with feather fletching."),
  ("tech_scale_mail", TECH + "A piece of scale mail armor."),
  ("tech_padded_archer", TECH + "A quilted padded archer armor jacket."),
  ("tech_man_at_arms", TECH + "A nasal helmet and longsword (upgrade to man-at-arms)."),
 ],
}
BATCHES.update(BATCHES2)
REFS = {"vilposes": "assets/raw/unit_villager_m.png", "vilf": "assets/raw/unit_villager_f.png"}

SIEGE = (STYLE + " Single medieval siege engine game sprite for an isometric RTS, facing south-east (toward the viewer's bottom-right), wooden, with small ROYAL BLUE team-colored cloth/pennant. ")
BATCHES3 = {
 "siege": [
  ("bld_siege_workshop", BLD + "SIEGE WORKSHOP: large open timber workshop yard with a crane, stacked beams, a half-built catapult, blue banners. Footprint 3x3 tiles."),
  ("unit_ram", SIEGE + "BATTERING RAM: covered wooden ram house on four wheels with a hide/plank roof, a heavy iron-capped log ram pointing forward."),
  ("unit_mangonel", SIEGE + "MANGONEL: wooden torsion catapult on wheels with a throwing arm and a sling bucket holding a round stone."),
  ("unit_mangonel_atk", SIEGE + "Same MANGONEL mid-shot: throwing arm swung fully upright, stone just released."),
  ("unit_monk_atk", UNIT + "Same medieval monk (brown hooded robe, blue rope belt, wooden staff with golden round emblem): healing pose, staff raised high with a soft warm golden glow around the emblem, facing south-east."),
  ("proj_stone", ICON + "A single round grey catapult stone ball, small, with slight motion blur."),
  ("fx_dust", ICON + "A small puff of brown dust and debris cloud, soft edges, semi-transparent."),
  ("fx_fire", ICON + "A small burning fire with orange flames and a bit of dark smoke, as used on a damaged building in a strategy game."),
 ],
}
BATCHES.update(BATCHES3)

# ---- wave 4: directional (back-facing) views + walk frames for a pseudo-3D look ----
BACK = (STYLE + " Single full-body character game sprite. SAME CHARACTER, outfit, colors, proportions and painterly style as the attached "
        "reference image, but now seen FROM BEHIND: the character faces NORTH-EAST (away from the viewer, toward the top-right of the screen), "
        "so we mainly see the back and the right side; standing idle. Same scale as the reference. ")
WALK = (STYLE + " Single full-body character game sprite. SAME CHARACTER, outfit, colors, proportions and painterly style as the attached "
        "reference image, facing SOUTH-EAST (toward the viewer's bottom-right) exactly like the reference, but WALKING: mid-stride, left leg forward, "
        "arms swinging naturally. Same scale as the reference. ")
BACKWALK = (STYLE + " Single full-body character game sprite. SAME CHARACTER, outfit, colors and painterly style as the attached reference image, "
            "seen FROM BEHIND facing NORTH-EAST (away from the viewer, toward the top-right), WALKING mid-stride. Same scale as the reference. ")
HORSEWALK = (STYLE + " Single mounted-unit game sprite. SAME rider, horse, colors and painterly style as the attached reference image, facing "
             "SOUTH-EAST like the reference, horse TROTTING mid-stride with legs clearly in motion. Same scale as the reference. ")
HORSEBACK = (STYLE + " Single mounted-unit game sprite. SAME rider, horse, colors and painterly style as the attached reference image, but seen "
             "FROM BEHIND: horse and rider face NORTH-EAST (away from the viewer, toward the top-right). Same scale as the reference. ")
FX = ("Game visual effect sprite, painterly Age of Empires II Definitive Edition style, soft edges, fully transparent background (PNG alpha), "
      "no text, centered, no ground. ")

BATCHES4 = {
 "dir_vil": [
  ("unit_villager_m_ne", BACK + "Peasant man villager with axe."),
  ("unit_villager_m_walk", WALK + "Peasant man villager with axe."),
  ("unit_villager_m_ne_walk", BACKWALK + "Peasant man villager with axe."),
 ],
 "dir_vilf": [
  ("unit_villager_f_ne", BACK + "Peasant woman villager with basket."),
  ("unit_villager_f_ne_walk", BACKWALK + "Peasant woman villager with basket."),
 ],
 "dir_inf": [
  ("unit_militia_ne", BACK + "Militia infantryman with sword and round blue shield."),
  ("unit_militia_walk", WALK + "Militia infantryman with sword and round blue shield."),
 ],
 "dir_maa": [
  ("unit_manatarms_ne", BACK + "Man-at-arms with longsword and blue heater shield."),
  ("unit_manatarms_walk", WALK + "Man-at-arms with longsword and blue heater shield."),
 ],
 "dir_spear": [
  ("unit_spearman_ne", BACK + "Spearman holding a long pike upright."),
  ("unit_spearman_walk", WALK + "Spearman holding a long pike upright."),
 ],
 "dir_archer": [
  ("unit_archer_ne", BACK + "Hooded archer with longbow and quiver."),
  ("unit_archer_walk", WALK + "Hooded archer with longbow and quiver."),
 ],
 "dir_knight": [
  ("unit_knight_ne", HORSEBACK + "Heavy knight on caparisoned warhorse."),
  ("unit_knight_walk", HORSEWALK + "Heavy knight on caparisoned warhorse."),
 ],
 "dir_scout": [
  ("unit_scout_ne", HORSEBACK + "Light scout cavalry on brown horse."),
  ("unit_scout_walk", HORSEWALK + "Light scout cavalry on brown horse."),
 ],
 "fx": [
  ("fx_smoke", FX + "A soft billowing puff of grey-white smoke, rounded cloud shape."),
  ("fx_fire2", FX + "Burning flames with orange-yellow core and red tips, a slightly different flame shape than a typical campfire, a little dark smoke on top."),
  ("fx_sparks", FX + "A small burst of golden sparkles and light rays, celebratory, like a technology researched or age advanced effect."),
  ("fx_birds", FX + "A small flock of five dark birds flying, seen from above at a slight angle, wings in different flap positions."),
  ("fx_flag", FX + "A single rally-point flag: short wooden pole with a waving ROYAL BLUE cloth banner, standing on the ground."),
 ],
}
BATCHES.update(BATCHES4)
REFS.update({
  "dir_vil": "assets/raw/unit_villager_m.png", "dir_vilf": "assets/raw/unit_villager_f.png",
  "dir_inf": "assets/raw/unit_militia.png", "dir_maa": "assets/raw/unit_manatarms.png", "dir_spear": "assets/raw/unit_spearman.png",
  "dir_archer": "assets/raw/unit_archer.png", "dir_knight": "assets/raw/unit_knight.png", "dir_scout": "assets/raw/unit_scout.png",
})

BATCHES5 = {
 "landscape": [
  ("ui_menu_bg_land", "Epic painterly WIDESCREEN LANDSCAPE (16:9 horizontal) key art for a medieval real-time strategy game main menu, in the style of "
   "Age of Empires II Definitive Edition cover art: on the LEFT third a knight on horseback holding a royal blue banner on a rocky hill, "
   "the CENTER and RIGHT show a wide medieval valley with a stone castle, a river, villages, farms and forests at golden hour with dramatic clouds. "
   "Keep the left-center sky area calm for a title, and the right third slightly darker for menu buttons. No text, no logos."),
  ("ui_loading_land", "Painterly WIDESCREEN LANDSCAPE (16:9 horizontal) scene in the style of Age of Empires II Definitive Edition: two medieval armies, "
   "royal blue and crimson red banners, facing each other across a misty river valley at dawn, castles on distant hills. No text, no logos."),
 ],
}
BATCHES.update(BATCHES5)

# ---- wave 6: real 4-frame animation strips (one generation per strip => consistent character) ----
SHEET = ("Painterly hand-painted game art in the style of Age of Empires II Definitive Edition, isometric 3/4 top-down RTS view. "
         "A WIDE HORIZONTAL SPRITE SHEET: exactly 4 animation frames of the SAME character as the attached reference image "
         "(same face, clothes, colors, proportions, scale), laid out left-to-right in 4 equal columns with clear empty space between frames. "
         "The animation is IN PLACE: the character's feet stay at the same spot and on the same ground baseline in every frame, "
         "same size in every frame, full body always visible and never cut off. Fully transparent background (PNG alpha). "
         "No text, no numbers, no labels, no frame borders, no ground, no shadows on the background. ")
SE = "The character faces SOUTH-EAST (toward the viewer's bottom-right) like the reference. "
NE = "The character is seen FROM BEHIND facing NORTH-EAST (away from the viewer, toward the top-right). "
MAN = "Reference: the peasant man villager. "
WOMAN = "Reference: the peasant woman villager. "

BATCHES6 = {
 "anim_m1": [
  ("sheet_vil_m_walk", SHEET + SE + MAN + "Walk cycle: frame 1 contact left foot forward, frame 2 passing, frame 3 contact right foot forward, frame 4 passing. Holding the axe in one hand."),
  ("sheet_vil_m_walkback", SHEET + NE + MAN + "Walk cycle seen from behind: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing."),
  ("sheet_vil_m_chop", SHEET + SE + MAN + "Chopping wood with a woodcutter axe, facing a tree just off-frame to the right: frame 1 axe raised high behind the shoulder, frame 2 swinging forward, frame 3 axe striking horizontally at waist height to the right, frame 4 recoil pulling the axe back."),
  ("sheet_vil_m_mine", SHEET + SE + MAN + "Mining rock with an iron pickaxe: frame 1 pickaxe raised overhead, frame 2 swinging down, frame 3 pickaxe striking the ground in front-right, frame 4 lifting it back up."),
 ],
 "anim_m2": [
  ("sheet_vil_m_build", SHEET + SE + MAN + "Building with a wooden mallet, kneeling on one knee: frame 1 mallet raised, frame 2 swinging, frame 3 mallet striking a plank on the ground in front, frame 4 lifting again."),
  ("sheet_vil_m_farm", SHEET + SE + MAN + "Farming with a long wooden hoe: frame 1 hoe raised, frame 2 swinging down, frame 3 hoe blade in the soil in front, frame 4 pulling the hoe back."),
  ("sheet_vil_m_carrywood", SHEET + SE + MAN + "Walk cycle while carrying a big bundle of chopped logs on his shoulder: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing."),
  ("sheet_vil_m_carrysack", SHEET + SE + MAN + "Walk cycle while carrying a heavy full cloth sack over his shoulder: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing."),
 ],
 "anim_f1": [
  ("sheet_vil_f_walk", SHEET + SE + WOMAN + "Walk cycle: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing. Basket on her arm."),
  ("sheet_vil_f_walkback", SHEET + NE + WOMAN + "Walk cycle seen from behind: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing."),
  ("sheet_vil_f_chop", SHEET + SE + WOMAN + "Chopping wood with a woodcutter axe, facing a tree just off-frame to the right: frame 1 axe raised high, frame 2 swinging forward, frame 3 axe striking horizontally to the right, frame 4 recoil."),
  ("sheet_vil_f_mine", SHEET + SE + WOMAN + "Mining rock with an iron pickaxe: frame 1 pickaxe raised overhead, frame 2 swinging down, frame 3 pickaxe striking the ground in front-right, frame 4 lifting it back up."),
 ],
 "anim_f2": [
  ("sheet_vil_f_build", SHEET + SE + WOMAN + "Building with a wooden mallet, bending forward: frame 1 mallet raised, frame 2 swinging, frame 3 striking a plank in front, frame 4 lifting again."),
  ("sheet_vil_f_farm", SHEET + SE + WOMAN + "Harvesting wheat with a sickle: frame 1 reaching forward to grab stalks, frame 2 sickle drawn back, frame 3 cutting, frame 4 lifting a small bundle of wheat."),
  ("sheet_vil_f_forage", SHEET + SE + WOMAN + "Picking red berries from a bush just off-frame to the right into her wicker basket: frame 1 reaching right, frame 2 picking, frame 3 bringing hand to basket, frame 4 dropping berries into the basket."),
  ("sheet_vil_f_carry", SHEET + SE + WOMAN + "Walk cycle while carrying a full wicker basket on her hip: frame 1 left foot forward, frame 2 passing, frame 3 right foot forward, frame 4 passing."),
 ],
}
BATCHES.update(BATCHES6)
REFS.update({"anim_m1": "assets/raw/unit_villager_m.png", "anim_m2": "assets/raw/unit_villager_m.png",
             "anim_f1": "assets/raw/unit_villager_f.png", "anim_f2": "assets/raw/unit_villager_f.png"})

# ---- wave 7: civilization unique units + emblems ----
EMBLEM = ("Game UI emblem icon, painterly Age of Empires II Definitive Edition style: a round heraldic shield/medallion with a gold rim, "
          "centered, strong silhouette, rich colors, fully transparent background (PNG alpha), no text, no letters. ")
BATCHES7 = {
 "civ_units": [
  ("unit_janissary", UNIT + "Ottoman JANISSARY gunpowder infantryman: tall white felt börk hat, ROYAL BLUE kaftan with gold trim, long matchlock musket held at the ready, curved yatagan sword on the belt."),
  ("unit_cataphract", UNIT + "Byzantine CATAPHRACT heavy cavalry: rider and horse both covered in lamellar scale armor, rider with conical helmet and chainmail face veil, long kontos lance, ROYAL BLUE cloak and horse cloth. Horse and rider fully visible."),
  ("unit_paladin", UNIT + "Frankish PALADIN elite heavy knight on a big white warhorse: ornate gleaming plate armor with gold details, crowned great helm, longsword, ROYAL BLUE caparison with gold fleur-de-lis. Horse and rider fully visible."),
  ("unit_mangudai", UNIT + "Mongol MANGUDAI horse archer on a small sturdy steppe horse: fur-trimmed pointed hat, lamellar leather armor, ROYAL BLUE deel robe, composite recurve bow in hand, quiver. Horse and rider fully visible."),
 ],
 "civ_units2": [
  ("unit_janissary_atk", UNIT + "Same Ottoman JANISSARY (white börk hat, royal blue kaftan): FIRING the matchlock musket forward-right, bright muzzle flash and a puff of white gunsmoke at the barrel."),
  ("unit_cataphract_atk", UNIT + "Same Byzantine CATAPHRACT (fully scale-armored horse and rider, royal blue cloak): attacking, thrusting the long lance forward-right while the horse lunges."),
  ("unit_paladin_atk", UNIT + "Same Frankish PALADIN on white warhorse (gold-trimmed plate, crowned great helm, royal blue caparison): attacking, longsword raised in a mighty overhead strike."),
  ("unit_mangudai_atk", UNIT + "Same Mongol MANGUDAI horse archer (fur hat, royal blue deel): bow fully drawn aiming forward-right while riding at a gallop."),
 ],
 "civ_icons": [
  ("icon_civ_turks", EMBLEM + "TURKS: a crimson red shield with a golden crescent moon and a golden eight-pointed star, crossed scimitars behind."),
  ("icon_civ_byzantines", EMBLEM + "BYZANTINES: a deep imperial purple shield with a golden double-headed eagle."),
  ("icon_civ_franks", EMBLEM + "FRANKS: a royal blue shield with three golden fleurs-de-lis and a small crown on top."),
  ("icon_civ_mongols", EMBLEM + "MONGOLS: a sky-blue and white shield with a galloping horse and a drawn composite bow."),
 ],
}
BATCHES.update(BATCHES7)
REFS.update({"civ_units2": ["assets/raw/unit_janissary.png", "assets/raw/unit_cataphract.png", "assets/raw/unit_paladin.png", "assets/raw/unit_mangudai.png"]})


def prompt_for(items):
    lines = ["You are an asset generator. For EACH item below, in order: use your image generation tool to create the image described, "
             "then IMMEDIATELY copy the generated PNG (saved under ~/.codex/generated_images/) into the current working directory at "
             "`assets/raw/<name>.png` with a shell copy command before moving to the next item. Generate each image separately (one image per item). "
             "IMPORTANT: other agents generate images in parallel, so NEVER pick 'the newest file'; copy exactly the file path your own image tool call produced (it lives in YOUR session folder). "
             "If a reference image is attached, use it only as the character/style reference. "
             "Do not write code. Do not ask questions. If one fails, retry once and continue. At the end list the files created.", ""]
    for name, desc in items:
        lines.append(f"### name: {name}\n{desc}\n")
    return "\n".join(lines)


def run(batch):
    items = [(n, d) for n, d in BATCHES[batch] if not os.path.exists(os.path.join(ROOT, "assets", "raw", n + ".png"))]
    if not items:
        return batch, "skip"
    task = os.path.join(SP, f"img_{batch}.md")
    with open(task, "w", encoding="utf-8") as f:
        f.write(prompt_for(items))
    out = os.path.join(SP, f"img_{batch}_out.md")
    with open(os.path.join(SP, f"img_{batch}_log.txt"), "w", encoding="utf-8") as log, open(task, "rb") as stdin:
        # prompt "-" => read instructions from stdin (avoids Windows command-line length/quoting issues)
        refs = REFS.get(batch, [])
        refs = [refs] if isinstance(refs, str) else [r for r in refs if os.path.exists(os.path.join(ROOT, r))]
        ref = [a for r in refs for a in ("-i", r)]
        r = subprocess.run(["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-m", "gpt-5.6-luna",
                            "-c", 'model_reasoning_effort="low"', *ref, "-o", out, "-"],
                           cwd=ROOT, stdin=stdin, stdout=log, stderr=subprocess.STDOUT, shell=(os.name == "nt"))
    return batch, r.returncode


if __name__ == "__main__":
    names = sys.argv[1:] or list(BATCHES)
    with cf.ThreadPoolExecutor(len(names)) as ex:
        for b, rc in ex.map(run, names):
            print(b, rc, flush=True)
