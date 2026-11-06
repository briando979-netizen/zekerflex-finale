# Roosterplanner (OR-Tools)

De werkgever-omgeving heeft een roosterplanner (Werkgever → Roosterplanner,
`lib/planner`). Die rekent een week vol open diensten uit: welke kracht op
welke dienst, alle plekken gevuld, laagste kosten, binnen de regels
(certificaten, geen overlap, 11 uur rust, maximaal 60 uur per week, reisafstand,
eigen grenzen van de kracht).

Standaard rekent de app dat zelf uit (`lib/planner/solver.ts`: gretig +
ruilen). Deze map bevat de exacte variant met **Google OR-Tools (CP-SAT)** als
losse dienst. Zelfde invoer, zelfde antwoord; bij grote weken (honderden
diensten) vindt CP-SAT een beter optimum.

## Aanzetten op de VPS

```sh
cd ~/zekerflex
sudo docker compose -f docker-compose.vps.yml --env-file .env.production --profile planner up -d --build planner
```

Zet daarna in `.env.production`:

```
PLANNER_URL=http://planner:8090
```

en herstart de app (`up -d app`). Zonder `PLANNER_URL`, of als de dienst niet
antwoordt, gebruikt de app de ingebouwde oplosser; de schermen merken daar
niets van (Admin → Systeem toont welke rekent).

## Koppeling

- `POST /solve` met `{diensten, krachten, kandidaten, instellingen}`;
  de app stuurt alleen haalbare kandidaten (certificaten, afstand, voorkeuren
  zijn al gefilterd) met een score (lager = beter).
- `GET /health` → `{ok: true}`.

Geen database, geen geheimen, geen internet nodig. Geheugen ±150 MB.
