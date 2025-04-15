// src/index.js
const API_KEY = 'YOUR_API_KEY'; // Replace or use wrangler.toml secrets
const BASE_URL = 'http://api.aviationstack.com/v1/flights';
const MAX_PAGES = 10; // Up to 1,000 flights
const LIMIT = 100; // Basic plan max

// In-memory cache (resets per Worker instance; use KV for persistence)
let cache = null;

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

// Main function to get flights
async function getFlights() {
  try {
    // Base parameters
    const baseParams = {
      dep_iata: 'JFK',
      flight_date: '2025-04-15',
      limit: LIMIT,
    };

    // Use cache if available
    if (cache) {
      console.log('Serving cached flights');
      return processFlights(cache, 0);
    }

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
      throw new Error('No flights retrieved');
    }

    // Cache results
    cache = {
      data: allFlights,
      pagination: { count: allFlights.length, total: totalReported },
    };

    return processFlights(cache, totalApiCalls);
  } catch (error) {
    console.error('Error in getFlights:', error.message);
    return {
      error: 'Failed to fetch flights',
      message: error.message,
      suggestion: 'Check API quota, try a closer date (e.g., 2025-04-16), or contact AviationStack support.',
    };
  }
}

// Process and format flights
function processFlights(data, apiCalls) {
  if (!data || !data.data) {
    return { error: 'Invalid API response' };
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
      id: `${flight.flight.iata}-${flight.flight_date}`,
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
      updated_at: new Date().toISOString(),
    }))
    .sort((a, b) => a.departure.scheduled.localeCompare(b.departure.scheduled));

  // Count JFK → LAX
  const laxFlights = flights.filter(f => f.arrival.iata === 'LAX');

  return {
    flights,
    total_flights: flights.length,
    api_calls_used: apiCalls,
    lax_flights: laxFlights.length,
    pagination: {
      count: flights.length,
      total: data.pagination.total,
    },
    note: data.pagination.total > flights.length
      ? `More flights may exist. Try offset=${flights.length}.`
      : 'All available flights retrieved.',
  };
}

// Cloudflare Worker entrypoint
export default {
  async fetch(request, env, ctx) {
    const result = await getFlights();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
