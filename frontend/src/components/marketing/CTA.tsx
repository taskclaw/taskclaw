"use client";

import { useEffect, useRef, useState } from 'react';
import GradientText from './GradientText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const CTA = () => {
  const ctaSectionRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/waitlist/count`)
      .then((res) => res.json())
      .then((data) => setCount(data.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry && entry.isIntersecting && entry.target) {
            const elements = entry.target.querySelectorAll('.reveal');
            elements.forEach((el, i) => {
              if (el) {
                setTimeout(() => {
                  el.classList.add('active');
                }, i * 100);
              }
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    if (ctaSectionRef.current) {
      observer.observe(ctaSectionRef.current);
    }

    return () => {
      if (ctaSectionRef.current) {
        observer.unobserve(ctaSectionRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
      setCount((prev) => (prev !== null ? prev + 1 : 1));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="waitlist" className="py-20 relative" ref={ctaSectionRef}>
      <div className="section-container">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center mb-3 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs text-foreground/70 reveal">
            <span className="mr-2 size-2 rounded-full bg-claw-red"></span>
            Early Access
          </div>

          <h2 className="section-title reveal" style={{ animationDelay: '0.05s' }}>
            Be the first to stop managing and start <GradientText gradient="claw">shipping</GradientText>.
          </h2>
          <p className="section-subtitle reveal mx-auto" style={{ animationDelay: '0.1s' }}>
            We&apos;re building TaskClaw for people who are tired of task managers that just hold lists.
            If you want a tool that actually gets things done, join the waitlist.
          </p>

          <div className="mt-8 rounded-2xl border border-foreground/10 bg-foreground/[0.02] backdrop-blur-sm p-8 reveal" style={{ animationDelay: '0.15s' }}>
            {!submitted ? (
              <>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@email.com"
                    required
                    disabled={loading}
                    className="flex-1 px-4 py-3 rounded-xl bg-foreground/[0.05] border border-foreground/10 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-claw-red/50 text-sm transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-gradient-to-r from-claw-red to-claw-coral text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-claw-red/20 hover:-translate-y-0.5 transition-all whitespace-nowrap disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {loading ? 'Joining...' : 'Join Waitlist'}
                  </button>
                </form>
                {error && (
                  <p className="text-red-400 text-xs mt-2">{error}</p>
                )}
                <p className="text-foreground/40 text-xs mt-3">
                  No spam. We&apos;ll notify you when early access opens.
                </p>
              </>
            ) : (
              <div className="py-4 px-6 rounded-xl bg-green-500/10 border border-green-500/20">
                <p className="text-green-400 font-semibold">
                  You&apos;re on the list! We&apos;ll reach out soon.
                </p>
              </div>
            )}

            {count !== null && count > 0 && (
              <div className="inline-flex items-center gap-2 mt-5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                {count} {count === 1 ? 'person' : 'people'} already on the waitlist
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-claw-red/5 to-transparent -z-10"></div>
    </section>
  );
};

export default CTA;
