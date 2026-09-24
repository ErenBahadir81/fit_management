# T7 – Literature basis for the goal engine (FFMI, muscle-gain model, surplus, recomp, decision rules)

Researched 2026-09-24. Confidence: high = peer-reviewed and repeated across sources; medium = peer-reviewed but thin, or broad practitioner agreement; low = practitioner heuristic or my own calibration.

---

## 1. FFMI

**Formula** (Kouri, Pope, Katz & Oliva 1995, *Clin J Sport Med* 5(4):223-8, "Fat-free mass index in users and nonusers of anabolic-androgenic steroids", https://pubmed.ncbi.nlm.nih.gov/7496846/)
- `FFM = weight × (1 − BF%/100)`
- `FFMI = FFM / height_m²`
- `FFMI_norm = FFMI + 6.1 × (1.8 − height_m)`. The PubMed abstract prints 6.3, but the paper text and almost every later use (Nuckols 2016, https://gregnuckols.com/2016/12/11/ffmi/) give 6.1. **Use 6.1.** Confidence: high.
- In Kouri 1995, natural men (n=74) topped out at about 25.0 normalized. Pre-steroid Mr. America winners averaged 25.4. Nuckols points out that the raw data had a few natural lifters above 25 and that the height correction is somewhat arbitrary. So 25 is a soft ceiling ("very rare past here"), not a hard limit.

**Population reference** (Schutz, Kyle & Pichard 2002, *Int J Obes* 26:953-60, "Fat-free mass index and fat mass index percentiles in Caucasians aged 18-98 y", https://pubmed.ncbi.nlm.nih.gov/12080449/): median FFMI at age 18–34 is **18.9 for men and 15.4 for women** (raw, not normalized). The difference between the sexes is about 3.5.

**Female athletes:** NCAA collegiate female athletes average 16.9 ± 1.7 (range 13.3–25.5) (Blue et al. 2019, *J Sports Sci* 37(15), https://pubmed.ncbi.nlm.nih.gov/30893018/). A larger female collegiate cohort averages 18.8 ± 2.1 ("Upper and lower thresholds of FFMI in a large cohort of female collegiate athletes", *J Sports Sci* 2019, https://digitalcommons.lindenwood.edu/faculty-research-papers/121/). Practitioner charts (leanffmi.com, ffmicalculator.io, gymnation) put the women's natural ceiling at about 21–22.

**Recommended bands.** Men use normalized FFMI. Women use the men's edges minus 3.5, based on the Schutz median gap.

| Band | Men (FFMI_norm) | Women (FFMI) |
|---|---|---|
| Low / below average | < 18 | < 14.5 |
| Average | 18 – 20 | 14.5 – 16.5 |
| Above average (trained look) | 20 – 22 | 16.5 – 18.5 |
| Excellent | 22 – 23 | 18.5 – 19.5 |
| Advanced (near natural ceiling) | 23 – 25 | 19.5 – 21.5 |
| Beyond typical natural | > 25 | > 21.5 |

Confidence: men's edges medium-high (strong consensus, anchored on Kouri and Schutz). Women's edges medium: they are anchored on Schutz 15.4 and the athlete means of 16.9 and 18.8, but no peer-reviewed "bands" exist for women.

---

## 2. Natural muscle-gain rate

| Model | Year 1 | Year 2 | Year 3 | Year 4+ |
|---|---|---|---|---|
| Lyle McDonald (men) – bodyrecomposition.com/muscle-gain/genetic-muscular-potential | 9–11 kg (20–25 lb) | 4.5–5.5 kg | 2–3 kg | ~1 kg/yr |
| Alan Aragon (men), %BW/month | 1–1.5 % | 0.5–1 % | 0.25–0.5 % (advanced) | 0.25–0.5 % |
| Aragon (women) | 0.5–0.75 % | 0.25–0.5 % | ≤ 0.25 % | |
| Andy Morgan / RippedBody (total scale gain target, %BW/month) – rippedbody.com/updated-bulking-guidelines | 2 % (first months), 1.5 % novice | 1 % intermediate | 0.5 % advanced | |
| MacroFactor bulking calculator, total gain %BW/week "happy medium" (conservative–aggressive) – macrofactor.com/bulking-calculator | 0.5 % (0.2–0.8) | 0.325 % (0.15–0.575) | 0.15 % (0.1–0.35) | |

**Averaged muscle-only (lean tissue) rate for men:** beginner **≈ 1.0 kg/month (≈1.25 %BW/mo)**, intermediate **≈ 0.45 kg/month (≈0.6 %BW/mo)**, advanced **≈ 0.2 kg/month (≈0.3 %BW/mo)**. Confidence: medium. These are practitioner models, but they agree with each other and with a total career gain of 18–23 kg.

**Women.** Lyle and Aragon put women at about 50% of men in absolute kg (career total 8–10 kg). Meta-analyses find that *relative* hypertrophy is similar between sexes (Roberts et al. 2020, *JSCR* 34(5):1448-60, "Sex Differences in Resistance Training: A Systematic Review and Meta-Analysis", ES 0.07, n.s., https://journals.lww.com/nsca-jscr/fulltext/2020/05000/sex_differences_in_resistance_training__a.30.aspx). Refalo et al. 2025 (Bayesian meta-analysis, https://pmc.ncbi.nlm.nih.gov/articles/PMC11869894/) found larger absolute gains in men with similar relative gains. Because women carry about 65–70% of men's FFM, absolute gains come out at roughly 55–70%. **Use 0.6 × men's kg** as the consensus value. Confidence: medium.

**Ceiling formulas**
- Berkhan: max stage weight (kg, ≤5% BF, men) ≈ height_cm − 100. Confidence: low-medium (a heuristic).
- Casey Butt (*Your Muscular Potential*), men, imperial: `maxLBM_lb = H_in^1.5 × (sqrt(wrist_in)/22.6670 + sqrt(ankle_in)/17.0104) × (1 + BF%/224)`. This needs wrist and ankle measurements, so keep it optional. It is often described as more conservative (Lyle). Sources: https://bonytobeastly.com/maximum-muscular-potential-calculator/ and https://www.fitmatic.com/body/calculators/maximum-muscular-potential. Confidence: medium.
- **FFMI-based ceiling (recommended in code, needs only height):** `LBM_max = FFMI_ceiling_model × h²`. For men, use normalized FFMI and convert back: `FFMI_raw_ceiling = 24.5 − 6.1×(1.8 − h)`.

**Tapering function (exponential approach to the ceiling).** Lyle's model halves every year: 10 → 5 → 2.5 → 1.25 kg. That is exactly first-order kinetics:

```
gap(t)      = LBM_max − LBM(t)
dLBM/dt     = gap / τ,  τ = 1/ln2 years ≈ 17.3 months
LBM(t)      = LBM_max − (LBM_max − LBM0) · 2^(−t_years)
monthly gain = gap × (1 − 2^(−1/12)) = gap × 0.0561
```

Calibration check for a man at FFMI 19, 1.80 m, with ceiling 24.5: gap = 5.5 × 3.24 = 17.8 kg. That gives about 8.9 kg in year 1, 4.5 in year 2 and 2.2 in year 3, total about 18 kg, which matches Lyle (18–23 kg) and Aragon (month 1 ≈ 1.0 kg vs 0.75–1.1). For a woman at FFMI 15.4, 1.65 m, with ceiling 20.0: gap = 4.6 × 2.72 = 12.5 kg, about 6.3 kg in year 1, or about 65% of the man's figure (inside the 50–70% consensus). This one formula covers training level automatically, with no separate beginner/intermediate switch. The level can still be shown in the UI by mapping gap/(LBM_max − LBM_untrained) to > 0.66 beginner, 0.33–0.66 intermediate, < 0.33 advanced. Optional detraining ("muscle memory") bonus: allow rates up to 1.5× the model when the user reports prior training above their current FFMI. Confidence: model form medium, calibration low-medium.

Also apply a realism factor `adherence = 0.8` when projecting timelines, because averages from literature assume well-run training. Confidence: low (a judgment call).

---

## 3. Energy cost of gain and surplus

- **Energy density used in models** (Hall 2008, *Int J Obes* 32:573-6, "What is the required energy deficit per unit weight loss?", https://www.nature.com/articles/0803720): fat tissue component **ρF ≈ 9,400 kcal/kg (39.5 MJ)**, lean **ρL ≈ 1,800 kcal/kg (7.6 MJ)**. The classic rule for adipose *tissue* is about **7,700 kcal/kg** (3,500 kcal/lb). Confidence: high.
- **Muscle tissue** is about 75% water, 20% protein and 5% fat, which stores about 5,000–5,200 kJ (≈1,200–1,250 kcal) per kg. Adding the synthesis cost, textbooks quote a need of roughly 2,000–2,800 kcal per kg of muscle gained (Slater et al. 2019, *Front Nutr* 6:131, "Is an Energy Surplus Required to Maximize Skeletal Muscle Hypertrophy Associated With Resistance Training", https://pmc.ncbi.nlm.nih.gov/articles/PMC6710320/). Slater and colleagues also give a practical surplus of about 1,500–2,000 kJ/day (≈360–480 kcal) for weight-stable athletes. Confidence: medium.
- **Iraki et al. 2019** (*Sports* 7(7):154, "Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review", https://www.mdpi.com/2075-4663/7/7/154): **10–20% surplus**, target **0.25–0.5% BW/week** for novice and intermediate lifters, and more conservative for advanced lifters. Confidence: high (consensus review).
- **Helms et al. 2023** (*Sports Med Open*, "Effect of Small and Large Energy Surpluses on Strength, Muscle, and Skinfold Thickness in Resistance-Trained Individuals", https://pmc.ncbi.nlm.nih.gov/articles/PMC10620361/): a 15% surplus mainly added more skinfold (fat) than a 5% surplus, with no clear extra muscle in trained lifters. Confidence: medium (n=21).
- **Practical mixed-gain cost:** RippedBody uses about 100 kcal/day per lb/month, which is ≈ 220 kcal/day per kg/month ≈ 6,600 kcal per kg of scale gain, plus about 150 kcal/day for rising NEAT. The theoretical figure at 55:45 lean:fat is 0.55×2,500 + 0.45×9,400 ≈ 5,600 kcal/kg. **Use 6,000 kcal per kg of scale gain** (≈200 kcal/day per kg/month). Confidence: medium.
- **Partitioning (share of gain that is lean):**
  - Forbes, in sedentary overfeeding: about 38% lean.
  - MacroFactor's review of lifter studies: intermediates at moderate rates 70–75% lean. Experienced lifters 85% lean when gaining slowly and 65% when gaining fast.
  - SBS (strongerbyscience.com/p-ratios) found the body-fat effect on the lean share is weak in lifters.
  - **Recommended model:** `leanFraction = clamp(expectedMuscleRate / plannedWeightGainRate, 0.3, 0.8)`. Anything above muscle capacity is treated as fat. At the recommended rates this gives about 0.6–0.75 for beginners and about 0.4–0.6 for advanced lifters. Confidence: low-medium.
- **Recommended weekly gain (total scale weight)**, averaged from MacroFactor, Iraki and RippedBody:
  - beginner **0.4 %BW/wk** (range 0.25–0.5)
  - intermediate **0.25 %BW/wk** (0.15–0.35)
  - advanced **0.12 %BW/wk** (0.1–0.2)
  - Absolute caps (MacroFactor "happy medium"): 0.4 / 0.26 / 0.12 kg/wk.
  - Women: same %BW, or ×0.75 when using kg caps.
  - Confidence: medium-high.

---

## 4. Recomposition

- Barakat et al. 2020, *Strength Cond J* 42(5):7-21, "Body Recomposition: Can Trained Individuals Build Muscle and Lose Fat at the Same Time?" (https://journals.lww.com/nsca-scj/Fulltext/2020/10000/Body_Recomposition__Can_Trained_Individuals_Build.3.aspx): recomposition also happens in *trained* lifters when training is progressive and protein is ≥ 1.6–2.5 g/kg. It is most likely in untrained, detrained and higher-body-fat people. Confidence: high (qualitative).
- MacroFactor (https://macrofactor.com/recomposition/): muscle gain in a deficit is often possible at **≤ 0.45 kg (1 lb)/week loss**. Avoid deficits **> 500 kcal/day**. Very lean people rarely recomp.
- Typical rates: controlled studies of untrained or overweight lifters in modest deficits report roughly +0.5–1.5 kg lean and −1–3 kg fat over 8–12 weeks (range across the studies Barakat cites). For code: **lean gain ≈ 50% of the model's bulking muscle rate; fat loss from the deficit at ρ = 7,700 kcal/kg.** Confidence: low-medium.
- Recomp settings: calories from **maintenance to −15% (≈ −200 to −400 kcal)**, target −0.0 to −0.5 %BW/wk, protein **2.0–2.4 g/kg**.
- Recomp candidates (all of these): training age < 1 yr or detrained; FFMI below the "above average" band (men_norm < 20, women < 16.5); BF men 15–25% or women 23–33%.

---

## 5. Protein

- Morton et al. 2018, *Br J Sports Med* 52:376-84 (https://pubmed.ncbi.nlm.nih.gov/28698222/): gains plateau at **1.62 g/kg/day** (95% CI 1.03–2.20). 49 RCTs, n=1,863. Confidence: high.
- Helms, Aragon & Fitschen 2014, *JISSN* 11:20 (https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/): in a deficit, **2.3–3.1 g/kg of lean body mass**, higher as the person gets leaner. Weight loss of **0.5–1 %BW/week**. Fat 15–30% of kcal. Confidence: high.
- Iraki 2019, off-season: 1.6–2.2 g/kg, 0.40–0.55 g/kg per meal, fat 0.5–1.5 g/kg, carbohydrate ≥ 3–5 g/kg.
- **Code:** bulk 1.8 g/kg BW (range 1.6–2.2). Recomp 2.2 g/kg BW. Cut 2.6 g/kg FFM (2.3–3.1). For high body fat (men > 25%, women > 35%), dose on FFM or goal weight instead of total weight.

---

## 6. Goal recommendation rule (BF% + FFMI)

There are no RCT-derived thresholds. This is practitioner consensus (Helms and the Muscle & Strength Pyramid, Aragon, MacroFactor, Bigger Leaner Stronger "don't bulk above 15%, cut at 15–17%, bulk again from ~10%", Menno Henselmans). SBS (Nuckols, strongerbyscience.com/p-ratios) argues body fat barely changes the lean share in lifters, so treat thresholds as health and aesthetics guidance, not as a partitioning law. Confidence: medium-low. Women's thresholds are the men's + 8–10 points; use +8.

| Men BF% | Women BF% | Recommendation | FFMI modifier |
|---|---|---|---|
| ≥ 25 | ≥ 33 | **Cut** (0.5–1 %BW/wk) | none |
| 20–25 | 28–33 | **Cut**. If beginner *and* FFMI low → **recomp** acceptable | |
| 15–20 | 23–28 | FFMI low (men < 20 / women < 16.5) → **recomp or slow lean bulk**. FFMI ≥ above-average → **mini-cut to ~15/23 then lean bulk**, or maintain | |
| 10–15 | 18–23 | **Lean bulk** | FFMI in advanced band → slow bulk (0.1–0.15 %/wk) or maintain |
| < 10 | < 18 | **Bulk** (lean-bulk rates) | |

FFMI messages:
- FFMI in the "low/average" band: "muscle gain is the higher-leverage goal; progress will be fast."
- FFMI in the advanced band: "near your ceiling; muscle gains will be slow, so improve by leaning out and keep expectations modest."

Ideal bulk end point: men about 18–20%, women about 26–28% (then cut).

---

## 7. Ahead / behind plan detection

- **Day-to-day weight noise:** about ±1–2 kg (1–2 %BW) intraday. Morning-to-morning SD is about 0.3–0.5 kg (≈0.5 %BW). Week-to-week fluctuation in normal-weight adults is about 0.4 %BW. There is a weekly rhythm, with weight highest on Sunday/Monday (Orsama et al. 2014, *Obes Facts*, "Weight Rhythms", https://pmc.ncbi.nlm.nih.gov/articles/PMC5644907/). The noise *is* the size of a whole week's bulk target (0.25–0.5 %BW). Confidence: medium.
- **Starting a bulk:** the first 1–2 weeks carry a glycogen, water and gut-content jump of about 0.5–2 kg (RippedBody). **Exclude week 1 from rate estimation.** The same applies to the opposite drop when a cut starts.
- **Trend:** use an exponential moving average of daily weights with **α ≈ 0.1** (Hacker's Diet / MacroFactor style), or a linear regression slope over the last 14–21 days.
- **When to adjust:**
  - MacroFactor adjusts weekly but with heavy damping.
  - Helms/Pyramid say average 2–3 weigh-ins per week and adjust when the multi-week average is off.
  - RippedBody waits about 5 weeks on a bulk.
  - **Consensus:** evaluate after **≥ 3 weeks of data (excluding week 1)** and adjust calories in steps of **~5% (≈100–200 kcal/day)**.
- **Ahead/behind rule for code:** status = on track if `|slope_actual − slope_plan| ≤ max(0.1 %BW/wk, 0.1 kg/wk)`. Otherwise ahead or behind, and flag it only after 3 or more evaluable weeks.
  - Rolling re-projection: `remaining = (target − trendNow) / slope_actual` gives the new ETA.
  - For bulks, if slope_actual > 1.5 × plan, warn about excess fat and suggest −150 kcal. If slope_actual < 0.5 × plan, add +150 kcal.
  - Confidence: medium-low (a heuristic).

---

## 8. Judging a recomp from body-fat measurements (added 2026-09-24)

**Why weight cannot be used.** A recomp targets a change of 0 to −0.5 %BW a week (§4). The engine
plans about −0.2 kg a week, which is inside the weekly scale noise (§7). What a recomp changes is
composition. The engine's recomp plans move body fat about 0.25–0.3 points a week and lean mass
about +0.05–0.1 kg a week. Controlled studies report roughly +0.5–1.5 kg lean and −1–3 kg fat over
8–12 weeks (Barakat 2020, §4). So progress has to come from body fat and the lean mass derived from
it, and these have to be judged against their own noise.

**How precise the app's body fat is.** The app measures body fat with the Navy tape method.
- Trained observers reproduce the circumference estimate within **±1 %BF**. Sources: Hodgdon &
  Friedl 1999, *Development of the DoD Body Composition Estimation Equations*, NHRC; cited by
  Potter, Tharion, Holden et al. 2022, *Front Physiol* 13:868627, "Circumference-Based Predictions
  of Body Fat Revisited", https://pmc.ncbi.nlm.nih.gov/articles/PMC9008774/. Confidence: medium-high.
- Self-measured circumferences are noisier. Barrios, Martin-Biggers, Quick & Byrd-Bredbenner 2016,
  *BMC Med Res Methodol* 16:49, "Reliability and criterion validity of self-measured waist, hip, and
  neck circumferences", https://pmc.ncbi.nlm.nih.gov/articles/PMC4855335/, reports the technical error
  of duplicate self-measurements:
  - waist 0.76 in (1.9 cm)
  - hip 0.38 in (1.0 cm)
  - neck 0.24 in (0.6 cm)
  - trained technicians: 0.22 / 0.20 / 0.08 in

  In the Navy equation, one cm of (waist − neck) is about 0.75–0.8 body-fat points for a man, and
  one cm of (waist + hip − neck) is about 0.5 points for a woman. So one self-measured reading
  carries **≈ 1.5 points (men) / ≈ 1.1 points (women)** of noise (1 SD). Confidence: medium (my own
  propagation of a peer-reviewed technical error of measurement).
- Tape tracks *change* poorly. Foulis, Friedl, Spiering et al. 2023, *Front Physiol* 14:1183836,
  "Body composition changes during 8 weeks of military training are not accurately captured by
  circumference-based assessments", https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1183836/full,
  followed n = 1,407 recruits over 8 weeks of training:
  - DXA: −3.3 %BF (men), −4.0 %BF (women)
  - tape: −2.2 %BF (men), 0.0 %BF (women)
  - a change of ≥ 1 point was classified correctly for 83 % of men and 56 % of women

  So one or two readings cannot judge a recomp; a trend over several weeks can. Confidence: high.
- For comparison, the least significant change between two DXA scans is 2.77 × the precision error
  (95 %) (Slart et al. 2024, *Eur J Nucl Med Mol Imaging*, "Updated practice guideline for DXA",
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11732917/).

**Rule in code (`bodyFatTrend`, docs/plan/11 §Recomp on body fat).**
- **Readings.** Take the readings since the plan (re)started, from the last 112 days: one per day,
  then one per week (the week's mean). Several tapings in one week share technique and bloating,
  so they are not independent; treating them as independent would inflate the evidence about
  twofold for someone who tapes daily.
- **Residuals.** For each weekly reading, the residual is the measured value minus the plan's
  expected body fat (and lean mass) on that day. A least-squares line goes through the residuals.
- **Pace and level.** The line's slope is the *pace gap* (observed minus planned change a week).
  Its value at the latest reading is the *level gap*. The plan is drawn from one start reading,
  which is itself off by up to ±σ. That error shifts every residual equally, so it moves the level
  gap but cannot bias the pace gap.
- **Why the verdict rests on pace.** A simulation that made the start reading as noisy as the
  others showed what happens when the level gap alone decides (at z = 2.25 × its SE): 17 % (σ 1)
  to 44 % (σ 1.6) of people who were exactly on plan got a wrong calorie proposal.
- **When it counts.** The pace gap must exceed 2.25 standard errors. The noise is max(1.5 points,
  the person's own scatter); for lean mass it is weight/100 × √(1.5² + 0.5²) kg, where 0.5 is
  scale noise in %BW (Orsama 2014, §7). The level gap must also be at least 1 point the same way:
  the tape's reproducibility and Foulis's ≥ 1-point criterion. For lean mass that floor is 1 kg.
- **Past the plan's end.** The plan now expects the target itself, and the target is absolute, so
  no start reading can bias the comparison. The level still above the target counts with the same
  z and tolerance. The estimate is the mean of the readings since the end (SE σ/√n); until there
  are 3 of them it is the smoothed line, else this plan's own fitted line. Only a pace shown to be
  slow recommends fewer calories. Otherwise the recommendation is a fresh plan with a new pace:
  the plan ran out of time, or started from a low reading.
- **Minimum data.** At least 3 weeks with readings spanning ≥ 21 days (§7's "≥ 3 weeks"), the
  latest ≤ 14 days old. In practice the pace test needs about 10 or more weekly readings: at ±1.5
  points, a pace gap of 0.28 points a week only clears 2.25 SE once Σ(t − t̄)² ≳ 150 week².
- **Stalled.** "Stalled" means body fat falls < 0.05 points a week, the body-fat counterpart of
  the cut's 0.1 kg / 14 days. Tape noise can flip a verdict between "stalled" and "behind", so
  they share one proposal id.
- **Proposals.** A proposal needs the same verdict at the previous weekly reading, the counterpart
  of the cut's "today and 7 days ago" rule. It also needs a reading newer than the last answer, and
  the 21-day cool-down still applies.
- **Reached.** "Reached" needs the latest reading at the target and the smoothed body fat at the
  target too. The smoothed value is the line through the goal's weekly readings in the window
  (counted from the goal start, so a re-plan does not reset it), read at the latest one, from at
  least 3 weeks of readings. With 1.5 points of noise, someone 1 point above target reads at or below it
  on about 25 % of single readings. The smoothed value also drives the goal bar and the projection,
  as the weight trend does on a cut.
- Confidence: medium-low. The structure is standard regression; the calibration is mine (below).

**Calibration (simulation, own work, low-medium confidence).** The setup:
- a man, 85 kg, 20 → 15 %, over an 18-week plan (≈ 0.28 points a week)
- the start reading as noisy as the others (the plan is drawn from it)
- Gaussian tape noise σ on each reading, 0.4 kg scale noise
- proposals checked at every reading from week 3 to the end of the plan

The columns show the share of people on plan who ever got a wrong proposal, and the share of full
stalls (body fat flat) and of lean loss (−0.35 kg a week, body fat on plan) that were caught.

| noise floor / pace z / window | on plan σ 1.0 weekly | on plan σ 1.6 weekly | on plan σ 1.0 fortnightly | stall caught σ 1.0 weekly (median week) | stall caught σ 1.6 weekly | stall caught σ 1.0 fortnightly | lean loss caught |
|---|---|---|---|---|---|---|---|
| 1.5 / 2.0 / 112 d | 0 % | 10 % | 0.3 % | 100 % (12) | 91 % | 75 % | 100 % (9) |
| **1.5 / 2.25 / 112 d (chosen)** | **0 %** | **4.7 %** | **0 %** | **99 % (13)** | **85 %** | **64 %** | **99 % (10)** |
| 1.5 / 2.25 / 56 d | 0 % | 4 % | 0 % | 31 % (13) | 50 % | 3 % | 91 % (12) |
| 1.0 / 2.25 / 112 d | 4.7 % | 9.7 % | 1.3 % | 100 % (11) | 90 % | 87 % | 100 % (9) |

The simulation was run again for 12 weeks past the plan's end. There, people whose pace was on plan
but whose plan started from a low reading sit above the target, and 19 % (σ 1) to 33 % (σ 1.6) of
them get a proposal. Almost all of these recommend a re-plan (more time), not a calorie change.
Over the whole period, calorie changes recommended to people on pace stay at 0 % (σ 1) and ≈ 5 %
(σ 1.6). Full stalls get a calorie cut in 97–100 % of cases. A stall that starts at week 12 of 18
is caught about 4 weeks after the end.

A proposal is never applied silently (§2 of the sprint hand-off), but a wrong calorie proposal still
costs trust. That is why the chosen row keeps false alarms at ≤ 5 % even for noisy self-measurers.
For a slow recomp, catching a stall a week or two later costs little. The limit is the method, not
the rule: with ±1.5-point readings a recomp's pace cannot be read in fewer than about ten weeks.
Two things would shorten that: a better start (for example, the plan drawn from the mean of two
readings) or a more precise measurement.

---

## Recommended constants

| Constant | Value | Source | Confidence |
|---|---|---|---|
| FFMI_HEIGHT_NORM_COEF | 6.1 (per m, ref 1.80 m) | Kouri 1995; Nuckols 2016 | high |
| FFMI_BANDS_MEN (norm) | [18, 20, 22, 23, 25] | Kouri 1995, Schutz 2002, practitioner consensus | medium-high |
| FFMI_BANDS_WOMEN (raw) | [14.5, 16.5, 18.5, 19.5, 21.5] | Schutz 2002 (median 15.4), Blue 2019 (16.9), NCAA cohort (18.8) | medium |
| FFMI_MEDIAN_UNTRAINED | men 18.9, women 15.4 | Schutz 2002 | high |
| FFMI_CEILING_MODEL (for rate/ETA) | men 24.5 (norm), women 20.0 | calibrated to Lyle/Aragon | low-medium |
| FFMI_CEILING_DISPLAY | men 25.0, women 21.5 | Kouri 1995; practitioner consensus | medium |
| MUSCLE_GAIN_HALF_LIFE_YEARS | 1.0 (τ = 1/ln2 yr = 17.3 mo) | Lyle McDonald model | medium |
| MUSCLE_GAIN_MONTHLY_FRACTION_OF_GAP | 0.0561 | derived (1 − 2^(−1/12)) | medium |
| MEN_MUSCLE_KG_PER_MONTH by level | beg 1.0 / int 0.45 / adv 0.2 | Lyle, Aragon average | medium |
| WOMEN_VS_MEN_ABS_GAIN | 0.6 | Lyle/Aragon 0.5; Roberts 2020 and Refalo 2025 relative ≈ equal | medium |
| PROJECTION_ADHERENCE | 0.8 | judgment | low |
| KCAL_PER_KG_FAT_TISSUE | 7,700 (pure fat 9,400) | Hall 2008; classic 3,500 kcal/lb | high |
| KCAL_PER_KG_LEAN_TISSUE (incl. synthesis) | 2,500 (range 1,800–2,800) | Hall 2008 ρL; Slater 2019 | medium |
| KCAL_PER_KG_SCALE_GAIN_BULK | 6,000 (≈200 kcal/day per kg/month) | RippedBody; derived | medium |
| NEAT_BUFFER_BULK_KCAL | +150/day | RippedBody | low-medium |
| BULK_SURPLUS_PCT | 10% (range 5–20%; advanced 5%) | Iraki 2019; Helms 2023 | high |
| BULK_RATE_PCT_BW_WEEK | beg 0.40 / int 0.25 / adv 0.12 | MacroFactor, Iraki, RippedBody | medium-high |
| BULK_RATE_CAP_KG_WEEK | 0.40 / 0.26 / 0.12 | MacroFactor | medium |
| LEAN_FRACTION_OF_GAIN | clamp(muscleRate / weightRate, 0.3, 0.8) | MacroFactor review; Forbes 0.38 floor | low-medium |
| CUT_RATE_PCT_BW_WEEK | 0.5–1.0 (default 0.7; <12% BF men / <20% women → 0.5) | Helms 2014 | high |
| RECOMP_DEFICIT | 0 to −15% (max −500 kcal) | MacroFactor; Barakat 2020 | medium |
| RECOMP_MUSCLE_RATE_FACTOR | 0.5 × bulk muscle rate | judgment from Barakat review | low |
| PROTEIN_BULK_G_PER_KG | 1.6 (default 1.8, max 2.2) | Morton 2018; Iraki 2019 | high |
| PROTEIN_RECOMP_G_PER_KG | 2.2 | Barakat 2020 | medium |
| PROTEIN_CUT_G_PER_KG_FFM | 2.3–3.1 (default 2.6) | Helms 2014 | high |
| FAT_MIN_G_PER_KG | 0.5 (or ≥ 20% kcal) | Iraki 2019; Helms 2014 | medium-high |
| GOAL_BF_CUT_MEN / WOMEN | ≥ 20 / ≥ 28 (strong ≥ 25 / ≥ 33) | practitioner consensus | medium-low |
| GOAL_BF_BULK_MEN / WOMEN | ≤ 15 / ≤ 23 | practitioner consensus (BLS, Helms) | medium-low |
| BULK_END_BF_MEN / WOMEN | 18–20 / 26–28 | practitioner consensus | low-medium |
| RECOMP_FFMI_MAX | men_norm < 20 / women < 16.5 | derived from bands | low-medium |
| DAILY_WEIGHT_NOISE_SD | 0.5 %BW (≈0.4 kg) | Orsama 2014; general | medium |
| TREND_EMA_ALPHA | 0.1 | Hacker's Diet / MacroFactor-style | medium |
| INITIAL_WATER_JUMP_EXCLUDE_WEEKS | 1 | RippedBody | medium |
| MIN_WEEKS_BEFORE_ADJUST | 3 (evaluable) | Helms Pyramid, MacroFactor, RippedBody (5) | medium |
| ON_TRACK_TOLERANCE | max(0.1 %BW/wk, 0.1 kg/wk) | heuristic | low |
| CALORIE_ADJUST_STEP | 5% (≈100–200 kcal/day) | RippedBody | medium |
| RECOMP_BF_NOISE_PTS (`adaptive.bfNoisePts`) | 1.5 (floor; own scatter wins when larger) | Hodgdon & Friedl 1999 (±1 trained); Barrios 2016 TEM through the Navy equation | medium |
| RECOMP_BF_TOLERANCE_PTS (`bfTolerancePts`) | 1.0 | tape reproducibility; Foulis 2023 ≥ 1-point criterion | medium |
| RECOMP_LEAN_TOLERANCE_KG (`leanToleranceKg`) | 1.0 | ≈ 1 point of body fat at 85–100 kg | low-medium |
| RECOMP_PACE_Z (`bfConfidenceZ`) | 2.25 standard errors of the pace gap | §8 simulation; LSC = 2.77 × precision (Slart 2024) | low-medium |
| RECOMP_MIN_READINGS / SPAN / MAX_AGE | 3 readings / 21 days / 14 days | §7 "≥ 3 weeks"; 3 = fewest with scatter left | medium |
| RECOMP_WINDOW_DAYS (`bfWindowDays`) | 112 | pace needs 10+ readings at ±1.5 points (§8); recomp studies run 8–12+ weeks (Barakat 2020) | low-medium |
| RECOMP_STALL_PTS_PER_WEEK (`bfStallPtsPerWeek`) | 0.05 | counterpart of the cut's 0.1 kg / 14 days | low |
| WEIGH_IN_NOISE_PCT_BW (`weighInNoisePctBw`) | 0.5 | Orsama 2014 (§7) | medium |
