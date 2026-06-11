const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/# -]{0,119}$/;
const HTML_TAG_RE = /<\s*\/?\s*[a-z][^>]*>/i;

function badRequest(message, field) {
  const error = new Error(field ? `${field}: ${message}` : message);
  error.statusCode = 400;
  throw error;
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema(req.body || {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema(req.params || {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema(req.query || {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

function cleanText(value, field, options = {}) {
  const {
    required = false,
    max = 255,
    allowEmpty = !required,
    rejectHtml = true
  } = options;
  if (value == null) {
    if (required) badRequest("is required.", field);
    return "";
  }
  const clean = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!clean && !allowEmpty) badRequest("is required.", field);
  if (clean.length > max) badRequest(`must be ${max} characters or fewer.`, field);
  if (rejectHtml && HTML_TAG_RE.test(clean)) badRequest("must not contain HTML.", field);
  return clean;
}

function optionalText(value, field, max = 500) {
  return cleanText(value, field, { max, required: false, allowEmpty: true }) || "";
}

function requiredText(value, field, max = 255) {
  return cleanText(value, field, { max, required: true, allowEmpty: false });
}

function email(value, field, options = {}) {
  const clean = cleanText(value, field, { required: Boolean(options.required), max: 254, allowEmpty: !options.required });
  if (!clean) return "";
  const normalized = clean.toLowerCase();
  if (!EMAIL_RE.test(normalized)) badRequest("must be a valid email address.", field);
  return normalized;
}

function positiveNumber(value, field, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) badRequest("must be a number.", field);
  const min = options.min ?? 0;
  const max = options.max ?? 100000000;
  if (number <= min) badRequest(`must be greater than ${min}.`, field);
  if (number > max) badRequest(`must be ${max} or less.`, field);
  return number;
}

function nonNegativeNumber(value, field, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) badRequest("must be a number.", field);
  const max = options.max ?? 100000000;
  if (number < 0) badRequest("must not be negative.", field);
  if (number > max) badRequest(`must be ${max} or less.`, field);
  return number;
}

function positiveInt(value, field, options = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) badRequest("must be a positive integer.", field);
  if (options.max && number > options.max) badRequest(`must be ${options.max} or less.`, field);
  return number;
}

function optionalPositiveInt(value, field, options = {}) {
  if (value == null || value === "") return undefined;
  return positiveInt(value, field, options);
}

function date(value, field, options = {}) {
  const clean = cleanText(value, field, { required: Boolean(options.required), max: 10, allowEmpty: !options.required });
  if (!clean) return "";
  if (!DATE_RE.test(clean)) badRequest("must use YYYY-MM-DD format.", field);
  const parsed = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== clean) {
    badRequest("must be a valid date.", field);
  }
  return clean;
}

function oneOf(value, field, allowed, options = {}) {
  const clean = cleanText(value, field, { required: Boolean(options.required), max: options.max || 80, allowEmpty: !options.required });
  if (!clean) return "";
  if (!allowed.includes(clean)) badRequest(`must be one of: ${allowed.join(", ")}.`, field);
  return clean;
}

function code(value, field, options = {}) {
  const clean = cleanText(value, field, { required: Boolean(options.required), max: options.max || 120, allowEmpty: !options.required });
  if (!clean) return "";
  if (!SAFE_CODE_RE.test(clean)) badRequest("contains invalid characters.", field);
  return clean;
}

function array(value, field, options = {}) {
  if (!Array.isArray(value)) badRequest("must be an array.", field);
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  if (value.length < min) badRequest(`must include at least ${min} item(s).`, field);
  if (value.length > max) badRequest(`must include ${max} item(s) or fewer.`, field);
  return value;
}

module.exports = {
  array,
  badRequest,
  cleanText,
  code,
  date,
  email,
  nonNegativeNumber,
  oneOf,
  optionalPositiveInt,
  optionalText,
  positiveInt,
  positiveNumber,
  requiredText,
  validateBody,
  validateParams,
  validateQuery
};
