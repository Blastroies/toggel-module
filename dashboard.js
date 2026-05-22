// Drone Weather Prediction System - Dashboard JavaScript
// Complete working version with no syntax errors

let socket = null;
let liveChart = null;
let chartData = {
    pressure: [],
    temperature: [],
    humidity: [],
    timestamps: []
};

let isLogging = false;
let logs = [];

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeChart();
    loadHistory();
    loadTrainingStats();
    setupEventListeners();
});

// Setup all event listeners
function setupEventListeners() {
    // Mode switching
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            modeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            if (this.dataset.mode === 'manual') {
                document.getElementById('manualMode').style.display = 'block';
                document.getElementById('droneMode').style.display = 'none';
            } else {
                document.getElementById('manualMode').style.display = 'none';
                document.getElementById('droneMode').style.display = 'block';
                loadSerialPorts();
            }
        });
    });
    
    // Manual prediction button
    const predictBtn = document.getElementById('predictBtn');
    if (predictBtn) {
        predictBtn.addEventListener('click', makeManualPrediction);
    }
    
    // Serial buttons
    const connectBtn = document.getElementById('connectSerial');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectSerial);
    }
    
    const disconnectBtn = document.getElementById('disconnectSerial');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectSerial);
    }
    
    const startLoggingBtn = document.getElementById('startLogging');
    if (startLoggingBtn) {
        startLoggingBtn.addEventListener('click', startLogging);
    }
    
    const stopLoggingBtn = document.getElementById('stopLogging');
    if (stopLoggingBtn) {
        stopLoggingBtn.addEventListener('click', stopLogging);
    }

    const startSimulateBtn = document.getElementById('startSimulateBtn');
    if (startSimulateBtn) 
        {
    startSimulateBtn.addEventListener('click', () => 
            {
        socket.emit('start_simulation');
        showNotification('Simulation started', 'success');
            });
        }

    const stopSimulateBtn = document.getElementById('stopSimulateBtn');
    if (stopSimulateBtn) {
        stopSimulateBtn.addEventListener('click', () => 
            {
        socket.emit('stop_simulation');
        showNotification('Simulation stopped', 'info');
            });
        }
    
    const exportBtn = document.getElementById('exportCSV');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }
}

// Initialize WebSocket connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
        showNotification('Connected to server', 'success');
    });
    
    socket.on('drone_data', function(data) {
        updateLiveSensors(data);
        updateLiveChart(data);
        
        if (isLogging) {
            logs.push({
                timestamp: new Date().toISOString(),
                ...data
            });
        }
    });
    
    socket.on('prediction_update', function(result) {
        displayPrediction(result);
        loadHistory();
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        showNotification('Disconnected from server', 'error');
    });
}

// Initialize live chart
function initializeChart() {
    const ctx = document.getElementById('liveChart');
    if (!ctx) return;
    
    liveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Pressure (hPa)',
                    data: [],
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#ffaa00',
                    backgroundColor: 'rgba(255, 170, 0, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#fff' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    ticks: { color: '#fff' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });
}

