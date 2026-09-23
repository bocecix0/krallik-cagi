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
        ref = ["-i", REFS[batch]] if batch in REFS else []
        r = subprocess.run(["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-m", "gpt-5.6-luna",
                            "-c", 'model_reasoning_effort="low"', *ref, "-o", out, "-"],
                           cwd=ROOT, stdin=stdin, stdout=log, stderr=subprocess.STDOUT, shell=(os.name == "nt"))
    return batch, r.returncode


if __name__ == "__main__":
    names = sys.argv[1:] or list(BATCHES)
    with cf.ThreadPoolExecutor(len(names)) as ex:
        for b, rc in ex.map(run, names):
            print(b, rc, flush=True)
