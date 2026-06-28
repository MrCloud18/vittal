const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const clinicalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 300,
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  message: {
    status: 429,
    message: "Too many clinical requests, please try again later."
  }
});

module.exports = clinicalLimiter;

