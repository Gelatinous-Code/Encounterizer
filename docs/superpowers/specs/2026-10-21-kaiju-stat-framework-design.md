# Kaiju Forge: Stat Framework Design

**Date:** 2026-10-21 · **Status:** Theory for review, no generator code yet · **Tracking:** milestone *Kaiju Forge: Stat Framework*, issue #279 · **Interactive review page** (private to the owner): https://claude.ai/artifact/VkoSe7RqfW9SS5UB4Qa2x7

## 1. Intent

DMs want to run a **kaiju**: one colossal creature the whole party fights in a titanic slugfest.
It has phases, legendary actions that reach across the map, and big moments the players remember.
Published monsters at these CRs don't feel like kaiju. Homebrewing one is guesswork: is a 300 HP
Gargantuan with a 50-damage breath fair for level 7, or a total party kill (TPK)?

Kaiju Forge is a **master formula**. You set the party and a power level, and it builds a complete
2024-rules stat block: traits, actions, a reaction, legendary actions, and a phase shift. Every
feature carries a **power rating**, so during planning the DM can see where the danger lives and
how dangerous the whole fight is. The ratings are planning information. Nobody needs them at the
table.

### Goals
- **Party + power in, kaiju out.** The inputs are party level, party size, Rank, and seed. The
  output is a complete stat block. Same inputs give the same kaiju.
- **Every feature is rated.** Damaging features say how much of the party's HP they'll take over a
  typical fight. Defensive features say how many rounds they add. The ratings add up to the
  headline numbers.
- **It's a real slugfest.** The fight is long enough to feel epic (4.5–5.5 rounds) and has a
  telegraphed climax.

### Anti-goals (failures even if the math "works")
1. **It dies too fast.** The party bursts it down or stun-locks it in two rounds.
2. **Cheap one-shots.** One unlucky roll deletes a PC before anyone can react.
3. **Too much to run.** The DM spends the fight reading the stat block.

### Non-goals (this document)
- Generator code, UI, and Battle Forecast integration. They get their own plan once this theory is
  approved.
- Swarms, multi-part "climb the beast" kaiju, and lair actions.
- Levels outside 5–10 and party sizes outside 3–6. The formula extends there, but it isn't
  calibrated there.

### Level bands
This document uses the requester's bands: **T2 = levels 5–7** and **T3 = levels 8–10**. These
are not the PHB's tiers of play (5–10, 11–16). They also don't match the Battle Forecast class
templates, which use a single `5-10` tier.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Party effective HP (eHP)** | N × average PC HP × 1.25. The extra 25% allows for healing and temporary HP. |
| **Pressure** | The kaiju's expected damage per round, as points (% of party eHP). |
| **Endurance** | How many rounds the kaiju survives the party's expected damage. |
| **Kaiju Power Score (KPS)** | Pressure × Endurance. In a straight slugfest, roughly **the % of the party's effective HP the kaiju deals before it falls**. |
| **Power (per feature)** | A damaging feature's share of KPS: % of party eHP it deals over a typical fight. These add up to KPS. |
| **+rds (per feature)** | The rounds of Endurance a defensive feature adds. These add up to Endurance. |
| **Spike** | A feature's average damage to one PC ÷ average PC HP. This is the one-shot check. |
| **Rank** | The power dial: I Rampage, II Calamity, III Cataclysm. |

## 3. The master formula

```
KPS        = Pressure × Endurance
Pressure   = 100 × (kaiju expected damage per round) ÷ party eHP
Endurance  = HP ÷ (party damage per round × AC factor)  +  bonus rounds
AC factor  = 0.3 + 0.7 × (party hit chance ÷ 0.60)
```

The model is a damage **race**. Pressure says how fast the kaiju drains the party, and
Endurance says how long it lasts while doing it. Their product is the share of the party the
kaiju consumes before it falls:
- **~50:** a hard fight with resources spent and maybe one PC dropped.
- **~85:** several PCs dropped and a death is possible.
- **~100:** the race is roughly even.

The race ignores two feedback loops. Downed PCs stop dealing damage, and the solo kaiju never
loses actions as it's hurt. Both favor the kaiju, which is why Rank targets sit below 100. The
calibration in §9 checks this against the Battle Forecast simulation.

## 4. The pipeline

```
 Inputs ─▶ Party baseline ─▶ Rank targets ─┬─▶ Staying power (defense) ──┐
 L, N,      HP, damage, AC,   KPS, Endurance,│   AC tilt → AC factor →     │
 Rank,      attack, saves     LR, accuracy   │   bonus rounds → HP / dice  ├─▶ Archetype skin ─▶ Guardrails ─▶ Stat block
 seed                                        └─▶ Damage (offense) ─────────┘    (seeded)          spike, lock,    + Power Card
                                                 budget → 40/30/20/10 split →                     entries, ±5%
                                                 shape → dice
```

Defense is built first. Its rounded HP sets the **actual** Endurance, and the damage budget is
spread over that many rounds.

### 4.1 Inputs
Party level `L` (5–10), party size `N` (default 4), Rank (I/II/III), and seed. The seed picks the
archetype, names, and wording. Numbers never depend on the seed.

### 4.2 Party baseline

Per PC at level `L`:
- **HP:** `7L + 2`. This is a 2024 fixed-average blend of d10, d8, d8, and d6 classes with +2 Con.
- **Damage per round against the kaiju:** `2L + 1`, assuming a 60% hit chance. At level 8 this
  equals the default Battle Forecast party (Fighter, Cleric, Rogue, Wizard) from
  `src/data/class-templates.ts`, which deals 67 per round against AC 17. The slope across 5–10 is
  an estimate (§11).
- **AC:** 16 (L5–7) / 17 (L8–10).
- **Attack bonus:** +7 (L5–7) / +8 (L8) / +9 (L9–10).
- **Typical save bonus:** +3 / +4.

| L | Band | PC HP | PC dmg/rd | PC AC | Party attack | PC save | Party eHP (N=4) | Party dmg/rd (N=4) | Baseline kaiju AC | Kaiju attack / DC (Rank I–II) |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | T2 | 37 | 11 | 16 | +7 | +3 | 185 | 44 | 16 | +9 / DC 15 |
| 6 | T2 | 44 | 13 | 16 | +7 | +3 | 220 | 52 | 16 | +9 / DC 15 |
| 7 | T2 | 51 | 15 | 16 | +7 | +3 | 255 | 60 | 16 | +9 / DC 15 |
| 8 | T3 | 58 | 17 | 17 | +8 | +4 | 290 | 68 | 17 | +10 / DC 16 |
| 9 | T3 | 65 | 19 | 17 | +9 | +4 | 325 | 76 | 18 | +10 / DC 16 |
| 10 | T3 | 72 | 21 | 17 | +9 | +4 | 360 | 84 | 18 | +10 / DC 16 |

*Baseline kaiju AC* is the AC the party hits 60% of the time, which is party attack + 9.

