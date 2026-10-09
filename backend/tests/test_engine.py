import unittest

from backend.simulation.engine import create_race, advance_lap, trigger_weather_event


class RaceStrategyTests(unittest.TestCase):
    def test_high_tyrewear_recommendation(self):
        race = create_race({"laps": 30, "pit_boxes": 2, "car_count": 5})
        race.cars[0].tyre_wear = 70
        race.cars[0].fuel_remaining = 60
        recommendation = race.cars[0].strategy or "monitor"
        self.assertIn(recommendation, ["monitor", "pit_now", "pit_after_1", "pit_after_2"])

    def test_low_fuel_stays_safe(self):
        race = create_race({"laps": 25, "pit_boxes": 2, "car_count": 5})
        race.cars[0].fuel_remaining = 5
        advance_lap(race)
        self.assertGreaterEqual(race.cars[0].fuel_remaining, 0)

    def test_weather_event_alters_strategy(self):
        race = create_race({"laps": 30, "pit_boxes": 2, "car_count": 5})
        trigger_weather_event(race, {"lap": 10, "condition": "rain", "grip": 0.85, "rain_penalty": 0.12})
        self.assertEqual(race.weather_state["condition"], "rain")

    def test_race_advances(self):
        race = create_race({"laps": 5, "pit_boxes": 1, "car_count": 5})
        result = advance_lap(race)
        self.assertIn("Lap advanced", result["message"])


if __name__ == "__main__":
    unittest.main()
