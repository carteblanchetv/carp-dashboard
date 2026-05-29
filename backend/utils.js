// backend/utils.js
// Extract utility helper functions so they are easily testable without loading express/firebase

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Unknown Date';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

module.exports = {
  formatDisplayDate
};