### 4.3 Rank targets and accuracy

| Rank | Target KPS | Target Endurance | Legendary Resistance | Accuracy | Intended feel |
|---|---|---|---|---|---|
| **I Rampage** | 70 | 4.5 rds | 2/Day | band | 1–2 PCs drop; deaths unlikely |
| **II Calamity** | 85 | 5.0 rds | 3/Day | band | several drops; a death is possible |
| **III Cataclysm** | 100 | 5.5 rds | 3/Day | band +1 | a close race; deaths likely without smart play |

**Accuracy:** attack +9 and DC 15 for L5–7, +10 and DC 16 for L8–10. Cataclysm adds +1 to both.
That works out to about a 70% hit chance against PC AC and a 55% failed-save chance (75% and 60%
at Cataclysm).

**Titan math:** a kaiju's attack bonus and save DCs come from this table, *not* from its
ability scores and PB. That keeps the PCs' AC and saves meaningful against a creature whose
Strength and Constitution are mountain-sized. Ability scores still govern its saving throws and
ability checks.

The expected fraction of damage from a half-on-success save is `fail + (1 − fail) ÷ 2`: 0.775
at most ranks, 0.80 at Cataclysm.

### 4.4 Staying power (defense)

1. **AC = baseline kaiju AC + archetype AC tilt.** The AC factor scales the party's damage. Only
   70% of party damage uses attack rolls; the rest is save-based spells that ignore AC.
2. **Bonus rounds** come from this price list:

   | Feature | +rounds |
   |---|---|
   | Legendary Resistance | 0.20 per use |
   | Colossal Frame (chassis) | 0.10 |
   | Bloodied Rampage phase shift (chassis) | 0.25 |
   | Resistance, common type (Bludgeoning, Piercing, Slashing, Fire, Force, Radiant) | 0.15 |
   | Resistance, uncommon type (all others) | 0.05 |
   | Immunity, common / uncommon type | 0.30 / 0.10 |
   | Battlefield trait (difficult terrain, obscurement around the kaiju) | 0.05 |
   | Defensive reaction (+AC or damage reduction, once per round) | 0.15 |
   | Regeneration *R* per turn | R × (target Endurance − 1) ÷ (party dmg × AC factor) |

3. **HP:**
   - The remaining rounds `target Endurance − bonus rounds` are converted to HP:
     `rounds × party dmg/rd × AC factor`.
   - **Con score** = `18 + L`, rounded down to even (L5 → 22, L10 → 28).
   - **Hit dice:** Gargantuan d20s, `dice = round(HP ÷ (10.5 + Con mod))`.
   - HP = ⌊dice × 10.5⌋ + dice × Con mod, the 2024 fixed average.
4. **Actual Endurance** is recomputed from the rounded HP. All offense below uses this actual
   figure.

### 4.5 Damage (offense)

**Budget:** `total = KPS% × party eHP`. That's the expected damage the kaiju should deal across
the fight. It's split into four slots:

| Slot | Share | Uses per fight | What it is |
|---|---|---|---|
| **Signature** | 40% | Endurance − 1 | The kaiju's action every turn. One turn goes to Charging. |
| **Ultimate** | 30% | 1 | The telegraphed, once-per-fight climax (see Bloodied Rampage) |
| **Legendary** | 20% | Endurance | One damaging legendary option per round. The others are movement or terrain. |
| **Retaliation** | 10% | 0.75 × Endurance (reaction), or 0.4N × Endurance (aura) | A damaging reaction or aura |

**Expected damage per use** = damage × hits × targets × success rate × (1 + riders):
- **Success rate:** an attack uses the kaiju's hit chance. A half-on-success save uses the
  half-save factor. A no-damage-on-success save uses the fail chance. An aura always lands
  (1.0).
- **Targets by area class**, with a minimum of 1:

  | Area class | Shapes | Targets |
  |---|---|---|
  | Single | one creature | 1 |
  | Small | radius of 15 ft or less, 30-ft cone, 60-ft line | 0.3N |
  | Large | 20–30-ft radius, 60-ft cone, 120-ft line | 0.5N |
  | Ultimate | any climax area | 0.6N (the party scatters after the tell) |

- **Riders**, priced as extra damage on the feature that carries them:

  | Rider | Price |
  |---|---|
  | Prone | +10% |
  | Push of 15 ft or more | +5% |
  | Grappled or Restrained | +25% |
  | Frightened | +20% |
  | Leaves difficult terrain | +5% |
  | Stunned, Paralyzed, Incapacitated, swallow, instant death | **not allowed** |

**One sizing rule for every slot:**
`damage = per-use budget ÷ (hits × targets × success rate × (1 + riders))`, rounded to the
nearest whole number, then capped. The per-use budget is the slot's budget ÷ its uses per fight,
and for retaliation it's per trigger.

**Dice policy.** Each archetype names a die size per slot (§4.6).
- **Ultimates** prefer flat dice. Try that die, then d6, d8, d10, and d12, with
  `n = round(avg ÷ die average)`. Take the first whose ⌊n × die average⌋ equals the target.
- **Everything else, and ultimates with no exact flat fit:**
  `n = max(1, round(0.6 × avg ÷ die average))`, plus a flat modifier of
  `avg − ⌊n × die average⌋`.

The written average is always the target number, and the dice only flavor it. This dice table is
frozen with each formula version (§7).

**Signature shapes.** The archetype supplies a *preferred* shape plus the names, damage types,
riders, and dice. The shape that ships is computed:
1. **Heavy:** one attack, optionally with a rider. If one hit would exceed the 50% cap, use Twin
   when each Twin hit would be at least 30% of PC HP. Otherwise use Pair.
2. **Twin:** two equal attacks against *different* targets, each at least 30% of PC HP. If a
   Twin hit would fall under 30%, use Pair.
3. **Pair:** one heavy attack (65% of the per-use budget) and one lighter attack (35%) against
   different targets.

The archetype keeps its identity through names, damage types, and riders. A Behemoth that falls
back to Twin swings its crushing attack at two different creatures.

In practice a plain Heavy hit almost always overshoots the cap, so every sample uses a rider,
Twin, or Pair. That's the cap working as designed: it spreads damage instead of spiking one PC.

**Big-party fallback.** Party eHP grows with N, but each PC's HP doesn't. So for large parties,
add attacks rather than make hits bigger. If a PC's worst round would exceed 100% of PC HP, the
signature routine gains one more attack of its main attack, against yet another creature, and the
per-hit damage is re-divided. Repeat until it passes. In the reference sweep this triggers only
for 6-PC parties.

**Ultimate.** Same rule, using 0.6N targets and the half-save factor, capped at 75% of PC HP. If
the cap bites, the shortfall stays within the ±5% KPS tolerance or moves to the legendary slot.

### 4.6 Archetypes (picked by seed)

