export async function onRequestPost({ request, env }) {
  const { flight_key, seats_available } = await request.json();
  
  if (!flight_key || !Number.isInteger(seats_available) || seats_available < 0) {
    return new Response('Invalid input', { status: 400 });
  }
  
  const updated_at = Date.now();
  
  // Upsert seat data
  await env.DB.prepare(`
    INSERT INTO flight_seats (flight_key, seats_available, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(flight_key) DO UPDATE SET
      seats_available = excluded.seats_available,
      updated_at = excluded.updated_at
  `).bind(flight_key, seats_available, updated_at).run();
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
