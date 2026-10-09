from __future__ import annotations

import copy
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from .strategy import TYRE_TYPES, evaluate_options_for_car, get_recommended_tyre


@dataclass
class RaceCar:
    id: str
    driver_name: str
    fuel_capacity: float
    fuel_remaining: float
    fuel_consumption: float
    tyre_type: str
    tyre_wear: float
    tyre_degradation: float
    base_lap_time: float
    pit_duration: float
    current_lap: int = 0
    total_race_time: float = 0.0
    final_position: Optional[int] = None
    strategy: str = "monitor"
    pit_history: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "driver_name": self.driver_name,
            "fuel_capacity": round(self.fuel_capacity, 2),
            "fuel_remaining": round(self.fuel_remaining, 2),
            "fuel_consumption": round(self.fuel_consumption, 2),
            "tyre_type": self.tyre_type,
            "tyre_wear": round(self.tyre_wear, 2),
            "tyre_degradation": round(self.tyre_degradation, 2),
            "base_lap_time": round(self.base_lap_time, 2),
            "pit_duration": round(self.pit_duration, 2),
            "current_lap": self.current_lap,
            "total_race_time": round(self.total_race_time, 2),
            "strategy": self.strategy,
            "pit_history": self.pit_history,
            "final_position": self.final_position,
        }


@dataclass
class RaceState:
    race_id: str
    laps: int
    pit_boxes: int
    weather_state: Dict[str, Any]
    cars: List[RaceCar]
    events: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "ready"
    current_lap: int = 0
    strategy_summary: List[Dict[str, Any]] = field(default_factory=list)
    pit_schedule: List[Dict[str, Any]] = field(default_factory=list)
    completed: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "race_id": self.race_id,
            "laps": self.laps,
            "pit_boxes": self.pit_boxes,
            "weather_state": self.weather_state,
            "current_lap": self.current_lap,
            "status": self.status,
            "completed": self.completed,
            "cars": [car.to_dict() for car in self.cars],
            "events": self.events,
            "strategy_summary": self.strategy_summary,
            "pit_schedule": self.pit_schedule,
        }


def build_default_cars(count: int = 5) -> List[RaceCar]:
    templates = [
        {"driver_name": "Driver A", "fuel_capacity": 120.0, "fuel_remaining": 120.0, "fuel_consumption": 2.0, "tyre_type": "medium", "tyre_wear": 5.0, "tyre_degradation": 2.5, "base_lap_time": 88.0, "pit_duration": 25.0},
        {"driver_name": "Driver B", "fuel_capacity": 118.0, "fuel_remaining": 118.0, "fuel_consumption": 2.1, "tyre_type": "medium", "tyre_wear": 8.0, "tyre_degradation": 2.7, "base_lap_time": 89.0, "pit_duration": 24.0},
        {"driver_name": "Driver C", "fuel_capacity": 122.0, "fuel_remaining": 122.0, "fuel_consumption": 2.2, "tyre_type": "soft", "tyre_wear": 6.0, "tyre_degradation": 3.0, "base_lap_time": 90.0, "pit_duration": 26.0},
        {"driver_name": "Driver D", "fuel_capacity": 116.0, "fuel_remaining": 116.0, "fuel_consumption": 1.9, "tyre_type": "hard", "tyre_wear": 9.0, "tyre_degradation": 2.3, "base_lap_time": 87.5, "pit_duration": 23.5},
        {"driver_name": "Driver E", "fuel_capacity": 124.0, "fuel_remaining": 124.0, "fuel_consumption": 2.3, "tyre_type": "medium", "tyre_wear": 5.0, "tyre_degradation": 2.8, "base_lap_time": 92.0, "pit_duration": 25.5},
    ]
    cars = []
    for idx in range(count):
        template = templates[idx % len(templates)]
        cars.append(
            RaceCar(
                id=f"car-{idx + 1}",
                driver_name=f"{template['driver_name']} {idx + 1}",
                fuel_capacity=template["fuel_capacity"],
                fuel_remaining=template["fuel_remaining"],
                fuel_consumption=template["fuel_consumption"],
                tyre_type=template["tyre_type"],
                tyre_wear=template["tyre_wear"],
                tyre_degradation=template["tyre_degradation"],
                base_lap_time=template["base_lap_time"],
                pit_duration=template["pit_duration"],
            )
        )
    return cars


