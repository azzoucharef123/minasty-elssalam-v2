# Deployment check — Teacher dashboard

Date: 2026-08-17

The live page at https://dr.africacold.fr/teacher-dashboard.html was opened twice after pushing commit `2642f07`. The rendered page still shows the old structure: the level selector is not visible above the tabs, and the `Quiz` tab is absent. The visible tab list remains: الرئيسية، قائمة التلاميذ، برمجة الحصص، سجل الحصص، الواجبات، فيديوهات مكملة. The page title and data load successfully, so the issue appears to be deployment lag or a stale live artifact rather than an application crash.

The new local files contain the expected markers and local checks passed, but live verification must continue after Railway finishes deploying or cache invalidation is confirmed.

Key source: https://dr.africacold.fr/teacher-dashboard.html


Railway dashboard check: the Minasaty service for `dr.africacold.fr` is online but explicitly shows `Deploying (00:00)`. This explains why the public page still serves the old dashboard markup. No destructive action was taken; the deployment is ongoing.


A second Railway status refresh still reports `Minasaty — Online · Deploying (00:00)`. The service remains available, but the new commit has not visibly replaced the old HTML yet.


Cache-busted browser verification succeeded. The live page now shows five level buttons above the section tabs, the six content tabs including `Quiz`, and the search magnifier beside `قائمة التلاميذ`. Clicking the students tab updated the URL to `#students-panel` and displayed the roster with the search trigger and level-specific data.


Search interaction verification succeeded in the live browser: the magnifier opened the dialog, entering `كعباش` and pressing `OK` closed the dialog and changed the roster from 8 results to 1 result (`كعباش سجى`).


Level switching verification succeeded: clicking `السنة الثانية متوسط` changed the active button and the current roster heading to `السنة الثانية متوسط`; the existing search term remained applied, producing 0 matching results as expected.


Search visibility fix verification: commit `69e90d2` is deployed. The live HTML now references `app.css?v=teacher-two-strip-2` and `teacher-dashboard.js?v=search-reset-1`. The browser view of `#students-panel` no longer contains the visible `student-search` input; only the magnifier button and payment filter are visible. The roster shows 8 results for the first level with no stray search line.


Fixed-roster deployment check: commit `133d79e` was pushed successfully, but Railway currently reports the Minasaty service as `Online · Deploying (00:00)`. The public HTML still references the previous cache versions until this deployment completes. Local syntax and project tests passed before deployment.


Fixed roster final verification: commit `133d79e` is now live. The students panel displays exactly 3 students per page, no visible table scrollbar, and a fixed pagination bar showing `صفحة 1 من 3` with السابق/التالي controls. The live page references `teacher-two-strip-3` and `fixed-roster-1`.


Roster filter buttons deployment check: commit `b33cbf4` was pushed. Railway now reports both Postgres and Minasaty as Online, but the public HTML check immediately before this status refresh still returned the previous cache versions. The filter-button deployment is expected to become available after the service refresh completes.


Roster filter live verification: the new interface is deployed and visible. The live page shows buttons `كل التلاميذ`, `الحسابات المدفوعة`, `الحسابات غير المدفوعة`, a `بحث` button, and the result counter. Clicking `الحسابات المدفوعة` changed the counter from 8 to 2 and displayed only the two paid students.


Final filter tests: `الحسابات غير المدفوعة` changed the counter to 6 and displayed unpaid students only. The `بحث` button opened the modal; entering `كعباش` and pressing OK changed the counter to 1 and displayed only `كعباش سجى`.


Student actions deployment check: Railway now reports the Minasaty service Online after pushing commit `8cd6d12`. The first public check immediately after the push still showed the previous cache, so a cache-busted verification is required now that Railway is Online.


