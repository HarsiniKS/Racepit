from flask import Blueprint, request, jsonify
from backend.database import db, Car

cars_api = Blueprint("cars_api", __name__)

@cars_api.route("/api/cars", methods=["GET"])
def get_cars():
    cars = Car.query.all()
    return jsonify({"cars": [{"id": c.id, "car_number": c.car_number, "driver_name": c.driver_name, "fuel_capacity": c.fuel_capacity, "base_lap_time": c.base_lap_time} for c in cars]})

@cars_api.route("/api/cars", methods=["POST"])
def add_car():
    data = request.get_json(silent=True) or {}
    if not data.get("car_number") or not data.get("driver_name"):
        return jsonify({"error": "Car number and driver name required"}), 400
    
    new_car = Car(
        car_number=data["car_number"],
        driver_name=data["driver_name"],
        fuel_capacity=data.get("fuel_capacity", 110.0),
        base_lap_time=data.get("base_lap_time", 90.0)
    )
    db.session.add(new_car)
    db.session.commit()
    return jsonify({"message": "Car added", "car": {"id": new_car.id, "car_number": new_car.car_number, "driver_name": new_car.driver_name}}), 201

@cars_api.route("/api/cars/<int:car_id>", methods=["DELETE"])
def delete_car(car_id):
    car = Car.query.get(car_id)
    if not car:
        return jsonify({"error": "Car not found"}), 404
    
    db.session.delete(car)
    db.session.commit()
    return jsonify({"message": "Car deleted"})