| Archetype | AC tilt | Resist / immune | Movement | Damage | Preferred signature | Ultimate (+rider) | Legendary rider | 4th trait | Reaction | Retaliation (10%) | Dice sig / ult / leg / ret |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Behemoth**: armored quake-beast | +2 | resist Thunder | walk, burrow | Bludgeoning, Thunder | Heavy + Prone | ground-slam Emanation + Prone | push | battlefield: quake terrain | retaliation | reaction, save (no damage on success) | d6 / d12 / d8 / d6 |
| **Leviathan**: tidal serpent | −1 | resist Cold | walk, swim | Bludgeoning, Cold | Heavy + Grappled | wave Cone + push | none | battlefield: surf terrain | retaliation | reaction, save (no damage on success) | d8 / d10 / d8 / d10 |
| **Pyroclast**: magma titan | 0 | immune Fire | walk, climb | Fire | Twin | magma spheres + terrain | none | retaliation aura | defensive (+3 AC) | aura, automatic | d6 / d10 / d6 / d6 |
| **Stormwing**: thunder roc | −1 | resist Lightning, Thunder | walk, fly | Lightning, Slashing | Twin | storm-dive Line + Prone | push | retaliation aura | defensive (wind wall) | aura, automatic | d8 / d8 / d6 / d4 |
| **Dreadmaw**: apex breath reptile | +1 | resist Fire, Lightning | walk, swim | Piercing, Slashing, Radiant | Pair | Line breath + terrain | none | regeneration, L HP per turn (Cold stops it) | retaliation | reaction, attack + push | d10 (+d8 lighter) / d8 / d8 / d6 |
| **Blightmother**: spore hive | 0 | immune Poison, resist Acid | walk, climb | Acid, Poison | Heavy + Frightened | spore Cloud | none | battlefield: spore haze | retaliation | reaction, save (no damage on success) | d8 / d6 / d6 / d6 |

**Every kaiju has exactly one reaction.**
- If its retaliation is a reaction, that reaction is its only reaction.
- If its retaliation is an aura, the aura becomes the 4th trait, and the reaction is defensive,
  priced in rounds (+0.15).

All kaiju are **Gargantuan Monstrosity (Titan), Unaligned**, the same tag the 2024 Tarrasque uses.
They're original homebrew: no SRD monster text, and no trademarked monsters or names.

### 4.7 Chassis traits (every kaiju has these)

These three traits are learned once and are the same on every block:
- **Colossal Frame.**
  - The kaiju can't be Grappled, Restrained, knocked Prone, or moved against its will by a
    creature smaller than Gargantuan.
  - It deals double damage to objects and structures.
  - *+0.10 rds*
- **Legendary Resistance (X/Day).** The count is set by Rank.
  - *+0.20 rds each*
- **Bloodied Rampage.**
  - The first time the kaiju is Bloodied, it ends every condition on itself and begins
    **Charging** with an archetype-specific tell.
  - On its next turn, it spends its action Charging. It can still move, react, and take
    legendary actions.
  - On the turn after that, it unleashes its **Ultimate**. That's once per fight, and it's the
    only way to use it.
  - The tell gives the party a full round of warning. If they burst the kaiju down during the
    Charge, they've earned that win.
  - *+0.25 rds*

### 4.8 Guardrails

| Anti-goal | Guardrail |
|---|---|
| Cheap one-shots | Any single hit averages at most **50%** of PC HP. Multiattack hits must target *different* creatures. The Ultimate averages at most **75%** of PC HP on a failed save, deals half on a success, and always comes with a full-round tell. A PC's **worst round** (signature + legendary + retaliation all hitting them) stays under 100% of PC HP. Banned riders: Stunned, Paralyzed, Incapacitated, swallow, instant death. |
| Dies too fast | Legendary Resistance. Colossal Frame. The phase shift ends every condition. Endurance targets of 4.5–5.5 rounds. |
| Too much to run | Three shared chassis traits. Archetype content is one trait, a signature routine, one Ultimate, one reaction, and three legendary options. **At most 12 entries** per block. Only one legendary option deals damage, and it "can't be taken again until the start of its next turn". |
| Hits the target | The finished block must rate within **±5%** of the target KPS. If it doesn't, step the largest uncapped slot's dice up or down one size and re-rate. |

**The guardrails are hard rules for every in-range input.** Generation never returns a failure.
Inputs outside levels 5–10 or party sizes 3–6 are clamped by the UI. The repairs run in a fixed
order, and **safety caps beat the ±5% band**:
1. **Shape fallback** (Heavy → Twin → Pair) for the 50% hit cap.
2. **Cap each slot:** 50% per hit, 75% for the Ultimate.
3. **Big-party fallback** (extra signature attacks) for the worst-round cap.
4. **Step dice** for the ±5% band.

If the band still can't be met after the caps, the block ships under target and the Power Card
shows the gap. The worst-round check counts the signature hit, the damaging legendary option, and
the retaliation, auras included.

**Coverage check:** the reference implementation passes every guardrail for all **432**
combinations of 6 archetypes × levels 5–10 × 3 Ranks × party sizes 3–6. The largest KPS miss is
3.9%, and the worst round tops out at exactly 100%. No input needed step 4.

### 4.9 Output

- A 2024-format stat block. Each entry carries a power tag: `[Power 27 · Spike 49%]` for damage,
  `[+0.40 rds]` for defense, `[utility]` for movement and terrain.
- A **Power Card** with:
  - target vs. actual KPS
  - Pressure
  - an Endurance breakdown that sums to Endurance
  - a damage split that sums to KPS
  - accuracy, spike checks, and entry count
  - an **equivalent CR**
- **Equivalent CR** uses the 2014 DMG monster-statistics method. That's the same table family as
  `CR_DAMAGE_MIDPOINT` in `src/lib/monster-to-sim.ts`, used because the 2024 books have no
  CR-from-stats table.
  - **Defensive CR:**
    - Look up the CR row for raw HP alone.
    - Add 20 effective HP per Legendary Resistance use if that row is CR 10 or lower, or 30 if
      it's CR 11 or higher.
    - Add 3 × the HP regenerated per turn.
    - Look the row up again with this effective HP, and adjust by the AC difference from that
      row, truncated toward zero: (AC − row AC) ÷ 2.
  - **Offensive CR:**
    - Start from raw damage per round: the **whole signature routine summed**, plus the
      **largest** legendary option (one per round), plus the Ultimate ÷ 3.
    - Every attack is assumed to hit, and every area hits two creatures. Reactions and auras
      don't count.
    - Look up that row, then adjust by (attack bonus − row attack bonus) ÷ 2, truncated toward
      zero.
  - **CR line:** the average of the two, rounded half up. It sets XP and PB, and PB drives
    saving-throw proficiencies and Perception. The card also shows "≈ N× the party's 2024 High
    budget".
  - **Treat it as a familiar-scale comparison, not a difficulty verdict.** §9 shows it
    undervalues kaiju.

## 5. Reading a power rating

