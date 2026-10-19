# Home Reserves

Automatic meal planning reads counted food stock on this device. Open Meals to see adult and child portions, ingredient quantities for the household, shared-stock allocation, and food/water coverage. Set adults, children, child portion ratio and meals per day in More. Existing saved households retain their previous people count as adults until updated.

Supported suggestions include pasta with tomato sauce, rice and beans, lentils with rice, porridge with milk, soup, noodles and ready-to-eat meals. Unknown foods need a manual recipe. Manual recipes are an alternative plan, never added to the automatic total. Suggestions do not consume or modify stock.

Pack weights are shown under Ingredient and pack-size assumptions. Edit Food grams per stock unit (ml for milk) to match your labels. Dry rice and microwave rice use different portion sizes. Expired dated stock is excluded from automatic suggestions; undated food still needs checking. Actual child portions vary with age and appetite: the adjustable fraction is a planning assumption. Check allergies, labels, preparation and cooking fuel.

Days are approximate meal coverage, not survival time or nutritional adequacy. Food days use complete household meals divided by the configured daily meal count; coverage by both food and water uses the smaller estimate. Large inventories may reach the displayed allocation limit. Stock is shared once across suggested meals, with recipe order affecting allocation.

Data remains browser-local under the existing storage key. Export a JSON backup regularly. Updated planner files are cached for offline use after an online visit.

Run `npm test` from the repository root for calculations and existing application checks.

## Fussy children

Edit each stock item to mark “All children will eat this food”. Nothing is assumed accepted by default. In More, choose separate foods / sauce on the side, plain single-food options, or familiar mixed meals. Children get suggestions only from explicitly accepted foods; adults keep their own suggestions. Plain pasta, rice, and porridge with water are available without requiring sauces or milk. Simple staple-only fallbacks are not balanced meals.

Food coverage is limited by the smaller adult or child coverage, sharing one stock pool. The planner also shows accepted-food days for children. Preferences currently apply to foods all children accept; separate individual child profiles are not supported.
