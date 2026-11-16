import { crevices } from './crevices';

self.onmessage = (event: MessageEvent) => {
  const { id, position, normal, index, unshaded } = event.data;
  const run = crevices(position, normal, index, unshaded);
  let step = run.next();
  while (!step.done) step = run.next();
  const open = step.value;
  (self as unknown as Worker).postMessage({ id, open }, open ? [open.buffer] : []);
};
