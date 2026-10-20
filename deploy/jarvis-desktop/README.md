# Laptop-Jarvis (ZekerFlex)

A Dutch voice assistant for the owner's laptop, connected to ZekerFlex and the AI-teams.
It replaces the earlier JARVIS-main tutorial script. That script was not a model: it was a few fixed English voice commands, and its ChatGPT part was fake.

## What he can do

| You say | What happens |
|---|---|
| "Jarvis, geef de briefing" | Summary of open jobs, new users, hours waiting, AI-team proposals, outages, visitors, to-dos |
| "Jarvis, wat hebben de agenten gevonden?" | Findings of the AI-teams from the last 24 hours |
| "Jarvis, welke voorstellen staan er?" | Reads out the open proposals, numbered |
| "Jarvis, voer voorstel 2 uit" | Repeats the proposal and only executes it after you say **"ja"**. This is recorded in the audit trail under your name. |
| "Jarvis, zijn er storingen?" | Outages from the last 3 days |
| "Jarvis, wie is er op de site?" | Live visitors, and how many have no account |
| "Jarvis, hoeveel klussen staan er open?" / "…uren" / "…nieuwe aanmeldingen" | Live figures |
| "Jarvis, wat moet ik nog doen?" | Your owner to-do list from ZekerFlex |
| "Jarvis, hoe laat is het" / "welke datum" | Answered locally |
| "Jarvis, nieuwe taak bel de accountant" / "lees mijn taken" / "wis mijn taken" | Your own task list, kept on the laptop (`taken.txt`) |
| "Jarvis, open admin / voorstellen / analytics / youtube" | Opens the page in your browser |
| "Jarvis, stop" | Closes Jarvis |

Free questions ("hoe kan ik meer bedrijven binnenhalen?") also work, but only once ZekerFlex has a language model connected (see the AI node in `deploy/ai-node`). Without a model, Jarvis says what he can do instead.

## Installing (one time)

1. Install **Python 3.11 or newer** from python.org. Tick **"Add python.exe to PATH"** during setup.
2. Copy this folder to your laptop, for example to `Documenten\jarvis-desktop`.
3. Double-click **`installeren.bat`**.
4. In ZekerFlex, go to **Admin → Laptop-Jarvis → "Laptop-Jarvis koppelen"**. Copy the two lines into the file **`.env`** in this folder. You can open it with Notepad.
5. Double-click **`start-jarvis.bat`**. Jarvis greets you and reads out the briefing.

- **No microphone, or it doesn't work:** use **`start-jarvis-tekst.bat`** and type your questions.
- **Dutch voice:** Windows Settings → Time & language → Speech → add a voice → *Nederlands*. Without it, Jarvis speaks with the default voice.

## Privacy and safety

- **Speech recognition:** this uses the free Google speech service, so what you say after "Jarvis" goes to Google to be turned into text. The rest goes directly to your own ZekerFlex.
- **Key:** your personal key gives no access to user data such as passports or bank details. It only provides the figures and the AI-team proposals.
- **Lost or compromised laptop:** use "Ontkoppelen" in Admin → Laptop-Jarvis, and the key stops working immediately.