- **`[Power 27 · Spike 49%]` on Quarry Crush:** over a typical fight, Quarry Crush alone deals
  about 27% of the party's effective HP. A single hit averages 49% of one PC's HP. The Power
  values of all damaging features add up to the KPS.
- **`[+0.40 rds]` on Legendary Resistance:** it keeps the kaiju alive about 0.4 rounds longer than
  it would otherwise survive. HP plus all the +rds values add up to Endurance.
- **The Power Card's KPS** is the headline. Compare it to the Rank target, then use the slot split
  to see *how* the kaiju is dangerous. A high Ultimate share means one terrifying moment; a high
  Signature share means a steady grind.

## 6. Worked example: Gravelmaw (4 × level 5, Rank I, Behemoth)

1. **Baseline:**
   - PC HP 37, so party eHP = 4 × 37 × 1.25 = **185**.
   - Party damage = 4 × 11 = **44/round** at attack +7.
2. **Targets:**
   - KPS 70, Endurance 4.5, Legendary Resistance 2/Day.
   - Accuracy +9 / DC 15, giving a 70% hit chance, a 55% fail chance, and a half-save factor of
     0.775.
3. **Defense:**
   - AC = 16 + 2 = **18**. The party hits 50% of the time, so the AC factor is
     0.3 + 0.7 × (0.50 ÷ 0.60) = 0.883.
   - Bonus rounds = 0.40 (LR) + 0.10 (Frame) + 0.25 (Rampage) + 0.05 (Thunder) + 0.05 (Quaking
     Stride) = **0.85**.
   - HP rounds = 4.5 − 0.85 = 3.65, so target HP = 3.65 × 44 × 0.883 = 141.9.
   - Con 22 (+6) gives 16.5 per die, so 8.6 rounds to **9d20 + 54 = 148 HP**.
   - Actual Endurance = 148 ÷ 38.9 + 0.85 = **4.66 rds**.
4. **Budget:** 0.70 × 185 = **129.5** expected damage across the fight.
   - **Signature (40%, 51.8 over 3.66 uses = 14.2 per use):**
     - A plain Heavy hit needs 14.2 ÷ 0.7 = 20.2 damage, over the cap of 18.5.
     - With a Prone rider it needs 14.2 ÷ (0.7 × 1.1) = 18.4, under the cap.
     - Result: **Quarry Crush 18 (4d6 + 4) + Prone**.
   - **Ultimate (30% = 38.9):** 38.9 ÷ (2.4 targets × 0.775 × 1.1 for Prone) = 19.0, giving
     **Mountainfall 19 (3d12) + Prone**. That's 51% of PC HP, under the 75% cap.
   - **Legendary (20% = 25.9, 5.56 per round):** 5.56 ÷ (0.7 × 1.05 for the push) = 7.6, giving
     **Tail Lash 8 (1d8 + 4) + 15-ft push**.
   - **Retaliation (10% = 13.0):**
     - 13.0 ÷ 4.66 rounds = 2.8 per round.
     - At 0.75 triggers per round, that's 3.7 per trigger.
     - A no-damage-on-success save fails 55% of the time, so the damage is 3.7 ÷ 0.55 = 6.8.
     - Result: **Rubble Shrug 7 (2d6)**.
5. **Rate the finished block:**
   - Crush 27.4 + Mountainfall 21.0 + Tail Lash 14.8 + Rubble Shrug 7.3 = **KPS 70.5**, which is
     +0.7% vs. the target and passes.
   - Worst round on one PC = (18 + 8 + 7) ÷ 37 = 89%, which passes.
   - Entries: 10 of 12.

## 7. How the generator stays deterministic (for the later build)

- **The numbers are pure functions of (L, N, Rank, archetype).** Only archetype choice, names,
  tells, and wording come from the seed. Dice expressions follow the dice policy in §4.5.
- **Seeded choices use `src/lib/random.ts` on a new, versioned stream** (`kv=1` in shareable
  links). That preserves the load-bearing LCG contract for existing seeds.
- **`kv` versions the whole calibration, not just the RNG.**
  - `kv=1` freezes every constant in §4 (baseline, Rank table, price lists, shares, caps), the
    dice policy, and the archetype table.
  - A recalibration ships as `kv=2` beside it, so old links and saved kaiju never change silently.
  - The §11 answers should land *before* `kv=1` is frozen at release. The build can start
    without them; only the constants file waits.
- **The samples are exact acceptance fixtures.**
  - A reference implementation of this formula (JavaScript, embedded verbatim in the Kaiju Forge
    review page) reproduces all four §8 samples number for number.
  - It passes the 432-input guardrail sweep in §4.8.
  - The build should port it first and pin both checks as tests.
- **The engine is pure** (`src/lib/kaiju/`), with no DOM, storage, or network access. It runs
  in the Workers runtime like the rest of `src/lib/`. Saving a generated kaiju as a custom
  monster goes through the server-authoritative path in the cloud roadmap, not browser storage.

## 8. Sample stat blocks

Four samples were generated and rated with a reference implementation of this formula. All four
pass every guardrail.

| # | Kaiju | Archetype | Party | Rank | HP | AC | Signature | Ultimate (fail) | KPS | Endurance | Equivalent CR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Gravelmaw, the Quarry-Eater | Behemoth | 4 × L5 (T2) | I Rampage | 148 | 18 | Heavy + Prone | 19 | 70.5 | 4.66 | 8 |
| 2 | Tidewrack, the Drowning Coil | Leviathan | 4 × L7 (T2) | II Calamity | 245 | 15 | Heavy + Grappled | 33 | 85.1 | 4.91 | 13 |
| 3 | Vulkareth, the Cinder Titan | Pyroclast | 4 × L8 (T3) | II Calamity | 240 | 17 | Twin | 38 | 84.6 | 4.93 | 15 |
| 4 | The Ruinmaw | Dreadmaw | 4 × L10 (T3) | III Cataclysm | 292 | 19 | Pair | 54 (capped) | 99.8 | 5.41 | 19 |

### Gravelmaw, the Quarry-Eater

*Gargantuan Monstrosity (Titan), Unaligned* · Behemoth archetype · built for 4 × level 5 (T2), Rank I Rampage

> A walking quarry that grazes on mountainsides and leaves canyons where towns used to be.

**AC** 18 · **Initiative** −1 (9)  
**HP** 148 (9d20 + 54)  
**Speed** 40 ft., Burrow 30 ft.

| | STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|---|
| Score | 24 | 8 | 22 | 3 | 12 | 7 |
| Mod | +7 | −1 | +6 | −4 | +1 | −2 |
| Save | +10 | −1 | +9 | −4 | +4 | −2 |

**Skills** Perception +4  
**Resistances** Thunder  
**Senses** Tremorsense 120 ft.; Passive Perception 14  
**Languages** None  
**CR** 8 (XP 3,900; PB +3), equivalent. See the Power Card.

#### Traits

***Colossal Frame.*** Gravelmaw can't be Grappled, Restrained, knocked Prone, or moved against its will by a creature smaller than Gargantuan. It deals double damage to objects and structures. `[+0.10 rds]`

