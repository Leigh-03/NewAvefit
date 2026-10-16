// Small dependency-free rate limiter suitable for the capstone's single-server deployment.
// For a multi-instance production deployment, move this state to Redis or another shared store.
const buckets = new Map();

function rateLimit({ windowMs, max, message, keyPrefix, resetOnSuccess = true }) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    let entry = buckets.get(key);

    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
    }

    entry.count += 1;
    buckets.set(key, entry);

    // Login/registration attempts that finish successfully should not consume
    // the failure budget. Failed requests remain counted for the window.
    if (resetOnSuccess) {
      res.on('finish', () => {
        if (res.statusCode < 400) buckets.delete(key);
      });
    }

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - entry.startedAt)) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'admin-login',
  message: 'Too many admin login attempts. Please try again in a few minutes.',
});

const adminPasswordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 4,
  keyPrefix: 'admin-password-reset',
  message: 'Too many admin password reset requests. Please try again later.',
  resetOnSuccess: false,
});

const adminPasswordResetAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: 'admin-password-reset-attempt',
  message: 'Too many admin password reset attempts. Please wait before trying again.',
  resetOnSuccess: false,
});

const userLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: 'user-login',
  message: 'Too many login attempts. Please try again in a few minutes.',
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'signup',
  message: 'Too many registration attempts from this network. Please try again later.',
  resetOnSuccess: false,
});

// Sending verification mail is the one endpoint that costs money and can be
// pointed at somebody else's inbox, so it gets its own tight budget.
const verificationResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyPrefix: 'verification-resend',
  message: 'Too many verification emails requested from this network. Please try again later.',
  resetOnSuccess: false,
});

// Codes have a smaller search space than links, so keep the attempt budget low.
const verificationAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: 'verification-attempt',
  message: 'Too many verification attempts. Please wait before trying another code.',
  resetOnSuccess: false,
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'member-feedback',
  message: 'Too many feedback submissions. Please try again later.',
  resetOnSuccess: false,
});

module.exports = {
  adminLoginLimiter,
  adminPasswordResetRequestLimiter,
  adminPasswordResetAttemptLimiter,
  userLoginLimiter,
  signupLimiter,
  verificationResendLimiter,
  verificationAttemptLimiter,
  feedbackLimiter,
};
