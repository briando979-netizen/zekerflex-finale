#!/usr/bin/env python3
"""ZekerFlex roosterplanner: exacte toewijzing met Google OR-Tools (CP-SAT).

De app (lib/planner/service.ts) stuurt de haalbare kandidaten met een score
(lager = beter) en de harde regels; deze dienst kiest de combinatie die zo
veel mogelijk plekken vult tegen de laagste totale score, met:
  - hoogstens `plekken` krachten per dienst, elke kracht hooguit één keer per dienst;
  - geen twee diensten tegelijk per kracht, en minstens `rustUren` ertussen;
  - per kracht niet boven `maxWeekUren` (al ingeplande minuten tellen mee).

Draait zonder database of geheimen; alleen bereikbaar op het interne
Docker-netwerk (zie docker-compose.vps.yml, profiel `planner`).

  POST /solve   {diensten, krachten, kandidaten, instellingen} → {toewijzingen, status}
  GET  /health  → ok
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from ortools.sat.python import cp_model

MINUUT = 60_000
UUR = 60 * MINUUT
# een lege plek kost zoveel als de duurste kandidaat, zodat vullen altijd wint
STRAF_PER_PLEK_FACTOR = 3


def werk_minuten(d):
    return max(0, round((d["einde"] - d["start"]) / MINUUT) - int(d.get("pauzeMinuten", 0)))


def botst(a, b, rust_ms):
    return a["start"] < b["einde"] + rust_ms and b["start"] < a["einde"] + rust_ms


def los_op(invoer):
    diensten = {d["id"]: d for d in invoer.get("diensten", [])}
    krachten = {k["id"]: k for k in invoer.get("krachten", [])}
    kandidaten = [c for c in invoer.get("kandidaten", []) if c["dienstId"] in diensten and c["krachtId"] in krachten]
    inst = invoer.get("instellingen", {})
    max_week = int(inst.get("maxWeekUren", 60)) * 60
    rust_ms = int(inst.get("rustUren", 11)) * UUR
    if not kandidaten:
        return {"toewijzingen": [], "status": "leeg"}

    model = cp_model.CpModel()
    x = {}
    for i, c in enumerate(kandidaten):
        x[i] = model.NewBoolVar(f"x{i}")

    per_dienst = {}
    per_kracht = {}
    for i, c in enumerate(kandidaten):
        per_dienst.setdefault(c["dienstId"], []).append(i)
        per_kracht.setdefault(c["krachtId"], []).append(i)

    # plekken per dienst (+ hoeveel open blijft)
    open_vars = {}
    for did, idx in per_dienst.items():
        plekken = int(diensten[did].get("plekken", 1))
        open_var = model.NewIntVar(0, plekken, f"open_{did}")
        model.Add(sum(x[i] for i in idx) + open_var == plekken)
        open_vars[did] = open_var
    # diensten zonder kandidaat blijven helemaal open
    for did, d in diensten.items():
        if did not in per_dienst:
            open_vars[did] = int(d.get("plekken", 1))

    # per kracht: geen botsende diensten, en de weekgrens
    for kid, idx in per_kracht.items():
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                da = diensten[kandidaten[idx[a]]["dienstId"]]
                db = diensten[kandidaten[idx[b]]["dienstId"]]
                if da["id"] == db["id"] or botst(da, db, rust_ms):
                    model.AddBoolOr([x[idx[a]].Not(), x[idx[b]].Not()])
        al = int(krachten[kid].get("weekMinuten", 0))
        model.Add(sum(x[i] * werk_minuten(diensten[kandidaten[i]["dienstId"]]) for i in idx) + al <= max_week)

    duurste = max(int(c["score"]) for c in kandidaten)
    straf = duurste * STRAF_PER_PLEK_FACTOR + 1
    model.Minimize(
        sum(x[i] * int(c["score"]) for i, c in enumerate(kandidaten))
        + sum(v * straf for v in open_vars.values() if not isinstance(v, int))
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"toewijzingen": [], "status": "geen-oplossing"}
    toewijzingen = [
        {"dienstId": c["dienstId"], "krachtId": c["krachtId"]}
        for i, c in enumerate(kandidaten)
        if solver.Value(x[i]) == 1
    ]
    return {"toewijzingen": toewijzingen, "status": "optimaal" if status == cp_model.OPTIMAL else "haalbaar"}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "onbekend pad"})

    def do_POST(self):
        if self.path != "/solve":
            return self._json(404, {"error": "onbekend pad"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            invoer = json.loads(self.rfile.read(n) or b"{}")
            return self._json(200, los_op(invoer))
        except Exception as e:  # noqa: BLE001 - één fout mag de dienst niet omleggen
            return self._json(400, {"error": str(e)[:200]})

    def log_message(self, fmt, *args):  # geen verzoeklog (bevat niets, maar stil is netter)
        return


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8090), Handler).serve_forever()
