export async function onRequest(context) {
  try {
    // Check binding
    if (!context.env.DB) {
      return new Response(
        JSON.stringify({ error: 'D1 database binding not found' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Run SQL with safe table creation
    await context.env.DB.exec(`
      CREATE TABLE IF NOT EXISTS flights (
        key TEXT PRIMARY KEY,
        data TEXT,
        timestamp INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON flights (timestamp);
      
      CREATE TABLE IF NOT EXISTS flight_seats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_key TEXT NOT NULL UNIQUE,
        seats_available INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flight_key ON flight_seats (flight_key);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON flight_seats (updated_at);
    `);

    return new Response(
      JSON.stringify({ message: 'Database setup complete' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Setup failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
