export async function onRequest({ env }) {
  await env.DB.exec(`
    CREATE TABLE flights (
      key TEXT PRIMARY KEY,
      data TEXT,
      timestamp INTEGER
    );
    CREATE INDEX idx_timestamp ON flights (timestamp);
    
    CREATE TABLE flight_seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_key TEXT NOT NULL,
      seats_available INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(flight_key)
    );
    CREATE INDEX idx_flight_key ON flight_seats (flight_key);
    CREATE INDEX idx_updated_at ON flight_seats (updated_at);
  `);
  return new Response('Database setup complete', { status: 200 });
}
