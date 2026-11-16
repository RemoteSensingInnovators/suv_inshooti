importScripts('sim-core.js');

self.onmessage = (e) => {
  const p = e.data;
  try {
    const res = self.FloodSim.simulate(p, (f) => {
      self.postMessage({ type: 'frame', t: f.t, stats: f.stats, depthCm: f.depthCm }, [f.depthCm.buffer]);
    });
    self.postMessage({ type: 'done', summary: res.summary, maxDepthCm: res.maxDepthCm }, [res.maxDepthCm.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
