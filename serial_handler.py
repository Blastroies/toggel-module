import serial
import serial.tools.list_ports
import threading
import queue
import time
import re

class SerialWeatherReceiver:
    def __init__(self, port=None, baudrate=9600):
        self.port = port
        self.baudrate = baudrate
        self.serial_connection = None
        self.running = False
        self.data_queue = queue.Queue()
        self.thread = None
        
    def list_ports(self):
        """List available serial ports"""
        ports = serial.tools.list_ports.comports()
        return [{'port': port.device, 'description': port.description} for port in ports]
    
    def connect(self, port=None):
        """Connect to serial port"""
        if port:
            self.port = port
        
        try:
            self.serial_connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1
            )
            return True
        except Exception as e:
            print(f"Serial connection error: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from serial port"""
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        
        if self.serial_connection and self.serial_connection.is_open:
            self.serial_connection.close()
        
        return True
    
    def parse_data(self, line):
        """Parse incoming serial data"""
        # Expected format: "pressure,temperature,humidity"
        # Example: "1013.25,29.8,58.4"
        
        # Clean the line
        line = line.strip()
        
        # Try to match pattern
        pattern = r'(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)'
        match = re.search(pattern, line)
        
        if match:
            try:
                pressure = float(match.group(1))
                temperature = float(match.group(2))
                humidity = float(match.group(3))
                
                # Validate ranges
                if 950 <= pressure <= 1050 and -20 <= temperature <= 50 and 0 <= humidity <= 100:
                    return {
                        'pressure': pressure,
                        'temperature': temperature,
                        'humidity': humidity
                    }
            except ValueError:
                pass
        
        return None
    
    def start_reading(self, callback):
        """Start reading serial data in background thread"""
        if not self.serial_connection or not self.serial_connection.is_open:
            return False
        
        self.running = True
        
        def read_loop():
            while self.running:
                try:
                    if self.serial_connection.in_waiting:
                        line = self.serial_connection.readline().decode('utf-8', errors='ignore')
                        data = self.parse_data(line)
                        if data:
                            callback(data)
                except Exception as e:
                    print(f"Error reading serial: {e}")
                
                time.sleep(0.5)  # Read every 500ms
        
        self.thread = threading.Thread(target=read_loop, daemon=True)
        self.thread.start()
        return True

# Global serial handler
serial_handler = SerialWeatherReceiver()