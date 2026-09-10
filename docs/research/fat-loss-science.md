# Fat-Loss Goal Engine — Evidence Base & Recommended Defaults

Research compiled 2026-09-10 for the body-fat GOAL ENGINE.
All rate tables below are intended to be seeded as **admin-editable data**, not hard-coded.
Every number carries a source URL. Where the literature disagrees, the disagreement is stated
explicitly and a default is recommended with a rationale.

---

## 0. Executive summary of the recommended model

```
INPUT:  sex, age, height, weight, Navy tape measurements -> currentBF%
        targetBF% (user-entered)

1.  LBM        = weight x (1 - currentBF%)
2.  goalWeight = LBM / (1 - targetBF%)              # assumes LBM preserved
3.  fatToLose  = weight - goalWeight                 # kg (== fat if LBM held)
4.  totalDeficit = fatToLose x kcalPerKgFat          # kcalPerKgFat = 7700 default
5.  weeklyRate = min( rateTable(sex, currentBF%) x weight ,
                      maxKgPerWeek ,
                      alpertCap(fatMass) )
6.  weeks      = iterate week-by-week (rate re-looked-up as BF% falls)
7.  dailyTarget = max( TDEE_week - dailyDeficit_week , calorieFloor )
8.  recalibrate TDEE weekly from (avg intake, EWMA weight trend)
```

The engine must apply **four simultaneous caps**, taking the minimum:
percentage-of-bodyweight rate, absolute kg/week ceiling, Alpert physiological fat-mobilisation
cap, and the calorie floor. Section 8 has the full pseudocode.

---

## 1. Energy content of body fat — the 7700 kcal/kg (3500 kcal/lb) convention

### 1.1 Origin — Wishnofsky 1958

Max Wishnofsky, *"Caloric equivalents of gained or lost weight"*, Am J Clin Nutr 1958;6:542–546.
DOI: https://doi.org/10.1093/ajcn/6.5.542

Hall traces the rule directly to Wishnofsky: *"The origin of this rule can be traced back to a
calculation that assumes exclusive loss of adipose tissue consisting of 87% fat."*
— Hall KD, *What is the required energy deficit per unit weight loss?* Int J Obes 2008;32:573–576.
Free full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744/

The rule as stated: **3500 kcal per pound = 32.2 MJ per kg = 7700 kcal per kg of body weight lost.**
(32.2 MJ/kg ÷ 4.184 = 7696 kcal/kg.)

### 1.2 The physically correct energy densities (Hall 2008)

| Tissue / substrate | Metabolisable energy density | kcal/kg | kcal/lb |
|---|---|---|---|
| Body **fat** (triglyceride), ρ_F | 39.5 MJ/kg | **9441** | 4282 |
| **Lean body mass change**, ρ_L (protein + associated water) | 7.6 MJ/kg | **1816** | 824 |
| Body glycogen | 17.6 MJ/kg | 4207 | 1908 |
| Body protein | 19.7 MJ/kg | 4708 | 2136 |
| "3500 kcal rule" mixed tissue | 32.2 MJ/kg | **7696** | 3500 |

Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744/ (Hall 2008, ρ_L derivation uses a protein
hydration coefficient h = 1.6 g H2O per g protein).

MacroFactor states the same decomposition plainly:
> *"Fat has an energy density of about 39.5 MJ/kg (or about 4282 Calories per pound), and lean tissue
> has an energy density of about 7.6 MJ/kg (or about 824 Calories per pound). So, the '3500 Calorie
> rule' tacitly assumes that, when you gain or lose weight, about 78% of the weight you gain or lose
> is fat tissue, and about 22% of the weight you gain or lose is lean tissue."*
— https://macrofactor.com/expenditure-v3/

**This is the single most important subtlety for our engine.** 7700 kcal/kg is *not* the energy
content of a kg of fat — it is the energy content of a kg of *typical mixed weight loss*
(~78% fat / 22% lean). A kg of pure metabolised triglyceride is **9441 kcal**.

### 1.3 The critiques

**(a) Hall & Chow 2013, "Why is the 3500 kcal per pound weight loss rule wrong?"**
Int J Obes 37:1614. https://www.nature.com/articles/ijo2013112
> *"The most serious error of the 3500-kcal rule is its failure to account for dynamic changes in
> energy balance that occur during an intervention... In reality, ΔEB is dynamic and, if accurately
> estimated over time, then the above equation provides a reasonable estimate of weight change."*

Key nuance: Hall does **not** say the energy-density constant is wrong. He says the constant is fine
if you feed it a *dynamically updated* energy balance. Applying a *static* initial deficit for
6 months is what breaks. This is exactly why our engine needs Section 5's weekly recalibration.

**(b) Thomas et al. 2013**, *Can a weight loss of one pound a week be achieved with a 3500-kcal
deficit? Commentary on a commonly accepted rule.* Int J Obes 37:1611–1613.
https://www.nature.com/articles/ijo201351

**(c) Hall 2008 — the constant is body-fat dependent.**
https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744/
> *"The rule of thumb approximately matches the predicted energy density of lost weight in obese
> subjects with an initial body fat above 30 kg but **overestimates** the cumulative energy deficit
> required per unit weight loss for people with **lower initial body fat**."*

So: obese users need ≈7700–8000 kcal/kg; lean users need **less** (Keys' lean men clustered well
below the 32.2 MJ/kg line). A leanness-graded constant is an optional refinement (see 1.5).

**(d) NIH Body Weight Planner** — the practitioner-facing replacement.
- Tool: https://www.niddk.nih.gov/health-information/professionals/diabetes-discoveries-practice/nih-body-weight-planner
- Model paper: Hall KD et al., *Quantification of the effect of energy imbalance on bodyweight*,
  Lancet 2011;378:826–837. https://pubmed.ncbi.nlm.nih.gov/21872751/
- Web appendix (the actual equations):
  https://www.niddk.nih.gov/-/media/Files/Labs-Branches-Sections/laboratory-biological-modeling/integrative-physiology-section/Hall-Lancet-Web-Appendix_508.pdf
- Hall's rule of thumb from that paper: **every persistent change of 100 kJ/day (≈24 kcal/day) in
  intake produces an eventual body-weight change of ≈1 kg, with half the change reached in ≈1 year
  and 95% in ≈3 years.** We reuse this in Section 5 as the TDEE-per-kg coefficient.
- A 2012 American Society for Nutrition consensus recommended practitioners adopt the NIH BWP model
  and abandon the 3500-kcal rule of thumb.

### 1.4 What evidence-based coaches actually use

- **Helms/Aragon/Fitschen (ISSN, 2014)** still use it as the planning heuristic, with the caveat
  attached: *"Every pound of pure body fat that is metabolized yields approximately 3500 kcals, thus
  a daily caloric deficit of 500 kcals theoretically results in fat loss of approximately one pound
  per week... However, a static mathematical model does not represent the dynamic physiological
  adaptations that occur in response to an imposed energy deficit."*
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/
- **Lyle McDonald**: *"I'll use the standard estimate of a 3500 calorie deficit equaling one pound of
  fat loss... This may not be entirely accurate but will be close enough to make the point."*
  https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit
- **MacroFactor**: *"The 3500 Calorie rule is a decent general heuristic, but it's not strictly true
  in all cases."* They ship it as the conversion constant inside their adjustment engine, precisely
  because the adaptive expenditure loop corrects the residual error.
  https://macrofactor.com/expenditure-v3/

### 1.5 RECOMMENDATION

**Default `kcalPerKgFat = 7700`** (3500 kcal/lb), applied to **kg of body weight to lose**, not to
"kg of pure fat". Rationale:

1. It is the industry-standard planning constant used by every serious evidence-based app/coach.
2. Real weight loss is never 100% fat, so the mixed-tissue density is the *right* number when you
   convert planned weight change ↔ energy.
3. Its known static-model error is fully neutralised by the weekly TDEE recalibration in Section 5 —
   which is the actual fix Hall himself recommends.
4. Using 9441 (pure fat) would over-prescribe deficits by ~23% and make plans feel broken.

Also expose (admin-editable, not used by default):
- `kcalPerKgPureFat = 9441` — for a future "pure fat mass" model.
- `kcalPerKgLeanTissue = 1816` — needed if you ever model lean-mass loss explicitly.
- Optional leanness-graded override (Hall 2008, Fig 1A):

| Initial fat mass | Suggested kcalPerKgBodyWeight |
|---|---|
| < 15 kg | 6600 |
| 15–25 kg | 7100 |
| 25–35 kg | 7700 (default) |
| > 35 kg | 8000 |

Ship the flat 7700 first; the graded table is a v2 refinement.

---

## 2. Maximum rate of fat loss vs. fat mass — Alpert 2005

### 2.1 The primary source, verified

Alpert SS. **"A limit on the energy transfer rate from the human fat store in hypophagia."**
J Theor Biol. 2005 Mar 7;233(1):1–13. doi:10.1016/j.jtbi.2004.08.029
PubMed: https://pubmed.ncbi.nlm.nih.gov/15615615/
ScienceDirect: https://www.sciencedirect.com/science/article/abs/pii/S0022519304004175

Verbatim abstract (fetched from PubMed):
> *"A limit on the maximum energy transfer rate from the human fat store in hypophagia is deduced
> from experimental data of underfed subjects maintaining moderate activity levels and is found to
> have a value of **(290 ± 25) kJ/kg d**. A dietary restriction which exceeds the limited capability
> of the fat store to compensate for the energy deficiency results in an **immediate decrease in the
> fat free mass (FFM)**. In cases of a less severe dietary deficiency, the FFM will not be depleted."*

The paper also reports RMR falling linearly with FFM at a slope of (249 ± 25) kJ/kg·d — relevant to
Section 5 but not to the cap.

### 2.2 Unit conversion — VERIFIED

- 290 kJ ÷ 4.184 = **69.31 kcal**
- **69.3 kcal per kg of fat mass per day** (range 63.3 – 75.3 for ±25 kJ)
- 290 kJ/kg ÷ 2.2046 lb/kg = 131.5 kJ/lb = **31.4 kcal per lb of fat mass per day**
  (range 28.7 – 34.1)

