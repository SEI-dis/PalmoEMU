// SPDX-License-Identifier: AGPL-3.0-or-later
// One request per Worker. Persistent save sessions use their own fencing rules.
export function runWorkerTask(createWorker, message, {
  onProgress,
  errorMessage,
  messageError = errorMessage,
  mapError = data => new Error(data.message),
} = {}) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    let settled = false;
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      complete(value);
    };
    worker.onmessage = ({data}) => {
      if (settled) return;
      if (data.type === 'progress') onProgress?.(data);
      else if (data.type === 'done') finish(resolve, data);
      else if (data.type === 'error') {
        let error;
        try { error = mapError(data); } catch (cause) { error = cause; }
        finish(reject, error);
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      finish(reject, new Error(event.message || errorMessage()));
    };
    worker.onmessageerror = () => finish(reject, new Error(messageError()));
    try { worker.postMessage(message); } catch (error) { finish(reject, error); }
  });
}
