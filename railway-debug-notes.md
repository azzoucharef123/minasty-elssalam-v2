# Railway deployment investigation — 2026-08-17

The Railway project URL opens the project `mindful-courage`, environment `production`, with service `Minasaty` and Postgres. The screenshot showed a warning `Deployment failed to build` on the Minasaty service, but the Railway Logs page currently shows live application requests at 13:57, including `/js/student-live.js`, `/student-live.html`, `/assets/level-welcome/year-2.webp`, and Socket.io join/disconnect events. The visible logs also contain a pre-existing runtime error in `certificateController.js`: Prisma `studentBadge.findMany()` uses `orderBy: { createdAt: ... }`, but the Prisma model has no `createdAt` field and suggests `updatedAt`. This error is unrelated to the student chat UI change and should not be modified unless the user asks.

The Railway Agent panel text says environment variables were staged for Minasaty and changes take effect on the next deployment. Git remote currently contains commit `b045e53` for the student chat modal change.


Architecture view currently shows both `Postgres` and `Minasaty` as Online. The Minasaty card is labeled `dr.africacold.fr` and has a warning badge `1`; an `Update available` banner is visible. The service identifier shown in the page DOM is `230900cd-737d-4f41-ac21-c9893620e751`. The Railway project UI is accessible in the user's logged-in browser.


The Minasaty Deployments page confirms:
- ACTIVE deployment: `Stabilize student chat input focus on mobile`, successful, 27 minutes ago.
- FAILED deployment: `Replace student chat composer with modal actions`, commit ID `dcb19d5e`, deployed via GitHub from `azzouchy12-bit/Minasaty`, branch `main`, failed at 13:40 during `Build › Build image`.
- Build Logs contain only repeated `scheduling build on Metal builder ...` entries and no compiler/package error: builders `builder-jcefbt` at 13:40, `builder-heufuo` at 13:43, `builder-tzrivk` at 13:46, and `builder-fumiuy` at 13:51. Railway shows no actual build output before the failure.
- The failed deployment page offers `Diagnose` and `Deploy`, and the active deployment remains the previous commit.


Railway's built-in Diagnose action is currently running for the failed deployment; the page says `Looking into what caused this deployment to fail...` and has not returned a diagnosis yet. The build log remains limited to builder scheduling entries.


A later Railway view still reports `Reading commit diff: #b045e53e` and no concrete diagnosis. This reinforces that the failure occurred before the actual Railpack build output, during repeated builder scheduling, rather than from a reported JavaScript/HTML compiler error.


Railway diagnosis completed but failed to produce a cause: the UI now states `Diagnosis failed for this deployment` and offers `Retry Diagnosis`. The build log still contains only four builder-scheduling messages, with no source/build error. Local project checks passed (`npm run check` and `npm test`, 3/3 tests). `npm run build` is not a valid project command; package.json defines `start`, `postinstall`, `check`, and `test`, and previous deployments use the same configuration successfully. The evidence points to a transient Railway Metal builder/build-service failure, not the student chat code.


A safe empty commit `79ddc92` was pushed to `main` to retrigger Railway without changing application code. Railway created a new BUILDING deployment named `Retry Railway build after transient builder failure`; it progressed through snapshotting and is currently at `Building the image...`. The active production deployment remains the previous successful commit until this retry completes.


After repeated refreshes, the retry deployment `79ddc92` remains in BUILDING with Railway still displaying the generic progress sequence and no failure message. The previous active deployment remains healthy. No new build error has appeared.


The retry deployment has a new ID `07903f78` and Build Logs show only one entry: `2026-08-17 14:00:37 scheduling build on Metal builder "builder-jcefbt"`. It has not emitted Railpack, npm, Prisma, or application build output, confirming the retry is also blocked before the source is built.


The retry deployment has now passed the previous builder queue issue. Build Logs show a real Docker/Railpack build at 14:05: unpacked 46.7 MB, loaded `node:20-slim`, installed `openssl sqlite3`, copied package and Prisma files, and started `RUN npm install`. Only a non-fatal npm deprecation warning for `glob` is visible so far. The deployment remains BUILDING while npm install and later deploy steps finish.


Final verification: Railway deployment `07903f78` is Active and successful. The live HTML returns HTTP 200 and contains `.chat-compose-modal`, `#capture-question-btn` with `capture="user"`, `#open-chat-compose-btn`, and `student-live.js?v=chat-modal-1`. The live browser page visibly shows the two buttons `تصوير` and `إرسال رسالة` in the student chat panel, with no permanent text-entry bar.
