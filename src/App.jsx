import { useState } from 'react';
import axios from 'axios';
import moment from 'moment';
import './App.css';

function App() {
  const [startCity, setStartCity] = useState('');
  const [destCity, setDestCity] = useState('');
  const [date, setDate] = useState('2025-04-15');
  const [columns, setColumns] = useState([{ airport: null, flights: [] }]);

  const handleStartCitySubmit = () => {
    // Placeholder until DB works
    setColumns([{ airport: startCity, flights: [] }]);
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
        <button onClick={handleStartCitySubmit}>Start Planning</button>
      </div>
      <div className="columns">
        {columns.map((col, i) => (
          <div key={i} className="column">
            <h3>{col.airport || 'Select Airport'}</h3>
            <p>Flights loading...</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
