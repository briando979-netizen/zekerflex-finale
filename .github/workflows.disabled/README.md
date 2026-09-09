# Waarom staan deze workflows hier, en niet in `.github/workflows/`?

Het GitHub-account waar deze repo op staat (`briando979-netizen`) heeft een
billing-lock. GitHub Actions weigert daardoor **elke** job te starten, voor
elke workflow, ongeacht de inhoud — te zien aan de annotatie
"The job was not started because your account is locked due to a billing
issue." op elke run.

Zolang dat zo is, hebben deze workflows hier in `.github/workflows/` alleen
maar zin om bij elke push een mislukking-melding te sturen voor iets dat
sowieso nooit kan slagen. Vandaar dat ze hierheen zijn verplaatst: GitHub
triggert alleen workflows die letterlijk in `.github/workflows/` staan.

**Om ze weer aan te zetten** (bijv. na het oplossen van de billing-lock,
of op een ander account): verplaats de bestanden terug naar
`.github/workflows/`.

Let op bij `ci.yml`/`codeql.yml`: die twee testen de app zelf (typecheck,
lint, tests, prisma migrate deploy, build) en zijn nog steeds inhoudelijk
correct — bevestigd door dezelfde stappen lokaal te draaien. `deploy.yml`,
`docker-publish.yml` en `terraform.yml` gaan uit van een Kubernetes/AWS-
deployment die niet overeenkomt met hoe deze app daadwerkelijk draait
(Vercel + Neon + Upstash) — die zouden sowieso los daarvan nooit slagen en
verdienen een aparte beslissing (bijwerken naar de echte infra, of
verwijderen) voordat ze weer aan gaan.
