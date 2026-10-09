// ===== Race Pit — Full Application JavaScript =====
// All features: Dashboard, Car Mgmt, Tyre Mgmt, Weather, Pit Traffic, Crew Stats,
// Strategy Simulator, What-If, Alerts, Timeline, Telemetry Simulation

// ===== GLOBAL STATE =====
const STATE = {
  simRunning: false,
  simPaused: false,
  simInterval: null,
  simSpeed: 1000,
  currentLap: 0,
  totalLaps: 50,
  weather: { condition: 'dry', trackTemp: 30, surface: 'optimal', grip: 1.0, rainPenalty: 0 },
  cars: [],
  alerts: [],
  timeline: [],
  tyreHistory: [],
  pitStopLog: [],
  charts: {}
};

const TYRE_DATA = {
  soft:         { grip: 1.15, wearRate: 2.8, color: '#ff3b3b', label: 'Soft' },
  medium:       { grip: 1.0,  wearRate: 1.8, color: '#ffc107', label: 'Medium' },
  hard:         { grip: 0.88, wearRate: 1.0, color: '#cccccc', label: 'Hard' },
  intermediate: { grip: 1.08, wearRate: 1.5, color: '#00e676', label: 'Intermediate' },
  wet:          { grip: 1.2,  wearRate: 2.0, color: '#00b4ff', label: 'Wet' }
};

const WEATHER_TYRE_MAP = {
  dry: 'medium', light_rain: 'intermediate', heavy_rain: 'wet', changing: 'intermediate'
};

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const pageId = 'page-' + item.dataset.page;
    document.getElementById(pageId).classList.add('active');
    if (item.dataset.page === 'tyres') populateTyreCarSelect();
  });
});

// ===== CAR MANAGEMENT =====
async function fetchGarage() {
  try {
    const res = await fetch('/api/cars');
    const data = await res.json();
    const tbody = document.getElementById('garageTableBody');
    const empty = document.getElementById('garageEmpty');

    if (!data.cars || data.cars.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = data.cars.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong style="font-family:var(--mono); color:var(--blue);">#${c.car_number}</strong></td>
        <td>${c.driver_name}</td>
        <td>${c.fuel_capacity} L</td>
        <td>${c.base_lap_time}s</td>
        <td>
          <button class="btn-360" onclick="openCarViewer('${c.car_number}','${c.driver_name}')">
            <i class="fas fa-cube"></i> 360° View
          </button>
        </td>
        <td><button class="btn-danger" onclick="deleteCar(${c.id})"><i class="fas fa-trash"></i> Remove</button></td>
      </tr>
    `).join('');

    // Sync to simulation state if sim not running
    if (!STATE.simRunning) {
      STATE.cars = data.cars.map((c, i) => createSimCar(c, i));
    }
  } catch(e) {
    console.error('Failed to fetch garage:', e);
  }
}

// ===== 360° GLOBE CAR VIEWER =====
const CAR_VIEWS = {
  front:   { src: '/static/img/car360/front.png',   label: 'FRONT VIEW', angle: 0 },
  rear:    { src: '/static/img/car360/rear.png',    label: 'REAR VIEW', angle: 180 },
  top:     { src: '/static/img/car360/top.png',     label: 'TOP VIEW', angle: 90 },
  cockpit: { src: '/static/img/car360/cockpit.png', label: 'COCKPIT VIEW', angle: 270 }
};

const TIPS = [
  "Use the dashboard to monitor live telemetry and AI recommendations.",
  "Changing weather? Switch tyres before lap times drop significantly.",
  "A worn tyre loses up to 3 seconds per lap—don't wait for a blowout.",
  "Lighter cars are faster. Fuel burn is calculated dynamically.",
  "Check pit lane traffic to avoid stacking delays behind teammates.",
  "Strategy B uses fewer stops but risks a severe drop in grip.",
  "Drag the car view stage horizontally to rotate manually.",
  "Clicking snap buttons switches directly to a fixed perspective."
];
let tipIndex = 0;

let currentViewerCar = null;
let currentGlobeAngle = 0;
let isDraggingGlobe = false;
let startX = 0;

function openCarViewer(carNumber, driverName) {
  currentViewerCar = carNumber;
  document.getElementById('viewerCarTitle').textContent = `Car #${carNumber}`;
  document.getElementById('viewerCarDriver').textContent = driverName;
  document.getElementById('car360Modal').style.display = 'flex';

  updateViewerStats(carNumber);

  // Calculate unique hue based on car number
  const hue = (parseInt(carNumber) * 37) % 360;
  const img = document.getElementById('globeCarImg');
  if(img) img.style.filter = `hue-rotate(${hue}deg) drop-shadow(0 15px 25px rgba(0,0,0,0.5))`;

  snapToView(0, 'FRONT VIEW', 'front');
  renderTip();
}

function snapToView(angle, label, viewId) {
  currentGlobeAngle = angle;
  updateGlobeUI(label, viewId);
}

function updateGlobeUI(label, viewId) {
  const img = document.getElementById('globeCarImg');
  const sphere = document.getElementById('carSphere');
  const lbl = document.getElementById('globeLabel');
  const angleText = document.getElementById('viewerAngle');
  
  if(sphere) sphere.style.transform = `rotateY(${currentGlobeAngle}deg)`;
  if(angleText) angleText.textContent = `${Math.round(currentGlobeAngle)}°`;
  
  // Set image source based on nearest angle if viewId is empty
  let nearestView = viewId;
  if (!nearestView) {
    let norm = (currentGlobeAngle % 360 + 360) % 360;
    if (norm > 315 || norm <= 45) nearestView = 'front';
    else if (norm > 45 && norm <= 135) nearestView = 'top';
    else if (norm > 135 && norm <= 225) nearestView = 'rear';
    else nearestView = 'cockpit';
  }

  const v = CAR_VIEWS[nearestView];
  if (v && img) {
    if(img.src.indexOf(v.src) === -1) img.src = v.src;
    if (label) lbl.textContent = label;
    else lbl.textContent = v.label;
  }

  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  let activeTab = document.querySelector(`.view-tab[id="snap${nearestView.charAt(0).toUpperCase() + nearestView.slice(1)}"]`);
  if (!activeTab) activeTab = document.getElementById('snapFront');
  if (activeTab) activeTab.classList.add('active');
}

// Drag functionality for globe
document.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('globeStage');
  if (!stage) return;
  
  stage.addEventListener('mousedown', e => {
    isDraggingGlobe = true;
    startX = e.pageX - currentGlobeAngle;
    stage.style.cursor = 'grabbing';
  });
  
  window.addEventListener('mouseup', () => {
    isDraggingGlobe = false;
    stage.style.cursor = 'grab';
  });
  
  window.addEventListener('mousemove', e => {
    if (!isDraggingGlobe) return;
    e.preventDefault();
    currentGlobeAngle = e.pageX - startX;
    updateGlobeUI();
  });
});

