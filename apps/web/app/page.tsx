"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (!isReady || !user) {
      return;
    }

    router.replace(user.role === "PASSENGER" ? "/passenger" : "/driver");
  }, [isReady, router, user]);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading...</div>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
          Dhaka Tesla Pool
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Ride together across Dhaka.</h1>
        <p className="mt-4 text-lg text-slate-600">
          Request a ride, share the Tesla when it fits, and keep your trip updates live as the pool evolves.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Create account
          </Link>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-500">Passengers</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">Book a smart pool</p>
          </div>
          <div className="rounded-2xl bg-sky-50 p-4">
            <p className="text-sm font-medium text-sky-700">Drivers</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">Accept and run the route</p>
          </div>
        </div>
      </div>
    </main>
  );
}
