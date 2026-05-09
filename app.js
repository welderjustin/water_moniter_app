// Firebase Configuration
const FIREBASE_DB = 'https://water-level-monitor-36c92-default-rtdb.firebaseio.com';
const FIREBASE_AUTH = '7wm13ioXWbLq2iiWNAI1dlZglCqbaf8FbEcenJsV';
const FIREBASE_PATH = '/cistern/data.json';

// Water tank calibration (from Arduino code)
const WATER_FULL_DISTANCE = 53;  // cm - distance when tank is full
const WATER_EMPTY_DISTANCE = 217; // cm - distance when tank is empty
const TANK_CAPACITY = 1000; // gallons

// DOM Elements
const waterPercentage = document.getElementById('waterPercentage');
const waterBar = document.getElementById('waterBar');
const waterDistance = document.getElementById('waterDistance');
const temperature = document.getElementById('temperature');
const humidity = document.getElementById('humidity');
const lastUpdate = document.getElementById('lastUpdate');
const status = document.getElementById('status');
const alertsContainer = document.getElementById('alerts');
const notifyBtn = document.getElementById('notifyBtn');

// State
let lastAlertType = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    notifyBtn.addEventListener('click', requestNotificationPermission);
    fetchData();
    setInterval(fetchData, 5000); // Refresh every 5 seconds
});

// Register Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('service-worker.js');
            console.log('Service Worker registered');
        } catch (error) {
            console.log('Service Worker registration failed:', error);
        }
    }
}

// Fetch data from Firebase
async function fetchData() {
    try {
        const response = await fetch(`${FIREBASE_DB}${FIREBASE_PATH}?auth=${FIREBASE_AUTH}`);

        if (!response.ok) {
            throw new Error(`Firebase error: ${response.status}`);
        }

        const data = await response.json();

        if (data) {
            updateUI(data);
            updateStatus('connected');
        } else {
            updateStatus('error');
            showMessage('No data from Arduino yet');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        updateStatus('error');
        showMessage('Connection error. Retrying...');
    }
}

// Update UI with data
function updateUI(data) {
    // Water level
    if (data.water_distance_cm !== undefined) {
        const distance = data.water_distance_cm;
        const percentage = calculateWaterPercentage(distance);

        waterPercentage.textContent = `${percentage}%`;
        waterBar.style.width = `${percentage}%`;
        waterDistance.textContent = `${distance} cm`;

        // Color coding
        if (percentage <= 25) {
            waterBar.style.background = 'linear-gradient(90deg, #F44336 0%, #D32F2F 100%)';
        } else if (percentage <= 50) {
            waterBar.style.background = 'linear-gradient(90deg, #FF9800 0%, #F57C00 100%)';
        } else if (percentage <= 75) {
            waterBar.style.background = 'linear-gradient(90deg, #FFC107 0%, #FFA000 100%)';
        } else {
            waterBar.style.background = 'linear-gradient(90deg, #4CAF50 0%, #388E3C 100%)';
        }
    }

    // Temperature
    if (data.temperature_c !== undefined) {
        temperature.textContent = `${data.temperature_c}°C`;
    }

    // Humidity
    if (data.humidity_percent !== undefined) {
        humidity.textContent = `${data.humidity_percent}%`;
    }

    // Last update time
    if (data.timestamp !== undefined) {
        const time = new Date(data.timestamp).toLocaleTimeString();
        lastUpdate.textContent = time;
    }

    // Show alerts if present
    if (data.alert_type) {
        showAlert(data);
    }
}

// Calculate water percentage
function calculateWaterPercentage(distance) {
    // Reverse calculation: smaller distance = more water
    const percentage = Math.max(0, Math.min(100,
        ((WATER_EMPTY_DISTANCE - distance) / (WATER_EMPTY_DISTANCE - WATER_FULL_DISTANCE)) * 100
    ));
    return Math.round(percentage);
}

// Show alerts
function showAlert(data) {
    const alertType = data.alert_type;

    // Don't show duplicate alerts
    if (alertType === lastAlertType) {
        return;
    }

    lastAlertType = alertType;

    const alertMessages = {
        'LOW_WATER': {
            message: '⚠️ Water level is LOW',
            className: 'critical'
        },
        'TEMP_WARNING': {
            message: '⚠️ Temperature WARNING (5°C)',
            className: 'warning'
        },
        'TEMP_CRITICAL': {
            message: '🔴 CRITICAL: Temperature FREEZING (0°C)',
            className: 'critical'
        },
        'TEMP_HIGH': {
            message: '🔴 CRITICAL: Temperature HIGH (50°C)',
            className: 'high'
        }
    };

    const alertInfo = alertMessages[alertType];
    if (alertInfo) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${alertInfo.className}`;
        alertDiv.textContent = alertInfo.message;
        alertDiv.style.animation = 'slideIn 0.3s ease';

        // Remove old alerts
        const oldAlerts = alertsContainer.querySelectorAll('.alert');
        oldAlerts.forEach(el => el.remove());

        alertsContainer.prepend(alertDiv);

        // Send notification
        sendNotification(alertInfo.message, {
            badge: '🚨',
            tag: alertType
        });
    }
}

// Update connection status
function updateStatus(state) {
    if (state === 'connected') {
        status.textContent = '🟢 Connected';
        status.className = 'status connected';
    } else if (state === 'error') {
        status.textContent = '🔴 Disconnected';
        status.className = 'status error';
    } else {
        status.textContent = '🟡 Connecting...';
        status.className = 'status';
    }
}

// Show temporary message
function showMessage(msg) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    alertDiv.textContent = msg;
    alertsContainer.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
}

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Your browser does not support notifications');
        return;
    }

    if (Notification.permission === 'granted') {
        notifyBtn.textContent = '✓ Notifications Enabled';
        notifyBtn.classList.add('enabled');
        sendNotification('Notifications enabled!');
        return;
    }

    if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings.');
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        notifyBtn.textContent = '✓ Notifications Enabled';
        notifyBtn.classList.add('enabled');
        sendNotification('Notifications enabled!');

        // Subscribe to push notifications
        subscribeToPushNotifications();
    }
}

// Send notification
function sendNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
        const defaultOptions = {
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%232196F3" width="192" height="192"/><text x="96" y="120" font-size="80" fill="white" text-anchor="middle" font-weight="bold">W</text></svg>',
            badge: '💧',
            ...options
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: title,
                options: defaultOptions
            });
        } else if (navigator.serviceWorker.controller) {
            new Notification(title, defaultOptions);
        }
    }
}

// Subscribe to push notifications
async function subscribeToPushNotifications() {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        try {
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                    'BCEEkAEi-800DIM11aPePRGbone2jcsauthrBHwyPhFzIap66VQu-xvlkEAC' +
                    'P1GyWksXUEaWj_Q0zpf1DBwI1UA'
                )
            });
            console.log('Push subscription successful:', subscription);
        } catch (error) {
            console.log('Push subscription failed:', error);
        }
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Check notification permission on load
window.addEventListener('load', () => {
    if (Notification.permission === 'granted') {
        notifyBtn.textContent = '✓ Notifications Enabled';
        notifyBtn.classList.add('enabled');
    }
});