function prevTip() {
  tipIndex = (tipIndex - 1 + TIPS.length) % TIPS.length;
  renderTip();
}

function nextTip() {
  tipIndex = (tipIndex + 1) % TIPS.length;
  renderTip();
}

function renderTip() {
  document.getElementById('featureTipText').textContent = TIPS[tipIndex];
  document.getElementById('tipCounter').textContent = `${tipIndex + 1}/${TIPS.length}`;
}

function updateViewerStats(carNumber) {
  const car = STATE.cars.find(c => String(c.carNumber) === String(carNumber));
  if (car) {
    const tyreEl = document.getElementById('vs-tyre');
    tyreEl.textContent = car.tyreType;
    tyreEl.className = `cs-val tyre-badge ${car.tyreType}`;
    document.getElementById('vs-wear').textContent = car.tyreWear.toFixed(0) + '%';
    document.getElementById('vs-fuel').textContent = car.fuelRemaining.toFixed(0) + 'L';
    document.getElementById('vs-lap').textContent = car.currentLap;
    document.getElementById('vs-pos').textContent = 'P' + car.position;
    document.getElementById('vs-status').textContent = car.status;
  } else {
    document.getElementById('vs-tyre').textContent = 'Medium';
    document.getElementById('vs-wear').textContent = '0%';
    document.getElementById('vs-fuel').textContent = '110L';
    document.getElementById('vs-lap').textContent = '0';
    document.getElementById('vs-pos').textContent = 'P—';
    document.getElementById('vs-status').textContent = 'Parked';
  }
}

function closeCarViewer() {
  document.getElementById('car360Modal').style.display = 'none';
  currentViewerCar = null;
}

document.getElementById('car360Modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('car360Modal')) closeCarViewer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCarViewer();
});


async function addCar() {
  const num = document.getElementById('addCarNum').value.trim();
  const driver = document.getElementById('addCarDriver').value.trim();
  const fuel = parseFloat(document.getElementById('addCarFuel').value) || 110;
  const lap = parseFloat(document.getElementById('addCarLap').value) || 90;

  if (!num || !driver) return showToast('Please fill in car number and driver name', 'warning');

  const res = await fetch('/api/cars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ car_number: num, driver_name: driver, fuel_capacity: fuel, base_lap_time: lap })
  });
  const data = await res.json();
  if (res.ok) {
    document.getElementById('addCarNum').value = '';
    document.getElementById('addCarDriver').value = '';
    showToast(`Car #${num} added successfully!`, 'success');
    fetchGarage();
  } else {
    showToast(data.error || 'Failed to add car', 'error');
  }
}

async function deleteCar(id) {
  if (!confirm('Remove this car from the fleet?')) return;
  await fetch(`/api/cars/${id}`, { method: 'DELETE' });
  showToast('Car removed', 'info');
  fetchGarage();
}

document.getElementById('addCarBtn').addEventListener('click', addCar);

// ===== SIMULATION ENGINE (CLIENT-SIDE) =====
function createSimCar(dbCar, index) {
  return {
    id: dbCar.id,
    carNumber: dbCar.car_number,
    driverName: dbCar.driver_name,
    position: index + 1,
    currentLap: 0,
    tyreType: 'medium',
    tyreAge: 0,
    tyreWear: 0,
    fuelCapacity: dbCar.fuel_capacity || 110,
    fuelRemaining: dbCar.fuel_capacity || 110,
    fuelConsumption: (dbCar.fuel_capacity || 110) / 55,
    baseLapTime: dbCar.base_lap_time || 90,
    totalTime: 0,
    pitCount: 0,
    lastPitLap: null,
    status: 'racing',
    wearHistory: []
  };
}

function getDefaultCars() {
  const defaults = [
    { id: 1, car_number: '44', driver_name: 'L. Hamilton', fuel_capacity: 110, base_lap_time: 88 },
    { id: 2, car_number: '33', driver_name: 'M. Verstappen', fuel_capacity: 110, base_lap_time: 87.5 },
    { id: 3, car_number: '16', driver_name: 'C. Leclerc', fuel_capacity: 110, base_lap_time: 88.5 },
    { id: 4, car_number: '4',  driver_name: 'L. Norris', fuel_capacity: 110, base_lap_time: 89 },
    { id: 5, car_number: '55', driver_name: 'C. Sainz', fuel_capacity: 110, base_lap_time: 89.5 },
    { id: 6, car_number: '63', driver_name: 'G. Russell', fuel_capacity: 110, base_lap_time: 88.8 },
  ];
  return defaults.map((c, i) => createSimCar(c, i));
}

