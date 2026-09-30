"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTaka } from "@/lib/format";

type DriverHistoryPool = {
  id: string;
  status: string;
  pickupZone: { name: string };
  members: {
    passenger: { name: string };
    farePaisa: number;
    seats: number;
    dropoffZone: { name: string };
  }[];
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export default function DriverHistoryPage() {
  const router = useRouter();
  const { user, isReady, logout } = useAuth();

  const { data, error, isLoading } = useSWR<{ pools: DriverHistoryPool[] }>(user ? "/api/driver/pools" : null, () =>
    apiFetch<{ pools: DriverHistoryPool[] }>("/api/driver/pools"),
  );

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading driver history...</div>;
  }

  if (!user || user.role !== "DRIVER") {
    router.replace("/login");
    return null;
  }

  const pools = data?.pools ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Driver history</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Your completed runs</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/driver" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50">
              Back to dashboard
            </Link>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800">
              Log out
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading pool history...</div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">Unable to load driver history right now.</div>
        ) : pools.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
            Your Tesla hasn’t completed a trip yet.
          </div>
        ) : (
          <div className="space-y-4">
            {pools.map((pool) => (
              <article key={pool.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{pool.status}</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">{pool.pickupZone.name}</h2>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    {pool.members.length} rider{pool.members.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {pool.members.map((member) => (
                    <div key={`${pool.id}-${member.passenger.name}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{member.passenger.name}</p>
                          <p className="text-sm text-slate-600">{member.dropoffZone.name}</p>
                        </div>
                        <div className="text-sm text-slate-600">
                          {member.seats} seat{member.seats > 1 ? "s" : ""} • {formatTaka(member.farePaisa)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
