# Release checks — 2026-11-05 UTC

## Completed
- Backend: 121 tests passed across 10 files.
- Frontend/calculator: 299 tests passed across 9 files.
- Separate pre-existing calculator repository: 15 original tests passed.
- Workspace library, frontend and backend type checks passed.
- Export installation from the immutable public calculator commit, library checks, API build and frontend build passed.
- Zod upgraded to patched v4 and validators regenerated. Final dependency audit: zero critical, high, moderate, low or informational findings.
- Initial backend regression run caught four outdated test assertions from before custom-input support: two expected the previous rejection code and two expected the old smaller body limit. Tests now assert the actual supported custom-input contract, 32 KB body limit and rejection of question payloads on the review route. No financial expected output was changed.
- Prior static/privacy scans reported no findings; refreshed results accompany the release.
- Original calculator copies were not modified; the event source contains dependency re-exports, not the original implementation.
- Usage remains 10 recorded provider attempts. Release preparation made zero provider requests and did not reset counters. Operational state is stored in PostgreSQL; historical file records were retained.

## Secret scan scope
Curated source-only export scanned for private-key headers, credential URLs, long key/password assignments and GitHub-token patterns. Three matches are deliberately fictional negative-test values. No real credentials identified, and no actual secret values read for comparison.
No old Git history, environment values, workspace memory, attachments or financial transcripts are included. A pattern scan is not an absolute guarantee.

## Runtime and deployment distinction
Older processes held ports 8080 and 26050 and prevented the managed services from starting. Those specific processes were stopped; both managed services restarted successfully.
The selected public origin is configured as https://hire-sense-platform.replit.app, based on the owner's Publishing screen. No production deployment exists yet. Publishing, initial operational-data transfer and checks on the actual public URL remain owner-controlled steps. Changing the selected domain requires changing the production origin setting.
Genuine custom review and Q&A success were previously established in development, not as part of this release test pass. Release tests use mocks/synthetic fixtures and are not new genuine Meta responses. Production live verification remains outstanding; no paid test was authorized or performed in this preparation.
