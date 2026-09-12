(() => {
  const info = typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo() : 'n/a';
  return JSON.stringify({
    activeResources: info,
    eventNames: process.eventNames().map(String),
    uptimeSec: Math.round(process.uptime()),
    cpu: process.cpuUsage(),
  });
})()
