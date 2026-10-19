# Home Reserves

Add counted food and quantities in Stock, then open Meals. Adult and simple children’s meal ideas, ingredient quantities, portions, preparation steps and coverage estimates update automatically. Set adult/child numbers and daily meals once in More. Existing saved household counts are retained; a household with zero children shows a setup prompt.

Children’s suggestions default to simple foods and separate ingredients, without requiring an accepted-food list. Optional stock preferences are Suggest automatically, They will eat this, and They will not eat this. Explicit dislikes are excluded from children’s suggestions. More also offers a confirmed-food-only mode and plain/separate/mixed preparation preferences. Suggestions are ideas to try, not proof that a child will eat a food. Preferences apply to all children together.

Supported suggestions include pasta with tomato sauce, rice and beans, lentils with rice, porridge, soup, noodles, ready-to-eat meals and plain staple fallbacks for children. Unrecognised foods are listed separately; custom recipes are available in the optional section. Manual recipes are a separate alternative plan and never added to automatic totals.

Recipe cards show ingredient grams (ml for milk) alongside inventory units, quantities for the adult or child group, standalone portion capacity and shared-plan allocations. Stock is shared once across suggestions. The smaller adult or child coverage limits whole-household coverage; allocation order may affect the result. Very large inventories may hit the displayed allocation limit.

Pack weights are shown under Ingredient and pack-size assumptions. Edit Food grams per stock unit (ml for milk) to match labels. Dry and microwave rice use different portion sizes. Past-expiry stock is excluded; undated food still needs checking. Check allergies, cooking fuel, labels, preparation and individual needs. Simple staple-only fallbacks are not balanced meals. Days estimate meal coverage, not survival time or nutritional adequacy.

Data stays browser-local under the existing storage key. Export JSON backups regularly. Offline caching includes the planner after an online visit. No Organiser application files are changed.

Run `npm test` from the repository root for calculation and existing application checks.

Combination examples: a 250g microwave rice pouch plus a 250g bean sachet supports two adult portions at 125g of each ingredient per portion. Soup with tortilla crisps uses 400g soup plus 30g crisps per adult. Unspecified bean pouch/sachet size assumes 250g and tortilla crisp bags assume 180g; label weights override these assumptions. Cards display adult portions or child portions as alternatives, never as additive stock. Standalone soup and soup-with-crisps suggestions share the same soup allocation.

## Broader recipe ideas

The bundled 28-idea library matches counted, unexpired ingredients automatically, including three-ingredient combinations. It includes tuna/sweetcorn pasta, tuna/tomato pasta, pesto pasta, bean/tomato rice, pepper/bean pots, lentil/tomato soups, peanut noodles, cheese/bean wraps, soup with bread and simple breakfasts. It recognises tuna, sweetcorn, peas, roasted peppers, peanut butter, soy sauce, pesto, cheese, wraps and bread as well as the original staples. Unspecified sizes remain estimates; enter usable/drained weights from labels for better quantities. Known spicy stock is excluded from children’s suggestions.

Recipes are original simplified pantry adaptations, researched from online recipe ideas. Card links identify inspiration; methods and portions use app assumptions rather than reproducing the publishers’ recipes. Matching runs offline against this library; it is not live web search or an AI service. The app cannot access another device’s browser inventory. One-missing-ingredient ideas appear separately and do not contribute to coverage.

Sources reviewed:
- https://www.bbcgoodfood.com/recipes/storecupboard-pasta-salad
- https://www.bbcgoodfood.com/recipes/tomato-pepper-bean-one-pot
- https://www.bbcgoodfood.com/recipes/red-lentil-chickpea-chilli-soup
- https://www.bbcgoodfood.com/recipes/satay-noodle-soup
- https://www.bbcgoodfoodme.com/recipes/refried-bean-quesadillas/
- https://www.bbcgoodfoodme.com/recipes/spicy-chilli-bean-soup/
