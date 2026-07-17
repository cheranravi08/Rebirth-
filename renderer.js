/**
 * Antigravity Cyber-Sheet Renderer
 * Implements a high-performance Google Sheets tracker with auto-estimation and LocalStorage persistence.
 */

// Program Range Configuration
const START_DATE_STR = "2026-07-16"; // Day 1
const END_DATE_STR = "2026-09-30";   // Day 77

// Food Caloric Dictionary (Verified values)
const FOOD_DICTIONARY = {
  'chapati': { calories: 80, protein: 3, isPg: false },
  'chappati': { calories: 80, protein: 3, isPg: false },
  'roti': { calories: 80, protein: 3, isPg: false },
  'rice': { calories: 1.3, protein: 0.027, isPg: true }, // 1.3 cals per g
  'chicken breast': { calories: 1.65, protein: 0.31, isPg: true }, // 1.65 cals per g
  'chicken': { calories: 1.8, protein: 0.25, isPg: true },
  'egg': { calories: 75, protein: 6, isPg: false },
  'eggs': { calories: 75, protein: 6, isPg: false },
  'egg white': { calories: 17, protein: 4, isPg: false },
  'eggwhite': { calories: 17, protein: 4, isPg: false },
  'egg whites': { calories: 17, protein: 4, isPg: false },
  'eggwhites': { calories: 17, protein: 4, isPg: false },
  'protein shake': { calories: 150, protein: 25, isPg: false },
  'whey protein': { calories: 120, protein: 24, isPg: false },
  'whey': { calories: 120, protein: 24, isPg: false },
  'bread': { calories: 80, protein: 3, isPg: false },
  'milk': { calories: 0.48, protein: 0.032, isMl: true }, // 120 cals per 250ml
  'dosa': { calories: 150, protein: 3, isPg: false },
  'idli': { calories: 60, protein: 1.5, isPg: false },
  'sambar': { calories: 100, protein: 3, isPg: false },
  'paneer': { calories: 2.65, protein: 0.18, isPg: true },
  'fish': { calories: 1.5, protein: 0.20, isPg: true },
  'salmon': { calories: 2.0, protein: 0.22, isPg: true },
  'soya chunks': { calories: 3.45, protein: 0.52, isPg: true }, // 50g -> 172.5 cals, 26g protein
  'soya': { calories: 3.45, protein: 0.52, isPg: true },
  'dal': { calories: 150, protein: 8, isPg: false },
  'curd': { calories: 100, protein: 5, isPg: false },
  'almonds': { calories: 7, protein: 0.25, isPg: false },
  'oats': { calories: 3.8, protein: 0.13, isPg: true },
  'oatmeal': { calories: 150, protein: 5, isPg: false },
  'banana': { calories: 90, protein: 1.1, isPg: false },
  'apple': { calories: 95, protein: 0.5, isPg: false },
  'orange': { calories: 60, protein: 1.2, isPg: false },
  'papaya': { calories: 120, protein: 0.9, isPg: false },
  'berries': { calories: 50, protein: 0.7, isPg: false },
  'strawberry': { calories: 45, protein: 0.8, isPg: false },
  'blueberry': { calories: 80, protein: 1.0, isPg: false },
  'watermelon': { calories: 80, protein: 1.2, isPg: false },
  'mango': { calories: 80, protein: 1.0, isPg: false },
  'fruit': { calories: 80, protein: 0.8, isPg: false },
  'broccoli': { calories: 35, protein: 2.8, isPg: false },
  'spinach': { calories: 23, protein: 2.9, isPg: false },
  'cucumber': { calories: 15, protein: 0.6, isPg: false },
  'tomato': { calories: 22, protein: 1.0, isPg: false },
  'salad': { calories: 50, protein: 1.5, isPg: false },
  'green beans': { calories: 31, protein: 1.8, isPg: false },
  'carrot': { calories: 41, protein: 0.9, isPg: false },
  'vegetables': { calories: 40, protein: 1.5, isPg: false },
  'tea': { calories: 0.4, protein: 0.013, isMl: true } // tea volume estimation
};

// State Variables
let foodLogs = {};
let targetCalorie = 1500;
let maintenanceCalorie = 2500;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadLogs();
  generateSheetRows();
  setupEventHandlers();
});

// Load Config from LocalStorage
function loadSettings() {
  const savedTarget = localStorage.getItem('antigravity_sheet_target');
  const savedMaintenance = localStorage.getItem('antigravity_sheet_maintenance');

  if (savedTarget) targetCalorie = parseInt(savedTarget);
  if (savedMaintenance) maintenanceCalorie = parseInt(savedMaintenance);

  document.getElementById('sheet-target-input').value = targetCalorie;
  document.getElementById('sheet-maintenance-input').value = maintenanceCalorie;
}

