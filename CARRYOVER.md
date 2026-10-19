# Unfinished dated actions

Dated jobs you add now stay in **Today's important jobs** after their date passes,
labelled **Carried over** with the original date. They stay until ticked off or
removed, even if the app was closed for several days. Ownership and the Mine/Ben/
Shared filters still apply. Editing or removing a carried job affects its original
record, and ticking it completes that same job through the existing Firebase sync.

Regular daily and weekly routines, monthly audits, shopping lists, calendar events
and built-in school-date reminders are unchanged. Only user-added dated jobs in
Morning Reset, Today's Jobs or Evening Reset carry over. No historical routines
are generated. Existing unfinished dated jobs also appear when this update loads.

There is no migration or copied task. The view derives overdue jobs from the
existing custom records and uses their original date for completion, assignment,
editing and removal. Completed jobs remain on their original date, where they can
be unticked if necessary. Overdue jobs appear only on the actual current day;
planning future dates and viewing past dates do not create repeated backlog rows.
They are included once in today's progress. Calendar data and all Firebase paths
and rules remain unchanged.

The date view advances after midnight if you were viewing today, including when
returning to a suspended tab. Deliberately viewing another date keeps that date.
The offline cache version is advanced to load the new task helper.

Validation: unit tests cover missed days, completion/undo, removed jobs, old records,
invalid dates and exclusion of repeats/future dates. The mocked mobile browser test
covers creating a dated job, carry-over, owner filtering, editing and ticking the
original record while preserving calendar attachments. No production data is used.

## Job colours

Gemma’s jobs use purple, Ben’s blue, and Shared jobs amber. Job rows and name
badges use the same palette in today’s list, carried actions, routine checklists,
monthly audit and next-seven-days priorities. Person filters repeat the colours
with a visible selection outline. Names remain visible, so identification does
not depend on colour. Reassigning a job changes its colour immediately and uses
the existing shared ownership record. No data conversion is required.
