/**
 * Renderer Process Controller - Mobile Fallback & Sidebar Summary Edition
 * Fixes LocalStorage date key mapping and renders total calories in the timeline sidebar.
 */

// Global State
let currentView = 'dashboard';
let currentDayIndex = 1; // 1 to 77
let countdownInterval = null;

// Program Dates Configuration
const START_DATE = "2026-07-16"; // Day 1
const TARGET_DATE = "2026-09-30"; // Day 77

// Target Daily Limit calibration
const DIET_LIMIT_CALORIES = 1400;

// --- WEB / MOBILE BROWSER LOCALSTORAGE FALLBACK MOCK ---
if (!window.api) {
  console.log("No Electron API detected. Launching HTML5 LocalStorage fallback for mobile browser...");
  
  window.api = {
    getUser: async () => {
      const user = localStorage.getItem('antigravity_user');
      return user ? JSON.parse(user) : {
        name: "Cheran",
        height: 170,
        dob: "1995-09-12",
        activityLevel: "sedentary",
        startDate: START_DATE,
        startWeight: 80.0,
        targetWeight: 64.0,
        targetDate: TARGET_DATE
      };
    },
    saveUser: async (user) => {
      localStorage.setItem('antigravity_user', JSON.stringify(user));
      return user;
    },
    getDailyLogs: async () => {
      const logs = localStorage.getItem('antigravity_logs');
      return logs ? JSON.parse(logs) : [];
    },
    getDailyLog: async (dateStr) => {
      const logs = localStorage.getItem('antigravity_logs');
      const list = logs ? JSON.parse(logs) : [];
      let log = list.find(l => l.date === dateStr);
      if (!log) {
        const user = await window.api.getUser();
        const start = new Date(user.startDate);
        const curr = new Date(dateStr);
        const dayNumber = Math.round((curr - start) / (1000 * 60 * 60 * 24)) + 1;
        log = {
          date: dateStr,
          dayNumber: dayNumber,
          foods: [],
          workout: "Rest Day",
          workoutCalBurn: 0,
          waterIntake: 0
        };
      }
      return log;
    },
    saveDailyLog: async (dateStr, logData) => {
      const logs = localStorage.getItem('antigravity_logs');
      const list = logs ? JSON.parse(logs) : [];
      
      // CRITICAL FIX: Ensure the date property is explicitly saved on the log object
      logData.date = dateStr;
      
      const index = list.findIndex(l => l.date === dateStr);
      if (index !== -1) {
        list[index] = logData;
      } else {
        list.push(logData);
      }
      localStorage.setItem('antigravity_logs', JSON.stringify(list));
      return logData;
    },
    getWorkouts: async () => {
      const logs = await window.api.getDailyLogs();
      return logs
        .filter(l => l.workout && l.workout !== "Rest Day")
        .map((l, index) => ({
          id: `w_map_${index}`,
          date: l.date,
          type: 'gym',
          cardioType: l.workout,
          duration: 45,
          intensity: 'medium',
          caloriesBurned: l.workoutCalBurn,
          workoutDesc: l.workout
        }));
    },
    saveWorkout: async (workout) => {
      const log = await window.api.getDailyLog(workout.date);
      log.workout = workout.cardioType || workout.workoutDesc || "Gym workout";
      log.workoutCalBurn = workout.caloriesBurned || 150;
      await window.api.saveDailyLog(workout.date, log);
      return workout;
    },
    deleteWorkout: async (id) => true,
    getMeasurements: async () => {
      const meas = localStorage.getItem('antigravity_measurements');
      return meas ? JSON.parse(meas) : [
        {
          id: "m1",
          date: START_DATE,
          weight: 80.0,
          chest: 102.0,
          waist: 94.0,
          neck: 39.0,
          bicep: 36.5
        }
      ];
    },
    saveMeasurement: async (meas) => {
      const list = await window.api.getMeasurements();
      const id = meas.id || 'm_' + Date.now();
      const newMeas = {
        id,
        date: meas.date,
        weight: parseFloat(meas.weight) || 0,
        chest: parseFloat(meas.chest) || 0,
        waist: parseFloat(meas.waist) || 0,
        neck: parseFloat(meas.neck) || 0,
        bicep: parseFloat(meas.bicep) || 0
      };
      const index = list.findIndex(m => m.id === id);
      if (index !== -1) {
        list[index] = newMeas;
      } else {
        list.push(newMeas);
      }
      localStorage.setItem('antigravity_measurements', JSON.stringify(list));
      return newMeas;
    },
    deleteMeasurement: async (id) => {
      const list = await window.api.getMeasurements();
      const filtered = list.filter(m => m.id !== id);
      localStorage.setItem('antigravity_measurements', JSON.stringify(filtered));
      return true;
    },
    calculateAge: async (dob, refDate) => {
      const birthDate = new Date(dob);
      const reference = refDate ? new Date(refDate) : new Date();
      let age = reference.getFullYear() - birthDate.getFullYear();
      const m = reference.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && reference.getDate() < birthDate.getDate())) age--;
      return age;
    },
    calculateBMR: async (weight, height, age, gender) => {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    },
    calculateBaseTDEE: async (weight, height, age, activityLevel) => {
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      const multipliers = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 };
      return Math.round(bmr * (multipliers[activityLevel] || 1.2));
    },
    calculateDailyTarget: async (weight, height, age, activityLevel, workoutCalories) => {
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      const multipliers = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 };
      const multiplier = multipliers[activityLevel] || 1.2;
      const baseTdee = Math.round(bmr * multiplier);
      const totalTdee = baseTdee + (workoutCalories || 0);
      let targetIntake = DIET_LIMIT_CALORIES;
      return {
        bmr: Math.round(bmr),
        baseTdee,
        totalTdee,
        workoutCalories: workoutCalories || 0,
        deficit: totalTdee - DIET_LIMIT_CALORIES,
        targetIntake,
        isFloorActive: false
      };
    },
    calculateBMI: async (weight, height) => {
      const heightMeters = height / 100;
      return parseFloat((weight / (heightMeters * heightMeters)).toFixed(1));
    },
    getBMICategory: async (bmi) => {
      if (bmi < 18.5) return { category: 'Underweight', color: '#38bdf8' };
      if (bmi < 25.0) return { category: 'Normal', color: '#4ade80' };
      if (bmi < 30.0) return { category: 'Overweight', color: '#fb923c' };
      return { category: 'Obese', color: '#f87171' };
    },
    getWeightTrajectory: async (startDateStr, startWeight, targetDateStr, targetWeight) => {
      const start = new Date(startDateStr);
      const target = new Date(targetDateStr);
      const totalDays = Math.max(1, Math.round((target - start) / (1000 * 60 * 60 * 24)));
      const trajectory = [];
      for (let i = 0; i <= 8; i++) {
        const fraction = i / 8;
        const date = new Date(start.getTime() + fraction * totalDays * 24 * 60 * 60 * 1000);
        const weight = startWeight - fraction * (startWeight - targetWeight);
        trajectory.push({
          date: date.toISOString().split('T')[0],
          weight: parseFloat(weight.toFixed(1))
        });
      }
      return trajectory;
    },
    getCountdown: async (targetDateStr) => {
      const targetTime = new Date(`${targetDateStr}T23:59:59`).getTime();
      const now = new Date().getTime();
      const diff = targetTime - now;
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return { days, hours, minutes, seconds, isOver: false };
    },
    parseFoodInput: async (inputStr) => {
      const str = inputStr.toLowerCase().trim();
      let result = {
        input: inputStr,
        name: inputStr,
        qty: 1,
        calories: 150,
        protein: 0,
        notes: 'Energy Source'
      };
      if (!str) return result;

      const numFirstMatch = str.match(/^([0-9.]+)\s*(grams|g|pcs|slice|scoop|cup|tbsp|bowl|nos|no|ml|l)?\s*(.+)$/i);
      const foodFirstMatch = str.match(/^(.+?)\s+([0-9.]+)\s*(grams|g|pcs|slice|scoop|cup|tbsp|bowl|nos|no|ml|l)?$/i);

      let quantity = 1;
      let foodName = str;
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

      const dict = {
        'chapati': { calories: 80, protein: 3, notes: 'Carbs, Fiber' },
        'chappati': { calories: 80, protein: 3, notes: 'Carbs, Fiber' },
        'roti': { calories: 80, protein: 3, notes: 'Carbs, Fiber' },
        'rice': { calories: 1.3, protein: 0.027, notes: 'Carbs (Energy)', isPg: true },
        'chicken breast': { calories: 1.65, protein: 0.31, notes: 'High Protein (Lean)', isPg: true },
        'chicken': { calories: 1.8, protein: 0.25, notes: 'Protein Source', isPg: true },
        'egg': { calories: 75, protein: 6, notes: 'Protein, Healthy Fats' },
        'eggs': { calories: 75, protein: 6, notes: 'Protein, Healthy Fats' },
        'egg white': { calories: 17, protein: 4, notes: 'Pure Protein' },
        'eggwhite': { calories: 17, protein: 4, notes: 'Pure Protein' },
        'egg whites': { calories: 17, protein: 4, notes: 'Pure Protein' },
        'eggwhites': { calories: 17, protein: 4, notes: 'Pure Protein' },
        'protein shake': { calories: 150, protein: 25, notes: 'High Protein' },
        'whey protein': { calories: 120, protein: 24, notes: 'High Protein' },
        'whey': { calories: 120, protein: 24, notes: 'High Protein' },
        'bread': { calories: 80, protein: 3, notes: 'Carbs' },
        'milk': { calories: 120, protein: 8, notes: 'Protein, Calcium', isMl: true },
        'dosa': { calories: 150, protein: 3, notes: 'Carbs' },
        'idli': { calories: 60, protein: 1.5, notes: 'Carbs' },
        'sambar': { calories: 100, protein: 3, notes: 'Fiber, Vitamins' },
        'paneer': { calories: 2.65, protein: 0.18, notes: 'Protein, Healthy Fats', isPg: true },
        'fish': { calories: 1.5, protein: 0.20, notes: 'Protein, Omega-3', isPg: true },
        'salmon': { calories: 2.0, protein: 0.22, notes: 'Protein, Omega-3 Fats', isPg: true },
        'soya chunks': { calories: 3.45, protein: 0.52, notes: 'High Protein (Veg)', isPg: true },
        'soya': { calories: 3.45, protein: 0.52, notes: 'High Protein (Veg)', isPg: true },
        'dal': { calories: 150, protein: 8, notes: 'Protein, Fiber' },
        'curd': { calories: 100, protein: 5, notes: 'Probiotics, Calcium' },
        'almonds': { calories: 7, protein: 0.25, notes: 'Healthy Fats, Vitamin E' },
        'oats': { calories: 3.8, protein: 0.13, notes: 'Fiber, Carbs', isPg: true },
        'oatmeal': { calories: 150, protein: 5, notes: 'Fiber' },
        'banana': { calories: 90, protein: 1.1, notes: 'Potassium, Fiber' },
        'apple': { calories: 95, protein: 0.5, notes: 'Fiber, Vitamin C, Antioxidants' },
        'orange': { calories: 60, protein: 1.2, notes: 'Vitamin C, Antioxidants, Fiber' },
        'papaya': { calories: 120, protein: 0.9, notes: 'Vitamin C, Vitamin A, Fiber' },
        'berries': { calories: 50, protein: 0.7, notes: 'High Antioxidants, Vitamin C, Fiber' },
        'strawberry': { calories: 45, protein: 0.8, notes: 'Vitamin C, Antioxidants' },
        'blueberry': { calories: 80, protein: 1.0, notes: 'Antioxidants, Vitamin C' },
        'watermelon': { calories: 80, protein: 1.2, notes: 'Hydration, Lycopene Antioxidants' },
        'fruit': { calories: 80, protein: 0.8, notes: 'Vitamins, Antioxidants, Fiber' },
        'broccoli': { calories: 35, protein: 2.8, notes: 'Vitamin C, Vitamin K, High Fiber' },
        'spinach': { calories: 23, protein: 2.9, notes: 'Iron, Vitamin A, Antioxidants' },
        'cucumber': { calories: 15, protein: 0.6, notes: 'Hydration, Vitamin K' },
        'tomato': { calories: 22, protein: 1.0, notes: 'Antioxidants, Vitamin C' },
        'salad': { calories: 50, protein: 1.5, notes: 'High Fiber, Vitamins, Antioxidants' },
        'green beans': { calories: 31, protein: 1.8, notes: 'Fiber, Vitamin C' },
        'carrot': { calories: 41, protein: 0.9, notes: 'Vitamin A, Fiber' },
        'vegetables': { calories: 40, protein: 1.5, notes: 'Vitamins, Minerals, Fiber' }
      };

      let matchedKey = null;
      if (dict[foodName]) {
        matchedKey = foodName;
      } else {
        for (const key of Object.keys(dict)) {
          if (foodName.includes(key) || key.includes(foodName)) {
            matchedKey = key;
            break;
          }
        }
      }

      if (matchedKey) {
        const item = dict[matchedKey];
        result.name = matchedKey;
        result.qty = quantity;
        result.notes = item.notes;

        if (matchedKey === 'milk') {
          let volume = quantity;
          if (unit === 'nos' || unit === 'no' || unit === 'pcs' || (quantity < 10 && !unit)) {
            volume = quantity * 250;
          }
          result.calories = Math.round((volume / 250) * item.calories);
          result.protein = Math.round((volume / 250) * item.protein);
          result.qty = volume;
          result.notes = `${item.notes} (${volume}ml)`;
          return result;
        }

        if (item.isPg) {
          let grams = quantity;
          if (unit === 'nos' || unit === 'no' || (quantity < 10 && !unit)) {
            grams = quantity * 150;
          }
          result.calories = Math.round(grams * item.calories);
          result.protein = Math.round(grams * item.protein);
          result.qty = grams;
          result.notes = `${item.notes} (${grams}g)`;
          return result;
        }

        result.calories = Math.round(quantity * item.calories);
        result.protein = Math.round(quantity * item.protein);
      } else {
        if (str.includes('apple') || str.includes('orange') || str.includes('banana') || str.includes('fruit') || str.includes('berry')) {
          result.notes = 'Vitamins, Antioxidants, Fiber';
          result.calories = Math.round(quantity * 80);
          result.protein = Math.round(quantity * 1);
        } else if (str.includes('salad') || str.includes('veg') || str.includes('broccoli')) {
          result.notes = 'Fiber, Vitamins, Minerals';
          result.calories = Math.round(quantity * 40);
          result.protein = Math.round(quantity * 2);
        } else if (str.includes('chicken') || str.includes('egg') || str.includes('protein')) {
          result.notes = 'High Protein';
          result.calories = Math.round(quantity * 180);
          result.protein = Math.round(quantity * 25);
        }
      }
      return result;
    }
  };
}

