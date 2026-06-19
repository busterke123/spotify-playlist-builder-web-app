# Task Completion

- Run the smallest relevant verification after code changes.
- Default verification for this repo:
  - `npm test`
  - `npm run build`
- For rebuild behavior or mirrored fixture changes, run:
  - `npm test`
  - `python3 -m pytest tests/test_rebuild_contract.py tests/test_rebuild_contract_fixture_sync.py -q` from `../spotify-playlist-builder`
- For storage changes, include `src/lib/storage.test.ts` and review README/docs architecture updates.
- For rebuild engine changes, include `src/lib/rebuildEngine.test.ts` and contract tests.
- For Spotify auth/API changes, include focused tests where available and a production build check.
- Before declaring done, report exactly what verification ran and any checks skipped.