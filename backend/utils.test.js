// backend/utils.test.js
const { formatDisplayDate } = require('./utils');

describe('formatDisplayDate Utility Unit Tests', () => {
  test('correctly formats a valid YYYY-MM-DD date string', () => {
    expect(formatDisplayDate('2026-05-29')).toBe('29/05/2026');
  });

  test('returns Unknown Date for missing inputs', () => {
    expect(formatDisplayDate('')).toBe('Unknown Date');
    expect(formatDisplayDate(null)).toBe('Unknown Date');
  });

  test('returns the original input string if it is not in YYYY-MM-DD format', () => {
    expect(formatDisplayDate('29/05/2026')).toBe('29/05/2026');
    expect(formatDisplayDate('Invalid-Date')).toBe('Invalid-Date');
  });
});