// Calculate date string (YYYY-MM-DD) from day index
function getDateFromDayIndex(dayIndex) {
  const start = new Date(START_DATE);
  start.setDate(start.getDate() + (dayIndex - 1));
  return start.toISOString().split('T')[0];
}

// Calculate day index from date string
function getDayIndexFromDate(dateStr) {
  const start = new Date(START_DATE);
  const current = new Date(dateStr);
  const diffTime = current - start;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

// Check if a day is Sunday
function isSunday(dayIndex) {
  const dateStr = getDateFromDayIndex(dayIndex);
  const date = new Date(dateStr);
  return date.getDay() === 0; // 0 = Sunday
}

// Lightness Affirmations list
const AFFIRMATIONS = [
  "Gravity is just a force. Your willpower is a choice. Rise above the mass.",
  "Every heavy rep you lift makes your body lighter tomorrow. Defy resistance.",
  "Your chest and belly fat are fuel cell reserves. Burn them to ascend.",
  "Lightness is a state of mind and body. Float above the gravitational pull.",
  "Focus on the deficit. Protect the 1100 kcal margin. It is your ascent vector.",
  "The scale is a weight gauge. Your mirror is a structural transformation log.",
  "In the crucible of sweat, we melt away gravity. Stay disciplined, Cheran.",
  "A lighter body travels further, moves faster, and breathes easier. Rise up.",
  "Breathe in light, breathe out tension. Your transformation is already underway.",
  "Your trajectory is locked. Target: 64.0 kg. Keep the flight path steady."
];

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Navigation Routing Setup
  setupNavigation();

  // 2. Initialize Views
  await refreshActiveView();

  // 3. Setup Global Forms & Listeners
  setupDiaryListeners();
  setupCheckinListeners();
  setupProfileListeners();
});

