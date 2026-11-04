# Automatic IT study-session History logging — 2026-11-04

Status: user-approved requirements; implementation and live write verification PENDING. Claude and ChatGPT may collaborate; do not claim deployed until verified.

## Desired behavior
- When an IT certification quiz/review session ends or the user switches activities, automatically capture it without a repeated request.
- Group sporadic sessions within the same local daypart into ONE History entry: Morning 08:00–14:00, Afternoon 14:00–19:00, Evening 19:00–22:00 (America/Los_Angeles). Different dayparts remain separate. Preserve individual segment timestamps and avoid counting idle dog-walk interruptions as study time.
- Concise collapsed entry: IT certification review, actual study duration (or unknown), question count, correct/partial/missed, focus/topics. Expand to see question, user answer, reference answer, confidence, weak areas, and next-review guidance. Never fabricate counts or durations; distinguish unanswered questions from answered ones.
- Spaced repetition: confidence, correctness, and recency tracked separately. Mastered = long interval; recently repeated = temporarily deferred, not necessarily mastered. Do not overquiz same topic on one day. Weak/new topics reviewed later, not immediate rote repeats.
- Avoid duplicate writes: stable session/daypart key and idempotent upsert; merge new segments into the same daypart entry. Respect existing History/Done Log data and use established safe-save/undo paths.
- ChatGPT needs an authenticated ingestion mechanism (API/webhook or supported connector), not merely GitHub repository access. Inspect existing Gantt Apps Script backend and security; do not expose an unauthenticated public write endpoint. Ensure any credentials stay out of GitHub and conversation logs. Implement a verifiable end-to-end route; account for ChatGPT tool access limits and Apps Script deployment.
- On success read back the entry from the live sheet/web app and confirm one correct entry, no duplicates. On failure say explicitly not logged and retain retryable record.

## Today's review example (not yet logged)
2026-11-04 morning; approx. 11:17 start. Topics include APIPA, DNS, CPU cooling, ipconfig, CMOS, printer driver, RAM seating, VLAN, router/switch, subnet mask, default gateway, TCP/UDP, Wi-Fi channels, ARP, private/public IP, DNS cache, NAT. Exact totals require transcript audit; do not substitute illustrative counts.

## UX preference
No unnecessary verbal backchannels ('mm-hmm', 'yeah', 'checking') during quiz. Short answer, brief evaluation, next question. Keep summaries compact, detailed records expandable. Generalize summary→expand→details pattern where appropriate.

## Handoff
Coordinate implementation with Claude using this file. User wants phone-only actions where possible; provide explicit deployment steps only when necessary. Verify deployment and write rather than equating committed code with functioning automation.
