import type { Document, Link, Notion } from "@/lib/types";

export const documents: Document[] = [
  { id: "d1", title: "Introduction to Risk Theory", kind: "book" },
  { id: "d2", title: "Life Insurance Mathematics", kind: "book" },
  { id: "d3", title: "Reinsurance: A Practical Guide", kind: "book" },
  { id: "d4", title: "Solvency II Technical Specifications", kind: "regulation" },
  { id: "d5", title: "Non-Life Actuarial Methods", kind: "course" },
];

export const notions: Notion[] = [
  {
    id: "root",
    label: "Insurance & Actuarial Science",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The discipline of quantifying, pricing, and managing risk through pooling, using probability, statistics, and financial theory.",
    explanation:
      "Think of actuarial science as the engineering discipline behind insurance: physics tells you whether a bridge will hold, actuarial science tells you whether an insurer's promises will hold. Every other notion in this graph — premiums, reserves, capital requirements, reinsurance — exists to answer one practical question an intern will hear constantly: \"if we take on this risk, how much money do we need, and when?\"\n\nThe field sits at the intersection of three things: probability (how likely is the bad event), finance (what is a future payment worth today), and law/regulation (what are we required to hold back). A pure mathematician can compute a probability; an actuary turns that probability into a price, a reserve, and a capital number that a regulator will sign off on.\n\nConcrete example: imagine pricing home insurance for 50,000 houses. Historical data says 0.4% burn down each year, average loss $150,000. Expected cost per house = 0.004 × $150,000 = $600/year. That $600 is pure actuarial science — everything that follows in this graph (loadings, reserves, capital, reinsurance) is built on getting that number right and then managing what happens when reality deviates from it.",
    workQuestions: [
      { question: "What line of business are we pricing this for?", answer: "" },
      { question: "Is this risk even insurable, or should we decline it?", answer: "" },
      { question: "What's our combined ratio looking like this quarter?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 1 }],
  },
  {
    id: "risk",
    label: "Risk",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The possibility of an uncertain future event causing a financial loss, which insurance aims to transfer and pool.",
    explanation:
      "In everyday speech \"risk\" means danger. In actuarial work it means something more specific and more useful: a random variable — an outcome you can't predict for one individual, but can describe statistically across many. That distinction is the whole reason insurance can exist as a business rather than a bet.\n\nAn insurable risk generally needs a few properties an intern should learn to check: the loss must be accidental (not something the policyholder can trigger on purpose), measurable in money, independent-ish across policyholders (so one bad event doesn't bankrupt the whole pool at once), and have a large enough population to apply statistics to. A risk that fails these — say, the risk that a specific company's stock drops, which is often correlated with the broader market and hard to pool — is why insurers don't sell policies against ordinary stock-market losses the way they sell fire insurance.\n\nExample: insuring a single cargo ship against sinking is terrifying for one insurer — a single loss could be $50M. But if 200 insurers each take a small slice (this is exactly what reinsurance and syndicates like Lloyd's do), each only carries $250k of expected exposure, and the law of large numbers makes that manageable. Risk itself doesn't change; who carries how much of it does.",
    workQuestions: [
      { question: "Is this risk independent enough from the rest of the book to pool normally?", answer: "" },
      { question: "How are we defining the loss event in the policy wording?", answer: "" },
      { question: "What's driving the volatility in this segment — frequency or severity?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 8 }],
  },
  {
    id: "law-of-large-numbers",
    label: "Law of Large Numbers",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "As the number of independent, identically distributed risks grows, the average outcome converges to the expected value, making pooled risk predictable.",
    explanation:
      "This is the one piece of math that makes the entire insurance industry possible, so it's worth really internalizing it rather than just nodding along. For a single policyholder, whether they have a car accident this year is basically a coin flip you can't call. But average that coin flip over 100,000 policyholders, and the proportion who crash converges tightly around the true underlying probability — the bigger the pool, the tighter that convergence.\n\nThe practical consequence: an insurer doesn't need to predict individual outcomes, only the portfolio average, and the more policies it writes, the more confident it can be in that average. This is why a brand-new insurer with only 500 policyholders is far riskier to run (relative volatility is high) than an established one with 2 million (relative volatility is low), even if both have identical underlying risk per policy.\n\nWorked example: suppose each policy has a 2% chance of a $10,000 claim (expected cost $200/policy). With 100 policies, the standard deviation of total claims is large relative to the $20,000 expected total — a bad year could plausibly double it. With 1,000,000 policies, the law of large numbers means actual total claims will almost certainly land within a percent or two of the $200M expected total. That shrinking relative uncertainty, not any change in the per-policy risk, is what lets an insurer price with confidence and hold a sane amount of capital instead of pricing for the worst case every time.",
    workQuestions: [
      { question: "Is our portfolio big enough yet for the law of large numbers to kick in?", answer: "" },
      { question: "How volatile is this book relative to its size?", answer: "" },
      { question: "Do we need more volume before we can price this confidently?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 15 }],
  },
  {
    id: "mutualization",
    label: "Mutualization",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "Spreading the cost of a few large losses across a large pool of policyholders who each pay a small, predictable contribution.",
    explanation:
      "Mutualization is the business mechanism that turns the law of large numbers into an actual product. The idea is almost deceptively simple: instead of each individual bearing the full, unpredictable cost of a rare disaster alone, everyone pays a small, predictable amount into a common pool, and the pool pays out to whoever actually suffers the loss.\n\nThe key word is \"predictable.\" Nobody can predict whether their own house burns down this year, but an insurer, using the law of large numbers across thousands of similar houses, CAN predict fairly precisely what fraction will. That predictability is what gets converted into a flat, affordable premium instead of everyone having to self-insure by keeping $300,000 in cash on hand just in case their house burns down.\n\nConcrete example: 10,000 homeowners, each with a 0.5% annual chance of a $200,000 total-loss fire. Expected claims = 10,000 × 0.005 × $200,000 = $10,000,000 per year. Divide that across the pool: $1,000/policyholder/year. Each homeowner pays a manageable $1,000 instead of facing a 0.5% chance of an unmanageable $200,000 loss. Nobody's individual risk changed — what changed is that the pool absorbed the volatility and handed back a flat, budgetable number. This is literally what the word \"premium\" in the next notion refers to.",
    workQuestions: [
      { question: "How are we splitting the cost of claims across the pool?", answer: "" },
      { question: "Is the pool diverse enough that one bad event won't sink it?", answer: "" },
      { question: "What's the breakeven contribution per policyholder?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 20 }],
  },
  {
    id: "premium",
    label: "Premium",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The amount a policyholder pays for insurance coverage, calibrated to cover expected claims, expenses, and a margin.",
    explanation:
      "The premium is the price tag of the whole mutualization mechanism — and like any price, it has to cover more than just the raw cost of goods. An intern pricing a product for the first time often assumes the premium is just \"expected claims,\" but that's only the starting point, called the pure premium (see that notion). On top of it, the insurer stacks acquisition costs (broker commissions), administrative expenses (claims handling, IT, staff), and a profit/risk margin to compensate for the uncertainty it's taking on.\n\nA useful mental model: premium = pure premium + expense loading + profit loading. Each of those three pieces is negotiated and justified separately in a pricing exercise, and regulators (and competitors) scrutinize all three — not just whether the claims estimate is accurate, but whether the loadings are reasonable.\n\nWorked example: a motor policy with an expected claims cost of $350 (pure premium). Add $80 of acquisition and admin expenses, and a 15% profit margin on the total. ($350+$80) × 1.15 ≈ $495. That $495 is what actually appears on the policyholder's invoice — the $350 claims cost is invisible to them, but it's the number every actuary in the building cares most about getting right, because errors there don't show up until claims actually hit, often a year or more later.",
    workQuestions: [
      { question: "Did you calculate the premium?", answer: "" },
      { question: "What's included in the loading — expenses, profit, both?", answer: "" },
      { question: "Is this premium competitive against the market rate?", answer: "" },
      { question: "Can we justify this price to the regulator?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 34 }],
  },
  {
    id: "pure-premium",
    label: "Pure Premium",
    domain: "Non-Life Actuarial",
    status: "validated",
    definition:
      "The portion of the premium that covers expected claims only, excluding expenses and profit loading.",
    explanation:
      "Pure premium is the number you'd charge if you were a non-profit whose only job was to break even on claims — no overhead, no margin. It's computed from two ingredients every pricing actuary lives and breathes: frequency (how often a claim happens) and severity (how big it is when it does). Pure premium = frequency × severity.\n\nThe reason this split matters so much in practice is that frequency and severity often move independently and need to be modeled separately. A product can see claim frequency go up (more claims happening) while severity stays flat, or vice versa — and the right pricing or underwriting response is completely different in each case. Auto insurance during a recession, for instance, often sees frequency drop (people drive less) while severity creeps up (cars and repairs get more expensive).\n\nWorked example: a book of commercial property policies has a claim frequency of 8% per year (8 claims per 100 policies) and an average claim severity of $25,000. Pure premium = 0.08 × $25,000 = $2,000 per policy per year. If next year frequency rises to 10% because of a wildfire season but severity stays at $25,000, pure premium jumps to $2,500 — purely a frequency story, and the actuary's writeup to management needs to say so, because the fix (tighter underwriting in fire-prone zones) is different from the fix for a severity problem (higher deductibles or lower limits).",
    workQuestions: [
      { question: "What's the pure premium on this book before loadings?", answer: "" },
      { question: "Is the frequency or the severity assumption driving the number?", answer: "" },
      { question: "How does this compare to last year's pure premium?", answer: "" },
    ],
    sources: [{ documentId: "d5", page: 12 }],
  },
  {
    id: "loaded-premium",
    label: "Loaded Premium",
    domain: "Non-Life Actuarial",
    status: "draft",
    definition:
      "The pure premium plus loadings for expenses, profit margin, and risk margin, resulting in the price charged to the policyholder.",
    explanation:
      "If pure premium is \"what claims cost us,\" loaded premium is \"what we actually charge,\" and the gap between them is where most of the commercial decision-making in insurance pricing happens. The loadings typically break into three buckets an intern should be able to name on the spot: expense loading (the real operational cost of running the business — underwriting, claims handling, commissions), a risk/contingency loading (compensation for the uncertainty in the pure premium estimate itself — the insurer isn't 100% sure its frequency/severity numbers are right), and a profit loading (the return shareholders expect for putting capital at risk).\n\nOne subtlety worth internalizing: loadings aren't usually a flat add-on, they're often expressed as a percentage, which means pricing errors in the pure premium get amplified, not fixed, by the loading. If your pure premium is wrong by 10%, your loaded premium carries that same 10% error multiplied through.\n\nWorked example: pure premium of $2,000 (from the previous example), with a combined expense ratio of 25% and a target profit margin of 8%. A common approach: Loaded Premium = Pure Premium / (1 − expense ratio − profit margin) = $2,000 / (1 − 0.25 − 0.08) = $2,000 / 0.67 ≈ $2,985. Notice this is a division, not a simple multiplication — loadings are usually expressed as a share of the FINAL premium, not the pure premium, which is a common point of confusion for people new to pricing.",
    workQuestions: [
      { question: "What expense ratio are we loading into this?", answer: "" },
      { question: "Is the profit margin target realistic for this line?", answer: "" },
      { question: "Did you load on top of pure premium or divide through it?", answer: "" },
    ],
    sources: [{ documentId: "d5", page: 18 }],
  },
  {
    id: "moral-hazard",
    label: "Moral Hazard",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The tendency of an insured party to take more risks or reduce precautions because the financial consequences are covered by insurance.",
    explanation:
      "Moral hazard is what happens when insurance changes the thing it's insuring. The classic framing: once you're covered, your incentive to prevent the bad outcome weakens, because you no longer bear its full cost. This is a behavioral economics problem as much as an actuarial one, and it's one of the two big reasons (along with adverse selection) that insurance pricing is never as simple as \"just compute the historical average claim cost.\"\n\nInsurers fight moral hazard with a handful of standard tools an intern will see constantly: deductibles (the policyholder keeps \"skin in the game\" for small losses), coinsurance (the policyholder pays a percentage of every claim, not just below a threshold), policy limits, and exclusions for reckless behavior. All of these exist specifically to keep the insured's incentives at least partially aligned with the insurer's.\n\nWorked example: a company offers 100% reimbursement dental coverage with no deductible. Enrolled employees' dental visit frequency jumps 40% compared to a plan with a $50 deductible and 20% coinsurance — not because people's teeth got worse, but because the marginal cost of \"just going to check\" dropped to zero. The insurer didn't mis-estimate underlying dental health; it mis-estimated how coverage design itself would change behavior. That gap between \"risk before insurance\" and \"risk after insurance\" is moral hazard in a nutshell.",
    workQuestions: [
      { question: "Does this product design create a moral hazard problem?", answer: "" },
      { question: "Should we add a deductible to keep the policyholder's incentives aligned?", answer: "" },
      { question: "Are claim frequencies drifting up since we removed that exclusion?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 44 }],
  },
  {
    id: "adverse-selection",
    label: "Adverse Selection",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The tendency of higher-risk individuals to seek insurance more than lower-risk individuals, distorting the risk pool if unpriced.",
    explanation:
      "Where moral hazard is about behavior changing AFTER coverage starts, adverse selection is about who shows up to BUY coverage in the first place. The problem: the applicant almost always knows more about their own true risk than the insurer does (a smoker knows they smoke; a family with a history of a hereditary illness knows that history). If the insurer prices everyone the same based on the population average, the deal looks relatively unattractive to low-risk people (they're overpaying) and attractive to high-risk people (they're underpaying) — so low-risk people disproportionately walk away, the remaining pool skews riskier than the original average, and the insurer loses money unless it adjusts.\n\nLeft unmanaged, this can spiral: price goes up to cover the now-riskier pool, which pushes out the next tier of comparatively-lower-risk people, which raises the average risk again — sometimes called a death spiral, a term actuaries use completely literally when talking about collapsing health insurance pools.\n\nThe standard countermeasure is underwriting: collecting enough information at application (medical exams, driving records, building inspections) to price each applicant closer to their true risk instead of a flat pool average, which keeps low-risk people from being overcharged relative to their actual risk and therefore keeps them in the pool. Example: a life insurer that charges the same rate to smokers and non-smokers will attract disproportionately more smokers (who know the flat rate undercharges them) — which is exactly why virtually every life insurer asks about smoking status and prices it in, often doubling or tripling the premium for smokers to reflect roughly double the mortality risk.",
    workQuestions: [
      { question: "Are we underwriting enough to avoid adverse selection here?", answer: "" },
      { question: "Is this pool skewing riskier than when we first priced it?", answer: "" },
      { question: "Should we ask more questions at application to screen for this?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 47 }],
  },
  {
    id: "claim",
    label: "Claim",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "A formal request by a policyholder for payment based on the terms of an insurance policy, following a covered loss event.",
    explanation:
      "A claim is where all the pricing theory meets reality — it's the moment the abstract \"risk\" the actuary priced for actually materializes into a concrete cash outflow. For an intern, it's worth knowing that a claim isn't a single event, it's a lifecycle with distinct stages that each get tracked separately in the data: occurrence (when the loss actually happened), reporting (when the insurer finds out — not always the same day!), and settlement (when the final payment is made, which can be months or years later for complex claims like liability or long-tail workers' comp).\n\nThat gap between occurrence and settlement is hugely important: it's the entire reason \"claims reserves\" and \"technical provisions\" need to exist as a concept — the insurer knows (or estimates) it owes money for claims that happened but haven't finished being paid out.\n\nConcrete example: a factory fire happens on March 1st (occurrence), gets reported to the insurer on March 3rd (reporting lag of 2 days — fast, because it's an obvious, visible event), but the final payout isn't settled until the following January because of a dispute over the exact cause and a lengthy repair-cost assessment (10-month settlement lag). For an auto bodily-injury claim involving a lawsuit, that settlement lag can stretch to 3-5+ years. Every one of those claims sits as an open liability on the insurer's books the whole time, which is exactly what technical provisions are built to capture.",
    workQuestions: [
      { question: "Has the claim been reported yet, or are we just anticipating it?", answer: "" },
      { question: "Where is this claim in the settlement process?", answer: "" },
      { question: "What's the reporting lag been on this line recently?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 52 }],
  },
  {
    id: "technical-provisions",
    label: "Technical Provisions",
    domain: "Core Concepts",
    status: "validated",
    definition:
      "The amount an insurer sets aside on its balance sheet to cover future obligations arising from policies already written.",
    explanation:
      "Technical provisions are the single largest liability on most insurers' balance sheets, often dwarfing shareholder equity — which is exactly why getting them right is one of the most consequential jobs an actuary does, and why regulators scrutinize them so closely. The core idea: an insurer has made promises (to pay claims, to pay life benefits) that haven't been fully settled yet, and it needs to hold back enough money today to be able to keep those promises.\n\nUnder Solvency II (the EU framework covered elsewhere in this graph), technical provisions split into two layers: a best estimate (the expected-value, probability-weighted cost of future obligations, discounted to today) plus a risk margin on top (extra cushion compensating for the uncertainty in that estimate — conceptually, what another insurer would charge to take the liabilities off your hands). Under older, simpler accounting frameworks, insurers instead talk about claims reserves (non-life) or mathematical reserves (life), which are closely related but computed with different, often more conservative, methodologies.\n\nWorked example: an insurer has written 50,000 active auto policies. Based on historical patterns, it estimates it will ultimately pay out $42M for claims already incurred but not yet fully settled, plus $3M of risk margin for the uncertainty in that $42M estimate. Total technical provisions: $45M, sitting as a liability on the balance sheet, backed by $45M of assets the insurer is not free to use for anything else — dividends, investment, buybacks — until those claims are actually paid out.",
    workQuestions: [
      { question: "Are our technical provisions adequate for what's already on the books?", answer: "" },
      { question: "How much of this is best estimate versus risk margin?", answer: "" },
      { question: "Did the actuarial function sign off on this reserve number?", answer: "" },
    ],
    sources: [{ documentId: "d1", page: 61 }, { documentId: "d4", page: 22 }],
  },
  {
    id: "best-estimate",
    label: "Best Estimate",
    domain: "Life Actuarial",
    status: "validated",
    definition:
      "The probability-weighted average of future cash flows, discounted to present value, used as the core of technical provisions under Solvency II.",
    explanation:
      "The best estimate answers one question as precisely as the data allows: \"across every plausible future scenario, weighted by how likely each one is, what do we expect to actually pay out, expressed in today's money?\" Two words in there do a lot of work that interns often gloss over: \"probability-weighted\" means you're not taking the worst case or the most likely single scenario, you're taking a genuine expected value across the whole distribution of outcomes; and \"discounted\" means future cash flows are converted to present value because money today is worth more than the same amount in five years (see the Discounting notion).\n\nIn practice, computing a best estimate for anything beyond a simple product means projecting cash flows year by year — premiums coming in, claims and expenses going out — often under hundreds or thousands of stochastically simulated economic scenarios (interest rates, inflation, lapse rates), then averaging the discounted results. This is genuinely heavy actuarial modeling work, not a back-of-envelope calculation, which is why best-estimate computation is usually done with dedicated actuarial software rather than a spreadsheet.\n\nWorked example (simplified): a block of life insurance policies is expected to pay out $10M in 1 year, $8M in 2 years, and $6M in 3 years, each number already probability-weighted across mortality and lapse scenarios. At a 4% discount rate, the best estimate = 10M/1.04 + 8M/1.04² + 6M/1.04³ ≈ $9.62M + $7.40M + $5.33M ≈ $22.35M. That $22.35M, not the undiscounted $24M, is what Solvency II requires the insurer to hold as the core of its technical provisions.",
    workQuestions: [
      { question: "What discount curve did you use for the best estimate?", answer: "" },
      { question: "Is this a probability-weighted average or just the most likely scenario?", answer: "" },
      { question: "How many stochastic scenarios went into this run?", answer: "" },
    ],
    sources: [{ documentId: "d4", page: 25 }],
  },
  {
    id: "discounting",
    label: "Discounting",
    domain: "Life Actuarial",
    status: "validated",
    definition:
      "Converting future cash flows into present value using a discount rate, reflecting the time value of money.",
    explanation:
      "Discounting formalizes an intuition everyone already has: $1,000 handed to you today is worth more than a promise of $1,000 in ten years, because you could invest today's $1,000 and have more than $1,000 by then. The discount rate is the interest rate used to run that logic backwards — shrinking a future amount down to what it's equivalently worth right now.\n\nThe formula is simple (Present Value = Future Value / (1 + r)^n, where r is the discount rate and n is the number of years), but the rate you plug in is where the real actuarial judgment lives. In practice, insurers often use a \"risk-free\" yield curve (published by regulators) rather than a single flat rate, because the appropriate rate for a cash flow 1 year out is usually different from the rate for one 20 years out.\n\nWhy it matters so much in insurance specifically: life insurance and pension liabilities can stretch 40+ years into the future, so even a small change in the discount rate assumption swings the present value enormously — which is exactly why discount-rate methodology is one of the most politically and technically contentious topics in actuarial regulation. Worked example: a $100,000 payment due in 20 years, discounted at 3%, is worth $100,000 / 1.03²⁰ ≈ $55,368 today. Discount it instead at 5% (a seemingly small, 2-point difference) and it's worth only $100,000 / 1.05²⁰ ≈ $37,689 today — a nearly $18,000 swing on a single cash flow, purely from the choice of rate, with zero change in the actual promised payment.",
    workQuestions: [
      { question: "What discount rate are we assuming for this cash flow?", answer: "" },
      { question: "Are we using a flat rate or the full yield curve?", answer: "" },
      { question: "How sensitive is this liability to a 1-point rate change?", answer: "" },
    ],
    sources: [{ documentId: "d2", page: 30 }],
  },
  {
    id: "present-value-future-benefits",
    label: "Present Value of Future Benefits",
    domain: "Life Actuarial",
    status: "draft",
    definition:
      "The discounted expected value of all future benefit payments promised under a life insurance policy.",
    explanation:
      "This notion is where discounting and mortality tables are literally multiplied together, and it's the backbone computation of life actuarial work — the thing an intern will eventually build spreadsheets and models around constantly. For any given policy, you don't just discount a single future payment; you discount EVERY possible future payment date, weighted by the probability the insured is alive (or dies) at that date, pulled straight from the mortality table.\n\nFor a simple whole-life death benefit, the logic per future year is: (probability the insured dies in that specific year) × (benefit amount) × (discount factor for that year) — then sum across every future year. For an annuity (payments while alive, rather than on death), it's the mirror image: (probability of still being alive) × (payment amount) × (discount factor), summed.\n\nWorked example: a 1-year term policy on a 50-year-old, $100,000 death benefit, mortality table says 0.3% chance of death this year, discount rate 4%. Present value of future benefits = 0.003 × $100,000 / 1.04 ≈ $288.46. Stretch that same policy to a 3-year term with mortality rates of 0.3%, 0.32%, 0.35% in years 1, 2, 3 respectively, and you sum three such terms (each using the probability of dying specifically in that year, properly adjusted for having survived the prior years) — this cumulative, year-by-year computation is exactly why real life insurance pricing is modeled rather than computed by hand past the simplest cases.",
    workQuestions: [
      { question: "Did you run the present value of future benefits for this cohort?", answer: "" },
      { question: "Which mortality table version did you use for the weighting?", answer: "" },
      { question: "Is this an annuity or a death-benefit cash flow we're discounting?", answer: "" },
    ],
    sources: [{ documentId: "d2", page: 42 }],
  },
  {
    id: "mortality-table",
    label: "Mortality Table",
    domain: "Life Actuarial",
    status: "validated",
    definition:
      "A table showing the probability of death at each age for a given population, used to price and reserve for life insurance products.",
    explanation:
      "A mortality table is, at its simplest, a list of one number per age: the probability a person exactly that age dies before reaching the next age, usually written qₓ (\"q sub x\", the mortality rate at age x). From that single column, actuaries derive everything else they need — survival probabilities, life expectancy, and crucially the probability-weighting used in present-value-of-future-benefits calculations.\n\nA detail that surprises a lot of interns: insurers rarely use raw population mortality tables straight from a national statistics office. They build or buy tables specific to insured populations (who tend to be healthier than the general population — this is called the \"healthy insured effect\"), and they load in margins for conservatism, since underestimating mortality on a life product means the insurer could run out of money to pay death benefits, while underestimating it on an annuity (where you pay as long as someone's alive) means paying out for longer than expected — notice the conservatism runs in OPPOSITE directions for the two product types, which is why insurers often maintain separate mortality tables for life insurance versus annuities.\n\nWorked example: a table shows q₇₀ = 1.2% (a 70-year-old has a 1.2% chance of dying before turning 71) and q₇₁ = 1.35%. The probability a 70-year-old survives to 71 and then dies in that next year (i.e., dies exactly at age 71) is (1 − 0.012) × 0.0135 ≈ 1.334%. Chaining these year-by-year survival-and-death probabilities together across decades is exactly how an actuary builds the probability weights used in every present-value-of-future-benefits calculation for that policy.",
    workQuestions: [
      { question: "Which mortality table are we using — insured lives or population?", answer: "" },
      { question: "Is this product priced on the life table or the annuitant table?", answer: "" },
      { question: "How much conservatism margin is baked into these qx rates?", answer: "" },
    ],
    sources: [{ documentId: "d2", page: 10 }],
  },
  {
    id: "claims-reserve",
    label: "Claims Reserve",
    domain: "Non-Life Actuarial",
    status: "validated",
    definition:
      "The estimated liability for claims that have been incurred but not yet fully paid or settled.",
    explanation:
      "The claims reserve is non-life insurance's version of technical provisions, and estimating it — called \"loss reserving\" — is arguably THE core job of a non-life (property & casualty) actuary. It splits into two distinct pieces an intern must learn to separate: case reserves (specific estimates set by claims handlers for claims the insurer already knows about) and IBNR, \"incurred but not reported\" (a statistical estimate for claims that have already happened but haven't been reported to the insurer yet — which, for some lines like liability, can be the larger of the two pieces).\n\nThe standard technique for estimating total reserves is the chain-ladder method: lay out historical claims in a triangle by the year they occurred and the year they were paid, and use the observed pattern of how claims develop over time (how much MORE gets paid in year 2 relative to year 1, for a given accident year) to project how much is still owed on recent, not-yet-fully-developed accident years.\n\nWorked example: for accident year 2023, $5M has been paid so far after 1 year of development. Historical patterns for this line of business show that claims from a given accident year are typically only 40% paid out after 1 year, reaching 100% by year 5. Projected ultimate claims for 2023 = $5M / 0.40 = $12.5M. The claims reserve booked today for that accident year = $12.5M (ultimate) − $5M (already paid) = $7.5M still owed. Get the 40% development factor wrong — say the real pattern is 35%, not 40% — and the reserve is understated by roughly $893k, silently, until future years reveal the error.",
    workQuestions: [
      { question: "Have you run the chain-ladder on this accident year yet?", answer: "" },
      { question: "How much of the reserve is case reserve versus IBNR?", answer: "" },
      { question: "Is the development pattern still holding, or did it shift?", answer: "" },
    ],
    sources: [{ documentId: "d5", page: 50 }],
  },
  {
    id: "reinsurance",
    label: "Reinsurance",
    domain: "Reinsurance",
    status: "validated",
    definition:
      "Insurance purchased by an insurer from another insurer to transfer part of its risk portfolio and reduce volatility.",
    explanation:
      "If mutualization is \"spread risk across many policyholders,\" reinsurance is the exact same idea applied one level up: insurers themselves pool and spread risk among each other, because even a well-diversified insurer can get hit by something too big or too correlated to absorb alone — a major hurricane destroying 40,000 houses at once, for instance, where the usual \"independent risks\" assumption behind the law of large numbers breaks down completely.\n\nReinsurance does three jobs an intern should be able to rattle off: it protects solvency (caps how much a single bad event can cost the insurer), it smooths earnings (converts a lumpy, unpredictable claims pattern into a steadier one, which investors and rating agencies like), and it frees up capital (ceding risk reduces the capital the insurer must hold against it under Solvency II, capital that can then be used to write more business). The insurer transferring risk is the \"cedant\"; the one accepting it is the \"reinsurer.\"\n\nThe two broad families of reinsurance structure — proportional and non-proportional — solve this problem in fundamentally different ways, which is why they're broken into their own notions below. Concrete example: a regional insurer with $2B of total exposure to a single hurricane region buys reinsurance specifically so that even in a 1-in-100-year storm, its own net retained loss stays under $150M — turning an existential threat to the company into a bad-but-survivable year.",
    workQuestions: [
      { question: "How much reinsurance do we need to buy for this program?", answer: "" },
      { question: "Who's the cedant and who's the reinsurer on this deal?", answer: "" },
      { question: "Does this cat exposure need a reinsurance layer above it?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 1 }],
  },
  {
    id: "proportional-reinsurance",
    label: "Proportional Reinsurance",
    domain: "Reinsurance",
    status: "validated",
    definition:
      "A reinsurance arrangement where premiums and losses are shared between insurer and reinsurer in an agreed fixed proportion.",
    explanation:
      "Proportional reinsurance is the simpler of the two reinsurance families to reason about, because the relationship is literally just a ratio applied consistently to everything: if the reinsurer takes 30% of the risk, it takes 30% of every premium dollar AND pays 30% of every claim dollar, on every policy in scope, large or small. There's no threshold, no \"only kicks in above X\" — it's proportional from dollar one.\n\nBecause the reinsurer shares risk from the very first dollar (not just the tail), it also typically pays the cedant a ceding commission — reimbursement for acquisition costs like broker commissions — since the reinsurer is effectively taking on a slice of a fully-formed insurance business, acquisition costs included, not just catastrophic risk.\n\nThe two flavors covered elsewhere in this graph, quota share and surplus treaty, differ only in HOW the proportion is set: quota share uses one flat percentage for the whole portfolio, while surplus treaties vary the percentage risk-by-risk based on size. Worked example: a $10,000 premium policy under a 25% quota share treaty means the reinsurer collects $2,500 of that premium and, if a $6,000 claim occurs, pays $1,500 of it (25% of $6,000) — the cedant keeps the other 75% of both the premium and the claims cost, on every single policy, automatically.",
    workQuestions: [
      { question: "Are we going quota share or surplus on this treaty?", answer: "" },
      { question: "What ceding commission did the reinsurer offer?", answer: "" },
      { question: "Does proportional cover actually give us the capital relief we need here?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 14 }],
  },
  {
    id: "quota-share",
    label: "Quota Share",
    domain: "Reinsurance",
    status: "validated",
    definition:
      "A proportional reinsurance treaty where the reinsurer takes a fixed percentage of every risk, premium, and claim in the portfolio.",
    explanation:
      "Quota share is the simplest reinsurance structure that exists, and for that reason it's often the first one an intern actually models end-to-end. One number — the quota share percentage — governs the entire treaty: it's applied uniformly to every policy in the defined scope, no matter how big or small, how risky or safe.\n\nWhy would an insurer use something this blunt instead of a more targeted structure? Mainly for capital relief and growth capacity: quota share immediately reduces net exposure and frees up solvency capital across an ENTIRE line of business in one simple stroke, which is especially useful for a growing insurer that wants to write more policies than its own capital currently supports, or a new insurer entering a line of business it doesn't yet have enough data to price confidently on its own.\n\nThe tradeoff an intern should understand clearly: because quota share cedes proportionally from dollar one, it also cedes away a proportional share of the PROFITABLE, ordinary-sized risks — not just the scary tail risk — which is exactly the risk a well-run, well-priced insurer would often prefer to keep for itself. This is the central reason surplus treaties and non-proportional covers exist: they let an insurer be more selective about what gets ceded. Worked example: a 40% quota share on a $50M premium portfolio cedes $20M of premium to the reinsurer and, if the book pays out $35M in claims, the reinsurer covers $14M (40%) while the cedant retains $21M of both the premium income and the claims cost.",
    workQuestions: [
      { question: "What percentage are we ceding on the quota share this renewal?", answer: "" },
      { question: "Is quota share still the right call, or should we move to surplus?", answer: "" },
      { question: "How much capital relief does this quota share actually buy us?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 16 }],
  },
  {
    id: "surplus-treaty",
    label: "Surplus Treaty",
    domain: "Reinsurance",
    status: "draft",
    definition:
      "A proportional reinsurance treaty where the ceded proportion varies per risk, based on the amount exceeding the insurer's retention line.",
    explanation:
      "Surplus treaties fix quota share's main weakness: instead of ceding the same percentage of every policy regardless of size, a surplus treaty lets the insurer keep ALL of the small, well-understood risks for itself (and their full profit) while only ceding the \"surplus\" — the part of large risks that exceeds a self-chosen retention line. This requires more administrative work (the ceding percentage must be calculated per risk, not applied as one flat number), but it's much more capital-efficient and lets the insurer stay selective.\n\nCapacity under a surplus treaty is usually expressed in \"lines\" — multiples of the retention. A \"9-line\" treaty with a $500,000 retention gives the insurer total underwriting capacity of $500,000 (its own retention) + 9 × $500,000 (reinsurer's lines) = $5,000,000 per risk, letting it write business far larger than its own balance sheet alone would allow.\n\nWorked example with a $1M retention line: a $1.5M risk cedes $500,000 (33% of that specific risk) to the reinsurer; a $4M risk cedes $3M (75%); a $600,000 risk cedes nothing at all — it's fully under the retention and the insurer keeps 100% of it. Notice the ceded percentage is different for every single risk, driven purely by how far above the $1M line it sits, which is the defining mechanical difference from quota share's single flat percentage.",
    workQuestions: [
      { question: "What's our retention line on the surplus treaty this year?", answer: "" },
      { question: "How many lines of capacity do we have above our retention?", answer: "" },
      { question: "Does this large risk exceed our surplus treaty's line limit?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 20 }],
  },
  {
    id: "non-proportional-reinsurance",
    label: "Non-Proportional Reinsurance",
    domain: "Reinsurance",
    status: "validated",
    definition:
      "A reinsurance arrangement where the reinsurer pays losses above a set threshold, regardless of the original premium split.",
    explanation:
      "Non-proportional reinsurance flips the whole relationship compared to proportional covers: there's no sharing ratio applied from dollar one. Instead, the cedant retains ALL losses up to a chosen retention (also called the attachment point), and the reinsurer only pays the amount above that threshold, up to a defined limit. Below the retention, the reinsurer isn't involved at all — the insurer keeps 100% of the premium and 100% of small/medium losses.\n\nThis makes non-proportional cover much more targeted than proportional: it's specifically a tool for managing tail risk (rare, severe losses) rather than smoothing the whole book. Because the reinsurer only gets involved in the bad scenarios, premiums for non-proportional covers (called the \"rate on line\") are usually a small fraction of the covered limit, and there's typically no ceding commission, since the reinsurer isn't sharing in the day-to-day, profitable business the way a proportional reinsurer does.\n\nThe two major forms, covered in their own notions, differ in WHAT triggers the threshold: excess of loss responds to a single large claim or event, while stop loss responds to the portfolio's AGGREGATE losses over a period. Worked example: a $2M retention, $8M limit non-proportional cover means the insurer pays the first $2M of a loss itself, the reinsurer pays the next $8M (so losses up to $10M total are fully covered between the two), and anything above $10M falls back to the insurer unless it has bought an additional higher layer.",
    workQuestions: [
      { question: "Are we buying excess of loss or stop loss for this exposure?", answer: "" },
      { question: "Where should we set the attachment point this renewal?", answer: "" },
      { question: "What's the rate on line for this layer?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 28 }],
  },
  {
    id: "excess-of-loss",
    label: "Excess of Loss",
    domain: "Reinsurance",
    status: "validated",
    definition:
      "A non-proportional treaty where the reinsurer covers losses exceeding a specified retention, up to a defined limit, per event or risk.",
    explanation:
      "Excess of loss (often just \"XoL\") is the workhorse non-proportional structure, and it comes in two common scopes an intern should distinguish: per-risk XoL (applies separately to each individual policy — protects against one unusually large single claim, like a fire totaling a high-value commercial building) and per-occurrence/catastrophe XoL (applies to the AGGREGATE of all losses from one single event, like a hurricane hitting thousands of policies at once — see the catastrophe excess of loss link elsewhere in this graph).\n\nXoL programs are frequently structured in layers, stacked on top of each other, each sold to potentially different reinsurers: a \"working layer\" just above the retention that gets hit reasonably often, and higher, more remote layers that only trigger in genuinely extreme years but offer much larger limits. Pricing for XoL leans heavily on \"burning cost\" analysis (how much would this layer have paid out historically) and extreme value / catastrophe modeling for the upper layers, since by definition there's little or no historical data on the rarest events a top layer is meant to cover.\n\nWorked example: a $1M retention, $4M limit XoL layer. A $3M claim: insurer pays $1M, reinsurer pays $2M (the amount between $1M and $3M). A $7M claim: insurer pays $1M, reinsurer pays the full $4M of its layer (capped at the limit), and the remaining $2M falls back to the insurer unless a higher layer exists above this one to absorb it.",
    workQuestions: [
      { question: "What's the retention and limit on this XoL layer?", answer: "" },
      { question: "Is this per-risk or catastrophe XoL we're buying?", answer: "" },
      { question: "Did this claim breach our XoL attachment point?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 32 }],
  },
  {
    id: "stop-loss",
    label: "Stop Loss",
    domain: "Reinsurance",
    status: "draft",
    definition:
      "A non-proportional treaty that caps the insurer's aggregate claims ratio over a period, with the reinsurer covering losses beyond that cap.",
    explanation:
      "Where excess of loss protects against ONE big claim or event, stop loss protects against the cumulative effect of lots of ordinary-sized claims all landing in the same bad year — a string of small-to-medium losses that individually wouldn't trigger an XoL layer, but together blow through the insurer's budget for the year. It's the insurance equivalent of a \"bad year\" guardrail rather than a \"bad event\" guardrail.\n\nStop loss is usually expressed as a loss ratio (claims divided by premium), not a dollar amount, which is an important distinction for an intern to get right: the trigger moves with how much business the insurer actually wrote that year, rather than being a fixed dollar figure agreed in advance. This makes it naturally scale with the portfolio's size.\n\nWorked example: a stop loss treaty attaches at a 100% loss ratio and covers up to 130%, on a portfolio with $20M of premium. If the insurer's actual loss ratio for the year comes in at 115%, that's $23M of claims against $20M of premium — $3M above the 100% ($20M) attachment point, all of which falls to the reinsurer, since 115% is within the covered 100%-130% band. If the loss ratio instead hits 140%, the reinsurer covers up to the 130% cap ($26M − $20M = $6M) and the insurer bears the remaining 10 points ($2M) itself, since that falls outside the purchased layer.",
    workQuestions: [
      { question: "What's our loss ratio trending at versus the stop-loss attachment?", answer: "" },
      { question: "Where did we set the stop-loss cap this renewal?", answer: "" },
      { question: "Is this bad year going to breach our stop-loss band?", answer: "" },
    ],
    sources: [{ documentId: "d3", page: 38 }],
  },
  {
    id: "solvency-ii",
    label: "Solvency II",
    domain: "Regulation",
    status: "validated",
    definition:
      "The EU regulatory framework for insurers, setting capital requirements, governance standards, and disclosure rules based on risk.",
    explanation:
      "Solvency II is the rulebook that formalizes a simple regulatory question: how do we know, from the outside, that an insurer can actually keep the promises it made? It replaced an older, cruder EU framework (Solvency I) that sized capital requirements largely off premium volume, with a genuinely risk-based system where the capital an insurer must hold is explicitly tied to the ACTUAL risk in its specific balance sheet — more risk, more required capital; less risk (e.g. via reinsurance or diversification), less required capital.\n\nThe framework is organized into three \"pillars\" an intern should be able to name: Pillar 1 (quantitative requirements — how to calculate technical provisions, the SCR, and the MCR, all covered as their own notions here), Pillar 2 (governance and risk management — including the ORSA, Own Risk and Solvency Assessment, where the insurer must demonstrate it understands its OWN specific risk profile, not just the regulatory formula), and Pillar 3 (public disclosure and reporting, so markets and policyholders can see an insurer's solvency position too, not just the regulator).\n\nPractical consequence an intern will feel directly: virtually every actuarial calculation in a European insurer — reserving, pricing, reinsurance strategy, investment strategy — gets evaluated partly through the lens of \"what does this do to our Solvency II capital position,\" because capital is expensive and finite, and management wants in on any decision that moves the SCR number.",
    workQuestions: [
      { question: "Are we Solvency II compliant on this product line?", answer: "" },
      { question: "Which pillar does this filing fall under?", answer: "" },
      { question: "Has the ORSA been updated for this new business plan?", answer: "" },
    ],
    sources: [{ documentId: "d4", page: 1 }],
  },
  {
    id: "scr",
    label: "SCR (Solvency Capital Requirement)",
    domain: "Regulation",
    status: "validated",
    definition:
      "The amount of capital an insurer must hold to ensure a 99.5% probability of meeting obligations over the next 12 months, under Solvency II.",
    explanation:
      "The SCR is Solvency II's headline number, and the \"99.5% probability over 12 months\" phrase is worth unpacking carefully because it's precise and frequently misquoted. It means: the insurer must hold enough capital that it could absorb a 1-in-200-year adverse event over the coming year without becoming insolvent. It is NOT a guarantee nothing bad ever happens — a 1-in-200 scenario DOES happen eventually, by construction. The SCR is calibrated to Value-at-Risk at the 99.5% confidence level, a specific statistical standard, not \"be safe no matter what.\"\n\nInsurers compute the SCR either with a regulator-provided \"standard formula\" (a standardized set of shock scenarios and correlation assumptions applied module by module — market risk, underwriting risk, counterparty risk, operational risk, then aggregated) or, for larger insurers, a bespoke \"internal model\" built and validated specifically for their own risk profile, which usually produces a lower, more tailored capital number because it reflects the insurer's ACTUAL diversification rather than generic assumptions.\n\nWorked example: under the standard formula, an insurer's modules might show non-life underwriting risk of €80M, market risk of €60M, and counterparty default risk of €20M. These aren't simply added together — Solvency II applies a correlation matrix that reflects these risks aren't perfectly correlated (a bad underwriting year doesn't always coincide with a market crash), producing a diversified total SCR of perhaps €120M rather than the naive €160M sum — diversification benefit is itself a core design feature of the SCR formula, not an afterthought.",
    workQuestions: [
      { question: "What's our SCR coverage ratio this quarter?", answer: "" },
      { question: "Standard formula or internal model for this SCR run?", answer: "" },
      { question: "How much diversification benefit are we getting across modules?", answer: "" },
    ],
    sources: [{ documentId: "d4", page: 40 }],
  },
  {
    id: "mcr",
    label: "MCR (Minimum Capital Requirement)",
    domain: "Regulation",
    status: "draft",
    definition:
      "The lower threshold of capital under Solvency II, below which regulatory intervention becomes most severe, typically 25-45% of the SCR.",
    explanation:
      "If the SCR is the \"target\" capital level regulators want insurers comfortably above, the MCR is the hard floor below which the regulator's response escalates sharply — potentially including withdrawing the insurer's license to write new business. Breaching the SCR triggers supervisory engagement and a recovery plan; breaching the MCR is a much more serious event with much less room for negotiation.\n\nUnlike the SCR, which is built from a detailed risk-module calculation, the MCR is deliberately simple: a linear formula based mainly on premiums and technical provisions, then floored at 25% and capped at 45% of the insurer's own SCR (plus an absolute minimum euro amount that varies by insurance type, so even a tiny insurer must hold some minimum capital regardless of the formula's output). The simplicity is intentional — the MCR is meant to be an unambiguous, hard-to-game trigger for the most severe regulatory action, not a nuanced risk assessment.\n\nWorked example: an insurer's SCR comes out to €100M. Its MCR, from the linear formula, would be €38M — that falls within the 25%-45% band (€25M-€45M), so €38M stands as calculated. If the linear formula had instead produced €15M, the 25% floor would override it and the MCR would be set at €25M regardless; if it had produced €60M, the 45% cap would pull it down to €45M. The insurer must hold capital above the MCR at all times just to keep operating, and above the (always higher) SCR to be considered in good standing.",
    workQuestions: [
      { question: "Are we comfortably above the MCR, not just the SCR?", answer: "" },
      { question: "What would breaching the MCR mean for our license?", answer: "" },
      { question: "Did the linear formula hit the 25% floor or the 45% cap?", answer: "" },
    ],
    sources: [{ documentId: "d4", page: 55 }],
  },
];

function link(
  id: string,
  source: string,
  target: string,
  type: Link["type"],
  description: string
): Link {
  return { id, source, target, type, description };
}

export const links: Link[] = [
  // --- Core tree: risk -> pooling -> pricing ---
  link(
    "l-root-risk",
    "root",
    "risk",
    "prerequisite",
    "You cannot define insurance without first defining what it transfers: risk. Example: a fire insurance policy only exists because there's a non-zero chance a building burns down."
  ),
  link(
    "l-risk-lln",
    "risk",
    "law-of-large-numbers",
    "prerequisite",
    "Risk is only insurable at scale because the law of large numbers makes the average outcome of many similar risks predictable, even though each individual outcome is not. Example: no insurer can predict if *your* house will burn, but across 100,000 similar houses the expected number of fires is stable year to year."
  ),
  link(
    "l-lln-mutualization",
    "law-of-large-numbers",
    "mutualization",
    "prerequisite",
    "Because the pool's average loss is predictable, insurers can mutualize it: collect small, calibrated contributions from everyone to cover the few who actually claim. Example: 10,000 policyholders each pay $50/year so the insurer can cover the ~20 expected $20,000 claims."
  ),
  link(
    "l-mutualization-premium",
    "mutualization",
    "premium",
    "prerequisite",
    "The individual contribution each policyholder pays into the mutualized pool is, by definition, the premium."
  ),
  link(
    "l-premium-pure",
    "premium",
    "pure-premium",
    "sub-notion",
    "Pure premium is the first, claims-only layer of the premium before any loadings are added. Example: a $500 total premium might break down as $350 pure premium + $150 of expense/profit loading."
  ),
  link(
    "l-premium-loaded",
    "premium",
    "loaded-premium",
    "sub-notion",
    "Loaded premium is what the policyholder actually pays: pure premium plus the insurer's cost and margin loadings layered on top."
  ),
  link(
    "l-risk-moral-hazard",
    "risk",
    "moral-hazard",
    "sub-notion",
    "Moral hazard is a specific way insurance distorts the underlying risk: once covered, the insured's behavior itself becomes riskier. Example: a renter with contents insurance may stop locking windows as carefully."
  ),
  link(
    "l-risk-adverse-selection",
    "risk",
    "adverse-selection",
    "sub-notion",
    "Adverse selection is the other classic information-asymmetry failure mode of insured risk: the insurer can't fully observe each applicant's true risk level, so high-risk applicants self-select into coverage disproportionately."
  ),
  link(
    "l-risk-claim",
    "risk",
    "claim",
    "prerequisite",
    "A claim is the materialization of risk: the event the policy was written against actually happening. Example: a car accident turns the abstract 'risk of collision' into a concrete claim filing."
  ),
  link(
    "l-claim-technical-provisions",
    "claim",
    "technical-provisions",
    "prerequisite",
    "Because claims can be reported late or take years to settle, insurers must hold technical provisions against claims that have happened (or will happen) but aren't fully paid yet."
  ),
  link(
    "l-tp-best-estimate",
    "technical-provisions",
    "best-estimate",
    "sub-notion",
    "Under Solvency II, technical provisions are decomposed into a best estimate (the expected-value core) plus a risk margin on top."
  ),
  link(
    "l-best-estimate-discounting",
    "best-estimate",
    "discounting",
    "prerequisite",
    "The best estimate sums *future* cash flows, so it requires discounting them to today's value to be comparable with current capital. Example: a $10,000 claim expected to be paid in 5 years is worth less than $10,000 today."
  ),
  link(
    "l-discounting-pvfb",
    "discounting",
    "present-value-future-benefits",
    "prerequisite",
    "The present value of future benefits is simply discounting applied specifically to the stream of promised policyholder benefits in a life contract."
  ),
  link(
    "l-tp-claims-reserve",
    "technical-provisions",
    "claims-reserve",
    "sub-notion",
    "The claims reserve is the non-life-specific slice of technical provisions: the part attributable to claims already incurred."
  ),
  link(
    "l-root-mortality-table",
    "root",
    "mortality-table",
    "related",
    "Mortality tables are one of the foundational statistical tools actuarial science was originally built around, long before modern risk theory. Example: Edmond Halley's 1693 Breslau life table is considered one of the first rigorous actuarial tables."
  ),
  link(
    "l-root-reinsurance",
    "root",
    "reinsurance",
    "prerequisite",
    "Reinsurance is the mechanism by which insurers themselves manage the risk concentrated on their own balance sheet, extending the core idea of risk transfer one level up."
  ),
  link(
    "l-reinsurance-proportional",
    "reinsurance",
    "proportional-reinsurance",
    "sub-notion",
    "Proportional reinsurance is one of the two fundamental families of reinsurance structure, defined by sharing premiums and losses in a fixed ratio."
  ),
  link(
    "l-proportional-quota-share",
    "proportional-reinsurance",
    "quota-share",
    "sub-notion",
    "Quota share is the simplest proportional structure: one flat percentage applied uniformly across the whole portfolio. Example: a 30% quota share means the reinsurer takes 30% of every premium and every claim, on every policy."
  ),
  link(
    "l-proportional-surplus",
    "proportional-reinsurance",
    "surplus-treaty",
    "sub-notion",
    "Surplus treaties are proportional reinsurance too, but the percentage ceded varies risk by risk instead of being a flat rate. Example: a $2M retention line means a $5M risk cedes 60% while a $1.5M risk cedes 0%."
  ),
  link(
    "l-reinsurance-nonproportional",
    "reinsurance",
    "non-proportional-reinsurance",
    "sub-notion",
    "Non-proportional reinsurance is the second major family: coverage triggered by a loss threshold rather than a fixed sharing ratio."
  ),
  link(
    "l-nonproportional-xol",
    "non-proportional-reinsurance",
    "excess-of-loss",
    "sub-notion",
    "Excess of loss is the per-risk/per-event form of non-proportional cover. Example: a $1M XoL retention on a $5M fire claim means the reinsurer pays $4M."
  ),
  link(
    "l-nonproportional-stoploss",
    "non-proportional-reinsurance",
    "stop-loss",
    "sub-notion",
    "Stop loss is the aggregate form of non-proportional cover, triggered by the portfolio's overall loss ratio rather than any single claim. Example: a 105% stop-loss attachment pays out only if total claims exceed 105% of premium for the year."
  ),
  link(
    "l-root-solvency-ii",
    "root",
    "solvency-ii",
    "prerequisite",
    "Solvency II is the regulatory layer that formalizes how much capital the whole risk-pricing-and-reserving apparatus must be backed by."
  ),
  link(
    "l-solvency-scr",
    "solvency-ii",
    "scr",
    "sub-notion",
    "The SCR is Solvency II's central capital number: the amount calibrated to withstand a 1-in-200-year adverse year."
  ),
  link(
    "l-solvency-mcr",
    "solvency-ii",
    "mcr",
    "sub-notion",
    "The MCR is Solvency II's lower, harder floor beneath the SCR, below which regulators intervene most severely."
  ),

  // --- Additional cross-links so the graph is a true graph, not just a tree ---
  link(
    "l-moral-hazard-adverse-selection",
    "moral-hazard",
    "adverse-selection",
    "related",
    "Both are information-asymmetry problems but strike at different times: moral hazard changes behavior *after* coverage starts, adverse selection skews *who buys* coverage before it starts. Example: a driver who drives more recklessly once insured is moral hazard; only high-risk drivers bothering to buy coverage in the first place is adverse selection."
  ),
  link(
    "l-pure-premium-claim",
    "pure-premium",
    "claim",
    "related",
    "Pure premium is calibrated directly from expected claim frequency and severity. Example: an average claim of $2,000 at a 10% claim frequency prices the pure premium at $200."
  ),
  link(
    "l-loaded-premium-technical-provisions",
    "loaded-premium",
    "technical-provisions",
    "related",
    "The expense and margin loadings collected in the premium are partly what funds the reserves held as technical provisions, beyond just the pure-premium claims cost."
  ),
  link(
    "l-quota-share-pure-premium",
    "quota-share",
    "pure-premium",
    "related",
    "A quota share treaty cedes a fixed percentage of both pure premium and the claims it funds, so the insurer's retained pure-premium exposure shrinks in exact proportion. Example: a 40% quota share means the insurer keeps only 60% of both the pure premium and the matching claims cost."
  ),
  link(
    "l-excess-of-loss-claims-reserve",
    "excess-of-loss",
    "claims-reserve",
    "related",
    "XoL reinsurance caps how much of any single large claim hits the insurer's own books, which directly reduces the volatility of its net claims reserve. Example: with a $1M XoL retention, a $5M fire claim only adds $1M to the insurer's own claims reserve, not $5M."
  ),
  link(
    "l-stop-loss-loaded-premium",
    "stop-loss",
    "loaded-premium",
    "related",
    "The cost of buying stop-loss protection against a bad aggregate year is itself a risk-transfer expense that gets baked into the insurer's own loaded premium pricing."
  ),
  link(
    "l-best-estimate-claims-reserve",
    "best-estimate",
    "claims-reserve",
    "related",
    "For non-life business, the Solvency II best estimate and the traditional claims reserve are largely the same liability viewed through two lenses: the claims reserve is the accounting/actuarial estimate, the best estimate is its discounted, probability-weighted Solvency II counterpart."
  ),
  link(
    "l-mortality-table-claim",
    "mortality-table",
    "claim",
    "related",
    "In life insurance, the mortality table is literally the probability model for when the insured event (death) — and therefore the claim — occurs. Example: a mortality table might show a 1% chance of a 70-year-old dying within the year, which is exactly the claim probability priced into that year's premium."
  ),
  link(
    "l-scr-reinsurance",
    "scr",
    "reinsurance",
    "related",
    "Reinsurance reduces the net underwriting risk an insurer carries, which directly lowers the underwriting risk module feeding into the SCR. Example: ceding 40% of a portfolio via quota share can meaningfully cut the non-life underwriting SCR charge."
  ),
  link(
    "l-mcr-scr",
    "mcr",
    "scr",
    "related",
    "The MCR isn't computed independently — it's a linear formula result that is then floored at 25% and capped at 45% of the SCR. Example: if the SCR is €100M, the MCR must fall between €25M and €45M regardless of the linear formula's raw output."
  ),
  link(
    "l-adverse-selection-mortality-table",
    "adverse-selection",
    "mortality-table",
    "related",
    "Insurers build margins into mortality assumptions specifically to defend against adverse selection, especially for products sold without full medical underwriting. Example: a guaranteed-issue life policy prices mortality more conservatively than a fully underwritten one, anticipating that sicker applicants are more likely to buy it."
  ),
  link(
    "l-technical-provisions-reinsurance",
    "technical-provisions",
    "reinsurance",
    "related",
    "Reinsurance recoverables are deducted from gross technical provisions to arrive at the insurer's net liability. Example: €50M of gross reserves with €20M of reinsurance recoverables leaves a €30M net technical provision."
  ),
  link(
    "l-nonproportional-scr",
    "non-proportional-reinsurance",
    "scr",
    "related",
    "Non-proportional reinsurance (XoL and stop-loss) specifically targets tail risk — the same extreme scenarios the SCR's 99.5% VaR calibration is designed around — so it is a particularly capital-efficient way to reduce the SCR. Example: a single large catastrophe claim that would otherwise drive a spike in required capital is instead absorbed by the XoL reinsurer."
  ),
  link(
    "l-present-value-future-benefits-mortality-table",
    "present-value-future-benefits",
    "mortality-table",
    "related",
    "Computing the present value of future benefits for a life policy requires weighting each future benefit payment by its probability of being paid, which comes straight from the mortality table. Example: a death benefit paid at age 80 is weighted by the mortality-table probability of surviving to age 80 and then dying that year."
  ),
  link(
    "l-surplus-treaty-claims-reserve",
    "surplus-treaty",
    "claims-reserve",
    "related",
    "Because surplus treaties cede a higher share of the largest individual risks, they disproportionately reduce the volatility of the insurer's net claims reserve coming from large, low-frequency losses."
  ),
];
