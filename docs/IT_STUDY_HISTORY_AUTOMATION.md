# Automatic IT study-session History logging

Status (2026-11-04, Claude): **implemented in `StudyLog.gs`, tested in Node and headless Chrome, deployed with the commit that adds this section. Live end-to-end check pending: needs the first real session row (see "Julius's steps").**

## How it works

1. **ChatGPT writes** one row per finished study segment to the `Study Sessions` tab of New Gantt Sheet (`1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`) with its Google Sheets connector, without being asked.
2. **Gantt logs it** on the next app load (`syncStudyLog_()` in `getWorkspaceData()`): one History entry per date + window, written into that day's Today cell in the right Morning / Afternoon / Evening section.
3. **Read-back:** column M `Logged` says `logged → History 2026-11-04 Morning (time)` or `NOT logged: <reason>`. The `Study Review` tab holds spaced-repetition priorities for the next quiz.

### Security

The only way in is the Google Sheets connector signed in as Julius (Google OAuth). There is no public `doPost`, no web endpoint, no token or secret in GitHub or in chat. The web app stays `access: MYSELF`. ChatGPT can only write while a conversation is running, so the trigger is the end of the study chat itself, not a background job.

## Instructions for ChatGPT (canonical; also in the Central Data Hub card)

After every IT certification quiz / review session (when it ends, or when Julius switches to something else), append ONE row to the `Study Sessions` tab, without being asked:

| Col | Field | Value |
|---|---|---|
| A | ID | `it-YYYYMMDD-HHMM` from the start time. To correct a segment, write a new row with the **same ID** (the last row wins). Never edit or delete other rows. |
| B | Date | `YYYY-MM-DD`, Pacific |
| C | Started | `HH:MM` 24 h, Pacific (sets the window: Morning before 14:00, Afternoon before 19:00, Evening after) |
| D | Ended | `HH:MM` |
| E | Minutes | Active study minutes, breaks and dog walks excluded. Blank if unknown (then Ended − Started is used). |
| F | Topics | Comma-separated |
| G | Questions (JSON) | `[{"q":"…","answer":"Julius's answer","ref":"reference answer","result":"correct|partial|incorrect|unanswered","topic":"DNS","confidence":1-5,"weak":"short note"}]`. Only questions actually asked; never invent answers, counts or durations. |
| H–K | Correct · Partial · Incorrect · Unanswered | Only when there is no question list (G empty). |
| L | Status | `final`. Use `draft` for a mid-session save; drafts are not logged. |
| M | Logged | Leave empty; Gantt fills it. |

Several sessions in one window are combined into one History entry automatically; send each segment as its own row.

Before quizzing, read the `Study Review` tab: start with `high`, then `due` topics; leave `weak` / `later` topics until their Next review date unless Julius asks; `mastered` = light check only. Don't ask the same topic more than about 3 times in one day.

## History entry

- Folded line: `IT study: 40 min · 6 answered · 4 ✓ · 1 partial · 1 ✗ · DNS, NAT, VLAN` (checked, in its time section).
- Unfold (− / + at the end of the line) for each segment (`11:17–11:40 · 20 min · …`), every question (✓ ½ ✗ –, topic, question, his answer, reference if not correct, confidence, weak note), **Weak areas** and **Next review** (as of that entry).
- New or changed segments rewrite the entry in place (no duplicates). Retried rows are no-ops. An entry Julius deletes stays deleted unless its sessions change.

## Spaced repetition (`Study Review` tab, rebuilt on change)

Per topic, results are combined per study **day** (repeating a topic on one day counts once). Day score: correct 1, partial ½, else 0. ≥ 0.9 with confidence ≥ 4 (or none): interval × 2.5; ≥ 0.9 with low confidence: × 1.5; ≥ 0.5: 2 days; below: 1 day. Next review is never the same day; ≥ 21 days = mastered. Priorities: high (overdue + missed last time), due, weak (missed, not yet due), later, mastered.

## Julius's steps (phone)

1. In the ChatGPT study chat (or its Project instructions / memory), say once: "After every IT study session, log it to the Study Sessions tab as described in the Central Data Hub card."
2. Have ChatGPT log today's morning session from the transcript (real counts only).
3. Open Gantt (/dev link), tap ↻. Today's Morning shows the IT study line; unfold it to check the questions.

---

## Original requirements (2026-11-04, ChatGPT handoff)

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
