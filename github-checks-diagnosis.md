# GitHub checks diagnosis — 2026-08-17

GitHub commits page shows the following relevant states:

- `694288c` — `Expose full 400px portrait chat frame` — status `0 / 2` with failure.
- Clicking the status opens a panel saying `All checks have failed` and `2 errored checks`.
- The two checks are `mindful-courage - Minasaty - Deployment cancelled` and `mindful-courage - believable-enjoyment - Deployment cancelled`.
- `c661bc2` — `Set portrait live header height to 47px` — status `0 / 1` pending.
- `40c8969` — `Retry deploy for full portrait chat frame` — no check result shown in the commits list yet.
- Local and remote `main` both point to `40c8969` according to `git rev-parse` and `git ls-remote`.

Conclusion: the red 0/2 is not a CSS or JavaScript syntax failure. GitHub's deployment checks were cancelled for both Railway services. The latest retry has not completed a check, so Railway has not confirmed deployment of the new chat layout.
