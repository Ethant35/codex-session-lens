// Author: Ethan. This worker never opens the HUD cache or writes source files.
import { parentPort, workerData } from 'node:worker_threads';
import { scanWeekly } from './weekly';
const controller = new AbortController();
parentPort?.on('message', message => { if (message === 'cancel') controller.abort(); });
void scanWeekly(workerData.roots, workerData.startDate, workerData.endDate, { timeZone: workerData.timeZone, signal: controller.signal })
  .then(report => parentPort?.postMessage({ ok: true, report }), () => parentPort?.postMessage({ ok: false }))
  .finally(() => parentPort?.close());
