import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:5000'

export default function App() {
  const [race, setRace] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function createRace() {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/races`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { laps: 40, pit_boxes: 3, car_count: 5 } }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create race')
      setRace(data.race)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshRace(id = race?.race_id) {
    if (!id) return
    try {
      const response = await fetch(`${API_BASE}/api/races/${id}`)
      const data = await response.json()
      setRace(data.race)
    } catch (err) {
      setError(err.message)
    }
  }

  async function advanceLap() {
    if (!race?.race_id) return
    const response = await fetch(`${API_BASE}/api/races/${race.race_id}/advance`, { method: 'POST' })
    const data = await response.json()
    setRace(data.race)
  }

  async function triggerWeather() {
    if (!race?.race_id) return
    const response = await fetch(`${API_BASE}/api/races/${race.race_id}/weather`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lap: race.current_lap + 5, condition: 'rain', grip: 0.82, rain_penalty: 0.13 }),
    })
    const data = await response.json()
    setRace({ ...race, weather_state: data.weather_state })
  }

  async function pauseResume(action) {
    if (!race?.race_id) return
    const response = await fetch(`${API_BASE}/api/races/${race.race_id}/${action}`, { method: 'POST' })
    const data = await response.json()
    setRace(data.race)
  }

  useEffect(() => {
    createRace()
  }, [])

  if (loading) return <div className="loader">Loading race strategist…</div>

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <p className="eyebrow">Hackathon project</p>
          <h1>The Impossible Pit Stop – Race Strategist</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => createRace()}>Reset race</button>
          <button className="secondary" onClick={() => advanceLap()}>Advance lap</button>
          <button className="secondary" onClick={() => triggerWeather()}>Trigger rain</button>
          <button className="secondary" onClick={() => pauseResume(race?.status === 'paused' ? 'resume' : 'pause')}>{race?.status === 'paused' ? 'Resume' : 'Pause'}</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {race && (
        <>
          <section className="stats-grid">
            <div className="stat-card"><span>Lap</span><strong>{race.current_lap}/{race.laps}</strong></div>
            <div className="stat-card"><span>Weather</span><strong>{race.weather_state.condition}</strong></div>
            <div className="stat-card"><span>Pit boxes</span><strong>{race.pit_boxes}</strong></div>
            <div className="stat-card"><span>Status</span><strong>{race.status}</strong></div>
          </section>

          <section className="panel">
            <h2>Strategy recommendations</h2>
            <div className="car-grid">
              {race.cars.map((car) => (
                <article key={car.id} className="car-card">
                  <h3>{car.driver_name}</h3>
                  <p>Strategy: {car.strategy}</p>
                  <p>Fuel: {car.fuel_remaining.toFixed(1)} / {car.fuel_capacity}</p>
                  <p>Tyre: {car.tyre_type} ({car.tyre_wear.toFixed(1)}%)</p>
                  <p>Lap time: {car.base_lap_time.toFixed(1)} s</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Race positions</h2>
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Fuel</th>
                  <th>Tyre</th>
                  <th>Current lap</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {race.cars.map((car) => (
                  <tr key={car.id}>
                    <td>{car.driver_name}</td>
                    <td>{car.fuel_remaining.toFixed(1)}</td>
                    <td>{car.tyre_type}</td>
                    <td>{car.current_lap}</td>
                    <td>{car.total_race_time.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
