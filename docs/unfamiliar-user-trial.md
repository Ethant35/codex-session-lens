# Short unfamiliar-user trial
Author: Ethan
Date: 2026-10-29
Status: PENDING. No willing participant is available; no session was run and no results are inferred.

## Purpose and format

One voluntary participant who has not used Session Lens attempts four tasks in about 12–15 minutes. This is a small qualitative trial, not a usability population estimate. It addresses the recommendation relayed from Sol: selection, interpretation, checkpoints and scan failures.

Respect the hidden/CLI-only constraint. For a facilitated UI trial, keep the released app hidden with disposable `LENS_DATA_DIR` and `LENS_SESSION_DIR` and `--background`. Show only synthetic screenshots/accessibility labels to the participant; execute their requested actions one at a time and show the resulting state. Do not open or focus test windows. Record this as a facilitated screenshot trial, not native input, focus, Finder or VoiceOver validation. A CLI-only participant trial must be labeled separately and does not establish HUD usability.

Do not recruit or contact anyone automatically. Run only when a willing participant is available. Explain the format, permit stopping at any time, and avoid real prompts, session IDs, account data or identifying participant notes. Use a participant code if a record is needed. No model calls or new installations are required.

## Facilitator setup

Use the signed 1.3.1 app and a fresh temporary cache plus synthetic source folder. Seed two sessions with the same model and nearby timestamps, IDs `trial-alpha` and `trial-beta`; give the participant the intended ID `trial-alpha`. Do not identify sessions from prompt text. Alpha starts with cumulative input 10,000, output 1,000 and cached input 6,000. Its latest request has input 2,000 and output 500 against a 10,000-token limit. Beta has different totals. Leave aliases unset. Prepare two later cumulative values for alpha: input 12,500, output 1,500, cached 7,000, then a later compaction event. Keep source checksums and mutate only these disposable fixtures. Existing test helpers document the JSONL fixture shape; do not use real source logs.

The facilitator may execute a named action but must not explain which action to choose or interpret a metric for the participant. Log any explanation or hint as assistance. End with graceful closure and removal of the trial's own temporary app state; retain only a sanitized observation sheet if the participant agrees.

## Tasks and expected observations

| Task prompt, given without the answer | Facilitator action and success observation |
| --- | --- |
| 1. “Find session trial-alpha. Give it a local name you can recognize later. How do you know this is the right session?” | Participant uses search/ID and selection, then names the session. Correct identity is the supplied ID, not just model, folder or latest activity. A facilitator clicking the participant's named control is not a hint. |
| 2. “Explain the input/output totals, cached input and 25% context figure. What can you not conclude from them?” | Participant distinguishes cumulative totals from latest-request estimate; does not add cached input again; does not equate 25% with current occupancy, remaining allowance or billing. Note exact misunderstandings before explaining. |
| 3. “Save a checkpoint named Before work. Tell me what changed after the next update, then find the checkpoint again after restart.” | Append the specified cumulative update and then the compaction. Expected observed changes: input 2,500, output 500, cached 1,000, one newly observed compaction. Context is unavailable after the later compaction. Restart the same disposable cache: selected session, alias and checkpoint persist. Changes are observed differences, not exact work since a wall-clock instant. |
| 4. “The source folder is now unavailable. What do you trust, what is wrong, and how would you recover?” | Rename only the synthetic folder and rescan, leaving Settings/Details closed. Participant notices Scan incomplete, treats retained numbers as potentially stale, and requests diagnostics. Restore the fixture folder and rescan; the missing-folder warning clears. Do not inject a cache corruption into real data. |

## Observation sheet

Leave every result blank until a trial actually occurs.

- Participant code / consent to retained notes: ______
- App version and format (facilitated screenshot or CLI): ______
- Task 1: completed without hint / assisted / not completed; action sequence and confusion: ______
- Task 2: participant's explanation and any accounting/occupancy error: ______
- Task 3: reported differences, caveats and restart result: ______
- Task 4: noticed warning / missed warning; trust judgment and recovery action: ______
- Time, hints, unexpected failures and participant comments: ______
- Any screenshot retained: synthetic only; exact file and observed state: ______

Separate observed behavior from preferences and facilitator inference. A repeatable inability to complete a supported task, hidden uncertainty, wrong accounting or data loss is a candidate blocker and requires a precise reproduction before a bounded fix. A preference is not a blocker by itself. Do not replace a failed result with a coached success. If the participant stops, record incomplete coverage. If no participant appears, leave this pending and keep the technical release closed; do not start indefinite recruitment or monitoring.