// --- NAVIGATION & ROUTING ---
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetView = link.getAttribute('data-view');
      
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
      });
      document.getElementById(`view-${targetView}`).classList.add('active');

      currentView = targetView;
      await refreshActiveView();
    });
  });
}

async function refreshActiveView() {
  const user = await window.api.getUser();
  document.querySelectorAll('.user-name').forEach(el => el.textContent = user.name);

  // Clear timers if moving out of profile view
  if (currentView !== 'profile' && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Load specific view data
  switch (currentView) {
    case 'dashboard':
      await loadDashboardView(user);
      break;
    case 'diary':
      await loadDiaryView();
      break;
    case 'workout':
      await loadWorkoutHistoryView();
      break;
    case 'profile':
      await loadProfileView(user);
      break;
  }
}

// --- MODULE 1: DASHBOARD VIEW ---
async function loadDashboardView(user) {
  // Set date badge
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashboard-date').textContent = new Date().toLocaleDateString('en-US', options);

  // Calculate user age
  const todayStr = new Date().toISOString().split('T')[0];
  const age = await window.api.calculateAge(user.dob, todayStr);

  // 1. Load Biometric Mission Blueprint values (Calibrated to 1400 kcal target)
  const calculatorTdee = await window.api.calculateDailyTarget(user.startWeight, user.height, age, user.activityLevel, 0);
  document.getElementById('bp-maintenance-cals').textContent = `${calculatorTdee.baseTdee} kcal`;
  document.getElementById('bp-deficit-limit').textContent = `${DIET_LIMIT_CALORIES} kcal`;

  // 2. Calculate Completed Days and Overall Program Timeline
  const dailyLogs = await window.api.getDailyLogs();
  const loggedDays = dailyLogs.filter(log => log.foods && log.foods.length > 0);
  const completedDaysCount = loggedDays.length;
  
  const completionPercent = Math.min(100, Math.max(0, Math.round((completedDaysCount / 77) * 100)));
  document.getElementById('program-completed-percentage').textContent = `${completionPercent}% Completed`;
  document.getElementById('program-progress-bar').style.width = `${completionPercent}%`;
  document.getElementById('program-completed-days').textContent = `${completedDaysCount} of 77 Days Logged`;

  // Update User Widget status
  const currentDay = Math.max(1, Math.min(77, getDayIndexFromDate(todayStr)));
  document.getElementById('sidebar-days-count').textContent = `Day ${currentDay} of 77`;

  // 3. Grav-O-Meter calculation for TODAY
  const diaryToday = await window.api.getDailyLog(todayStr);
  const workoutBurn = diaryToday.workoutCalBurn || 0;
  
  // Calculate Target TDEE
  const calculator = await window.api.calculateDailyTarget(
    user.startWeight,
    user.height,
    age,
    user.activityLevel,
    workoutBurn
  );

  let totalConsumed = 0;
  if (diaryToday.foods) {
    totalConsumed = diaryToday.foods.reduce((sum, f) => sum + (f.calories || 0), 0);
  }

  // Deficit target achieved
  const targetDeficit = calculator.totalTdee - DIET_LIMIT_CALORIES;
  const achievedDeficit = calculator.totalTdee - totalConsumed;
  const percent = Math.min(100, Math.max(0, Math.round((achievedDeficit / targetDeficit) * 100)));

  const ring = document.getElementById('grav-meter-ring');
  const percentTxt = document.getElementById('grav-meter-percent');
  const detailsTxt = document.getElementById('grav-meter-details');
  const statusBadge = document.getElementById('dashboard-deficit-status');

  percentTxt.textContent = `${percent}%`;
  detailsTxt.textContent = `${achievedDeficit} / ${targetDeficit} kcal Deficit`;

  const offset = 471 - (percent / 100) * 471;
  ring.style.strokeDashoffset = offset;

  if (totalConsumed <= DIET_LIMIT_CALORIES) {
    statusBadge.textContent = "CALORIE DEFICIT SECURED";
    statusBadge.className = "deficit-badge achieved";
    statusBadge.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.2)";
  } else {
    const overLimit = totalConsumed - DIET_LIMIT_CALORIES;
    statusBadge.textContent = `EXCEEDED BY: ${overLimit} KCAL`;
    statusBadge.className = "deficit-badge";
    statusBadge.style.boxShadow = "none";
  }

  // 4. Affirmation cycle
  const dayIndex = new Date().getDate() % AFFIRMATIONS.length;
  document.getElementById('affirmation-text').textContent = AFFIRMATIONS[dayIndex];

  // 5. Load measurements to draw weight trajectory chart
  const measurements = await window.api.getMeasurements();
  
  // Draw trajectory
  setTimeout(() => {
    renderTrajectoryChart(user, measurements);
  }, 100);
}

