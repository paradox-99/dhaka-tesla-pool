"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTaka } from "@/lib/format";

type RideRecord = {
  id: string;
  status: string;
  pickupZone: { name: string };
  dropoffZone: { name: string };
  seats: number;
  finalFarePaisa: number | null;
  estimatedFarePaisa: number;
  createdAt: string;
};

export default function PassengerHistoryPage() {
  const router = useRouter();
  const { user, isReady, logout } = useAuth();

  const { data, error, isLoading } = useSWR<{ rides: RideRecord[] }>(user ? "/api/rides?page=1&limit=10" : null, () =>
    apiFetch<{ rides: RideRecord[]; pagination: { total: number } }>("/api/rides?page=1&limit=10"),
  );

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading your ride history...</div>;
  }

  if (!user || user.role !== "PASSENGER") {
    router.replace("/login");
    return null;
  }

  const rides = data?.rides ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Ride history</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Your trips</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/passenger" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50">
              Back to dashboard
            </Link>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800">
              Log out
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading rides...</div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">Unable to load ride history right now.</div>
        ) : rides.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
            No rides yet. Your first Bullet ride awaits.
          </div>
        ) : (
          <div className="space-y-4">
            {rides.map((ride) => (
              <article key={ride.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{ride.status}</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">
                      {ride.pickupZone.name} → {ride.dropoffZone.name}
                    </h2>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    {ride.seats} seat{ride.seats > 1 ? "s" : ""}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Requested</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {new Date(ride.createdAt).toLocaleDateString()} 
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Fare</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">{formatTaka(ride.finalFarePaisa ?? ride.estimatedFarePaisa)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Payment</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">Cash</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
