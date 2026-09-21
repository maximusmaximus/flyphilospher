#!/usr/bin/env python3
"""Extract a connected MaleCNS v1.0 subgraph for flyphilospher.

Start from identified motor and command neurons, then walk upstream through
the official weight table so every kept cell is on a measured path to the body.

Source: gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/
Licence: CC-BY. HHMI Janelia, Google Research, University of Cambridge, MRC LMB.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather

ANN = Path("/tmp/malecns/body-annotations-male-cns-v1.0-minconf-0.5.feather")
NT = Path("/tmp/malecns/body-neurotransmitters-male-cns-v1.0.feather")
WTS = Path("/tmp/malecns/connectome-weights-male-cns-v1.0-minconf-0.5.feather")
OUT = Path("/workspace/public/connectome/malecns-core.json")

ROLE_NAMES = [
    "vis_on",
    "vis_off",
    "motion_a",
    "motion_b",
    "motion_c",
    "motion_d",
    "looming",
    "small_object",
    "tracker",
    "giant_fiber",
    "flight_steer",
    "walk_fwd",
    "walk_back",
    "wing_power",
    "wing_steer",
    "haltere",
    "neck",
    "leg",
    "kenyon",
    "mbon",
    "dopamine",
    "wind",
    "other",
]
ROLE = {n: i for i, n in enumerate(ROLE_NAMES)}

NT_SIGN = {
    "acetylcholine": 1.0,
    "gaba": -1.0,
    "glutamate": -1.0,
    "histamine": -1.0,
    "dopamine": 0.35,
    "serotonin": 0.25,
    "octopamine": 0.4,
    "tyramine": 0.2,
}

KEEP_PREFIX = (
    "L1",
    "L2",
    "T4",
    "T5",
    "LC4",
    "LC6",
    "LC10",
    "LC11",
    "LC16",
    "DNp01",
    "DNg02",
    "DNa01",
    "DNa02",
    "DNb01",
    "DNg12",
    "DNp17",
    "DNp02",
    "KC",
    "MBON",
    "PPL101",
    "JO",
    "DLMn",
    "DVMn",
    "b1 MN",
)
KEEP_SUPER = {
    "descending_neuron",
    "visual_projection",
    "vnc_motor",
    "ascending_neuron",
    "visual_centrifugal",
}


def parse_xyz(val):
    if val is None:
        return None
    try:
        if isinstance(val, float) and math.isnan(val):
            return None
    except TypeError:
        pass
    arr = np.asarray(val, dtype=np.float64).ravel()
    if arr.size < 3 or not np.all(np.isfinite(arr[:3])):
        return None
    return arr[:3]


def take_stratified(df, n):
    if n is None or len(df) <= n:
        return df
    df = df.sort_values("bodyId")
    sides = df["somaSide"].fillna("C")
    out = []
    remaining = n
    groups = list(df.groupby(sides, sort=True))
    per = max(1, n // max(1, len(groups)))
    for _, g in groups:
        k = min(len(g), per, remaining)
        if k <= 0:
            continue
        idx = np.linspace(0, len(g) - 1, k).astype(int)
        out.append(g.iloc[idx])
        remaining -= k
    if remaining > 0:
        used = set()
        for o in out:
            used.update(int(x) for x in o["bodyId"].to_numpy())
        rest = df[~df["bodyId"].isin(used)]
        if len(rest):
            idx = np.linspace(0, len(rest) - 1, min(remaining, len(rest))).astype(int)
            out.append(rest.iloc[idx])
    return pd.concat(out, ignore_index=True) if out else df.iloc[0:0]


def pick_types(tr, exact, n=None):
    return take_stratified(tr[tr["type"].isin(exact)], n)


def pick_prefix(tr, prefixes, n=None):
    types = tr["type"].astype(str)
    mask = False
    for p in prefixes:
        mask = mask | types.str.startswith(p)
    return take_stratified(tr[mask], n)


def pick_subclass(tr, supercls, subclass, n=None):
    m = tr[(tr["superclass"] == supercls) & (tr["subclass"] == subclass)]
    return take_stratified(m, n)


def interesting(typ, superclass):
    t = str(typ)
    if any(t.startswith(p) or t == p for p in KEEP_PREFIX):
        return True
    if superclass in KEEP_SUPER:
        return True
    return False


def assign_role(typ, superclass, subclass):
    t = str(typ)
    sc = str(subclass) if subclass is not None else ""
    if t == "L1":
        return ROLE["vis_on"]
    if t == "L2":
        return ROLE["vis_off"]
    if t.startswith("T4a") or t.startswith("T5a"):
        return ROLE["motion_a"]
    if t.startswith("T4b") or t.startswith("T5b"):
        return ROLE["motion_b"]
    if t.startswith("T4c") or t.startswith("T5c"):
        return ROLE["motion_c"]
    if t.startswith("T4d") or t.startswith("T5d"):
        return ROLE["motion_d"]
    if t in ("LC4", "LC6", "LC16") or t.startswith("LC4") or t.startswith("LC6"):
        return ROLE["looming"]
    if t.startswith("LC11"):
        return ROLE["small_object"]
    if t.startswith("LC10"):
        return ROLE["tracker"]
    if t in ("DNp17", "DNp02"):
        return ROLE["looming"]
    if t == "DNp01":
        return ROLE["giant_fiber"]
    if t.startswith("DNg02"):
        return ROLE["flight_steer"]
    if t in ("DNa01", "DNa02"):
        return ROLE["walk_fwd"]
    if t == "DNb01":
        return ROLE["walk_back"]
    if t.startswith("DLMn") or t.startswith("DVMn"):
        return ROLE["wing_power"]
    if t == "b1 MN" or sc == "wm":
        return ROLE["wing_steer"]
    if sc == "hm":
        return ROLE["haltere"]
    if sc == "nm":
        return ROLE["neck"]
    if t.startswith("KC"):
        return ROLE["kenyon"]
    if t.startswith("MBON"):
        return ROLE["mbon"]
    if t == "PPL101":
        return ROLE["dopamine"]
    if t.startswith("JO"):
        return ROLE["wind"]
    if sc in ("fl", "ml", "hl") or superclass == "vnc_motor":
        return ROLE["leg"]
    return ROLE["other"]


def side_code(s):
    if s == "L":
        return 1
    if s == "R":
        return 2
    return 0


def scan_weights(wanted: set[int], min_w: int, mode: str):
    """mode: 'into' keeps edges whose post is wanted; 'within' keeps both ends wanted."""
    src = pa.memory_map(str(WTS), "r")
    reader = pa.ipc.open_file(src)
    edges = []
    for b in range(reader.num_record_batches):
        batch = reader.get_batch(b)
        pre = batch.column(0).to_numpy()
        post = batch.column(1).to_numpy()
        w = batch.column(2).to_numpy()
        if mode == "into":
            for a, c, ww in zip(pre, post, w):
                if ww < min_w:
                    continue
                if int(c) in wanted:
                    edges.append((int(a), int(c), int(ww)))
        else:
            for a, c, ww in zip(pre, post, w):
                if ww < min_w:
                    continue
                if int(a) in wanted and int(c) in wanted:
                    edges.append((int(a), int(c), int(ww)))
        if (b + 1) % 400 == 0:
            print(f"  {mode} batch {b+1}/{reader.num_record_batches} edges {len(edges)}")
    src.close()
    return edges


def main():
    print("loading annotations")
    ann = feather.read_table(ANN).to_pandas()
    nt = feather.read_table(NT).to_pandas()
    tr = ann[ann["status"] == "Traced"].copy()
    by_id = tr.set_index("bodyId")

    seeds = pd.concat(
        [
            pick_types(tr, ["DNp01"]),
            pick_prefix(tr, ["DNg02"]),
            pick_types(tr, ["DNa01", "DNa02", "DNb01"]),
            pick_prefix(tr, ["DNg12"], 8),
            pick_types(tr, ["DNp17"]),
            pick_subclass(tr, "vnc_motor", "wm"),
            pick_subclass(tr, "vnc_motor", "hm"),
            pick_subclass(tr, "vnc_motor", "nm"),
            pick_types(tr, ["DLMn c-f", "DLMn a, b", "DVMn 1a-c", "DVMn 2a, b", "DVMn 3a, b", "b1 MN"]),
            pick_subclass(tr, "vnc_motor", "fl", 10),
            pick_subclass(tr, "vnc_motor", "ml", 10),
            pick_subclass(tr, "vnc_motor", "hl", 10),
            pick_types(tr, ["PPL101"]),
            pick_prefix(tr, ["MBON01", "MBON05", "MBON11", "MBON12", "MBON21"]),
            pick_types(tr, ["LC4"], 18),
            pick_types(tr, ["LC6"], 18),
            pick_types(tr, ["LC11"], 18),
            pick_types(tr, ["LC10a"], 14),
            pick_types(tr, ["LC16"], 12),
            pick_types(tr, ["L1"], 16),
            pick_types(tr, ["L2"], 16),
            pick_prefix(tr, ["T4a"], 10),
            pick_prefix(tr, ["T4b"], 10),
            pick_prefix(tr, ["T4c"], 10),
            pick_prefix(tr, ["T4d"], 10),
            pick_prefix(tr, ["JO-B1"], 10),
            pick_prefix(tr, ["JO-A2"], 8),
        ],
        ignore_index=True,
    ).drop_duplicates("bodyId")
    seed_ids = set(int(x) for x in seeds["bodyId"].to_numpy())
    print("seeds", len(seed_ids))

    print("pass 1: upstream of motors/commands")
    into = scan_weights(seed_ids, min_w=8, mode="into")
    incoming = {}
    for pre, post, w in into:
        incoming.setdefault(pre, 0)
        incoming[pre] += w
    print("unique upstream", len(incoming))

    # Keep interesting upstream cells, strongest first, plus a slice of sensory types.
    ranked = sorted(incoming.items(), key=lambda kv: kv[1], reverse=True)
    extra = []
    for body, _w in ranked:
        if body in seed_ids:
            continue
        if body not in by_id.index:
            continue
        row = by_id.loc[body]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        if interesting(row["type"], row["superclass"]):
            extra.append(body)
        if len(extra) >= 360:
            break

    wanted = set(seed_ids)
    wanted.update(extra)
    print("expanded set", len(wanted))

    print("pass 2: edges within set")
    raw_edges = scan_weights(wanted, min_w=5, mode="within")
    print("raw edges", len(raw_edges))
    if len(raw_edges) > 28000:
        raw_edges.sort(key=lambda e: e[2], reverse=True)
        raw_edges = raw_edges[:28000]
        used = set()
        for a, c, _w in raw_edges:
            used.add(a)
            used.add(c)
        wanted = used | seed_ids
        print("trimmed neurons", len(wanted), "edges", len(raw_edges))

    sel = tr[tr["bodyId"].isin(wanted)].copy().sort_values("bodyId").reset_index(drop=True)
    print("final neurons", len(sel))

    nt_map = dict(zip(nt["body"].astype(np.int64), nt["consensus_nt"].astype(str)))
    ids = [int(x) for x in sel["bodyId"].to_numpy()]
    index_of = {b: i for i, b in enumerate(ids)}

    xyz = np.zeros((len(sel), 3), dtype=np.float32)
    have = np.zeros(len(sel), dtype=bool)
    for i, val in enumerate(sel["somaLocation"].to_numpy()):
        p = parse_xyz(val)
        if p is not None:
            xyz[i] = p
            have[i] = True
    if have.any():
        pts = xyz[have]
        xyz -= pts.mean(axis=0)
        scale = np.percentile(np.linalg.norm(xyz[have], axis=1), 92) or 1.0
        xyz /= scale
        xyz = xyz[:, [0, 2, 1]]
        xyz[:, 1] *= -1.0

    rng = np.random.default_rng(20260903)
    for i, row in sel.iterrows():
        if have[i]:
            continue
        role = assign_role(row["type"], row["superclass"], row["subclass"])
        side = side_code(row["somaSide"])
        sx = -0.55 if side == 1 else 0.55 if side == 2 else 0.0
        if role <= ROLE["tracker"]:
            xyz[i] = [sx * 1.2 + rng.normal(0, 0.08), rng.normal(0.15, 0.12), rng.normal(0.15, 0.08)]
        elif role in (ROLE["wing_power"], ROLE["wing_steer"], ROLE["haltere"], ROLE["neck"], ROLE["leg"]):
            xyz[i] = [sx * 0.25 + rng.normal(0, 0.08), -0.85 + rng.normal(0, 0.2), rng.normal(0, 0.08)]
        else:
            xyz[i] = [sx * 0.35 + rng.normal(0, 0.1), rng.normal(0.05, 0.15), rng.normal(0.05, 0.1)]

    types = sel["type"].astype(str).tolist()
    uniq_types = sorted(set(types))
    type_index = {t: i for i, t in enumerate(uniq_types)}
    neurons = []
    for i, row in sel.iterrows():
        typ = str(row["type"])
        nt_name = nt_map.get(int(row["bodyId"]), "acetylcholine")
        sign = NT_SIGN.get(str(nt_name).lower(), 1.0)
        neurons.append(
            {
                "id": int(row["bodyId"]),
                "t": type_index[typ],
                "r": assign_role(typ, row["superclass"], row["subclass"]),
                "s": side_code(row["somaSide"]),
                "p": round(float(sign), 3),
                "x": round(float(xyz[i, 0]), 4),
                "y": round(float(xyz[i, 1]), 4),
                "z": round(float(xyz[i, 2]), 4),
            }
        )

    edges = []
    for a, c, w in raw_edges:
        ia = index_of.get(a)
        ic = index_of.get(c)
        if ia is None or ic is None:
            continue
        edges.append([ia, ic, w])

    payload = {
        "meta": {
            "dataset": "male-cns:v1.0",
            "source": "https://male-cns.janelia.org/download/",
            "paper": "Berg et al., Cell 2026, doi:10.1016/j.cell.2026.08.015",
            "credit": "HHMI Janelia FlyEM, Google Research, University of Cambridge, MRC LMB",
            "license": "CC-BY",
            "neurons": len(neurons),
            "edges": len(edges),
            "minSynapseWeight": 5,
            "note": "Connected core of MaleCNS v1.0 grown upstream from giant fiber, DNg02, walking DNs and wing/leg/neck/haltere motor neurons using measured synapse weights.",
        },
        "roles": ROLE_NAMES,
        "types": uniq_types,
        "neurons": neurons,
        "edges": edges,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print("wrote", OUT, "bytes", OUT.stat().st_size)

    # Role census
    from collections import Counter

    c = Counter(n["r"] for n in neurons)
    for i, name in enumerate(ROLE_NAMES):
        if c[i]:
            print(f"  {name:14s} {c[i]}")


if __name__ == "__main__":
    main()