***Legendary Resistance (2/Day).*** If Gravelmaw fails a saving throw, it can choose to succeed instead. `[+0.40 rds]`

***Bloodied Rampage.*** The first time Gravelmaw is Bloodied, it ends every condition on itself and begins Charging: it rears onto its hind legs and the ground around it splits with a grinding roar. On its next turn, it must spend its action Charging (it can still move and take Reactions and Legendary Actions). On the turn after that, it uses Mountainfall if able. `[+0.25 rds]`

***Quaking Stride.*** The ground within 20 feet of Gravelmaw is Difficult Terrain for other creatures. `[+0.05 rds]`

#### Actions

***Quarry Crush.*** *Melee Attack Roll:* +9, reach 15 ft. *Hit:* 18 (4d6 + 4) Bludgeoning damage. If the target is Huge or smaller, it has the Prone condition. `[Power 27 · Spike 49%]`

***Mountainfall (Charged Only).*** *Dexterity Saving Throw:* DC 15, each creature in a 60-foot Emanation originating from Gravelmaw. *Failure:* 19 (3d12) Bludgeoning damage, and the target has the Prone condition. *Success:* Half damage only. `[Power 21 · Spike 51%]`

#### Reactions

***Rubble Shrug.*** *Trigger:* A creature within 15 feet of Gravelmaw hits it with a melee attack roll. *Response:* Stone shards burst from the impact. *Dexterity Saving Throw:* DC 15, the triggering creature. *Failure:* 7 (2d6) Piercing damage. `[Power 7 · Spike 19%]`

#### Legendary Actions

*Legendary Action Uses: 3.* Immediately after another creature's turn, Gravelmaw can expend a use to take one of the following actions. Gravelmaw regains all expended uses at the start of each of its turns.

***Lumber.*** Gravelmaw moves up to half its Speed or Burrow Speed. `[utility]`

***Tail Lash.*** *Melee Attack Roll:* +9, reach 25 ft. *Hit:* 8 (1d8 + 4) Bludgeoning damage, and the target is pushed up to 15 feet straight away from Gravelmaw. Gravelmaw can't take this action again until the start of its next turn. `[Power 15 · Spike 22%]`

***Upheave.*** Gravelmaw tears up the ground in a 20-foot-radius Sphere centered on a point within 30 feet of it. That area becomes Difficult Terrain, and any structure there collapses. `[utility]`

#### Power Card: Gravelmaw

| | |
|---|---|
| Party | 4 × level 5 (T2): PC HP 37, party effective HP 185, party damage 44/round |
| Rank | I Rampage: target KPS 70, target Endurance 4.5 rds |
| **Kaiju Power Score** | **70.5** (+0.7% vs target) |
| Pressure | 15.1 pts/round (28.0 expected damage per round) |
| Endurance | 4.66 rds = HP 3.81 + Legendary Resistance 0.40 + Colossal Frame 0.10 + Bloodied Rampage 0.25 + Resistance: Thunder 0.05 + Quaking Stride 0.05 |
| Damage split (KPS pts) | Signature 27.4 · Ultimate 21.0 · Legendary 14.8 · Retaliation 7.3 |
| Accuracy | +9 to hit (70% vs AC 16), DC 15 (55% fail at +3) |
| Spike checks | biggest hit 49% (cap 50%) · Ultimate 51% (cap 75%) · worst round 89% (cap 100%) |
| Entries | 10 / 12 |
| Equivalent CR | 8 (defensive 9, offensive 7) ≈ 0.9× the party's 2024 High budget (3,900 vs 4,400 XP) |
| Guardrails | all pass |

### Tidewrack, the Drowning Coil

*Gargantuan Monstrosity (Titan), Unaligned* · Leviathan archetype · built for 4 × level 7 (T2), Rank II Calamity

> A harbor-length serpent that drags ships under, then follows the tide into the streets.

**AC** 15 · **Initiative** +1 (11)  
**HP** 245 (14d20 + 98)  
**Speed** 30 ft., Swim 60 ft.

| | STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|---|
| Score | 25 | 12 | 24 | 4 | 13 | 8 |
| Mod | +7 | +1 | +7 | −3 | +1 | −1 |
| Save | +12 | +1 | +12 | −3 | +6 | −1 |

**Skills** Perception +6  
**Resistances** Cold  
**Senses** Darkvision 120 ft.; Passive Perception 16  
**Languages** None  
**CR** 13 (XP 10,000; PB +5), equivalent. See the Power Card.

#### Traits

***Colossal Frame.*** Tidewrack can't be Grappled, Restrained, knocked Prone, or moved against its will by a creature smaller than Gargantuan. It deals double damage to objects and structures. `[+0.10 rds]`

***Legendary Resistance (3/Day).*** If Tidewrack fails a saving throw, it can choose to succeed instead. `[+0.60 rds]`

***Bloodied Rampage.*** The first time Tidewrack is Bloodied, it ends every condition on itself and begins Charging: its gill-frills flare crimson and the sea draws back from the shore. On its next turn, it must spend its action Charging (it can still move and take Reactions and Legendary Actions). On the turn after that, it uses Maelstrom Surge if able. `[+0.25 rds]`

***Surf Zone.*** Tidewrack can breathe air and water. Surf churns around it: creatures without a Swim Speed treat the ground within 30 feet of Tidewrack as Difficult Terrain. `[+0.05 rds]`

#### Actions

***Drowning Coil.*** *Melee Attack Roll:* +9, reach 20 ft. *Hit:* 25 (4d8 + 7) Bludgeoning damage. If the target is Huge or smaller, it has the Grappled condition (escape DC 15), and it has the Restrained condition while Grappled. Tidewrack can have only one creature Grappled at a time; grappling a new creature releases the previous one. `[Power 34 · Spike 49%]`

***Maelstrom Surge (Charged Only).*** *Strength Saving Throw:* DC 15, each creature in a 90-foot Cone. *Failure:* 33 (6d10) Bludgeoning damage, and the target is pushed up to 20 feet straight away from Tidewrack. *Success:* Half damage only. `[Power 25 · Spike 65%]`

#### Reactions

***Brine Lash.*** *Trigger:* A creature Tidewrack can see within 60 feet of it hits it with an attack roll. *Response:* *Dexterity Saving Throw:* DC 15, the triggering creature. *Failure:* 11 (2d10) Bludgeoning damage. `[Power 9 · Spike 22%]`

#### Legendary Actions

*Legendary Action Uses: 3.* Immediately after another creature's turn, Tidewrack can expend a use to take one of the following actions. Tidewrack regains all expended uses at the start of each of its turns.

***Surge.*** Tidewrack moves up to half its Speed or Swim Speed. `[utility]`

***Tail Crash.*** *Melee Attack Roll:* +9, reach 30 ft. *Hit:* 13 (2d8 + 4) Bludgeoning damage. Tidewrack can't take this action again until the start of its next turn. `[Power 18 · Spike 25%]`