async function renderTrajectoryChart(user, measurements) {
  const canvas = document.getElementById('weightTrajectoryCanvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const trajectory = await window.api.getWeightTrajectory(user.startDate, user.startWeight, user.targetDate, user.targetWeight);
  
  const actuals = measurements.map(m => ({
    dateStr: m.date,
    time: new Date(m.date).getTime(),
    weight: m.weight
  })).sort((a, b) => a.time - b.time);

  const startTime = new Date(user.startDate).getTime();
  const endTime = new Date(user.targetDate).getTime();
  const timeSpan = endTime - startTime;

  const allWeights = [...trajectory.map(p => p.weight), ...actuals.map(p => p.weight), user.startWeight, user.targetWeight];
  const maxWeight = Math.max(...allWeights) + 2;
  const minWeight = Math.min(...allWeights) - 2;
  const weightSpan = maxWeight - minWeight;

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = rect.width - paddingLeft - paddingRight;
  const chartHeight = rect.height - paddingTop - paddingBottom;

  const getX = (time) => {
    const fraction = (time - startTime) / timeSpan;
    return paddingLeft + fraction * chartWidth;
  };

  const getY = (weight) => {
    const fraction = (weight - minWeight) / weightSpan;
    return paddingTop + chartHeight - fraction * chartHeight;
  };

  // Draw Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px Outfit, sans-serif';

  const numGridLines = 5;
  for (let i = 0; i < numGridLines; i++) {
    const w = minWeight + (i / (numGridLines - 1)) * weightSpan;
    const y = getY(w);
    
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(rect.width - paddingRight, y);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillText(`${w.toFixed(1)}kg`, paddingLeft - 8, y + 3);
  }

  ctx.textAlign = 'center';
  ctx.fillText('Day 1', getX(startTime), rect.height - paddingBottom + 16);
  ctx.fillText('Day 77', getX(endTime), rect.height - paddingBottom + 16);

  // Target trajectory line
  ctx.beginPath();
  trajectory.forEach((pt, index) => {
    const ptTime = new Date(pt.date).getTime();
    const x = getX(ptTime);
    const y = getY(pt.weight);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Actual logs line
  if (actuals.length > 0) {
    ctx.beginPath();
    actuals.forEach((pt, index) => {
      const x = getX(pt.time);
      const y = getY(pt.weight);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    actuals.forEach((pt) => {
      const x = getX(pt.time);
      const y = getY(pt.weight);

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#a855f7';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${pt.weight.toFixed(1)}`, x, y - 10);
    });
  }
}

// --- MODULE 2: DAILY DIARY VIEW ---
async function loadDiaryView() {
  const user = await window.api.getUser();
  
  // 1. Render Calendar Days Sidebar
  const sidebarContainer = document.getElementById('timeline-days-list');
  sidebarContainer.innerHTML = '';
  
  const dailyLogs = await window.api.getDailyLogs();

  for (let i = 1; i <= 77; i++) {
    const dayDate = getDateFromDayIndex(i);
    const isSun = isSunday(i);

    const log = dailyLogs.find(l => l.date === dayDate);
    const isCompleted = log && log.foods && log.foods.length > 0;

    let calorieText = "";
    if (isCompleted) {
      const dayCals = log.foods.reduce((sum, f) => sum + (f.calories || 0), 0);
      calorieText = `<span class="day-card-cals text-cyan text-bold" style="font-size:11px; margin-right:4px;">${dayCals} kcal</span>`;
    }

    const card = document.createElement('div');
    card.className = `day-selection-card ${currentDayIndex === i ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
    
    const formattedDate = new Date(dayDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    card.innerHTML = `
      <div class="day-card-meta">
        <span class="day-card-num">Day ${i} ${isSun ? '(Sun)' : ''}</span>
        <span class="day-card-date">${formattedDate}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        ${calorieText}
        <div class="day-card-status-dot"></div>
      </div>
    `;

    card.onclick = () => {
      currentDayIndex = i;
      loadDiaryView();
    };

    sidebarContainer.appendChild(card);
  }

  // 2. Load Active Day Data
  const activeDate = getDateFromDayIndex(currentDayIndex);
  const activeLog = await window.api.getDailyLog(activeDate);

  document.getElementById('diary-day-title').textContent = `DAY ${currentDayIndex} LOG`;
  
  const formattedDayText = new Date(activeDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const isSunActive = isSunday(currentDayIndex);
  document.getElementById('diary-day-subtitle').textContent = `${formattedDayText} ${isSunActive ? '| Rest Day (Sunday)' : ''}`;

  if (isSunActive && (!activeLog.workout || activeLog.workout === 'Rest Day')) {
    activeLog.workout = 'Rest Day';
    activeLog.workoutCalBurn = 0;
  }

  // Load workout details
  const workoutSelect = document.getElementById('workout-routine-select');
  workoutSelect.value = activeLog.workout || "Rest Day";
  document.getElementById('workout-burn-display').textContent = `${activeLog.workoutCalBurn || 0} kcal`;

  // Load food rows (Spacious Ergonomic row layout)
  const foodsList = document.getElementById('diary-foods-list');
  foodsList.innerHTML = '';

  const loggedFoods = activeLog.foods || [];
  loggedFoods.forEach((food) => {
    addFoodRowSimplified(food);
  });

  if (loggedFoods.length === 0) {
    addFoodRowSimplified(); // Add one row by default
  }

  // Set water
  const loggedWater = activeLog.waterIntake || 0;
  document.getElementById('water-volume-txt').textContent = `${loggedWater} / 3000 ml`;
  document.getElementById('water-fill-level').style.height = `${Math.min(100, (loggedWater / 3000) * 100)}%`;

  recalculateSimplifiedDiarySummary(DIET_LIMIT_CALORIES, activeLog.workoutCalBurn || 0);
}

// Add unified food logger row in Ergonomic layout (No squeezed columns!)
function addFoodRowSimplified(foodData = null) {
  const container = document.getElementById('diary-foods-list');
  const row = document.createElement('div');
  row.className = 'food-entry-row';
  
  const foodInputVal = foodData ? foodData.input : '';
  const caloriesVal = foodData ? foodData.calories : 0;
  const proteinVal = foodData ? foodData.protein : 0;
  const notesVal = foodData ? foodData.notes : 'Focus Nutrient';

  row.innerHTML = `
    <input type="text" class="food-entry-name-input food-entry-name" value="${foodInputVal}" placeholder="e.g. 3 Nos Chapati, 250ml milk, 200g chicken breast" onblur="onFoodEntryBlurred(this)">
    
    <span class="food-row-badge badge-calories">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 23a7.5 7.5 0 0 1-7.5-7.5c0-2.3 1-4.3 2.7-5.7l1.3-1.1v3c0 .8.7 1.5 1.5 1.5h1.5v-7.5l5.5 6a7.5 7.5 0 0 1-5 11.3z"/></svg>
      <span class="cal-val">${caloriesVal}</span> kcal
    </span>
    
    <span class="food-row-badge badge-protein">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14 4.14 5.57 2 7.71 3.43 9.14 2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22 14.86 20.57 17 17 20.57 20.57 22 19.14 20.57 17.71 22 15.57z"/></svg>
      <span class="prot-val">${proteinVal}</span>g Protein
    </span>

    <span class="food-row-badge badge-notes" title="${notesVal}">
      <span class="notes-val">${notesVal}</span>
    </span>
    
    <button class="btn-delete-row" onclick="this.closest('.food-entry-row').remove(); recalculateSimplifiedDiarySummary();" style="margin-left:auto;">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    </button>
  `;

  container.appendChild(row);
}

// Natural Language Parser event trigger on blur
async function onFoodEntryBlurred(inputEl) {
  const val = inputEl.value.trim();
  if (!val) return;

  const row = inputEl.closest('.food-entry-row');
  const parsed = await window.api.parseFoodInput(val);

  // Set estimates automatically on visual badges
  row.querySelector('.cal-val').textContent = parsed.calories;
  row.querySelector('.prot-val').textContent = parsed.protein;
  row.querySelector('.notes-val').textContent = parsed.notes;
  row.querySelector('.badge-notes').setAttribute('title', parsed.notes);

  // Recalculate diary sum
  recalculateSimplifiedDiarySummary();
}

function onWorkoutRoutineChanged() {
  const select = document.getElementById('workout-routine-select');
  const val = select.value;
  
  let burn = 150;
  if (val.includes('Rest Day')) burn = 0;
  else if (val.includes('Cardio')) burn = 300;
  else if (val.includes('Leg')) burn = 250;
  else if (val.includes('Chest') || val.includes('Back')) burn = 200;
  else if (val.includes('Biceps') || val.includes('Triceps')) burn = 150;
  else if (val.includes('Shoulders')) burn = 180;

  document.getElementById('workout-burn-display').textContent = `${burn} kcal`;

  recalculateSimplifiedDiarySummary(null, burn);
}

// Recalculate summary totals (Calibrated to 1400 Limit Deficit/Exceeded labels)
async function recalculateSimplifiedDiarySummary(forcedTarget = null, forcedBurn = null) {
  const user = await window.api.getUser();
  
  let workoutBurn = forcedBurn !== null ? forcedBurn : (parseInt(document.getElementById('workout-burn-display').textContent) || 0);
  const targetCalories = DIET_LIMIT_CALORIES;

  let totalConsumed = 0;
  let totalProtein = 0;
  
  const rows = document.querySelectorAll('#diary-foods-list .food-entry-row');
  rows.forEach(row => {
    const cals = parseInt(row.querySelector('.cal-val').textContent) || 0;
    const protein = parseInt(row.querySelector('.prot-val').textContent) || 0;
    totalConsumed += cals;
    totalProtein += protein;
  });

  // Set display numbers
  document.getElementById('diary-stat-target').textContent = targetCalories;
  document.getElementById('diary-stat-consumed').textContent = totalConsumed;
  document.getElementById('diary-stat-burned').textContent = workoutBurn;
  document.getElementById('diary-total-protein').textContent = `Total Protein: ${totalProtein}g`;
  
  const remainingEl = document.getElementById('diary-stat-remaining');
  const remainingLabel = document.getElementById('diary-stat-remaining-label');

  if (totalConsumed <= targetCalories) {
    const remaining = targetCalories - totalConsumed;
    remainingEl.textContent = remaining;
    remainingLabel.textContent = "Successful Calorie Deficit";
    remainingLabel.style.color = "#10b981"; // Emerald Green
    remainingEl.className = "stat-num text-cyan";
  } else {
    const exceeded = totalConsumed - targetCalories;
    remainingEl.textContent = exceeded;
    remainingLabel.textContent = `Exceeded by (${exceeded}) kcal`;
    remainingLabel.style.color = "#ef4444"; // Rose Red
    remainingEl.className = "stat-num text-rose";
  }

  // Update progress bar
  const progressBar = document.getElementById('diary-progress-bar');
  const progressPercent = Math.min(100, Math.max(0, (totalConsumed / targetCalories) * 100));
  progressBar.style.width = `${progressPercent}%`;

  if (totalConsumed > targetCalories) {
    progressBar.style.background = 'linear-gradient(to right, var(--color-rose), #f43f5e)';
  } else {
    progressBar.style.background = 'linear-gradient(to right, var(--color-cyan), var(--color-purple))';
  }
}

function setupDiaryListeners() {
  document.getElementById('btn-save-simplified-diary').addEventListener('click', async () => {
    // 1. Force parse all inputs asynchronously before saving (fixes browser tap-save without blur issue)
    const rows = document.querySelectorAll('#diary-foods-list .food-entry-row');
    for (const row of rows) {
      const inputEl = row.querySelector('.food-entry-name');
      const val = inputEl.value.trim();
      if (val) {
        const parsed = await window.api.parseFoodInput(val);
        row.querySelector('.cal-val').textContent = parsed.calories;
        row.querySelector('.prot-val').textContent = parsed.protein;
        row.querySelector('.notes-val').textContent = parsed.notes;
        row.querySelector('.badge-notes').setAttribute('title', parsed.notes);
      }
    }

    // Force recalculate UI
    await recalculateSimplifiedDiarySummary();

    const activeDate = getDateFromDayIndex(currentDayIndex);
    const workout = document.getElementById('workout-routine-select').value;
    const workoutCalBurn = parseInt(document.getElementById('workout-burn-display').textContent) || 0;
    const waterIntake = parseInt(document.getElementById('water-volume-txt').textContent.split('/')[0].trim()) || 0;

    const foods = [];
    const updatedRows = document.querySelectorAll('#diary-foods-list .food-entry-row');
    
    updatedRows.forEach(row => {
      const input = row.querySelector('.food-entry-name').value.trim();
      const calories = parseInt(row.querySelector('.cal-val').textContent) || 0;
      const protein = parseInt(row.querySelector('.prot-val').textContent) || 0;
      const notes = row.querySelector('.notes-val').textContent.trim();

      if (input) {
        const match = input.match(/[a-zA-Z\s]+/);
        const name = match ? match[0].trim() : input;

        foods.push({
          input,
          name,
          qty: 1,
          calories,
          protein,
          notes
        });
      }
    });

    const dayLog = {
      dayNumber: currentDayIndex,
      foods,
      workout,
      workoutCalBurn,
      waterIntake
    };

    await window.api.saveDailyLog(activeDate, dayLog);
    alert(`Day ${currentDayIndex} logs secured!`);
    await refreshActiveView();
  });
}

function addWater(volume) {
  const currentVol = parseInt(document.getElementById('water-volume-txt').textContent.split('/')[0].trim()) || 0;
  const newVol = Math.min(6000, currentVol + volume);
  
  document.getElementById('water-volume-txt').textContent = `${newVol} / 3000 ml`;
  document.getElementById('water-fill-level').style.height = `${Math.min(100, (newVol / 3000) * 100)}%`;
}

function resetWater() {
  document.getElementById('water-volume-txt').textContent = `0 / 3000 ml`;
  document.getElementById('water-fill-level').style.height = `0%`;
}

// --- MODULE 3: WORKOUT HISTORY CONSISTENCY GRID ---
async function loadWorkoutHistoryView() {
  const container = document.getElementById('workout-grid-container');
  container.innerHTML = '';

  const dailyLogs = await window.api.getDailyLogs();

  for (let i = 1; i <= 77; i++) {
    const dayDate = getDateFromDayIndex(i);
    const log = dailyLogs.find(l => l.date === dayDate);
    
    const isSun = isSunday(i);
    const routineName = log ? (log.workout || "Rest Day") : (isSun ? "Rest Day" : "Leave");
    const burn = log ? (log.workoutCalBurn || 0) : 0;

    const box = document.createElement('div');
    
    let colorClass = 'color-rest';
    if (routineName.includes('Chest') || routineName.includes('Back') || routineName.includes('Leg')) {
      colorClass = 'color-chest';
    } else if (routineName.includes('Biceps') || routineName.includes('Triceps') || routineName.includes('Shoulders')) {
      colorClass = 'color-arms';
    } else if (routineName.includes('Cardio')) {
      colorClass = 'color-cardio';
    }

    box.className = `consistency-day-box ${colorClass}`;
    box.innerHTML = `
      <div class="consistency-day-num">Day ${i}</div>
      <div class="consistency-day-desc" title="${routineName}">${routineName}</div>
      <div class="consistency-day-burn">${burn > 0 ? burn + ' kcal' : ''}</div>
    `;

    box.onclick = () => {
      currentDayIndex = i;
      document.getElementById('nav-diary').click();
    };

    container.appendChild(box);
  }
}

// --- MODULE 4: MY PROFILE VIEW (SETTINGS & CHECK-INS) ---
async function loadProfileView(user) {
  // 1. Load Settings form values
  document.getElementById('prof-name').value = user.name;
  document.getElementById('prof-height').value = user.height;
  document.getElementById('prof-dob').value = user.dob;
  document.getElementById('prof-activity').value = user.activityLevel;
  document.getElementById('prof-startweight').value = user.startWeight;
  document.getElementById('prof-startdate').value = user.startDate;
  document.getElementById('prof-targetweight').value = user.targetWeight;
  document.getElementById('prof-targetdate').value = user.targetDate;

  // Set default check-in date
  document.getElementById('checkin-date').value = new Date().toISOString().split('T')[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const age = await window.api.calculateAge(user.dob, todayStr);
  
  // 2. Retrieve measurements to check weight logs
  const measurements = await window.api.getMeasurements();
  let currentWeight = user.startWeight;
  if (measurements.length > 0) {
    const sorted = [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));
    currentWeight = sorted[0].weight;
  }

  // Display calculations
  document.getElementById('profile-age').textContent = `${age} years`;
  
  const calcData = await window.api.calculateDailyTarget(currentWeight, user.height, age, user.activityLevel, 0);
  
  document.getElementById('profile-bmr').textContent = `${calcData.bmr} kcal`;
  document.getElementById('profile-tdee').textContent = `${calcData.baseTdee} kcal`;
  document.getElementById('profile-target-intake').textContent = `${DIET_LIMIT_CALORIES} kcal`;

  // BMI calculations
  const bmi = await window.api.calculateBMI(currentWeight, user.height);
  const bmiCat = await window.api.getBMICategory(bmi);
  
  document.getElementById('profile-bmi-val').textContent = bmi.toFixed(1);
  const badge = document.getElementById('profile-bmi-badge');
  badge.textContent = bmiCat.category;
  badge.style.backgroundColor = bmiCat.color;

  const minB = 15;
  const maxB = 35;
  const range = maxB - minB;
  const bmiClamped = Math.min(maxB, Math.max(minB, bmi));
  const markerPercent = ((bmiClamped - minB) / range) * 100;
  document.getElementById('profile-bmi-marker').style.left = `${markerPercent}%`;

  // Render measurements history table
  renderMeasurementsHistoryTable(measurements);

  // Initialize countdown
  initializeCountdownClock(user.targetDate);
}

function renderMeasurementsHistoryTable(measurements) {
  const tbody = document.getElementById('measurements-history-tbody');
  tbody.innerHTML = '';

  // Sort descending by date
  const sorted = [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.date}</td>
      <td class="text-bold text-cyan">${m.weight.toFixed(1)} kg</td>
      <td>${m.waist.toFixed(1)} cm</td>
      <td>${m.chest.toFixed(1)} cm</td>
      <td>${m.neck.toFixed(1)} cm</td>
      <td>${m.bicep.toFixed(1)} cm</td>
      <td>
        <button class="btn-delete-meas" onclick="deleteMeasurementLog('${m.id}')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding:20px;">No historical check-ins found. Log your current metrics above.</td></tr>';
  }
}

function setupCheckinListeners() {
  document.getElementById('form-checkin').addEventListener('submit', async (e) => {
    e.preventDefault();

    const date = document.getElementById('checkin-date').value;
    const weight = parseFloat(document.getElementById('checkin-weight').value) || 0;
    const waist = parseFloat(document.getElementById('checkin-waist').value) || 0;
    const chest = parseFloat(document.getElementById('checkin-chest').value) || 0;
    const neck = parseFloat(document.getElementById('checkin-neck').value) || 0;
    const bicep = parseFloat(document.getElementById('checkin-bicep').value) || 0;

    const checkinLog = {
      date,
      weight,
      waist,
      chest,
      neck,
      bicep
    };

    await window.api.saveMeasurement(checkinLog);
    alert('Biometric check-in recorded successfully!');
    
    // Refresh view
    const user = await window.api.getUser();
    await loadProfileView(user);
  });
}

async function deleteMeasurementLog(id) {
  if (confirm("Are you sure you want to delete this check-in record?")) {
    await window.api.deleteMeasurement(id);
    const user = await window.api.getUser();
    await loadProfileView(user);
  }
}

function initializeCountdownClock(targetDateStr) {
  if (countdownInterval) clearInterval(countdownInterval);

  const updateClock = async () => {
    const cd = await window.api.getCountdown(targetDateStr);
    
    document.getElementById('cd-days').textContent = String(cd.days).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(cd.hours).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(cd.minutes).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(cd.seconds).padStart(2, '0');

    if (cd.isOver) {
      clearInterval(countdownInterval);
      document.getElementById('countdown-clock').innerHTML = '<div class="text-cyan text-bold font-lg py-4">TARGET DEADLINE EXCEEDED! ASSENT COMPLETED!</div>';
    }
  };

  updateClock();
  countdownInterval = setInterval(updateClock, 1000);
}

function setupProfileListeners() {
  document.getElementById('form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('prof-name').value;
    const height = parseInt(document.getElementById('prof-height').value) || 170;
    const dob = document.getElementById('prof-dob').value;
    const activityLevel = document.getElementById('prof-activity').value;
    const startWeight = parseFloat(document.getElementById('prof-startweight').value) || 80;
    const startDate = document.getElementById('prof-startdate').value;
    const targetWeight = parseFloat(document.getElementById('prof-targetweight').value) || 64;
    const targetDate = document.getElementById('prof-targetdate').value;

    const userUpdate = {
      name,
      height,
      dob,
      activityLevel,
      startWeight,
      startDate,
      targetWeight,
      targetDate
    };

    await window.api.saveUser(userUpdate);
    alert('Biometric settings saved successfully!');
    await loadProfileView(userUpdate);
  });
}
