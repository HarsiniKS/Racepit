from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import math


TYRE_TYPES = {
    "soft": {"grip": 1.15, "wear": 1.4, "name": "Soft"},
    "medium": {"grip": 1.0, "wear": 1.0, "name": "Medium"},
    "hard": {"grip": 0.88, "wear": 0.7, "name": "Hard"},
    "intermediate": {"grip": 1.08, "wear": 0.9, "name": "Intermediate"},
    "wet": {"grip": 1.2, "wear": 1.1, "name": "Wet"},
}


@dataclass
class Car:
    id: int
    name: str
    fuel_capacity: float
    fuel_consumption: float
    lap_time: float
    pit_duration: float
    fuel_remaining: float
    tyre_condition: float = 100.0
    tyre_degradation: float = 1.0
    tyre_type: str = "medium"
    starting_position: int = 1
    position: int = 1
    pit_count: int = 0
    total_race_time: float = 0.0
    laps_completed: int = 0
    strategy_log: List[str] = field(default_factory=list)
    recommended_pit_lap: Optional[int] = None
    recommended_tyre: Optional[str] = None
    race_status: str = "running"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "fuel_capacity": round(self.fuel_capacity, 2),
            "fuel_consumption": round(self.fuel_consumption, 2),
            "lap_time": round(self.lap_time, 2),
            "pit_duration": round(self.pit_duration, 2),
            "fuel_remaining": round(self.fuel_remaining, 2),
            "tyre_condition": round(self.tyre_condition, 1),
            "tyre_degradation": round(self.tyre_degradation, 2),
            "tyre_type": self.tyre_type,
            "position": self.position,
            "pit_count": self.pit_count,
            "total_race_time": round(self.total_race_time, 2),
            "laps_completed": self.laps_completed,
            "recommended_pit_lap": self.recommended_pit_lap,
            "recommended_tyre": self.recommended_tyre,
            "race_status": self.race_status,
        }


def generate_default_cars() -> List[Car]:
    return [
        Car(1, "Car 1", 120, 2.0, 88.0, 24.0, 120.0, starting_position=1),
        Car(2, "Car 2", 118, 2.1, 89.0, 22.0, 118.0, starting_position=2),
        Car(3, "Car 3", 122, 2.2, 90.0, 25.0, 122.0, starting_position=3),
        Car(4, "Car 4", 116, 1.9, 87.5, 23.5, 116.0, starting_position=4),
        Car(5, "Car 5", 124, 2.3, 92.0, 26.0, 124.0, starting_position=5),
        Car(6, "Car 6", 119, 2.05, 88.5, 24.5, 119.0, starting_position=6),
    ]