***Drag Under.*** Tidewrack moves the creature it has Grappled up to 20 feet to an unoccupied space within its reach. `[utility]`

#### Power Card: Tidewrack

| | |
|---|---|
| Party | 4 × level 7 (T2): PC HP 51, party effective HP 255, party damage 60/round |
| Rank | II Calamity: target KPS 85, target Endurance 5.0 rds |
| **Kaiju Power Score** | **85.1** (+0.1% vs target) |
| Pressure | 17.3 pts/round (44.2 expected damage per round) |
| Endurance | 4.91 rds = HP 3.86 + Legendary Resistance 0.60 + Colossal Frame 0.10 + Bloodied Rampage 0.25 + Resistance: Cold 0.05 + Surf Zone 0.05 |
| Damage split (KPS pts) | Signature 33.5 · Ultimate 25.3 · Legendary 17.5 · Retaliation 8.7 |
| Accuracy | +9 to hit (70% vs AC 16), DC 15 (55% fail at +3) |
| Spike checks | biggest hit 49% (cap 50%) · Ultimate 65% (cap 75%) · worst round 96% (cap 100%) |
| Entries | 10 / 12 |
| Equivalent CR | 13 (defensive 16, offensive 10) ≈ 1.5× the party's 2024 High budget (10,000 vs 6,800 XP) |
| Guardrails | all pass |

### Vulkareth, the Cinder Titan

*Gargantuan Monstrosity (Titan), Unaligned* · Pyroclast archetype · built for 4 × level 8 (T3), Rank II Calamity

> A volcano that decided to walk. Its footprints cool into obsidian; its breath is the eruption.

**AC** 17 · **Initiative** −1 (9)  
**HP** 240 (13d20 + 104)  
**Speed** 30 ft., Climb 30 ft.

| | STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|---|
| Score | 26 | 9 | 26 | 6 | 12 | 10 |
| Mod | +8 | −1 | +8 | −2 | +1 | +0 |
| Save | +13 | −1 | +13 | −2 | +6 | +0 |

**Skills** Perception +6  
**Immunities** Fire  
**Senses** Darkvision 120 ft., Tremorsense 60 ft.; Passive Perception 16  
**Languages** Understands Ignan but can't speak  
**CR** 15 (XP 13,000; PB +5), equivalent. See the Power Card.

#### Traits

***Colossal Frame.*** Vulkareth can't be Grappled, Restrained, knocked Prone, or moved against its will by a creature smaller than Gargantuan. It deals double damage to objects and structures. `[+0.10 rds]`

***Legendary Resistance (3/Day).*** If Vulkareth fails a saving throw, it can choose to succeed instead. `[+0.60 rds]`

***Bloodied Rampage.*** The first time Vulkareth is Bloodied, it ends every condition on itself and begins Charging: its cracks blaze white and a column of ash climbs from its crown. On its next turn, it must spend its action Charging (it can still move and take Reactions and Legendary Actions). On the turn after that, it uses Caldera Burst if able. `[+0.25 rds]`

***Molten Hide.*** Whenever a creature within 10 feet of Vulkareth hits it with a melee attack roll, that creature takes 3 (1d6) Fire damage. `[Power 8 · Spike 5%]`

#### Actions

***Multiattack.*** Vulkareth makes two Magma Fist attacks, each against a different target. `[Signature routine]`

***Magma Fist.*** *Melee Attack Roll:* +10, reach 15 ft. *Hit:* 18 (3d6 + 8) Fire damage. `[Power 34 · Spike 31%]`

***Caldera Burst (Charged Only).*** Vulkareth hurls three gouts of magma. *Dexterity Saving Throw:* DC 16, each creature in a 20-foot-radius Sphere centered on each of three points Vulkareth can see within 120 feet of it (a creature in more than one Sphere is affected only once). *Failure:* 38 (7d10) Fire damage. *Success:* Half damage only. The ground in each Sphere becomes cooling slag (Difficult Terrain) for 1 minute. `[Power 26 · Spike 66%]`

#### Reactions

***Slag Shell.*** *Trigger:* Vulkareth is hit by an attack roll. *Response:* Its surface flash-hardens: Vulkareth adds 3 to its AC against that attack, possibly causing it to miss. `[+0.15 rds]`

#### Legendary Actions

*Legendary Action Uses: 3.* Immediately after another creature's turn, Vulkareth can expend a use to take one of the following actions. Vulkareth regains all expended uses at the start of each of its turns.

***Stride.*** Vulkareth moves up to half its Speed or Climb Speed, igniting flammable objects it touches. `[utility]`

***Slag Hurl.*** *Ranged Attack Roll:* +10, range 120/480 ft. *Hit:* 14 (4d6) Fire damage. Vulkareth can't take this action again until the start of its next turn. `[Power 17 · Spike 24%]`

***Ash Vent.*** Vulkareth fills a 20-foot-radius Sphere centered on a point within 60 feet of it with choking ash. The area is Heavily Obscured until the start of Vulkareth's next turn. `[utility]`

#### Power Card: Vulkareth

| | |
|---|---|
| Party | 4 × level 8 (T3): PC HP 58, party effective HP 290, party damage 68/round |
| Rank | II Calamity: target KPS 85, target Endurance 5.0 rds |
| **Kaiju Power Score** | **84.6** (−0.5% vs target) |
| Pressure | 17.2 pts/round (49.7 expected damage per round) |
| Endurance | 4.93 rds = HP 3.53 + Legendary Resistance 0.60 + Colossal Frame 0.10 + Bloodied Rampage 0.25 + Immunity: Fire 0.30 + Slag Shell 0.15 |
| Damage split (KPS pts) | Signature 34.1 · Ultimate 25.6 · Legendary 16.7 · Retaliation 8.2 |
| Accuracy | +10 to hit (70% vs AC 17), DC 16 (55% fail at +4) |
| Spike checks | biggest hit 31% (cap 50%) · Ultimate 66% (cap 75%) · worst round 60% (cap 100%) |
| Entries | 11 / 12 |
| Equivalent CR | 15 (defensive 17, offensive 13) ≈ 1.5× the party's 2024 High budget (13,000 vs 8,400 XP) |
| Guardrails | all pass |

### The Ruinmaw

*Gargantuan Monstrosity (Titan), Unaligned* · Dreadmaw archetype · built for 4 × level 10 (T3), Rank III Cataclysm

> The apex. A storm-gray reptile tall as a cathedral, whose spine-plates glow before the light that unmakes cities.

**AC** 19 · **Initiative** +0 (10)  
**HP** 292 (15d20 + 135)  
**Speed** 50 ft., Swim 40 ft.

| | STR | DEX | CON | INT | WIS | CHA |
|---|---|---|---|---|---|---|
| Score | 28 | 10 | 28 | 5 | 15 | 14 |
| Mod | +9 | +0 | +9 | −3 | +2 | +2 |
| Save | +15 | +0 | +15 | −3 | +8 | +2 |