function simulateLap() {
  if (STATE.currentLap >= STATE.totalLaps) {
    stopSimulation();
    addTimeline('race', `Simulation complete — ${STATE.totalLaps} laps finished.`);
    return;
  }

  STATE.currentLap++;
  const w = STATE.weather;

  STATE.cars.forEach(car => {
    if (car.status !== 'racing') return;
    car.currentLap = STATE.currentLap;
    car.tyreAge++;

    // Tyre wear calculation
    const tyreInfo = TYRE_DATA[car.tyreType] || TYRE_DATA.medium;
    let wearIncrease = tyreInfo.wearRate * (1 + w.rainPenalty * 0.5);
    if (w.trackTemp > 40) wearIncrease *= 1.15;
    if (w.trackTemp < 15) wearIncrease *= 0.9;
    car.tyreWear = Math.min(100, car.tyreWear + wearIncrease);
    car.wearHistory.push({ lap: STATE.currentLap, wear: car.tyreWear });

    // Fuel consumption
    car.fuelRemaining = Math.max(0, car.fuelRemaining - car.fuelConsumption);

    // Lap time
    const wearPenalty = (car.tyreWear / 100) * 8;
    const fuelBonus = ((car.fuelCapacity - car.fuelRemaining) / car.fuelCapacity) * 2;
    const weatherPenalty = w.rainPenalty * 5;
    const gripFactor = tyreInfo.grip;
    car.totalTime += (car.baseLapTime + wearPenalty - fuelBonus + weatherPenalty) / gripFactor + (Math.random() - 0.5) * 1.5;

    // AI pit recommendation
    checkPitRecommendation(car);

    // Emergency checks
    checkEmergencyAlerts(car);
  });

  // Update positions
  STATE.cars.sort((a, b) => a.totalTime - b.totalTime);
  STATE.cars.forEach((car, i) => { car.position = i + 1; });

  updateDashboard();
  updateSimStatus();
}

function checkPitRecommendation(car) {
  const lapsLeft = STATE.totalLaps - STATE.currentLap;
  if (car.tyreWear > 75 && lapsLeft > 5) {
    const recTyre = recommendTyre();
    if (!car._lastRecLap || STATE.currentLap - car._lastRecLap > 3) {
      car._lastRecLap = STATE.currentLap;
      addRecommendation(car, `Pit within 1-2 laps. Tyre wear at ${car.tyreWear.toFixed(0)}%. Switch to ${recTyre}.`, 'urgent');
    }
  } else if (car.tyreWear > 55 && lapsLeft > 10) {
    if (!car._lastRecLap || STATE.currentLap - car._lastRecLap > 5) {
      car._lastRecLap = STATE.currentLap;
      addRecommendation(car, `Consider pit window in next 3-5 laps. Wear at ${car.tyreWear.toFixed(0)}%.`, 'caution');
    }
  }

  if (car.fuelRemaining < car.fuelCapacity * 0.15 && lapsLeft > 3) {
    addRecommendation(car, `Low fuel warning: ${car.fuelRemaining.toFixed(1)}L remaining.`, 'urgent');
  }

  // Auto-pit if critical
  if (car.tyreWear > 92 || car.fuelRemaining < 3) {
    performPitStop(car, recommendTyre(), 'Critical wear/fuel threshold');
  }
}

function checkEmergencyAlerts(car) {
  if (car.tyreWear > 85) {
    addAlert('critical', `Car #${car.carNumber}`, `Tyre wear critical: ${car.tyreWear.toFixed(0)}%`, car.carNumber);
  }
  if (car.fuelRemaining < car.fuelCapacity * 0.10) {
    addAlert('critical', `Car #${car.carNumber}`, `Fuel critically low: ${car.fuelRemaining.toFixed(1)}L`, car.carNumber);
  }
}

function recommendTyre() {
  return WEATHER_TYRE_MAP[STATE.weather.condition] || 'medium';
}

function performPitStop(car, newTyre, reason) {
  const oldTyre = car.tyreType;
  const duration = 18 + Math.random() * 10; // 18-28s pit stop

  car.pitCount++;
  car.totalTime += duration;
  car.tyreType = newTyre;
  car.tyreWear = 0;
  car.tyreAge = 0;
  car.fuelRemaining = car.fuelCapacity * 0.9;
  car.lastPitLap = STATE.currentLap;

  const record = {
    lap: STATE.currentLap,
    carNumber: car.carNumber,
    driverName: car.driverName,
    oldTyre, newTyre, duration: duration.toFixed(1), reason,
    timestamp: new Date().toLocaleTimeString()
  };

  STATE.tyreHistory.push(record);
  STATE.pitStopLog.push(record);

  addTimeline('pit', `Car #${car.carNumber} pit stop: ${oldTyre} → ${newTyre} (${duration.toFixed(1)}s)`);
  showToast(`Car #${car.carNumber} pit stop completed`, 'info');
}

// ===== DASHBOARD UPDATES =====
function updateDashboard() {
  // Stats
  document.getElementById('dashCurrentLap').textContent = STATE.currentLap;
  document.getElementById('simLapCounter').textContent = `Lap ${STATE.currentLap} / ${STATE.totalLaps}`;

  if (STATE.cars.length > 0) {
    const leader = STATE.cars[0];
    document.getElementById('dashLeader').textContent = `#${leader.carNumber} ${leader.driverName}`;
  }

  const wxMap = { dry: 'Dry ☀️', light_rain: 'Light Rain 🌦️', heavy_rain: 'Heavy Rain 🌧️', changing: 'Changing 🌤️' };
  document.getElementById('dashWeather').textContent = wxMap[STATE.weather.condition] || 'Dry ☀️';

  const activeAlerts = STATE.alerts.filter(a => !a.acknowledged).length;
  document.getElementById('dashAlertCount').textContent = activeAlerts;
  const badge = document.getElementById('alertBadge');
  if (activeAlerts > 0) { badge.textContent = activeAlerts; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }

  // Standings table
  const tbody = document.getElementById('dashStandingsBody');
  tbody.innerHTML = STATE.cars.map(car => {
    const wearClass = car.tyreWear > 75 ? 'color:var(--red)' : car.tyreWear > 50 ? 'color:var(--yellow)' : 'color:var(--green)';
    const fuelClass = car.fuelRemaining < car.fuelCapacity * 0.2 ? 'color:var(--red)' : '';
    return `<tr>
      <td><strong>P${car.position}</strong></td>
      <td>#${car.carNumber}</td>
      <td>${car.driverName}</td>
      <td>${car.currentLap}</td>
      <td><span class="tyre-badge ${car.tyreType}">${car.tyreType}</span></td>
      <td style="${wearClass}">${car.tyreWear.toFixed(0)}%</td>
      <td style="${fuelClass}">${car.fuelRemaining.toFixed(0)}L</td>
      <td>${car.status}</td>
    </tr>`;
  }).join('');

  updateCharts();
  updatePitTraffic();
  updateCrewStats();
}