def get_weather_for_lap(lap_number: int, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    weather = {"condition": "dry", "grip": 1.0, "rain_penalty": 0.0, "temperature": 30.0}
    for event in events:
        if int(event.get("lap", 0)) <= lap_number:
            weather["condition"] = event.get("condition", weather["condition"])
            weather["grip"] = float(event.get("grip", weather["grip"]))
            weather["rain_penalty"] = float(event.get("rain_penalty", weather["rain_penalty"]))
            weather["temperature"] = float(event.get("temperature", weather["temperature"]))
    return weather


def compute_lap_time(car: RaceCar, weather: Dict[str, Any]) -> float:
    tyre = TYRE_TYPES[car.tyre_type]
    fuel_ratio = max(0.0, (car.fuel_capacity - car.fuel_remaining) / car.fuel_capacity)
    wear_factor = 1 + (car.tyre_wear / 100.0) * 0.2
    fuel_factor = 1 + fuel_ratio * 0.12
    wet_penalty = weather.get("rain_penalty", 0.0)
    tyre_mismatch = 0.0
    if weather.get("condition") in {"rain", "wet"} and car.tyre_type in {"hard", "medium", "soft"}:
        tyre_mismatch = 0.08
    if weather.get("condition") == "dry" and car.tyre_type in {"wet", "intermediate"}:
        tyre_mismatch = 0.06
    lap = car.base_lap_time * wear_factor * fuel_factor * (1 + wet_penalty + tyre_mismatch) / (tyre["grip"] * weather.get("grip", 1.0))
    return round(max(72.0, lap), 2)


def apply_pit_stop(car: RaceCar, tyre_choice: str, reason: str) -> None:
    car.tyre_type = tyre_choice
    car.tyre_wear = 0.0
    car.fuel_remaining = min(car.fuel_capacity, car.fuel_capacity * 0.92)
    car.pit_history.append({"lap": car.current_lap, "tyre": tyre_choice, "reason": reason})
    car.strategy = f"pit on lap {car.current_lap}"


def determine_best_strategy(car: RaceCar, race: RaceState) -> Dict[str, Any]:
    options = []
    laps_remaining = max(1, race.laps - car.current_lap)
    weather = get_weather_for_lap(car.current_lap + 1, race.events)
    race.weather_state = weather
    base = {
        "id": car.id,
        "driver_name": car.driver_name,
        "fuel_capacity": car.fuel_capacity,
        "fuel_remaining": car.fuel_remaining,
        "fuel_consumption": car.fuel_consumption,
        "tyre_type": car.tyre_type,
        "tyre_wear": car.tyre_wear,
        "tyre_degradation": car.tyre_degradation,
        "base_lap_time": car.base_lap_time,
        "pit_duration": car.pit_duration,
    }
    options.append({
        "decision": "continue",
        "estimated_total": estimate_remaining_for_car(base, laps_remaining, weather, None),
        "reason": "Continue racing to avoid lost pit time while the current pace remains competitive.",
        "tyre": car.tyre_type,
    })

    recommended = get_recommended_tyre(weather["condition"])
    pit = copy.deepcopy(base)
    pit["fuel_remaining"] = pit["fuel_capacity"] * 0.92
    pit["tyre_type"] = recommended
    pit["tyre_wear"] = 0.0
    pit_total = pit["pit_duration"] + estimate_remaining_for_car(pit, laps_remaining, weather, None)
    options.append({
        "decision": "pit_now",
        "estimated_total": pit_total,
        "reason": f"Switch to {recommended} tyres and top up fuel because grip and fuel margin are deteriorating.",
        "tyre": recommended,
    })

    for delay in range(1, min(4, laps_remaining) + 1):
        temp = copy.deepcopy(base)
        for _ in range(delay):
            temp["fuel_remaining"] = max(0.0, temp["fuel_remaining"] - temp["fuel_consumption"])
            temp["tyre_wear"] = min(100.0, temp["tyre_wear"] + temp["tyre_degradation"])
        temp["pit_duration"] = base["pit_duration"]
        temp["fuel_remaining"] = temp["fuel_capacity"] * 0.92
        temp["tyre_type"] = recommended
        temp["tyre_wear"] = 0.0
        delayed_total = delay * compute_lap_time(RaceCar(**{**base, "id": car.id, "driver_name": car.driver_name, "fuel_remaining": base["fuel_remaining"], "tyre_type": base["tyre_type"], "tyre_wear": base["tyre_wear"]}), weather)
        delayed_total += temp["pit_duration"] + estimate_remaining_for_car(temp, max(1, laps_remaining - delay), weather, None)
        options.append({
            "decision": f"pit_after_{delay}",
            "estimated_total": delayed_total,
            "reason": f"Keep the existing tyre for {delay} laps, then stop to restore grip and fuel resilience.",
            "tyre": recommended,
        })

    best = min(options, key=lambda option: option["estimated_total"])
    return best


def estimate_remaining_for_car(car: Dict[str, Any], laps_remaining: int, weather: Dict[str, Any], tyre_override: Optional[str] = None) -> float:
    total = 0.0
    temp = copy.deepcopy(car)
    if tyre_override:
        temp["tyre_type"] = tyre_override
        temp["tyre_wear"] = 0.0
    for _ in range(laps_remaining):
        if temp["fuel_remaining"] <= 0:
            break
        total += compute_lap_time(RaceCar(
            id="temp",
            driver_name="temp",
            fuel_capacity=temp["fuel_capacity"],
            fuel_remaining=temp["fuel_remaining"],
            fuel_consumption=temp["fuel_consumption"],
            tyre_type=temp["tyre_type"],
            tyre_wear=temp["tyre_wear"],
            tyre_degradation=temp["tyre_degradation"],
            base_lap_time=temp["base_lap_time"],
            pit_duration=temp["pit_duration"],
        ), weather)
        temp["fuel_remaining"] = max(0.0, temp["fuel_remaining"] - temp["fuel_consumption"])
        temp["tyre_wear"] = min(100.0, temp["tyre_wear"] + temp["tyre_degradation"])
    return total


def get_strategy_recommendation(car: RaceCar, race: RaceState) -> Dict[str, Any]:
    return determine_best_strategy(car, race)


def create_race(config: Dict[str, Any]) -> RaceState:
    laps = int(config.get("laps", 40))
    pit_boxes = int(config.get("pit_boxes", 3))
    count = int(config.get("car_count", config.get("cars", 5)))
    race_id = uuid.uuid4().hex
    state = RaceState(
        race_id=race_id,
        laps=laps,
        pit_boxes=pit_boxes,
        weather_state={"condition": "dry", "grip": 1.0, "rain_penalty": 0.0, "temperature": 30.0},
        cars=build_default_cars(count),
        events=[
            {"lap": 8, "condition": "mixed", "grip": 0.94, "rain_penalty": 0.04, "temperature": 24.0, "description": "Light cloud cover cools track temperatures."},
            {"lap": 15, "condition": "rain", "grip": 0.86, "rain_penalty": 0.12, "temperature": 18.0, "description": "Rain arrives and grip drops for the rest of the stint."},
        ],
        status="ready",
    )
    return state


def trigger_weather_event(race: RaceState, event: Dict[str, Any]) -> Dict[str, Any]:
    event_lap = int(event.get("lap", race.current_lap + 1))
    race.events.append({
        "lap": event_lap,
        "condition": event.get("condition", "rain"),
        "grip": float(event.get("grip", 0.85)),
        "rain_penalty": float(event.get("rain_penalty", 0.09)),
        "temperature": float(event.get("temperature", 20.0)),
        "description": event.get("description", "Weather condition has changed."),
    })
    race.weather_state = {
        "condition": event.get("condition", "rain"),
        "grip": float(event.get("grip", 0.85)),
        "rain_penalty": float(event.get("rain_penalty", 0.09)),
        "temperature": float(event.get("temperature", 20.0)),
    }
    for car in race.cars:
        car.strategy = determine_best_strategy(car, race)["decision"]
    return {"message": "Weather event applied", "weather_state": race.weather_state}


def advance_lap(race: RaceState) -> Dict[str, Any]:
    if race.status == "paused":
        race.status = "running"
    if race.completed:
        return {"message": "Race already completed.", "race": race.to_dict()}

    race.current_lap += 1
    weather = get_weather_for_lap(race.current_lap, race.events)
    race.weather_state = weather
    for car in race.cars:
        lap_time = compute_lap_time(car, weather)
        car.total_race_time += lap_time
        car.fuel_remaining = max(0.0, car.fuel_remaining - car.fuel_consumption)
        car.tyre_wear = min(100.0, car.tyre_wear + car.tyre_degradation)
        if car.fuel_remaining < 5.0:
            car.strategy = "refuel immediately"
        else:
            recommendation = determine_best_strategy(car, race)
            car.strategy = recommendation["decision"]
            if recommendation["decision"] == "pit_now":
                apply_pit_stop(car, recommendation["tyre"], recommendation["reason"])
                race.pit_schedule.append({"race_id": race.race_id, "car_id": car.id, "lap": race.current_lap, "tyre": recommendation["tyre"], "reason": recommendation["reason"]})
        if race.current_lap >= race.laps:
            race.completed = True
            race.status = "finished"
            for idx, car in enumerate(sorted(race.cars, key=lambda item: item.total_race_time), start=1):
                car.final_position = idx
    race.strategy_summary = [
        {
            "car_id": car.id,
            "driver_name": car.driver_name,
            "strategy": determine_best_strategy(car, race)["decision"],
            "reason": determine_best_strategy(car, race)["reason"],
            "tyre": determine_best_strategy(car, race)["tyre"],
            "estimated_total": determine_best_strategy(car, race)["estimated_total"],
        }
        for car in race.cars
    ]
    return {"message": "Lap advanced", "race": race.to_dict()}


def compare_strategies(race: RaceState) -> Dict[str, Any]:
    fixed = {"name": "Fixed pit-stop", "time": round(race.laps * 88.5 + 3 * 25, 2)}
    one_stop = {"name": "One-stop", "time": round(race.laps * 87.0 + 25, 2)}
    two_stop = {"name": "Two-stop", "time": round(race.laps * 86.5 + 2 * 25, 2)}
    dynamic = {"name": "Dynamic optimisation", "time": round(sum(car.total_race_time for car in race.cars) / max(1, len(race.cars)), 2)}
    return {"strategies": [fixed, one_stop, two_stop, dynamic], "winner": min([fixed, one_stop, two_stop, dynamic], key=lambda item: item["time"])}
