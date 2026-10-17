HOME RESERVES — EMERGENCY INVENTORY
====================================

A separate app to complement the Household Organiser.

WHAT IT CAN DO
- Store CURRENT and OPTIMUM stock levels for any item.
- Add, rename and delete categories, including your own food and non-food categories.
- Add, edit, delete and count individual item types with +/- buttons.
- Filter below-target, not-counted and expiring supplies.
- Record storage locations, expiry dates and notes.
- Build meals from actual ingredients and portions per recipe.
- Estimate family meal-days and weeks without allocating the same ingredients twice.
- Estimate bottled drinking/cooking water days using litres per bottle.
- Export a JSON backup or a spreadsheet-ready CSV inventory.
- Import a previous JSON backup.
- Work offline after installation, provided the web app has been opened while online.

IMPORTANT
The app starts with NO claimed stock levels. The optional starter list contains
item names only, with current and optimum quantities left blank. Check and
record your actual supplies and your own targets.

HOW TO PUBLISH ALONGSIDE YOUR EXISTING GITHUB PAGES APP
1. Unzip Home_Reserves_App.zip.
2. Open your existing "Household-Organiser" GitHub repository.
3. Upload the whole "inventory" folder at the ROOT of that repository. Keep
   all seven files together INSIDE the inventory folder.
4. Commit the changes. GitHub Pages should publish the new page if your
   existing repository's Pages site is already enabled.
5. The new web address will normally be:
   https://gemmawantling-tech.github.io/Household-Organiser/inventory/
6. Open that address in Chrome on Android. From the browser menu choose
   "Add to Home screen" or "Install app" (wording varies).

This does NOT change the existing Household Organiser app.
This site stores your personal stock entries in this browser's local storage.
It does not automatically synchronise between devices or users. Keep a JSON
backup in Settings if you change phones or clear browser data. Installed
shortcuts are not a substitute for backups.

THE MEAL ESTIMATE IS AN APPROXIMATION
The recipe tool uses quantities in each recipe to calculate possible batches.
It cycles through the recipes and deducts allocated ingredients, so shared
rice, beans etc. are not counted twice. Different recipe priorities may give
different outcomes. The estimate does not assess calories, balance, quality,
food expiry, cooking fuel or water used in preparing food. Set tracked meals
per day to 1 if your recipes represent dinner only.
