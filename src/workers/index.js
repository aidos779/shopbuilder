const { startEmailWorker } = require('./email.worker');

const startWorkers = () => {
  if (process.env.NODE_ENV === 'test') return;
  startEmailWorker();
};

module.exports = startWorkers;