**Skills** Perception +8  
**Resistances** Fire, Lightning  
**Senses** Darkvision 120 ft.; Passive Perception 18  
**Languages** None  
**CR** 19 (XP 22,000; PB +6), equivalent. See the Power Card.

#### Traits

***Colossal Frame.*** The Ruinmaw can't be Grappled, Restrained, knocked Prone, or moved against its will by a creature smaller than Gargantuan. It deals double damage to objects and structures. `[+0.10 rds]`

***Legendary Resistance (3/Day).*** If The Ruinmaw fails a saving throw, it can choose to succeed instead. `[+0.60 rds]`

***Bloodied Rampage.*** The first time The Ruinmaw is Bloodied, it ends every condition on itself and begins Charging: its spine-plates ignite one by one from tail to crown, with a rising hum felt in the bones. On its next turn, it must spend its action Charging (it can still move and take Reactions and Legendary Actions). On the turn after that, it uses Ruinlight Breath if able. `[+0.25 rds]`

***Ruinheart Regeneration.*** The Ruinmaw regains 10 Hit Points at the start of each of its turns if it has at least 1 Hit Point. If it takes Cold damage, this trait doesn't function at the start of its next turn. `[+0.57 rds]`

#### Actions

***Multiattack.*** The Ruinmaw makes two attacks, one Ruin Jaws attack and one Rending Claw attack, each against a different target. `[Signature routine]`

***Ruin Jaws.*** *Melee Attack Roll:* +11, reach 20 ft. *Hit:* 28 (4d10 + 6) Piercing damage. `[Power 26 · Spike 39%]`

***Rending Claw.*** *Melee Attack Roll:* +11, reach 15 ft. *Hit:* 15 (2d8 + 6) Slashing damage. `[Power 14 · Spike 21%]`

***Ruinlight Breath (Charged Only).*** *Dexterity Saving Throw:* DC 17, each creature in a 300-foot-long, 20-foot-wide Line. *Failure:* 54 (12d8) Radiant damage. *Success:* Half damage only. The ground along the Line is scorched to glassy rubble (Difficult Terrain), and structures in it collapse. `[Power 30 · Spike 75%]`

#### Reactions

***Tail Retort.*** *Trigger:* A creature within 20 feet of the Ruinmaw hits it with a melee attack roll. *Response:* *Melee Attack Roll:* +11, reach 20 ft., the triggering creature. *Hit:* 11 (2d6 + 4) Bludgeoning damage, and the target is pushed up to 15 feet straight away from the Ruinmaw. `[Power 10 · Spike 15%]`

#### Legendary Actions

*Legendary Action Uses: 3.* Immediately after another creature's turn, The Ruinmaw can expend a use to take one of the following actions. The Ruinmaw regains all expended uses at the start of each of its turns.

***Advance.*** The Ruinmaw moves up to half its Speed or Swim Speed. `[utility]`

***Spine Flare.*** *Ranged Attack Roll:* +11, range 300 ft. *Hit:* 18 (4d8) Radiant damage. The Ruinmaw can't take this action again until the start of its next turn. `[Power 20 · Spike 25%]`

***Topple.*** The Ruinmaw brings down a building, cliff face, or similar structure within 30 feet of it. Up to a 20-foot square where it stood becomes Difficult Terrain. `[utility]`

#### Power Card: The Ruinmaw

| | |
|---|---|
| Party | 4 × level 10 (T3): PC HP 72, party effective HP 360, party damage 84/round |
| Rank | III Cataclysm: target KPS 100, target Endurance 5.5 rds |
| **Kaiju Power Score** | **99.8** (−0.2% vs target) |
| Pressure | 18.4 pts/round (66.4 expected damage per round) |
| Endurance | 5.41 rds = HP 3.69 + Legendary Resistance 0.60 + Colossal Frame 0.10 + Bloodied Rampage 0.25 + Resistance: Fire 0.15 + Resistance: Lightning 0.05 + Ruinheart Regeneration 0.57 |
| Damage split (KPS pts) | Signature 39.5 · Ultimate 30.2 · Legendary 20.3 · Retaliation 9.8 |
| Accuracy | +11 to hit (75% vs AC 17), DC 17 (60% fail at +4) |
| Spike checks | biggest hit 39% (cap 50%) · Ultimate 75% (cap 75%) · worst round 79% (cap 100%) |
| Entries | 12 / 12 |
| Equivalent CR | 19 (defensive 21, offensive 16) ≈ 1.8× the party's 2024 High budget (22,000 vs 12,400 XP) |
| Guardrails | all pass |

## 9. Calibration read (Battle Forecast)

I ran each sample through the app's own Monte Carlo engine with a throwaway script (not
committed):
- **Engine:** `monsterToSimMonster` → `simulateBattle`, 2,000 iterations, seed 20261021.
- **Party:** the default Battle Forecast party (Fighter, Cleric, Rogue, Wizard) at the sample's
  level.
- **Rank sweep:** each sample was also rescaled to the other two Ranks (HP from §4.4, damage
  scaled by the Pressure ratio) to check monotonicity within one archetype and level.

The sim uses three adapters, because its parser can't read these mechanics:
- The Ultimate is renamed `(Recharge 7)`, so it fires exactly once. The sim fires it on the
  kaiju's first turn, not after Bloodied.
- The Ultimate hits `round(0.6N)` = 2 targets.
- Only one damaging legendary use is allowed per round.

**The sim does not model:** riders (Prone, Grappled, push, terrain), reactions, auras, Legendary
Resistance, the phase-shift cleanse, Colossal Frame, or regeneration.

The forecast is a weather report, not a verdict. These numbers are hedged first reads.

### Two party models
- **App party:** exactly what Battle Forecast builds today. Its `5-10` templates carry level-8
  offense at *every* level from 5 to 10, so level 5–7 PCs hit too hard and level 9–10 PCs too
  soft.
- **Level-matched party:** the same templates with damage, healing, and Sneak Attack scaled by
  `(2L + 1) ÷ 17`. Attack bonus and spell DC are set to the level baseline. This is the fair
  test of the formula.

### Results at the designed Rank

| Kaiju | Party | Formula Endurance | Sim rounds (matched) | Party win (matched) | Party HP left | Kaiju dmg / battle (sim ÷ formula) | Party win (app party) |
|---|---|---|---|---|---|---|---|
| Gravelmaw | 4 × L5, Rampage | 4.66 | 4.8 | 98.0% | 61% | 91 (70%) | 100% in 2.9 rds |
| Tidewrack | 4 × L7, Calamity | 4.91 | 5.0 | 96.8% | 57% | 137 (63%) | 98.7% in 4.2 rds |
| Vulkareth | 4 × L8, Calamity | 4.93 | 5.0 | 84.7% | 39% | 192 (78%) | 86.0% in 4.9 rds |
| The Ruinmaw | 4 × L10, Cataclysm | 5.41 | 5.5 | 68.5% | 26% | 286 (80%) | 34.8% in 6.7 rds |

