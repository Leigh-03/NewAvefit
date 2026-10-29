const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const NAME_RE = /^[A-Za-zÀ-ÿ' -]+$/;
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'admin123', 'admin1234', 'avefit123', 'letmein123',
  'welcome123', 'iloveyou1', 'abc123456', 'changeme1'
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const value = normalizeEmail(email);
  return value.length <= 254 && EMAIL_RE.test(value);
}

function validatePassword(password) {
  const value = String(password || '');
  return value.length >= 8 && value.length <= 12 &&
    /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value) &&
    !COMMON_PASSWORDS.has(value.toLowerCase());
}

function validateName(value) {
  const v = String(value || '').trim();
  return v.length >= 2 && v.length <= 50 && NAME_RE.test(v);
}

function validatePhone(value) {
  if (value === undefined || value === null || value === '') return true;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function validateAge(value) {
  const age = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(age) && age >= 12 && age <= 90;
}

function validateRegistration({ first_name, last_name, email, password, phone }) {
  if (!validateName(first_name) || !validateName(last_name)) {
    return 'First and last name must be 2-50 characters and contain letters, spaces, apostrophes, or hyphens.';
  }
  if (!validateEmail(email)) return 'Please provide a valid email address.';
  if (typeof phone !== 'string' || !/^09\d{9}$/.test(phone)) {
    return 'Phone number must start with 09 and contain exactly 11 digits.';
  }
  if (!validatePassword(password)) {
    return 'Use 8–12 characters with a letter, a number, and a symbol. Avoid common passwords.';
  }
  return null;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.length >= 8 && b.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
};

function validateImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { ok: false, message: 'Image must be a data URL.' };
  if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 1.4) + 1000) {
    return { ok: false, message: 'Image is too large. Maximum size is 2MB.' };
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, message: 'Only JPEG, PNG, and WebP images are allowed.' };

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'Image is too large. Maximum size is 2MB.' };
  }

  const descriptor = IMAGE_TYPES[mime];
  if (!descriptor.magic(buffer)) {
    return { ok: false, message: 'The uploaded image contents do not match the declared image format.' };
  }
  return { ok: true, mime, size: buffer.length };
}

function validateGoogleProfileImageUrl(imageUrl) {
  if (typeof imageUrl !== 'string' || imageUrl.length > 2048) return false;

  try {
    const url = new URL(imageUrl);
    const hostname = url.hostname.toLowerCase();
    const isGoogleImageHost = [
      "googleusercontent.com",
      "google.com",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && isGoogleImageHost;
  } catch {
    return false;
  }
}

function validateProfileImage(image) {
  if (validateGoogleProfileImageUrl(image)) {
    return { ok: true, mime: "image/remote" };
  }
  return validateImageDataUrl(image);
}

function publicUser(row) {
  if (!row) return null;
  const {
    user_id, first_name, last_name, email, phone, account_status, trainer_id,
    fitness_goal, height, weight, gender, activity_level, setup_completed, profile_image,
    email_verified
  } = row;
  return { user_id, first_name, last_name, email, phone, account_status, trainer_id,
    fitness_goal, height, weight, gender, activity_level, setup_completed, profile_image,
    email_verified: Boolean(email_verified) };
}

module.exports = {
  normalizeEmail, validateEmail, validatePassword, validateName, validatePhone,
  validateAge, validateRegistration, validateImageDataUrl,
  validateGoogleProfileImageUrl, validateProfileImage, publicUser,
};