Both of the figures in the brief are correct and are the same number:
**max daily deficit ≈ 31 kcal × fatMass(lb) ≈ 69 kcal × fatMass(kg).**

Independent confirmations of the arithmetic:
- https://baye.com/calculating-the-daily-calorie-deficit-for-maximum-fat-loss/ —
  *"290 kilojoules = 69.31 kilocalories and 1 kilogram = 2.2 pounds, so 290 kJ/kg = 31.4 kcals/lb"*
- https://www.burnthefatfeedthemuscle.com/how-to-lose-a-pound-of-fat-per-day.html —
  *"This says that the limit is 290 +/- 25 KJ/kg/d, which is a maximum energy transfer rate of
  31 kcal/lb of fat per day."*

### 2.3 WORKED EXAMPLE — 103 kg male at 10% BF

```
fatMass   = 103 kg x 0.10          = 10.3 kg  (= 22.71 lb)
LBM       = 92.7 kg

Alpert cap (SI)   = 290 kJ/kg/d x 10.3 kg = 2987 kJ/day = 714 kcal/day
Alpert cap (kcal) = 69.31 x 10.3          = 714 kcal/day
Alpert cap (lb)   = 31.4  x 22.71         = 713 kcal/day        <- agrees
±25 kJ band       = 652 – 775 kcal/day

Weekly ceiling    = 714 x 7 = 4998 kcal / 7700 = 0.65 kg/week
                  = 0.63% of bodyweight per week

Conservative variant (22 kcal/lb, see 2.4):
                  = 22 x 22.71 = 500 kcal/day -> 0.45 kg/week -> 0.44% BW/wk
```

**Sanity check:** the Alpert cap for this lean athlete lands at 0.63% BW/week — almost exactly
where Garthe/Helms/ISSN/MacroFactor independently put the practical recommendation for a lean
trainee (0.5–0.7%). Two completely independent lines of evidence converge. This is a strong
argument for shipping the Alpert cap as a hard constraint alongside the percentage table.