// Load logs from LocalStorage
function loadLogs() {
  const savedLogs = localStorage.getItem('antigravity_sheet_logs');
  foodLogs = savedLogs ? JSON.parse(savedLogs) : {};
}

// Generate rows July 16 to Sept 30
function generateSheetRows() {
  const tbody = document.getElementById('sheet-rows-tbody');
  tbody.innerHTML = '';

  const start = new Date(START_DATE_STR);
  const end = new Date(END_DATE_STR);
  
  // Calculate total days
  const timeDiff = end.getTime() - start.getTime();
  const totalDays = Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;

  for (let d = 0; d < totalDays; d++) {
    const current = new Date(start.getTime());
    current.setDate(start.getDate() + d);
    const dateStr = current.toISOString().split('T')[0];

    const formattedDate = formatSheetDate(current);
    const savedFood = foodLogs[dateStr] || '';
    const stats = parseCommaSeparatedFoods(savedFood);
    
    // Deficit calculation
    const deficit = maintenanceCalorie - stats.calories;
    const isDeficitPositive = deficit >= 0;

    const row = document.createElement('tr');
    row.setAttribute('data-date', dateStr);
    
    row.innerHTML = `
      <td class="date-cell">${formattedDate}</td>
      <td>
        <input type="text" class="food-cell-input" value="${savedFood}" placeholder="e.g. 9 chapati, 3 eggs, 50g soya chunks, 150ml milk, 1 apple" oninput="onFoodInputChanged(this)">
      </td>
      <td><span class="badge badge-calorie"><span class="cals-val">${stats.calories}</span> kcal</span></td>
      <td><span class="badge badge-protein"><span class="prot-val">${stats.protein}</span>g</span></td>
      <td>
        <span class="deficit-val ${isDeficitPositive ? 'success' : 'excess'}">
          ${isDeficitPositive ? deficit : 'Exceeded by ' + Math.abs(deficit)}
        </span>
      </td>
      <td class="static-cell target-display-val">${targetCalorie}</td>
      <td class="static-cell maintenance-display-val">${maintenanceCalorie}</td>
    `;

    tbody.appendChild(row);
  }
}

// Format date to: 16/Jul, 17/Jul etc
function formatSheetDate(dateObj) {
  const day = dateObj.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[dateObj.getMonth()];
  return `${day}/${month}`;
}

// Commas Separated food parser
function parseCommaSeparatedFoods(foodText) {
  if (!foodText) return { calories: 0, protein: 0 };
  
  const items = foodText.split(',');
  let totalCals = 0;
  let totalProt = 0;
  
  for (const item of items) {
    const cleanItem = item.trim().toLowerCase();
    if (!cleanItem) continue;
    
    // Parse quantity and name (handles "50g soya chunks" or "3 eggs" or "150ml milk")
    const numFirstMatch = cleanItem.match(/^([0-9.]+)\s*(grams|g|pcs|slice|scoop|cup|tbsp|bowl|nos|no|ml|l)?\s*(.+)$/i);
    const foodFirstMatch = cleanItem.match(/^(.+?)\s+([0-9.]+)\s*(grams|g|pcs|slice|scoop|cup|tbsp|bowl|nos|no|ml|l)?$/i);

    let quantity = 1;
    let foodName = cleanItem;
    let unit = '';

    if (numFirstMatch) {
      quantity = parseFloat(numFirstMatch[1]);
      unit = (numFirstMatch[2] || '').toLowerCase();
      foodName = numFirstMatch[3].trim();
    } else if (foodFirstMatch) {
      foodName = foodFirstMatch[1].trim();
      quantity = parseFloat(foodFirstMatch[2]);
      unit = (foodFirstMatch[3] || '').toLowerCase();
    }
    
    // Scan dictionary keys
    let matchedKey = null;
    if (FOOD_DICTIONARY[foodName]) {
      matchedKey = foodName;
    } else {
      for (const key of Object.keys(FOOD_DICTIONARY)) {
        if (foodName.includes(key) || key.includes(foodName)) {
          matchedKey = key;
          break;
        }
      }
    }

    if (matchedKey) {
      const item = FOOD_DICTIONARY[matchedKey];
      
      if (matchedKey === 'milk' || item.isMl) {
        let volume = quantity;
        if (unit === 'nos' || unit === 'no' || unit === 'pcs' || (quantity < 10 && !unit)) {
          volume = quantity * 250; // default glass is 250ml
        }
        totalCals += Math.round(volume * item.calories);
        totalProt += Math.round(volume * item.protein);
      } else if (item.isPg) {
        let grams = quantity;
        if (unit === 'nos' || unit === 'no' || (quantity < 10 && !unit)) {
          grams = quantity * 150; // default single serving weight
        }
        totalCals += Math.round(grams * item.calories);
        totalProt += Math.round(grams * item.protein);
      } else {
        totalCals += Math.round(quantity * item.calories);
        totalProt += Math.round(quantity * item.protein);
      }
    } else {
      // General broad categorization fallbacks
      if (cleanItem.includes('apple') || cleanItem.includes('orange') || cleanItem.includes('banana') || cleanItem.includes('fruit') || cleanItem.includes('berry') || cleanItem.includes('mango')) {
        totalCals += Math.round(quantity * 80);
        totalProt += Math.round(quantity * 1);
      } else if (cleanItem.includes('salad') || cleanItem.includes('veg') || cleanItem.includes('broccoli')) {
        totalCals += Math.round(quantity * 40);
        totalProt += Math.round(quantity * 2);
      } else if (cleanItem.includes('chicken') || cleanItem.includes('egg') || cleanItem.includes('protein')) {
        totalCals += Math.round(quantity * 180);
        totalProt += Math.round(quantity * 25);
      }
    }
  }

  return { calories: totalCals, protein: totalProt };
}

