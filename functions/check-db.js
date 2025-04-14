export async function onRequest(context) {
  try {
    const tables = await context.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table'`
    ).all();
    return new Response(
      JSON.stringify({ tables: tables.results.map(row => row.name) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Query failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