// ===== CHARTS =====
function updateCharts() {
  // Tyre Wear Chart
  const wearCtx = document.getElementById('dashWearChart');
  if (STATE.charts.wear) STATE.charts.wear.destroy();

  const datasets = STATE.cars.slice(0, 6).map(car => ({
    label: `#${car.carNumber}`,
    data: car.wearHistory.map(h => ({ x: h.lap, y: h.wear })),
    borderColor: TYRE_DATA[car.tyreType]?.color || '#888',
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.3,
    fill: false
  }));

  STATE.charts.wear = new Chart(wearCtx, {
    type: 'line',
    data: { datasets },
    options: chartOptions('Tyre Wear (%)', 'Lap')
  });

  // Fuel Chart
  const fuelCtx = document.getElementById('dashFuelChart');
  if (STATE.charts.fuel) STATE.charts.fuel.destroy();
  STATE.charts.fuel = new Chart(fuelCtx, {
    type: 'bar',
    data: {
      labels: STATE.cars.map(c => `#${c.carNumber}`),
      datasets: [{
        label: 'Fuel (L)',
        data: STATE.cars.map(c => c.fuelRemaining),
        backgroundColor: STATE.cars.map(c => c.fuelRemaining < c.fuelCapacity * 0.2 ? 'rgba(255,59,59,0.6)' : 'rgba(0,180,255,0.5)'),
        borderRadius: 4
      }]
    },
    options: { ...chartOptions('Fuel (L)'), indexAxis: 'y' }
  });
}

