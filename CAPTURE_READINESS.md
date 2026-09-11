# Cumulative capture readiness

Checkpoint: 2026-09-10, Phase 4. All recoverable raw hotkey-to-focused-input measurements are retained, including superseded development experiments and abandoned gutter trials. One row per raw log event; JSON re-exports are not counted again. Rows are grouped by source filename, with sequence order within each file; this is not a claimed global chronological ordering.

Total: 49 samples. Observed maximum: 258.1492ms. Above 100ms: 6.

FAIL — The full historical set does not meet an all-samples-under-100ms threshold. NOT VERIFIED — Cause or permanent elimination of the inward-restart2 128.9790ms outlier. Earlier development measurements also remain failures; their presence must not be hidden by reporting only accepted checkpoints.

Phase 4 conditions: native Windows debug binary with Vite, isolated test database, Windows scale 1.25, WebView devicePixelRatio 1.4875000715255737, Notepad foreground before each shortcut. Sequence 1 was the first invocation of the process; sequence 2 followed five-depth navigation, lateral previews, editor engagement and compressed-context checks. CPU load and memory pressure were not measured. No Phase 4 hotkey/focus implementation changes were made.

The phase2-prepared/final/confirmed logs are the accepted 13-sample Phase 2 set; phase2-native/profile/async are earlier development failures. gutter-trial logs belong to the abandoned gutter experiments. inward logs include the retained 128.9790ms failure. phase3 logs contain all 14 Phase 3 samples.

Raw sources are under the local ignored `.reforge-evidence/` directory. Values below preserve the JSON numeric values, including floating-point representation; no per-phase reset or discarded slow sample.

| Source log | Line | Sequence | Milliseconds | Result |
|---|---:|---:|---:|---|
| gutter-trial/hit-test.stderr.log | 4 | 1 | 79.6124 | PASS |
| gutter-trial/native.stderr.log | 4 | 1 | 61.305 | PASS |
| inward-native.stderr.log | 4 | 1 | 69.98559999999999 | PASS |
| inward-native.stderr.log | 11 | 2 | 53.327 | PASS |
| inward-native.stderr.log | 16 | 3 | 43.0723 | PASS |
| inward-native.stderr.log | 21 | 4 | 47.277899999999995 | PASS |
| inward-native.stderr.log | 26 | 5 | 53.4325 | PASS |
| inward-native.stderr.log | 31 | 6 | 48.5184 | PASS |
| inward-native.stderr.log | 36 | 7 | 48.8164 | PASS |
| inward-native.stderr.log | 41 | 8 | 48.627900000000004 | PASS |
| inward-native.stderr.log | 46 | 9 | 55.061699999999995 | PASS |
| inward-native.stderr.log | 51 | 10 | 48.266799999999996 | PASS |
| inward-native.stderr.log | 56 | 11 | 42.5592 | PASS |
| inward-restart1.stderr.log | 4 | 1 | 76.3151 | PASS |
| inward-restart2.stderr.log | 4 | 1 | 128.979 | FAIL |
| phase2-async.stderr.log | 3 | 1 | 258.1492 | FAIL |
| phase2-confirmed.stderr.log | 4 | 1 | 73.9237 | PASS |
| phase2-confirmed.stderr.log | 10 | 2 | 43.4452 | PASS |
| phase2-final.stderr.log | 4 | 1 | 59.8656 | PASS |
| phase2-native.stderr.log | 1 | 1 | 192.53500000000003 | FAIL |
| phase2-native.stderr.log | 2 | 2 | 160.45309999999998 | FAIL |
| phase2-prepared.stderr.log | 4 | 1 | 83.0763 | PASS |
| phase2-prepared.stderr.log | 9 | 2 | 50.709900000000005 | PASS |
| phase2-prepared.stderr.log | 14 | 3 | 43.21 | PASS |
| phase2-prepared.stderr.log | 19 | 4 | 43.092600000000004 | PASS |
| phase2-prepared.stderr.log | 24 | 5 | 51.5797 | PASS |
| phase2-prepared.stderr.log | 29 | 6 | 52.7131 | PASS |
| phase2-prepared.stderr.log | 34 | 7 | 43.6126 | PASS |
| phase2-prepared.stderr.log | 39 | 8 | 50.239 | PASS |
| phase2-prepared.stderr.log | 44 | 9 | 52.240700000000004 | PASS |
| phase2-prepared.stderr.log | 49 | 10 | 41.6293 | PASS |
| phase2-profile.stderr.log | 3 | 1 | 215.04919999999998 | FAIL |
| phase2-profile.stderr.log | 7 | 2 | 120.4527 | FAIL |
| phase3-native.stderr.log | 6 | 1 | 46.678 | PASS |
| phase3-restart.stderr.log | 4 | 1 | 53.1248 | PASS |
| phase3-restart.stderr.log | 10 | 2 | 79.5053 | PASS |
| phase3-restart.stderr.log | 15 | 3 | 53.146 | PASS |
| phase3-restart.stderr.log | 20 | 4 | 39.942 | PASS |
| phase3-restart.stderr.log | 25 | 5 | 43.9815 | PASS |
| phase3-restart.stderr.log | 30 | 6 | 52.0795 | PASS |
| phase3-restart.stderr.log | 35 | 7 | 50.8551 | PASS |
| phase3-restart.stderr.log | 40 | 8 | 50.9503 | PASS |
| phase3-restart.stderr.log | 45 | 9 | 50.1512 | PASS |
| phase3-restart2.stderr.log | 4 | 1 | 84.865 | PASS |
| phase3-restart2.stderr.log | 9 | 2 | 49.088 | PASS |
| phase3-restart2.stderr.log | 14 | 3 | 49.384299999999996 | PASS |
| phase3-restart2.stderr.log | 19 | 4 | 47.9377 | PASS |
| phase4-native.stderr.log | 4 | 1 | 61.3282 | PASS |
| phase4-native.stderr.log | 11 | 2 | 44.9857 | PASS |