Second example (Venuto's, for contrast — shows the cap only binds on lean people):
280 lb male at 37% BF = 103 lb fat → 31 × 103 = **3193 kcal/day**, i.e. ~6.4 lb/week.
Nobody should diet there; for high-BF users the *percentage table* and the *calorie floor* bind
long before Alpert does.
https://www.burnthefatfeedthemuscle.com/how-to-lose-a-pound-of-fat-per-day.html

### 2.4 Caveats you must encode

1. **Derived from lean, semi-starved men.** Alpert's value came from underfed subjects at moderate
   activity — largely the Keys Minnesota Starvation Experiment cohort. Extrapolating linearly to
   obese individuals is an extrapolation, not a finding.
2. **A claimed erratum: 22 kcal/lb.** Several calculators state Alpert later identified a
   miscalculation and proposed **≈22 kcal/lb·day** (≈48.5 kcal/kg·day), but that he died before
   republishing it: https://www.fatcalc.com/mfl
   ⚠️ I could not locate a published erratum or any peer-reviewed citation for this. Treat it as an
   **unverified secondary claim** — do not present it as Alpert's published value. However, it is a
   sensible *safety factor* (0.70 × the published number) and matches the "cap at ~0.45%/wk for a
   lean person" instinct.
   → **Recommendation: keep `alpertKcalPerKgFatPerDay = 69.3` (the published value) and apply a
   separate admin-editable `alpertSafetyFactor = 0.75`, giving an effective ~52 kcal/kg/day
   (≈23.6 kcal/lb/day).** That is transparent, cites the real paper, and is conservative.
3. **The cap is not a target.** Exceeding it forces FFM catabolism; sitting *at* it for weeks is
   still miserable and still costs lean mass in practice. Use it as a *ceiling*, never as the
   "aggressive" recommendation.
4. **It shrinks as you diet.** Recompute every week from current fat mass. Baye notes it only drops
   ~90 kcal/week even at 3 lb/wk loss, so weekly recomputation is ample:
   https://baye.com/calculating-the-daily-calorie-deficit-for-maximum-fat-loss/

---

## 3. Practical weekly-loss guidelines as a function of body-fat %

### 3.1 Lyle McDonald's category system

Lyle stratifies every diet protocol in his books by starting body-fat category. Thresholds
(as reproduced by PSMF implementations of the *Rapid Fat Loss Handbook*):

| Category | Men | Women |
|---|---|---|
| **Category 1** (lean) | ≤ 15% | ≤ 24% |
| **Category 2** (average) | 16–25% | 25–34% |
| **Category 3** (overweight/obese) | ≥ 26% | ≥ 35% |

- Book: https://store.bodyrecomposition.com/shop/rapid-fat-loss-handbook/
  (*"easy-to-understand categories depending on your starting point in bodyfat, weight and fitness level"*)
- Threshold reproduction: https://everycalculators.com/lyle-mcdonald-psmf-calculator.html
- Why the categories exist, in Lyle's own words:
  > *"Many if not most aspects of physiology change as people get leaner and this is one of them.
  > It's also why almost all of my books use a Category system based on bodyfat percentage for diet
  > set up."* — https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat

Lyle's rate guidance:
- *"For a long time I suggested **1–1.5 lbs/week as the 'sweet spot'** for weekly weight loss for
  leaner individuals. It's still not a bad value for people on a moderate deficit."*
- *"True fat losses of **2–3 lbs/week in lean individuals** without significant or any muscle loss is
  achievable for at least short periods of time... **but it's a couple of weeks tops** before a break
  has to be taken."*
- On lean-mass risk: *"Some early work suggested that, when you were lean, you'd lose roughly
  **1 pound of muscle for every 3 pounds total weight lost** — that is, up to 33% of your total
  weight loss might be muscle."*
- https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat

Lyle's deficit sizing (percentage-based, which is what our engine should mirror):
| Deficit | % below maintenance |
|---|---|
| Small | 10–15% |
| Moderate | 20–25% |
| Large | > 25% |
- https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit
- Generic fat-loss starting point: ~10–12 cal/lb bodyweight (a 20% cut from ~15 cal/lb maintenance):
  https://bodyrecomposition.com/fat-loss/4-fat-loss-fundamentals

### 3.2 Helms, Aragon & Fitschen 2014 (ISSN — natural bodybuilding contest prep)

J Int Soc Sports Nutr 2014;11:20. https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/
PubMed: https://pubmed.ncbi.nlm.nih.gov/24864135/

> *"Caloric intake should be set at a level that results in bodyweight losses of approximately
> **0.5 to 1%/wk** to maximize muscle retention."*

Their recommendations table row: `Weekly weight loss (% of body weight) | 0.5–1%`

Crucially, they make the leanness gradient explicit:
> *"It must also be taken into consideration that **the leaner the competitor becomes the greater the
> risk for LBM loss**. As the availability of adipose tissue declines the likelihood of muscle loss
> increases, thus it may be best to pursue a **more gradual approach to weight loss towards the end**
> of the preparation diet compared to the beginning."*
> *"Ample time should be allotted to lose body fat to avoid an aggressive deficit and the length of
> preparation should be tailored to the competitor; **those leaner dieting for shorter periods than
> those with higher body fat percentages**."*

And on deficit size vs. tissue lost:
> *"While greater deficits yield faster weight loss, the percentage of weight loss coming from lean
> body mass (LBM) tends to increase as the size of the deficit increases."*

### 3.3 Garthe et al. 2011 — the key RCT (0.7%/wk vs 1.4%/wk)

Garthe I, Raastad T, Refsnes PE, Koivisto A, Sundgot-Borgen J. *Effect of two different weight-loss
rates on body composition and strength and power-related performance in elite athletes.*
Int J Sport Nutr Exerc Metab. 2011;21(2):97–104. doi:10.1123/ijsnem.21.2.97
https://pubmed.ncbi.nlm.nih.gov/21558571/

| | Slow reduction (SR) | Fast reduction (FR) |
|---|---|---|
| n | 13 | 11 |
| Target rate | **0.7% BW/wk** | **1.4% BW/wk** |
| Achieved rate | 0.7 ± 0.8 %/wk | 1.0 ± 0.4 %/wk |
| Duration | 8.5 ± 2.2 wk | 5.3 ± 0.9 wk |
| Energy intake reduction | 19 ± 2% | 30 ± 4% |
| Total BW lost | 5.6 ± 0.8% | 5.5 ± 0.7% |
| **Fat mass change** | **−31 ± 3%** | **−21 ± 4%** |
| **Lean body mass change** | **+2.1 ± 0.4%** (p<0.001) | **−0.2 ± 0.7%** (n.s.) |

Both groups lost the same total weight; the slow group lost **half again as much fat** and *gained*
lean mass. All athletes did 4 resistance sessions/week.
> *"Athletes who want to gain LBM and increase 1RM strength during a WL period combined with strength
> training should aim for a weekly BW loss of 0.7%."*

Helms adds a detail from the same trial worth encoding: *"small amounts of LBM were **lost among
leaner subjects** in the faster loss group"* — i.e. the penalty for going fast is leanness-dependent.

Companion strength-trained-women study cited by Helms: a 1 kg/wk vs 0.5 kg/wk comparison over 4 weeks
produced a **5% drop in bench press strength and a 30% greater reduction in testosterone** in the
faster group.

### 3.4 ISSN Position Stand: Diets and Body Composition (Aragon et al. 2017)

J Int Soc Sports Nutr 2017;14:16. https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y
Springer: https://link.springer.com/article/10.1186/s12970-017-0174-y

Position statement point 3, verbatim:
> *"Diets primarily focused on fat loss are driven by a sustained caloric deficit. **The higher the
> baseline body fat level, the more aggressively the caloric deficit may be imposed. Slower rates of
> weight loss can better preserve lean mass (LM) in leaner subjects.**"*

Discussion section, verbatim:
> *"The higher the baseline FM level, the more aggressively the caloric deficit may be imposed. As
> subjects get leaner, slower rates of weight loss can better preserve LM, as in Garthe et al.'s
> example of a weekly reduction of 0.7% of body weight outperforming 1.4%. Helms et al. similarly
> suggested a weekly rate of 0.5–1.0% of body weight for bodybuilders in contest preparation."*

**This is the single best citation for the whole design of a BF%-indexed rate table.** It is a formal
position stand explicitly endorsing "rate should scale with starting body fat".

Protein: *"Higher protein intakes (**2.3–3.1 g/kg FFM**) may be required to maximize muscle retention
in lean, resistance-trained subjects under hypocaloric conditions."*

### 3.5 MacroFactor — the most directly reusable published table

https://macrofactor.com/cutting-calculator/

| | Very Conservative | Conservative | Moderate | Slightly Aggressive | Aggressive |
|---|---|---|---|---|---|
| **% bodyweight / week** | 0.10% | 0.25% | **0.5–0.75%** | 1.00% | 1.5%* |
| **Relative energy deficit** | <5% | 5–10% | 10–20% | 20–30% | >30% |

\* *"We'd recommend to keep your rate of weight loss below 2 pounds or 1 kilogram per week."*

Supporting reasoning, verbatim:
> *"A 2021 meta-analysis by Murphy and Koehler found that losses in lean mass increased as the size
> of daily energy deficits increased. With energy deficits **smaller than about 500 Calories per day**
> (which would equate to losing about 1 pound or 0.5kg per week), subjects (on average) were able to
> experience a bit of body recomposition... For most people, this would result in a rate of weight
> loss of about **0.5–0.8% of body weight per week**."*
> *"If your main priority is to lose fat as quickly as possible while retaining your fat-free mass, a
> rate of weight loss of around one pound/half a kilogram per week, or **around 0.6–0.7% of body
> weight per week** should do the trick."*
> *"For most people, most of the time, a rate of weight loss in the range of **0.25–1% of body weight
> per week**, or between 0.5–1.5 pounds (0.25–0.75kg) per week should be the default."*

And a critical scaling warning our engine must implement:
> *"I'd caution against scaling percentages of body weight infinitely... if you weigh 150 pounds,
> losing 1% of your body weight per week would require an energy deficit of about 750 Calories per
> day. However, if you weigh 300 pounds, aiming to lose 1% of your body weight per week would require
> an energy deficit of 1500 Calories per day... a relative energy deficit of about 31% for the person
> who weighs 150 pounds [vs] around 42% for the person who weighs 300 pounds... A ~30% energy deficit
> is fairly aggressive, but it's typically relatively tolerable and sustainable, whereas an energy
> deficit of >40% usually feels rough."*
> *"We think a rate of weight loss of about **2 pounds or 1 kilogram of body weight per week serves as
> a good 'upper limit' for most people, most of the time.** Once daily energy deficits begin exceeding
> 1000 Calories per day, diets tend to get quite unpleasant and unsustainable."*

→ **Therefore the engine needs BOTH a `%BW/week` rate AND an absolute `maxKgPerWeek` ceiling AND a
relative-deficit cap (~25–30% of TDEE).** All three appear in the JSON below.

### 3.6 Murphy & Koehler 2021/2022 — the 500 kcal threshold

Murphy C, Koehler K. *Energy deficiency impairs resistance training gains in lean mass but not
strength: A meta-analysis and meta-regression.* Scand J Med Sci Sports. 2022;32(1):125–137.
https://pubmed.ncbi.nlm.nih.gov/34623696/ | https://onlinelibrary.wiley.com/doi/10.1111/sms.14075

> The meta-regression demonstrated that an energy deficit of **~500 kcal·day⁻¹ prevented gains in
> lean mass**. Individuals performing resistance training to preserve lean mass during weight loss
> should **avoid energy deficits > 500 kcal·day⁻¹**.

This is the cleanest single number for the "optimal" column: **~500 kcal/day ≈ 0.45 kg/week ≈
0.5–0.7% BW/week for most adults.**

### 3.7 RP Strength

https://rpstrength.com/blogs/articles/slow-losses
- General: cut at **~0.75% bodyweight/week for 8–12 weeks**.
- Range for muscle preservation: **0.5–1.0% BW/week**, max 12 weeks before an 8+ week break.
- *"If you are leaner when you start, you will probably do better losing even more slowly."*
- *"If you have relatively high body-fat, you can certainly get away with 1.5 pounds per week toward
  the beginning of your cut, and you might also consider shifting down to only 0.5 pounds per week
  toward the end of the cut when your body-fat is very low."*
- People who lose **< 1% BW/week are substantially more likely to keep the weight off.**

### 3.8 Clinical / general-population anchors

- Conventional hypocaloric prescription: reduce intake by **500–750 kcal/day**, achieved with
  **1200–1500 kcal/d for women and 1500–1800 kcal/d for men**; ~500–600 kcal/day → ~0.5 kg/week.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/
- Standard clinical ceiling is 1–2 lb/week (0.45–0.9 kg). Rapid loss >~3 lb/week markedly raises
  gallstone risk.

### 3.9 ★ DEFAULT RATE TABLE (narrative form)

Units: `% of current bodyweight per week`. Bands are on **current** BF%, re-evaluated each week as
the user leans out (so the plan automatically decelerates — exactly what Helms/ISSN/RP prescribe).

#### MALE

| BF% band | Conservative | **Optimal** | Aggressive | maxKg/wk | Lean-mass-loss risk |
|---|---|---|---|---|---|
| < 8% | 0.20 | **0.35** | 0.50 | 0.50 | **Severe.** Contest/photoshoot only. Forbes/Lyle: up to 1 lb muscle per 3 lb lost. Testosterone can reach castrate levels. Time-limit to 2–4 wk. |
| 8–12% | 0.30 | **0.50** | 0.70 | 0.70 | **High.** Alpert cap starts binding here. Garthe's leaner FR subjects lost LBM. Keep ≤0.7%. |
| 12–15% | 0.40 | **0.60** | 0.80 | 0.80 | **Moderate–high.** Lyle Category 1 boundary. Garthe's 0.7% target zone. |
| 15–20% | 0.50 | **0.75** | 1.00 | 1.00 | **Moderate.** Helms/ISSN 0.5–1% core band; RP's 0.75% default. |
| 20–25% | 0.50 | **0.80** | 1.10 | 1.00 | **Low–moderate.** Lyle Category 2. Ample adipose to buffer the deficit. |
| 25–30% | 0.60 | **0.90** | 1.20 | 1.10 | **Low.** Lyle Category 3. ISSN: deficit "may be imposed more aggressively". |
| 30–40% | 0.70 | **1.00** | 1.30 | 1.25 | **Low.** Watch *relative* deficit (cap 30% of TDEE) — %BW scales badly at high mass. |
| > 40% | 0.70 | **1.00** | 1.50 | 1.25 | **Low**, but medical supervision advised; gallstone risk above ~1.4 kg/wk. |

#### FEMALE

Bands offset ~+8–10 pp per the Lyle Category thresholds (M ≤15% ↔ F ≤24%; M ≥26% ↔ F ≥35%).
Absolute kg/week ceilings are lower because women are typically smaller — a 0.8%/wk rate on a 62 kg
woman is 0.50 kg/wk, and pushing 1 kg/wk on her is a >40% relative deficit.

| BF% band | Conservative | **Optimal** | Aggressive | maxKg/wk | Lean-mass-loss risk |
|---|---|---|---|---|---|
| < 16% | 0.20 | **0.30** | 0.45 | 0.40 | **Severe.** At/below the essential-fat margin. High RED-S / amenorrhoea risk. Time-limit; clinical oversight. |
| 16–20% | 0.30 | **0.45** | 0.60 | 0.50 | **High.** Physique-contest condition. Monitor menstrual function; keep EA ≥30 kcal/kg FFM. |
| 20–24% | 0.40 | **0.55** | 0.75 | 0.60 | **Moderate–high.** Lyle Category 1 boundary (≤24%). |
| 24–28% | 0.50 | **0.70** | 0.90 | 0.75 | **Moderate.** Helms/ISSN core band. |
| 28–33% | 0.50 | **0.75** | 1.00 | 0.85 | **Low–moderate.** Lyle Category 2 midpoint. |
| 33–40% | 0.60 | **0.85** | 1.10 | 1.00 | **Low.** Lyle Category 3 (≥35%). |
| 40–50% | 0.65 | **0.95** | 1.25 | 1.10 | **Low.** Cap relative deficit at 30% of TDEE. |
| > 50% | 0.70 | **1.00** | 1.30 | 1.20 | **Low**, medical supervision advised. |

**Design notes for the UI:**
- Default the picker to **Optimal**. Label Conservative as *"best muscle retention"*, Aggressive as
  *"fastest, expect some lean-mass loss"*.
- Never let Aggressive survive the caps: `effectiveRate = min(tableRate, maxKgPerWeek/weight,
  alpertCap, 0.30 × TDEE deficit cap, calorieFloor constraint)`.
- Show the user *why* a rate was reduced ("capped by your fat-mass mobilisation limit",
  "capped by the 1500 kcal minimum") — this is a big trust/UX win.

---

## 4. TDEE estimation

### 4.1 Mifflin–St Jeor (1990) — the general default

Mifflin MD, St Jeor ST, et al. *A new predictive equation for resting energy expenditure in healthy
individuals.* Am J Clin Nutr. 1990;51(2):241–247.
https://ajcn.nutrition.org/article/S0002-9165(23)16698-6/fulltext
Reference implementation: https://reference.medscape.com/calculator/846/mifflin-st-jeor-equation-calculator

```
Combined form:
REE = 9.99 x weight_kg + 6.25 x height_cm - 4.92 x age_y + 166 x sex - 161     (sex: M=1, F=0)

Commonly-used simplified per-sex form:
REE_male   = 10 x weight_kg + 6.25 x height_cm - 5 x age_y + 5
REE_female = 10 x weight_kg + 6.25 x height_cm - 5 x age_y - 161
```
Use the simplified per-sex form (it is what every calculator ships and differs trivially).

### 4.2 Katch–McArdle / Cunningham — the LBM-based default (preferred here)

```
Katch-McArdle  BMR = 370 + 21.6 x LBM_kg          (== Cunningham 1991 revision)
Cunningham 1980 BMR = 500 + 22   x LBM_kg          (higher; historical)
```
https://www.omnicalculator.com/health/bmr-katch-mcardle
https://med.libretexts.org/Courses/Irvine_Valley_College/Physiology_Labs_at_Home/04:_Metabolism_and_Calorie_Burn/4.02:_Part_B._Calculating_RMR_based_off_of_Lean_Body_Mass_(LBM)

**We already have LBM from the Navy formula, so Katch–McArdle is available for free and is
sex-independent and age-independent.** It outperforms Mifflin for lean/muscular and for very obese
users (Mifflin over-predicts the obese, under-predicts the muscular).

**Recommendation: blend, don't choose.**
```
if (bodyFatPct is trusted and within 5%..50%):
    BMR = 0.5 x Mifflin + 0.5 x KatchMcArdle
else:
    BMR = Mifflin
```
Rationale: the Navy BF% carries ±3.5 pp of error (Section 7), which propagates directly into LBM and
therefore into Katch–McArdle. Averaging the two halves the damage from either being wrong, and the
weekly recalibration (Section 5) makes the starting estimate matter less and less.

Worked example (103 kg, 10% BF, 180 cm, 35 y, male):
```
Mifflin        = 10(103) + 6.25(180) - 5(35) + 5    = 1985 kcal
Katch-McArdle  = 370 + 21.6(92.7)                    = 2372 kcal
Blend                                                = 2179 kcal
TDEE @ 1.55                                          = 3377 kcal
```

### 4.3 Activity multipliers

Standard set (Harris–Benedict lineage; maps onto FAO/WHO/UNU 2001 PAL categories):

| Level | Multiplier | Description |
|---|---|---|
| Sedentary | 1.20 | Desk job, little/no exercise |
| Lightly active | 1.375 | Light exercise 1–3 d/wk |
| Moderately active | 1.55 | Moderate exercise 3–5 d/wk |
| Very active | 1.725 | Hard exercise 6–7 d/wk |
| Extra active | 1.90 | Physical job + hard daily training |

https://www.omnicalculator.com/health/bmr-harris-benedict-equation

**Known problems and better alternatives:**
1. **Users systematically over-select.** The single largest source of TDEE error in every app.
   Mitigation: default to 1.375, label 1.55+ with concrete criteria ("4+ hard sessions AND >8000
   steps/day"), and never let the user's pick survive past week 2 (see 4.3.3).
2. **The multiplier applies to BMR, but exercise cost scales with body mass, not with BMR.** For very
   heavy users the multiplier over-inflates.
   Better: `TDEE = BMR x 1.2 (baseline NEAT+TEF) + explicit exercise kcal` where exercise kcal is
   computed per session from MET × mass × hours. This is meaningfully more accurate but needs
   session logging.
3. **Split the multiplier by steps + training**, e.g.
   `PAL = 1.15 + 0.00008 x dailySteps + 0.03 x weeklyResistanceSessions` (clamp 1.2–1.9). Any linear
   step-driven form beats a 5-item dropdown.
4. **★ The real fix: stop estimating.** MacroFactor's whole thesis:
   > *"Its power comes from the fact that it relies on solid physiological principles to be inherently
   > self-correcting, unlike energy expenditure estimates coming from static calculations or wearable
   > devices."* — https://macrofactor.com/expenditure-v3/
   Use the formula **only as a 14-day seed**, then hand over to the measured estimator in Section 5.
   Do not trust wearables: https://macrofactor.com/wearables/

### 4.4 Calorie floors

| Floor | Value | Source |
|---|---|---|
| Female absolute minimum | **1200 kcal/day** | Conventional hypocaloric prescription 1200–1500 kcal/d for females — https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/ |
| Male absolute minimum | **1500 kcal/day** | 1500–1800 kcal/d for males — same source |
| Structural floor | **never below BMR** | BMR from the blend in 4.2 |
| Athletic / RED-S floor | **energy availability ≥ 30 kcal per kg FFM per day** | `EA = (intake − exerciseKcal) / FFM_kg`. <30 = low energy availability; 45 = optimal. IOC RED-S consensus: https://stillmed.olympics.com/media/Documents/Athletes/Medical-Scientific/Consensus-Statements/REDs/IOC-consensus-statement-Relative-Energy-Deficiency-in-Sport-2018.pdf |
| Relative deficit ceiling | **≤ 25–30% below TDEE** | Lyle "large deficit" boundary (https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit) + MacroFactor ">40% feels rough" (https://macrofactor.com/cutting-calculator/) |

**Recommended engine rule:**
```
floor = max( sexFloor,            # 1500 M / 1200 F
             BMR,                 # structural
             0.70 x TDEE )        # relative-deficit ceiling (30% max cut)
dailyTarget = max( TDEE - plannedDeficit, floor )
if dailyTarget == floor: recompute achievable weeklyRate and extend the timeline (and tell the user)
```
Add a hard warning if EA would drop below 30 kcal/kg FFM.

### 4.5 Protein during a cut

| Basis | Recommendation | Source |
|---|---|---|
| **Per kg LEAN mass** (we have LBM from Navy — use this) | **2.3–3.1 g/kg FFM/day** | Helms 2014: https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/ ; ISSN 2017: https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y |
| Per kg bodyweight, general athletic | 1.4–2.0 g/kg BW/day | ISSN protein position stand (Jäger 2017): https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/ |
| Per kg bodyweight, dose-response breakpoint | ~1.6 g/kg BW/day (CI to ~2.2) | Morton 2018, BJSM 52:376–384: https://pubmed.ncbi.nlm.nih.gov/28698222/ |
| Per meal, around training | 0.4–0.5 g/kg BW pre and post | Helms 2014 |
| High-BF users | Lyle: ~1.5 g/kg LBM is sufficient for the obese; up to **1.5 g/lb LBM (≈3.3 g/kg LBM)** for the very lean | https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat |

**Recommendation:** compute protein from **lean mass**, and scale it with leanness (protein
requirement rises as BF% falls — Lyle's point, and Helms' "leaner = greater LBM risk"):
```
proteinGPerKgLean = 2.2  if BF% high   (M >25 / F >35)
                  = 2.6  if BF% mid    (M 15-25 / F 24-35)
                  = 3.0  if BF% low    (M <15 / F <24)
protein_g = proteinGPerKgLean x LBM_kg
# then floor it at 1.6 x bodyweight_kg so high-BF users still get enough
```
Remaining macros: **fat 20–30% of calories** (Helms: 15–30%; Lyle: 20–25%), carbs fill the remainder.

---

## 5. Adaptive thermogenesis / metabolic adaptation, and the weekly recalibration

### 5.1 How big is the drop?

| Finding | Magnitude | Source |
|---|---|---|
| Adaptive thermogenesis (beyond what mass loss predicts) | **10–15% below predicted TDEE** | ISSN 2017: https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y |
| Observed range in overweight populations | **79 to 504 kcal/day** beyond prediction | Helms 2014: https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/ |
| Minnesota-style semi-starvation (50% intake, 24 wk, 25% of body mass lost) | **40% total TDEE reduction: 25% from mass loss, 15% adaptive** | Helms 2014 (citing Keys) |
| 10% body-weight loss | ~**550 kcal/day** TDEE reduction | https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/ |
| Steady-state relation (Hall) | **100 kJ/day ≈ 24 kcal/day per kg** of eventual weight change; half the change in ~1 yr, 95% in ~3 yr | Hall 2011 Lancet: https://pubmed.ncbi.nlm.nih.gov/21872751/ |
| Persistence | Adaptation persists **>1 year** after active weight loss | Trexler 2014: https://www.tandfonline.com/doi/full/10.1186/1550-2783-11-7 |

Trexler 2014 (Trexler, Smith-Ryan, Norton; JISSN 2014;11:7) is the canonical review:
https://pubmed.ncbi.nlm.nih.gov/24571926/
> *"In response to weight loss, reductions in TDEE, BMR, EAT, NEAT, and TEF are observed. Due to
> adaptive thermogenesis, **TDEE is lowered to an extent that exceeds the magnitude predicted by
> losses in body mass**... These changes serve to minimize the energy deficit, attenuate further loss
> of body mass, and promote weight regain."*

**Important mitigating finding** (ISSN 2017) — the pessimistic AT numbers come from bad diets:
> *"The majority of the existing research showing AT has involved diets that combine aggressive
> caloric restriction with low protein intakes and an absence of resistance training; therefore,
> essentially creating a perfect storm for the slowing of metabolism. **Research that has mindfully
> included resistance training and adequate protein has circumvented the problem of AT and LM loss**,
> despite very low-calorie intakes."*

So for a training + high-protein user, budget **less** adaptation than the headline 15%.

### 5.2 A-priori (open-loop) correction — weeks 1–2 only

```
TDEE_week_i = TDEE_0
            - kcalPerKgPerDayLost x (W_0 - W_i)            # structural, 22 kcal/day/kg
            - adaptivePctPerWeek x i_capped x TDEE_0        # adaptive, 0.4%/wk capped at 10%

kcalPerKgPerDayLost = 22     # from Hall's 100 kJ/day per kg steady-state rule
adaptivePctPerWeek  = 0.004  # 0.4% of baseline TDEE per week in deficit
adaptiveCapPct      = 0.10   # 10% ceiling (ISSN says 10-15% for bad diets; we assume protein+lifting)
```

### 5.3 ★ Closed-loop (measured) recalibration — the MacroFactor method

This is the correct primary mechanism. From week 3 onward it should **replace** 5.2 entirely
(do NOT apply both — you would double-count).

MacroFactor's stated principle:
> *"If you eat 2500 Calories per day and maintain your weight, that means you burn around 2500
> Calories per day. If you gain weight while eating 2500 Calories per day, that means you burn less
> than 2500 Calories; if you lose weight, that means you burn more than 2500 Calories."*
> — https://macrofactor.com/expenditure-v3/

**The formula (this is the one to implement):**
```
TDEE_measured = avgDailyIntake_kcal  +  ( deltaTrendWeight_kg_LOST x kcalPerKgFat ) / days

# sign-safe version, using signed weight change (negative when losing):
deltaW = trendWeight_end - trendWeight_start          # kg, negative when losing
TDEE_measured = avgDailyIntake - (deltaW * 7700) / days
```
Worked check: intake 2400 kcal/day, trend weight −0.6 kg over 14 days →
`TDEE = 2400 − (−0.6 × 7700)/14 = 2400 + 330 = 2730 kcal/day`.

**Implementation requirements:**
1. **Use the EWMA trend weight, never raw scale weight** (Section 6). MacroFactor:
   *"MacroFactor's most important calculations – your daily energy expenditure and your weekly
   calorie target – are based on changes in your weight trend, rather than changes in your scale
   weight."* — https://help.macrofactorapp.com/en/articles/21-weight-trend
2. **Window: 14–28 days.** MacroFactor's whole V3 article is about the stability/responsiveness
   trade-off: 1 week of data is "more noise than signal", 1 year is "far too slow to adapt".
   14 days is the minimum for a usable estimate; 21 is a good default.
3. **Damp the update.** Never jump straight to the new estimate:
   ```
   TDEE_new = (1 - beta) x TDEE_prev + beta x TDEE_measured        # beta = 0.30 weekly
   clamp:  |TDEE_new - TDEE_prev| <= 150 kcal/week
   clamp:  TDEE_new within [0.65, 1.45] x TDEE_formula_seed        # sanity bounds
   ```
4. **Exclude the first 7–10 days** of any new deficit from the estimate. The initial glycogen+water
   drop (1–2 kg) is not fat and will wildly over-estimate TDEE. MacroFactor:
   *"you might lose 5+ pounds within the first week or two, but again, that's not 5 pounds of 'real'
   weight loss... it's mostly water weight."*
5. **Intake logging quality gates it.** If the user logs <5 days/week, fall back to the a-priori
   model and say so. Under-reporting is systematic and will make measured TDEE look too low.
6. **Minimum weigh-ins:** MacroFactor requires ≥3/week, evenly spaced.
   https://help.macrofactorapp.com/en/articles/21-weight-trend

### 5.4 Weekly re-plan loop

```
each week:
  trend      = EWMA(weights)
  actualRate = slope(trend, last 14 days) in kg/week
  TDEE       = damp( TDEE_prev, measuredTDEE(intake, trend) )
  BF%        = recompute from Navy (or estimate: fatMass -= 0.85 x weightLost)
  rate       = rateTable(sex, BF%, aggressiveness)
  deficit    = rate x weight x 7700 / 7
  deficit    = min(deficit, alpertCap, 0.30 x TDEE)
  target     = max(TDEE - deficit, floor)
  weeksLeft  = recompute remaining timeline
```

---

## 6. Weight-trend smoothing (EWMA)

### 6.1 The Hacker's Diet parameter — and a naming trap

John Walker, *The Hacker's Diet*, "Signal and Noise":
https://www.fourmilab.ch/hackdiet/e4/signalnoise.html

> *"The weight factors in an exponentially smoothed moving average are successive powers of a number
> called the **smoothing constant**... Replacing the simple moving average with an exponentially
> smoothed one with a **smoothing constant of 0.9** (roughly equivalent to a **20 day simple moving
> average** in terms of lagging the trend)..."*

⚠️ **Naming trap.** Walker's "smoothing constant 0.9" is the *decay base* (weights are 0.9^n). In the
standard recursive EWMA form used in code, that is **α = 1 − 0.9 = 0.10**:

```
trend_today = trend_yesterday + alpha x (weight_today - trend_yesterday)
            = 0.10 x weight_today + 0.90 x trend_yesterday
```
So the brief's "Hacker's Diet alpha = 0.1" is **correct** — it is the same thing Walker describes.
Community implementations of the Hacker's Diet use exactly this recursion, e.g.
https://en.wikiversity.org/wiki/One_man%27s_look_at_The_Hacker%27s_Diet
(that page uses an even smoother 0.05; use 0.10 as the canonical Walker value).

### 6.2 Parameter cheat-sheet

| alpha | Half-life | ≈ SMA equivalent | Use for |
|---|---|---|---|
| 0.05 | 13.5 d | ~39 d | Very long cuts / very noisy users |
| **0.10** | **6.6 d** | **~19–20 d** | **DEFAULT — daily weigh-ins (Hacker's Diet)** |
| 0.15 | 4.3 d | ~13 d | Daily weigh-ins, wants faster feedback |
| 0.25 | 2.4 d | ~7 d | 3–4 weigh-ins/week |
| 0.40 | 1.4 d | ~4 d | Too twitchy — do not ship |

(half-life = ln0.5/ln(1−α); SMA-equivalent ≈ (2−α)/α)

### 6.3 Handling gaps and noise — implementation rules

1. **Time-aware alpha for missed days** (essential — users skip weigh-ins):
   ```
   alpha_eff = 1 - (1 - alpha)^daysSinceLastWeighIn
   ```
   This makes a 5-day gap weight the new reading appropriately (α_eff ≈ 0.41 at α=0.10) instead of
   treating it as one lagging day.
2. **Seed the trend** with the first reading (or the mean of the first 3), not with zero.
3. **Report the weekly rate from the trend's slope**, not week-over-week raw weights:
   ```
   weeklyRate = OLS slope of trend over trailing 14-21 days, x 7
   ```
   A `(trend_today − trend_7d_ago)` difference also works and is simpler; OLS over 14 days is less
   jumpy. Never use `raw_today − raw_last_monday`.
4. **Outlier rejection:** reject a reading if `|weight − trend| > 3 kg` (or > 4× the running MAD),
   flag for confirmation rather than silently dropping.
5. **Magnitude of the noise you are fighting:**
   - MacroFactor: *"it's not uncommon for your weight to fluctuate by a few pounds (or kilos)"*;
     a single weigh-in can deviate 1–3 kg from true composition weight.
     https://help.macrofactorapp.com/en/articles/21-weight-trend
   - Walker's own data: in a month where his true weight varied <1 lb, his raw scale readings spanned
     **6 lb** (142.5 → 149.5).
6. **Sources of water-weight noise to explain in the weekly report:** sodium, carbohydrate/glycogen
   (3–4 g water per g glycogen), menstrual cycle, DOMS/inflammation after hard training, alcohol,
   travel, constipation, and creatine loading.
7. **Women: compare like-for-like cycle phase.** Cyclic fluid retention of 0.5–2 kg is normal.
   For menstruating users, prefer a **28-day** comparison window (or compare the same cycle phase)
   before declaring a plateau. Consider surfacing a cycle-phase tag on weigh-ins.
8. **The first 7–14 days are a lie.** Show a "settling in" banner, exclude those days from both the
   rate estimate and the TDEE estimate, and pre-warn the user that week 1 will look unusually good.
9. **Plateau logic:** only call a plateau when the trend slope is flat for **≥3 consecutive weeks**
   *and* intake logging is complete. Two weeks is inside the noise band.
10. **Weigh-in hygiene copy:** same time of day, post-void, pre-breakfast, minimal clothing, same
    scale. Encourage daily; require ≥3/week.

---

## 7. Body-fat measurement noise (US Navy tape) and what it means for goal tracking

### 7.1 The Navy circumference equations

Hodgdon JA, Beckett MB (1984), *Prediction of percent body fat for US Navy men/women from body
circumferences and height*, Naval Health Research Center, San Diego. (Reports 84-11 / 84-29.)

Measurements (cm): men — neck, abdomen/waist; women — neck, waist, hips; plus height for both.
Method description as used by the US Army (AR 600-9) is summarised here:
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/

### 7.2 Published error — this is worse than most apps admit

| Metric | Value | Source |
|---|---|---|
| Standard error of the estimate (original validation, vs underwater weighing) | **3–4 %BF** | Hodgdon & Friedl 1999, quoted in https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/ |
| Inter-observer reproducibility (trained observers) | **within 1 %BF** | same |
| SEE vs DXA, men (n=926 Army recruits) | **3.42 %BF**, r² = 0.72 | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/ |
| SEE vs DXA, women (n=481) | **4.12 %BF**, r² = 0.44 | same |
| Mean bias vs DXA (recruits) | **−6.0 ± 3.5 %BF** (men), **−6.0 ± 4.4 %BF** (women) — i.e. the tape method *underestimates* | same |
| Known systematic bias | underestimates %BF at the **high** end, overestimates at the **low** end | Hodgdon 1992; Hodgdon & Friedl 1999 |
| Overestimation in very lean women | largest overestimates were in the **leanest** individuals | Potter 2022 (USMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9008774/ |
| Comparators | DXA ±1–2%, skinfolds ±3–5%, **Navy tape ±3–4%**, BIA scales ±4–8% | — |

### 7.3 ★ The killer finding: it barely tracks *change*

From the same 8-week Army BCT study (1407 trainees, DXA vs tape, pre and post):

- DXA detected a **−4.0 ± 2.4 %BF** change in women and **−3.3 ± 2.8 %BF** in men.
- Tape detected **0.0 ± 3.3 %** in women (p = 0.86 — literally nothing) and only **−2.2 ± 3.3 %** in men.
- **43.0% of women and 14.5% of men *gained* %BF by tape while *losing* %BF by DXA.**
- Only ~56% of women and ~83% of men were correctly classified as having gained or lost ≥1 pp.
- Conclusion: *"circumference-based %BF metrics **may not be an appropriate tool to track changes in
  body composition** during short duration training."*
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/

### 7.4 Error propagation into OUR goal engine

The Navy BF% feeds LBM, which feeds goal weight, which feeds everything.
For our 103 kg male at a *measured* 10% BF, with a realistic ±3.5 pp uncertainty:

| | Low (6.5% BF) | Point (10% BF) | High (13.5% BF) |
|---|---|---|---|
| Fat mass | 6.7 kg | 10.3 kg | 13.9 kg |
| LBM | 96.3 kg | 92.7 kg | 89.1 kg |
| **Goal weight at 8% BF** | **104.7 kg** | **100.8 kg** | **96.8 kg** |
| Weight to lose | *(already there)* | 2.2 kg | 6.2 kg |
| Weeks at 0.5%/wk | 0 | ~4.4 | ~12.3 |

An 8-week swing in the plan from measurement noise alone. **This must be surfaced, not hidden.**

### 7.5 RECOMMENDATIONS

1. **Primary progress signals = (a) EWMA trend weight, (b) waist circumference.** Both are direct
   measurements with far lower error than a derived BF%. Waist in particular is the dominant term in
   the male Navy equation and tracks abdominal fat well:
   the same study found *"the value of a single abdominal circumference in tracking male body
   composition, with the changes measured by DXA closely associated with the changes in abdominal
   circumference."*
2. **BF% = a slow, secondary signal.** Recompute it, but:
   - refresh no more than every **4 weeks**;
   - require a **≥2 pp** change before styling it as progress;
   - display it as a **band** (`14% ± 3.5%`), never a bare number;
   - never drive the weekly calorie target from a fresh BF% reading — drive it from trend weight.
3. **Store raw circumferences**, not just the derived %. That lets you (a) show waist trend, (b)
   re-derive BF% if the formula changes, (c) detect a mis-measurement.
4. **Measurement protocol in-app:** same tape, same person, same time of day (morning, pre-food),
   relaxed exhale, tape flat and not compressing, **average of 3 readings**, reject if the 3 spread
   >1 cm. Trained observers reproduce within 1 %BF; untrained ones do not.
5. **Goal-weight range, not a point.** Show "target ≈ 97–105 kg" with the point estimate emphasised.
   Recompute the goal weight each time BF% is remeasured, and animate the plan converging as data
   accumulates — this reframes the noise as the system learning rather than as being wrong.
6. **Smooth BF% too.** Apply a slower EWMA (α ≈ 0.3 across ~monthly measurements) to the derived BF%
   so a single bad tape session doesn't reset the user's whole plan.
7. **Women need extra caution.** r² = 0.44 and a tape method that detected *zero* change over 8 weeks
   in a population that genuinely lost 4 pp. For female users, lean even harder on trend weight +
   waist and de-emphasise BF% deltas.

---

## 8. Engine pseudocode (putting it together)

```pseudo
function planFatLoss(user, targetBFpct, aggressiveness = "optimal"):

  # --- 1. Current state ---
  W        = user.weightKg
  BF       = navyBodyFat(user.measurements)          # 0..1
  FM       = W * BF
  LBM      = W - FM

  # --- 2. Goal ---
  goalW    = LBM / (1 - targetBFpct)                 # LBM assumed preserved
  toLose   = W - goalW                               # kg (all fat if LBM held)
  if toLose <= 0: return AlreadyAtGoal

  totalDeficitKcal = toLose * K.kcalPerKgFat         # 7700

  # --- 3. Seed TDEE ---
  bmr   = 0.5*mifflin(user) + 0.5*katchMcArdle(LBM)
  TDEE  = bmr * K.activityMultipliers[user.activity]
  floor = max(K.calorieFloor[user.sex], bmr, 0.70 * TDEE)

  # --- 4. Week-by-week simulation ---
  weeks = []
  w = W; fm = FM
  for i in 1..K.maxWeeks:                            # maxWeeks = 104 safety
      bf   = fm / w
      if bf <= targetBFpct: break

      band = lookupRateBand(user.sex, bf * 100)      # DEFAULT_RATE_TABLE
      pct  = band[aggressiveness + "PctBwPerWeek"] / 100

      # --- the four caps ---
      rateFromTable = pct * w
      capAbsolute   = band.maxKgPerWeek
      capAlpert     = (K.alpertKcalPerKgFatPerDay * K.alpertSafetyFactor
                       * fm * 7) / K.kcalPerKgFat
      capRelative   = (0.30 * TDEE * 7) / K.kcalPerKgFat
      rate          = min(rateFromTable, capAbsolute, capAlpert, capRelative)

      dailyDeficit  = rate * K.kcalPerKgFat / 7
      target        = TDEE - dailyDeficit
      if target < floor:                              # floor binds -> slow down
          target       = floor
          dailyDeficit = TDEE - floor
          rate         = dailyDeficit * 7 / K.kcalPerKgFat
          weekNote     = "limited by minimum calorie intake"

      weeks.push({ week: i, startWeight: w, bfPct: bf*100,
                   rateKg: rate, dailyKcal: target, tdee: TDEE,
                   proteinG: proteinTarget(LBM, bf),
                   limitedBy: whichCapBound(...) })

      # advance
      w  -= rate
      fm -= rate * fatFraction(bf)                    # 0.85..1.00, higher when fatter
      # TDEE decay (a-priori; superseded by measured recalibration once live)
      TDEE = TDEE - K.kcalPerKgPerDayLost * rate
                  - min(i, K.adaptiveCapWeeks) * K.adaptivePctPerWeek * TDEE_0

  return { toLoseKg: toLose, totalDeficitKcal, weeks, etaWeeks: weeks.length }
```

`fatFraction(bf)`: fraction of weight lost that is fat. Use 1.00 for BF>30/40, 0.90 mid,
0.80 for very lean (Forbes/Lyle: lean dieters can lose up to 1 lb muscle per 3 lb weight).

---

## 9. DEFAULT_RATE_TABLE (seed JSON)

Units: `*PctBwPerWeek` are **percent of current bodyweight per week** expressed as percent
(`0.5` = 0.5%). `bfMin`/`bfMax` are percentage points on **current** body fat, `bfMax` exclusive.
`maxKgPerWeek` is an absolute ceiling applied after the percentage.

```json
{
  "DEFAULT_RATE_TABLE": [
    {
      "sex": "male", "bfMin": 0, "bfMax": 8,
      "conservativePctBwPerWeek": 0.20,
      "optimalPctBwPerWeek": 0.35,
      "aggressivePctBwPerWeek": 0.50,
      "maxKgPerWeek": 0.50,
      "note": "Contest/photoshoot leanness. Severe lean-mass risk: leaner dieters can lose up to 1 lb muscle per 3 lb of weight lost. Alpert fat-mobilisation cap is the binding constraint here. Time-limit to 2-4 weeks and refeed.",
      "sourceUrl": "https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat"
    },
    {
      "sex": "male", "bfMin": 8, "bfMax": 12,
      "conservativePctBwPerWeek": 0.30,
      "optimalPctBwPerWeek": 0.50,
      "aggressivePctBwPerWeek": 0.70,
      "maxKgPerWeek": 0.70,
      "note": "High lean-mass risk. Garthe 2011: leaner subjects in the fast-loss (1.4%/wk) arm lost LBM while the 0.7%/wk arm gained 2.1%. Keep at or below 0.7%/wk.",
      "sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/21558571/"
    },
    {
      "sex": "male", "bfMin": 12, "bfMax": 15,
      "conservativePctBwPerWeek": 0.40,
      "optimalPctBwPerWeek": 0.60,
      "aggressivePctBwPerWeek": 0.80,
      "maxKgPerWeek": 0.80,
      "note": "Upper edge of Lyle McDonald Category 1 (men <=15%). Moderate-to-high lean-mass risk; Garthe's validated 0.7%/wk target sits in this band.",
      "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/"
    },
    {
      "sex": "male", "bfMin": 15, "bfMax": 20,
      "conservativePctBwPerWeek": 0.50,
      "optimalPctBwPerWeek": 0.75,
      "aggressivePctBwPerWeek": 1.00,
      "maxKgPerWeek": 1.00,
      "note": "Core Helms/ISSN 0.5-1%/wk band; RP Strength's 0.75%/wk default. Moderate lean-mass risk; a ~500 kcal/day deficit here is the Murphy & Koehler threshold below which lean mass is preserved.",
      "sourceUrl": "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y"
    },
    {
      "sex": "male", "bfMin": 20, "bfMax": 25,
      "conservativePctBwPerWeek": 0.50,
      "optimalPctBwPerWeek": 0.80,
      "aggressivePctBwPerWeek": 1.10,
      "maxKgPerWeek": 1.00,
      "note": "Lyle Category 2 (men 16-25%). Low-moderate lean-mass risk: ample adipose buffers the deficit. ISSN: 'the higher the baseline body fat level, the more aggressively the caloric deficit may be imposed'.",
      "sourceUrl": "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y"
    },
    {
      "sex": "male", "bfMin": 25, "bfMax": 30,
      "conservativePctBwPerWeek": 0.60,
      "optimalPctBwPerWeek": 0.90,
      "aggressivePctBwPerWeek": 1.20,
      "maxKgPerWeek": 1.10,
      "note": "Lyle Category 3 (men >=26%). Low lean-mass risk with adequate protein and resistance training. Watch the relative deficit rather than the absolute rate.",
      "sourceUrl": "https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit"
    },
    {
      "sex": "male", "bfMin": 30, "bfMax": 40,
      "conservativePctBwPerWeek": 0.70,
      "optimalPctBwPerWeek": 1.00,
      "aggressivePctBwPerWeek": 1.30,
      "maxKgPerWeek": 1.25,
      "note": "Low lean-mass risk, but %BW scales badly at high body mass - cap the relative deficit at 30% of TDEE. MacroFactor: 1%/wk at 300 lb is a ~42% relative deficit and 'feels rough'.",
      "sourceUrl": "https://macrofactor.com/cutting-calculator/"
    },
    {
      "sex": "male", "bfMin": 40, "bfMax": 100,
      "conservativePctBwPerWeek": 0.70,
      "optimalPctBwPerWeek": 1.00,
      "aggressivePctBwPerWeek": 1.50,
      "maxKgPerWeek": 1.25,
      "note": "Low lean-mass risk. Medical supervision advised above ~1.4 kg/wk; sustained rapid loss raises gallstone risk. Relative-deficit cap and calorie floor will normally bind before the percentage does.",
      "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/"
    },

    {
      "sex": "female", "bfMin": 0, "bfMax": 16,
      "conservativePctBwPerWeek": 0.20,
      "optimalPctBwPerWeek": 0.30,
      "aggressivePctBwPerWeek": 0.45,
      "maxKgPerWeek": 0.40,
      "note": "At or below the essential-fat margin. Severe lean-mass risk plus high RED-S / menstrual-dysfunction risk. Enforce energy availability >= 30 kcal per kg FFM per day and require clinical oversight.",
      "sourceUrl": "https://stillmed.olympics.com/media/Documents/Athletes/Medical-Scientific/Consensus-Statements/REDs/IOC-consensus-statement-Relative-Energy-Deficiency-in-Sport-2018.pdf"
    },
    {
      "sex": "female", "bfMin": 16, "bfMax": 20,
      "conservativePctBwPerWeek": 0.30,
      "optimalPctBwPerWeek": 0.45,
      "aggressivePctBwPerWeek": 0.60,
      "maxKgPerWeek": 0.50,
      "note": "Physique-contest condition. High lean-mass risk; monitor menstrual function. Helms 2014: a 1 kg/wk vs 0.5 kg/wk cut in strength-trained women cost 5% bench strength and 30% more testosterone suppression.",
      "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/"
    },
    {
      "sex": "female", "bfMin": 20, "bfMax": 24,
      "conservativePctBwPerWeek": 0.40,
      "optimalPctBwPerWeek": 0.55,
      "aggressivePctBwPerWeek": 0.75,
      "maxKgPerWeek": 0.60,
      "note": "Upper edge of Lyle McDonald Category 1 (women <=24%). Moderate-to-high lean-mass risk; prefer the slower end and lengthen the timeline.",
      "sourceUrl": "https://everycalculators.com/lyle-mcdonald-psmf-calculator.html"
    },
    {
      "sex": "female", "bfMin": 24, "bfMax": 28,
      "conservativePctBwPerWeek": 0.50,
      "optimalPctBwPerWeek": 0.70,
      "aggressivePctBwPerWeek": 0.90,
      "maxKgPerWeek": 0.75,
      "note": "Core Helms/ISSN 0.5-1%/wk band, scaled for typical female body mass. Moderate lean-mass risk. Note absolute deficits are smaller than for men at the same percentage.",
      "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/"
    },
    {
      "sex": "female", "bfMin": 28, "bfMax": 33,
      "conservativePctBwPerWeek": 0.50,
      "optimalPctBwPerWeek": 0.75,
      "aggressivePctBwPerWeek": 1.00,
      "maxKgPerWeek": 0.85,
      "note": "Lyle Category 2 (women 25-34%). Low-to-moderate lean-mass risk. A ~500 kcal/day deficit here is close to the Murphy & Koehler lean-mass-preservation threshold.",
      "sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/34623696/"
    },
    {
      "sex": "female", "bfMin": 33, "bfMax": 40,
      "conservativePctBwPerWeek": 0.60,
      "optimalPctBwPerWeek": 0.85,
      "aggressivePctBwPerWeek": 1.10,
      "maxKgPerWeek": 1.00,
      "note": "Lyle Category 3 (women >=35%). Low lean-mass risk with adequate protein and resistance training. ISSN supports a more aggressive deficit at higher baseline fat.",
      "sourceUrl": "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y"
    },
    {
      "sex": "female", "bfMin": 40, "bfMax": 50,
      "conservativePctBwPerWeek": 0.65,
      "optimalPctBwPerWeek": 0.95,
      "aggressivePctBwPerWeek": 1.25,
      "maxKgPerWeek": 1.10,
      "note": "Low lean-mass risk. Cap the relative deficit at 30% of TDEE; the 1200 kcal floor will often bind first for smaller users.",
      "sourceUrl": "https://macrofactor.com/cutting-calculator/"
    },
    {
      "sex": "female", "bfMin": 50, "bfMax": 100,
      "conservativePctBwPerWeek": 0.70,
      "optimalPctBwPerWeek": 1.00,
      "aggressivePctBwPerWeek": 1.30,
      "maxKgPerWeek": 1.20,
      "note": "Low lean-mass risk. Medical supervision advised. Calorie floor and relative-deficit cap will normally bind before the percentage rate does.",
      "sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/"
    }
  ]
}
```

---

## 10. RECOMMENDED CONSTANTS (seed JSON)

```json
{
  "ENGINE_CONSTANTS": {

    "kcalPerKgFat": 7700,
    "kcalPerLbFat": 3500,
    "_kcalPerKgFat_note": "Wishnofsky 1958 / Hall 2008: 3500 kcal/lb = 32.2 MJ/kg. Applies to a kg of TYPICAL MIXED WEIGHT LOSS (~78% fat / 22% lean), not to a kg of pure triglyceride. Static-model error is corrected by the weekly TDEE recalibration.",
    "_kcalPerKgFat_sourceUrl": "https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744/",

    "kcalPerKgPureFat": 9441,
    "kcalPerKgLeanTissue": 1816,
    "_energyDensities_note": "Hall 2008: rho_F = 39.5 MJ/kg fat, rho_L = 7.6 MJ/kg lean-mass change. Reference values for a future composition-aware model; not used by the default engine.",

    "alpertKcalPerKgFatPerDay": 69.3,
    "alpertKcalPerLbFatPerDay": 31.4,
    "alpertKjPerKgFatPerDay": 290,
    "alpertUncertaintyKjPerKgFatPerDay": 25,
    "alpertSafetyFactor": 0.75,
    "_alpert_note": "Alpert 2005, J Theor Biol 233(1):1-13: maximum energy transfer rate from the fat store = (290 +/- 25) kJ/kg fat/day = 69.3 kcal/kg/day = 31.4 kcal/lb/day. Exceeding it forces fat-free-mass catabolism. Derived from lean, semi-starved men (Keys data) at moderate activity, so apply the safety factor. A widely repeated claim that Alpert later corrected this to ~22 kcal/lb/day is UNVERIFIED (no published erratum found) - the safety factor of 0.75 reproduces a similar, more conservative cap transparently.",
    "_alpert_sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/15615615/",

    "activityMultipliers": {
      "sedentary":         1.20,
      "lightlyActive":     1.375,
      "moderatelyActive":  1.55,
      "veryActive":        1.725,
      "extraActive":       1.90
    },
    "defaultActivityLevel": "lightlyActive",
    "_activityMultipliers_note": "Harris-Benedict lineage, aligned with FAO/WHO/UNU 2001 PAL categories. Users systematically over-select: default to lightlyActive, gate 1.55+ behind concrete criteria, and hand over to the measured TDEE estimator after 14 days.",
    "_activityMultipliers_sourceUrl": "https://www.omnicalculator.com/health/bmr-harris-benedict-equation",

    "bmrFormula": {
      "mifflinStJeor": {
        "weightCoef": 10.0, "heightCoef": 6.25, "ageCoef": -5.0,
        "constMale": 5, "constFemale": -161,
        "sourceUrl": "https://ajcn.nutrition.org/article/S0002-9165(23)16698-6/fulltext"
      },
      "katchMcArdle": {
        "intercept": 370, "lbmCoef": 21.6,
        "sourceUrl": "https://www.omnicalculator.com/health/bmr-katch-mcardle"
      },
      "cunningham1980": { "intercept": 500, "lbmCoef": 22 },
      "blendWeightMifflin": 0.5,
      "blendWeightKatchMcArdle": 0.5,
      "_note": "Blend 50/50 when a Navy body-fat reading is available and plausible (5-50%); fall back to Mifflin alone otherwise. Navy BF% error propagates straight into Katch-McArdle via LBM."
    },

    "proteinGPerKgLean": {
      "leanBand":  3.0,
      "midBand":   2.6,
      "highBand":  2.2,
      "absoluteFloorGPerKgBodyweight": 1.6,
      "_bands": "lean = M<15% / F<24%; mid = M 15-25% / F 24-35%; high = M>25% / F>35%",
      "_note": "Helms 2014 and ISSN 2017 both recommend 2.3-3.1 g/kg FFM/day for lean resistance-trained individuals in a deficit. Requirement rises as body fat falls. Floor at 1.6 g/kg bodyweight (Morton 2018 breakpoint) so high-body-fat users are not under-dosed.",
      "_sourceUrls": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/",
        "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y",
        "https://pubmed.ncbi.nlm.nih.gov/28698222/"
      ]
    },

    "fatPctOfCaloriesMin": 0.20,
    "fatPctOfCaloriesMax": 0.30,
    "_fat_note": "Helms 2014: 15-30% of calories from fat; Lyle: 20-25% as a generic starting point. Carbohydrate fills the remainder.",

    "calorieFloor": {
      "male": 1500,
      "female": 1200,
      "alsoNeverBelowBmr": true,
      "maxRelativeDeficitPct": 0.30,
      "energyAvailabilityMinKcalPerKgFfm": 30,
      "energyAvailabilityOptimalKcalPerKgFfm": 45,
      "_note": "Conventional hypocaloric prescriptions are 1200-1500 kcal/d for women and 1500-1800 kcal/d for men. Effective floor = max(sexFloor, BMR, 0.70 x TDEE). Additionally warn if (intake - exerciseKcal) / FFM_kg falls below 30 kcal/kg/day (IOC RED-S low-energy-availability threshold).",
      "_sourceUrls": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/",
        "https://stillmed.olympics.com/media/Documents/Athletes/Medical-Scientific/Consensus-Statements/REDs/IOC-consensus-statement-Relative-Energy-Deficiency-in-Sport-2018.pdf"
      ]
    },

    "ewmaAlpha": 0.10,
    "ewmaAlphaSparseWeighIns": 0.25,
    "ewmaTimeAware": true,
    "ewmaSeedFromFirstNReadings": 3,
    "ewmaOutlierRejectKg": 3.0,
    "_ewma_note": "The Hacker's Diet's 'smoothing constant 0.9' is the decay base; in the standard recursive form trend += alpha*(weight - trend) that is alpha = 0.10 (half-life 6.6 days, ~20-day SMA equivalent). Use alpha = 0.25 when the user weighs in fewer than 5 times a week. For gaps use alpha_eff = 1 - (1-alpha)^daysSinceLastWeighIn.",
    "_ewma_sourceUrl": "https://www.fourmilab.ch/hackdiet/e4/signalnoise.html",

    "trendSlopeWindowDays": 14,
    "minWeighInsPerWeek": 3,
    "settlingInDaysExcluded": 10,
    "plateauMinConsecutiveFlatWeeks": 3,
    "femaleCycleComparisonWindowDays": 28,

    "tdeeRecalibration": {
      "formula": "TDEE_measured = avgDailyIntakeKcal - (deltaTrendWeightKg * kcalPerKgFat) / days",
      "windowDaysMin": 14,
      "windowDaysDefault": 21,
      "windowDaysMax": 28,
      "dampingBeta": 0.30,
      "maxWeeklyChangeKcal": 150,
      "sanityBoundsVsFormulaSeed": [0.65, 1.45],
      "minIntakeLogDaysPerWeek": 5,
      "_note": "deltaTrendWeightKg is signed and negative when losing, so a loss adds to TDEE. Use the EWMA trend, never raw scale weight. Exclude the first 10 days of any new deficit (glycogen/water). Once this is running, DO NOT also apply the a-priori adaptation terms below - that double-counts.",
      "_sourceUrl": "https://macrofactor.com/expenditure-v3/"
    },

    "metabolicAdaptation": {
      "kcalPerDayPerKgLost": 22,
      "adaptivePctPerWeek": 0.004,
      "adaptiveCapPct": 0.10,
      "_note": "A-priori (open-loop) model for weeks 1-2 only, before enough data exists for the measured recalibration. 22 kcal/day per kg comes from Hall's Lancet rule of thumb (100 kJ/day per kg of eventual weight change). The adaptive term reflects ISSN's 10-15% adaptive thermogenesis, discounted because resistance training plus adequate protein largely circumvents it.",
      "_sourceUrls": [
        "https://pubmed.ncbi.nlm.nih.gov/21872751/",
        "https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y",
        "https://pubmed.ncbi.nlm.nih.gov/24571926/"
      ]
    },

    "bodyFatMeasurement": {
      "navySeePctMale": 3.42,
      "navySeePctFemale": 4.12,
      "navySeePctPublished": 3.5,
      "displayUncertaintyPct": 3.5,
      "interObserverReproducibilityPct": 1.0,
      "reMeasureIntervalDays": 28,
      "minMeaningfulChangePp": 2.0,
      "bfEwmaAlpha": 0.30,
      "primaryProgressSignals": ["trendWeight", "waistCircumference"],
      "_note": "Navy circumference method: SEE 3-4 %BF vs criterion methods; 3.42% (men) / 4.12% (women) vs DXA in 1407 Army recruits, with a mean underestimate of 6.0 pp. Critically, it tracks CHANGE poorly: over 8 weeks, 43% of women and 14.5% of men showed a %BF GAIN by tape while DXA showed a LOSS. Use body fat % to DEFINE the goal, and trend weight + waist to TRACK progress.",
      "_sourceUrls": [
        "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/",
        "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9008774/"
      ]
    },

    "fatFractionOfWeightLost": {
      "highBodyFat": 1.00,
      "midBodyFat": 0.90,
      "lowBodyFat": 0.80,
      "_note": "Fraction of lost weight assumed to be fat, used to decrement fat mass in the weekly roadmap. Forbes/McDonald: very lean dieters can lose up to 1 lb of muscle per 3 lb of total weight lost.",
      "_sourceUrl": "https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat"
    },

    "maxPlanWeeks": 104,
    "recommendedMaxContinuousDeficitWeeks": 12,
    "recommendedDietBreakWeeks": 2,
    "_dietBreak_note": "RP Strength: cut 8-12 weeks, then break for 8+ weeks (or at minimum a 1-2 week maintenance break) before resuming. Lyle: aggressive protocols for lean people are '2 weeks tops'.",
    "_dietBreak_sourceUrl": "https://rpstrength.com/blogs/articles/slow-losses"
  }
}
```

---

## 11. Full source list

**Energy content of fat / dynamic modelling**
- Wishnofsky M. Caloric equivalents of gained or lost weight. Am J Clin Nutr 1958;6:542–546. https://doi.org/10.1093/ajcn/6.5.542
- Hall KD. What is the required energy deficit per unit weight loss? Int J Obes 2008;32:573–576. https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744/
- Hall KD, Chow CC. Why is the 3500 kcal per pound weight loss rule wrong? Int J Obes 2013;37:1614. https://www.nature.com/articles/ijo2013112
- Thomas DM et al. Can a weight loss of one pound a week be achieved with a 3500-kcal deficit? Int J Obes 2013;37:1611–1613. https://www.nature.com/articles/ijo201351
- Hall KD et al. Quantification of the effect of energy imbalance on bodyweight. Lancet 2011;378:826–837. https://pubmed.ncbi.nlm.nih.gov/21872751/
- NIH Body Weight Planner. https://www.niddk.nih.gov/health-information/professionals/diabetes-discoveries-practice/nih-body-weight-planner
- Lancet web appendix (equations). https://www.niddk.nih.gov/-/media/Files/Labs-Branches-Sections/laboratory-biological-modeling/integrative-physiology-section/Hall-Lancet-Web-Appendix_508.pdf

**Maximum rate of fat mobilisation**
- Alpert SS. A limit on the energy transfer rate from the human fat store in hypophagia. J Theor Biol 2005;233(1):1–13. https://pubmed.ncbi.nlm.nih.gov/15615615/
- Baye D. Calculating the daily calorie deficit for maximum fat loss. https://baye.com/calculating-the-daily-calorie-deficit-for-maximum-fat-loss/
- Venuto T. How to lose a pound of fat per day. https://www.burnthefatfeedthemuscle.com/how-to-lose-a-pound-of-fat-per-day.html
- FatCalc maximum fat loss (source of the unverified 22 kcal/lb erratum claim). https://www.fatcalc.com/mfl

**Rate of loss, lean-mass retention, protein**
- Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation. JISSN 2014;11:20. https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/
- Aragon AA et al. ISSN position stand: diets and body composition. JISSN 2017;14:16. https://www.tandfonline.com/doi/full/10.1186/s12970-017-0174-y
- Jäger R et al. ISSN position stand: protein and exercise. JISSN 2017;14:20. https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
- Garthe I et al. Effect of two different weight-loss rates... Int J Sport Nutr Exerc Metab 2011;21(2):97–104. https://pubmed.ncbi.nlm.nih.gov/21558571/
- Garthe I et al. Long-term effect of weight loss on body composition and performance in elite athletes. https://pubmed.ncbi.nlm.nih.gov/21896944/
- Murphy C, Koehler K. Energy deficiency impairs resistance training gains in lean mass but not strength. Scand J Med Sci Sports 2022;32(1):125–137. https://pubmed.ncbi.nlm.nih.gov/34623696/
- Morton RW et al. Protein supplementation meta-analysis. BJSM 2018;52:376–384. https://pubmed.ncbi.nlm.nih.gov/28698222/
- McDonald L. Setting the deficit — small, moderate or large. https://bodyrecomposition.com/fat-loss/3-sizes-of-calorie-deficit
- McDonald L. The fundamentals of fat loss diets part 1. https://bodyrecomposition.com/fat-loss/4-fat-loss-fundamentals
- McDonald L. Muscle loss while dieting to single digit body fat levels. https://bodyrecomposition.com/fat-loss/muscle-loss-single-digit-bodyfat
- McDonald L. The Rapid Fat Loss Handbook (category system). https://store.bodyrecomposition.com/shop/rapid-fat-loss-handbook/
- Category thresholds reproduced. https://everycalculators.com/lyle-mcdonald-psmf-calculator.html
- MacroFactor. How fast to lose weight when cutting. https://macrofactor.com/cutting-calculator/
- RP Strength. Stop rushing your weight loss. https://rpstrength.com/blogs/articles/slow-losses

**TDEE, adaptation, floors**
- Mifflin MD, St Jeor ST et al. AJCN 1990;51:241–247. https://ajcn.nutrition.org/article/S0002-9165(23)16698-6/fulltext
- Medscape Mifflin–St Jeor calculator (coefficients). https://reference.medscape.com/calculator/846/mifflin-st-jeor-equation-calculator
- Katch–McArdle / Cunningham. https://www.omnicalculator.com/health/bmr-katch-mcardle
- Harris–Benedict activity multipliers. https://www.omnicalculator.com/health/bmr-harris-benedict-equation
- Trexler ET, Smith-Ryan AE, Norton LE. Metabolic adaptation to weight loss: implications for the athlete. JISSN 2014;11:7. https://www.tandfonline.com/doi/full/10.1186/1550-2783-11-7
- Koliaki C et al. Defining the optimal dietary approach for safe, effective and sustainable weight loss. Healthcare 2018;6:73. https://pmc.ncbi.nlm.nih.gov/articles/PMC6163457/
- IOC consensus statement on RED-S (2018). https://stillmed.olympics.com/media/Documents/Athletes/Medical-Scientific/Consensus-Statements/REDs/IOC-consensus-statement-Relative-Energy-Deficiency-in-Sport-2018.pdf
- MacroFactor V3 expenditure algorithm. https://macrofactor.com/expenditure-v3/
- MacroFactor expenditure accuracy. https://macrofactor.com/algorithm-accuracy/

**Smoothing and measurement**
- Walker J. The Hacker's Diet — Signal and Noise. https://www.fourmilab.ch/hackdiet/e4/signalnoise.html
- Hacker's Diet EWMA implementation notes. https://en.wikiversity.org/wiki/One_man%27s_look_at_The_Hacker%27s_Diet
- MacroFactor weight trend help. https://help.macrofactorapp.com/en/articles/21-weight-trend
- Body composition changes during 8 weeks of military training are not accurately captured by circumference-based assessments. Front Physiol 2023. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282178/
- Potter AW et al. Circumference-based predictions of body fat revisited (USMC). Front Physiol 2022;13:868627. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9008774/
- Hodgdon JA, Beckett MB (1984). Prediction of percent body fat for US Navy men/women from body circumferences and height. Naval Health Research Center.
