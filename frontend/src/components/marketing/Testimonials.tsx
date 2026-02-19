"use client";

import { useEffect, useRef } from 'react';
import GradientText from './GradientText';

const Testimonials = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elements = entry.target.querySelectorAll('.reveal');
            elements.forEach((el, i) => {
              setTimeout(() => {
                el.classList.add('active');
              }, i * 100);
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section id="solution" className="relative py-20" ref={sectionRef}>
      <div className="section-container">
        <div className="text-center mb-12 reveal">
          <div className="inline-flex items-center justify-center mb-3 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs text-foreground/70">
            <span className="mr-2 size-2 rounded-full bg-brand-purple"></span>
            The Solution
          </div>
          <h2 className="section-title">
            One board. All your tasks. <GradientText>AI starts them.</GradientText>
          </h2>
          <p className="section-subtitle mx-auto reveal" style={{ animationDelay: '0.1s' }}>
            TaskClaw syncs tasks from all your tools into a single Kanban board.
            Drag a task to &quot;Start with AI&quot; or click Run AI Assistant, and your connected
            OpenClaw picks it up — with the right skills and knowledge already loaded.
          </p>
        </div>

        {/* Kanban Demo */}
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] backdrop-blur-sm overflow-hidden reveal" style={{ animationDelay: '0.2s' }}>
          {/* Kanban Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/10 bg-foreground/[0.03]">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-brand-purple"></div>
              <span className="font-semibold text-sm text-foreground">My Tasks</span>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-claw-red/15 text-claw-coral font-bold">
              LIVE SYNC
            </span>
          </div>

          {/* Kanban Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 min-h-[320px]">
            {/* TO-DO Column */}
            <KanbanColumn label="TO-DO" count={3}>
              <KanbanCard
                title="Draft blog post about AI agents"
                source="Notion"
                priorityColor="text-orange-500"
              />
              <KanbanCard
                title="Review Q3 campaign metrics"
                source="ClickUp"
                priorityColor="text-blue-500"
              />
              <KanbanCard
                title="Schedule dentist appointment"
                source="Notion"
                priorityColor="text-green-500"
              />
            </KanbanColumn>

            {/* AI RUNNING Column */}
            <KanbanColumn label="AI RUNNING" count={2} variant="ai">
              <KanbanCard
                title="Research competitor pricing"
                source="skill: market-research"
                priorityColor="text-orange-500"
                aiLive
              />
              <KanbanCard
                title="Generate social media copy"
                source="skill: copywriter"
                priorityColor="text-orange-500"
                aiLive
              />
            </KanbanColumn>

            {/* IN REVIEW Column */}
            <KanbanColumn label="IN REVIEW" count={1}>
              <KanbanCard
                title="SEO audit for landing page"
                source="AI completed · awaiting review"
                priorityColor="text-purple-500"
              />
            </KanbanColumn>

            {/* DONE Column */}
            <KanbanColumn label="DONE" count={2} variant="done">
              <KanbanCard
                title="Summarize meeting notes"
                source="2m 14s"
                priorityColor="text-green-500"
              />
              <KanbanCard
                title="Fix README typos"
                source="47s"
                priorityColor="text-green-500"
              />
            </KanbanColumn>
          </div>
        </div>
      </div>
    </section>
  );
};

function KanbanColumn({
  label,
  count,
  variant,
  children,
}: {
  label: string;
  count: number;
  variant?: 'ai' | 'done';
  children: React.ReactNode;
}) {
  const colBg = variant === 'ai' ? 'bg-gradient-to-b from-claw-red/[0.04] to-transparent' : '';
  const labelColor = variant === 'ai' ? 'text-claw-red' : variant === 'done' ? 'text-green-400' : 'text-foreground/50';

  return (
    <div className={`p-4 border-r border-foreground/10 last:border-r-0 border-b sm:border-b-0 lg:border-b-0 ${colBg}`}>
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-foreground/10">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>
          {variant === 'ai' && '⚡ '}{label}
        </span>
        <span className="font-mono text-[11px] text-foreground/40 bg-foreground/[0.05] px-1.5 py-0.5 rounded">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KanbanCard({
  title,
  source,
  priorityColor,
  aiLive,
}: {
  title: string;
  source: string;
  priorityColor: string;
  aiLive?: boolean;
}) {
  return (
    <div
      className={`relative p-3 rounded-lg border text-sm font-medium transition-all ${
        aiLive
          ? 'border-claw-red/25 bg-foreground/[0.03] shadow-[0_0_15px_-3px_rgba(230,59,59,0.1)]'
          : 'border-foreground/10 bg-foreground/[0.02]'
      }`}
    >
      {aiLive && (
        <span className="absolute top-2 right-2 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-claw-red/15 text-claw-coral animate-pulse">
          LIVE
        </span>
      )}
      <span className="text-foreground/90 text-[13px]">{title}</span>
      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-foreground/40">
        <span className={`w-1.5 h-1.5 rounded-full ${priorityColor} bg-current`}></span>
        <span>{source}</span>
      </div>
    </div>
  );
}

export default Testimonials;
