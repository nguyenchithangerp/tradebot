// Import required modules
const dayjs = require('dayjs');
const prompt = require('prompt-sync')();

// Prompt user to input fromDate
console.log('Enter fromDate (YYYY-MM-DD HH:mm:ss, e.g., 2017-09-02 00:00:00):');
const fromDateInput = prompt();

// Prompt user to input toDate
console.log('Enter toDate (YYYY-MM-DD HH:mm:ss, e.g., 2017-09-02 23:59:00):');
const toDateInput = prompt();

// Create dayjs date objects from input
const fromDate = dayjs(fromDateInput);
const toDate = dayjs(toDateInput);

// Validate and print the dates
if (fromDate.isValid() && toDate.isValid()) {
    console.log('fromDate:', fromDate.format('YYYY-MM-DD HH:mm:ss'));
    console.log('toDate:', toDate.format('YYYY-MM-DD HH:mm:ss'));
} else {
    console.log('Invalid date format. Please use YYYY-MM-DD HH:mm:ss');
}