from __future__ import annotations

from typing import Dict, List, Any


TYRE_TYPES = {
    "soft": {"grip": 1.18, "wear_rate": 1.35, "name": "Soft"},
    "medium": {"grip": 1.0, "wear_rate": 1.0, "name": "Medium"},
    "hard": {"grip": 0.9, "wear_rate": 0.7, "name": "Hard"},
    "wet": {"grip": 1.14, "wear_rate": 1.08, "name": "Wet"},
    "intermediate": {"grip": 1.08, "wear_rate": 0.9, "name": "Intermediate"},
}


def get_recommended_tyre(condition: str) -> str:
    if condition in {"rain", "wet"}:
        return "wet"
    if condition in {"mixed", "storm"}:
        return "intermediate"
    return "medium"


def estimate_lap_time(car: Dict[str, Any], weather: Dict[str, Any]) -> float:
    tyre = TYRE_TYPES[car["tyre_type"]]
    track_grip = weather.get("grip", 1.0)
    wear_factor = 1 + (car["tyre_wear"] / 100.0) * 0.22
    fuel_factor = 1 + max(0.0, (car["fuel_capacity"] - car["fuel_remaining"]) / car["fuel_capacity"]) * 0.12
    wet_penalty = weather.get("rain_penalty", 0.0)
    tyre_match_penalty = 0.0
    if weather.get("condition") in {"rain", "wet"} and car["tyre_type"] in {"hard", "medium", "soft"}:
        tyre_match_penalty = 0.08
    if weather.get("condition") == "dry" and car["tyre_type"] in {"wet", "intermediate"}:
        tyre_match_penalty = 0.06
    lap_time = car["base_lap_time"] * wear_factor * fuel_factor * (1 + wet_penalty + tyre_match_penalty) / (tyre["grip"] * track_grip)
    return round(max(72.0, lap_time), 2)


def evaluate_options_for_car(car: Dict[str, Any], race: Dict[str, Any], lap_number: int) -> Dict[str, Any]:
    options = []
    laps_left = max(1, race["laps"] - lap_number + 1)
    weather = race["weather_state"]

    continue_time = 0.0
    temp = dict(car)
    for _ in range(laps_left):
        continue_time += estimate_lap_time(temp, weather)
        temp["fuel_remaining"] = max(0.0, temp["fuel_remaining"] - temp["fuel_consumption"])
        temp["tyre_wear"] = min(100.0, temp["tyre_wear"] + temp["tyre_degradation"])
        if temp["fuel_remaining"] <= 0:
            continue_time += 25.0
            break
    options.append({
        "decision": "continue",
        "estimated_total": round(continue_time, 2),
        "reason": "Keep the current tyre and fuel state to avoid pit time.",
        "tyre": car["tyre_type"],
    })

    pit_choice = get_recommended_tyre(weather["condition"])
    pit_temp = dict(car)
    pit_temp["fuel_remaining"] = pit_temp["fuel_capacity"] * 0.92
    pit_temp["tyre_type"] = pit_choice
    pit_temp["tyre_wear"] = 0.0
    pit_total = pit_temp["pit_duration"]
    for _ in range(laps_left):
        pit_total += estimate_lap_time(pit_temp, weather)
        pit_temp["fuel_remaining"] = max(0.0, pit_temp["fuel_remaining"] - pit_temp["fuel_consumption"])
        pit_temp["tyre_wear"] = min(100.0, pit_temp["tyre_wear"] + pit_temp["tyre_degradation"])
        if pit_temp["fuel_remaining"] <= 0:
            pit_total += 18.0
            break
    options.append({
        "decision": "pit_now",
        "estimated_total": round(pit_total, 2),
        "reason": f"Switch to {pit_choice} tyres and refuel, reducing wear and restoring safety margin.",
        "tyre": pit_choice,
    })

    for delay in range(1, min(4, laps_left) + 1):
        temp = dict(car)
        projected = 0.0
        for _ in range(delay):
            projected += estimate_lap_time(temp, weather)
            temp["fuel_remaining"] = max(0.0, temp["fuel_remaining"] - temp["fuel_consumption"])
            temp["tyre_wear"] = min(100.0, temp["tyre_wear"] + temp["tyre_degradation"])
        projected += car["pit_duration"]
        forced_tyre = get_recommended_tyre(weather["condition"])
        temp["tyre_type"] = forced_tyre
        temp["fuel_remaining"] = temp["fuel_capacity"] * 0.92
        temp["tyre_wear"] = 0.0
        for _ in range(laps_left - delay):
            projected += estimate_lap_time(temp, weather)
            temp["fuel_remaining"] = max(0.0, temp["fuel_remaining"] - temp["fuel_consumption"])
            temp["tyre_wear"] = min(100.0, temp["tyre_wear"] + temp["tyre_degradation"])
            if temp["fuel_remaining"] <= 0:
                projected += 18.0
                break
        options.append({
            "decision": f"pit_after_{delay}",
            "estimated_total": round(projected, 2),
            "reason": f"Remain on track for {delay} laps, then pit to restore grip and fuel margin.",
            "tyre": forced_tyre,
        })

    best = min(options, key=lambda item: item["estimated_total"])
    return best
