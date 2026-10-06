"use client";
import Link from "next/link";
import { Button, GhostButton, Card, Badge } from "@/components/ui";

const steps = [
  { n: "01", title: "Discover", text: "Tell us where you want to go and what you love — history, food, adventure, slow mornings." },
  { n: "02", title: "Personalize", text: "AI recommends experiences matched to your budget, pace, and travel style." },
  { n: "03", title: "Plan", text: "Build a day-by-day itinerary with flights, stays, activities, and transfers." },
  { n: "04", title: "Price", text: "See a transparent cost breakdown — base, extras, discounts — before you commit." },
  { n: "05", title: "Book", text: "Confirm your trip and keep every booking in one place." },
  { n: "06", title: "Adapt", text: "Flight delayed? The engine analyzes impact and offers ranked recovery options instantly." },
];

const features = [
  { icon: "✨", title: "AI-assisted planning", text: "Recommendations, itinerary suggestions, and ranked recovery options — always validated by deterministic engines." },
  { icon: "⚡", title: "Dynamic disruption engine", text: "Delays ripple through your itinerary; the system classifies every item as broken, at-risk, or unaffected." },
  { icon: "💰", title: "Honest pricing", text: "The backend recalculates every total — frontend numbers are never authoritative." },
  { icon: "🛡️", title: "Secure by design", text: "Supabase Auth, JWT validation, RBAC, and row-level security on every table." },
  { icon: "🗺️", title: "Operator console", text: "Operators monitor tours, disruptions, vendors, and schedules from one dashboard." },
  { icon: "📱", title: "Responsive everywhere", text: "A polished experience on desktop, tablet, and mobile — with real loading and error states." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-ink-900">
          TourFlow <span className="text-brand-600">AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/operator" className="hidden text-sm font-medium text-ink-500 hover:text-ink-900 sm:block">
            Operator console
          </Link>
          <Link href="/login"><GhostButton>Log in</GhostButton></Link>
          <Link href="/register"><Button>Get started</Button></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white" />
        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 text-center sm:pt-24">
          <Badge value="HACKATHON PS ID 7" />
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-ink-900 sm:text-6xl">
            Trips that plan themselves — and <span className="text-brand-600">adapt</span> when plans break
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-500">
            TourFlow AI is a personalized, dynamic tour planning and operations platform.
            Discover, personalize, price, book — then let the disruption engine handle the chaos.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register"><Button className="px-7 py-3 text-base">Start planning free</Button></Link>
            <Link href="/login"><GhostButton className="px-7 py-3 text-base">Log in</GhostButton></Link>
          </div>
          <p className="mt-4 text-sm text-ink-500">
            Run a tour business? <Link href="/operator" className="font-semibold text-brand-600 hover:underline">Open the operator console</Link>
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight text-ink-900">How it works</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-ink-500">One journey, from inspiration to home again.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="relative">
              <span className="text-4xl font-extrabold text-brand-100">{s.n}</span>
              <h3 className="mt-2 text-lg font-bold text-ink-900">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{s.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Disruption demo strip */}
      <section className="bg-ink-900 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white">Built for the worst day of your trip</h2>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl bg-white/5 p-6 font-mono text-sm leading-7 text-slate-200">
            <p>✈️ Flight delayed by 3 hours</p>
            <p className="text-slate-400">↓ impact analysis</p>
            <p>🔴 Airport transfer → <span className="text-red-300">BROKEN</span> &nbsp; 🟡 Hotel check-in → <span className="text-amber-300">AT RISK</span> &nbsp; 🟢 Dinner → <span className="text-emerald-300">UNAFFECTED</span></p>
            <p className="text-slate-400">↓ AI ranks feasible recovery options</p>
            <p>✅ Move transfer later <span className="text-slate-400">(+₹800 · minor impact)</span></p>
            <p>✅ Replace with express cab <span className="text-slate-400">(+₹1,500 · no impact)</span></p>
            <p className="text-slate-400">↓ one tap → itinerary rebuilt, audit logged</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight text-ink-900">Everything a real tour platform needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-3 text-lg font-bold text-ink-900">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="rounded-3xl bg-gradient-to-r from-brand-600 to-brand-900 px-8 py-14 text-center">
          <h2 className="text-3xl font-bold text-white">Your next trip starts here</h2>
          <p className="mx-auto mt-2 max-w-md text-brand-100">Create an account, plan a trip in minutes, and travel with a safety net.</p>
          <div className="mt-6 flex justify-center gap-4">
            <Link href="/register">
              <button className="rounded-xl bg-white px-7 py-3 text-base font-semibold text-brand-700 shadow hover:bg-brand-50">Create account</button>
            </Link>
            <Link href="/login">
              <button className="rounded-xl border border-white/40 px-7 py-3 text-base font-semibold text-white hover:bg-white/10">Log in</button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-ink-500">
        TourFlow AI — personalized dynamic tour planning &amp; tour operations platform.
      </footer>
    </div>
  );
}