// Make manual prediction
async function makeManualPrediction() {
    const pressure = parseFloat(document.getElementById('pressure').value);
    const temperature = parseFloat(document.getElementById('temperature').value);
    const humidity = parseFloat(document.getElementById('humidity').value);
    
    if (isNaN(pressure) || isNaN(temperature) || isNaN(humidity)) {
        showNotification('Please enter valid values', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pressure, temperature, humidity })
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayPrediction(result);
            loadHistory();
        } else {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        showNotification('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Display prediction results
function displayPrediction(result) {
    const weather = result.prediction;
    const confidence = (result.confidence * 100).toFixed(1);
    
    // Update weather icon
    const icons = {
        'CLEAR': '☀️',
        'CLOUDY': '☁️',
        'RAIN': '🌧️',
        'STORM': '⛈️'
    };
    
    document.getElementById('weatherIcon').innerHTML = icons[weather] || '🌤️';
    document.getElementById('predictionText').innerHTML = weather;
    document.getElementById('confidenceText').innerHTML = `Confidence: ${confidence}%`;
    
    // Display probabilities
    const probsDiv = document.getElementById('probabilities');
    probsDiv.innerHTML = '<h4 style="margin-top: 20px;">Probability Distribution</h4>';
    
    for (const [weatherType, prob] of Object.entries(result.probabilities)) {
        const probPercent = (prob * 100).toFixed(1);
        probsDiv.innerHTML += `
            <div class="prob-bar">
                <div class="prob-label">
                    <span>${icons[weatherType] || '📊'} ${weatherType}</span>
                    <span>${probPercent}%</span>
                </div>
                <div class="bar" style="width: ${probPercent}%">${probPercent > 15 ? probPercent + '%' : ''}</div>
            </div>
        `;
    }
    
    // Show alerts for bad weather
    const alertDiv = document.getElementById('alertMessage');
    if (weather === 'RAIN') {
        alertDiv.innerHTML = '<div class="alert alert-rain">🌧️ Rain detected. Consider postponing drone flight.</div>';
    } else if (weather === 'STORM') {
        alertDiv.innerHTML = '<div class="alert alert-storm">⚠️ STORM WARNING! Do NOT take off. Seek shelter immediately.</div>';
    } else {
        alertDiv.innerHTML = '';
    }
}

// Load prediction history
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const result = await response.json();
        
        if (result.success) {
            const tbody = document.getElementById('historyBody');
            tbody.innerHTML = '';
            
            result.history.forEach(entry => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${new Date(entry.timestamp).toLocaleTimeString()}</td>
                    <td>${entry.pressure.toFixed(1)}</td>
                    <td>${entry.temperature.toFixed(1)}</td>
                    <td>${entry.humidity.toFixed(1)}</td>
                    <td><span class="badge badge-${entry.prediction}">${entry.prediction}</span></td>
                    <td>${(entry.confidence * 100).toFixed(1)}%</td>
                `;
            });
            
            if (result.history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No predictions yet</td></tr>';
            }
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Load training data statistics
async function loadTrainingStats() {
    try {
        const response = await fetch('/api/stats');
        const result = await response.json();
        
        if (result.success && result.correlation) {
            drawHeatmap(result.correlation);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Draw correlation heatmap
function drawHeatmap(correlation) {
    const canvas = document.getElementById('heatmapCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const size = 300;
    canvas.width = size;
    canvas.height = size;
    
    const features = ['pressure', 'temperature', 'humidity'];
    const colors = [
        '#006837', '#1a9850', '#66bd63', '#a6d96a', '#d9ef8b',
        '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#a50026'
    ];
    
    function getColor(value) {
        const idx = Math.floor((value + 1) / 2 * 10);
        return colors[Math.min(Math.max(idx, 0), 10)];
    }
    
    const cellSize = size / features.length;
    
    for (let i = 0; i < features.length; i++) {
        for (let j = 0; j < features.length; j++) {
            const value = correlation[features[i]][features[j]];
            const color = getColor(value);
            
            ctx.fillStyle = color;
            ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
            
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(value.toFixed(2), j * cellSize + cellSize/2, i * cellSize + cellSize/2);
        }
    }
    
    // Add labels
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    for (let i = 0; i < features.length; i++) {
        ctx.fillText(features[i], -5, i * cellSize + cellSize/2);
        ctx.fillText(features[i], i * cellSize + cellSize/2, -5);
    }
}

// Update live sensor displays
function updateLiveSensors(data) {
    document.getElementById('livePressure').innerHTML = data.pressure.toFixed(1);
    document.getElementById('liveTemp').innerHTML = data.temperature.toFixed(1);
    document.getElementById('liveHumidity').innerHTML = data.humidity.toFixed(1);
}

// Update live chart
function updateLiveChart(data) {
    const now = new Date().toLocaleTimeString();
    
    chartData.pressure.push(data.pressure);
    chartData.temperature.push(data.temperature);
    chartData.humidity.push(data.humidity);
    chartData.timestamps.push(now);
    
    // Keep last 20 points
    if (chartData.pressure.length > 20) {
        chartData.pressure.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
        chartData.timestamps.shift();
    }
    
    if (liveChart) {
        liveChart.data.labels = chartData.timestamps;
        liveChart.data.datasets[0].data = [...chartData.pressure];
        liveChart.data.datasets[1].data = [...chartData.temperature];
        liveChart.data.datasets[2].data = [...chartData.humidity];
        liveChart.update();
    }
}

// Load available serial ports
async function loadSerialPorts() {
    try {
        const response = await fetch('/api/serial/ports');
        const result = await response.json();
        
        if (result.success) {
            const select = document.getElementById('serialPort');
            select.innerHTML = '<option value="">Select Serial Port</option>';
            result.ports.forEach(port => {
                select.innerHTML += `<option value="${port.port}">${port.port} - ${port.description}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading ports:', error);
    }
}

// Connect to serial device
async function connectSerial() {
    const port = document.getElementById('serialPort').value;
    if (!port) {
        showNotification('Please select a serial port', 'error');
        return;
    }
    
    showNotification('Connecting to ' + port + '...', 'info');
    
    try {
        // Connect
        let response = await fetch('/api/serial/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port, baudrate: 9600 })
        });
        
        let result = await response.json();
        if (!result.success) {
            showNotification('Failed to connect: ' + result.error, 'error');
            return;
        }
        
        // Start reading
        response = await fetch('/api/serial/start', { method: 'POST' });
        result = await response.json();
        
        if (result.success) {
            showNotification('Connected and receiving data!', 'success');
        } else {
            showNotification('Failed to start reading', 'error');
        }
    } catch (error) {
        showNotification('Connection error: ' + error.message, 'error');
    }
}

// Disconnect from serial device
async function disconnectSerial() {
    try {
        await fetch('/api/serial/stop', { method: 'POST' });
        await fetch('/api/serial/disconnect', { method: 'POST' });
        showNotification('Disconnected', 'success');
        
        document.getElementById('livePressure').innerHTML = '--';
        document.getElementById('liveTemp').innerHTML = '--';
        document.getElementById('liveHumidity').innerHTML = '--';
    } catch (error) {
        showNotification('Error disconnecting', 'error');
    }
}

// Start logging data
function startLogging() {
    isLogging = true;
    logs = [];
    showNotification('Started logging data', 'success');
}

// Stop logging data
function stopLogging() {
    isLogging = false;
    showNotification('Stopped logging. ' + logs.length + ' records collected.', 'info');
}

// Export logs to CSV
async function exportToCSV() {
    if (logs.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: logs })
        });
        
        const result = await response.json();
        if (result.success) {
            showNotification('Exported successfully: ' + result.file, 'success');
        } else {
            showNotification('Export failed', 'error');
        }
    } catch (error) {
        // Client-side export as fallback
        const csv = convertToCSV(logs);
        downloadCSV(csv, 'drone_weather_log_' + new Date().toISOString() + '.csv');
        showNotification('Exported to CSV', 'success');
    }
}

// Convert data to CSV
function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(header => JSON.stringify(obj[header] || '')).join(','));
    return [headers.join(','), ...rows].join('\n');
}

// Download CSV file
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Show loading indicator
function showLoading(show) {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        if (show) {
            loadingDiv.classList.add('show');
        } else {
            loadingDiv.classList.remove('show');
        }
    }
}

// Show notification
function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification notification-' + type;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#00ff88' : type === 'error' ? '#ff3366' : '#00d4ff'};
        color: ${type === 'success' ? '#000' : '#fff'};
        border-radius: 10px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Toggle dark mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    
    const toggle = document.getElementById('darkModeToggle');
    toggle.innerHTML = isDark ? '☀️' : '🌙';
}

// Load dark mode preference
function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').innerHTML = '☀️';
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .dark-mode {
        background: #000;
    }
    
    .notification {
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }
`;
document.head.appendChild(style);

// Initialize dark mode
loadDarkModePreference();

console.log('Dashboard initialized successfully');