function chartOptions(yLabel, xLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#7b8a9e', font: { size: 11 } } } },
    scales: {
      x: { title: { display: !!xLabel, text: xLabel || '', color: '#7b8a9e' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7b8a9e' } },
      y: { title: { display: true, text: yLabel, color: '#7b8a9e' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7b8a9e' } }
    }
  };
}

// ===== RECOMMENDATIONS =====
function addRecommendation(car, message, urgency) {
  const container = document.getElementById('dashRecommendations');
  // Avoid duplicates for same car/lap
  const id = `rec-${car.carNumber}-${STATE.currentLap}`;
  if (document.getElementById(id)) return;

  const el = document.createElement('div');
  el.className = `rec-card ${urgency}`;
  el.id = id;
  el.innerHTML = `
    <div class="rec-car">Car #${car.carNumber} — ${car.driverName}</div>
    <div class="rec-msg">${message}</div>
    <div class="rec-confidence">Lap ${STATE.currentLap} • AI Strategy Engine (Rule-Based)</div>
  `;
  container.prepend(el);

  // Keep max 20
  while (container.children.length > 20) container.lastChild.remove();
}

// ===== ALERTS =====
function addAlert(severity, title, message, carNumber) {
  // Deduplicate by car+lap+severity
  const key = `${carNumber}-${STATE.currentLap}-${severity}`;
  if (STATE.alerts.find(a => a.key === key)) return;

  const alert = {
    id: Date.now() + Math.random(),
    key,
    severity, title, message, carNumber,
    timestamp: new Date().toLocaleTimeString(),
    lap: STATE.currentLap,
    acknowledged: false
  };
  STATE.alerts.unshift(alert);
  renderAlerts();
}

function renderAlerts() {
  const container = document.getElementById('alertsList');
  const empty = document.getElementById('alertsEmpty');
  const unacked = STATE.alerts.filter(a => !a.acknowledged);

  if (unacked.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = unacked.slice(0, 50).map(a => `
    <div class="alert-item ${a.severity}">
      <i class="fas ${a.severity === 'critical' ? 'fa-exclamation-circle' : a.severity === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'} alert-icon"></i>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-msg">${a.message}</div>
        <div class="alert-meta">Lap ${a.lap} • ${a.timestamp}</div>
      </div>
    </div>
  `).join('');

  // Update badge
  const badge = document.getElementById('alertBadge');
  badge.textContent = unacked.length;
  badge.classList.toggle('hidden', unacked.length === 0);
  document.getElementById('dashAlertCount').textContent = unacked.length;
}

document.getElementById('triggerAlertBtn').addEventListener('click', () => {
  const types = [
    { s: 'critical', t: 'Car #44', m: 'Sudden tyre pressure loss detected! Immediate pit recommended.' },
    { s: 'warning', t: 'Car #33', m: 'Unusual tyre temperature — monitor closely.' },
    { s: 'critical', t: 'Car #16', m: 'Low fuel — 5 laps of fuel remaining.' },
    { s: 'warning', t: 'Pit Lane', m: 'High pit lane traffic expected in next 2 laps.' },
    { s: 'info', t: 'Weather', m: 'Rain probability increasing to 60% in 5 laps.' },
  ];
  const t = types[Math.floor(Math.random() * types.length)];
  addAlert(t.s, t.t, t.m, 'sim');
  showToast('Alert simulated!', 'info');
});

document.getElementById('clearAlertsBtn').addEventListener('click', () => {
  STATE.alerts.forEach(a => a.acknowledged = true);
  renderAlerts();
  showToast('All alerts acknowledged', 'success');
});

// ===== TIMELINE =====
function addTimeline(type, message) {
  STATE.timeline.unshift({
    type,
    message,
    lap: STATE.currentLap,
    timestamp: new Date().toLocaleTimeString()
  });
  renderTimeline();
}

function renderTimeline() {
  const container = document.getElementById('timelineList');
  const empty = document.getElementById('timelineEmpty');

  if (STATE.timeline.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = STATE.timeline.slice(0, 100).map(t => `
    <div class="timeline-item ${t.type}">
      <div class="tl-time">Lap ${t.lap} • ${t.timestamp}</div>
      <div class="tl-msg">${t.message}</div>
    </div>
  `).join('');
}

// ===== TYRE MANAGEMENT =====
function populateTyreCarSelect() {
  const sel = document.getElementById('tyreCarSelect');
  sel.innerHTML = STATE.cars.map(c => `<option value="${c.carNumber}">#${c.carNumber} — ${c.driverName}</option>`).join('');
}

document.getElementById('changeTyreBtn').addEventListener('click', () => {
  const carNum = document.getElementById('tyreCarSelect').value;
  const newTyre = document.getElementById('tyreCompoundSelect').value;
  const car = STATE.cars.find(c => c.carNumber === carNum);
  if (!car) return showToast('Select a car first', 'warning');

  performPitStop(car, newTyre, 'Manual tyre change via dashboard');
  renderTyreHistory();
  updateDashboard();
  showToast(`Tyre changed for Car #${carNum}: ${newTyre}`, 'success');
});

function renderTyreHistory() {
  const tbody = document.getElementById('tyreHistoryBody');
  const empty = document.getElementById('tyreHistoryEmpty');

  if (STATE.tyreHistory.length === 0) { empty.style.display = ''; tbody.innerHTML = ''; return; }
  empty.style.display = 'none';

  tbody.innerHTML = STATE.tyreHistory.map(r => `
    <tr>
      <td>${r.lap}</td>
      <td>#${r.carNumber}</td>
      <td><span class="tyre-badge ${r.oldTyre}">${r.oldTyre}</span></td>
      <td><span class="tyre-badge ${r.newTyre}">${r.newTyre}</span></td>
      <td>${r.reason}</td>
    </tr>
  `).join('');

  // Predictive chart
  renderTyreWearPrediction();
}

function renderTyreWearPrediction() {
  const ctx = document.getElementById('tyreWearPredChart');
  if (STATE.charts.tyrePred) STATE.charts.tyrePred.destroy();

  const datasets = STATE.cars.slice(0, 6).map(car => {
    const tyreInfo = TYRE_DATA[car.tyreType] || TYRE_DATA.medium;
    const predicted = [];
    let currentWear = car.tyreWear;
    for (let lap = STATE.currentLap; lap <= STATE.totalLaps; lap++) {
      predicted.push({ x: lap, y: Math.min(100, currentWear) });
      currentWear += tyreInfo.wearRate;
    }
    return {
      label: `#${car.carNumber} (${car.tyreType})`,
      data: predicted,
      borderColor: tyreInfo.color,
      borderWidth: 2,
      borderDash: [5, 3],
      pointRadius: 0,
      tension: 0.3,
      fill: false
    };
  });

  STATE.charts.tyrePred = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...chartOptions('Predicted Wear (%)', 'Lap'),
      plugins: {
        legend: { labels: { color: '#7b8a9e', font: { size: 11 } } },
        annotation: {
          annotations: {
            dangerLine: {
              type: 'line', yMin: 80, yMax: 80,
              borderColor: 'rgba(255,59,59,0.5)', borderWidth: 2, borderDash: [6, 3],
              label: { display: true, content: 'Danger Zone', color: '#ff3b3b', position: 'end' }
            }
          }
        }
      }
    }
  });
}

// ===== WEATHER =====
document.getElementById('weatherTrackTemp').addEventListener('input', (e) => {
  document.getElementById('weatherTrackTempVal').textContent = e.target.value + '°C';
});

document.getElementById('applyWeatherBtn').addEventListener('click', () => {
  const condition = document.getElementById('weatherCondition').value;
  const trackTemp = parseInt(document.getElementById('weatherTrackTemp').value);
  const surface = document.getElementById('weatherSurface').value;

  STATE.weather.condition = condition;
  STATE.weather.trackTemp = trackTemp;
  STATE.weather.surface = surface;

  // Adjust grip and penalty based on weather
  const gripMap = { dry: 1.0, light_rain: 0.88, heavy_rain: 0.72, changing: 0.85 };
  const penaltyMap = { dry: 0, light_rain: 0.05, heavy_rain: 0.15, changing: 0.08 };
  STATE.weather.grip = gripMap[condition] || 1.0;
  STATE.weather.rainPenalty = penaltyMap[condition] || 0;

  // Update display
  const wxLabels = { dry: 'Dry', light_rain: 'Light Rain', heavy_rain: 'Heavy Rain', changing: 'Changing' };
  document.getElementById('wxCurrent').textContent = wxLabels[condition];
  document.getElementById('wxTemp').textContent = trackTemp + '°C';
  document.getElementById('wxSurface').textContent = document.getElementById('weatherSurface').selectedOptions[0].text;

  const recTyre = WEATHER_TYRE_MAP[condition];
  const recEl = document.getElementById('wxRecTyre');
  recEl.textContent = TYRE_DATA[recTyre].label;
  recEl.className = `info-value tyre-badge ${recTyre}`;

  const reasons = {
    dry: 'Dry conditions favor medium compound for balanced performance and longevity.',
    light_rain: 'Light rain requires intermediates for adequate grip without excess wear.',
    heavy_rain: 'Heavy rain demands full wet tyres for safety and maximum water displacement.',
    changing: 'Changing conditions — intermediates provide flexibility for both dry and wet patches.'
  };
  document.getElementById('wxReason').textContent = reasons[condition];

  const risks = {
    dry: 'Low — no weather-related risk.',
    light_rain: 'Medium — slippery patches possible. Avoid soft tyres.',
    heavy_rain: 'High — aquaplaning risk. Non-wet tyres are dangerous.',
    changing: 'Medium — conditions may shift rapidly. Be prepared for pit stop.'
  };
  document.getElementById('wxRisk').textContent = risks[condition];

  addTimeline('weather', `Weather changed: ${wxLabels[condition]}, Track ${trackTemp}°C, Surface: ${surface}`);
  showToast('Weather updated!', 'success');
  updateDashboard();
});

// ===== PIT LANE TRAFFIC =====
function updatePitTraffic() {
  const carsNeedingPit = STATE.cars.filter(c => c.tyreWear > 60 || c.fuelRemaining < c.fuelCapacity * 0.25);
  const occupancy = carsNeedingPit.length;
  const maxPitBoxes = 3;

  document.getElementById('pitOccupancy').textContent = `${Math.min(occupancy, maxPitBoxes)} / ${maxPitBoxes}`;

  const riskEl = document.getElementById('pitTrafficRisk');
  if (occupancy >= 3) { riskEl.textContent = 'HIGH'; riskEl.className = 'stat-value risk-high'; }
  else if (occupancy >= 2) { riskEl.textContent = 'MEDIUM'; riskEl.className = 'stat-value risk-medium'; }
  else { riskEl.textContent = 'LOW'; riskEl.className = 'stat-value risk-low'; }

  document.getElementById('pitDelay').textContent = (occupancy > maxPitBoxes ? (occupancy - maxPitBoxes) * 5 : 0).toFixed(1) + 's';

  const tbody = document.getElementById('pitTrafficBody');
  const empty = document.getElementById('pitTrafficEmpty');

  if (carsNeedingPit.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  // Check for overlapping windows
  const windows = carsNeedingPit.map(c => ({
    car: c,
    windowStart: STATE.currentLap,
    windowEnd: STATE.currentLap + 3
  }));

  tbody.innerHTML = carsNeedingPit.map(car => {
    const hasConflict = carsNeedingPit.length > maxPitBoxes;
    return `<tr>
      <td>#${car.carNumber}</td>
      <td>${car.driverName}</td>
      <td>${car.tyreWear > 60 ? '⚠️ Yes' : car.fuelRemaining < car.fuelCapacity * 0.25 ? '⛽ Fuel' : 'No'}</td>
      <td>Lap ${STATE.currentLap}–${STATE.currentLap + 3}</td>
      <td style="color:${hasConflict ? 'var(--red)' : 'var(--green)'}">${hasConflict ? '⚠️ Overlap' : '✅ Clear'}</td>
    </tr>`;
  }).join('');
}

// ===== CREW STATS =====
function updateCrewStats() {
  if (STATE.pitStopLog.length === 0) return;

  const durations = STATE.pitStopLog.map(p => parseFloat(p.duration));
  document.getElementById('crewFastest').textContent = Math.min(...durations).toFixed(1) + 's';
  document.getElementById('crewSlowest').textContent = Math.max(...durations).toFixed(1) + 's';
  document.getElementById('crewAverage').textContent = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) + 's';

  const tbody = document.getElementById('crewLogBody');
  const empty = document.getElementById('crewLogEmpty');
  empty.style.display = 'none';

  tbody.innerHTML = STATE.pitStopLog.map((p, i) => {
    const dur = parseFloat(p.duration);
    const status = dur < 22 ? '<span style="color:var(--green)">Excellent</span>' :
                   dur < 26 ? '<span style="color:var(--yellow)">Good</span>' :
                   '<span style="color:var(--red)">Slow</span>';
    return `<tr>
      <td>${i + 1}</td>
      <td>#${p.carNumber}</td>
      <td>${p.lap}</td>
      <td>${p.duration}s</td>
      <td><span class="tyre-badge ${p.oldTyre}">${p.oldTyre}</span></td>
      <td><span class="tyre-badge ${p.newTyre}">${p.newTyre}</span></td>
      <td>${status}</td>
    </tr>`;
  }).join('');

  // Trend chart
  const ctx = document.getElementById('crewTrendChart');
  if (STATE.charts.crewTrend) STATE.charts.crewTrend.destroy();
  STATE.charts.crewTrend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: STATE.pitStopLog.map((p, i) => `Stop ${i + 1}`),
      datasets: [{
        label: 'Duration (s)',
        data: durations,
        backgroundColor: durations.map(d => d < 22 ? 'rgba(0,230,118,0.6)' : d < 26 ? 'rgba(255,193,7,0.6)' : 'rgba(255,59,59,0.6)'),
        borderRadius: 4
      }]
    },
    options: chartOptions('Duration (s)')
  });
}

