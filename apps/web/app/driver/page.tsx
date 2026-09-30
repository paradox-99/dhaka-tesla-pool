"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTaka, statusLabel } from "@/lib/format";

type DriverRequest = {
  id: string;
  passenger: { name: string };
  pickupZone: { name: string };
  dropoffZone: { name: string };
  seats: number;
  estimatedFarePaisa: number;
  paymentMethod: string;
  createdAt: string;
};

type PoolMember = {
  id: string;
  passenger: { id: string; name: string };
  pickupZone: { name: string };
  dropoffZone: { name: string };
  seats: number;
  farePaisa: number;
  paymentMethod: string;
  status: string;
};

type DriverPool = {
  id: string;
  status: string;
  capacity: number;
  seatsOccupied: number;
  pickupZone: { name: string };
  driver: { name: string };
  vehicle: { name: string; isOnline: boolean; plateNumber: string; capacity: number };
  members: PoolMember[];
};

export default function DriverPage() {
  const router = useRouter();
  const { user, isReady, logout } = useAuth();
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!user || user.role !== "DRIVER") {
      router.replace("/login");
    }
  }, [isReady, router, user]);

  type DriverProfile = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: "DRIVER";
    walletBalancePaisa: number;
    createdAt: string;
    vehicle?: {
      id: string;
      name: string;
      plateNumber: string;
      capacity: number;
      isOnline: boolean;
    };
  };

  const { data: me, mutate: mutateMe } = useSWR<DriverProfile>(user ? "/api/auth/me" : null, async () => apiFetch<DriverProfile>("/api/auth/me"));
  const vehicle = me?.vehicle ?? user?.vehicle;
  const isOnline = Boolean(vehicle?.isOnline);

  const { data: requestsData, mutate: mutateRequests } = useSWR<{ requests: DriverRequest[] }>(user ? "/api/driver/requests" : null, () =>
    apiFetch<{ requests: DriverRequest[] }>("/api/driver/requests"),
    { refreshInterval: 5000 },
  );
  const { data: currentPool, mutate: mutatePool } = useSWR<DriverPool | null>(user ? "/api/driver/pools/current" : null, () =>
    apiFetch<DriverPool | null>("/api/driver/pools/current"),
    { refreshInterval: 5000 },
  );

  const requests = requestsData?.requests ?? [];

  const handleStatusToggle = async () => {
    if (!user) {
      return;
    }

    setStatusError(null);
    setPendingStatus(true);

    try {
      await apiFetch("/api/driver/status", {
        method: "PATCH",
        body: JSON.stringify({ isOnline: !isOnline }),
      });
      await mutateMe();
      await mutatePool();
      await mutateRequests();
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      setStatusError(apiError.message || "Unable to update driver status.");
    } finally {
      setPendingStatus(false);
    }
  };

  const acceptRequest = async (requestId: string) => {
    setActionError(null);
    setPendingAction(requestId);

    try {
      await apiFetch(`/api/driver/requests/${requestId}/accept`, { method: "POST" });
      await mutateRequests();
      await mutatePool();
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      setActionError(apiError.message || "Unable to accept this request.");
    } finally {
      setPendingAction(null);
    }
  };

  const performAction = async (action: "arrive" | "start" | "complete" | "cancel", reason?: string) => {
    if (!currentPool) {
      return;
    }

    setActionError(null);
    setPendingAction(action);

    try {
      const method = action === "cancel" ? "POST" : "POST";
      const endpoint = action === "arrive" ? "/arrive" : action === "start" ? "/start" : action === "complete" ? "/complete" : "/cancel";
      await apiFetch(`/api/driver/pools/${currentPool.id}${endpoint}`, {
        method,
        body: action === "cancel" ? JSON.stringify({ reason: reason ?? "Trip cancelled by driver" }) : undefined,
      });
      await mutatePool();
      await mutateRequests();
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      setActionError(apiError.message || "Unable to update the pool.");
    } finally {
      setPendingAction(null);
    }
  };

  if (!isReady || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading driver dashboard...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Driver dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{user.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/driver/history" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50">
              History
            </Link>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800">
              Log out
            </button>
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Vehicle status</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                {vehicle?.name ?? "Vehicle not assigned"} {vehicle?.plateNumber ? `• ${vehicle.plateNumber}` : ""}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleStatusToggle}
              disabled={pendingStatus}
              className={`rounded-xl px-4 py-2 font-medium text-white transition ${isOnline ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-900 hover:bg-slate-800"}`}
            >
              {pendingStatus ? "Updating..." : isOnline ? "Go offline" : "Go online"}
            </button>
          </div>

          {statusError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{statusError}</div> : null}
        </section>

        {currentPool ? (
          <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Current pool</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">{currentPool.pickupZone.name}</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {currentPool.status === "ACCEPTED" ? (
                  <button onClick={() => performAction("arrive")} disabled={pendingAction !== null} className="rounded-xl bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300">
                    {pendingAction === "arrive" ? "Updating..." : "Mark arrived"}
                  </button>
                ) : null}

                {currentPool.status === "DRIVER_ARRIVED" ? (
                  <button onClick={() => performAction("start")} disabled={pendingAction !== null} className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300">
                    {pendingAction === "start" ? "Starting..." : "Start trip"}
                  </button>
                ) : null}

                {currentPool.status === "STARTED" ? (
                  <button onClick={() => performAction("complete")} disabled={pendingAction !== null} className="rounded-xl bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-300">
                    {pendingAction === "complete" ? "Completing..." : "Complete trip"}
                  </button>
                ) : null}

                {currentPool.status !== "STARTED" && currentPool.status !== "COMPLETED" ? (
                  <button onClick={() => performAction("cancel")} disabled={pendingAction !== null} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                    {pendingAction === "cancel" ? "Cancelling..." : "Cancel pool"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Pool details</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{currentPool.seatsOccupied}/{currentPool.capacity} seats filled</p>
              <p className="mt-1 text-sm text-slate-600">Status: {statusLabel(currentPool.status)}</p>
            </div>

            <div className="mt-6 space-y-4">
              {currentPool.members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-slate-600">No riders in this pool yet.</div>
              ) : (
                currentPool.members.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">{member.passenger.name}</p>
                        <p className="text-sm text-slate-600">{member.pickupZone.name} → {member.dropoffZone.name}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-sm text-slate-500">Seats: {member.seats}</p>
                        <p className="text-sm text-slate-500">Fare: {formatTaka(member.farePaisa)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {actionError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</div> : null}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Ride requests</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Open requests</h2>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
              No requests match your current Tesla right now.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{request.passenger.name}</p>
                      <p className="text-sm text-slate-600">
                        {request.pickupZone.name} → {request.dropoffZone.name}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                      <span>{request.seats} seat{request.seats > 1 ? "s" : ""}</span>
                      <span>{request.paymentMethod}</span>
                      <span>{formatTaka(request.estimatedFarePaisa)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => acceptRequest(request.id)}
                      disabled={pendingAction !== null}
                      className="rounded-xl bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                    >
                      {pendingAction === request.id ? "Accepting..." : "Accept request"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
