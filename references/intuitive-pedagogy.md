> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Generation and evaluation contract

BetterExplained's [ADEPT method](https://betterexplained.com/articles/adept-method/) combines familiar analogies, diagrams, concrete experience, plain language and technical precision. Its [intuition article](https://betterexplained.com/articles/developing-your-intuition-for-math/) motivates introducing the central idea before its formal definition. These are pedagogical influences, not lesson text to reproduce.

The application implements this inside the existing note fields. No new navigation, controls, CSS or visual layout is required.

## Generated notes

1. Inventory the actual source topics and preserve their facts and qualifications.
2. Start with a concrete problem and a usable mental model.
3. Explain the causal or logical steps, including information, decisions, dependencies and consequences.
4. Use an analogy only when useful; state its correspondence and boundary.
5. Give a self-contained example with a prediction or routing decision and explain the answer.
6. Refine the mental model into precise terminology, conditions, units and formulas.
7. Keep taught facts, declared background and invented examples distinguishable. Retain exact source details independently of explanatory prose.

An audit must solve a different learner task using the displayed explanation and select an actual reasoning paragraph by its server-owned ID. Unknown references, references belonging to another concept, dictionary questions and absent learner checks fail. Repeating the retained source inventory is not a reasoning citation. Independently check source fidelity, conditions, factual consistency, analogy limits and experiment reasoning; a traceable excerpt alone does not prove truth.

## Active recall

Every independently taught source topic needs an assessable recall opportunity. A single atomic comparison may cover two topics. Organizers and administrative labels are not learning objectives. Reuse supported existing cards; preserve their IDs, manual edits and review history. Questions include the necessary context and inputs. Answers give the decisive mechanism concisely. Analogy wording is never treated as a source fact.

Vocabulary cards remain useful but cannot alone establish reasoning coverage. At least one mechanism, comparison or application must test each topic's principal decision or distinction.

For a single primary slide, the generator explicitly answers its source-owned learning goal inside the lesson. That question/answer becomes a candidate mechanism card without another model-writing call. When no goal is supplied, the self-contained worked task can become an application candidate. Both still require independent source, bridge and card audits. A rejected card gets one bounded card-only repair. Shared multi-slide lessons retain primary-slide-specific card drafting so a shared example cannot silently replace another slide's objective.

## Validation limits

Offline tests validate contracts and recovery behavior, not LLM knowledge. Live evaluations use temporary courses so the user's map and decks remain untouched. Inspect actual note/card/source pairs and record omissions and false claims. A model-generated approval is not a human benchmark. RemNote parity requires a comparison on identical source material and learner tasks; documentation, card counts and passing software tests cannot establish it.
