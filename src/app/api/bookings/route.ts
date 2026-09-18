import { NextRequest, NextResponse } from "next/server";
import {
  BookingRequestError,
  bookSelection,
  cancelBooking,
  listBookings,
  type BookingInput,
} from "@/lib/bookings";
import { isBookableSelection, isBookingMarket } from "@/lib/booking-settlement";
import {
  DEFAULT_FORECAST_PARAMS,
  getFixtureForecast,
  type ForecastParams,
} from "@/lib/match-forecast";

export const dynamic = "force-dynamic";

function numberParam(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function forecastParamsFromBody(body: Record<string, unknown>): ForecastParams {
  return {
    lookbackGameweeks: numberParam(body.lookback, DEFAULT_FORECAST_PARAMS.lookbackGameweeks),
    homeAdvantage: numberParam(body.homeAdvantage, DEFAULT_FORECAST_PARAMS.homeAdvantage),
    correlation: numberParam(body.correlation, DEFAULT_FORECAST_PARAMS.correlation),
    simulations: Math.round(numberParam(body.simulations, DEFAULT_FORECAST_PARAMS.simulations)),
    fplStrengthBlend: numberParam(body.fplBlend, DEFAULT_FORECAST_PARAMS.fplStrengthBlend),
  };
}

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
  try {
    return NextResponse.json({ bookings: await listBookings(season) });
  } catch (error) {
    return errorResponse(error, "Unable to load bookings.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<BookingInput> & {
      fixtureId?: number;
      season?: string;
      homeTeam?: string;
      awayTeam?: string;
      market?: string;
      selection?: string;
      stake?: number;
      odds?: number;
      notes?: string;
      lookback?: number;
      homeAdvantage?: number;
      correlation?: number;
      simulations?: number;
      fplBlend?: number;
    };

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

    const forecastPayload = await getFixtureForecast(body.fixtureId, forecastParamsFromBody(body));
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
  } catch (error) {
    return errorResponse(error, "Unable to book selection.");
  }
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
