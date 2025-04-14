await context.env.DB.exec(`
  CREATE TABLE IF NOT EXISTS flights (
    key TEXT PRIMARY KEY,
    data TEXT,
    timestamp INTEGER
  );
`);