// On Input Text change inside food cell
function onFoodInputChanged(inputEl) {
  const row = inputEl.closest('tr');
  const dateStr = row.getAttribute('data-date');
  const foodText = inputEl.value;

  // 1. Calculate values
  const stats = parseCommaSeparatedFoods(foodText);
  const deficit = maintenanceCalorie - stats.calories;
  const isDeficitPositive = deficit >= 0;

  // 2. Update Row display values
  row.querySelector('.cals-val').textContent = stats.calories;
  row.querySelector('.prot-val').textContent = stats.protein;
  
  const deficitEl = row.querySelector('.deficit-val');
  if (isDeficitPositive) {
    deficitEl.textContent = deficit;
    deficitEl.className = "deficit-val success";
  } else {
    deficitEl.textContent = `Exceeded by ${Math.abs(deficit)}`;
    deficitEl.className = "deficit-val excess";
  }

  // 3. Update memory log map and persist to LocalStorage
  foodLogs[dateStr] = foodText;
  localStorage.setItem('antigravity_sheet_logs', JSON.stringify(foodLogs));
}

// Bind header changes and manual Save button triggers
function setupEventHandlers() {
  // Maintenance Calorie change
  document.getElementById('sheet-maintenance-input').addEventListener('input', (e) => {
    maintenanceCalorie = parseInt(e.target.value) || 0;
    localStorage.setItem('antigravity_sheet_maintenance', maintenanceCalorie);
    
    // Recalculate deficit across all visible rows
    const rows = document.querySelectorAll('#sheet-rows-tbody tr');
    rows.forEach(row => {
      const cals = parseInt(row.querySelector('.cals-val').textContent) || 0;
      const deficit = maintenanceCalorie - cals;
      const isDeficitPositive = deficit >= 0;

      const deficitEl = row.querySelector('.deficit-val');
      if (isDeficitPositive) {
        deficitEl.textContent = deficit;
        deficitEl.className = "deficit-val success";
      } else {
        deficitEl.textContent = `Exceeded by ${Math.abs(deficit)}`;
        deficitEl.className = "deficit-val excess";
      }
      row.querySelector('.maintenance-display-val').textContent = maintenanceCalorie;
    });
  });

  // Target Calorie change
  document.getElementById('sheet-target-input').addEventListener('input', (e) => {
    targetCalorie = parseInt(e.target.value) || 0;
    localStorage.setItem('antigravity_sheet_target', targetCalorie);
    
    // Update target columns
    const displays = document.querySelectorAll('.target-display-val');
    displays.forEach(el => el.textContent = targetCalorie);
  });

  // Manual save validation alert
  document.getElementById('btn-save-sheet').addEventListener('click', () => {
    localStorage.setItem('antigravity_sheet_logs', JSON.stringify(foodLogs));
    localStorage.setItem('antigravity_sheet_target', targetCalorie);
    localStorage.setItem('antigravity_sheet_maintenance', maintenanceCalorie);
    alert("Calibration sheets secured and saved to local storage!");
  });
}
