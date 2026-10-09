from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import datetime

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Viewer') # Team Manager, Race Strategist, Pit Crew Member, Viewer

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Car(db.Model):
    __tablename__ = 'cars'
    id = db.Column(db.Integer, primary_key=True)
    car_number = db.Column(db.String(10), unique=True, nullable=False)
    driver_name = db.Column(db.String(100), nullable=False)
    fuel_capacity = db.Column(db.Float, nullable=False, default=110.0)
    fuel_consumption_rate = db.Column(db.Float, nullable=False, default=2.0)
    base_lap_time = db.Column(db.Float, nullable=False, default=90.0)

    # Relationships
    pit_stops = db.relationship('PitStop', backref='car', lazy=True)
    telemetry_logs = db.relationship('TelemetryLog', backref='car', lazy=True)

class RaceSession(db.Model):
    __tablename__ = 'race_sessions'
    id = db.Column(db.String(50), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    total_laps = db.Column(db.Integer, nullable=False, default=50)
    status = db.Column(db.String(20), nullable=False, default='planning') # planning, running, paused, finished
    weather_condition = db.Column(db.String(20), nullable=False, default='dry')
    track_temp = db.Column(db.Float, nullable=False, default=30.0)

    pit_stops = db.relationship('PitStop', backref='race', lazy=True)

class PitStop(db.Model):
    __tablename__ = 'pit_stops'
    id = db.Column(db.Integer, primary_key=True)
    race_id = db.Column(db.String(50), db.ForeignKey('race_sessions.id'), nullable=False)
    car_id = db.Column(db.Integer, db.ForeignKey('cars.id'), nullable=False)
    lap = db.Column(db.Integer, nullable=False)
    entry_time = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    duration_seconds = db.Column(db.Float, nullable=True)
    old_tyre = db.Column(db.String(20), nullable=False)
    new_tyre = db.Column(db.String(20), nullable=False)
    reason = db.Column(db.String(200), nullable=True)

class TelemetryLog(db.Model):
    __tablename__ = 'telemetry_logs'
    id = db.Column(db.Integer, primary_key=True)
    car_id = db.Column(db.Integer, db.ForeignKey('cars.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    lap = db.Column(db.Integer, nullable=False)
    tyre_type = db.Column(db.String(20), nullable=False)
    tyre_age_laps = db.Column(db.Integer, nullable=False)
    tyre_wear_percentage = db.Column(db.Float, nullable=False)
    fuel_remaining = db.Column(db.Float, nullable=False)

class Alert(db.Model):
    __tablename__ = 'alerts'
    id = db.Column(db.Integer, primary_key=True)
    car_id = db.Column(db.Integer, db.ForeignKey('cars.id'), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    severity = db.Column(db.String(20), nullable=False) # Info, Warning, Critical
    message = db.Column(db.String(255), nullable=False)
    acknowledged = db.Column(db.Boolean, default=False)
