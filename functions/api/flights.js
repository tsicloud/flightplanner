// functions/api/flights.js
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_KEY = process.env.AVIATIONSTACK_API_KEY || 'YOUR_API_KEY'; // Replace with your key or use .env
const BASE_URL = 'http://api.aviationstack.com/v1/flights';
const CACHE_FILE = path.join(__dirname, 'flights_cache.json');

// Helper to fetch flights with pagination or higher limit
async function fetchFlights(params) {
  try {
    const query = new URLSearchParams({
      access_key: API_KEY,
      ...params,
    }).toString();
    const response = await fetch(`${BASE_URL}?${query}`, {
      headers: { 'User-Agent': 'NonRevPlanner/1.0' }, // Identify your app
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error.message);
    return null;
  }
}

// Helper to cache results to save API quota
async function cacheFlights(data) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log('Cached flights to', CACHE_FILE);
  } catch (error) {
    console.error('Cache Error:', error.message);
  }
}

// Helper to read cached flights
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
    // Base parameters for JFK departures
    const baseParams = {
      dep_iata: 'JFK',
      flight_date: '2025-04-15', // Your target date
    };

    // Option 1: Try higher limit (200)
    console.log('Attempting fetch with limit=200...');
    let params = { ...baseParams, limit: 200 };
    let data = await fetchFlights(params);

    // Check if limit=200 worked
    if (data && data.pagination && data.pagination.count > 100) {
      console.log(`Success: Retrieved ${data.pagination.count} flights (total: ${data.pagination.total})`);
      await cacheFlights(data);
      return processFlights(data, res);
    } else {
      console.warn('Limit=200 failed or same as 100, trying pagination...');
    }

    // Option 2: Paginate with offset=100
    params = { ...baseParams, limit: 100, offset: 100 };
    data = await fetchFlights(params);

    if (data && data.data && data.data.length > 0) {
      console.log(`Pagination success: Retrieved ${data.pagination.count} more flights`);
      // Combine with cached data if available
      const cached = await readCachedFlights();
      if (cached) {
        data.data = [...cached.data, ...data.data];
        data.pagination.total = Math.max(
          cached.pagination.total,
          data.pagination.offset + data.pagination.count
        );
      }
      await cacheFlights(data);
      return processFlights(data, res);
    } else {
      console.warn('Pagination returned no new flights');
      // Fallback to cached data or original 100
      data = await readCachedFlights() || await fetchFlights({ ...baseParams, limit: 100 });
      if (!data) {
        throw new Error('No flights retrieved and no cache available');
      }
    }

    return processFlights(data, res);
  } catch (error) {
    console.error('Error in getFlights:', error.message);
    res.status(500).json({
      error: 'Failed to fetch flights',
      message: error.message,
      suggestion: 'Check API key, quota, or try a closer date (e.g., tomorrow).',
    });
  }
}

// Process and format flights, prioritizing Delta/United for non-rev
function processFlights(data, res) {
  if (!data || !data.data) {
    return res.status(400).json({ error: 'Invalid API response' });
  }

  // Deduplicate flights by flight number and date
  const seen = new Set();
  const flights = data.data
    .filter(flight => {
      const key = `${flight.flight.iata}-${flight.flight_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(flight => ({
      airline: flight.airline.name,
      flight_number: flight.flight.iata || flight.flight.number,
      departure: {
        airport: flight.departure.airport,
        iata: flight.departure.iata,
        scheduled: flight.departure.scheduled,
        terminal: flight.departure.terminal || 'N/A',
      },
      arrival: {
        airport: flight.arrival.airport,
        iata: flight.arrival.iata,
        scheduled: flight.arrival.scheduled,
      },
      status: flight.flight_status,
      isDeltaOrUnited: ['Delta Air Lines', 'United Airlines'].includes(flight.airline.name),
    }))
    .sort((a, b) => a.departure.scheduled.localeCompare(b.departure.scheduled));

  // Separate Delta/United for non-rev priority
  const deltaUnited = flights.filter(f => f.isDeltaOrUnited);
  const others = flights.filter(f => !f.isDeltaOrUnited);

  res.json({
    flights: [...deltaUnited, ...others],
    total_flights: flights.length,
    pagination: data.pagination,
    note: data.pagination.total > flights.length
      ? 'More flights may exist. Try increasing limit or paginating.'
      : 'All available flights retrieved.',
  });
}

// Export for Netlify/Cloudflare Functions
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
