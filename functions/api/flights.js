// functions/api/flights.js
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_KEY = process.env.AVIATIONSTACK_API_KEY || 'YOUR_API_KEY'; // Use .env or replace
const BASE_URL = 'http://api.aviationstack.com/v1/flights';
const CACHE_FILE = path.join(__dirname, 'flights_cache.json');
const MAX_PAGES = 10; // Test up to 1,000 flights (10 x 100)
const LIMIT = 100; // Basic plan max

// Helper to fetch flights
async function fetchFlights(params, pageNum) {
  try {
    const query = new URLSearchParams({
      access_key: API_KEY,
      ...params,
    }).toString();
    const response = await fetch(`${BASE_URL}?${query}`, {
      headers: { 'User-Agent': 'NonRevPlanner/1.0' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    console.log(`Page ${pageNum}: Retrieved ${data.pagination.count} flights (total: ${data.pagination.total})`);
    return data;
  } catch (error) {
    console.error(`API Error (Page ${pageNum}):`, error.message);
    return null;
  }
}

// Helper to cache results
async function cacheFlights(data) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log('Cached flights to', CACHE_FILE);
  } catch (error) {
    console.error('Cache Error:', error.message);
  }
}

// Helper to read cache
async function readCachedFlights() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

// Main function to get flights
async function getFlights(req, res) {
  try {
    // Base parameters for all JFK departures
    const baseParams = {
      dep_iata: 'JFK',
      flight_date: '2025-04-15',
      limit: LIMIT,
    };

    let allFlights = [];
    let totalApiCalls = 0;
    let totalReported = 0;

    // Paginate up to MAX_PAGES
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * LIMIT;
      console.log(`Fetching page ${page + 1} (offset=${offset})...`);
      const params = { ...baseParams, offset };
      const data = await fetchFlights(params, page + 1);
      totalApiCalls++;

      if (!data || !data.data) {
        console.warn(`No data for page ${page + 1}`);
        break;
      }

      allFlights = [...allFlights, ...data.data];
      totalReported = data.pagination.total;

      // Stop if no more flights or total reached
      if (data.data.length < LIMIT || allFlights.length >= totalReported) {
        console.log('Reached end of flights or total');
        break;
      }
    }

    if (allFlights.length === 0) {
      // Fallback to cache
      const cached = await readCachedFlights();
      if (cached && cached.data) {
        console.log('Serving cached flights');
        allFlights = cached.data;
        totalReported = cached.pagination.total;
      } else {
        throw new Error('No flights retrieved and no cache available');
      }
    }

    // Cache combined results
    const cachedData = {
      data: allFlights,
      pagination: { count: allFlights.length, total: totalReported },
    };
    await cacheFlights(cachedData);

    return processFlights(cachedData, res, totalApiCalls);
  } catch (error) {
    console.error('Error in getFlights:', error.message);
    res.status(500).json({
      error: 'Failed to fetch flights',
      message: error.message,
      suggestion: 'Check API quota, try a closer date (e.g., 2025-04-16), or contact AviationStack support.',
    });
  }
}

// Process and format flights
function processFlights(data, res, apiCalls) {
  if (!data || !data.data) {
    return res.status(400).json({ error: 'Invalid API response' });
  }

  // Deduplicate by flight number and date
  const seen = new Set();
  const flights = data.data
    .filter(flight => {
      const key = `${flight.flight.iata}-${flight.flight_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(flight => ({
      id: `${flight.flight.iata}-${flight.flight_date}`, // DB unique key
      airline: flight.airline.name,
      flight_number: flight.flight.iata || flight.flight.number,
      departure: {
        airport: flight.departure.airport,
        iata: flight.departure.iata,
        scheduled: flight.departure.scheduled,
        terminal: flight.departure.terminal || null,
        gate: flight.departure.gate || null,
      },
      arrival: {
        airport: flight.arrival.airport,
        iata: flight.arrival.iata,
        scheduled: flight.arrival.scheduled,
      },
      status: flight.flight_status,
      aircraft: flight.aircraft?.model || null,
      flight_date: flight.flight_date,
      updated_at: new Date().toISOString(), // DB timestamp
    }))
    .sort((a, b) => a.departure.scheduled.localeCompare(b.departure.scheduled));

  // Count JFK → LAX flights for debugging
  const laxFlights = flights.filter(f => f.arrival.iata === 'LAX');

  res.json({
    flights,
    total_flights: flights.length,
    api_calls_used: apiCalls,
    lax_flights: laxFlights.length, // Track JFK → LAX count
    pagination: {
      count: flights.length,
      total: data.pagination.total,
    },
    note: data.pagination.total > flights.length
      ? `More flights may exist. Try offset=${flights.length}.`
      : 'All available flights retrieved.',
  });
}

// Export for serverless
module.exports = {
  handler: async (event, context) => {
    const req = {
      query: event.queryStringParameters || {},
      method: event.httpMethod,
    };
    const res = {
      status: (code) => ({
        json: (data) => ({ statusCode: code, body: JSON.stringify(data) }),
      }),
      json: (data) => ({ statusCode: 200, body: JSON.stringify(data) }),
    };
    return await getFlights(req, res);
  },
};
