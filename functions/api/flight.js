export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const city = url.searchParams.get('city');
  const date = url.searchParams.get('date');
  
  if (!city || !date) {
    return new Response('Missing city or date', { status: 400 });
  }
  
  const cacheKey = `${city}_${date}`;
  
  // Check cache
  let flights = null;
  const cached = await env.DB.prepare(`
    SELECT data FROM flights
    WHERE key = ? AND timestamp > ?
  `).bind(cacheKey, Date.now() - 24 * 60 * 60 * 1000).first();
  
  if (cached) {
    flights = JSON.parse(cached.data);
  } else {
    // Fetch from AviationStack
    const apiKey = env.AVIATIONSTACK_KEY;
    const response = await fetch(
      `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${city}&flight_date=${date}`
    );
    flights = await response.json();
    
    if (flights.error) {
      return new Response(JSON.stringify(flights.error), { status: 500 });
    }
    
    // Store in cache
    await env.DB.prepare(`
      INSERT INTO flights (key, data, timestamp)
      VALUES (?, ?, ?)
    `).bind(cacheKey, JSON.stringify(flights), Date.now()).run();
  }
  
  // Fetch seat data
  const flightData = flights.data || [];
  const flightKeys = flightData.map(f => 
    `${f.departure.iata}_${f.arrival.iata}_${date}_${f.flight.iata}`
  );
  
  const seats = flightKeys.length > 0 ? await env.DB.prepare(`
    SELECT flight_key, seats_available, updated_at
    FROM flight_seats
    WHERE flight_key IN (${flightKeys.map(() => '?').join(',')})
  `).bind(...flightKeys).all() : { results: [] };
  
  // Merge seat data
  const enrichedFlights = flightData.map(flight => {
    const key = `${flight.departure.iata}_${flight.arrival.iata}_${date}_${flight.flight.iata}`;
    const seatInfo = seats.results.find(s => s.flight_key === key);
    return {
      ...flight,
      seats_available: seatInfo ? seatInfo.seats_available : null,
      seats_updated_at: seatInfo ? seatInfo.updated_at : null,
    };
  });
  
  return new Response(JSON.stringify({ data: enrichedFlights }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
