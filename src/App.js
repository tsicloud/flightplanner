import React, { useState } from 'react';
import axios from 'axios';
import moment from 'moment';
import './App.css';

function App() {
  const [startCity, setStartCity] = useState('');
  const [destCity, setDestCity] = useState('');
  const [date, setDate] = useState('2025-04-15');
  const [columns, setColumns] = useState([{ airport: null, flights: [] }]);

  const fetchFlights = async (airport, date) => {
    try {
      const res = await axios.get(`/api/flights?city=${airport}&date=${date}`);
      return res.data.data || [];
    } catch (error) {
      console.error('Error fetching flights:', error);
      return [];
    }
  };

  const saveSeats = async (flight_key, seats_available) => {
    try {
      await axios.post('/api/seats', { flight_key, seats_available });
    } catch (error) {
      console.error('Error saving seats:', error);
    }
  };

  const addColumn = async (index, airport) => {
    const flights = await fetchFlights(airport, date);
    const newColumns = [...columns];
    newColumns[index].airport = airport;
    newColumns[index].flights = flights.sort((a, b) => 
      (b.seats_available || 0) - (a.seats_available || 0)
    );
    if (airport !== destCity) {
      newColumns.push({ airport: null, flights: [] });
    }
    setColumns(newColumns);
  };

  const updateSeats = async (columnIndex, flightIndex, seats) => {
    const flight = columns[columnIndex].flights[flightIndex];
    const flight_key = `${flight.departure.iata}_${flight.arrival.iata}_${date}_${flight.flight.iata}`;
    await saveSeats(flight_key, parseInt(seats));
    const updatedFlights = await fetchFlights(columns[columnIndex].airport, date);
    const newColumns = [...columns];
    newColumns[columnIndex].flights = updatedFlights.sort((a, b) => 
      (b.seats_available || 0) - (a.seats_available || 0)
    );
    setColumns(newColumns);
  };

  const handleStartCitySubmit = async () => {
    if (startCity) {
      await addColumn(0, startCity);
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
        <button onClick={handleStartCitySubmit}>Start Planning</button>
      </div>
      <div className="columns">
        {columns.map((col, colIndex) => (
          <div key={colIndex} className="column">
            <h3>{col.airport || 'Select Airport'}</h3>
            {col.flights.length > 0 ? (
              col.flights.map((flight, flightIndex) => (
                <div key={flight.flight.iata} className="flight">
                  <div>
                    {flight.airline.name} {flight.flight.iata} to {flight.arrival.iata}
                    {flight.seats_available !== null && (
                      <span>
                        {' | '} {flight.seats_available} seats
                        {Date.now() - flight.seats_updated_at > 24 * 60 * 60 * 1000 ? ' (outdated)' : ''}
                        {' (updated '}
                        {moment(flight.seats_updated_at).format('MMM D, YYYY, h:mm A')})
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Seats"
                    onBlur={(e) => e.target.value && updateSeats(colIndex, flightIndex, e.target.value)}
                    className="seat-input"
                  />
                  <button
                    onClick={() => addColumn(colIndex + 1, flight.arrival.iata)}
                    disabled={colIndex === columns.length - 1 && flight.arrival.iata === destCity}
                  >
                    Connect
                  </button>
                </div>
              ))
            ) : (
              <p>No flights loaded.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
