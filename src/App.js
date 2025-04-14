import { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import './App.css';

function App() {
  const [startCity, setStartCity] = useState('');
  const [destCity, setDestCity] = useState('');
  const [date, setDate] = useState('2025-04-15');
  const [columns, setColumns] = useState([{ airport: null, flights: [] }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStartCitySubmit = async () => {
    if (!startCity || !destCity || !date) {
      setError('Please fill all fields');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get('/api/flights', {
        params: { start: startCity, dest: destCity, date }
      });
      setColumns([{ airport: startCity, flights: response.data.flights }]);
    } catch (err) {
      setError('Failed to fetch flights: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Non-Rev Flight Planner</h1>
      <div className="inputs">
        <input
          placeholder="Start City (e.g., JFK)"
          value={startCity}
          onChange={(e) => setStartCity(e.target.value.toUpperCase())}
        />
        <input
          placeholder="Destination City (e.g., LAX)"
          value={destCity}
          onChange={(e) => setDestCity(e.target.value.toUpperCase())}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button onClick={handleStartCitySubmit} disabled={loading}>
          {loading ? 'Loading...' : 'Start Planning'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="columns">
        {columns.map((col, i) => (
          <div key={i} className="column">
            <h3>{col.airport || 'Select Airport'}</h3>
            {col.flights.length > 0 ? (
              <ul>
                {col.flights.map((flight, j) => (
                  <li key={j}>
                    {flight.flight_number}: {flight.departure} → {flight.arrival}{' '}
                    ({moment(flight.departure_time).format('MMM D, HH:mm')})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No flights found</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
