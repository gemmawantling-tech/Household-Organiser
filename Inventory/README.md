# Home Reserves

Count food in Stock and open Meals. Suggestions match the inventory on this
browser; no inventory data is sent to a recipe website or AI service. Existing
stock, household settings, saved manual recipes and the storage key are preserved.

The library includes practical pantry adaptations: peanut–soy noodles with
roasted peppers and peas; tomato/tuna/pepper pasta; tuna/sweetcorn/pesto pasta;
pepper/pea/pesto pasta; bean-and-pepper tomato rice; chickpea-and-pepper rice;
lentil-and-pepper ragù; and bean or chickpea quesadillas with cheese and peppers.
Simple breakfasts, light meals and packaged meals are labelled accordingly.
Bare noodles, plain rice, rice with baked beans, plain pasta and soup-with-crisps
are not counted as meal suggestions. Custom recipes remain a separate option.

Every required ingredient must be counted, unexpired stock. The matcher recognises
soy sauce, roasted peppers and pesto, distinguishes chickpeas and baked beans from
plain beans, and does not treat coconut milk as dairy milk. One-missing-ingredient
ideas appear separately and do not add portions to coverage. The source links are
inspiration, not a claim to reproduce the publisher's dish: each card names its
adaptation and does not assume omitted ingredients are available.

Children's portions can be served separately from the same ingredients; explicitly
disliked foods and spicy foods are excluded. In confirmed-only mode, every ingredient
must be accepted. Plain-only mode excludes mixed recipes; staple-only fallbacks no
longer inflate coverage. These are suggestions, not confirmed preferences.

Recipe cards show ingredient grams (ml for milk), stock units, group amounts and
capacity. Dry and microwave rice differ; ready-cooked lentils use a different amount
from dry lentils. Stock is shared once across recipes. IDs include the recipe key
to avoid two variations colliding in allocations. Portions are planning assumptions,
not publisher nutrition figures. Household coverage is limited by whichever group
(adults or children) has fewer supported meals. Counts can fall when previous
staple-only suggestions are removed; this does not mean stock was deleted.

Use usable/drained weights from labels, check cooking directions and allergens,
and set the daily meal rate to match the meals you are planning. These estimates
are not a nutritional assessment. Existing exports and manual recipes still work.
The service-worker version is advanced to refresh the offline recipe library.

## Recipe research, 19 October 2026

Reviewed ingredient lists and methods, not just search-result titles:
- [Good Food: storecupboard pasta salad](https://www.bbcgoodfoodme.com/recipes/storecupboard-pasta-salad/)
- [Good Food: tomato, pepper and bean one-pot](https://www.bbcgoodfoodme.com/recipes/tomato-pepper-bean-one-pot/)
- [Good Food: red lentil, chickpea and chilli soup](https://www.bbcgoodfoodme.com/recipes/red-lentil-chickpea-and-chilli-soup/)
- [Good Food: satay noodle soup](https://www.bbcgoodfoodme.com/recipes/satay-noodle-soup/)
- [Good Food: refried bean quesadillas](https://www.bbcgoodfoodme.com/recipes/refried-bean-quesadillas/)
- [Budget Bytes: cold peanut noodle salad](https://www.budgetbytes.com/cold-peanut-noodle-salad/)

The app uses original, simpler pantry methods and estimated portions. It links
back to the source so the full recipe and fresh-ingredient versions are available.
Matching works offline and does not search the web live.

Run `npm test` from the repository root for planner and existing app checks.
