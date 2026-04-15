const mongoose = require('mongoose');

const columnValidator = {
  validate(columnValues, columns, options = {}) {
    const errors = [];
    const { skipRequired = false } = options;

    for (const column of columns) {
      const colId = column._id.toString();
      const value = columnValues?.get?.(colId) ?? columnValues?.[colId];

      if (!skipRequired && column.required && (value === undefined || value === null || value === '')) {
        errors.push(`"${column.name}" is required`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      switch (column.type) {
        case 'text':
          if (typeof value !== 'string') {
            errors.push(`"${column.name}" must be text`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`"${column.name}" must be a number`);
          }
          break;
        case 'dropdown':
          if (!column.options.includes(value)) {
            errors.push(`"${column.name}" must be one of: ${column.options.join(', ')}`);
          }
          break;
        case 'date': {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            errors.push(`"${column.name}" must be a valid date`);
          }
          break;
        }
        case 'checkbox':
          if (typeof value !== 'boolean') {
            errors.push(`"${column.name}" must be true or false`);
          }
          break;
        case 'user': {
          const ids = Array.isArray(value) ? value : [value];
          for (const id of ids) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
              errors.push(`"${column.name}" contains invalid user ID: ${id}`);
            }
          }
          break;
        }
        case 'url':
          try {
            new URL(value);
          } catch {
            errors.push(`"${column.name}" must be a valid URL`);
          }
          break;
        case 'email': {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`"${column.name}" must be a valid email`);
          }
          break;
        }
        case 'tag': {
          const tags = Array.isArray(value) ? value : [value];
          if (column.options?.length > 0) {
            const invalid = tags.filter(t => !column.options.includes(t));
            if (invalid.length > 0) {
              errors.push(`"${column.name}" has invalid tags: ${invalid.join(', ')}`);
            }
          }
          break;
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
};

module.exports = columnValidator;
