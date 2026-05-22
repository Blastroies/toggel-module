from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import pandas as pd
import numpy as np
from datetime import datetime
import json
import os
import threading
import random
import math
import time

from ml_model import predictor
from serial_handler import serial_handler

app = Flask(__name__)
app.config['SECRET_KEY'] = 'drone-weather-secret'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')
simulation_running = False
simulation_thread = None

def generate_simulated_data():
    """Generate realistic pressure, temperature, humidity."""
    t = time.time()
    pressure = 1013.0 + 5 * math.sin(t / 10) + random.uniform(-1, 1)
    temperature = 25.0 + 2 * math.sin(t / 20) + random.uniform(-0.5, 0.5)
    humidity = 60.0 + 10 * math.sin(t / 15) + random.uniform(-2, 2)
    return {
        'pressure': round(pressure, 2),
        'temperature': round(temperature, 2),
        'humidity': round(humidity, 2)
    }

def simulation_loop():
    """Background task that emits simulated drone data."""
    global simulation_running
    while simulation_running:
        data = generate_simulated_data()
        socketio.emit('drone_data', data)
        # Automatically predict weather for this data
        result = predictor.predict(data['pressure'], data['temperature'], data['humidity'])
        socketio.emit('prediction_update', result)
        time.sleep(0.5)   # 2 Hz update rate
# Store prediction history
prediction_history = []
live_data_buffer = []

@app.route('/')
def index():
    """Main dashboard"""
    return render_template('index.html')

@app.route('/api/train', methods=['POST'])
def train_model():
    """Train or retrain the model"""
    try:
        predictor.train()
        return jsonify({'success': True, 'message': 'Model trained successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/predict', methods=['POST'])
def predict():
    """Make weather prediction"""
    try:
        data = request.json
        pressure = float(data['pressure'])
        temperature = float(data['temperature'])
        humidity = float(data['humidity'])
        
        result = predictor.predict(pressure, temperature, humidity)
        
        # Store in history
        history_entry = {
            'timestamp': datetime.now().isoformat(),
            'pressure': pressure,
            'temperature': temperature,
            'humidity': humidity,
            'prediction': result['prediction'],
            'confidence': result['confidence']
        }
        prediction_history.insert(0, history_entry)
        
        # Keep only last 100 entries
        while len(prediction_history) > 100:
            prediction_history.pop()
        
        return jsonify({'success': True, **result})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get prediction history"""
    return jsonify({'success': True, 'history': prediction_history})

@app.route('/api/export', methods=['POST'])
def export_data():
    """Export prediction history to CSV"""
    try:
        df = pd.DataFrame(prediction_history)
        csv_path = f"exports/weather_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        os.makedirs('exports', exist_ok=True)
        df.to_csv(csv_path, index=False)
        return jsonify({'success': True, 'file': csv_path})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get training data statistics for visualizations"""
    stats = predictor.get_training_data_stats()
    if stats:
        return jsonify({'success': True, **stats})
    return jsonify({'success': False, 'error': 'No data available'})

@app.route('/api/serial/ports', methods=['GET'])
def get_serial_ports():
    """List available serial ports"""
    ports = serial_handler.list_ports()
    return jsonify({'success': True, 'ports': ports})

@app.route('/api/serial/connect', methods=['POST'])
def connect_serial():
    """Connect to serial port"""
    data = request.json
    port = data.get('port')
    baudrate = data.get('baudrate', 9600)
    
    serial_handler.baudrate = baudrate
    if serial_handler.connect(port):
        return jsonify({'success': True, 'message': f'Connected to {port}'})
    return jsonify({'success': False, 'error': 'Failed to connect'})

@app.route('/api/serial/disconnect', methods=['POST'])
def disconnect_serial():
    """Disconnect from serial port"""
    serial_handler.disconnect()
    return jsonify({'success': True, 'message': 'Disconnected'})

@app.route('/api/serial/start', methods=['POST'])
def start_serial_reading():
    """Start reading serial data"""
    def on_data_received(data):
        # Send data via WebSocket to connected clients
        socketio.emit('drone_data', data)
        
        # Auto-predict
        result = predictor.predict(data['pressure'], data['temperature'], data['humidity'])
        socketio.emit('prediction_update', result)
        
        # Store in live buffer
        live_data_buffer.append({
            'timestamp': datetime.now().isoformat(),
            **data
        })
        
        # Keep buffer size manageable
        while len(live_data_buffer) > 1000:
            live_data_buffer.pop(0)
    
    if serial_handler.start_reading(on_data_received):
        return jsonify({'success': True, 'message': 'Started reading serial data'})
    return jsonify({'success': False, 'error': 'Failed to start reading'})

@app.route('/api/serial/stop', methods=['POST'])
def stop_serial_reading():
    """Stop reading serial data"""
    serial_handler.running = False
    return jsonify({'success': True, 'message': 'Stopped reading'})

@socketio.on('start_simulation')
def handle_start_simulation():
    global simulation_running, simulation_thread
    if simulation_running:
        emit('simulation_status', {'status': 'already_running'})
        return
    simulation_running = True
    simulation_thread = threading.Thread(target=simulation_loop, daemon=True)
    simulation_thread.start()
    emit('simulation_status', {'status': 'started'})

@socketio.on('stop_simulation')
def handle_stop_simulation():
    global simulation_running
    simulation_running = False
    emit('simulation_status', {'status': 'stopped'})

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'data': 'Connected to server'})

if __name__ == '__main__':
    # Train initial model
    print("🚁 Drone Weather Prediction System")
    print("=" * 50)
    print("Training initial ML model...")
    predictor.train()
    print("✅ Model ready!")
    print("🌐 Starting web server at http://localhost:5000")
    print("=" * 50)
    
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)