---
slug: find-my-photos-athlete
display_name: "Athlete finding their own photos at a grass-volleyball tournament"
grounded_in: research/observations/find-my-photos-demand-signal.md
jtbd:
  - surface: search
    job: "Find my photos by jersey or colour"
    time_budget: "Under 2 minutes — often courtside, right after the match"
    acceptance: "Given my jersey number or team colour, search returns my photos ranked by relevance, without me browsing thousands of frames or knowing which album I'm in."
  - surface: photo
    job: "Open and download my photo"
    time_budget: "Under 30 seconds per photo"
    acceptance: "Tapping a photo opens its detail page (never a 404), with a working download and copy-link, even when an image_key recurs across albums."
  - surface: album
    job: "Browse my event album"
    time_budget: "Under a minute"
    acceptance: "The event is discoverable by name, date, and sport; its album page renders all of its photos."
---

# Persona — find-my-photos athlete

The athlete (or their family) Nino photographs at the Let's Pepper Open grass-triples series. They are **not** a buyer, an organizer, or a coach — they want to see and keep photos of **themselves**.

Grounded in a real, recurring observation: players ask Nino mid-match, *"did you get that?"* (see `research/observations/find-my-photos-demand-signal.md`). This is the operator-witnessed demand signal, not an invented persona.

## How they actually find themselves

By **jersey number** and **team colour** — the two things they know about their own appearance in a frame. Never by name (no per-person naming) and never by face (no face recognition). Grass volleyball is colour-dominant: many frames have no readable number, so colour is a first-class signal. This is exactly what `photo_jersey_sightings` serves (46,702 sightings, 26,358 with a number).

## Context that shapes the JTBDs

- **Time-poor, mobile, courtside.** The job happens in the minutes around a match, on a phone. Long browsing or account creation kills it.
- **They know their event.** Entry is event discovery (name/date/sport), not a stock-photo search.
- **The payoff is retrieval, not purchase.** Operator-funded goodwill — no store, no prints.

## Out of scope (named to prevent drift)

The event *organizer* (standings/brackets/rankings) is Rally HQ's pilot on the same events. The coach building reels and the print buyer are not this persona. See `blueprint.yml § pilot_profile.out_of_scope_pilots`.
