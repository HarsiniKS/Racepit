import os
from flask import Flask, jsonify, request, render_template
from flask_login import LoginManager
from backend.database import db, User
from race_simulator import simulate_race, generate_default_cars, apply_manual_event
from backend.api.routes import api
from backend.api.cars import cars_api

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default-dev-secret-key-do-not-use-in-prod')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(DATA_DIR, 'race_history.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

app.register_blueprint(api)
app.register_blueprint(cars_api)

with app.app_context():
    db.create_all()
    # Create default admin user if none exists
    if not User.query.filter_by(username='admin').first():
        admin = User(username='admin', role='Team Manager')
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/health")
def health_check():
    return jsonify({"status": "ok", "message": "Race strategist simulation is running."})

@app.get("/api/default-race")
def default_race():
    return jsonify({
        "cars": [car.to_dict() for car in generate_default_cars()],
        "config": {"laps": 50, "pit_boxes": 3},
    })

@app.post("/api/simulate")
def simulate():
    payload = request.get_json(silent=True) or {}
    config = payload.get("config", {"laps": 50, "pit_boxes": 3})
    events = payload.get("events", [
        {"lap": 8, "condition": "mixed", "grip": 0.92, "rain_penalty": 0.04, "temperature": 24.0},
        {"lap": 15, "condition": "rain", "grip": 0.84, "rain_penalty": 0.11, "temperature": 18.0},
    ])
    result = simulate_race(config, events)
    return jsonify(result)

@app.post("/api/what-if")
def what_if():
    payload = request.get_json(silent=True) or {}
    events = payload.get("events", [])
    event = payload.get("event")
    if event:
        apply_manual_event(events, int(event.get("lap", 10)), event.get("condition", "rain"), float(event.get("grip", 0.85)), float(event.get("rain_penalty", 0.1)))
    config = payload.get("config", {"laps": 50, "pit_boxes": 3})
    return jsonify(simulate_race(config, events))

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)