### Rank sweep (level-matched party win rate)

| Kaiju | Rank I | Rank II | Rank III |
|---|---|---|---|
| Gravelmaw (L5) | **98.0%** | 95.9% | 91.2% |
| Tidewrack (L7) | 99.1% | **96.8%** | 91.5% |
| Vulkareth (L8) | 92.2% | **84.7%** | 66.7% |
| The Ruinmaw (L10) | 91.1% | 84.9% | **68.5%** |

### Findings

1. **The Endurance model holds.** With a level-matched party, the sim's fight length lands within
   0.15 rounds of the formula's Endurance for all four samples. That's the strongest
   confirmation in this read: the defense half of KPS predicts how long the kaiju lasts.
2. **Rank order holds.** Party win rate falls from Rampage to Calamity to Cataclysm in every
   sweep, with both party models.
3. **T2 kaiju play softer than their labels.**
   - Gravelmaw and Tidewrack lose 4% of the time or less at their designed Ranks.
   - Part of this is the sim. It delivers only 63–70% of their formula damage, because they put
     more of their budget into riders and reactions it can't see (Tidewrack's grapple alone is
     ~8% of its KPS).
   - T3 samples put more into raw damage, and the sim delivers 78–80%.
   - Still, if riders and reactions are worth less at the table than §4.5 prices them, T2 Ranks
     would need higher KPS targets. See §11 Q1.
4. **The kaiju is lethal past ~65% delivered.** The sim's loss rate jumps once the kaiju actually
   deals more than about 65% of party eHP: Vulkareth deals 66% and the party loses 15% of fights;
   the Ruinmaw deals 79% and the party loses 32%. That matches the race model's warning about
   feedback loops.
5. **Battle Forecast misjudges levels 5–7 and 9–10.** This isn't kaiju-specific. Because the
   `5-10` templates carry level-8 offense, the app party kills Gravelmaw in 2.9 rounds, versus
   4.8 rounds for a level-matched party. The same skew applies to *every* forecast at those
   levels. It's a separate follow-up.
6. **Equivalent CR undervalues kaiju.** Gravelmaw rates CR 8, only 0.9× the party's High XP
   budget, yet it plays harder than a typical High fight. The 2014 offense math counts three
   rounds and skips reactions, riders, and the long fight. That's why the CR line is labeled
   "equivalent" and KPS is the headline.

## 10. Integration notes (for the build plan)

- **`Monster` mapping:**
  - Use `size: 'Gargantuan'`, `type: 'Monstrosity'`, `subtype: 'titan'`, `source: 'Custom'`,
    `isLegendary: true`, and `legendary.actionsPerRound: 3`.
  - Tags: `kaiju` and `kaiju-rank-<id>`.
  - `challengeRating`, `xp`, and `proficiencyBonus` come from the equivalent CR.
  - Attack entries carry `attackBonus`, `damageDice`, and `damageAvg`.
- **Parser gaps in `src/lib/monster-to-sim.ts`.** These must close before a generated kaiju runs
  in Battle Forecast unmodified:
  1. `(Charged Only)` isn't recognized as a one-shot recharge. The designed blocks trip the
     caster-damage floor ("damage output looked 18/round vs ~54 expected at CR 8"), and the
     parser synthesizes a phantom attack.
  2. "Can't take this action again until the start of its next turn" isn't understood, so the
     sim spends all 3 legendary uses on the damaging option.
  3. Reactions and damaging auras aren't simulated.
  4. Area words `Emanation` and `300-foot Line` aren't in the area-target regex.

  Phrasing that already parses: "makes two attacks, one Ruin Jaws attack and one Rending Claw
  attack". The parser reads only the first number word, so "makes one X attack and one Y
  attack" parses as one attack.
- **Battle Forecast level tiers:** see Finding 5.
- **Content:** all text is original. 2024 terms used (Bloodied, Emanation, Titan, the
  attack and save formats) are SRD 5.2.1 rules vocabulary. Generated kaiju are the DM's private
  campaign data, the same as other custom monsters.

## 11. Open questions for review

1. **T2 Rank targets.**
   - Keep 70/85/100 across both bands and trust the rider/reaction pricing?
   - Or raise the T2 targets by about 10 KPS (Rampage 80, Calamity 95) so they land closer to the
     T3 feel in the sim?
2. **PC damage slope.**
   - `2L + 1` is anchored to the templates at level 8, but its slope is an estimate.
   - A flatter `L + 9` would make level-5 kaiju about 25% tougher and level-10 kaiju about 10%
     softer.
   - This is worth a deliberate choice, ideally after Battle Forecast gets per-level templates
     (Finding 5).
3. **Cataclysm's ceiling.** At level 10 the sim gives the party a 68.5% win rate, a close race but
   not a coin flip. Should Cataclysm be a true 50/50? That would mean KPS of about 115.

### Build-phase decisions (not needed to review the theory)

These came out of the builder check. They shape the implementation plan, not the formula.

4. **Saving generated kaiju.** The server-authoritative path for custom monsters is CF-4.6, which
   hasn't shipped. Options:
   - Ship generate, view, and share-link first, and add **Save** once CF-4.6 lands (my
     recommendation).
   - Wait for CF-4.6.
   - Build the needed slice of CF-4.6 inside this work.
5. **Battle Forecast parser fixes.** Teaching `monster-to-sim` about `Emanation`, reactions,
   auras, and once-per-round legendary options changes forecasts for existing monsters too.
   - My recommendation: gate the kaiju conventions on the `kaiju` tag first, and ship the general
     parser and per-level template fixes as their own change with before/after forecast diffs.
6. **Where it lives.**
   - A ninth tool in the Make group.
   - Or a "Forge a kaiju" mode on /monsters, since the output is a monster. That's my lean: it
     keeps the navigation at eight tools.

## 12. Calls made in this design (check these)

- **Party baseline:**
  - 25% healing allowance on party HP.
  - PC damage `2L + 1`, anchored to the app's class templates at level 8.
- **Rank targets:**
  - KPS 70/85/100 and Endurance 4.5/5/5.5 rounds.
  - Legendary Resistance 2/3/3.
  - Cataclysm adds +1 accuracy.
- **Offense:**
  - The 40/30/20/10 damage split.
  - The Ultimate is once per fight, unlocked by Bloodied, after a full round of Charging.
  - One damaging legendary option per round; the other two are movement or terrain.
  - Riders priced as extra damage. Stun, paralysis, incapacitation, swallow, and instant death
    are banned outright.
- **Stat block format:**
  - **Titan math:** attack bonus and DCs come from the Rank table, not ability scores.
  - Signature shapes: Heavy, Twin, or Pair.
  - Entry cap of 12.
- **Calibration and content:**
  - Equivalent CR uses the 2014 method, shown as secondary information.
  - All sample content is original homebrew.
