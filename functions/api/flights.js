export async function onRequestGet(context) {
  try {
    const { searchParams } = new URL(context.request.url);
    const start = searchParams.get('start');
    const dest = searchParams.get('dest');
    const date = searchParams.get('date');
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

    // Check cache (48h)
    const cacheKey = `${start}${dest}_${date}`;
    const cached = await context.env.DB.prepare(
      `SELECT data FROM flights WHERE key LIKE ? AND timestamp > ?`
    )
      .bind(`${cacheKey}%`, Date.now() - 48 * 60 * 60 * 1000)
      .all();
    if (cached.results.length > 0) {
      return new Response(
        JSON.stringify({ flights: cached.results.map(r => JSON.parse(r.data)), source: 'cache' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Query AviationStack
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${start}&arr_iata=${dest}&flight_date=${date}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'flightplanner/1.0' }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AviationStack error: ${response.status} ${response.statusText} - ${text}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`AviationStack: ${data.error.message || 'Unknown error'}`);
    }

    if (!data.data || data.data.length === 0) {
      return new Response(
        JSON.stringify({ flights: [], source: 'api' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Store flights
    const flights = data.data
      .filter(flight => flight.flight && flight.flight.iata && flight.departure && flight.arrival)
      .map(flight => ({
        key: `${flight.flight.iata}_${flight.flight_date}`,
        data: JSON.stringify({
          flight_number: flight.flight.iata,
          departure: flight.departure.iata,
          arrival: flight.arrival.iata,
          departure_time: flight.departure.scheduled || '',
          arrival_time: flight.arrival.scheduled || ''
        }),
        timestamp: Date.now()
      }));

    for (const flight of flights) {
      try {
        await context.env.DB.prepare(
          `INSERT OR IGNORE INTO flights (key, data, timestamp) VALUES (?, ?, ?)`
        )
          .bind(flight.key, flight.data, flight.timestamp)
          .run();
        await context.env.DB.prepare(
          `INSERT OR IGNORE INTO flight_seats (flight_key, seats_available, updated_at) VALUES (?, ?, ?)`
        )
          .bind(flight.key, Math.floor(Math.random() * 10), Date.now())
          .run();
      } catch (dbError) {
        console.error(`DB error for ${flight.key}: ${dbError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ flights: flights.map(f => JSON.parse(f.data)), source: 'api' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Flight fetch failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