def get_weather_for_lap(lap_no: int, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    active = {"condition": "dry", "grip": 1.0, "temperature": 28.0, "rain_penalty": 0.0}
    for event in events:
        if lap_no >= int(event.get("lap", 0)):
            active["condition"] = event.get("condition", active["condition"])
            active["grip"] = float(event.get("grip", active["grip"]))
            active["temperature"] = float(event.get("temperature", active["temperature"]))
            active["rain_penalty"] = float(event.get("rain_penalty", active["rain_penalty"]))
    return active


def recommended_tyre_for_condition(condition: str) -> str:
    if condition in {"rain", "wet"}:
        return "wet"
    if condition in {"mixed", "storm"}:
        return "intermediate"
    return "medium"


def tyre_performance_factor(tyre_type: str, track_condition: Dict[str, Any]) -> float:
    tyre = TYRE_TYPES.get(tyre_type, TYRE_TYPES["medium"])
    condition = track_condition.get("condition", "dry")
    if condition in {"rain", "wet"} and tyre_type in {"wet", "intermediate"}:
        return 1.0
    if condition in {"rain", "wet"} and tyre_type == "medium":
        return 1.08
    if condition == "dry":
        return tyre["grip"]
    return max(0.92, tyre["grip"])


def calculate_lap_time(car: Car, weather: Dict[str, Any]) -> float:
    tyre = TYRE_TYPES.get(car.tyre_type, TYRE_TYPES["medium"])
    wear_penalty = (100.0 - car.tyre_condition) / 100.0
    fuel_penalty = max(0.0, (car.fuel_capacity - car.fuel_remaining) / car.fuel_capacity) * 0.22
    condition_factor = 1.0 + wear_penalty * 0.16 + fuel_penalty + max(0.0, weather.get("rain_penalty", 0.0))
    lap = car.lap_time * condition_factor / tyre_performance_factor(car.tyre_type, weather)
    return max(70.0, lap)


def pit_car(car: Car, tyre_choice: str, weather: Dict[str, Any]) -> None:
    car.pit_count += 1
    car.tyre_type = tyre_choice
    car.tyre_condition = 100.0
    car.fuel_remaining = car.fuel_capacity * 0.92
    car.strategy_log.append(f"Pit on lap {car.laps_completed + 1}: switched to {tyre_choice}")
    car.total_race_time += car.pit_duration


def decision_cost(car: Car, laps_left: int, lap_index: int, weather: Dict[str, Any]) -> Dict[str, Any]:
    if laps_left <= 0:
        return {"action": "finish", "forecast_time": 0.0, "reason": "Finish line reached"}

    tyre_choice = car.tyre_type
    projected_time = 0.0
    temp_car = Car(
        id=car.id,
        name=car.name,
        fuel_capacity=car.fuel_capacity,
        fuel_consumption=car.fuel_consumption,
        lap_time=car.lap_time,
        pit_duration=car.pit_duration,
        fuel_remaining=car.fuel_remaining,
        tyre_condition=car.tyre_condition,
        tyre_degradation=car.tyre_degradation,
        tyre_type=car.tyre_type,
        starting_position=car.starting_position,
        position=car.position,
        total_race_time=car.total_race_time,
    )

    for remaining in range(1, laps_left + 1):
        temp_weather = get_weather_for_lap(lap_index + remaining, [])
        if temp_weather["condition"] == "dry":
            temp_weather = weather
        lap_time = calculate_lap_time(temp_car, temp_weather)
        projected_time += lap_time
        temp_car.fuel_remaining = max(0.0, temp_car.fuel_remaining - temp_car.fuel_consumption)
        temp_car.tyre_condition = max(0.0, temp_car.tyre_condition - temp_car.tyre_degradation * (1.0 + temp_weather.get("rain_penalty", 0.0)))
        if temp_car.fuel_remaining <= 0:
            projected_time += 15.0
            break

    return {"action": "continue", "forecast_time": projected_time, "reason": "No stop"}


def calculate_strategy_options(car: Car, lap_number: int, total_laps: int, weather: Dict[str, Any], pit_boxes: int) -> List[Dict[str, Any]]:
    laps_left = max(1, total_laps - lap_number + 1)
    options: List[Dict[str, Any]] = []

    continue_option = decision_cost(car, laps_left, lap_number, weather)
    continue_option["action"] = "continue"
    continue_option["projected_total"] = continue_option["forecast_time"]
    continue_option["reason"] = "Keep current tyres and fuel load until the end of the race"
    options.append(continue_option)

    pit_choice = recommended_tyre_for_condition(weather["condition"])
    pit_now = {
        "action": "pit_now",
        "projected_total": car.pit_duration + decision_cost(Car(
            id=car.id,
            name=car.name,
            fuel_capacity=car.fuel_capacity,
            fuel_consumption=car.fuel_consumption,
            lap_time=car.lap_time,
            pit_duration=car.pit_duration,
            fuel_remaining=car.fuel_capacity * 0.92,
            tyre_condition=100.0,
            tyre_degradation=car.tyre_degradation,
            tyre_type=pit_choice,
            starting_position=car.starting_position,
            position=car.position,
            total_race_time=car.total_race_time,
        ), laps_left, lap_number, weather)["forecast_time"],
        "reason": f"Switch to {pit_choice} tyres and refuel for the remaining stint.",
    }
    options.append(pit_now)

    for delay in range(1, min(5, laps_left) + 1):
        future_car = Car(
            id=car.id,
            name=car.name,
            fuel_capacity=car.fuel_capacity,
            fuel_consumption=car.fuel_consumption,
            lap_time=car.lap_time,
            pit_duration=car.pit_duration,
            fuel_remaining=car.fuel_remaining,
            tyre_condition=car.tyre_condition,
            tyre_degradation=car.tyre_degradation,
            tyre_type=car.tyre_type,
            starting_position=car.starting_position,
            position=car.position,
            total_race_time=car.total_race_time,
        )
        projected = 0.0
        for i in range(1, delay + 1):
            projected += calculate_lap_time(future_car, weather)
            future_car.fuel_remaining = max(0.0, future_car.fuel_remaining - future_car.fuel_consumption)
            future_car.tyre_condition = max(0.0, future_car.tyre_condition - future_car.tyre_degradation * (1.0 + weather.get("rain_penalty", 0.0)))
        projected += car.pit_duration
        future_car.tyre_condition = 100.0
        future_car.fuel_remaining = future_car.fuel_capacity * 0.92
        future_car.tyre_type = recommended_tyre_for_condition(weather["condition"])
        projected += decision_cost(future_car, max(1, laps_left - delay), lap_number + delay, weather)["forecast_time"]
        options.append({
            "action": f"pit_after_{delay}",
            "projected_total": projected,
            "delay": delay,
            "reason": f"Remain on track for {delay} laps then pit for fresh tyres and fuel.",
        })

    return options


def determine_best_strategy(car: Car, lap_number: int, total_laps: int, weather: Dict[str, Any], pit_boxes: int) -> Dict[str, Any]:
    options = calculate_strategy_options(car, lap_number, total_laps, weather, pit_boxes)
    best = min(options, key=lambda item: item["projected_total"])
    best["recommended_tyre"] = recommended_tyre_for_condition(weather["condition"])
    return best


def apply_manual_event(events: List[Dict[str, Any]], lap: int, condition: str, grip: float, rain_penalty: float) -> None:
    event = {"lap": lap, "condition": condition, "grip": grip, "rain_penalty": rain_penalty, "temperature": 22.0}
    events.append(event)


def simulate_race(config: Dict[str, Any], events: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    if events is None:
        events = [
            {"lap": 8, "condition": "mixed", "grip": 0.92, "rain_penalty": 0.04, "temperature": 24.0},
            {"lap": 15, "condition": "rain", "grip": 0.84, "rain_penalty": 0.11, "temperature": 18.0},
        ]
    total_laps = int(config.get("laps", 50))
    pit_boxes = int(config.get("pit_boxes", 3))
    cars = []
    for index, car in enumerate(generate_default_cars()):
        car.fuel_remaining = car.fuel_capacity
        car.tyre_condition = 100.0
        car.tyre_type = "medium"
        car.total_race_time = 0.0
        car.strategy_log = []
        car.recommended_pit_lap = None
        car.recommended_tyre = None
        car.race_status = "running"
        cars.append(car)

    race_log: List[Dict[str, Any]] = []
    lap_weather_history: List[Dict[str, Any]] = []
    pit_requests: List[Dict[str, Any]] = []

    for lap_number in range(1, total_laps + 1):
        weather = get_weather_for_lap(lap_number, events)
        lap_weather_history.append({"lap": lap_number, "condition": weather["condition"], "grip": weather["grip"], "rain_penalty": weather["rain_penalty"]})

        for car in cars:
            if car.race_status == "finished":
                continue
            car.laps_completed = lap_number
            lap_time = calculate_lap_time(car, weather)
            car.total_race_time += lap_time
            car.fuel_remaining = max(0.0, car.fuel_remaining - car.fuel_consumption)
            car.tyre_condition = max(0.0, car.tyre_condition - car.tyre_degradation * (1.0 + weather.get("rain_penalty", 0.0)))
            if car.fuel_remaining <= 0.0:
                car.strategy_log.append(f"Fuel exhausted on lap {lap_number}")
                car.race_status = "finished"
                continue

            if car.tyre_condition < 18.0 and car.fuel_remaining < car.fuel_capacity * 0.25:
                pit_requests.append({"car": car, "lap": lap_number, "urgency": 3, "reason": "Low fuel and worn tyres"})
            elif car.tyre_condition < 27.0:
                pit_requests.append({"car": car, "lap": lap_number, "urgency": 2, "reason": "Tyre wear threshold"})
            else:
                best = determine_best_strategy(car, lap_number, total_laps, weather, pit_boxes)
                if best["action"] == "pit_now":
                    pit_requests.append({"car": car, "lap": lap_number, "urgency": 2, "reason": best["reason"]})
                elif best["action"].startswith("pit_after_"):
                    delay = int(best["action"].split("_")[-1])
                    if lap_number + delay <= total_laps:
                        pit_requests.append({"car": car, "lap": lap_number + delay, "urgency": 1, "reason": best["reason"]})

        pit_requests_sorted = sorted(pit_requests, key=lambda req: (req["urgency"], -req["car"].fuel_remaining), reverse=True)
        allocated = 0
        for req in pit_requests_sorted:
            if allocated >= pit_boxes:
                req["car"].strategy_log.append(f"Delayed pit because pit box availability was limited on lap {req['lap']}")
                continue
            car = req["car"]
            if req["lap"] == lap_number or req["lap"] <= lap_number:
                target_tyre = recommended_tyre_for_condition(weather["condition"])
                pit_car(car, target_tyre, weather)
                car.recommended_pit_lap = req["lap"]
                car.recommended_tyre = target_tyre
                car.strategy_log.append(f"Recommended strategy: {req['reason']}")
                allocated += 1

        pit_requests = []
        race_log.append({
            "lap": lap_number,
            "weather": weather["condition"],
            "leader": sorted(cars, key=lambda c: c.total_race_time)[0].name,
            "cars": [{
                "name": car.name,
                "fuel": round(car.fuel_remaining, 2),
                "tyre": car.tyre_condition,
                "time": round(car.total_race_time, 2),
            } for car in cars],
        })

    for car in cars:
        if car.race_status != "finished":
            car.race_status = "finished"

    ranked = sorted(cars, key=lambda c: c.total_race_time)
    final_positions = []
    for index, car in enumerate(ranked, start=1):
        car.position = index
        final_positions.append({
            "position": index,
            "name": car.name,
            "total_time": round(car.total_race_time, 2),
            "pit_count": car.pit_count,
            "tyre_type": car.tyre_type,
            "fuel_remaining": round(car.fuel_remaining, 2),
        })

    baseline_cars = []
    for car in generate_default_cars():
        car.fuel_remaining = car.fuel_capacity
        car.tyre_condition = 100.0
        car.tyre_type = "medium"
        car.total_race_time = 0.0
        car.pit_count = 0
        car.strategy_log = []
        baseline_cars.append(car)

    for lap_number in range(1, total_laps + 1):
        weather = get_weather_for_lap(lap_number, events)
        for car in baseline_cars:
            car.total_race_time += calculate_lap_time(car, weather)
            car.fuel_remaining = max(0.0, car.fuel_remaining - car.fuel_consumption)
            car.tyre_condition = max(0.0, car.tyre_condition - car.tyre_degradation * (1.0 + weather.get("rain_penalty", 0.0)))
            if lap_number % 12 == 0 or car.tyre_condition < 25.0 or car.fuel_remaining < car.fuel_capacity * 0.25:
                pit_car(car, recommended_tyre_for_condition(weather["condition"]), weather)

    baseline_ranked = sorted(baseline_cars, key=lambda c: c.total_race_time)
    baseline_summary = [{
        "name": car.name,
        "total_time": round(car.total_race_time, 2),
        "pit_count": car.pit_count,
    } for car in baseline_ranked]

    strategy_summary = []
    for car in ranked:
        best = determine_best_strategy(car, 1, total_laps, get_weather_for_lap(1, events), pit_boxes)
        strategy_summary.append({
            "car": car.name,
            "best_pit_lap": car.recommended_pit_lap or max(1, int(best["action"].split("_")[-1]) if best["action"].startswith("pit_after_") else 1),
            "recommended_tyre": car.recommended_tyre or recommended_tyre_for_condition(get_weather_for_lap(1, events)["condition"]),
            "projected_finish": round(car.total_race_time, 2),
            "explanation": best["reason"],
        })

    return {
        "config": {
            "laps": total_laps,
            "pit_boxes": pit_boxes,
        },
        "weather_history": lap_weather_history,
        "race_log": race_log,
        "final_positions": final_positions,
        "strategy_summary": strategy_summary,
        "cars": [car.to_dict() for car in ranked],
        "baseline_summary": baseline_summary,
        "comparison": {
            "baseline_total": round(sum(item["total_time"] for item in baseline_summary) / len(baseline_summary), 2),
            "intelligent_total": round(sum(item["total_time"] for item in final_positions) / len(final_positions), 2),
            "improvement": round((sum(item["total_time"] for item in baseline_summary) / len(baseline_summary)) - (sum(item["total_time"] for item in final_positions) / len(final_positions)), 2),
        },
    }
