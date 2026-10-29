# Session checkpoints
Author: Ethan

Select a session, open **Checkpoints**, enter an optional name and choose **Save checkpoint**. Use **Compare from** to select a saved point. The app remembers the selection separately for each session. Save up to 20 checkpoints per session and 1,000 in the cache. Delete a checkpoint to free a slot.

The comparison subtracts the saved cumulative input, output and cached-input counters from the latest retained counters. Cached input remains part of input; it is not added again. Compactions are the increase in observed compaction timestamps. Duplicate/replayed records do not increment the result. Checkpoints never aggregate another session or subagent into the selected session.

These are observation differences, not exact usage between wall-clock times. A late record may predate the checkpoint. The baseline sample time is shown separately from the save time. A zero means the retained observations have not changed. Missing samples, invalid counter differences and uncertain cumulative history produce **Unavailable**. Scan failures, paused ingestion and other coverage limits are labeled. Context occupancy remains unknown; the separate last-request estimate is not a checkpoint total. No cost or account allowance is inferred.

Checkpoints contain a local name, opaque ID, session ID, creation/sample times, baseline counters, observed compaction count and coverage/selection flags. They contain no prompt, message, replacement history, full source path or remote data. Names are user-entered plain text, bounded to 80 characters. The cache is local and unencrypted. Checkpoints persist after restart and after a source is removed. **Clear telemetry** deletes them; recovery backups retain their old contents.

Upgrading preserves existing aliases, preferences and telemetry. A rollback to 1.2.0 cannot display or manage checkpoints, but ordinary use preserves them for a later forward upgrade. Older versions do not know the checkpoint table, so their Clear telemetry control does not erase it. To remove checkpoints, use Clear telemetry in 1.3.0 or later, or remove the closed data directory as described in the operations guide.

## CLI

The CLI uses `lens-cli.sqlite`, separate from the HUD database. It never opens an Electron window. Use an explicit cache directory to retain points:

```sh
npm run cli -- scan --source /absolute/synthetic-or-session-folder --cache /absolute/cli-cache
npm run cli -- checkpoint --cache /absolute/cli-cache --session SESSION_ID --name 'Before work'
# Scan again after new records arrive, then compare:
npm run cli -- scan --source /absolute/synthetic-or-session-folder --cache /absolute/cli-cache
npm run cli -- checkpoint --cache /absolute/cli-cache --session SESSION_ID
npm run cli -- checkpoint --cache /absolute/cli-cache --session SESSION_ID --select CHECKPOINT_ID
npm run cli -- checkpoint --cache /absolute/cli-cache --session SESSION_ID --delete CHECKPOINT_ID
```

A checkpoint command uses the last scan; it does not scan automatically or call a model. Do not point the CLI at the HUD data as a way to control the app. The two caches intentionally have separate state.
