# Suggested Commands

- Install dependencies:
  - `npm install`
- Start local dev server:
  - `npm run dev`
- Run tests:
  - `npm test`
- Production build check:
  - `npm run build`
- Preview production build:
  - `npm run preview`
- Rebuild contract test only:
  - `npm run test -- src/lib/rebuildContractCases.test.ts`
- After changing mirrored rebuild fixtures, also run from `../spotify-playlist-builder`:
  - `python3 -m pytest tests/test_rebuild_contract.py tests/test_rebuild_contract_fixture_sync.py -q`
- Darwin/macOS local setup uses `.env.local` copied from `.env.example`; do not print real env values.