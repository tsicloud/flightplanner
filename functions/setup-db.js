export async function onRequest(context) {
  try {
    if (!context.env.DB) {
      return new Response(
        JSON.stringify({ error: 'D1 binding missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const steps = [];

    // Step 1: Create flights table
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS flights (
        key TEXT PRIMARY KEY,
        data TEXT,
        timestamp INTEGER
      )
    `).run();
    steps.push('flights table created');

    // Step 2: Create flight_seats table
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS flight_seats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_key TEXT NOT NULL UNIQUE,
        seats_available INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    steps.push('flight_seats table created');

    // Step 3: Create indexes
    await context.env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON flights(timestamp)
    `).run();
    steps.push('flights index created');

    await context.env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_flight_key ON flight_seats(flight_key)
    `).run();
    steps.push('flight_seats flight_key index created');

    await context.env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_updated_at ON flight_seats(updated_at)
    `).run();
    steps.push('flight_seats updated_at index created');

    return new Response(
      JSON.stringify({ message: 'Database setup complete', steps }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Setup failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
