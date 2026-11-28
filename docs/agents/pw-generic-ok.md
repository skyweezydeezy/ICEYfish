# Loyalty lines that read ok through the generic fallback (teach-ajani-sleeper-agent follow-up)

Found 2026-11-28 by Card teaching 13 with a throwaway probe (not committed). The loyalty parse in sim.js (`if ((m = line.match(/^([+−\-–]?)(\d+|X): (.*)$/)))`) tries about 150 specific rules in a ternary chain and ends with `: parseEffects(pwt)`; its status is then `r.fx.length ? "ok" : r.neutral ? "neutral" : "ignored"`, so a line is ok as soon as ANY effect is parsed from ANY of its sentences. Sentences the parser did not read are dropped without a trace, and the card shows as full in the set data.

Counts over the planeswalker cards in goldfish/static/data/sets (first printings only): 330 loyalty abilities; 277 reached the generic fallback; 200 of those read ok; **48 abilities on 42 cards have fewer parsed effects than sentences** (a lower bound for partial reads, e.g. a second sentence or an "if"/"unless" clause dropped). Ajani, Sleeper Agent was one (fixed); the other 41:

- Chandra, Awakened Inferno
- Chandra, Flamecaller
- ~~Chandra, Torch of Defiance~~ (taught, issue #205)
- Commodore Guff
- Dihada, Binder of Wills
- Domri, Anarch of Bolas
- Elspeth, Storm Slayer
- Estrid, the Masked
- Jace, Mirror Mage
- Jaya Ballard
- Kaito, Bane of Nightmares
- Liliana, Death's Majesty
- Lord Windgrace
- Minsc & Boo, Timeless Heroes
- Nahiri, the Harbinger
- Nahiri, the Lithomancer
- Narset of the Ancient Way
- Narset, Parter of Veils
- Nicol Bolas, Dragon-God
- Ob Nixilis of the Black Oath
- Professor Onyx
- Ral Zarek
- Ral, Crackling Wit
- Ral, Storm Conduit
- Saheeli, the Gifted
- Sorin, Imperious Bloodlord
- Tamiyo, Field Researcher
- Teferi, Temporal Archmage
- Teferi, Who Slows the Sunset
- Tevesh Szat, Doom of Fools
- Tezzeret, Artifice Master
- Tezzeret, Betrayer of Flesh
- Tezzeret, Cruel Captain
- Tezzeret, Master of the Bridge
- The Aetherspark
- Tyvar Kell
- Ugin, Eye of the Storms
- Ugin, the Ineffable
- Vivien Reid
- Will Kenrith
- Wrenn and Seven

A fix is to make the fallback mark a line partial/ignored unless every sentence is consumed (or to require a specific rule per line), then teach the lines it exposes.
