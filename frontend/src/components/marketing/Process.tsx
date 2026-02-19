"use client";

import { useEffect, useRef } from 'react';
import GlassCard from './GlassCard';
import GradientText from './GradientText';

const steps = [
  {
    number: '01',
    title: 'Connect your tools',
    description: 'Link Notion, ClickUp, or any supported source. Set up categories and sync filters. Your tasks flow in automatically.',
  },
  {
    number: '02',
    title: 'Configure AI skills & knowledge',
    description: 'Assign pre-saved skills and knowledge databases per category or per task. Your AI knows exactly how to handle each type of work.',
  },
  {
    number: '03',
    title: 'Drag, click, done.',
    description: 'Move a task to the AI column or hit "Run AI Assistant". Your OpenClaw picks it up, executes with the right context, and delivers. You just review.',
  },
];

const Process = () => {
  const processSectionRef = useRef<HTMLDivElement>(null);

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

    if (processSectionRef.current) {
      observer.observe(processSectionRef.current);
    }

    return () => {
      if (processSectionRef.current) {
        observer.unobserve(processSectionRef.current);
      }
    };
  }, []);

  return (
    <section id="how" className="py-20 relative" ref={processSectionRef}>
      <div className="section-container">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center mb-3 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs text-foreground/70">
            <span className="mr-2 size-2 rounded-full bg-claw-coral"></span>
            How It Works
          </div>
          <h2 className="section-title reveal">
            From scattered to shipped, in <GradientText gradient="claw">three steps</GradientText>.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <GlassCard
              key={index}
              className="h-full reveal relative"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div className="font-mono text-5xl font-bold mb-4 bg-gradient-to-r from-claw-red to-claw-coral bg-clip-text text-transparent opacity-50">
                {step.number}
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{step.title}</h3>
              <p className="text-foreground/70 text-sm leading-relaxed">{step.description}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Process;
