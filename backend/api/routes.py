import json
from flask import Blueprint, request, jsonify

from backend.database import db, RaceSession, Car
from backend.simulation.engine import create_race, advance_lap, trigger_weather_event, compare_strategies

api = Blueprint("api", __name__)

RACES = {}


@api.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Race Strategist backend is running."})


@api.route("/api/races", methods=["POST"])
def create_new_race():
    payload = request.get_json(silent=True) or {}
    config = payload.get("config", {})
    race = create_race(config)
    RACES[race.race_id] = race
    
    # Optional: persist to DB immediately
    new_race = RaceSession(id=race.race_id, total_laps=race.laps)
    db.session.add(new_race)
    db.session.commit()
    
    return jsonify({"race": race.to_dict()})


@api.route("/api/races/<race_id>", methods=["GET"])
def get_race(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    return jsonify({"race": race.to_dict()})


@api.route("/api/races/<race_id>/advance", methods=["POST"])
def advance_race(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    result = advance_lap(race)
    if race.completed:
        race_session = RaceSession.query.get(race.race_id)
        if race_session:
            race_session.status = "finished"
            db.session.commit()
    return jsonify(result)


@api.route("/api/races/<race_id>/weather", methods=["POST"])
def add_weather_event(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    payload = request.get_json(silent=True) or {}
    result = trigger_weather_event(race, payload)
    return jsonify(result)


@api.route("/api/races/<race_id>/strategy", methods=["GET"])
def race_strategy(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    result = []
    for car in race.cars:
        recommendation = {
            "car_id": car.id,
            "driver_name": car.driver_name,
            "strategy": car.strategy,
            "tyre": car.tyre_type,
            "fuel_remaining": round(car.fuel_remaining, 2),
            "tyre_wear": round(car.tyre_wear, 2),
        }
        result.append(recommendation)
    return jsonify({"recommendations": result})


@api.route("/api/races/<race_id>/compare", methods=["GET"])
def compare(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    return jsonify(compare_strategies(race))


@api.route("/api/history", methods=["GET"])
def history():
    sessions = RaceSession.query.order_by(RaceSession.created_at.desc()).limit(20).all()
    history_data = [{"id": s.id, "created_at": s.created_at, "status": s.status} for s in sessions]
    return jsonify({"history": history_data})


@api.route("/api/races/<race_id>/reset", methods=["POST"])
def reset_race(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    config = {"laps": race.laps, "pit_boxes": race.pit_boxes, "car_count": len(race.cars)}
    RACES[race_id] = create_race(config)
    return jsonify({"message": "Race reset", "race": RACES[race_id].to_dict()})


@api.route("/api/races/<race_id>/pause", methods=["POST"])
def pause_race(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    race.status = "paused"
    return jsonify({"message": "Race paused", "race": race.to_dict()})


@api.route("/api/races/<race_id>/resume", methods=["POST"])
def resume_race(race_id):
    race = RACES.get(race_id)
    if race is None:
        return jsonify({"error": "Race not found"}), 404
    race.status = "running"
    return jsonify({"message": "Race resumed", "race": race.to_dict()})