Student actions final verification: commit `8cd6d12` is live. Pagination markers are absent from live HTML. The roster shows all 8 students in the list, the name `كعباش سجى` is a button, and clicking it opens a modal titled `إجراءات التلميذ` with the student name, level, and action buttons: تعديل الاشتراك، السماح بدخول الحصة، سجل الحضور، الشهادات، حذف التلميذ. The live page also shows the enlarged phone, subscription, and payment status values.


Payment receipt actions deployment check: commit `2110f88` was pushed successfully. Railway currently shows the Minasaty service as `Online · Deploying (00:00)`, so the public page may still return the previous markup until deployment finishes.


Receipt capture/PDF deployment status: Railway now reports Minasaty Online after commit `be1969a`; the previous cache-busted page check was made while deployment was still propagating. A final public HTML check is required to confirm the new receipt choice menu and PDF accept attribute.


Student live mobile controls deployment check: commit `efd5f64` is pushed. Railway currently shows Minasaty `Online · Building (00:00)`, while the public cache-busted HTML still returns the previous `student-live.js?v=desktop-layout-1` markup and does not yet include the new portrait-only hide rule. The centered `refresh-media-btn` remains present and the landscape rule remains present locally.


Student live mobile controls deployment status: Railway now reports Minasaty Online after the build. The earlier public check was captured while the service was still building and returned the old student-live HTML. Re-fetch the cache-busted page now that the service is Online to confirm commit `efd5f64`.


Student live header deployment check: commit `51d2616` was pushed successfully. Railway currently reports Minasaty `Online · Building (00:00)`. Public verification attempts timed out or returned partial content while the build was active, so final live confirmation is pending deployment completion. Local syntax and structural checks passed; the portrait-only fixed header rules preserve the Computer and landscape media boundaries.


In-app browser gate deployment check: commit `a400585` is pushed and local checks passed. Railway currently reports Minasaty `Online · Building (00:00)`, and the public landing page still returns the previous HTML without the new modal, script, or CSS cache version. Final live verification is pending deployment completion.


In-app browser gate deployment status update: Railway now shows Minasaty Online, while the Postgres-related node still shows Building. The public landing page had still returned old HTML during the previous check; re-fetch after the database/build state settles to confirm the new modal assets.


Single-button gate deployment status: Railway now shows both Minasaty and Postgres Online. The first public fetch after commit `e6464c8` still returned the previous three-button HTML, so a fresh cache-busted fetch is required after propagation. The deployed service status is healthy.


Final single-button gate verification: commit `337724f` adds Telegram to the in-app browser detector. The live script contains `Telegram`, has no dismissal storage, and the live landing page contains exactly one `اضغط هنا للدخول فقط` button with zero legacy copy/continue buttons.


Desktop landing verification: live page after commit `bc4bc4d` shows the three-column Computer layout. Left panel contains the schedule image and four small testimonial video cards; center contains academy identity and the two entry buttons; right contains the benefits list. Browser extracted exactly four desktop video elements and both entry links. The page remained within the viewport with no visible legacy header/hero sections.


Desktop media update verification: commit `581e680` is live. The landing HTML contains one `desktop-teacher-photo`, eleven `data-desktop-testimonial-video` elements, and zero native `controls` attributes on those desktop videos. The live testimonials script contains the custom `togglePlayback`, `contextmenu` prevention, and single-play pause behavior.


Desktop controls verification: live page after commit `7445d0b` shows «الدخول إلى حسابي» first and «تسجيل حساب جديد» second, with visibly enlarged button labels and larger benefit descriptions. Clicking the schedule image opens `desktop-schedule-image-modal` with the enlarged image; the modal is designed to close when the enlarged image/backdrop is clicked.


Expanded benefits deployment check: commit `5db6ce1` is pushed. Railway reports Minasaty Online, but the first cache-busted public fetch still returned the old six-item benefits list and no doctor title, indicating propagation/cache delay. Local checks passed for the expanded list and internal scrolling CSS.

Final verification: after propagation, public page returned doctor=2, benefits-count=25, scroll-css=2, and title=1 for commit `5db6ce1`.
