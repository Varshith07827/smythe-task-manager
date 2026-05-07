const isProduction = process.env.NODE_ENV === 'production';

function formatMsg(level, tag, message, meta) {
  if (isProduction) {
    const entry = { level, tag, message, timestamp: new Date().toISOString() };
    if (meta !== undefined) entry.meta = meta;
    return JSON.stringify(entry);
  }
  const prefix = tag ? `[${tag}]` : '';
  if (meta !== undefined) return `${prefix} ${message}`.trim();
  return `${prefix} ${message}`.trim();
}

const logger = {
  info(tag, message, meta) {
    console.log(formatMsg('info', tag, message, meta));
    if (!isProduction && meta !== undefined) console.log(meta);
  },
  warn(tag, message, meta) {
    console.warn(formatMsg('warn', tag, message, meta));
    if (!isProduction && meta !== undefined) console.warn(meta);
  },
  error(tag, message, meta) {
    console.error(formatMsg('error', tag, message, meta));
    if (!isProduction && meta !== undefined) console.error(meta);
  }
};

module.exports = logger;
