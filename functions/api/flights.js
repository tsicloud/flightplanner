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

    // Check cache (72h)
    const cacheKey = `${start}${dest}_${date}`;
    const cached = await context.env.DB.prepare(
      `SELECT data FROM flights WHERE key LIKE ? AND timestamp > ?`
    )
      .bind(`${cacheKey}%`, Date.now() - 72 * 60 * 60 * 1000)
      .all();
    if (cached.results.length > 0) {
      return new Response(
        JSON.stringify({ flights: cached.results.map(r => JSON.parse(r.data)), source: 'cache' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Query AviationStack
    let allFlights = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${start}&arr_iata=${dest}&flight_date=${date}&offset=${offset}&limit=${limit}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'flightplanner/1.0' }
      });
      const status = `${response.status} ${response.statusText}`;
      if (!response.ok) {
        let details = await response.text();
        try {
          const json = JSON.parse(details);
          details = json.error?.message || JSON.stringify(json);
        } catch (e) {
          details = `Non-JSON response: ${details}`;
        }
        throw new Error(`AviationStack error: ${status} - ${details}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(`AviationStack: ${data.error.message || JSON.stringify(data.error)}`);
      }

      console.log('AviationStack raw response:', JSON.stringify({ pagination: data.pagination, flight_count: data.data?.length || 0 }));

      if (!data.data || data.data.length === 0) {
        break;
      }

      allFlights.push(...data.data);
      offset += limit;
      if (offset >= data.pagination.total) {
        break;
      }
    }

    if (allFlights.length === 0) {
      return new Response(
        JSON.stringify({ flights: [], source: 'api', note: 'No flights returned by AviationStack' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Store flights
    const flights = allFlights
      .filter(flight => flight.departure?.iata === start && flight.arrival?.iata === dest)
      .map(flight => ({
        key: `${flight.flight?.iata || 'UNKNOWN'}_${flight.flight_date}`,
        data: JSON.stringify({
          flight_number: flight.flight?.iata || 'UNKNOWN',
          departure: flight.departure?.iata || start,
          arrival: flight.arrival?.iata || dest,
          departure_time: flight.departure?.scheduled || '',
          arrival_time: flight.arrival?.scheduled || '',
          departure_timezone: flight.departure?.timezone || 'UTC'
        }),
        timestamp: Date.now()
      }));

    console.log('Processed flights:', JSON.stringify({ flight_count: flights.length, flights }));

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
    console.error('Error in flights:', error.message);
    return new Response(
      JSON.stringify({ error: 'Flight fetch failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
