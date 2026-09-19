import { NextRequest, NextResponse } from "next/server";
import {
  BookingRequestError,
  bookSelection,
  bookSelections,
  cancelBooking,
  listBookings,
  resolveOpenBookings,
  type BookingInput,
} from "@/lib/bookings";
import { getGameweekSlate } from "@/lib/gameweek-slate";
import { isBookableSelection, isBookingMarket } from "@/lib/booking-settlement";
import { getFixtureForecast, getForecastData } from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BookingRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const season = request.nextUrl.searchParams.get("season") ?? undefined;
  const gameweekParam = request.nextUrl.searchParams.get("gameweek");
  const gameweek = gameweekParam ? Number(gameweekParam) : NaN;

  try {
    if (season && Number.isInteger(gameweek) && gameweek > 0) {
      const bookings = await listBookings(season);
      const slate = await getGameweekSlate(season, gameweek, bookings);
      return NextResponse.json({ bookings, ...slate });
    }
    const settle = request.nextUrl.searchParams.get("settle") === "1";
    return NextResponse.json({ bookings: await listBookings(season, { settle }) });
  } catch (error) {
    return errorResponse(error, "Unable to load bookings.");
  }
}

type BookingRequestBody = Partial<BookingInput> & {
  fixtureId?: number;
  season?: string;
  homeTeam?: string;
  awayTeam?: string;
  market?: string;
  selection?: string;
  stake?: number;
  odds?: number;
  notes?: string;
  bookings?: Array<{
    fixtureId?: number;
    market?: string;
    selection?: string;
    stake?: number;
    odds?: number;
    notes?: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as BookingRequestBody;
    if (Array.isArray(body.bookings)) {
      return bookGameweek(body);
    }
    return bookOne(body);
  } catch (error) {
    return errorResponse(error, "Unable to book selection.");
  }
}

async function bookGameweek(body: BookingRequestBody) {
  const items = body.bookings ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Choose at least one match to book." }, { status: 400 });
  }

  const forecastData = await getForecastData();
  if (!forecastData.season) {
    return NextResponse.json({ error: "No forecast is available." }, { status: 404 });
  }

  const forecastById = new Map(forecastData.upcomingFixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const inputs: BookingInput[] = [];
  const missing: number[] = [];

  for (const item of items) {
    if (
      !item.fixtureId ||
      !item.market ||
      !item.selection ||
      !Number.isFinite(item.stake) ||
      !Number.isFinite(item.odds)
    ) {
      return NextResponse.json({ error: "Missing required booking fields." }, { status: 400 });
    }
    if (!isBookingMarket(item.market) || !isBookableSelection(item.market, item.selection)) {
      return NextResponse.json({ error: "That market or selection cannot be booked." }, { status: 400 });
    }

    const forecast = forecastById.get(item.fixtureId);
    if (!forecast) {
      missing.push(item.fixtureId);
      continue;
    }

    inputs.push({
      fixtureId: item.fixtureId,
      season: forecastData.season,
      homeTeam: forecast.homeTeam,
      awayTeam: forecast.awayTeam,
      market: item.market,
      selection: item.selection,
      stake: item.stake!,
      odds: item.odds!,
      notes: item.notes,
      forecast,
    });
  }

  if (inputs.length === 0) {
    return NextResponse.json({ error: "None of those fixtures are in the current forecast.", missing }, { status: 404 });
  }

  const bookings = await bookSelections(inputs);
  return NextResponse.json({ bookings, missing });
}

async function bookOne(body: BookingRequestBody) {
  if (
    !body.fixtureId ||
    !body.season ||
    !body.homeTeam ||
    !body.awayTeam ||
    !body.market ||
    !body.selection ||
    !Number.isFinite(body.stake) ||
    !Number.isFinite(body.odds)
  ) {
    return NextResponse.json({ error: "Missing required booking fields." }, { status: 400 });
  }

  if (!isBookingMarket(body.market) || !isBookableSelection(body.market, body.selection)) {
    return NextResponse.json({ error: "That market or selection cannot be booked." }, { status: 400 });
  }

  const forecastPayload = await getFixtureForecast(body.fixtureId);
  const forecast = forecastPayload.forecast;
  if (!forecast) {
    return NextResponse.json({ error: "Fixture forecast not found." }, { status: 404 });
  }

  const booking = await bookSelection({
    fixtureId: body.fixtureId,
    season: body.season,
    homeTeam: body.homeTeam,
    awayTeam: body.awayTeam,
    market: body.market,
    selection: body.selection,
    stake: body.stake!,
    odds: body.odds!,
    notes: body.notes,
    forecast,
  });

  return NextResponse.json({ booking });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Booking id is required." }, { status: 400 });
  }

  try {
    await cancelBooking(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Unable to cancel booking.");
  }
}

export async function PATCH() {
  try {
    const result = await resolveOpenBookings();
    return NextResponse.json({
      ...result,
      bookings: await listBookings(undefined, { settle: false }),
    });
  } catch (error) {
    return errorResponse(error, "Unable to resolve open bookings.");
  }
}
