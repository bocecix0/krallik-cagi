"""Copies codex-generated images into assets/raw with correct names.
Parallel codex sessions picked 'latest file' and mislabeled outputs, so we map
each session folder (mtime order) to its batch item list explicitly."""
import os, glob, shutil

GEN = os.path.expanduser("~/.codex/generated_images")
RAW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "raw")

# folder suffix -> list of names by index (None = skip, e.g. retries)
MAP = {
    "7d0-7f43-a4ec-b5ceeeacc953": ["unit_villager_f", "unit_militia", "unit_manatarms", "unit_spearman", "unit_archer",
                                   "unit_skirmisher", "unit_scout", "unit_knight", "unit_monk", "unit_villager_carry"],
    "86c-7290-ab2f-6869d59c9593": ["bld_town_center", "bld_house", "bld_lumber_camp", "bld_mill", "bld_mining_camp",
                                   "bld_farm", "bld_foundation", "bld_rubble"],
    "844-7af2-8229-b7942ffe08a9": ["bld_barracks", "bld_archery_range", "bld_stable", "bld_blacksmith", "bld_market",
                                   "bld_monastery", "bld_castle", "bld_watch_tower", "bld_palisade"],
    "7d2-7732-9c85-9ceb80f123b7": ["nat_tree_oak", "nat_tree_oak2", "nat_tree_pine", "nat_tree_birch", "nat_stump",
                                   "nat_berry_bush", "nat_gold_mine", "nat_stone_mine", "nat_sheep", "nat_deer",
                                   "nat_boar", "nat_rock"],
    "7a0-70d1-9b61-4e78e2f5d073": [None, "tex_grass", "tex_grass2", "tex_dirt", "tex_sand", "tex_water",
                                   "tex_water_deep", "tex_forest", "ui_menu_bg"],
    "7e7-73a2-8c88-344e71ee29df": [None, None, "icon_food", "icon_wood", "icon_gold", "icon_stone", "icon_pop",
                                   "icon_age1", "icon_age2", "icon_age3", "icon_age4", "icon_hammer", "icon_sword",
                                   "icon_research"],
}

for folder in os.listdir(GEN):
    names = next((v for k, v in MAP.items() if folder.endswith(k)), None)
    if not names:
        continue
    files = sorted(glob.glob(os.path.join(GEN, folder, "*.png")), key=os.path.getmtime)
    for i, f in enumerate(files):
        if i < len(names) and names[i]:
            shutil.copyfile(f, os.path.join(RAW, names[i] + ".png"))
            print(names[i], "<-", os.path.basename(f))
