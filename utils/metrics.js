const metrics = {
  startedAt: Date.now(),
  requests: 0,
  responses4xx: 0,
  responses5xx: 0,
  socketConnections: 0,
  socketPeak: 0,
};

function requestMetrics(req, res, next) {
  metrics.requests += 1;
  res.on("finish", () => {
    if (res.statusCode >= 500) metrics.responses5xx += 1;
    else if (res.statusCode >= 400) metrics.responses4xx += 1;
  });
  next();
}

function socketConnected() {
  metrics.socketConnections += 1;
  metrics.socketPeak = Math.max(metrics.socketPeak, metrics.socketConnections);
}

function socketDisconnected() {
  metrics.socketConnections = Math.max(0, metrics.socketConnections - 1);
}

function snapshot() {
  return {
    ...metrics,
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    collectedAt: new Date().toISOString(),
  };
}

module.exports = { requestMetrics, socketConnected, socketDisconnected, snapshot };
