export async function onRequest(context) {
  try {
    if (!context.env.DB) {
      return new Response(JSON.stringify({ error: 'D1 database binding not found' }), { status: 500 });
    }

    await context.env.DB.exec(CREATE TABLE IF NOT EXISTS flights (id INTEGER PRIMARY KEY));

    return new Response(JSON.stringify({ message: 'Minimal table setup complete' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Setup failed - more specifically has not changed', details: error.message }), { status: 500 });
  }
}
