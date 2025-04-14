export async function onRequestGet(context) {
  try {
    const { start, dest, date } = context.request.url.searchParams;
    if (!start || !dest || !date) {
      return new Response(
        JSON.stringify({ error: 'Missing start, dest, or date' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = context.env.AVIATIONSTACK_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Query AviationStack
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${start}&arr_iata=${dest}&flight_date=${date}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return new Response(
        JSON.stringify({ flights: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Store flights
    const flights = data.data.map(flight => ({
      key: `${flight.flight.iata}_${flight.flight_date}`,
      data: JSON.stringify({
        flight_number: flight.flight.iata,
        departure: flight.departure.iata,
        arrival: flight.arrival.iata,
        departure_time: flight.departure.scheduled,
        arrival_time: flight.arrival.scheduled
      }),
      timestamp: Date.now()
    }));

    for (const flight of flights) {
      await context.env.DB.prepare(
        `INSERT OR REPLACE INTO flights (key, data, timestamp) VALUES (?, ?, ?)`
      )
        .bind(flight.key, flight.data, flight.timestamp)
        .run();

      // Mock seats (replace with real data later)
      await context.env.DB.prepare(
        `INSERT OR REPLACE INTO flight_seats (flight_key, seats_available, updated_at) VALUES (?, ?, ?)`
      )
        .bind(flight.key, Math.floor(Math.random() * 10), Date.now())
        .run();
    }

    return new Response(
      JSON.stringify({ flights: flights.map(f => JSON.parse(f.data)) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Flight fetch failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