// ===== STRATEGY COMPARISON =====
document.getElementById('compareStrategiesBtn').addEventListener('click', () => {
  const a = {
    laps: parseInt(document.getElementById('stratALaps').value),
    stops: parseInt(document.getElementById('stratAStops').value),
    tyres: document.getElementById('stratATyres').value.split(',').map(t => t.trim()),
    pitDuration: parseInt(document.getElementById('stratADuration').value)
  };
  const b = {
    laps: parseInt(document.getElementById('stratBLaps').value),
    stops: parseInt(document.getElementById('stratBStops').value),
    tyres: document.getElementById('stratBTyres').value.split(',').map(t => t.trim()),
    pitDuration: parseInt(document.getElementById('stratBDuration').value)
  };

  const calcStrategy = (s) => {
    let totalTime = 0;
    const stintLength = Math.floor(s.laps / (s.stops + 1));
    s.tyres.forEach((tyre, stintIdx) => {
      const tyreInfo = TYRE_DATA[tyre] || TYRE_DATA.medium;
      for (let lap = 0; lap < stintLength; lap++) {
        const wear = (lap * tyreInfo.wearRate);
        totalTime += (90 + wear * 0.08) / tyreInfo.grip;
      }
      if (stintIdx < s.stops) totalTime += s.pitDuration;
    });
    return {
      totalTime: totalTime.toFixed(1),
      pitTimeLost: (s.stops * s.pitDuration).toFixed(1),
      stops: s.stops,
      tyreSeq: s.tyres.join(' → ')
    };
  };

  const resA = calcStrategy(a);
  const resB = calcStrategy(b);
  const winner = parseFloat(resA.totalTime) < parseFloat(resB.totalTime) ? 'A' : 'B';

  document.getElementById('strategyResult').style.display = '';
  document.getElementById('strategyComparison').innerHTML = `
    <div class="info-panel" style="border-left: 4px solid var(--blue); padding-left: 16px;">
      <h4 style="color:var(--blue); margin-bottom:8px;">Strategy A ${winner === 'A' ? '⭐ RECOMMENDED' : ''}</h4>
      <div class="info-row"><span class="info-label">Est. Total Time:</span><span class="info-value">${resA.totalTime}s</span></div>
      <div class="info-row"><span class="info-label">Pit Stops:</span><span class="info-value">${resA.stops}</span></div>
      <div class="info-row"><span class="info-label">Time Lost in Pits:</span><span class="info-value">${resA.pitTimeLost}s</span></div>
      <div class="info-row"><span class="info-label">Tyre Sequence:</span><span class="info-value">${resA.tyreSeq}</span></div>
    </div>
    <div class="info-panel" style="border-left: 4px solid var(--red); padding-left: 16px;">
      <h4 style="color:var(--red); margin-bottom:8px;">Strategy B ${winner === 'B' ? '⭐ RECOMMENDED' : ''}</h4>
      <div class="info-row"><span class="info-label">Est. Total Time:</span><span class="info-value">${resB.totalTime}s</span></div>
      <div class="info-row"><span class="info-label">Pit Stops:</span><span class="info-value">${resB.stops}</span></div>
      <div class="info-row"><span class="info-label">Time Lost in Pits:</span><span class="info-value">${resB.pitTimeLost}s</span></div>
      <div class="info-row"><span class="info-label">Tyre Sequence:</span><span class="info-value">${resB.tyreSeq}</span></div>
    </div>
  `;

  // Comparison chart
  const ctx = document.getElementById('strategyCompareChart');
  if (STATE.charts.strategyComp) STATE.charts.strategyComp.destroy();
  STATE.charts.strategyComp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Time', 'Pit Time Lost', 'Stops'],
      datasets: [
        { label: 'Strategy A', data: [resA.totalTime, resA.pitTimeLost, resA.stops * 100], backgroundColor: 'rgba(0,180,255,0.6)', borderRadius: 4 },
        { label: 'Strategy B', data: [resB.totalTime, resB.pitTimeLost, resB.stops * 100], backgroundColor: 'rgba(255,59,59,0.6)', borderRadius: 4 }
      ]
    },
    options: chartOptions('Value')
  });
});

