"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTaka, statusLabel } from "@/lib/format";

type Zone = {
  id: string;
  name: string;
  x: number;
  y: number;
};

type ZonesResponse = {
  zones: Zone[];
};

type FareEstimate = {
  distanceKm: number;
  soloFarePaisa: number;
  pooledFarePaisa: number;
};

type ActiveRide = {
  id: string;
  status: string;
  pickupZone: Zone;
  dropoffZone: Zone;
  seats: number;
  paymentMethod: string;
  estimatedFarePaisa: number;
  finalFarePaisa: number | null;
  pool: {
    status: string;
    driver: { name: string };
    vehicle: { name: string };
    coRiderCount: number;
    myFarePaisa: number;
  } | null;
};

export default function PassengerPage() {
  const router = useRouter();
  const { user, isReady, logout } = useAuth();
  const [form, setForm] = useState({ pickupZoneId: "", dropoffZoneId: "", seats: 1, paymentMethod: "CASH" });
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!user || user.role !== "PASSENGER") {
      router.replace("/login");
    }
  }, [isReady, router, user]);

  const { data: zonesResponse } = useSWR<ZonesResponse>("/api/zones", async () => apiFetch<ZonesResponse>("/api/zones"));
  const zones = zonesResponse?.zones ?? [];
  const { data: activeRide, mutate: mutateActive, error: activeRideError } = useSWR<ActiveRide | null>(
    user ? "/api/rides/active" : null,
    async () => apiFetch<ActiveRide | null>("/api/rides/active"),
    { refreshInterval: 3000 },
  );

  const refreshEstimate = async (nextForm: typeof form) => {
    if (!nextForm.pickupZoneId || !nextForm.dropoffZoneId || Number(nextForm.seats) < 1) {
      setEstimate(null);
      return;
    }

    try {
      const nextEstimate = await apiFetch<FareEstimate>(
        `/api/fares/estimate?pickupZoneId=${nextForm.pickupZoneId}&dropoffZoneId=${nextForm.dropoffZoneId}&seats=${nextForm.seats}`,
      );
      setEstimate(nextEstimate);
    } catch {
      setEstimate(null);
    }
  };

  const updateForm = (nextForm: typeof form) => {
    setForm(nextForm);
    void refreshEstimate(nextForm);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await apiFetch("/api/rides", {
        method: "POST",
        body: JSON.stringify({
          pickupZoneId: form.pickupZoneId,
          dropoffZoneId: form.dropoffZoneId,
          seats: Number(form.seats),
          paymentMethod: form.paymentMethod,
        }),
      });

      await mutateActive();
      setForm({ pickupZoneId: "", dropoffZoneId: "", seats: 1, paymentMethod: "CASH" });
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      setError(apiError.message || "Unable to create ride request.");
    } finally {
      setPending(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRide) {
      return;
    }

    setCanceling(true);
    try {
      await apiFetch(`/api/rides/${activeRide.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Changed my plan" }),
      });
      await mutateActive();
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      setError(apiError.message || "Unable to cancel the ride.");
    } finally {
      setCanceling(false);
    }
  };

  if (!isReady || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading passenger dashboard...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Passenger dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Hello, {user.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/passenger/history" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50">
              Ride history
            </Link>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800">
              Log out
            </button>
          </div>
        </header>

        {activeRideError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{activeRideError.message || "Unable to load your active ride."}</div>
        ) : null}

        {activeRide ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Active ride</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{activeRide.status}</h2>
              </div>

              {activeRide.status === "REQUESTED" || activeRide.status === "MATCHED" ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {canceling ? "Cancelling..." : "Cancel ride"}
                </button>
              ) : null}
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Pickup</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{activeRide.pickupZone.name}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Dropoff</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{activeRide.dropoffZone.name}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Seats</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{activeRide.seats}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Journey fare</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatTaka(activeRide.finalFarePaisa ?? activeRide.estimatedFarePaisa)}</p>
              </div>
            </div>

            {activeRide.pool ? (
              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Pool status</p>
                <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Driver: {activeRide.pool.driver.name}</p>
                    <p className="text-sm text-slate-600">Vehicle: {activeRide.pool.vehicle.name}</p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-sky-700">
                    {statusLabel(activeRide.pool.status)}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  Shared with {activeRide.pool.coRiderCount} other passenger{activeRide.pool.coRiderCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm text-slate-700">Your fare: {formatTaka(activeRide.pool.myFarePaisa)}</p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                Your request is waiting for a compatible Tesla pool.
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Create a ride</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Request a Tesla pool</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="pickupZoneId">
                    Pickup zone
                  </label>
                  <select
                    id="pickupZoneId"
                    value={form.pickupZoneId}
                    onChange={(event) => updateForm({ ...form, pickupZoneId: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    required
                  >
                    <option value="">Select pickup zone</option>
                    {zones?.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="dropoffZoneId">
                    Dropoff zone
                  </label>
                  <select
                    id="dropoffZoneId"
                    value={form.dropoffZoneId}
                    onChange={(event) => updateForm({ ...form, dropoffZoneId: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    required
                  >
                    <option value="">Select dropoff zone</option>
                    {zones?.map((zone) => (
                      <option key={`${zone.id}-drop`} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="seats">
                    Seats
                  </label>
                  <input
                    id="seats"
                    type="number"
                    min={1}
                    max={4}
                    value={form.seats}
                    onChange={(event) => updateForm({ ...form, seats: Number(event.target.value) || 1 })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="paymentMethod">
                    Payment method
                  </label>
                  <select
                    id="paymentMethod"
                    value={form.paymentMethod}
                    onChange={(event) => updateForm({ ...form, paymentMethod: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                  >
                    <option value="CASH">Cash</option>
                    <option value="TESLAPAY">TeslaPay</option>
                  </select>
                </div>
              </div>

              {estimate ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Estimated fare</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-sm text-slate-500">Solo</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{formatTaka(estimate.soloFarePaisa)}</p>
                    </div>
                    <div className="rounded-xl bg-white p-4">
                      <p className="text-sm text-slate-500">Shared</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{formatTaka(estimate.pooledFarePaisa)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

              <button
                type="submit"
                disabled={pending || !form.pickupZoneId || !form.dropoffZoneId}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {pending ? "Requesting ride..." : "Request a ride"}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
