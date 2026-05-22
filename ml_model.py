import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
import joblib
import os

class WeatherPredictor:
    def __init__(self, data_path= r"C:\Users\Admin\toggel module\weather_classification_data.csv", model_path=r"C:\Users\Admin\toggel module\weather_model.pkl"):
        self.data_path = data_path
        self.model_path = model_path
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.features = ['barometric_pressure', 'temperature', 'humidity']
        
    def train(self):
        """Train the Random Forest model"""
        # Load or create sample data
        if os.path.exists(self.data_path):
            df = pd.read_csv(self.data_path)
        else:
            df = self._create_sample_data()
            df.to_csv(self.data_path, index=False)
        
        # Prepare data
        X = df[self.features]
        y = df['weather']
        
        # Encode labels
        self.label_encoder = LabelEncoder()
        y_encoded = self.label_encoder.fit_transform(y)
        
        # Scale features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Train model
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            class_weight='balanced'
        )
        self.model.fit(X_scaled, y_encoded)
        
        # Save model
        self._save_model()
        
        return self.model
    
    def _create_sample_data(self):
        """Create comprehensive training data"""
        np.random.seed(42)
        
        # Generate synthetic data with realistic patterns
        data = []
        
        # CLEAR weather: high pressure, low humidity
        for _ in range(50):
            data.append({
                'barometric_pressure': np.random.uniform(1012, 1025),
                'temperature': np.random.uniform(20, 35),
                'humidity': np.random.uniform(30, 55),
                'weather': 'CLEAR'
            })
        
        # CLOUDY weather: medium pressure, medium humidity
        for _ in range(50):
            data.append({
                'barometric_pressure': np.random.uniform(1008, 1015),
                'temperature': np.random.uniform(15, 30),
                'humidity': np.random.uniform(55, 70),
                'weather': 'CLOUDY'
            })
        
        # RAIN weather: lower pressure, high humidity
        for _ in range(50):
            data.append({
                'barometric_pressure': np.random.uniform(998, 1010),
                'temperature': np.random.uniform(10, 25),
                'humidity': np.random.uniform(70, 88),
                'weather': 'RAIN'
            })
        
        # STORM weather: very low pressure, very high humidity
        for _ in range(50):
            data.append({
                'barometric_pressure': np.random.uniform(985, 1000),
                'temperature': np.random.uniform(5, 20),
                'humidity': np.random.uniform(88, 100),
                'weather': 'STORM'
            })
        
        return pd.DataFrame(data)
    
    def _save_model(self):
        """Save model and preprocessing objects"""
        objects = {
            'model': self.model,
            'scaler': self.scaler,
            'label_encoder': self.label_encoder,
            'features': self.features
        }
        joblib.dump(objects, self.model_path)
    
    def load_model(self):
        """Load trained model"""
        if os.path.exists(self.model_path):
            objects = joblib.load(self.model_path)
            self.model = objects['model']
            self.scaler = objects['scaler']
            self.label_encoder = objects['label_encoder']
            return True
        return False
    
    def predict(self, pressure, temperature, humidity):
        """Make prediction for single data point"""
        if self.model is None:
            if not self.load_model():
                self.train()
        
        # Create input array
        input_data = np.array([[pressure, temperature, humidity]])
        
        # Scale
        input_scaled = self.scaler.transform(input_data)
        
        # Predict
        prediction_encoded = self.model.predict(input_scaled)[0]
        prediction = self.label_encoder.inverse_transform([prediction_encoded])[0]
        
        # Get probabilities
        probabilities = self.model.predict_proba(input_scaled)[0]
        
        # Create probability dict
        probs_dict = {}
        for i, weather in enumerate(self.label_encoder.classes_):
            probs_dict[weather] = float(probabilities[i])
        
        return {
            'prediction': prediction,
            'confidence': float(max(probabilities)),
            'probabilities': probs_dict
        }
    
    def get_training_data_stats(self):
        """Get statistics for visualizations"""
        if os.path.exists(self.data_path):
            df = pd.read_csv(self.data_path)
            
            # Calculate correlation
            corr = df[self.features].corr()
            
            return {
                'data': df.to_dict('records'),
                'correlation': corr.to_dict(),
                'features': self.features,
                'classes': ['CLEAR', 'CLOUDY', 'RAIN', 'STORM']
            }
        return None

# Initialize global predictor
predictor = WeatherPredictor()