// ===== WHAT-IF ANALYSIS =====
document.getElementById('wiRunBtn').addEventListener('click', async () => {
  const laps = parseInt(document.getElementById('wiLaps').value);
  const wxLap = parseInt(document.getElementById('wiWeatherLap').value);
  const wxType = document.getElementById('wiWeatherType').value;
  const grip = parseFloat(document.getElementById('wiGrip').value);
  const penalty = parseFloat(document.getElementById('wiPenalty').value);

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: { laps, pit_boxes: 3 },
        events: [{ lap: wxLap, condition: wxType, grip, rain_penalty: penalty, temperature: 22 }]
      })
    });
    const data = await res.json();

    document.getElementById('wiResults').style.display = '';
    document.getElementById('wiResultsBody').innerHTML = data.final_positions.map(r => `
      <tr>
        <td>P${r.position}</td>
        <td>${r.name}</td>
        <td>${r.total_time.toFixed(1)}s</td>
        <td>${r.pit_count}</td>
        <td><span class="tyre-badge ${r.tyre_type}">${r.tyre_type}</span></td>
      </tr>
    `).join('');

    // Chart
    const ctx = document.getElementById('wiChart');
    if (STATE.charts.whatIf) STATE.charts.whatIf.destroy();
    STATE.charts.whatIf = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.final_positions.map(r => r.name),
        datasets: [{
          label: 'Total Time (s)',
          data: data.final_positions.map(r => r.total_time),
          backgroundColor: data.final_positions.map((_, i) => i === 0 ? 'rgba(0,230,118,0.6)' : 'rgba(0,180,255,0.4)'),
          borderRadius: 4
        }]
      },
      options: chartOptions('Time (s)')
    });
  } catch(e) {
    showToast('Simulation failed: ' + e.message, 'error');
  }
});

document.getElementById('wiResetBtn').addEventListener('click', () => {
  document.getElementById('wiLaps').value = 50;
  document.getElementById('wiWeatherLap').value = 12;
  document.getElementById('wiWeatherType').value = 'rain';
  document.getElementById('wiGrip').value = 0.84;
  document.getElementById('wiPenalty').value = 0.1;
  document.getElementById('wiResults').style.display = 'none';
  showToast('Parameters reset to defaults', 'info');
});

// ===== CSV EXPORT =====
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (STATE.timeline.length === 0) return showToast('Nothing to export', 'warning');

  let csv = 'Lap,Timestamp,Type,Event\n';
  STATE.timeline.forEach(t => {
    csv += `${t.lap},"${t.timestamp}","${t.type}","${t.message.replace(/"/g, '""')}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `racepit_timeline_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!', 'success');
});

// ===== SIMULATION CONTROLS =====
function startSimulation() {
  if (STATE.cars.length === 0) {
    STATE.cars = getDefaultCars();
    showToast('Using default F1 grid (add cars in Garage)', 'info');
  }

  STATE.simRunning = true;
  STATE.simPaused = false;
  STATE.simSpeed = parseInt(document.getElementById('simSpeed').value);

  document.getElementById('simStartBtn').disabled = true;
  document.getElementById('simPauseBtn').disabled = false;
  updateSimStatus();

  addTimeline('race', 'Simulation started');

  STATE.simInterval = setInterval(() => {
    if (!STATE.simPaused) simulateLap();
  }, STATE.simSpeed);
}

function pauseSimulation() {
  STATE.simPaused = !STATE.simPaused;
  const btn = document.getElementById('simPauseBtn');
  btn.innerHTML = STATE.simPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
  updateSimStatus();
  addTimeline('race', STATE.simPaused ? 'Simulation paused' : 'Simulation resumed');
}

function stopSimulation() {
  STATE.simRunning = false;
  STATE.simPaused = false;
  clearInterval(STATE.simInterval);
  document.getElementById('simStartBtn').disabled = false;
  document.getElementById('simPauseBtn').disabled = true;
  updateSimStatus();
}

