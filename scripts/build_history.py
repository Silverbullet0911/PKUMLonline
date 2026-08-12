# -*- coding: utf-8 -*-
"""Parse past-season Excel files into player history JSON per design schema.

Usage: .venv/Scripts/python.exe scripts/build_history.py
"""
import pandas as pd
import glob, json, os, re

BASE = os.path.join(os.path.dirname(__file__), "..", "往届成绩excel")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "players_history.json")

# 各赛季队伍最终名次（用户提供）
TEAM_RANK = {
    "23-24": {"格斗": 1, "樱花": 2, "海盗": 3, "凤凰": 4, "AB": 5, "赤坂": 6, "雷电": 7, "火山": 8},
    "24-25": {"野兽": 1, "樱花": 2, "格斗": 3, "凤凰": 4, "雷电": 5, "AB": 6, "海盗": 7, "赤坂": 8, "火山": 9},
    "25-26": {"海盗": 1, "格斗": 2, "樱花": 3, "火山": 4, "野兽": 5, "地球": 6, "凤凰": 7, "雷电": 8, "赤坂": 9, "AB": 10},
}
CHAMPION = {"23-24": "格斗", "24-25": "野兽", "25-26": "海盗"}

# 跨表姓名归一化：源名 -> 规范名
ALIASES = {
    "luckyyoung": "luckyoung",
    "Lettucece": "LettuceIce",
    "江州司马": "江州司马平安否",
    "lserlohn": "Iserlohn",
    "bbbbbhxb": "bbbbhxb",
}

def norm(name):
    return ALIASES.get(name, name)

def parse_pct(s):
    """'90.00%' -> 90.0 ; NaN -> None"""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    t = str(s).strip().replace("%", "")
    try:
        return float(t)
    except ValueError:
        return None

def parse_num(s):
    """'77,700' / 77700 -> 77700.0 ; NaN -> None"""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    t = str(s).strip().replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None

def read_stage(path):
    df = pd.read_excel(path, header=None)
    rows = df.values.tolist()
    hdr = rows[0]
    data = [r for r in rows[1:] if r[0] is not None and str(r[0]).strip()]
    return hdr, data

def team_from_rows(rows, name):
    for r in rows:
        if norm(str(r[1]).strip()) == name:
            return str(r[0]).strip()
    return None

# 收集每个赛季每个阶段的数据
seasons = {}  # season -> {stage: {"header": [...], "rows": [[team,name,val...],...]}}
for f in sorted(glob.glob(os.path.join(BASE, "*.xlsx"))):
    base = os.path.basename(f)
    season = base[:5]
    stage = "常规赛" if "常规赛" in base else ("半决赛" if "半决赛" in base else "决赛")
    hdr, data = read_stage(f)
    seasons.setdefault(season, {})[stage] = {"header": hdr, "rows": data}

# 汇总玩家数据
players = {}  # norm_name -> {"honors": set, "history": {season: {...}}}
for season in sorted(seasons.keys()):
    stages = seasons[season]
    reg = stages.get("常规赛", {})
    semi = stages.get("半决赛", {})
    fin = stages.get("决赛", {})

    # 常规赛表：name -> {team, points, max, avoid, awards}
    reg_map = {}
    for r in reg.get("rows", []):
        team, name = norm(str(r[0]).strip()), norm(str(r[1]).strip())
        rec = {
            "team": team,
            "points": parse_num(r[2]),
            "avoid": parse_pct(r[3]) if len(r) > 3 else None,
            "max": parse_num(r[4]) if len(r) > 4 else None,
            "awards": str(r[5]).strip() if len(r) > 5 and pd.notna(r[5]) else "",
        }
        reg_map[name] = rec
    semi_map = {norm(str(r[1]).strip()): parse_num(r[2]) for r in semi.get("rows", [])}
    fin_map = {norm(str(r[1]).strip()): parse_num(r[2]) for r in fin.get("rows", [])}

    team_rank = TEAM_RANK[season]
    champion = CHAMPION[season]

    # 该赛季所有出现过的选手（三表并集）
    all_names = set(reg_map) | set(semi_map) | set(fin_map)
    for name in all_names:
        p = players.setdefault(name, {"personalHonors": [], "teamHonors": [], "history": {}})
        reg = reg_map.get(name)
        team = (reg["team"] if reg
                else team_from_rows(semi.get("rows", []), name)
                or team_from_rows(fin.get("rows", []), name))
        hist = {
            "year": season,
            "team": team,
            "regularPoints": reg["points"] if reg else None,
            "semifinalPoints": semi_map.get(name),
            "finalPoints": fin_map.get(name),
            "regularMaxScore": reg["max"] if reg else None,
            "regularAvoidRate": reg["avoid"] if reg else None,
            "teamRank": team_rank.get(team),
        }
        p["history"][season] = hist
        # 个人赏
        if reg and reg["awards"]:
            for award in re.split(r"[、,，/]", reg["awards"]):
                award = award.strip()
                if award:
                    p["personalHonors"].append(f"{season}赛季{award}")
        # 队伍赏（夺冠）
        if team == champion:
            p["teamHonors"].append(f"{season}赛季冠军")

# 输出
os.makedirs(os.path.dirname(OUT), exist_ok=True)
players_list = []
for name, p in players.items():
    # 个人赏 / 队伍赏分开，各自去重并排序
    personal = sorted(set(p["personalHonors"]))
    team = sorted(set(p["teamHonors"]))
    # history 按年份排序
    hist = [p["history"][y] for y in sorted(p["history"].keys())]
    players_list.append({"name": name, "personalHonors": personal, "teamHonors": team, "history": hist})

players_list.sort(key=lambda x: x["name"])
with open(OUT, "w", encoding="utf-8") as fp:
    json.dump({"players": players_list}, fp, ensure_ascii=False, indent=1)

print(f"OK -> {OUT}  ({len(players_list)} players)")