function resetSimulation() {
  stopSimulation();
  STATE.currentLap = 0;
  STATE.cars.forEach(car => {
    car.currentLap = 0;
    car.tyreType = 'medium';
    car.tyreAge = 0;
    car.tyreWear = 0;
    car.fuelRemaining = car.fuelCapacity;
    car.totalTime = 0;
    car.pitCount = 0;
    car.lastPitLap = null;
    car.status = 'racing';
    car.wearHistory = [];
    car._lastRecLap = null;
  });
  STATE.alerts = [];
  STATE.timeline = [];
  STATE.tyreHistory = [];
  STATE.pitStopLog = [];
  document.getElementById('dashRecommendations').innerHTML = '';
  renderAlerts();
  renderTimeline();
  renderTyreHistory();
  updateDashboard();
  showToast('Simulation reset', 'info');
}

function updateSimStatus() {
  const el = document.getElementById('simStatusText');
  if (STATE.simRunning && !STATE.simPaused) {
    el.textContent = 'SIMULATION LIVE';
    el.className = 'status-dot running';
  } else if (STATE.simPaused) {
    el.textContent = 'PAUSED';
    el.className = 'status-dot paused';
  } else {
    el.textContent = 'SIMULATION IDLE';
    el.className = 'status-dot offline';
  }
}

document.getElementById('simStartBtn').addEventListener('click', startSimulation);
document.getElementById('simPauseBtn').addEventListener('click', pauseSimulation);
document.getElementById('simResetBtn').addEventListener('click', resetSimulation);
document.getElementById('simSpeed').addEventListener('change', (e) => {
  STATE.simSpeed = parseInt(e.target.value);
  if (STATE.simRunning) {
    clearInterval(STATE.simInterval);
    STATE.simInterval = setInterval(() => { if (!STATE.simPaused) simulateLap(); }, STATE.simSpeed);
  }
});

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const colors = { success: 'var(--green)', error: 'var(--red)', warning: 'var(--yellow)', info: 'var(--blue)' };
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

  const toast = document.createElement('div');
  toast.style.cssText = `background:var(--bg-card);border:1px solid ${colors[type]};border-left:4px solid ${colors[type]};border-radius:8px;padding:12px 18px;color:var(--text);font-size:0.88rem;display:flex;align-items:center;gap:10px;animation:slideIn 0.3s ease;backdrop-filter:blur(10px);min-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
  toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]}"></i>${message}`;
  container.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ===== LIVE CIRCUIT & PIT LINE TRACKER ANIMATION =====
let trackAnimFrame = null;
let carTrackProgress = {};

function initTrackAnimation() {
  const canvas = document.getElementById('trackCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw Outer Track Loop
    ctx.beginPath();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(150, 40);
    ctx.lineTo(w - 150, 40);
    ctx.arcTo(w - 40, 40, w - 40, 140, 50);
    ctx.lineTo(w - 40, 140);
    ctx.arcTo(w - 40, 140, w - 150, 140, 50);
    ctx.lineTo(150, 140);
    ctx.arcTo(40, 140, 40, 40, 50);
    ctx.lineTo(40, 40);
    ctx.arcTo(40, 40, 150, 40, 50);
    ctx.closePath();
    ctx.stroke();

    // Track centerline (dashed line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pit Lane Branch Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.4)';
    ctx.lineWidth = 10;
    ctx.moveTo(w - 220, 140);
    ctx.lineTo(w - 320, 95);
    ctx.lineTo(320, 95);
    ctx.lineTo(180, 140);
    ctx.stroke();

    // Pit Line Labels
    ctx.fillStyle = '#ffc107';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PIT ENTRY ➔', w - 210, 125);
    ctx.fillText('PIT BOXES 🏁', w - 380, 88);
    ctx.fillText('PIT EXIT ➔', 190, 125);

    // Finish Line
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.moveTo(w / 2, 28);
    ctx.lineTo(w / 2, 52);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('FINISH LINE', w / 2 - 30, 22);

    // Render Cars
    if (STATE.cars && STATE.cars.length > 0) {
      STATE.cars.forEach((car, idx) => {
        if (carTrackProgress[car.carNumber] === undefined) {
          carTrackProgress[car.carNumber] = idx * (1 / Math.max(1, STATE.cars.length));
        }

        if (STATE.simRunning && !STATE.simPaused) {
          const speed = 0.002 + (6 - Math.min(car.position, 6)) * 0.0003;
          carTrackProgress[car.carNumber] = (carTrackProgress[car.carNumber] + speed) % 1;
        }

        let prog = carTrackProgress[car.carNumber];
        let cx, cy;

        // In pit lane vs main track
        if (car.status === 'in_pit' || car.tyreWear > 90) {
          cx = (w - 220) - prog * (w - 400);
          cy = 95;
        } else {
          if (prog < 0.35) {
            cx = 150 + (prog / 0.35) * (w - 300);
            cy = 40;
          } else if (prog < 0.5) {
            let p = (prog - 0.35) / 0.15;
            cx = w - 150 + Math.sin(p * Math.PI) * 90;
            cy = 40 + p * 100;
          } else if (prog < 0.85) {
            cx = (w - 150) - ((prog - 0.5) / 0.35) * (w - 300);
            cy = 140;
          } else {
            let p = (prog - 0.85) / 0.15;
            cx = 150 - Math.sin(p * Math.PI) * 90;
            cy = 140 - p * 100;
          }
        }

        // Draw glowing car dot
        const hue = (parseInt(car.carNumber) * 37) % 360;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, 85%, 60%)`;
        ctx.shadowColor = `hsl(${hue}, 85%, 60%)`;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw Car Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`#${car.carNumber}`, cx, cy - 11);
      });
    }

    trackAnimFrame = requestAnimationFrame(render);
  }

  render();
}

// ===== INIT =====
async function init() {
  await fetchGarage();
  updateDashboard();
  renderAlerts();
  renderTimeline();
  initTrackAnimation();
}

init();
